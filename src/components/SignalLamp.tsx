import { cn } from "@/lib/utils";

export type LampTone = "signal" | "amber" | "magenta" | "muted";

interface SignalLampProps {
  tone?: LampTone;
  on: boolean;
  label?: string;
  className?: string;
}

const toneRing: Record<LampTone, string> = {
  signal: "border-signal/60 text-signal",
  amber: "border-amber/60 text-amber",
  magenta: "border-magenta/60 text-magenta",
  muted: "border-ink-600 text-fg-muted",
};

const toneDot: Record<LampTone, string> = {
  signal: "bg-signal shadow-[0_0_10px_2px_rgba(0,255,156,0.7)]",
  amber: "bg-amber shadow-[0_0_10px_2px_rgba(255,176,32,0.6)]",
  magenta: "bg-magenta shadow-[0_0_10px_2px_rgba(255,51,102,0.6)]",
  muted: "bg-ink-500",
};

export default function SignalLamp({
  tone = "muted",
  on,
  label,
  className,
}: SignalLampProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em]",
        toneRing[tone],
        className,
      )}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full transition-all duration-300",
          toneDot[tone],
          on ? "animate-blink" : "opacity-30",
        )}
      />
      {label}
    </span>
  );
}
