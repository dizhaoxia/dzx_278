/**
 * WebRTC helpers — codec preference, stats parsing, connection state labels,
 * adaptive bitrate control.
 * Pure functions shared by the Sender and Receiver work benches.
 */

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
]

/** Preferred video codec names — VP8 first (royalty-free, well supported), H.264 fallback. */
const PREFERRED_CODEC_NAMES = ["VP8", "H264"]

export interface QualityPreset {
  label: string
  width: number
  height: number
  maxFps: number
  maxBitrateKbps: number
}

export const QUALITY_PRESETS: QualityPreset[] = [
  { label: "LOW", width: 640, height: 360, maxFps: 15, maxBitrateKbps: 400 },
  { label: "MEDIUM", width: 960, height: 540, maxFps: 24, maxBitrateKbps: 1200 },
  { label: "HIGH", width: 1280, height: 720, maxFps: 30, maxBitrateKbps: 2500 },
  { label: "FULL", width: 1920, height: 1080, maxFps: 30, maxBitrateKbps: 5000 },
]

function getVideoCodecs() {
  if (typeof RTCRtpReceiver === "undefined") return [] as { mimeType: string }[]
  const caps = RTCRtpReceiver.getCapabilities?.("video")
  return (caps?.codecs ?? []) as { mimeType: string }[]
}

/** Preferred video codecs re-ordered with VP8 first (best-effort). */
export function getPreferredCodecs() {
  const caps = getVideoCodecs()
  if (!caps.length) return [] as { mimeType: string }[]
  const preferred = PREFERRED_CODEC_NAMES.map((name) =>
    caps.find(
      (c) => c.mimeType.toLowerCase() === `video/${name.toLowerCase()}`,
    ),
  ).filter((c): c is { mimeType: string } => Boolean(c))
  return preferred.length ? preferred : caps
}

/** Apply codec preference to an outbound video sender. */
export function applyCodecPreference(sender: RTCRtpSender): void {
  try {
    const params = sender.getParameters()
    const preferred = getPreferredCodecs().map((c) => c.mimeType)
    if (!preferred.length) return
    params.codecs.sort((a, b) => {
      const ai = preferred.indexOf(a.mimeType)
      const bi = preferred.indexOf(b.mimeType)
      if (ai === -1 && bi === -1) return 0
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
    void sender.setParameters(params)
  } catch {
    /* setParameters may reject before negotiation — safe to ignore */
  }
}

/** Apply codec preference to the receiver's transceivers (call before createAnswer). */
export function applyReceiverCodecPreferences(pc: RTCPeerConnection): void {
  const preferred = getPreferredCodecs()
  if (!preferred.length) return
  for (const t of pc.getTransceivers()) {
    try {
      t.setCodecPreferences(preferred as RTCRtpCodec[])
    } catch {
      /* receiver codec preference may be unsupported — ignore */
    }
  }
}

export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS })
}

/**
 * Estimate bandwidth quality from the latest stats.
 * Returns a quality level index (0..QUALITY_PRESETS.length - 1).
 * Heuristic:
 *  - Heavy packet loss (> 5%) → drop
 *  - High jitter (> 80ms) → drop
 *  - Bitrate well below preset → drop
 *  - Stable high bitrate with low loss → upgrade
 */
export function estimateQualityIndex(
  stats: LinkStats,
  currentIndex: number,
): number {
  const lossPct = stats.fps > 0 ? (stats.packetsLost / Math.max(1, stats.packetsLost + 100)) * 100 : 0
  const desired = QUALITY_PRESETS[currentIndex]
  const bitrateOk = stats.bitrateKbps >= desired.maxBitrateKbps * 0.7
  const stable = lossPct < 3 && stats.jitterMs < 60 && stats.fps >= desired.maxFps * 0.7
  const degraded = lossPct > 5 || stats.jitterMs > 80 || stats.bitrateKbps < desired.maxBitrateKbps * 0.3

  if (degraded && currentIndex > 0) return currentIndex - 1
  if (stable && bitrateOk && currentIndex < QUALITY_PRESETS.length - 1) return currentIndex + 1
  return currentIndex
}

/**
 * Apply a quality preset to an outbound video sender via RTCRtpSender.setParameters
 * (encodings maxBitrate + scaleResolutionDownBy) plus MediaStreamTrack constraints
 * when available.
 */
export async function applyQualityPreset(
  sender: RTCRtpSender,
  preset: QualityPreset,
): Promise<void> {
  try {
    const params = sender.getParameters()
    if (params.encodings && params.encodings.length > 0) {
      params.encodings[0].maxBitrate = preset.maxBitrateKbps * 1000
      params.encodings[0].maxFramerate = preset.maxFps
    }
    await sender.setParameters(params)
  } catch {
    /* best effort — ignore */
  }
  try {
    const track = sender.track
    if (track && "applyConstraints" in track) {
      await (track as MediaStreamTrack).applyConstraints({
        width: { ideal: preset.width },
        height: { ideal: preset.height },
        frameRate: { ideal: preset.maxFps },
      } as MediaTrackConstraints)
    }
  } catch {
    /* best effort — ignore */
  }
}

export interface LinkStats {
  bitrateKbps: number
  width: number
  height: number
  fps: number
  codec: string
  packetsLost: number
  jitterMs: number
  candidateType: string
}

const EMPTY_STATS: LinkStats = {
  bitrateKbps: 0,
  width: 0,
  height: 0,
  fps: 0,
  codec: "—",
  packetsLost: 0,
  jitterMs: 0,
  candidateType: "—",
}

/**
 * Read outbound/inbound RTP stats from a peer connection.
 * `direction` selects which leg to report on (sender=outbound, receiver=inbound).
 */
export async function readLinkStats(
  pc: RTCPeerConnection,
  direction: "sender" | "receiver",
  prevBytes: number,
  prevTs: number,
): Promise<{ stats: LinkStats; bytes: number; ts: number }> {
  const report = await pc.getStats()
  let bytes = prevBytes
  let ts = prevTs
  let candidateType = "—"
  let codec = "—"

  interface StatsEntry {
    type: string;
    mimeType?: string;
    localCandidateId?: string;
    candidateType?: string;
    nominated?: boolean;
    bytesSent?: number;
    bytesReceived?: number;
    frameWidth?: number;
    frameHeight?: number;
    framesPerSecond?: number;
    packetsLost?: number;
    jitter?: number;
  }
  for (const r of report.values() as IterableIterator<StatsEntry>) {
    if (r.type === "candidate-pair" && r.nominated) {
      const local = r.localCandidateId ? report.get(r.localCandidateId) : undefined
      if (local) candidateType = (local as StatsEntry).candidateType ?? "—"
    }
    if (r.type === "codec") {
      codec = (r.mimeType ?? "").replace("video/", "") || codec
    }
    const isOutbound = direction === "sender" && r.type === "outbound-rtp"
    const isInbound = direction === "receiver" && r.type === "inbound-rtp"
    if (isOutbound || isInbound) {
      const curBytes =
        direction === "sender" ? (r.bytesSent ?? 0) : (r.bytesReceived ?? 0)
      ts = Date.now()
      const dt = (ts - prevTs) / 1000
      const delta = Math.max(0, curBytes - prevBytes)
      const bitrateKbps = dt > 0 ? Math.round((delta * 8) / 1000 / dt) : 0
      bytes = curBytes
      return {
        stats: {
          bitrateKbps,
          width: r.frameWidth ?? 0,
          height: r.frameHeight ?? 0,
          fps: Math.round(r.framesPerSecond ?? 0),
          codec,
          packetsLost: r.packetsLost ?? 0,
          jitterMs: Math.round((r.jitter ?? 0) * 1000),
          candidateType,
        },
        bytes,
        ts,
      }
    }
  }
  return { stats: EMPTY_STATS, bytes, ts }
}

export function pcStateLabel(state: RTCPeerConnectionState): string {
  switch (state) {
    case "new":
      return "NEW"
    case "connecting":
      return "NEGOTIATING"
    case "connected":
      return "LINKED"
    case "disconnected":
      return "DEGRADED"
    case "failed":
      return "FAILED"
    case "closed":
      return "CLOSED"
    default:
      return String(state).toUpperCase()
  }
}

export function iceStateLabel(state: RTCIceConnectionState): string {
  return String(state).toUpperCase()
}

export function wsStateLabel(state: number): string {
  switch (state) {
    case 0:
      return "CONNECTING"
    case 1:
      return "OPEN"
    case 2:
      return "CLOSING"
    case 3:
      return "CLOSED"
    default:
      return "—"
  }
}
