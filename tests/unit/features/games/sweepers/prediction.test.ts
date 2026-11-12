import { describe, it, expect } from 'vitest';
import {
  GRAVITY,
  JUMP_VELOCITY,
  SPRINT_SPEED,
  WALK_SPEED,
  WORLD_BOUND,
  stepBody,
  type BodyState,
  type MoveIntent
} from '../../../../../src/features/games/sweepers/lib/movement/MovementModel';
import { PredictionBuffer, SendRateLimiter } from '../../../../../src/features/games/sweepers/lib/net/Prediction';

const idle: MoveIntent = { forward: 0, strafe: 0, sprint: false, jump: false, yaw: 0 };
const body = (): BodyState => ({ x: 0, y: 0, z: 0, vy: 0, grounded: true });

describe('MovementModel', () => {
  it('walks at 4.5 m/s and sprints at 7.2 m/s along -Z at yaw 0', () => {
    const b = body();
    expect(stepBody(b, { ...idle, forward: 1 }, 1)).toBe('WALK');
    expect(b.z).toBeCloseTo(-WALK_SPEED);
    const s = body();
    expect(stepBody(s, { ...idle, forward: 1, sprint: true }, 1)).toBe('SPRINT');
    expect(s.z).toBeCloseTo(-SPRINT_SPEED);
    expect(WALK_SPEED).toBe(4.5);
    expect(SPRINT_SPEED).toBe(7.2);
  });
  it('normalises diagonals and respects yaw', () => {
    const b = body();
    stepBody(b, { ...idle, forward: 1, strafe: 1 }, 1);
    expect(Math.hypot(b.x, b.z)).toBeCloseTo(WALK_SPEED);
    const r = body();
    stepBody(r, { ...idle, forward: 1, yaw: Math.PI / 2 }, 1); // facing -X
    expect(r.x).toBeCloseTo(-WALK_SPEED);
    expect(r.z).toBeCloseTo(0);
  });
  it('does not sprint backwards and reports IDLE when still', () => {
    const b = body();
    expect(stepBody(b, { ...idle, forward: -1, sprint: true }, 1)).toBe('WALK');
    expect(stepBody(b, idle, 1)).toBe('IDLE');
  });
  it('jumps with v=4.8 under g=-14 and lands', () => {
    expect(JUMP_VELOCITY).toBe(4.8);
    expect(GRAVITY).toBe(-14);
    const b = body();
    stepBody(b, { ...idle, jump: true }, 1 / 120);
    expect(b.grounded).toBe(false);
    let peak = 0;
    let t = 1 / 120;
    while (!b.grounded && t < 2) {
      stepBody(b, idle, 1 / 120);
      peak = Math.max(peak, b.y);
      t += 1 / 120;
    }
    expect(peak).toBeCloseTo((JUMP_VELOCITY * JUMP_VELOCITY) / (2 * -GRAVITY), 1);
    expect(t).toBeCloseTo((2 * JUMP_VELOCITY) / -GRAVITY, 1);
    expect(b.y).toBe(0);
  });
  it('clamps to the world bounds', () => {
    const b = { ...body(), z: -WORLD_BOUND + 1 };
    stepBody(b, { ...idle, forward: 1, sprint: true }, 1);
    expect(b.z).toBe(-WORLD_BOUND);
  });
});

describe('PredictionBuffer', () => {
  it('increments seq and tracks pending inputs', () => {
    const p = new PredictionBuffer();
    p.reset({ x: 0, y: 0, z: 0 });
    expect(p.record({ x: 1, y: 0, z: 0 })).toBe(1);
    expect(p.record({ x: 2, y: 0, z: 0 })).toBe(2);
    expect(p.pendingCount).toBe(2);
    p.acknowledge(1);
    expect(p.pendingCount).toBe(1);
  });
  it('reconciles: server pose + unacknowledged displacements', () => {
    const p = new PredictionBuffer();
    p.reset({ x: 0, y: 0, z: 0 });
    p.record({ x: 1, y: 0, z: 0 }); // seq 1
    p.record({ x: 2, y: 0, z: 0 }); // seq 2
    p.record({ x: 3, y: 0, z: 1 }); // seq 3
    // server rejected seq 1's move and holds us at 0.5 after processing seq 1
    expect(p.reconcile({ x: 0.5, y: 0, z: 0 }, 1, { x: 3, y: 0, z: 1 })).toEqual({ x: 2.5, y: 0, z: 1 });
    expect(p.pendingCount).toBe(2);
    // after the correction, the next delta is measured from the reconciled pose
    p.record({ x: 3, y: 0, z: 1 });
    expect(p.reconcile({ x: 2.5, y: 0, z: 1 }, 3, { x: 3, y: 0, z: 1 })).toEqual({ x: 3, y: 0, z: 1 });
  });
  it('with everything acknowledged, snaps to the server pose', () => {
    const p = new PredictionBuffer();
    p.reset({ x: 0, y: 0, z: 0 });
    p.record({ x: 5, y: 0, z: 0 });
    expect(p.reconcile({ x: 4, y: 0, z: 0 }, 1, { x: 5, y: 0, z: 0 })).toEqual({ x: 4, y: 0, z: 0 });
    expect(p.pendingCount).toBe(0);
  });
  it('keeps the movement made since the last send', () => {
    const p = new PredictionBuffer();
    p.reset({ x: 0, y: 0, z: 0 });
    p.record({ x: 1, y: 0, z: 0 }); // seq 1, sent
    // the player kept walking to x=1.3 (not sent yet) when the correction for seq 1 arrives
    expect(p.reconcile({ x: 0.8, y: 0, z: 0 }, 1, { x: 1.3, y: 0, z: 0.2 })).toEqual({ x: 1.1, y: 0, z: 0.2 });
    // the next send carries that unsent step as its displacement
    p.record({ x: 1.1, y: 0, z: 0.2 });
    expect(p.reconcile({ x: 0.8, y: 0, z: 0 }, 1, { x: 1.1, y: 0, z: 0.2 }).x).toBeCloseTo(1.1);
  });
  it('folds overflowing history into the next entry instead of losing it', () => {
    const p = new PredictionBuffer();
    p.reset({ x: 0, y: 0, z: 0 });
    for (let i = 1; i <= 200; i++) p.record({ x: i, y: 0, z: 0 });
    expect(p.pendingCount).toBe(120);
    expect(p.reconcile({ x: 0, y: 0, z: 0 }, null, { x: 200, y: 0, z: 0 }).x).toBeCloseTo(200);
  });
  it('keeps seq monotonic across resets', () => {
    const p = new PredictionBuffer();
    p.record({ x: 0, y: 0, z: 0 });
    p.reset({ x: 9, y: 0, z: 9 });
    expect(p.pendingCount).toBe(0);
    expect(p.record({ x: 9, y: 0, z: 9 })).toBe(2);
  });
});

describe('SendRateLimiter', () => {
  it('allows at most one send per 50 ms (20 Hz)', () => {
    const l = new SendRateLimiter(50);
    expect(l.ready(0)).toBe(true);
    expect(l.ready(30)).toBe(false);
    expect(l.ready(50)).toBe(true);
    let sends = 0;
    for (let t = 100; t < 1100; t += 1000 / 144) if (l.ready(t)) sends += 1;
    expect(sends).toBeLessThanOrEqual(20);
  });
});
