import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ScreenShare, Square, Copy, ArrowLeft } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import VideoFrame from "@/components/VideoFrame";
import AnnotationCanvas from "@/components/AnnotationCanvas";
import StatusPanel from "@/components/StatusPanel";
import { useSignalStore } from "@/store/useSignalStore";
import { useSenderConnection } from "@/hooks/useSenderConnection";
import { wsStateLabel } from "@/lib/webrtc";
import type { Annotation, AnnotationAction } from "@/lib/annotations";

export default function Sender() {
  const navigate = useNavigate();
  const roomId = useSignalStore((s) => s.roomId);
  const peers = useSignalStore((s) => s.peers);
  const wsStatus = useSignalStore((s) => s.wsStatus);
  const leaveRoom = useSignalStore((s) => s.leaveRoom);

  const {
    localStream,
    pcLabel,
    iceLabel,
    stats,
    capturing,
    error,
    dataChannelReady,
    captureScreen,
    stopSharing,
    setAnnotationHandler,
  } = useSenderConnection();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

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

  const copyRoom = () => {
    if (roomId) void navigator.clipboard?.writeText(roomId);
  };

  return (
    <div className="min-h-screen">
      <AppHeader title="A端 · sender workbench" subtitle="screen capture ▸ p2p" />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
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
              {hasPeer ? "B端已接入" : "等待 B端加入"}
            </span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <section className="flex flex-col gap-4">
            <div className="panel relative aspect-video w-full overflow-hidden bg-ink-950 shadow-inset">
              <VideoFrame
                ref={videoRef}
                caption={localStream ? "LOCAL · SCREEN" : undefined}
                scanning={!localStream}
                className="absolute inset-0"
              />
              <AnnotationCanvas
                editable={false}
                videoRef={videoRef}
                annotations={annotations}
                className="absolute inset-0"
              />
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
            <div className="panel p-4">
              <span className="label">操作流程</span>
              <ol className="mt-3 flex flex-col gap-2 font-mono text-[11px] leading-relaxed text-fg-soft">
                <li>① 复制房间号，交给 B端</li>
                <li>② 点击「捕获屏幕」选择共享源</li>
                <li>③ B端加入后自动发起 Offer</li>
                <li>④ ICE 协商完成 → P2P 链路 LINKED</li>
              </ol>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
