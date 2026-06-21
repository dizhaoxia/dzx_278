import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, RotateCcw, Download, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimedAnnotationAction, Annotation } from "@/lib/annotations";
import { replayAnnotations } from "@/lib/annotations";

interface ReplayControllerProps {
  actions: TimedAnnotationAction[];
  onReplayFrame?: (annotations: Annotation[]) => void;
  className?: string;
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

export default function ReplayController({
  actions,
  onReplayFrame,
  className,
}: ReplayControllerProps) {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);
  const historyDuration = actions.length
    ? actions[actions.length - 1].timestamp + 1000
    : 0;

  const tick = useCallback(
    (ts: number) => {
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) * speed;
      lastTsRef.current = ts;
      setTime((prev) => {
        const next = Math.min(historyDuration, prev + dt);
        if (next >= historyDuration) {
          setPlaying(false);
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    },
    [historyDuration, speed],
  );

  useEffect(() => {
    if (playing) {
      lastTsRef.current = 0;
      rafRef.current = requestAnimationFrame(tick);
    } else if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, tick]);

  useEffect(() => {
    if (onReplayFrame) {
      onReplayFrame(replayAnnotations(actions, time));
    }
  }, [actions, time, onReplayFrame]);

  const toggle = () => {
    if (time >= historyDuration) setTime(0);
    setPlaying((p) => !p);
  };

  const reset = () => {
    setPlaying(false);
    setTime(0);
  };

  const exportHistory = () => {
    const data = JSON.stringify({ actions, duration: historyDuration }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    a.download = `annotation-history-${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const pct = historyDuration > 0 ? (time / historyDuration) * 100 : 0;

  if (actions.length === 0) {
    return (
      <div className={cn("panel flex items-center justify-center p-4 text-xs text-fg-muted", className)}>
        <Clock className="mr-2 h-3.5 w-3.5" />
        暂无标注历史记录
      </div>
    );
  }

  return (
    <div className={cn("panel flex flex-col gap-3 p-4", className)}>
      <div className="flex items-center justify-between">
        <span className="label">标注回放</span>
        <span className="font-mono text-[10px] text-fg-muted">
          {formatTime(time)} / {formatTime(historyDuration)}
        </span>
      </div>

      <div className="relative h-2 w-full overflow-hidden rounded-full bg-ink-800">
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-signal/70"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={0}
          max={historyDuration}
          step={50}
          value={time}
          onChange={(e) => setTime(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={toggle}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-signal/20 text-signal transition-colors hover:bg-signal/30"
            title={playing ? "暂停" : "播放"}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            onClick={reset}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-ink-800 hover:text-fg"
            title="重置"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          {[0.5, 1, 2].map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={cn(
                "rounded px-2 py-1 font-mono text-[10px] transition-colors",
                speed === s
                  ? "bg-signal/20 text-signal"
                  : "text-fg-muted hover:bg-ink-800 hover:text-fg",
              )}
            >
              {s}×
            </button>
          ))}
          <button
            onClick={exportHistory}
            className="ml-2 flex h-8 items-center gap-1 rounded px-2 text-xs text-fg-muted transition-colors hover:bg-ink-800 hover:text-fg"
            title="导出历史 JSON"
          >
            <Download className="h-3.5 w-3.5" />
            导出
          </button>
        </div>
      </div>
    </div>
  );
}
