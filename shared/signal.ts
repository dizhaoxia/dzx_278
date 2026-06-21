/**
 * Shared signaling types — pure type definitions shared between the
 * React frontend (src) and the Node signaling server (api).
 *
 * These are type-only declarations, so `import type` usage is erased at
 * compile time and never needs runtime resolution on either side.
 */

export type Role = "sender" | "receiver";

export type WsStatus = "idle" | "connecting" | "open" | "closed";

export type AnnotationMode = "host" | "free";

export type SignalMessageType =
  | "connected"
  | "create-room"
  | "room-created"
  | "join-room"
  | "joined"
  | "peer-joined"
  | "peer-left"
  | "offer"
  | "answer"
  | "candidate"
  | "leave"
  | "error"
  | "state"
  | "set-annotation-mode"
  | "annotation-mode-changed"
  | "authorize-annotator"
  | "revoke-annotator"
  | "annotators-changed";

export interface SignalMessage {
  type: SignalMessageType;
  payload?: Record<string, unknown>;
  room?: string;
  from?: string;
  to?: string;
}

export interface RoomCreatedPayload {
  roomId: string;
  clientId: string;
}

export interface JoinedPayload {
  roomId: string;
  clientId: string;
  peers?: string[];
}

export interface PeerPayload {
  peerId: string;
  role?: Role;
}

export interface ErrorPayload {
  message: string;
}

export interface SdpPayload {
  sdp: RTCSessionDescriptionInit;
}

export interface CandidatePayload {
  candidate: RTCIceCandidateInit;
}

export interface RoomMember {
  clientId: string;
  role: Role;
  displayName?: string;
}

export interface RoomStatePayload {
  roomId: string;
  members: RoomMember[];
  annotationMode: AnnotationMode;
  authorizedAnnotators: string[];
  senderId: string | null;
}

export interface AnnotationModePayload {
  mode: AnnotationMode;
}

export interface AnnotatorPayload {
  clientId: string;
}

export interface AnnotatorsChangedPayload {
  authorizedAnnotators: string[];
}
