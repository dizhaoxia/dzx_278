import type { Annotation } from "@/lib/annotations";
import { drawAllAnnotations } from "@/lib/annotations";

export interface CaptureOptions {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef?: React.RefObject<HTMLCanvasElement>;
  annotations?: Annotation[];
  mimeType?: string;
  quality?: number;
}

export interface RecordingSession {
  stop: () => Promise<Blob | null>;
  isRecording: boolean;
  startTime: number;
}

function getVideoSize(
  video: HTMLVideoElement | null,
): { width: number; height: number } {
  if (!video) return { width: 0, height: 0 };
  const w = video.videoWidth || video.clientWidth;
  const h = video.videoHeight || video.clientHeight;
  return { width: w, height: h };
}

function composeFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement | null,
  canvas: HTMLCanvasElement | null,
  annotations: Annotation[],
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);
  if (video && video.readyState >= 2) {
    try {
      ctx.drawImage(video, 0, 0, width, height);
    } catch {
      /* ignore drawImage errors (e.g., CORS) */
    }
  }
  if (canvas) {
    try {
      ctx.drawImage(canvas, 0, 0, width, height);
    } catch {
      /* ignore */
    }
  } else if (annotations.length > 0) {
    drawAllAnnotations(ctx, annotations);
  }
}

/**
 * Capture a screenshot of the current video frame composited with annotation
 * canvas (or annotation list) and trigger a download as PNG.
 */
export async function captureScreenshot(opts: CaptureOptions): Promise<string | null> {
  const { videoRef, canvasRef, annotations = [], mimeType = "image/png", quality = 0.92 } = opts;
  const video = videoRef.current;
  const { width, height } = getVideoSize(video);
  if (width === 0 || height === 0) return null;

  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;
  const ctx = offscreen.getContext("2d");
  if (!ctx) return null;

  composeFrame(ctx, video, canvasRef?.current ?? null, annotations, width, height);

  return new Promise((resolve) => {
    offscreen.toBlob(
      (blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        a.download = `screenshot-${ts}.${mimeType === "image/jpeg" ? "jpg" : "png"}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        resolve(url);
      },
      mimeType,
      quality,
    );
  });
}

/**
 * Start a recording session that composites the <video> frame with the
 * annotation layer into an offscreen canvas, then feeds it to MediaRecorder.
 *
 * Returns a RecordingSession with a `stop()` method that resolves to the
 * final webm Blob (and triggers a download).
 */
export function startRecording(opts: CaptureOptions & { fps?: number }): RecordingSession | null {
  const { videoRef, canvasRef, annotations = [], fps = 30 } = opts;
  const video = videoRef.current;
  if (!video) return null;
  let { width, height } = getVideoSize(video);
  if (width === 0 || height === 0) {
    width = 1280;
    height = 720;
  }

  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;
  const ctx = offscreen.getContext("2d");
  if (!ctx) return null;

  const stream = (offscreen as HTMLCanvasElement).captureStream(fps);
  const videoAny = video as unknown as { captureStream?: () => MediaStream };
  if (videoAny.captureStream) {
    const audioTracks = videoAny.captureStream().getAudioTracks();
    for (const t of audioTracks) stream.addTrack(t);
  }

  let mime = "video/webm;codecs=vp8";
  if (typeof MediaRecorder !== "undefined" && !MediaRecorder.isTypeSupported(mime)) {
    mime = "video/webm";
  }
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: mime });
  } catch {
    try {
      recorder = new MediaRecorder(stream);
    } catch {
      return null;
    }
  }

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const timer = window.setInterval(() => {
    if (recorder.state !== "recording") return;
    const v = videoRef.current;
    const { width: w, height: h } = getVideoSize(v);
    if (w !== offscreen.width || h !== offscreen.height) {
      offscreen.width = w || offscreen.width;
      offscreen.height = h || offscreen.height;
    }
    composeFrame(
      ctx,
      v,
      canvasRef?.current ?? null,
      annotations,
      offscreen.width,
      offscreen.height,
    );
  }, Math.round(1000 / fps));

  recorder.start(200);

  return {
    isRecording: true,
    startTime: Date.now(),
    stop: () =>
      new Promise<Blob | null>((resolve) => {
        clearInterval(timer);
        try {
          recorder.onstop = () => {
            const blob =
              chunks.length > 0 ? new Blob(chunks, { type: mime }) : null;
            if (blob) {
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              const ts = new Date().toISOString().replace(/[:.]/g, "-");
              a.download = `recording-${ts}.webm`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
            resolve(blob);
          };
          if (recorder.state !== "inactive") recorder.stop();
          else resolve(null);
        } catch {
          resolve(null);
        }
      }),
  };
}
