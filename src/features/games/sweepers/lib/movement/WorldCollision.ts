// Kliensoldali ütközés (spec 26/27), a szerver (betterdiscord sweepers/geometry.ts, motion.ts) tükre:
// 0,35 m sugarú játékos a layout ütköztetőivel (h ≤ 0,35 átléphető, pl. padka), zárt kerület tiltása
// (districtAt, a külterületen is), felület-súrlódás (a súlyosabb folt nyer), terep-magasság.
// Tiszta kód (three nélkül), egységtesztelt.
import { sampleHeight } from '../world/heightfield';
import { districtAt } from '../world/hexGrid';
import type { Collider, Heightfield, Surface, SurfaceKind, WorldLayout } from '../../worldTypes';

export const PLAYER_RADIUS = 0.35;
/** Colliders at most this tall are stepped over (curbs are 0.15). */
export const STEP_HEIGHT = 0.35;
/** Server height band top (backend motion.ts): y ≤ terrain + 1.2 (the client never goes below the terrain). */
export const ABOVE_GROUND_LIMIT = 1.2;
/** Spacing of the server's locked-district samples along a move (backend motion.ts OPEN_CHECK_STEP). */
export const OPEN_CHECK_STEP = 0.25;
/** Resolved positions keep this gap so float error never reads as overlap on the server. */
export const SKIN = 0.01;
const GRID_CELL = 8;
const PUSH_ITERATIONS = 4;
/** Long moves (low frame rate) are resolved in steps this long, so thin walls are never skipped. */
const SUB_STEP = 0.2;
/** Overlapping patches: the more severe surface wins (backend SURFACE_PRIORITY). */
const SURFACE_PRIORITY: readonly SurfaceKind[] = ['acid', 'grease', 'mud', 'wet'];

export interface SurfaceResponse {
  /** Friction coefficient μ (dry 1). */
  readonly mu: number;
  /** Multiplier on the walk / sprint speed. */
  readonly speed: number;
}

/** Plan table: dry 1.0, wet 0.85, mud 0.6 + 25 % walk slow, grease 0.35 (slides), acid: Phase C. */
export const SURFACE_RESPONSE: Readonly<Record<SurfaceKind | 'dry', SurfaceResponse>> = {
  dry: { mu: 1, speed: 1 },
  wet: { mu: 0.85, speed: 1 },
  mud: { mu: 0.6, speed: 0.75 },
  grease: { mu: 0.35, speed: 1 },
  acid: { mu: 1, speed: 1 }
};

/** The world as the movement model sees it. */
export interface MovementWorld {
  /** Terrain height at (x, z), without colliders (the server's height band is relative to it). */
  terrain(x: number, z: number): number;
  /** Height the feet stand on: terrain plus any step-over collider under (x, z). */
  support(x: number, z: number): number;
  /** Moves from (fromX, fromZ) towards (toX, toZ) without entering blocking colliders or locked hexes. */
  resolve(fromX: number, fromZ: number, toX: number, toZ: number): { x: number; z: number };
  surfaceAt(x: number, z: number): SurfaceKind | null;
}

interface IndexedCollider {
  readonly c: Collider;
  /** Bounding radius around (x, z). */
  readonly reach: number;
}

const key = (ix: number, iz: number): string => `${ix},${iz}`;
const reachOf = (c: Collider): number => (c.shape === 'cyl' ? c.r : Math.hypot(c.w, c.d) / 2);

function indexColliders(grid: Map<string, IndexedCollider[]>, colliders: readonly Collider[]): void {
  for (const c of colliders) {
    const entry = { c, reach: reachOf(c) };
    const x0 = Math.floor((c.x - entry.reach) / GRID_CELL);
    const x1 = Math.floor((c.x + entry.reach) / GRID_CELL);
    const z0 = Math.floor((c.z - entry.reach) / GRID_CELL);
    const z1 = Math.floor((c.z + entry.reach) / GRID_CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = key(ix, iz);
        const cell = grid.get(k);
        if (cell) cell.push(entry);
        else grid.set(k, [entry]);
      }
    }
  }
}

/** Signed overlap push of a circle (px, pz, r) out of `c`; null when they do not touch. */
export function pushOut(c: Collider, px: number, pz: number, r: number): { x: number; z: number } | null {
  const dx = px - c.x;
  const dz = pz - c.z;
  if (c.shape === 'cyl') {
    const dist = Math.hypot(dx, dz);
    const min = c.r + r;
    if (dist >= min) return null;
    if (dist < 1e-6) return { x: min, z: 0 };
    const k = (min - dist) / dist;
    return { x: dx * k, z: dz * k };
  }
  // local frame of a three.js rotation.y: lx = dx·cos − dz·sin, lz = dx·sin + dz·cos
  const cos = Math.cos(c.rotY);
  const sin = Math.sin(c.rotY);
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  const hx = c.w / 2;
  const hz = c.d / 2;
  let ox: number;
  let oz: number;
  if (Math.abs(lx) <= hx && Math.abs(lz) <= hz) {
    // centre inside: leave through the nearest face
    const px2 = hx - Math.abs(lx);
    const pz2 = hz - Math.abs(lz);
    if (px2 < pz2) {
      ox = Math.sign(lx || 1) * (px2 + r);
      oz = 0;
    } else {
      ox = 0;
      oz = Math.sign(lz || 1) * (pz2 + r);
    }
  } else {
    const cx = Math.max(-hx, Math.min(hx, lx));
    const cz = Math.max(-hz, Math.min(hz, lz));
    const ex = lx - cx;
    const ez = lz - cz;
    const dist = Math.hypot(ex, ez);
    if (dist >= r) return null;
    const k = (r - dist) / dist;
    ox = ex * k;
    oz = ez * k;
  }
  // back to world: x = lx·cos + lz·sin, z = −lx·sin + lz·cos
  return { x: ox * cos + oz * sin, z: -ox * sin + oz * cos };
}

/** True when the point lies under `c`'s footprint (used for step-over support). */
export function covers(c: Collider, px: number, pz: number): boolean {
  const dx = px - c.x;
  const dz = pz - c.z;
  if (c.shape === 'cyl') return dx * dx + dz * dz <= c.r * c.r;
  const cos = Math.cos(c.rotY);
  const sin = Math.sin(c.rotY);
  return Math.abs(dx * cos - dz * sin) <= c.w / 2 && Math.abs(dx * sin + dz * cos) <= c.d / 2;
}

export class WorldCollision implements MovementWorld {
  readonly #heightfield: Heightfield | null;
  readonly #grid = new Map<string, IndexedCollider[]>();
  readonly #extra = new Map<string, IndexedCollider[]>();
  readonly #surfaces: readonly Surface[];
  #unlocked = new Set<number>([0]);
  /** Last pose sent to the server: it checks the straight path from there to the next input. */
  #originX = NaN;
  #originZ = NaN;

  constructor(layout: WorldLayout | null) {
    this.#heightfield = layout?.heightfield ?? null;
    this.#surfaces = layout?.surfaces ?? [];
    indexColliders(this.#grid, layout?.colliders ?? []);
  }

  /**
   * Phase D structure colliders and the crane legs (D.2 combined index): swept together with the layout's.
   * Rebuilt whenever the structure colliders change.
   */
  setStructureColliders(colliders: readonly Collider[]): void {
    this.#extra.clear();
    indexColliders(this.#extra, colliders);
  }

  setUnlocked(ids: readonly number[]): void {
    this.#unlocked = new Set([0, ...ids]);
  }

  /**
   * The server validates each input's straight path from the previous accepted (= last sent) pose;
   * `resolve` keeps every predicted pose reachable that way. NaN = unknown (only frame steps checked).
   */
  setPathOrigin(x: number, z: number): void {
    this.#originX = x;
    this.#originZ = z;
  }

  get pathOrigin(): { readonly x: number; readonly z: number } | null {
    return Number.isNaN(this.#originX) ? null : { x: this.#originX, z: this.#originZ };
  }

  /** Backend `pathOpen`: every OPEN_CHECK_STEP sample of the straight path (end included) is unlocked. */
  pathOpen(fromX: number, fromZ: number, toX: number, toZ: number): boolean {
    const steps = Math.max(1, Math.ceil(Math.hypot(toX - fromX, toZ - fromZ) / OPEN_CHECK_STEP));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (this.isLocked(fromX + (toX - fromX) * t, fromZ + (toZ - fromZ) * t)) return false;
    }
    return true;
  }

  /** In a district that is not unlocked; the outskirts belong to the sector of their hex, as on the server. */
  isLocked(x: number, z: number): boolean {
    return !this.#unlocked.has(districtAt(x, z));
  }

  terrain(x: number, z: number): number {
    return this.#heightfield ? sampleHeight(this.#heightfield, x, z) : 0;
  }

  support(x: number, z: number): number {
    const ground = this.terrain(x, z);
    let top = 0;
    for (const { c } of this.#near(x, z)) {
      if (c.h > 0 && c.h <= STEP_HEIGHT && c.h > top && covers(c, x, z)) top = c.h;
    }
    return ground + top;
  }

  /** Colliders whose footprint covers the point (layout and structures; D.2 throw stops). */
  collidersAt(x: number, z: number): Collider[] {
    return this.#near(x, z).flatMap(({ c }) => (covers(c, x, z) ? [c] : []));
  }

  /** Colliders that block a player at (x, z) (debug / tests). */
  blockingAt(x: number, z: number): Collider[] {
    return this.#near(x, z).flatMap(({ c }) => (c.h > STEP_HEIGHT && pushOut(c, x, z, PLAYER_RADIUS) ? [c] : []));
  }

  resolve(fromX: number, fromZ: number, toX: number, toZ: number): { x: number; z: number } {
    const steps = Math.max(1, Math.ceil(Math.hypot(toX - fromX, toZ - fromZ) / SUB_STEP));
    let x = fromX;
    let z = fromZ;
    for (let i = 1; i <= steps; i++) {
      const next = this.#pushOutAll(x + (toX - fromX) / steps, z + (toZ - fromZ) / steps);
      x = next.x;
      z = next.z;
    }
    // the server refuses an input whose path from the last sent pose crosses a locked district (the
    // player stays); slide along the border instead
    if (this.isLocked(fromX, fromZ) || this.#reachable(fromX, fromZ, x, z)) return { x, z };
    if (this.#reachable(fromX, fromZ, x, fromZ) && this.blockingAt(x, fromZ).length === 0) return { x, z: fromZ };
    if (this.#reachable(fromX, fromZ, fromX, z) && this.blockingAt(fromX, z).length === 0) return { x: fromX, z };
    return { x: fromX, z: fromZ };
  }

  /** The frame step and the server path from the last sent pose to (x, z) both stay open. */
  #reachable(fromX: number, fromZ: number, x: number, z: number): boolean {
    if (!this.pathOpen(fromX, fromZ, x, z)) return false;
    return Number.isNaN(this.#originX) || this.pathOpen(this.#originX, this.#originZ, x, z);
  }

  #pushOutAll(px: number, pz: number): { x: number; z: number } {
    let x = px;
    let z = pz;
    for (let i = 0; i < PUSH_ITERATIONS; i++) {
      let moved = false;
      for (const { c } of this.#near(x, z)) {
        if (c.h <= STEP_HEIGHT) continue;
        const push = pushOut(c, x, z, PLAYER_RADIUS + SKIN);
        if (!push) continue;
        x += push.x;
        z += push.z;
        moved = true;
      }
      if (!moved) break;
    }
    return { x, z };
  }

  surfaceAt(x: number, z: number): SurfaceKind | null {
    let best: SurfaceKind | null = null;
    let bestRank = SURFACE_PRIORITY.length;
    for (const s of this.#surfaces) {
      const dx = x - s.x;
      const dz = z - s.z;
      if (dx * dx + dz * dz > s.r * s.r) continue;
      const rank = SURFACE_PRIORITY.indexOf(s.kind);
      if (rank < bestRank) {
        best = s.kind;
        bestRank = rank;
      }
    }
    return best;
  }

  #near(x: number, z: number): readonly IndexedCollider[] {
    const ix = Math.floor(x / GRID_CELL);
    const iz = Math.floor(z / GRID_CELL);
    // a collider is indexed in every cell its reach touches; the player radius may cross into a neighbour
    const fx = x / GRID_CELL - ix;
    const fz = z / GRID_CELL - iz;
    const nx = fx < 0.25 ? ix - 1 : fx > 0.75 ? ix + 1 : ix;
    const nz = fz < 0.25 ? iz - 1 : fz > 0.75 ? iz + 1 : iz;
    const keys = nx === ix && nz === iz ? [key(ix, iz)] : [key(ix, iz), key(nx, iz), key(ix, nz), key(nx, nz)];
    if (keys.length === 1 && !this.#extra.has(keys[0] ?? '')) return this.#grid.get(key(ix, iz)) ?? [];
    const seen = new Set<IndexedCollider>();
    for (const grid of [this.#grid, this.#extra]) for (const k of keys) for (const e of grid.get(k) ?? []) seen.add(e);
    return [...seen];
  }
}
