/**
 * WebRTC signaling server — room management + SDP/ICE relay over WebSocket.
 *
 * The server never touches media: it only maintains room membership and
 * forwards offer/answer/candidate messages between peers. Once the SDP + ICE
 * exchange completes, the browser pair has a direct P2P link.
 *
 * Features:
 *  - 1 sender (A端) + N receivers (B端) per room, dynamically joinable.
 *  - Annotation permission mode: host-only (default) or free, with per-client
 *    authorization list maintained by the host (sender).
 */
import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'
import { randomUUID } from 'crypto'
import type {
  SignalMessage,
  AnnotationMode,
  RoomMember,
} from '@shared/signal'

interface ClientInfo {
  id: string
  ws: WebSocket
  roomId: string | null
  role: 'sender' | 'receiver' | null
}

interface RoomState {
  id: string
  members: Map<string, ClientInfo>
  senderId: string | null
  annotationMode: AnnotationMode
  authorizedAnnotators: Set<string>
}

const clients = new Map<string, ClientInfo>()
const rooms = new Map<string, RoomState>()

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateRoomId(): string {
  for (let attempt = 0; attempt < 16; attempt++) {
    let id = ''
    for (let i = 0; i < 6; i++) {
      id += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]
    }
    if (!rooms.has(id)) return id
  }
  return Date.now().toString(36).toUpperCase().slice(-6)
}

function send(ws: WebSocket, msg: SignalMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

function getRoomMembers(room: RoomState): RoomMember[] {
  return Array.from(room.members.values()).map((c) => ({
    clientId: c.id,
    role: c.role ?? 'receiver',
  }))
}

function broadcastRoomState(roomId: string): void {
  const room = rooms.get(roomId)
  if (!room) return
  const payload = {
    roomId,
    members: getRoomMembers(room),
    annotationMode: room.annotationMode,
    authorizedAnnotators: Array.from(room.authorizedAnnotators),
    senderId: room.senderId,
  }
  for (const client of room.members.values()) {
    send(client.ws, {
      type: 'state',
      room: roomId,
      payload: payload as unknown as Record<string, unknown>,
    })
  }
}

function forwardToOthers(sender: ClientInfo, msg: SignalMessage): void {
  if (!sender.roomId) return
  const room = rooms.get(sender.roomId)
  if (!room) return
  for (const client of room.members.values()) {
    if (client.id === sender.id) continue
    send(client.ws, { ...msg, from: sender.id })
  }
}

function forwardToPeer(sender: ClientInfo, msg: SignalMessage, targetId: string): void {
  if (!sender.roomId) return
  const room = rooms.get(sender.roomId)
  if (!room) return
  const target = room.members.get(targetId)
  if (target) {
    send(target.ws, { ...msg, from: sender.id })
  }
}

function removeClient(client: ClientInfo): void {
  clients.delete(client.id)
  const roomId = client.roomId
  client.roomId = null
  client.role = null
  if (!roomId) return
  const room = rooms.get(roomId)
  if (!room) return
  room.members.delete(client.id)
  room.authorizedAnnotators.delete(client.id)
  if (room.senderId === client.id) {
    room.senderId = null
  }
  for (const other of room.members.values()) {
    send(other.ws, {
      type: 'peer-left',
      room: roomId,
      payload: { peerId: client.id } as unknown as Record<string, unknown>,
    })
  }
  if (room.members.size === 0) {
    rooms.delete(roomId)
  } else {
    broadcastRoomState(roomId)
  }
}

function isSender(client: ClientInfo): boolean {
  if (!client.roomId) return false
  const room = rooms.get(client.roomId)
  return !!room && room.senderId === client.id
}

function handleMessage(client: ClientInfo, msg: SignalMessage): void {
  switch (msg.type) {
    case 'create-room': {
      const roomId = generateRoomId()
      const room: RoomState = {
        id: roomId,
        members: new Map(),
        senderId: client.id,
        annotationMode: 'host',
        authorizedAnnotators: new Set([client.id]),
      }
      room.members.set(client.id, client)
      rooms.set(roomId, room)
      client.roomId = roomId
      client.role = 'sender'
      send(client.ws, {
        type: 'room-created',
        room: roomId,
        payload: { roomId, clientId: client.id } as unknown as Record<string, unknown>,
      })
      broadcastRoomState(roomId)
      break
    }
    case 'join-room': {
      const raw = (msg.payload?.roomId as string | undefined) ?? msg.room
      const roomId = (raw ?? '').toUpperCase().trim()
      const room = roomId ? rooms.get(roomId) : undefined
      if (!room) {
        return send(client.ws, {
          type: 'error',
          payload: { message: `房间不存在: ${roomId || '—'}` } as unknown as Record<string, unknown>,
        })
      }
      room.members.set(client.id, client)
      client.roomId = roomId
      client.role = 'receiver'
      const peers = Array.from(room.members.values())
        .filter((c) => c.id !== client.id)
        .map((c) => c.id)
      send(client.ws, {
        type: 'joined',
        room: roomId,
        payload: {
          roomId,
          clientId: client.id,
          peers,
        } as unknown as Record<string, unknown>,
      })
      for (const other of room.members.values()) {
        if (other.id === client.id) continue
        send(other.ws, {
          type: 'peer-joined',
          room: roomId,
          from: client.id,
          payload: {
            peerId: client.id,
            role: 'receiver',
          } as unknown as Record<string, unknown>,
        })
      }
      broadcastRoomState(roomId)
      break
    }
    case 'offer':
    case 'answer':
    case 'candidate': {
      if (!client.roomId) {
        return send(client.ws, {
          type: 'error',
          payload: { message: '尚未加入房间' } as unknown as Record<string, unknown>,
        })
      }
      if (msg.to) {
        forwardToPeer(client, msg, msg.to)
      } else {
        forwardToOthers(client, msg)
      }
      break
    }
    case 'set-annotation-mode': {
      if (!client.roomId || !isSender(client)) {
        return send(client.ws, {
          type: 'error',
          payload: { message: '只有主持人可修改标注模式' } as unknown as Record<string, unknown>,
        })
      }
      const room = rooms.get(client.roomId)!
      const mode = (msg.payload?.mode as AnnotationMode) ?? 'host'
      room.annotationMode = mode
      if (mode === 'free') {
        for (const m of room.members.values()) {
          room.authorizedAnnotators.add(m.id)
        }
      } else {
        room.authorizedAnnotators.clear()
        if (room.senderId) room.authorizedAnnotators.add(room.senderId)
      }
      for (const other of room.members.values()) {
        send(other.ws, {
          type: 'annotation-mode-changed',
          room: room.id,
          payload: { mode } as unknown as Record<string, unknown>,
        })
      }
      broadcastRoomState(room.id)
      break
    }
    case 'authorize-annotator': {
      if (!client.roomId || !isSender(client)) {
        return send(client.ws, {
          type: 'error',
          payload: { message: '只有主持人可授权标注' } as unknown as Record<string, unknown>,
        })
      }
      const room = rooms.get(client.roomId)!
      const targetId = msg.payload?.clientId as string
      if (!targetId || !room.members.has(targetId)) {
        return send(client.ws, {
          type: 'error',
          payload: { message: '授权目标不存在' } as unknown as Record<string, unknown>,
        })
      }
      room.authorizedAnnotators.add(targetId)
      for (const other of room.members.values()) {
        send(other.ws, {
          type: 'annotators-changed',
          room: room.id,
          payload: {
            authorizedAnnotators: Array.from(room.authorizedAnnotators),
          } as unknown as Record<string, unknown>,
        })
      }
      broadcastRoomState(room.id)
      break
    }
    case 'revoke-annotator': {
      if (!client.roomId || !isSender(client)) {
        return send(client.ws, {
          type: 'error',
          payload: { message: '只有主持人可撤销标注权限' } as unknown as Record<string, unknown>,
        })
      }
      const room = rooms.get(client.roomId)!
      const targetId = msg.payload?.clientId as string
      if (!targetId || targetId === room.senderId) {
        return send(client.ws, {
          type: 'error',
          payload: { message: '无法撤销主持人的标注权限' } as unknown as Record<string, unknown>,
        })
      }
      room.authorizedAnnotators.delete(targetId)
      for (const other of room.members.values()) {
        send(other.ws, {
          type: 'annotators-changed',
          room: room.id,
          payload: {
            authorizedAnnotators: Array.from(room.authorizedAnnotators),
          } as unknown as Record<string, unknown>,
        })
      }
      broadcastRoomState(room.id)
      break
    }
    case 'leave': {
      removeClient(client)
      break
    }
    default:
      send(client.ws, {
        type: 'error',
        payload: { message: `未知消息类型: ${msg.type}` } as unknown as Record<string, unknown>,
      })
  }
}

export function setupSignaling(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/signal' })

  wss.on('connection', (ws) => {
    const client: ClientInfo = { id: randomUUID(), ws, roomId: null, role: null }
    clients.set(client.id, client)
    send(ws, {
      type: 'connected',
      payload: { clientId: client.id } as unknown as Record<string, unknown>,
    })

    ws.on('message', (raw) => {
      let msg: SignalMessage
      try {
        msg = JSON.parse(raw.toString()) as SignalMessage
      } catch {
        return send(ws, {
          type: 'error',
          payload: { message: '无效的 JSON 消息' } as unknown as Record<string, unknown>,
        })
      }
      handleMessage(client, msg)
    })

    ws.on('close', () => removeClient(client))
    ws.on('error', () => removeClient(client))
  })

  return wss
}
