import { describe, it, expect } from 'vitest';
import {
  HOLD_GAP_MS,
  INTERPOLATION_DELAY_MS,
  TICK_MS,
  InterpolationBuffer,
  ServerClock,
  angleDelta,
  hermite,
  samplePose,
  type PoseSample
} from '../../../../../src/features/games/sweepers/lib/net/interpolation';

const at = (t: number, x: number, rotY = 0): PoseSample => ({ t, x, y: 0, z: 0, rotY });

describe('cubic Hermite', () => {
  it('hits the endpoints', () => {
    expect(hermite(2, 5, 7, -3, 0)).toBe(2);
    expect(hermite(2, 5, 7, -3, 1)).toBe(7);
  });
  it('is exact for linear motion with matching tangents', () => {
    for (const s of [0.1, 0.25, 0.5, 0.9]) expect(hermite(0, 10, 10, 10, s)).toBeCloseTo(10 * s);
  });
  it('uses the tangents (ease-in with zero tangents)', () => {
    expect(hermite(0, 0, 1, 0, 0.5)).toBeCloseTo(0.5);
    expect(hermite(0, 0, 1, 0, 0.25)).toBeCloseTo(0.15625);
  });
});

describe('angleDelta', () => {
  it('takes the short way round', () => {
    expect(angleDelta(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(-0.2);
    expect(angleDelta(Math.PI * 2 - 0.1, 0.1)).toBeCloseTo(0.2);
    expect(angleDelta(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
  });
});

describe('samplePose', () => {
  const linear = [at(0, 0), at(100, 1), at(200, 2), at(300, 3)];
  it('reproduces constant velocity exactly', () => {
    expect(samplePose(linear, 150)?.x).toBeCloseTo(1.5);
    expect(samplePose(linear, 225)?.x).toBeCloseTo(2.25);
  });
  it('clamps outside the buffered range', () => {
    expect(samplePose(linear, -50)?.x).toBe(0);
    expect(samplePose(linear, 999)?.x).toBe(3);
    expect(samplePose([], 10)).toBeNull();
  });
  it('interpolates rotation across the 0/2π seam', () => {
    const rot = samplePose([at(0, 0, Math.PI * 2 - 0.1), at(100, 0, 0.1)], 50)?.rotY ?? NaN;
    expect(Math.min(rot, Math.PI * 2 - rot)).toBeLessThan(0.02);
  });
});

describe('InterpolationBuffer', () => {
  it('renders 100 ms in the past', () => {
    const buf = new InterpolationBuffer();
    [0, 83, 166, 250].forEach((t) => buf.push(at(t, t / 100)));
    expect(INTERPOLATION_DELAY_MS).toBe(100);
    expect(buf.sample(200)?.x).toBeCloseTo(1);
  });
  it('ignores out-of-order samples and replaces duplicates', () => {
    const buf = new InterpolationBuffer();
    buf.push(at(100, 1));
    buf.push(at(50, 99));
    buf.push(at(100, 2));
    expect(buf.size).toBe(1);
    expect(buf.sample(1000)?.x).toBe(2);
  });
  it('drops stale samples but keeps neighbours for tangents', () => {
    const buf = new InterpolationBuffer();
    for (let i = 0; i < 20; i++) buf.push(at(i * 100, i));
    buf.sample(1900);
    expect(buf.size).toBeLessThanOrEqual(5);
    expect(buf.sample(1900)?.x).toBeCloseTo(18);
  });
});

describe('InterpolationBuffer idle gaps', () => {
  it('holds the old pose until one tick before a move that follows an idle gap', () => {
    const buf = new InterpolationBuffer();
    buf.push(at(0, 0));
    buf.push(at(2000, 1)); // stood still for 2 s, then one tick of movement
    expect(buf.size).toBe(3);
    expect(2000 - 0).toBeGreaterThan(HOLD_GAP_MS);
    // mid-gap the player is still at the old spot instead of drifting towards x=1
    expect(buf.sample(1000 + INTERPOLATION_DELAY_MS)?.x).toBeCloseTo(0);
    expect(buf.sample(2000 - TICK_MS + INTERPOLATION_DELAY_MS)?.x).toBeCloseTo(0);
    expect(buf.sample(2000 + INTERPOLATION_DELAY_MS)?.x).toBeCloseTo(1);
  });
  it('adds no hold sample for regular ticks', () => {
    const buf = new InterpolationBuffer();
    buf.push(at(0, 0));
    buf.push(at(83, 1));
    expect(buf.size).toBe(2);
  });
});

describe('ServerClock', () => {
  it('estimates and smooths the offset, resets on jumps', () => {
    const clock = new ServerClock();
    clock.observe(10_000, 1_000);
    expect(clock.now(1_000)).toBe(10_000);
    clock.observe(10_100, 1_000); // +100 ms jitter
    expect(clock.now(1_000)).toBeCloseTo(10_010);
    clock.observe(90_000, 1_000);
    expect(clock.now(1_000)).toBe(90_000);
  });
});

describe('samplePose monotonicity (Fritsch–Carlson clamp)', () => {
  it('never overshoots when a fast segment is followed by a much slower one', () => {
    // sprint that nearly stops: slopes 0.072 then 0.001 m/ms (same sign, >3× apart)
    const samples = [at(0, 0), at(100, 7.2), at(200, 7.3), at(300, 7.4)];
    let prev = -Infinity;
    for (let t = 0; t <= 300; t += 5) {
      const x = samplePose(samples, t)?.x ?? Number.NaN;
      expect(x).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(x).toBeLessThanOrEqual(7.4 + 1e-9);
      if (t >= 100 && t <= 200) {
        expect(x).toBeGreaterThanOrEqual(7.2 - 1e-9);
        expect(x).toBeLessThanOrEqual(7.3 + 1e-9);
      }
      prev = x;
    }
  });
});
