import { MonitorPlay } from "lucide-react";
import SignalLamp from "./SignalLamp";
import { useSignalStore } from "@/store/useSignalStore";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
}

export default function AppHeader({ title, subtitle }: AppHeaderProps) {
  const wsStatus = useSignalStore((s) => s.wsStatus);
  const wsOn = wsStatus === "open";

  return (
    <header className="border-b border-ink-700/60 bg-ink-950/60 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <a href="/" className="group flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center border border-signal/40 bg-signal/10 text-signal transition-shadow group-hover:shadow-signal">
            <MonitorPlay className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <div className="font-display text-base text-fg">signal-lab</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-fg-muted">
              {title}
            </div>
          </div>
        </a>

        <div className="flex items-center gap-2">
          {subtitle ? (
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-fg-faint sm:inline">
              {subtitle}
            </span>
          ) : null}
          <SignalLamp
            tone={wsOn ? "signal" : wsStatus === "connecting" ? "amber" : "muted"}
            on={wsOn || wsStatus === "connecting"}
            label={`SIG · ${wsStatus.toUpperCase()}`}
          />
        </div>
      </div>
    </header>
  );
}
