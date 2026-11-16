// Kérdések a logisztikai tükörhöz (D.2/D.4/D.7): zsák alátámasztása, a dobás világa, a legközelebbi elakadás
// és felvehető zsák, a daru hatókörében álló zsákok. Tiszta kód.
import { GRID_RADIUS, hexDistance, worldToHex } from '../world/hexGrid';
import { BAG_TIERS, CRANE, STRUCT_TYPES, deckY, isBeltLike, isFoundation, isJunction } from './tables';
import { inZone } from './network';
import { footprint } from './placement';
import type { LogisticsStore } from './LogisticsStore';
import type { ThrowWorld } from './throwArc';
import type { BagRow } from '../../logisticsTypes';
import type { Collider } from '../../worldTypes';

export const STEP_H = 0.35;
const inGrid = (x: number, z: number): boolean => hexDistance(worldToHex(x, z), { q: 0, r: 0 }) <= GRID_RADIUS;
const rectDist = (r: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number): number =>
  Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));

/** D.2 support: terrain, a foundation top, a belt-like deck, or the top of a ground bag (½(r + r') apart). */
export function bagSupport(store: LogisticsStore, ground: (x: number, z: number) => number, x: number, z: number, selfR = BAG_TIERS[0]?.r ?? 0.28): number {
  let top = ground(x, z);
  for (const r of store.structures.values()) {
    if (!isFoundation(r.type) && !isBeltLike(r.type)) continue;
    const f = footprint(r.type, r.x, r.z, r.rot);
    if (x < f.x0 || x > f.x1 || z < f.z0 || z > f.z1) continue;
    top = Math.max(top, isFoundation(r.type) ? r.baseY : deckY(r.baseY, r.lvl));
  }
  for (const b of store.bags.values()) {
    const spec = BAG_TIERS[b.tier];
    if (b.st !== 0 || !spec) continue;
    if (Math.hypot(b.x - x, b.z - z) < (selfR + spec.r) / 2) top = Math.max(top, b.y + spec.h);
  }
  return top;
}

export interface ThrowEnv {
  readonly store: LogisticsStore;
  ground(x: number, z: number): number;
  isLocked(x: number, z: number): boolean;
  collidersAt(x: number, z: number): readonly Collider[];
}

/** The D.2 throw world over the client mirror (the preview; the server's arc wins). */
export function throwWorld(env: ThrowEnv): ThrowWorld {
  return {
    ground: (x, z) => env.ground(x, z),
    support: (x, z) => bagSupport(env.store, env.ground, x, z),
    blocked: (x, y, z) => !inGrid(x, z) || env.isLocked(x, z) || env.collidersAt(x, z).some((c) => c.h > STEP_H && y < env.ground(x, z) + c.h),
    hopperAt: (x, y, z) => {
      const g = env.ground(x, z);
      // buildable intake: y ≤ ground + 0.5; the landmark (a 4 m building): y ≤ ground + 4.5
      const zone = env.store.zones.find((zn) => inZone(zn, x, z) && y <= g + (zn.node === 0 ? 4.5 : 0.5));
      return zone ? zone.node : null;
    }
  };
}

/** Nearest jammed junction by distance to its footprint. */
export function nearestJam(store: LogisticsStore, x: number, z: number): { id: number; d: number } | null {
  let best: { id: number; d: number } | null = null;
  for (const r of store.structures.values()) {
    if (!r.jammed || !isJunction(r.type)) continue;
    const d = rectDist(footprint(r.type, r.x, r.z, r.rot), x, z);
    if (!best || d < best.d) best = { id: r.id, d };
  }
  return best;
}

/** A ground bag is on top of its stack when no other ground bag rests on it. */
function onTop(store: LogisticsStore, b: BagRow): boolean {
  for (const o of store.bags.values()) {
    const spec = BAG_TIERS[o.tier];
    if (o.id === b.id || o.st !== 0 || !spec || o.y <= b.y) continue;
    if (Math.hypot(o.x - b.x, o.z - b.z) < ((BAG_TIERS[b.tier]?.r ?? 0) + spec.r) / 2) return false;
  }
  return true;
}

/** D.4 pickup: tier ≤ 1, on the ground top of its stack or on a belt, ≤ 2 m horizontally, |y − ground| ≤ 2.2. */
export function nearestPickableBag(store: LogisticsStore, cargoS: ReadonlyMap<number, number>, pathAt: (node: number, s: number, route: number, input: number) => { x: number; y: number; z: number } | null, x: number, z: number, groundY: number): { id: number; d: number } | null {
  let best: { id: number; d: number } | null = null;
  const consider = (id: number, px: number, py: number, pz: number): void => {
    const d = Math.hypot(px - x, pz - z);
    if (d <= 2 && Math.abs(py - groundY) <= 2.2 && (!best || d < best.d)) best = { id, d };
  };
  for (const b of store.bags.values()) if (b.st === 0 && b.tier <= 1 && onTop(store, b)) consider(b.id, b.x, b.y, b.z);
  for (const c of store.cargo.values()) {
    if (c.kind !== 1 || c.sub > 1) continue;
    const row = store.structures.get(c.node);
    if (!row || !isBeltLike(row.type)) continue;
    const p = pathAt(c.node, cargoS.get(c.id) ?? c.s, c.route, c.input);
    if (p) consider(c.id, p.x, p.y, p.z);
  }
  return best;
}

/** Ground bags whose centre lies in the crane area, top of their stack (D.4 `crane`). */
export function craneBags(store: LogisticsStore): BagRow[] {
  const a = CRANE.area;
  return [...store.bags.values()].filter((b) => b.st === 0 && b.x >= a.x0 && b.x <= a.x1 && b.z >= a.z0 && b.z <= a.z1 && onTop(store, b));
}

/** Structure name (D.8 "Megépítve: {név}"). */
export const structName = (type: number): string => STRUCT_TYPES[type]?.name ?? '';
