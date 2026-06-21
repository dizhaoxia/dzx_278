/**
 * Signaling store — owns the WebSocket connection to the Node signaling
 * server (:30003/signal) and exposes room/connection state plus the actions
 * the Sender/Receiver pages need (create/join/leave, send SDP & ICE).
 *
 * WebRTC-specific callbacks (offer/answer/candidate/peer events) are stored as
 * plain fields so each page can plug in its own RTCPeerConnection wiring.
 */
import { create } from "zustand";
import type {
  SignalMessage,
  SdpPayload,
  CandidatePayload,
  PeerPayload,
  ErrorPayload,
} from "@shared/signal";

const SIGNALING_URL = (() => {
  if (typeof window === "undefined") return "";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  // Frontend is served on :50003; the signaling server lives on :30003.
  return `${proto}//${window.location.hostname}:30003/signal`;
})();

type WsStatus = "idle" | "connecting" | "open" | "closed";

export type OfferHandler = (sdp: RTCSessionDescriptionInit, from: string) => void;
export type AnswerHandler = (sdp: RTCSessionDescriptionInit, from: string) => void;
export type CandidateHandler = (
  candidate: RTCIceCandidateInit,
  from: string,
) => void;
export type PeerHandler = (peerId: string) => void;

interface SignalState {
  wsStatus: WsStatus;
  clientId: string | null;
  roomId: string | null;
  role: "sender" | "receiver" | null;
  peers: string[];
  error: string | null;

  // pluggable WebRTC handlers
  onOffer: OfferHandler | null;
  onAnswer: AnswerHandler | null;
  onCandidate: CandidateHandler | null;
  onPeerJoined: PeerHandler | null;
  onPeerLeft: PeerHandler | null;

  connect: () => void;
  disconnect: () => void;
  setHandlers: (h: {
    onOffer?: OfferHandler;
    onAnswer?: AnswerHandler;
    onCandidate?: CandidateHandler;
    onPeerJoined?: PeerHandler;
    onPeerLeft?: PeerHandler;
  }) => void;
  clearHandlers: () => void;
  createRoom: () => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: () => void;
  sendOffer: (sdp: RTCSessionDescriptionInit) => void;
  sendAnswer: (sdp: RTCSessionDescriptionInit) => void;
  sendCandidate: (candidate: RTCIceCandidateInit) => void;
  clearError: () => void;
}

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function sendMsg(msg: SignalMessage): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export const useSignalStore = create<SignalState>((set, get) => ({
  wsStatus: "idle",
  clientId: null,
  roomId: null,
  role: null,
  peers: [],
  error: null,

  onOffer: null,
  onAnswer: null,
  onCandidate: null,
  onPeerJoined: null,
  onPeerLeft: null,

  connect: () => {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    if (!SIGNALING_URL) return;
    set({ wsStatus: "connecting", error: null });
    ws = new WebSocket(SIGNALING_URL);

    ws.onopen = () => set({ wsStatus: "open" });

    ws.onclose = () => {
      set({
        wsStatus: "closed",
        roomId: null,
        role: null,
        peers: [],
        clientId: null,
      });
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => get().connect(), 2500);
    };

    ws.onerror = () => {
      set({ error: "信令连接异常" });
    };

    ws.onmessage = (ev) => {
      let msg: SignalMessage;
      try {
        msg = JSON.parse(ev.data) as SignalMessage;
      } catch {
        return;
      }
      handleIncoming(msg);
    };
  },

  disconnect: () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }
    set({ wsStatus: "closed", roomId: null, role: null, peers: [], clientId: null });
  },

  setHandlers: (h) =>
    set((state) => ({
      onOffer: h.onOffer ?? state.onOffer,
      onAnswer: h.onAnswer ?? state.onAnswer,
      onCandidate: h.onCandidate ?? state.onCandidate,
      onPeerJoined: h.onPeerJoined ?? state.onPeerJoined,
      onPeerLeft: h.onPeerLeft ?? state.onPeerLeft,
    })),

  clearHandlers: () =>
    set({
      onOffer: null,
      onAnswer: null,
      onCandidate: null,
      onPeerJoined: null,
      onPeerLeft: null,
    }),

  createRoom: () => sendMsg({ type: "create-room" }),

  joinRoom: (roomId) =>
    sendMsg({
      type: "join-room",
      payload: { roomId: roomId.toUpperCase().trim() },
    }),

  leaveRoom: () => {
    sendMsg({ type: "leave" });
    set({ roomId: null, role: null, peers: [] });
  },

  sendOffer: (sdp) =>
    sendMsg({ type: "offer", payload: { sdp } as unknown as Record<string, unknown> }),

  sendAnswer: (sdp) =>
    sendMsg({ type: "answer", payload: { sdp } as unknown as Record<string, unknown> }),

  sendCandidate: (candidate) =>
    sendMsg({
      type: "candidate",
      payload: { candidate } as unknown as Record<string, unknown>,
    }),

  clearError: () => set({ error: null }),
}));

function handleIncoming(msg: SignalMessage): void {
  const store = useSignalStore;
  switch (msg.type) {
    case "connected": {
      const clientId = (msg.payload?.clientId as string) ?? null;
      store.setState({ clientId });
      break;
    }
    case "room-created": {
      const { roomId, clientId } = (msg.payload ?? {}) as unknown as {
        roomId: string;
        clientId: string;
      };
      store.setState({ roomId, clientId, role: "sender", peers: [] });
      break;
    }
    case "joined": {
      const { roomId, clientId, peers } = (msg.payload ?? {}) as unknown as {
        roomId: string;
        clientId: string;
        peers?: string[];
      };
      store.setState({ roomId, clientId, role: "receiver", peers: peers ?? [] });
      break;
    }
    case "peer-joined": {
      const peerId =
        (msg.payload as unknown as PeerPayload)?.peerId ?? msg.from ?? "";
      store.setState((state) => ({
        peers: state.peers.includes(peerId)
          ? state.peers
          : [...state.peers, peerId],
      }));
      store.getState().onPeerJoined?.(peerId);
      break;
    }
    case "peer-left": {
      const peerId =
        (msg.payload as unknown as PeerPayload)?.peerId ?? msg.from ?? "";
      store.setState((state) => ({
        peers: state.peers.filter((p) => p !== peerId),
      }));
      store.getState().onPeerLeft?.(peerId);
      break;
    }
    case "offer": {
      const { sdp } = (msg.payload ?? {}) as unknown as SdpPayload;
      const from = msg.from ?? "";
      if (sdp) store.getState().onOffer?.(sdp, from);
      break;
    }
    case "answer": {
      const { sdp } = (msg.payload ?? {}) as unknown as SdpPayload;
      const from = msg.from ?? "";
      if (sdp) store.getState().onAnswer?.(sdp, from);
      break;
    }
    case "candidate": {
      const { candidate } = (msg.payload ?? {}) as unknown as CandidatePayload;
      const from = msg.from ?? "";
      if (candidate) store.getState().onCandidate?.(candidate, from);
      break;
    }
    case "state": {
      const members =
        (msg.payload?.members as { clientId: string }[] | undefined) ?? [];
      const peers = members.map((m) => m.clientId);
      store.setState((state) => ({
        peers: peers.filter((p) => p !== state.clientId),
      }));
      break;
    }
    case "error": {
      const message =
        (msg.payload as unknown as ErrorPayload)?.message ?? "未知错误";
      store.setState({ error: message });
      break;
    }
    default:
      break;
  }
}
