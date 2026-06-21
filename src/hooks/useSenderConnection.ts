import { useCallback, useEffect, useRef, useState } from "react";
import { useSignalStore } from "@/store/useSignalStore";
import {
  applyCodecPreference,
  createPeerConnection,
  readLinkStats,
  type LinkStats,
  QUALITY_PRESETS,
  estimateQualityIndex,
  applyQualityPreset,
  type QualityPreset,
} from "@/lib/webrtc";
import type { AnnotationAction, TimedAnnotationAction } from "@/lib/annotations";
import { stampAction } from "@/lib/annotations";

const EMPTY_STATS: LinkStats = {
  bitrateKbps: 0,
  width: 0,
  height: 0,
  fps: 0,
  codec: "—",
  packetsLost: 0,
  jitterMs: 0,
  candidateType: "—",
};

interface PeerContext {
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  negotiating: boolean;
  stats: LinkStats;
  prevBytes: number;
  prevTs: number;
}

function aggregateStats(contexts: Map<string, PeerContext>): LinkStats {
  let totalKbps = 0;
  let maxW = 0;
  let maxH = 0;
  let maxFps = 0;
  let codec = "—";
  let totalLoss = 0;
  let maxJitter = 0;
  let candidate = "—";
  let count = 0;
  for (const ctx of contexts.values()) {
    totalKbps += ctx.stats.bitrateKbps;
    maxW = Math.max(maxW, ctx.stats.width);
    maxH = Math.max(maxH, ctx.stats.height);
    maxFps = Math.max(maxFps, ctx.stats.fps);
    if (codec === "—" && ctx.stats.codec !== "—") codec = ctx.stats.codec;
    totalLoss += ctx.stats.packetsLost;
    maxJitter = Math.max(maxJitter, ctx.stats.jitterMs);
    if (candidate === "—" && ctx.stats.candidateType !== "—")
      candidate = ctx.stats.candidateType;
    count++;
  }
  if (count === 0) return EMPTY_STATS;
  return {
    bitrateKbps: totalKbps,
    width: maxW,
    height: maxH,
    fps: maxFps,
    codec,
    packetsLost: totalLoss,
    jitterMs: maxJitter,
    candidateType: candidate,
  };
}

/**
 * A端 (sender) WebRTC lifecycle: capture the screen with getDisplayMedia,
 * maintain one RTCPeerConnection per joined receiver, broadcast annotations
 * via per-peer RTCDataChannel, and adapt bitrate/resolution dynamically.
 */
export function useSenderConnection() {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [aggregatedStats, setAggregatedStats] = useState<LinkStats>(EMPTY_STATS);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anyDataChannelReady, setAnyDataChannelReady] = useState(false);
  const [qualityIndex, setQualityIndex] = useState(2);
  const [autoQuality, setAutoQuality] = useState(true);
  const [historyStartTime, setHistoryStartTime] = useState<number>(0);
  const [history, setHistory] = useState<TimedAnnotationAction[]>([]);
  const [peerCount, setPeerCount] = useState(0);

  const peersRef = useRef<Map<string, PeerContext>>(new Map());
  const streamRef = useRef<MediaStream | null>(null);
  const statsTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const qualityTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const onAnnotationRef = useRef<((action: AnnotationAction) => void) | null>(null);
  const videoTrackSenderRef = useRef<RTCRtpSender | null>(null);

  const sendOffer = useSignalStore((s) => s.sendOffer);
  const sendCandidate = useSignalStore((s) => s.sendCandidate);
  const setHandlers = useSignalStore((s) => s.setHandlers);
  const clearHandlers = useSignalStore((s) => s.clearHandlers);
  const peers = useSignalStore((s) => s.peers);

  const currentPreset: QualityPreset = QUALITY_PRESETS[qualityIndex];

  const stopStats = useCallback(() => {
    if (statsTimer.current) {
      clearInterval(statsTimer.current);
      statsTimer.current = null;
    }
    if (qualityTimer.current) {
      clearInterval(qualityTimer.current);
      qualityTimer.current = null;
    }
  }, []);

  const broadcastAnnotation = useCallback((action: AnnotationAction) => {
    for (const ctx of peersRef.current.values()) {
      const dc = ctx.dc;
      if (dc && dc.readyState === "open") {
        try {
          dc.send(JSON.stringify(action));
        } catch {
          /* ignore */
        }
      }
    }
  }, []);

  const teardownPeer = useCallback((peerId: string) => {
    const ctx = peersRef.current.get(peerId);
    if (!ctx) return;
    try {
      ctx.dc?.close();
    } catch {
      /* noop */
    }
    try {
      ctx.pc.onicecandidate = null;
      ctx.pc.onconnectionstatechange = null;
      ctx.pc.oniceconnectionstatechange = null;
      ctx.pc.ondatachannel = null;
      ctx.pc.close();
    } catch {
      /* noop */
    }
    peersRef.current.delete(peerId);
    let anyReady = false;
    for (const c of peersRef.current.values()) {
      if (c.dc && c.dc.readyState === "open") anyReady = true;
    }
    setAnyDataChannelReady(anyReady);
    setPeerCount(peersRef.current.size);
    setAggregatedStats(aggregateStats(peersRef.current));
  }, []);

  const teardown = useCallback(() => {
    stopStats();
    for (const peerId of Array.from(peersRef.current.keys())) {
      teardownPeer(peerId);
    }
    videoTrackSenderRef.current = null;
    setAggregatedStats(EMPTY_STATS);
    setAnyDataChannelReady(false);
  }, [stopStats, teardownPeer]);

  const startNegotiationWith = useCallback(
    async (peerId: string) => {
      const stream = streamRef.current;
      if (!stream) return;
      const existing = peersRef.current.get(peerId);
      if (existing && existing.negotiating) return;

      const pc = createPeerConnection();
      const dc = pc.createDataChannel("annotation", { ordered: true });

      const ctx: PeerContext = {
        pc,
        dc,
        negotiating: true,
        stats: EMPTY_STATS,
        prevBytes: 0,
        prevTs: 0,
      };
      peersRef.current.set(peerId, ctx);
      setPeerCount(peersRef.current.size);

      dc.onopen = () => {
        let anyReady = false;
        for (const c of peersRef.current.values()) {
          if (c.dc && c.dc.readyState === "open") anyReady = true;
        }
        setAnyDataChannelReady(anyReady);
      };
      dc.onclose = () => {
        let anyReady = false;
        for (const c of peersRef.current.values()) {
          if (c.dc && c.dc.readyState === "open") anyReady = true;
        }
        setAnyDataChannelReady(anyReady);
      };
      dc.onmessage = (e) => {
        try {
          const action = JSON.parse(e.data) as AnnotationAction;
          onAnnotationRef.current?.(action);
          broadcastAnnotation(action);
          if (historyStartTime > 0) {
            setHistory((prev) => [...prev, stampAction(action, historyStartTime)]);
          }
        } catch {
          /* ignore malformed messages */
        }
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) sendCandidate(e.candidate.toJSON(), peerId);
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          teardownPeer(peerId);
        }
      };
      pc.oniceconnectionstatechange = () => {
        /* tracked via stats */
      };

      for (const track of stream.getTracks()) {
        const sender = pc.addTrack(track, stream);
        applyCodecPreference(sender);
        if (track.kind === "video") {
          videoTrackSenderRef.current = sender;
          void applyQualityPreset(sender, QUALITY_PRESETS[qualityIndex]);
        }
      }

      try {
        const offer = await pc.createOffer({ offerToReceiveVideo: false });
        await pc.setLocalDescription(offer);
        sendOffer(offer, peerId);
        ctx.negotiating = false;
      } catch (err) {
        setError(`创建 Offer 失败: ${(err as Error).message}`);
        ctx.negotiating = false;
      }
    },
    [
      sendCandidate,
      sendOffer,
      qualityIndex,
      teardownPeer,
      broadcastAnnotation,
      historyStartTime,
    ],
  );

  useEffect(() => {
    for (const peerId of peers) {
      if (!peersRef.current.has(peerId) && streamRef.current) {
        void startNegotiationWith(peerId);
      }
    }
  }, [peers, startNegotiationWith]);

  useEffect(() => {
    setHandlers({
      onAnswer: async (sdp, from) => {
        const ctx = peersRef.current.get(from);
        const pc = ctx?.pc;
        if (!pc || pc.signalingState === "stable") return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        } catch (err) {
          setError(`设置 Answer 失败: ${(err as Error).message}`);
        }
      },
      onCandidate: async (candidate, from) => {
        const ctx = peersRef.current.get(from);
        const pc = ctx?.pc;
        if (!pc) return;
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          setError(`添加 ICE 候选失败: ${(err as Error).message}`);
        }
      },
      onPeerLeft: (peerId) => {
        teardownPeer(peerId);
      },
    });
    return () => {
      clearHandlers();
      teardown();
    };
  }, [setHandlers, clearHandlers, teardown, teardownPeer]);

  useEffect(() => {
    stopStats();
    if (peersRef.current.size === 0) return;

    statsTimer.current = setInterval(async () => {
      for (const [, ctx] of peersRef.current.entries()) {
        const { stats: next, bytes, ts } = await readLinkStats(
          ctx.pc,
          "sender",
          ctx.prevBytes,
          ctx.prevTs,
        );
        ctx.stats = next;
        ctx.prevBytes = bytes;
        ctx.prevTs = ts;
      }
      setAggregatedStats(aggregateStats(peersRef.current));
    }, 1000);

    qualityTimer.current = setInterval(() => {
      if (!autoQuality) return;
      const agg = aggregateStats(peersRef.current);
      if (agg.bitrateKbps === 0 || agg.fps === 0) return;
      setQualityIndex((prev) => {
        const next = estimateQualityIndex(agg, prev);
        if (next !== prev && videoTrackSenderRef.current) {
          void applyQualityPreset(videoTrackSenderRef.current, QUALITY_PRESETS[next]);
        }
        return next;
      });
    }, 5000);

    return () => stopStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerCount, autoQuality]);

  const captureScreen = useCallback(async () => {
    setError(null);
    setCapturing(true);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 60 } },
        audio: false,
      });
      streamRef.current = stream;
      setLocalStream(stream);
      setHistoryStartTime(Date.now());
      setHistory([]);
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        void stopSharing();
      });
      for (const peerId of peers) {
        void startNegotiationWith(peerId);
      }
    } catch (err) {
      setError(`屏幕捕获失败: ${(err as Error).message}`);
    } finally {
      setCapturing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peers, startNegotiationWith]);

  const stopSharing = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLocalStream(null);
    teardown();
  }, [teardown]);

  const sendAnnotationAction = useCallback(
    (action: AnnotationAction) => {
      broadcastAnnotation(action);
      if (historyStartTime > 0) {
        setHistory((prev) => [...prev, stampAction(action, historyStartTime)]);
      }
    },
    [broadcastAnnotation, historyStartTime],
  );

  const setAnnotationHandler = useCallback(
    (handler: ((action: AnnotationAction) => void) | null) => {
      onAnnotationRef.current = handler;
    },
    [],
  );

  const setQuality = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(QUALITY_PRESETS.length - 1, index));
      setQualityIndex(clamped);
      setAutoQuality(false);
      if (videoTrackSenderRef.current) {
        void applyQualityPreset(videoTrackSenderRef.current, QUALITY_PRESETS[clamped]);
      }
    },
    [],
  );

  const pcLabelComputed = (() => {
    if (peersRef.current.size === 0) return "IDLE";
    let anyLinked = false;
    for (const ctx of peersRef.current.values()) {
      if (ctx.pc.connectionState === "connected") anyLinked = true;
    }
    return anyLinked ? "LINKED" : "NEGOTIATING";
  })();

  const iceLabelComputed = (() => {
    if (peersRef.current.size === 0) return "—";
    const states = new Set<string>();
    for (const ctx of peersRef.current.values()) {
      states.add(ctx.pc.iceConnectionState);
    }
    return Array.from(states).join("/").toUpperCase();
  })();

  return {
    localStream,
    pcLabel: pcLabelComputed,
    iceLabel: iceLabelComputed,
    stats: aggregatedStats,
    capturing,
    error,
    dataChannelReady: anyDataChannelReady,
    peerCount,
    history,
    historyStartTime,
    qualityIndex,
    currentPreset,
    autoQuality,
    captureScreen,
    stopSharing,
    sendAnnotationAction,
    setAnnotationHandler,
    setQuality,
    setAutoQuality,
  };
}
