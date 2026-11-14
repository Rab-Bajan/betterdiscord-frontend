// Phase E térbeli szabályok kliensmásolata (E.2): a két mérleg, a 2 mp-es állás, a kenési pontok. Tiszta kód.
import { CRANE, STRUCT_TYPES, toWorld, wearsOut } from '../logistics/tables';
import { SERVICE_REACH_M, WEIGH_STILL_M, WEIGH_STILL_MS } from './tables';
import type { StructRow } from '../../logisticsTypes';

export interface ScaleZone {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly rotY: number;
}

/** Scale 0 = the weighbridge landmark, scale 1 = the 3 × 3 m crane pad (E.2). */
export function scaleZones(weighbridge: ScaleZone): readonly [ScaleZone, ScaleZone] {
  const pad = CRANE.targets[0];
  return [weighbridge, { x: pad.x, z: pad.z, w: CRANE.padM, d: CRANE.padM, rotY: 0 }];
}

/** (x, z) inside an oriented rect (local x → world (cos θ, −sin θ), local z → (sin θ, cos θ)). */
export function inZone(zone: ScaleZone, x: number, z: number): boolean {
  const dx = x - zone.x;
  const dz = z - zone.z;
  const c = Math.cos(zone.rotY);
  const s = Math.sin(zone.rotY);
  return Math.abs(dx * c - dz * s) <= zone.w / 2 + 1e-9 && Math.abs(dx * s + dz * c) <= zone.d / 2 + 1e-9;
}

export const scaleAt = (zones: readonly ScaleZone[], x: number, z: number): number | null => {
  const i = zones.findIndex((zone) => inZone(zone, x, z));
  return i < 0 ? null : i;
};

/** The client's copy of the stillness rule, for the prompt and the 2 s ring (the server weighs). */
export class ScaleWatch {
  #anchor: { x: number; z: number; at: number; scale: number } | null = null;
  #done = false;

  /** Per frame; the ring progress 0..1 while still on a scale with goods, else null. */
  update(scale: number | null, x: number, z: number, now: number, goods: boolean): number | null {
    const a = this.#anchor;
    if (scale === null || !a || a.scale !== scale || Math.hypot(x - a.x, z - a.z) > WEIGH_STILL_M) {
      this.#anchor = scale === null ? null : { x, z, at: now, scale };
      this.#done = false;
    }
    if (scale === null || !goods || this.#done || !this.#anchor) return null;
    return Math.min(1, (now - this.#anchor.at) / WEIGH_STILL_MS);
  }

  /** The server weighed this player: no ring until they leave or move. */
  weighed(): void {
    this.#done = true;
  }
}

/** The 4 service points of a machine (89): footprint corners, point i = (i & 1 ? +w/2 : −w/2, i & 2 ? +d/2 : −d/2) local. */
export function servicePoints(row: StructRow): { x: number; z: number }[] {
  const t = STRUCT_TYPES[row.type];
  if (!t) return [];
  return [0, 1, 2, 3].map((i) => {
    const o = toWorld(((i & 1) === 1 ? 1 : -1) * (t.w / 2), ((i & 2) === 2 ? 1 : -1) * (t.d / 2), row.rot);
    return { x: row.x + o.x, z: row.z + o.z };
  });
}

/** The nearest ungreased service point of a smoking machine within reach (E order). */
export function nearestGreasePoint(rows: Iterable<StructRow>, x: number, z: number): { id: number; point: number; d: number } | null {
  let best: { id: number; point: number; d: number } | null = null;
  for (const r of rows) {
    if (!wearsOut(r.type) || !r.smoking) continue;
    servicePoints(r).forEach((p, point) => {
      const d = Math.hypot(p.x - x, p.z - z);
      if (((r.grease >> point) & 1) === 0 && d <= SERVICE_REACH_M && (!best || d < best.d)) best = { id: r.id, point, d };
    });
  }
  return best;
}
