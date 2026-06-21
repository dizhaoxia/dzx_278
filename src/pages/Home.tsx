import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MonitorUp, MonitorDown, KeyRound, ArrowRight, Radio } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { useSignalStore } from "@/store/useSignalStore";
import { wsStateLabel } from "@/lib/webrtc";

type Mode = "sender" | "receiver";

export default function Home() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("sender");
  const [roomIdInput, setRoomIdInput] = useState("");

  const connect = useSignalStore((s) => s.connect);
  const createRoom = useSignalStore((s) => s.createRoom);
  const joinRoom = useSignalStore((s) => s.joinRoom);
  const wsStatus = useSignalStore((s) => s.wsStatus);
  const roomId = useSignalStore((s) => s.roomId);
  const role = useSignalStore((s) => s.role);
  const error = useSignalStore((s) => s.error);
  const clearError = useSignalStore((s) => s.clearError);

  useEffect(() => {
    connect();
  }, [connect, wsStatus]);

  // Once the server confirms a room/join, route into the matching workbench.
  useEffect(() => {
    if (!roomId || !role) return;
    navigate(role === "sender" ? "/sender" : "/receiver");
  }, [roomId, role, navigate]);

  const handleCreate = () => {
    clearError();
    createRoom();
  };

  const handleJoin = () => {
    const id = roomIdInput.trim();
    if (id.length < 4) return;
    clearError();
    joinRoom(id);
  };

  const wsReady = wsStatus === "open";
  const wsReadyState = wsStatus === "open" ? 1 : wsStatus === "connecting" ? 0 : 3;

  return (
    <div className="min-h-screen">
      <AppHeader title="control console" subtitle=":50003 ▸ :30003" />

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <section className="mb-10 animate-rise">
          <div className="flex items-center gap-2 text-signal">
            <Radio className="h-4 w-4 animate-blink" />
            <span className="font-mono text-[11px] uppercase tracking-[0.3em]">
              webrtc · screen-share · p2p
            </span>
          </div>
          <h1 className="mt-3 font-display text-4xl leading-tight text-fg sm:text-5xl">
            signal lab
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-fg-soft">
            A 端通过 <code className="text-signal">getDisplayMedia</code> 捕获屏幕，
            经 WebRTC 原生 <code className="text-signal">RTCPeerConnection</code> 建立
            P2P 链路，将画面实时传输至 B 端。信令交换由 :30003 的 WebSocket 服务承担。
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="panel p-5 animate-rise">
            <span className="label">01 · 选择角色</span>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <RoleCard
                active={mode === "sender"}
                onClick={() => setMode("sender")}
                icon={<MonitorUp className="h-5 w-5" />}
                title="A 端 / 推流"
                desc="捕获本机屏幕并发布"
                tag="SENDER"
              />
              <RoleCard
                active={mode === "receiver"}
                onClick={() => setMode("receiver")}
                icon={<MonitorDown className="h-5 w-5" />}
                title="B 端 / 拉流"
                desc="接收并播放远端画面"
                tag="RECEIVER"
              />
            </div>

            <div className="mt-6 border-t border-ink-700/60 pt-5">
              <span className="label">
                02 · {mode === "sender" ? "创建房间" : "加入房间"}
              </span>

              {mode === "sender" ? (
                <div className="mt-4 flex flex-col gap-3">
                  <p className="text-sm text-fg-soft">
                    创建房间后将获得一个 6 位房间号，将其交给 B 端即可建立连接。
                  </p>
                  <button
                    className="btn btn-primary w-full sm:w-auto"
                    onClick={handleCreate}
                    disabled={!wsReady}
                  >
                    <KeyRound className="h-4 w-4" />
                    创建房间
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="mt-4 flex flex-col gap-3">
                  <input
                    className="field"
                    placeholder="输入 6 位房间号"
                    value={roomIdInput}
                    maxLength={6}
                    onChange={(e) =>
                      setRoomIdInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                    }
                    onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                  />
                  <button
                    className="btn btn-primary w-full sm:w-auto"
                    onClick={handleJoin}
                    disabled={!wsReady || roomIdInput.trim().length < 4}
                  >
                    加入房间
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              )}

              {error ? (
                <p className="mt-4 font-mono text-xs text-magenta">! {error}</p>
              ) : null}
            </div>
          </div>

          <div className="panel flex flex-col gap-4 p-5 animate-rise">
            <span className="label">链路状态</span>
            <ul className="flex flex-col gap-3 font-mono text-xs">
              <StatusRow k="frontend" v="http://localhost:50003" />
              <StatusRow k="signaling" v="ws://localhost:30003/signal" />
              <StatusRow k="ws state" v={wsStateLabel(wsReadyState)} accent={wsReady} />
              <StatusRow k="stun" v="stun.l.google.com:19302" />
              <StatusRow k="codec" v="VP8 ▸ H264 (fallback)" />
            </ul>
            <div className="mt-auto border-t border-ink-700/60 pt-4">
              <p className="font-mono text-[10px] leading-relaxed text-fg-faint">
                提示：屏幕共享需在 HTTPS 或 localhost 下运行；
                本演示两端可分别开两个浏览器窗口 / 标签页模拟 A↔B。
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function RoleCard({
  active,
  onClick,
  icon,
  title,
  desc,
  tag,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
  tag: string;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "group relative flex flex-col gap-2 border p-4 text-left transition-all duration-200",
        active
          ? "border-signal/60 bg-signal/10 shadow-signal"
          : "border-ink-700 bg-ink-900/50 hover:border-ink-500",
      ].join(" ")}
    >
      <span className="flex items-center justify-between">
        <span className={active ? "text-signal" : "text-fg-soft"}>{icon}</span>
        <span className="font-mono text-[9px] tracking-[0.2em] text-fg-faint">{tag}</span>
      </span>
      <span className="font-sans text-sm font-medium text-fg">{title}</span>
      <span className="font-mono text-[11px] text-fg-muted">{desc}</span>
    </button>
  );
}

function StatusRow({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-ink-800/70 pb-2">
      <span className="text-fg-muted">{k}</span>
      <span className={accent ? "text-signal" : "text-fg-soft"}>{v}</span>
    </li>
  );
}
