export type AnnotationType = "pen" | "rect" | "arrow" | "text";

export interface BaseAnnotation {
  id: string;
  type: AnnotationType;
  color: string;
  lineWidth: number;
  timestamp?: number;
  authorId?: string;
}

export interface PenAnnotation extends BaseAnnotation {
  type: "pen";
  points: { x: number; y: number }[];
}

export interface RectAnnotation extends BaseAnnotation {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ArrowAnnotation extends BaseAnnotation {
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TextAnnotation extends BaseAnnotation {
  type: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export type Annotation =
  | PenAnnotation
  | RectAnnotation
  | ArrowAnnotation
  | TextAnnotation;

export type TimedAnnotationAction =
  | { type: "add"; annotation: Annotation; timestamp: number }
  | { type: "undo"; timestamp: number }
  | { type: "clear"; timestamp: number }
  | { type: "init"; annotations: Annotation[]; timestamp: number };

export type AnnotationAction =
  | { type: "add"; annotation: Annotation }
  | { type: "undo" }
  | { type: "clear" }
  | { type: "init"; annotations: Annotation[] };

export interface AnnotationHistory {
  actions: TimedAnnotationAction[];
  duration: number;
  startTime: number;
}

export const ANNOTATION_COLORS = [
  "#ff3b30",
  "#ff9500",
  "#ffcc00",
  "#34c759",
  "#007aff",
  "#af52de",
  "#ff2d55",
  "#ffffff",
  "#000000",
];

export const ANNOTATION_LINE_WIDTHS = [2, 4, 6, 8, 12];

export function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  ann: Annotation,
): void {
  ctx.save();
  ctx.strokeStyle = ann.color;
  ctx.fillStyle = ann.color;
  ctx.lineWidth = ann.lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (ann.type) {
    case "pen": {
      if (ann.points.length < 2) {
        ctx.beginPath();
        ctx.arc(ann.points[0].x, ann.points[0].y, ann.lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(ann.points[0].x, ann.points[0].y);
        for (let i = 1; i < ann.points.length; i++) {
          ctx.lineTo(ann.points[i].x, ann.points[i].y);
        }
        ctx.stroke();
      }
      break;
    }
    case "rect": {
      ctx.strokeRect(ann.x, ann.y, ann.width, ann.height);
      break;
    }
    case "arrow": {
      const angle = Math.atan2(ann.y2 - ann.y1, ann.x2 - ann.x1);
      const headLen = 15 + ann.lineWidth * 2;

      ctx.beginPath();
      ctx.moveTo(ann.x1, ann.y1);
      ctx.lineTo(ann.x2, ann.y2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(ann.x2, ann.y2);
      ctx.lineTo(
        ann.x2 - headLen * Math.cos(angle - Math.PI / 6),
        ann.y2 - headLen * Math.sin(angle - Math.PI / 6),
      );
      ctx.lineTo(
        ann.x2 - headLen * Math.cos(angle + Math.PI / 6),
        ann.y2 - headLen * Math.sin(angle + Math.PI / 6),
      );
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "text": {
      ctx.font = `${ann.fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText(ann.text, ann.x, ann.y);
      break;
    }
  }

  ctx.restore();
}

export function drawAllAnnotations(
  ctx: CanvasRenderingContext2D,
  annotations: Annotation[],
): void {
  annotations.forEach((ann) => drawAnnotation(ctx, ann));
}

export function stampAction(
  action: AnnotationAction,
  baseTime: number,
): TimedAnnotationAction {
  return { ...action, timestamp: Date.now() - baseTime } as TimedAnnotationAction;
}

export function replayAnnotations(
  actions: TimedAnnotationAction[],
  upToTime: number,
): Annotation[] {
  const result: Annotation[] = [];
  for (const a of actions) {
    if (a.timestamp > upToTime) break;
    switch (a.type) {
      case "add":
        result.push(a.annotation);
        break;
      case "undo":
        result.pop();
        break;
      case "clear":
        result.length = 0;
        break;
      case "init":
        result.length = 0;
        result.push(...a.annotations);
        break;
    }
  }
  return result;
}
