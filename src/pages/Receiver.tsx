import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, LogOut } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import VideoFrame from "@/components/VideoFrame";
import AnnotationCanvas from "@/components/AnnotationCanvas";
import StatusPanel from "@/components/StatusPanel";
import { useSignalStore } from "@/store/useSignalStore";
import { useReceiverConnection } from "@/hooks/useReceiverConnection";
import { wsStateLabel } from "@/lib/webrtc";
import type { Annotation, AnnotationAction } from "@/lib/annotations";

export default function Receiver() {
  const navigate = useNavigate();
  const roomId = useSignalStore((s) => s.roomId);
  const wsStatus = useSignalStore((s) => s.wsStatus);
  const leaveRoom = useSignalStore((s) => s.leaveRoom);

  const {
    remoteStream,
    pcLabel,
    iceLabel,
    stats,
    error,
    dataChannelReady,
    sendAnnotationAction,
    setAnnotationHandler,
  } = useReceiverConnection();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

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

  return (
    <div className="min-h-screen">
      <AppHeader title="B端 · receiver workbench" subtitle="p2p ▸ playback" />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
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
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <section className="flex flex-col gap-4">
            <div className="panel relative aspect-video w-full overflow-hidden bg-ink-950 shadow-inset">
              <VideoFrame
                ref={videoRef}
                scanning={!remoteStream}
                caption={remoteStream ? "REMOTE · INBOUND" : undefined}
                className="absolute inset-0"
              />
              <AnnotationCanvas
                editable={!!remoteStream}
                videoRef={videoRef}
                annotations={annotations}
                onAnnotationAdd={handleAnnotationAdd}
                onUndo={handleUndo}
                onClear={handleClear}
                className="absolute inset-0"
              />
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
            <div className="panel p-4">
              <span className="label">接收流程</span>
              <ol className="mt-3 flex flex-col gap-2 font-mono text-[11px] leading-relaxed text-fg-soft">
                <li>① A端创建房间并分享房间号</li>
                <li>② 输入房间号加入</li>
                <li>③ 接收 A端 Offer 并回送 Answer</li>
                <li>④ ontrack 触发 → 绑定 video 播放</li>
              </ol>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
