import { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import {
  Pencil,
  Square,
  ArrowRight,
  Type,
  Undo2,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type Annotation,
  type AnnotationType,
  type PenAnnotation,
  type RectAnnotation,
  type ArrowAnnotation,
  type TextAnnotation,
  ANNOTATION_COLORS,
  ANNOTATION_LINE_WIDTHS,
  generateId,
  drawAllAnnotations,
  drawAnnotation,
} from "@/lib/annotations";

export interface AnnotationCanvasHandle {
  addAnnotation: (ann: Annotation) => void;
  undo: () => void;
  clear: () => void;
  getAnnotations: () => Annotation[];
  setAnnotations: (anns: Annotation[]) => void;
}

interface AnnotationCanvasProps {
  editable?: boolean;
  videoRef?: React.RefObject<HTMLVideoElement>;
  onAnnotationAdd?: (ann: Annotation) => void;
  onUndo?: () => void;
  onClear?: () => void;
  annotations?: Annotation[];
  className?: string;
}

const TOOLS: { type: AnnotationType; icon: React.ElementType; label: string }[] = [
  { type: "pen", icon: Pencil, label: "画笔" },
  { type: "rect", icon: Square, label: "矩形" },
  { type: "arrow", icon: ArrowRight, label: "箭头" },
  { type: "text", icon: Type, label: "文字" },
];

const AnnotationCanvas = forwardRef<AnnotationCanvasHandle, AnnotationCanvasProps>(
  function AnnotationCanvas(
    { editable = false, videoRef, onAnnotationAdd, onUndo, onClear, annotations: externalAnnotations, className },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const drawingRef = useRef(false);
    const startPosRef = useRef({ x: 0, y: 0 });
    const currentPointsRef = useRef<{ x: number; y: number }[]>([]);
    const tempAnnotationRef = useRef<Annotation | null>(null);
    const redrawRef = useRef<() => void>(() => {});
    const addAnnotationLocalRef = useRef<(ann: Annotation) => void>(() => {});

    const [tool, setTool] = useState<AnnotationType>("pen");
    const [color, setColor] = useState(ANNOTATION_COLORS[0]);
    const [lineWidth, setLineWidth] = useState(ANNOTATION_LINE_WIDTHS[1]);
    const [localAnnotations, setLocalAnnotations] = useState<Annotation[]>([]);
    const [colorPickerOpen, setColorPickerOpen] = useState(false);
    const [widthPickerOpen, setWidthPickerOpen] = useState(false);

    const annotations = externalAnnotations ?? localAnnotations;

    const getVideoSize = useCallback(() => {
      if (videoRef?.current) {
        const v = videoRef.current;
        return { width: v.videoWidth, height: v.videoHeight };
      }
      const canvas = canvasRef.current;
      if (canvas) {
        return { width: canvas.width, height: canvas.height };
      }
      return { width: 0, height: 0 };
    }, [videoRef]);

    const resizeCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
        redrawRef.current();
      }
    }, []);

    const redraw = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      const { width: vw, height: vh } = getVideoSize();
      if (vw > 0 && vh > 0) {
        const scale = Math.min(rect.width / vw, rect.height / vh);
        const offsetX = (rect.width - vw * scale) / 2;
        const offsetY = (rect.height - vh * scale) / 2;

        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);
        drawAllAnnotations(ctx, annotations);
        if (tempAnnotationRef.current) {
          drawAnnotation(ctx, tempAnnotationRef.current);
        }
        ctx.restore();
      }
    }, [annotations, getVideoSize]);

    useEffect(() => {
      redrawRef.current = redraw;
    }, [redraw]);

    useEffect(() => {
      resizeCanvas();
      window.addEventListener("resize", resizeCanvas);
      return () => window.removeEventListener("resize", resizeCanvas);
    }, [resizeCanvas]);

    useEffect(() => {
      redraw();
    }, [redraw]);

    useEffect(() => {
      if (!videoRef?.current) return;
      const video = videoRef.current;
      const handler = () => {
        resizeCanvas();
        redraw();
      };
      video.addEventListener("loadedmetadata", handler);
      video.addEventListener("resize", handler);
      return () => {
        video.removeEventListener("loadedmetadata", handler);
        video.removeEventListener("resize", handler);
      };
    }, [videoRef, resizeCanvas, redraw]);

    const screenToVideo = useCallback(
      (clientX: number, clientY: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const { width: vw, height: vh } = getVideoSize();
        if (vw === 0 || vh === 0) return { x: 0, y: 0 };

        const scale = Math.min(rect.width / vw, rect.height / vh);
        const offsetX = (rect.width - vw * scale) / 2;
        const offsetY = (rect.height - vh * scale) / 2;

        const x = (clientX - rect.left - offsetX) / scale;
        const y = (clientY - rect.top - offsetY) / scale;

        return { x, y };
      },
      [getVideoSize],
    );

    const handleMouseDown = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!editable) return;
        const pos = screenToVideo(e.clientX, e.clientY);
        startPosRef.current = pos;
        drawingRef.current = true;
        currentPointsRef.current = [pos];
        tempAnnotationRef.current = null;

        if (tool === "text") {
          const text = window.prompt("输入文字：");
          if (text) {
            const ann: TextAnnotation = {
              id: generateId(),
              type: "text",
              color,
              lineWidth,
              x: pos.x,
              y: pos.y,
              text,
              fontSize: 16 + lineWidth * 2,
            };
            addAnnotationLocalRef.current(ann);
            onAnnotationAdd?.(ann);
          }
          drawingRef.current = false;
        }
      },
      [editable, tool, color, lineWidth, screenToVideo, onAnnotationAdd],
    );

    const handleMouseMove = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!editable || !drawingRef.current) return;
        const pos = screenToVideo(e.clientX, e.clientY);

        switch (tool) {
          case "pen":
            currentPointsRef.current.push(pos);
            tempAnnotationRef.current = {
              id: "temp",
              type: "pen",
              color,
              lineWidth,
              points: [...currentPointsRef.current],
            } as PenAnnotation;
            break;
          case "rect":
            tempAnnotationRef.current = {
              id: "temp",
              type: "rect",
              color,
              lineWidth,
              x: Math.min(startPosRef.current.x, pos.x),
              y: Math.min(startPosRef.current.y, pos.y),
              width: Math.abs(pos.x - startPosRef.current.x),
              height: Math.abs(pos.y - startPosRef.current.y),
            } as RectAnnotation;
            break;
          case "arrow":
            tempAnnotationRef.current = {
              id: "temp",
              type: "arrow",
              color,
              lineWidth,
              x1: startPosRef.current.x,
              y1: startPosRef.current.y,
              x2: pos.x,
              y2: pos.y,
            } as ArrowAnnotation;
            break;
        }
        redrawRef.current();
      },
      [editable, tool, color, lineWidth, screenToVideo],
    );

    const handleMouseUp = useCallback(() => {
      if (!editable || !drawingRef.current) return;
      drawingRef.current = false;

      const temp = tempAnnotationRef.current;
      if (temp && temp.id === "temp") {
        const ann: Annotation = { ...temp, id: generateId() };
        addAnnotationLocalRef.current(ann);
        onAnnotationAdd?.(ann);
      }

      tempAnnotationRef.current = null;
      currentPointsRef.current = [];
      redrawRef.current();
    }, [editable, onAnnotationAdd]);

    const addAnnotationLocal = useCallback((ann: Annotation) => {
      if (externalAnnotations) return;
      setLocalAnnotations((prev) => [...prev, ann]);
    }, [externalAnnotations]);

    useEffect(() => {
      addAnnotationLocalRef.current = addAnnotationLocal;
    }, [addAnnotationLocal]);

    const handleUndo = useCallback(() => {
      if (externalAnnotations) {
        onUndo?.();
        return;
      }
      setLocalAnnotations((prev) => prev.slice(0, -1));
      onUndo?.();
    }, [externalAnnotations, onUndo]);

    const handleClear = useCallback(() => {
      if (externalAnnotations) {
        onClear?.();
        return;
      }
      setLocalAnnotations([]);
      onClear?.();
    }, [externalAnnotations, onClear]);

    useImperativeHandle(ref, () => ({
      addAnnotation: (ann: Annotation) => {
        addAnnotationLocalRef.current(ann);
      },
      undo: () => {
        handleUndo();
      },
      clear: () => {
        handleClear();
      },
      getAnnotations: () => annotations,
      setAnnotations: (anns: Annotation[]) => {
        if (!externalAnnotations) {
          setLocalAnnotations(anns);
        }
      },
    }), [handleUndo, handleClear, annotations, externalAnnotations]);

    return (
      <div ref={containerRef} className={cn("relative h-full w-full", className)}>
        <canvas
          ref={canvasRef}
          className={cn(
            "absolute inset-0",
            editable ? "cursor-crosshair" : "pointer-events-none",
          )}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />

        {editable && (
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-ink-700/50 bg-ink-950/90 p-1.5 shadow-lg backdrop-blur-sm">
            {TOOLS.map(({ type, icon: Icon, label }) => (
              <button
                key={type}
                onClick={() => setTool(type)}
                title={label}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                  tool === type
                    ? "bg-signal/20 text-signal"
                    : "text-fg-muted hover:bg-ink-800 hover:text-fg",
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}

            <div className="mx-1 h-6 w-px bg-ink-700" />

            <div className="relative">
              <button
                onClick={() => {
                  setColorPickerOpen(!colorPickerOpen);
                  setWidthPickerOpen(false);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-ink-800"
                title="颜色"
              >
                <span
                  className="h-5 w-5 rounded-full border-2 border-white/20"
                  style={{ backgroundColor: color }}
                />
                <ChevronDown className="ml-0.5 h-3 w-3 text-fg-muted" />
              </button>
              {colorPickerOpen && (
                <div className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 flex-wrap gap-1 rounded-lg border border-ink-700/50 bg-ink-950/95 p-2 shadow-lg">
                  {ANNOTATION_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => {
                        setColor(c);
                        setColorPickerOpen(false);
                      }}
                      className={cn(
                        "h-6 w-6 rounded-full border-2 transition-transform hover:scale-110",
                        color === c ? "border-signal scale-110" : "border-white/20",
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => {
                  setWidthPickerOpen(!widthPickerOpen);
                  setColorPickerOpen(false);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-ink-800"
                title="粗细"
              >
                <span
                  className="rounded-full bg-fg"
                  style={{ width: lineWidth, height: lineWidth }}
                />
                <ChevronDown className="ml-0.5 h-3 w-3 text-fg-muted" />
              </button>
              {widthPickerOpen && (
                <div className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 flex-col gap-1 rounded-lg border border-ink-700/50 bg-ink-950/95 p-2 shadow-lg">
                  {ANNOTATION_LINE_WIDTHS.map((w) => (
                    <button
                      key={w}
                      onClick={() => {
                        setLineWidth(w);
                        setWidthPickerOpen(false);
                      }}
                      className={cn(
                        "flex h-6 w-16 items-center justify-center rounded transition-colors",
                        lineWidth === w ? "bg-signal/20" : "hover:bg-ink-800",
                      )}
                    >
                      <span className="rounded-full bg-fg" style={{ width: w, height: w }} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mx-1 h-6 w-px bg-ink-700" />

            <button
              onClick={handleUndo}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-ink-800 hover:text-fg"
              title="撤销"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              onClick={handleClear}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-ink-800 hover:text-red-400"
              title="清除全部"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    );
  },
);

export default AnnotationCanvas;
