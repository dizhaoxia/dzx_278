import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface VideoFrameProps {
  mirrored?: boolean;
  scanning?: boolean;
  caption?: string;
  className?: string;
}

/**
 * Video viewport with "viewfinder" corner ticks + a scanline overlay shown
 * while waiting for a track to arrive.
 */
const VideoFrame = forwardRef<HTMLVideoElement, VideoFrameProps>(
  function VideoFrame({ mirrored, scanning, caption, className }, ref) {
    return (
      <div
        className={cn(
          "panel relative aspect-video w-full overflow-hidden bg-ink-950 shadow-inset",
          className,
        )}
      >
        <video
          ref={ref}
          autoPlay
          playsInline
          muted
          className={cn(
            "h-full w-full object-contain",
            mirrored && "-scale-x-100",
          )}
        />

        {/* viewfinder corners */}
        {[
          "left-3 top-3 border-l border-t",
          "right-3 top-3 border-r border-t",
          "left-3 bottom-3 border-l border-b",
          "right-3 bottom-3 border-r border-b",
        ].map((pos) => (
          <span
            key={pos}
            className={cn(
              "pointer-events-none absolute h-4 w-4 border-signal/50",
              pos,
            )}
          />
        ))}

        {/* center crosshair */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-30">
          <div className="absolute -left-px -top-2 h-4 w-px bg-signal/60" />
          <div className="absolute -left-2 -top-px h-px w-4 bg-signal/60" />
        </div>

        {scanning ? (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute inset-x-0 h-24 animate-sweep bg-gradient-to-b from-transparent via-signal/10 to-transparent" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-[11px] uppercase tracking-[0.3em] text-signal/70 animate-blink">
              awaiting signal
            </div>
          </div>
        ) : null}

        {caption ? (
          <div className="absolute left-3 top-3">
            <span className="chip border-signal/30 bg-ink-950/70 text-signal">
              {caption}
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

export default VideoFrame;
