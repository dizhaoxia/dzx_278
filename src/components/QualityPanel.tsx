import { Gauge, Zap, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { QUALITY_PRESETS, type QualityPreset } from "@/lib/webrtc";
import type { LinkStats } from "@/lib/webrtc";

interface QualityPanelProps {
  stats: LinkStats;
  qualityIndex: number;
  currentPreset: QualityPreset;
  autoQuality: boolean;
  onSetQuality: (index: number) => void;
  onToggleAuto: () => void;
  className?: string;
}

export default function QualityPanel({
  stats,
  qualityIndex,
  currentPreset,
  autoQuality,
  onSetQuality,
  onToggleAuto,
  className,
}: QualityPanelProps) {
  return (
    <div className={cn("panel flex flex-col gap-3 p-4", className)}>
      <div className="flex items-center justify-between">
        <span className="label flex items-center gap-1.5">
          <Gauge className="h-3.5 w-3.5" />
          画质 &amp; 自适应码率
        </span>
        <button
          onClick={onToggleAuto}
          className={cn(
            "flex items-center gap-1 rounded px-2 py-1 font-mono text-[10px] transition-colors",
            autoQuality
              ? "bg-signal/20 text-signal"
              : "text-fg-muted hover:bg-ink-800",
          )}
        >
          {autoQuality ? (
            <>
              <Zap className="h-3 w-3" />
              自适应 ON
            </>
          ) : (
            <>
              <Radio className="h-3 w-3" />
              自适应 OFF
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {QUALITY_PRESETS.map((preset, idx) => {
          const active = idx === qualityIndex;
          return (
            <button
              key={preset.label}
              onClick={() => onSetQuality(idx)}
              className={cn(
                "flex flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left transition-all",
                active
                  ? "border-signal/50 bg-signal/10 shadow-signal"
                  : "border-ink-700 bg-ink-900/50 hover:border-ink-500",
              )}
            >
              <span
                className={cn(
                  "font-mono text-[11px] font-semibold",
                  active ? "text-signal" : "text-fg",
                )}
              >
                {preset.label}
              </span>
              <span className="font-mono text-[10px] text-fg-muted">
                {preset.width}×{preset.height} · {preset.maxFps}fps · {preset.maxBitrateKbps}kbps
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between rounded-md bg-ink-900/60 px-3 py-2">
        <span className="font-mono text-[10px] text-fg-muted">当前目标</span>
        <span className="font-mono text-[11px] text-signal">
          {currentPreset.label} · {currentPreset.width}×{currentPreset.height}
        </span>
      </div>

      {stats.packetsLost > 0 || stats.jitterMs > 40 ? (
        <div className="rounded-md bg-amber-500/10 px-3 py-2 font-mono text-[10px] text-amber-300">
          ⚠ 弱网检测：丢包 {stats.packetsLost} · 抖动 {stats.jitterMs}ms
        </div>
      ) : null}
    </div>
  );
}
