// Közös rajztábla: vonások típusai, kirajzolásuk és a virtuális vászon koordinátái.
// Minden kliens ugyanarra a 1600×1000-es virtuális vászonra rajzol, a megjelenítés skáláz.
import { isRecord, isString } from '../../../../shared/lib/guards';

export const VIRTUAL_WIDTH = 1600;
export const VIRTUAL_HEIGHT = 1000;
export const ERASER_COLOR = '#ffffff';

export type WhiteboardTool = 'brush' | 'eraser' | 'line' | 'rect' | 'circle';
export type ShapeType = 'line' | 'rect' | 'circle';

export interface Point {
  x: number;
  y: number;
}

interface StrokeBase {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: string;
  size: number;
}

/** A freehand segment (`line`) or a finished/preview shape. */
export type Stroke = (StrokeBase & { type: 'line' }) | (StrokeBase & { type: 'shape'; shapeType: ShapeType });

/** The subset of CanvasRenderingContext2D that drawing needs. */
export type StrokeCanvas = Pick<CanvasRenderingContext2D,
  'save' | 'restore' | 'beginPath' | 'moveTo' | 'lineTo' | 'stroke' | 'strokeRect' | 'ellipse'
  | 'lineCap' | 'lineJoin' | 'strokeStyle' | 'lineWidth'>;

export function drawStroke(ctx: StrokeCanvas | null | undefined, stroke: Stroke): void {
  if (!ctx) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.beginPath();

  if (stroke.type === 'line' || stroke.shapeType === 'line') {
    ctx.moveTo(stroke.x0, stroke.y0);
    ctx.lineTo(stroke.x1, stroke.y1);
    ctx.stroke();
  } else if (stroke.shapeType === 'rect') {
    const x = Math.min(stroke.x0, stroke.x1);
    const y = Math.min(stroke.y0, stroke.y1);
    ctx.strokeRect(x, y, Math.abs(stroke.x1 - stroke.x0), Math.abs(stroke.y1 - stroke.y0));
  } else {
    const rx = Math.abs(stroke.x1 - stroke.x0) / 2;
    const ry = Math.abs(stroke.y1 - stroke.y0) / 2;
    const cx = Math.min(stroke.x0, stroke.x1) + rx;
    const cy = Math.min(stroke.y0, stroke.y1) + ry;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** The colour and width a tool draws with (the eraser paints white, 2.5× wider). */
export const toolPen = (tool: WhiteboardTool, color: string, size: number): { color: string; size: number } =>
  tool === 'eraser' ? { color: ERASER_COLOR, size: size * 2.5 } : { color, size };

export const isShapeTool = (tool: WhiteboardTool): tool is ShapeType => tool === 'line' || tool === 'rect' || tool === 'circle';

/** A pointer position on screen mapped to the virtual canvas behind `rect`. */
export const toVirtual = (clientX: number, clientY: number, rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>): Point => ({
  x: (clientX - rect.left) * (VIRTUAL_WIDTH / rect.width),
  y: (clientY - rect.top) * (VIRTUAL_HEIGHT / rect.height)
});

const NUMERIC_FIELDS = ['x0', 'y0', 'x1', 'y1', 'size'] as const;

export function parseStroke(value: unknown): Stroke | null {
  if (!isRecord(value) || !isString(value.color) || !NUMERIC_FIELDS.every((k) => typeof value[k] === 'number')) return null;
  const { x0, y0, x1, y1, size } = value as Record<(typeof NUMERIC_FIELDS)[number], number>;
  const base = { x0, y0, x1, y1, size, color: value.color };
  if (value.type === 'line') return { ...base, type: 'line' };
  if (value.type === 'shape' && (value.shapeType === 'line' || value.shapeType === 'rect' || value.shapeType === 'circle')) {
    return { ...base, type: 'shape', shapeType: value.shapeType };
  }
  return null;
}
