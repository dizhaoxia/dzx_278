import { useCallback, useEffect, useRef, useState } from "react";
import { useSignalStore } from "@/store/useSignalStore";
import {
  applyCodecPreference,
  createPeerConnection,
  pcStateLabel,
  iceStateLabel,
  readLinkStats,
  type LinkStats,
} from "@/lib/webrtc";

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
 * A端 (sender) WebRTC lifecycle: capture the screen with getDisplayMedia,
 * and once a B端 peer has joined, build the RTCPeerConnection, add the
 * video track, create the SDP offer and exchange ICE candidates.
 */
export function useSenderConnection() {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [pcState, setPcState] = useState<RTCPeerConnectionState>("new");
  const [iceState, setIceState] = useState<RTCIceConnectionState>("new");
  const [stats, setStats] = useState<LinkStats>(EMPTY_STATS);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const negotiatingRef = useRef(false);
  const statsTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevBytes = useRef(0);
  const prevTs = useRef(0);

  const sendOffer = useSignalStore((s) => s.sendOffer);
  const sendCandidate = useSignalStore((s) => s.sendCandidate);
  const setHandlers = useSignalStore((s) => s.setHandlers);
  const clearHandlers = useSignalStore((s) => s.clearHandlers);
  const peers = useSignalStore((s) => s.peers);

  const stopStats = useCallback(() => {
    if (statsTimer.current) {
      clearInterval(statsTimer.current);
      statsTimer.current = null;
    }
  }, []);

  const teardown = useCallback(() => {
    stopStats();
    const pc = pcRef.current;
    if (pc) {
      try {
        pc.getSenders().forEach((s) => s.track?.stop());
      } catch {
        /* noop */
      }
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.close();
      pcRef.current = null;
    }
    negotiatingRef.current = false;
    setPcState("new");
    setIceState("new");
    setStats(EMPTY_STATS);
    prevBytes.current = 0;
    prevTs.current = 0;
  }, [stopStats]);

  const startNegotiation = useCallback(async () => {
    if (negotiatingRef.current) return;
    const stream = streamRef.current;
    if (!stream) return;
    negotiatingRef.current = true;

    const pc = createPeerConnection();
    pcRef.current = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) sendCandidate(e.candidate.toJSON());
    };
    pc.onconnectionstatechange = () => setPcState(pc.connectionState);
    pc.oniceconnectionstatechange = () => setIceState(pc.iceConnectionState);

    stream.getTracks().forEach((track) => {
      const sender = pc.addTrack(track, stream);
      applyCodecPreference(sender);
    });

    try {
      const offer = await pc.createOffer({ offerToReceiveVideo: false });
      await pc.setLocalDescription(offer);
      sendOffer(offer);
    } catch (err) {
      setError(`创建 Offer 失败: ${(err as Error).message}`);
      negotiatingRef.current = false;
    }

    stopStats();
    statsTimer.current = setInterval(async () => {
      if (!pcRef.current) return;
      const { stats: next, bytes, ts } = await readLinkStats(
        pcRef.current,
        "sender",
        prevBytes.current,
        prevTs.current,
      );
      prevBytes.current = bytes;
      prevTs.current = ts;
      setStats(next);
    }, 1000);
  }, [sendCandidate, sendOffer, stopStats]);

  // Kick off negotiation once we have BOTH a captured stream and a peer.
  useEffect(() => {
    if (peers.length > 0 && streamRef.current && !pcRef.current) {
      void startNegotiation();
    }
  }, [peers, localStream, startNegotiation]);

  // Register signaling handlers for the answer + ICE from the receiver.
  useEffect(() => {
    setHandlers({
      onAnswer: async (sdp) => {
        const pc = pcRef.current;
        if (!pc || pc.signalingState === "stable") return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        } catch (err) {
          setError(`设置 Answer 失败: ${(err as Error).message}`);
        }
      },
      onCandidate: async (candidate) => {
        const pc = pcRef.current;
        if (!pc) return;
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
    return () => {
      clearHandlers();
      teardown();
    };
  }, [setHandlers, clearHandlers, teardown]);

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
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        void stopSharing();
      });
    } catch (err) {
      setError(`屏幕捕获失败: ${(err as Error).message}`);
    } finally {
      setCapturing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopSharing = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLocalStream(null);
    teardown();
  }, [teardown]);

  return {
    localStream,
    pcState,
    pcLabel: pcStateLabel(pcState),
    iceLabel: iceStateLabel(iceState),
    stats,
    capturing,
    error,
    captureScreen,
    stopSharing,
  };
}
