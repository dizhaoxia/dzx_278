import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ScreenShare,
  Square,
  Copy,
  ArrowLeft,
  Camera,
  Video,
  VideoOff,
} from "lucide-react";
import AppHeader from "@/components/AppHeader";
import VideoFrame from "@/components/VideoFrame";
import AnnotationCanvas, {
  type AnnotationCanvasHandle,
} from "@/components/AnnotationCanvas";
import StatusPanel from "@/components/StatusPanel";
import ReplayController from "@/components/ReplayController";
import MemberPanel from "@/components/MemberPanel";
import QualityPanel from "@/components/QualityPanel";
import { useSignalStore } from "@/store/useSignalStore";
import { useSenderConnection } from "@/hooks/useSenderConnection";
import { wsStateLabel } from "@/lib/webrtc";
import type { Annotation, AnnotationAction } from "@/lib/annotations";
import { captureScreenshot, startRecording, type RecordingSession } from "@/lib/recording";

export default function Sender() {
  const navigate = useNavigate();
  const roomId = useSignalStore((s) => s.roomId);
  const peers = useSignalStore((s) => s.peers);
  const members = useSignalStore((s) => s.members);
  const wsStatus = useSignalStore((s) => s.wsStatus);
  const leaveRoom = useSignalStore((s) => s.leaveRoom);
  const clientId = useSignalStore((s) => s.clientId);
  const senderId = useSignalStore((s) => s.senderId);
  const annotationMode = useSignalStore((s) => s.annotationMode);
  const authorizedAnnotators = useSignalStore((s) => s.authorizedAnnotators);
  const setAnnotationMode = useSignalStore((s) => s.setAnnotationMode);
  const authorizeAnnotator = useSignalStore((s) => s.authorizeAnnotator);
  const revokeAnnotator = useSignalStore((s) => s.revokeAnnotator);

  const {
    localStream,
    pcLabel,
    iceLabel,
    stats,
    capturing,
    error,
    dataChannelReady,
    peerCount,
    history,
    qualityIndex,
    currentPreset,
    autoQuality,
    captureScreen,
    stopSharing,
    setAnnotationHandler,
    sendAnnotationAction,
    setQuality,
    setAutoQuality,
  } = useSenderConnection();

  const videoRef = useRef<HTMLVideoElement>(null);
  const annotationRef = useRef<AnnotationCanvasHandle>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [replayOverlay, setReplayOverlay] = useState<Annotation[]>([]);
  const [recording, setRecording] = useState<RecordingSession | null>(null);

  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
      videoRef.current.play().catch(() => {});
    }
  }, [localStream]);

  useEffect(() => {
    if (!roomId) navigate("/");
  }, [roomId, navigate]);

  useEffect(() => {
    setAnnotationHandler((action: AnnotationAction) => {
      switch (action.type) {
        case "add":
          setAnnotations((prev) => [...prev, action.annotation]);
          break;
        case "undo":
          setAnnotations((prev) => prev.slice(0, -1));
          break;
        case "clear":
          setAnnotations([]);
          break;
        case "init":
          setAnnotations(action.annotations);
          break;
      }
    });
    return () => setAnnotationHandler(null);
  }, [setAnnotationHandler]);

  const hasPeer = peers.length > 0;
  const wsReadyState = wsStatus === "open" ? 1 : wsStatus === "connecting" ? 0 : 3;
  const pcOn = pcLabel === "LINKED";
  const isHost = !!clientId && clientId === senderId;

  const copyRoom = () => {
    if (roomId) void navigator.clipboard?.writeText(roomId);
  };

  const handleScreenshot = useCallback(async () => {
    const canvas = annotationRef.current?.getCanvas() ?? undefined;
    await captureScreenshot({
      videoRef,
      canvasRef: { current: canvas ?? null },
      annotations: replayOverlay.length > 0 ? replayOverlay : annotations,
    });
  }, [annotations, replayOverlay]);

  const handleToggleRecording = useCallback(async () => {
    if (recording) {
      await recording.stop();
      setRecording(null);
    } else {
      const canvas = annotationRef.current?.getCanvas() ?? undefined;
      const sess = startRecording({
        videoRef,
        canvasRef: { current: canvas ?? null },
        annotations,
      });
      setRecording(sess);
    }
  }, [recording, annotations]);

  const handleAnnotationAdd = useCallback(
    (ann: Annotation) => {
      setAnnotations((prev) => [...prev, ann]);
      sendAnnotationAction({ type: "add", annotation: ann });
    },
    [sendAnnotationAction],
  );

  const handleUndo = useCallback(() => {
    setAnnotations((prev) => prev.slice(0, -1));
    sendAnnotationAction({ type: "undo" });
  }, [sendAnnotationAction]);

  const handleClear = useCallback(() => {
    setAnnotations([]);
    sendAnnotationAction({ type: "clear" });
  }, [sendAnnotationAction]);

  const displayAnnotations = replayOverlay.length > 0 ? replayOverlay : annotations;

  return (
    <div className="min-h-screen">
      <AppHeader title="A端 · sender workbench" subtitle="screen capture ▸ p2p multi-receiver" />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <button className="btn" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" />
            返回控制台
          </button>

          <div className="flex items-center gap-3">
            <span className="label">房间号</span>
            <button
              onClick={copyRoom}
              className="chip border-signal/40 bg-signal/10 text-signal transition-colors hover:bg-signal/20"
              title="点击复制"
            >
              {roomId ?? "—"}
              <Copy className="h-3 w-3" />
            </button>
            <span
              className={[
                "chip",
                hasPeer
                  ? "border-signal/40 text-signal"
                  : "border-ink-600 text-fg-muted",
              ].join(" ")}
            >
              {hasPeer ? `B端已接入 ×${peerCount}` : "等待 B端加入"}
            </span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <section className="flex flex-col gap-4">
            <div className="panel relative aspect-video w-full overflow-hidden bg-ink-950 shadow-inset">
              <VideoFrame
                ref={videoRef}
                caption={localStream ? "LOCAL · SCREEN" : undefined}
                scanning={!localStream}
                className="absolute inset-0"
              />
              <AnnotationCanvas
                ref={annotationRef}
                editable={!!localStream}
                canAnnotate
                videoRef={videoRef}
                annotations={displayAnnotations}
                onAnnotationAdd={handleAnnotationAdd}
                onUndo={handleUndo}
                onClear={handleClear}
                className="absolute inset-0"
              />
              {recording && (
                <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-magenta/90 px-3 py-1 font-mono text-[11px] text-white">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                  REC · {Math.floor((Date.now() - recording.startTime) / 1000)}s
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {!localStream ? (
                <button className="btn btn-primary" onClick={captureScreen} disabled={capturing}>
                  <ScreenShare className="h-4 w-4" />
                  {capturing ? "捕获中…" : "捕获屏幕"}
                </button>
              ) : (
                <>
                  <span className="chip border-signal/40 text-signal">
                    {hasPeer ? "传输中" : "已就绪 · 等待 B端"}
                  </span>
                  <span
                    className={[
                      "chip",
                      dataChannelReady
                        ? "border-signal/40 text-signal"
                        : "border-ink-600 text-fg-muted",
                    ].join(" ")}
                  >
                    标注通道: {dataChannelReady ? "已连接" : "未连接"}
                  </span>
                  <button
                    className="btn"
                    onClick={handleScreenshot}
                    title="保存带标注的截图"
                  >
                    <Camera className="h-4 w-4" />
                    截图
                  </button>
                  <button
                    className={recording ? "btn btn-danger" : "btn"}
                    onClick={handleToggleRecording}
                    title={recording ? "停止录制并保存" : "开始录制（带标注）"}
                  >
                    {recording ? (
                      <>
                        <VideoOff className="h-4 w-4" />
                        停止录制
                      </>
                    ) : (
                      <>
                        <Video className="h-4 w-4" />
                        录制
                      </>
                    )}
                  </button>
                  <button className="btn btn-danger" onClick={stopSharing}>
                    <Square className="h-4 w-4" />
                    停止共享
                  </button>
                </>
              )}
              <button
                className="btn"
                onClick={() => {
                  stopSharing();
                  leaveRoom();
                  navigate("/");
                }}
              >
                结束会话
              </button>
            </div>
            {error ? (
              <p className="font-mono text-xs text-magenta">! {error}</p>
            ) : null}
          </section>

          <aside className="flex flex-col gap-4">
            <StatusPanel
              role="sender"
              wsLabel={wsStateLabel(wsReadyState)}
              wsOn={wsStatus === "open"}
              pcLabel={pcLabel}
              pcOn={pcOn}
              iceLabel={iceLabel}
              stats={stats}
            />

            <QualityPanel
              stats={stats}
              qualityIndex={qualityIndex}
              currentPreset={currentPreset}
              autoQuality={autoQuality}
              onSetQuality={setQuality}
              onToggleAuto={() => setAutoQuality(!autoQuality)}
            />

            <MemberPanel
              members={members}
              senderId={senderId}
              myClientId={clientId}
              annotationMode={annotationMode}
              authorizedAnnotators={authorizedAnnotators}
              isHost={!!isHost}
              onSetMode={setAnnotationMode}
              onAuthorize={authorizeAnnotator}
              onRevoke={revokeAnnotator}
            />

            <ReplayController
              actions={history}
              onReplayFrame={(anns) => setReplayOverlay(anns)}
            />

            <div className="panel p-4">
              <span className="label">操作流程</span>
              <ol className="mt-3 flex flex-col gap-2 font-mono text-[11px] leading-relaxed text-fg-soft">
                <li>① 复制房间号，交给任意数量的 B端</li>
                <li>② 点击「捕获屏幕」选择共享源</li>
                <li>③ B端加入后自动发起独立 Offer</li>
                <li>④ 可切换主持人/自由标注模式</li>
                <li>⑤ 弱网下自动调节画质；可手动截图/录制</li>
              </ol>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
