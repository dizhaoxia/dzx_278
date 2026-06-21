/**
 * WebRTC signaling server — room management + SDP/ICE relay over WebSocket.
 *
 * The server never touches media: it only maintains room membership and
 * forwards offer/answer/candidate messages between the two peers. Once the
 * SDP + ICE exchange completes, the browser pair has a direct P2P link.
 */
import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'
import { randomUUID } from 'crypto'
import type { SignalMessage } from '@shared/signal'

interface ClientInfo {
  id: string
  ws: WebSocket
  roomId: string | null
  role: 'sender' | 'receiver' | null
}

const clients = new Map<string, ClientInfo>()
const rooms = new Map<string, Map<string, ClientInfo>>()

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const MAX_ROOM_MEMBERS = 2

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

function broadcastRoomState(roomId: string): void {
  const room = rooms.get(roomId)
  if (!room) return
  const members = Array.from(room.values()).map((c) => ({
    clientId: c.id,
    role: c.role,
  }))
  for (const client of room.values()) {
    send(client.ws, {
      type: 'state',
      room: roomId,
      payload: { roomId, members },
    })
  }
}

function forwardToOthers(sender: ClientInfo, msg: SignalMessage): void {
  if (!sender.roomId) return
  const room = rooms.get(sender.roomId)
  if (!room) return
  for (const client of room.values()) {
    if (client.id === sender.id) continue
    send(client.ws, { ...msg, from: sender.id })
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
  room.delete(client.id)
  for (const other of room.values()) {
    send(other.ws, {
      type: 'peer-left',
      room: roomId,
      payload: { peerId: client.id },
    })
  }
  if (room.size === 0) {
    rooms.delete(roomId)
  } else {
    broadcastRoomState(roomId)
  }
}

function handleMessage(client: ClientInfo, msg: SignalMessage): void {
  switch (msg.type) {
    case 'create-room': {
      const roomId = generateRoomId()
      const room = new Map<string, ClientInfo>()
      room.set(client.id, client)
      rooms.set(roomId, room)
      client.roomId = roomId
      client.role = 'sender'
      send(client.ws, {
        type: 'room-created',
        room: roomId,
        payload: { roomId, clientId: client.id },
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
          payload: { message: `房间不存在: ${roomId || '—'}` },
        })
      }
      if (room.size >= MAX_ROOM_MEMBERS) {
        return send(client.ws, {
          type: 'error',
          payload: { message: '房间已满 (A↔B 一对一)' },
        })
      }
      room.set(client.id, client)
      client.roomId = roomId
      client.role = 'receiver'
      const peers = Array.from(room.values())
        .filter((c) => c.id !== client.id)
        .map((c) => c.id)
      send(client.ws, {
        type: 'joined',
        room: roomId,
        payload: { roomId, clientId: client.id, peers },
      })
      for (const other of room.values()) {
        if (other.id === client.id) continue
        send(other.ws, {
          type: 'peer-joined',
          room: roomId,
          from: client.id,
          payload: { peerId: client.id, role: 'receiver' },
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
          payload: { message: '尚未加入房间' },
        })
      }
      forwardToOthers(client, msg)
      break
    }
    case 'leave': {
      removeClient(client)
      break
    }
    default:
      send(client.ws, {
        type: 'error',
        payload: { message: `未知消息类型: ${msg.type}` },
      })
  }
}

export function setupSignaling(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/signal' })

  wss.on('connection', (ws) => {
    const client: ClientInfo = { id: randomUUID(), ws, roomId: null, role: null }
    clients.set(client.id, client)
    send(ws, { type: 'connected', payload: { clientId: client.id } })

    ws.on('message', (raw) => {
      let msg: SignalMessage
      try {
        msg = JSON.parse(raw.toString()) as SignalMessage
      } catch {
        return send(ws, {
          type: 'error',
          payload: { message: '无效的 JSON 消息' },
        })
      }
      handleMessage(client, msg)
    })

    ws.on('close', () => removeClient(client))
    ws.on('error', () => removeClient(client))
  })

  return wss
}
