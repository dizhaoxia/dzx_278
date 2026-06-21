import SignalLamp from "./SignalLamp";
import StatTile from "./StatTile";
import type { LinkStats } from "@/lib/webrtc";

interface StatusPanelProps {
  wsLabel: string;
  wsOn: boolean;
  pcLabel: string;
  pcOn: boolean;
  iceLabel?: string;
  stats: LinkStats;
  role: "sender" | "receiver";
}

export default function StatusPanel({
  wsLabel,
  wsOn,
  pcLabel,
  pcOn,
  iceLabel,
  stats,
  role,
}: StatusPanelProps) {
  return (
    <div className="panel flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <span className="label">link telemetry</span>
        <span className="font-mono text-[10px] text-fg-faint">
          {role === "sender" ? "OUTBOUND ▸" : "◂ INBOUND"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SignalLamp tone={wsOn ? "signal" : "muted"} on={wsOn} label={`WS · ${wsLabel}`} />
        <SignalLamp
          tone={pcOn ? "signal" : pcLabel === "FAILED" ? "magenta" : "amber"}
          on={pcOn}
          label={`PC · ${pcLabel}`}
        />
        {iceLabel ? (
          <SignalLamp tone="muted" on={pcOn} label={`ICE · ${iceLabel}`} />
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatTile label="bitrate" value={`${stats.bitrateKbps}`} hint="kbps" accent />
        <StatTile label="resolution" value={stats.width ? `${stats.width}×${stats.height}` : "—"} />
        <StatTile label="fps" value={stats.fps ? stats.fps : "—"} />
        <StatTile label="codec" value={stats.codec} />
        <StatTile label="jitter" value={stats.jitterMs ? `${stats.jitterMs}ms` : "0ms"} />
        <StatTile label="cand. type" value={stats.candidateType} />
      </div>
    </div>
  );
}
