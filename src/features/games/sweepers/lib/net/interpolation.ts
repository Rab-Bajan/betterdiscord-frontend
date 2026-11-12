// Távoli játékosok simítása: 100 ms-os puffer, köbös Hermite-interpoláció (spec 139).

export interface PoseSample {
  /** Server time, ms. */
  readonly t: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotY: number;
}

export interface Pose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotY: number;
}

export const INTERPOLATION_DELAY_MS = 100;
const MAX_SAMPLES = 32;
/** Ticks only carry changed players: a gap longer than this means the player stood still. */
export const HOLD_GAP_MS = 250;
/** Server tick interval (12 Hz). */
export const TICK_MS = 1000 / 12;
const TAU = Math.PI * 2;

/**
 * Cubic Hermite between p0 and p1 with tangents m0/m1 given per unit of `s` (i.e. already
 * multiplied by the segment length). s ∈ [0, 1].
 */
export function hermite(p0: number, m0: number, p1: number, m1: number, s: number): number {
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * m1;
}

/** Signed shortest difference b - a for angles, in (-π, π]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

type Axis = 'x' | 'y' | 'z';

/**
 * Tangent (units per ms) at sample i: mean of the two adjacent segment slopes, or 0 where the
 * motion stops or turns (one slope is 0 / they disagree in sign), clamped to 3× the smaller
 * adjacent slope (Fritsch–Carlson). Keeps each segment monotone, so a player standing still
 * (e.g. the hold sample after an idle gap) or stopping mid-tick never overshoots.
 */
function velocity(samples: readonly PoseSample[], i: number, axis: Axis | 'rotY'): number {
  const cur = samples[i];
  if (!cur) return 0;
  const slope = (a: PoseSample | undefined, b: PoseSample | undefined): number | null => {
    if (!a || !b || b.t === a.t) return null;
    return (axis === 'rotY' ? angleDelta(a.rotY, b.rotY) : b[axis] - a[axis]) / (b.t - a.t);
  };
  const before = slope(samples[i - 1], cur);
  const after = slope(cur, samples[i + 1]);
  if (before === null) return after ?? 0;
  if (after === null) return before;
  if (before * after <= 0) return 0;
  const limit = 3 * Math.min(Math.abs(before), Math.abs(after));
  return Math.sign(before) * Math.min(Math.abs(before + after) / 2, limit);
}

/** Pose at time `t` from time-ordered samples; clamps to the first/last sample outside the range. */
export function samplePose(samples: readonly PoseSample[], t: number): Pose | null {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!first || !last) return null;
  if (t <= first.t) return first;
  if (t >= last.t) return last;
  let i = 0;
  while (i < samples.length - 2 && (samples[i + 1]?.t ?? Infinity) <= t) i++;
  const a = samples[i];
  const b = samples[i + 1];
  if (!a || !b) return last;
  const span = b.t - a.t;
  const s = span > 0 ? (t - a.t) / span : 1;
  const axis = (k: Axis): number => hermite(a[k], velocity(samples, i, k) * span, b[k], velocity(samples, i + 1, k) * span, s);
  const dRot = angleDelta(a.rotY, b.rotY);
  const rot = hermite(0, velocity(samples, i, 'rotY') * span, dRot, velocity(samples, i + 1, 'rotY') * span, s);
  return { x: axis('x'), y: axis('y'), z: axis('z'), rotY: (((a.rotY + rot) % TAU) + TAU) % TAU };
}

/** Per-player snapshot buffer rendered `INTERPOLATION_DELAY_MS` in the past. */
export class InterpolationBuffer {
  readonly #samples: PoseSample[] = [];

  push(sample: PoseSample): void {
    const last = this.#samples[this.#samples.length - 1];
    if (last && sample.t < last.t) return; // out-of-order
    if (last && sample.t === last.t) this.#samples.pop();
    else if (last && sample.t - last.t > HOLD_GAP_MS) {
      // the player stood still until one tick before this sample: hold the old pose there,
      // otherwise the Hermite segment would stretch the first step over the whole idle gap
      this.#samples.push({ ...last, t: sample.t - TICK_MS });
    }
    this.#samples.push(sample);
    if (this.#samples.length > MAX_SAMPLES) this.#samples.shift();
  }

  /** Pose at server time `serverNow - delay`; drops samples no longer needed. */
  sample(serverNow: number, delay = INTERPOLATION_DELAY_MS): Pose | null {
    const t = serverNow - delay;
    // keep one sample before t-1 neighbour for the tangent estimate
    while (this.#samples.length > 3 && (this.#samples[2]?.t ?? Infinity) < t) this.#samples.shift();
    return samplePose(this.#samples, t);
  }

  get size(): number {
    return this.#samples.length;
  }
}

/** Server clock estimate: offset = serverTime - localTime, smoothed. */
export class ServerClock {
  #offset: number | null = null;

  observe(serverTime: number, localNow: number): void {
    const sample = serverTime - localNow;
    // a sudden jump (server restart / long tab sleep) resets; otherwise smooth the jitter
    if (this.#offset === null || Math.abs(sample - this.#offset) > 1000) this.#offset = sample;
    else this.#offset += (sample - this.#offset) * 0.1;
  }

  now(localNow: number): number {
    return localNow + (this.#offset ?? 0);
  }
}
