import { describe, it, expect, vi } from 'vitest';
import { drawStroke, isShapeTool, parseStroke, toVirtual, toolPen, type StrokeCanvas } from '../../../../src/features/activities/whiteboard/lib/strokes';

const fakeCanvas = () => ({
  save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
  strokeRect: vi.fn(), ellipse: vi.fn(), lineCap: 'butt', lineJoin: 'miter', strokeStyle: '', lineWidth: 1
}) as unknown as StrokeCanvas & Record<string, ReturnType<typeof vi.fn>>;

const base = { x0: 10, y0: 20, x1: 30, y1: 60, color: '#f00', size: 4 };

describe('whiteboard strokes', () => {
  it('draws freehand segments as lines with the stroke pen', () => {
    const ctx = fakeCanvas();
    drawStroke(ctx, { ...base, type: 'line' });
    expect(ctx.moveTo).toHaveBeenCalledWith(10, 20);
    expect(ctx.lineTo).toHaveBeenCalledWith(30, 60);
    expect(ctx.strokeStyle).toBe('#f00');
    expect(ctx.lineWidth).toBe(4);
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('draws rectangles and ellipses from the drag box', () => {
    const ctx = fakeCanvas();
    drawStroke(ctx, { ...base, x0: 30, x1: 10, type: 'shape', shapeType: 'rect' });
    expect(ctx.strokeRect).toHaveBeenCalledWith(10, 20, 20, 40);
    drawStroke(ctx, { ...base, type: 'shape', shapeType: 'circle' });
    expect(ctx.ellipse).toHaveBeenCalledWith(20, 40, 10, 20, 0, 0, Math.PI * 2);
  });

  it('ignores a missing context', () => {
    expect(() => drawStroke(null, { ...base, type: 'line' })).not.toThrow();
  });

  it('maps tools to pens and shapes', () => {
    expect(toolPen('eraser', '#000', 8)).toEqual({ color: '#ffffff', size: 20 });
    expect(toolPen('brush', '#000', 8)).toEqual({ color: '#000', size: 8 });
    expect(isShapeTool('rect')).toBe(true);
    expect(isShapeTool('brush')).toBe(false);
  });

  it('maps screen coordinates to the 1600x1000 virtual canvas', () => {
    expect(toVirtual(150, 75, { left: 50, top: 25, width: 400, height: 250 })).toEqual({ x: 400, y: 200 });
  });

  it('parses only well-formed strokes', () => {
    expect(parseStroke({ ...base, type: 'line' })).toEqual({ ...base, type: 'line' });
    expect(parseStroke({ ...base, type: 'shape', shapeType: 'circle' })).toEqual({ ...base, type: 'shape', shapeType: 'circle' });
    expect(parseStroke({ ...base, type: 'shape', shapeType: 'star' })).toBeNull();
    expect(parseStroke({ ...base, x0: '1', type: 'line' })).toBeNull();
  });
});
