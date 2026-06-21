import { useCallback, useEffect, useRef, useState } from "react";
import { useSignalStore } from "@/store/useSignalStore";
import {
  applyReceiverCodecPreferences,
  createPeerConnection,
  pcStateLabel,
  iceStateLabel,
  readLinkStats,
  type LinkStats,
} from "@/lib/webrtc";
import type { AnnotationAction } from "@/lib/annotations";

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

/**
 * B端 (receiver) WebRTC lifecycle: create the RTCPeerConnection lazily when
 * the offer arrives, set the remote description, answer, and bind the
 * inbound track to a <video> element via ontrack.
 */
export function useReceiverConnection() {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [pcState, setPcState] = useState<RTCPeerConnectionState>("new");
  const [iceState, setIceState] = useState<RTCIceConnectionState>("new");
  const [stats, setStats] = useState<LinkStats>(EMPTY_STATS);
  const [error, setError] = useState<string | null>(null);
  const [dataChannelReady, setDataChannelReady] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const statsTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevBytes = useRef(0);
  const prevTs = useRef(0);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const pcStateRef = useRef<RTCPeerConnectionState>("new");
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const onAnnotationRef = useRef<((action: AnnotationAction) => void) | null>(null);

  const sendAnswer = useSignalStore((s) => s.sendAnswer);
  const sendCandidate = useSignalStore((s) => s.sendCandidate);
  const setHandlers = useSignalStore((s) => s.setHandlers);
  const clearHandlers = useSignalStore((s) => s.clearHandlers);

  const stopStats = useCallback(() => {
    if (statsTimer.current) {
      clearInterval(statsTimer.current);
      statsTimer.current = null;
    }
  }, []);

  const teardown = useCallback(() => {
    stopStats();
    const dc = dataChannelRef.current;
    if (dc) {
      try {
        dc.close();
      } catch {
        /* noop */
      }
      dataChannelRef.current = null;
    }
    const pc = pcRef.current;
    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.ondatachannel = null;
      pc.close();
      pcRef.current = null;
    }
    setRemoteStream(null);
    setPcState("new");
    setIceState("new");
    setStats(EMPTY_STATS);
    setDataChannelReady(false);
    pendingCandidates.current = [];
    prevBytes.current = 0;
    prevTs.current = 0;
  }, [stopStats]);

  const ensurePc = useCallback(() => {
    if (pcRef.current) return pcRef.current;
    const pc = createPeerConnection();
    pcRef.current = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) sendCandidate(e.candidate.toJSON());
    };
    pc.onconnectionstatechange = () => {
      pcStateRef.current = pc.connectionState;
      setPcState(pc.connectionState);
    };
    pc.oniceconnectionstatechange = () => setIceState(pc.iceConnectionState);

    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      setRemoteStream(stream);
    };

    pc.ondatachannel = (e) => {
      const dc = e.channel;
      if (dc.label !== "annotation") return;
      dataChannelRef.current = dc;

      dc.onopen = () => {
        setDataChannelReady(true);
      };
      dc.onclose = () => {
        setDataChannelReady(false);
      };
      dc.onmessage = (ev) => {
        try {
          const action = JSON.parse(ev.data) as AnnotationAction;
          onAnnotationRef.current?.(action);
        } catch {
          /* ignore malformed messages */
        }
      };
    };

    return pc;
  }, [sendCandidate]);

  // Register signaling handlers: offer → answer, candidate relay.
  useEffect(() => {
    setHandlers({
      onOffer: async (sdp) => {
        try {
          const pc = ensurePc();
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          applyReceiverCodecPreferences(pc);
          // flush candidates that arrived before the remote description
          for (const c of pendingCandidates.current) {
            await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          }
          pendingCandidates.current = [];
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendAnswer(answer);
        } catch (err) {
          setError(`处理 Offer 失败: ${(err as Error).message}`);
        }
      },
      onCandidate: async (candidate) => {
        const pc = pcRef.current;
        if (!pc || !pc.remoteDescription) {
          pendingCandidates.current.push(candidate);
          return;
        }
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          setError(`添加 ICE 候选失败: ${(err as Error).message}`);
        }
      },
      onPeerLeft: () => {
        teardown();
      },
    });

    stopStats();
    statsTimer.current = setInterval(async () => {
      if (!pcRef.current || pcStateRef.current !== "connected") return;
      const { stats: next, bytes, ts } = await readLinkStats(
        pcRef.current,
        "receiver",
        prevBytes.current,
        prevTs.current,
      );
      prevBytes.current = bytes;
      prevTs.current = ts;
      setStats(next);
    }, 1000);

    return () => {
      clearHandlers();
      teardown();
    };
  }, [setHandlers, clearHandlers, ensurePc, sendAnswer, stopStats, teardown]);

  const sendAnnotationAction = useCallback((action: AnnotationAction) => {
    const dc = dataChannelRef.current;
    if (dc && dc.readyState === "open") {
      try {
        dc.send(JSON.stringify(action));
      } catch {
        /* ignore send errors */
      }
    }
  }, []);

  const setAnnotationHandler = useCallback(
    (handler: ((action: AnnotationAction) => void) | null) => {
      onAnnotationRef.current = handler;
    },
    [],
  );

  return {
    remoteStream,
    pcState,
    pcLabel: pcStateLabel(pcState),
    iceLabel: iceStateLabel(iceState),
    stats,
    error,
    dataChannelReady,
    sendAnnotationAction,
    setAnnotationHandler,
  };
}
