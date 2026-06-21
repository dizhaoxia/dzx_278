import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, LogOut, Camera, Video, VideoOff, Lock, Unlock } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import VideoFrame from "@/components/VideoFrame";
import AnnotationCanvas, {
  type AnnotationCanvasHandle,
} from "@/components/AnnotationCanvas";
import StatusPanel from "@/components/StatusPanel";
import ReplayController from "@/components/ReplayController";
import MemberPanel from "@/components/MemberPanel";
import { useSignalStore } from "@/store/useSignalStore";
import { useReceiverConnection } from "@/hooks/useReceiverConnection";
import { wsStateLabel } from "@/lib/webrtc";
import type { Annotation, AnnotationAction } from "@/lib/annotations";
import { captureScreenshot, startRecording, type RecordingSession } from "@/lib/recording";

export default function Receiver() {
  const navigate = useNavigate();
  const roomId = useSignalStore((s) => s.roomId);
  const wsStatus = useSignalStore((s) => s.wsStatus);
  const leaveRoom = useSignalStore((s) => s.leaveRoom);
  const members = useSignalStore((s) => s.members);
  const clientId = useSignalStore((s) => s.clientId);
  const senderId = useSignalStore((s) => s.senderId);
  const annotationMode = useSignalStore((s) => s.annotationMode);
  const authorizedAnnotators = useSignalStore((s) => s.authorizedAnnotators);
  const setAnnotationMode = useSignalStore((s) => s.setAnnotationMode);
  const authorizeAnnotator = useSignalStore((s) => s.authorizeAnnotator);
  const revokeAnnotator = useSignalStore((s) => s.revokeAnnotator);

  const {
    remoteStream,
    pcLabel,
    iceLabel,
    stats,
    error,
    dataChannelReady,
    canAnnotate,
    history,
    sendAnnotationAction,
    setAnnotationHandler,
  } = useReceiverConnection();

  const videoRef = useRef<HTMLVideoElement>(null);
  const annotationRef = useRef<AnnotationCanvasHandle>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [replayOverlay, setReplayOverlay] = useState<Annotation[]>([]);
  const [recording, setRecording] = useState<RecordingSession | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = remoteStream;
      if (remoteStream) {
        videoRef.current.play().catch(() => {});
      }
    }
  }, [remoteStream]);

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

  const wsReadyState = wsStatus === "open" ? 1 : wsStatus === "connecting" ? 0 : 3;
  const pcOn = pcLabel === "LINKED";
  const isHost = !!clientId && clientId === senderId;

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

  const displayAnnotations = replayOverlay.length > 0 ? replayOverlay : annotations;

  return (
    <div className="min-h-screen">
      <AppHeader title="B端 · receiver workbench" subtitle="p2p ▸ playback" />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <button className="btn" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" />
            返回控制台
          </button>
          <div className="flex items-center gap-3">
            <span className="label">房间</span>
            <span className="chip border-signal/40 bg-signal/10 text-signal">
              {roomId ?? "—"}
            </span>
            <span
              className={[
                "chip",
                remoteStream
                  ? "border-signal/40 text-signal"
                  : "border-ink-600 text-fg-muted",
              ].join(" ")}
            >
              {remoteStream ? "画面接收中" : "等待 A端推流"}
            </span>
            {canAnnotate ? (
              <span className="chip border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                <Unlock className="h-3 w-3" />
                可标注
              </span>
            ) : (
              <span className="chip border-ink-600 text-fg-muted">
                <Lock className="h-3 w-3" />
                无标注权限
              </span>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <section className="flex flex-col gap-4">
            <div className="panel relative aspect-video w-full overflow-hidden bg-ink-950 shadow-inset">
              <VideoFrame
                ref={videoRef}
                scanning={!remoteStream}
                caption={remoteStream ? "REMOTE · INBOUND" : undefined}
                className="absolute inset-0"
              />
              <AnnotationCanvas
                ref={annotationRef}
                editable={!!remoteStream}
                canAnnotate={canAnnotate}
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
              <span className="chip border-ink-600 text-fg-soft">
                自动应答已启用 · 无需操作
              </span>
              <button
                className="btn"
                onClick={handleScreenshot}
                disabled={!remoteStream}
                title="保存带标注的截图"
              >
                <Camera className="h-4 w-4" />
                截图
              </button>
              <button
                className={recording ? "btn btn-danger" : "btn"}
                onClick={handleToggleRecording}
                disabled={!remoteStream}
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
              <button
                className="btn"
                onClick={() => {
                  leaveRoom();
                  navigate("/");
                }}
              >
                <LogOut className="h-4 w-4" />
                离开房间
              </button>
            </div>
            {error ? (
              <p className="font-mono text-xs text-magenta">! {error}</p>
            ) : null}
          </section>

          <aside className="flex flex-col gap-4">
            <StatusPanel
              role="receiver"
              wsLabel={wsStateLabel(wsReadyState)}
              wsOn={wsStatus === "open"}
              pcLabel={pcLabel}
              pcOn={pcOn}
              iceLabel={iceLabel}
              stats={stats}
            />

            <MemberPanel
              members={members}
              senderId={senderId}
              myClientId={clientId}
              annotationMode={annotationMode}
              authorizedAnnotators={authorizedAnnotators}
              isHost={isHost}
              onSetMode={setAnnotationMode}
              onAuthorize={authorizeAnnotator}
              onRevoke={revokeAnnotator}
            />

            <ReplayController
              actions={history}
              onReplayFrame={(anns) => setReplayOverlay(anns)}
            />

            <div className="panel p-4">
              <span className="label">接收流程</span>
              <ol className="mt-3 flex flex-col gap-2 font-mono text-[11px] leading-relaxed text-fg-soft">
                <li>① A端创建房间并分享房间号</li>
                <li>② 输入房间号加入（支持多人同时）</li>
                <li>③ 接收 A端 Offer 并回送 Answer</li>
                <li>④ ontrack 触发 → 绑定 video 播放</li>
                <li>⑤ 若被授权即可标注，可截图/录制</li>
              </ol>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
