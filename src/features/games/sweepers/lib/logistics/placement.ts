// Építési szabályok kliensoldali másolata (D.3), csak az építő mód szellemének színéhez és az okhoz; a szerver
// ugyanezt ellenőrzi és mindig ő dönt. Plusz: a szellem rácsra illesztése egy szabad kimeneti portra. Tiszta kód.
import { GRID_RADIUS, hexDistance, worldToHex } from '../world/hexGrid';
import { BUILD_LIMIT_WHAT, type SweepersErrorKey } from '../../errors';
import { CRANE, CRANE_LEGS, DECK_M, LEVEL_M, ROOM_CAPS, STRUCT_TYPES, T_FENCE, T_HOPPER, T_PACKAGER, BAG_TIERS, footprintSize, isBeltLike, isFoundation, toWorld } from './tables';
import { outPorts, type LinkTarget, type WorldPort } from './network';
import type { BagRow, StructRow } from '../../logisticsTypes';
import type { Collider, WorldLayout } from '../../worldTypes';

export const BUILD_REACH_M = 10;
export const MAX_COORD = 256;
const SHRINK = 0.01;
const PLAYER_R = 0.35;
const STEP_H = 0.35;

export interface Rect {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

/** An oriented box (three.js rotY), as layout colliders and landmarks. */
interface Obb {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly rotY: number;
}

export interface PlaceRequest {
  readonly type: number;
  readonly x: number;
  readonly z: number;
  readonly rot: number;
  readonly lvl: number;
}

export type PlaceCheck =
  | { readonly ok: true; readonly baseY: number }
  | { readonly ok: false; readonly reason: SweepersErrorKey | 'invalid'; readonly what?: string };

export interface PlacementWorld {
  readonly layout: WorldLayout;
  ground(x: number, z: number): number;
  isLocked(x: number, z: number): boolean;
  readonly structures: Iterable<StructRow>;
  /** Bags on the ground (st 0). */
  readonly groundBags: Iterable<BagRow>;
  /** Every player's pose (self included). */
  readonly players: readonly { readonly x: number; readonly z: number }[];
  /** The builder's authoritative pose. */
  readonly pose: { readonly x: number; readonly z: number };
}

export function footprint(type: number, x: number, z: number, rot: number, pad = 0): Rect {
  const { w, d } = footprintSize(type, rot);
  return { x0: x - w / 2 - pad, x1: x + w / 2 + pad, z0: z - d / 2 - pad, z1: z + d / 2 + pad };
}

const rectOverlap = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
const rectObb = (r: Rect): Obb => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, w: r.x1 - r.x0, d: r.z1 - r.z0, rotY: 0 });

/** Separating-axis test of two oriented boxes (strict: touching is no overlap). */
function obbOverlap(a: Obb, b: Obb): boolean {
  // local x → world (cos θ, −sin θ), local z → world (sin θ, cos θ)
  const half = (o: Obb, ax: number, az: number): number =>
    (Math.abs(Math.cos(o.rotY) * ax - Math.sin(o.rotY) * az) * o.w) / 2 + (Math.abs(Math.sin(o.rotY) * ax + Math.cos(o.rotY) * az) * o.d) / 2;
  const axes = [a.rotY, b.rotY].flatMap((t) => [[Math.cos(t), -Math.sin(t)], [Math.sin(t), Math.cos(t)]]);
  for (const [ax = 0, az = 0] of axes) {
    const dist = Math.abs((b.x - a.x) * ax + (b.z - a.z) * az);
    if (dist >= half(a, ax, az) + half(b, ax, az) - 1e-9) return false;
  }
  return true;
}

const pointRectDist = (r: Rect, x: number, z: number): number => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
const circleOverlap = (r: Rect, x: number, z: number, radius: number): boolean => pointRectDist(r, x, z) < radius;

function colliderOverlap(r: Rect, c: Collider): boolean {
  return c.shape === 'cyl' ? circleOverlap(r, c.x, c.z, c.r) : obbOverlap(rectObb(r), c);
}

/** Samples along one axis as the server takes them (backend shapes.ts axisSamples): both edges 0.01 m inside, plus the 0.5 m lattice strictly inside. */
function axisSamples(min: number, max: number): number[] {
  const out = [min + 0.01];
  for (let k = Math.floor(min * 2) + 1; k / 2 < max; k++) if (k / 2 > min) out.push(k / 2);
  out.push(max - 0.01);
  return [...new Set(out)].filter((v) => v >= min && v <= max).sort((a, b) => a - b);
}

/** The D.3 rule 3 and 7 footprint samples, z-major then x ascending. */
export function lattice(r: Rect): { x: number; z: number }[] {
  return axisSamples(r.z0, r.z1).flatMap((z) => axisSamples(r.x0, r.x1).map((x) => ({ x, z })));
}

const ceil10 = (v: number): number => Math.ceil(v * 10 - 1e-9) / 10;
const inside = (r: Rect, x: number, z: number): boolean => x >= r.x0 - 1e-9 && x <= r.x1 + 1e-9 && z >= r.z0 - 1e-9 && z <= r.z1 + 1e-9;
const rowRect = (s: StructRow): Rect => footprint(s.type, s.x, s.z, s.rot);

/** Two rects share an edge segment of positive length (foundation tiling). */
function edgeAdjacent(a: Rect, b: Rect): boolean {
  const zOverlap = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 1e-9;
  const xOverlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1e-9;
  return (zOverlap && (Math.abs(a.x1 - b.x0) < 1e-9 || Math.abs(b.x1 - a.x0) < 1e-9)) || (xOverlap && (Math.abs(a.z1 - b.z0) < 1e-9 || Math.abs(b.z1 - a.z0) < 1e-9));
}

/** Collider height of a placed type (D.1): foundation top − ground(centre), deck − base, or fixed. */
export function colliderHeight(type: number, lvl: number, baseY: number, groundAtCentre: number): number {
  const spec = STRUCT_TYPES[type];
  if (!spec || spec.collider === null) return 0;
  if (spec.collider === 'found') return baseY - groundAtCentre;
  if (spec.collider === 'deck') return DECK_M + LEVEL_M * (lvl + Math.max(0, ...spec.outs.map((p) => p.dl)));
  return spec.collider;
}

/** Structure colliders (D.1) plus the crane legs: the movement index's Phase D part (D.2). */
export function structureColliders(rows: Iterable<StructRow>, ground: (x: number, z: number) => number): Collider[] {
  const out: Collider[] = [...CRANE_LEGS];
  for (const r of rows) {
    const h = colliderHeight(r.type, r.lvl, r.baseY, ground(r.x, r.z));
    if (h <= 0) continue;
    const { w, d } = footprintSize(r.type, r.rot);
    out.push({ shape: 'box', x: r.x, z: r.z, w, d, h, rotY: 0 });
  }
  return out;
}

/** Foundation top (for a foundation `base` is its top). */
const topOf = (s: StructRow): number => s.baseY;

function limit(req: PlaceRequest, rows: readonly StructRow[]): keyof typeof BUILD_LIMIT_WHAT | null {
  const count = (pred: (t: number) => boolean): number => rows.filter((r) => pred(r.type)).length + (pred(req.type) ? 1 : 0);
  if (rows.length + 1 > ROOM_CAPS.structures) return 'structures';
  if (isFoundation(req.type) && count(isFoundation) > ROOM_CAPS.foundations) return 'foundations';
  if (isBeltLike(req.type)) {
    const m = rows.reduce((sum, r) => sum + (isBeltLike(r.type) ? STRUCT_TYPES[r.type]?.len ?? 0 : 0), 0) + (STRUCT_TYPES[req.type]?.len ?? 0);
    if (m > ROOM_CAPS.beltM + 1e-9) return 'beltM';
  }
  if ((req.type === 9 || req.type === 10) && count((t) => t === 9 || t === 10) > ROOM_CAPS.junctions) return 'junctions';
  if (req.type === T_HOPPER && count((t) => t === T_HOPPER) > ROOM_CAPS.hoppers) return 'hoppers';
  if (req.type === T_PACKAGER && count((t) => t === T_PACKAGER) > ROOM_CAPS.packagers) return 'packagers';
  if (req.type === T_FENCE && count((t) => t === T_FENCE) > ROOM_CAPS.fences) return 'fences';
  return null;
}

/** The D.3 rules 1–7 in order (the client copy; the server decides). */
export function checkPlacement(world: PlacementWorld, req: PlaceRequest): PlaceCheck {
  const spec = STRUCT_TYPES[req.type];
  // 1. snap and a level valid for the type
  if (!spec || !Number.isInteger(req.x * 2) || !Number.isInteger(req.z * 2) || Math.abs(req.x) > MAX_COORD || Math.abs(req.z) > MAX_COORD
    || !Number.isInteger(req.rot) || req.rot < 0 || req.rot > 3 || !Number.isInteger(req.lvl) || req.lvl < spec.lvlMin || req.lvl > spec.lvlMax) return { ok: false, reason: 'invalid' };
  // 2. reach
  if (Math.hypot(req.x - world.pose.x, req.z - world.pose.z) > BUILD_REACH_M) return { ok: false, reason: 'tooFar' };
  const rect = footprint(req.type, req.x, req.z, req.rot);
  const samples = lattice(rect);
  // 3. grid, then districts
  if (samples.some((s) => hexDistance(worldToHex(s.x, s.z), { q: 0, r: 0 }) > GRID_RADIUS)) return { ok: false, reason: 'outOfGrid' };
  if (samples.some((s) => world.isLocked(s.x, s.z))) return { ok: false, reason: 'lockedDistrict' };
  // 4. reserved: weighbridge pad + 1 m, the landmark hopper, the crane area, the console within 1 m
  const lm = world.layout.landmarks;
  const area: Rect = { x0: CRANE.area.x0, x1: CRANE.area.x1, z0: CRANE.area.z0, z1: CRANE.area.z1 };
  if (obbOverlap(rectObb(rect), { ...lm.weighbridge, w: lm.weighbridge.w + 2, d: lm.weighbridge.d + 2 }) || obbOverlap(rectObb(rect), lm.hopper)
    || rectOverlap(rect, area) || pointRectDist(rect, CRANE.console.x, CRANE.console.z) < 1) return { ok: false, reason: 'reserved' };
  // 5. limits
  const rows = [...world.structures];
  const capped = limit(req, rows);
  if (capped) return { ok: false, reason: 'buildLimit', what: BUILD_LIMIT_WHAT[capped] };
  // 7's base first: rule 6 needs the collider height
  const grounds = samples.map((s) => world.ground(s.x, s.z));
  const gMax = Math.max(...grounds);
  const gMin = Math.min(...grounds);
  const foundations = rows.filter((r) => isFoundation(r.type));
  let base: number | null;
  if (isFoundation(req.type)) {
    let top = ceil10(gMax + 0.2);
    const near = foundations.filter((f) => edgeAdjacent(rect, rowRect(f)) && Math.abs(topOf(f) - top) <= 0.5).sort((a, b) => a.id - b.id)[0];
    if (near) top = topOf(near);
    base = gMax - gMin <= 0.8 + 1e-9 ? top : null;
  } else {
    const tops = samples.map((s) => foundations.find((f) => inside(rowRect(f), s.x, s.z)));
    const on = tops.filter((f): f is StructRow => f !== undefined);
    const first = on[0];
    if (!first) base = gMax - gMin <= 0.3 + 1e-9 ? gMax : null;
    else base = on.length === samples.length && on.every((f) => Math.abs(topOf(f) - topOf(first)) < 1e-6) ? topOf(first) : null;
  }
  // 6. collision against the shrunk footprint
  const shrunk = footprint(req.type, req.x, req.z, req.rot, -SHRINK);
  if (world.layout.colliders.some((c) => c.h > STEP_H && colliderOverlap(shrunk, c))) return { ok: false, reason: 'blocked' };
  if (CRANE_LEGS.some((c) => colliderOverlap(shrunk, c))) return { ok: false, reason: 'blocked' };
  if (rows.some((r) => rectOverlap(shrunk, rowRect(r)) && (isFoundation(req.type) || !isFoundation(r.type)))) return { ok: false, reason: 'blocked' };
  for (const b of world.groundBags) if (circleOverlap(shrunk, b.x, b.z, BAG_TIERS[b.tier]?.r ?? 0.3)) return { ok: false, reason: 'blocked' };
  const h = colliderHeight(req.type, req.lvl, base ?? gMax, world.ground(req.x, req.z));
  if ((req.type === T_FENCE || req.type === T_PACKAGER || h > STEP_H) && world.players.some((p) => circleOverlap(shrunk, p.x, p.z, PLAYER_R))) return { ok: false, reason: 'blocked' };
  // 7. base height
  return base === null ? { ok: false, reason: 'notFlat' } : { ok: true, baseY: base };
}

/** Ghost text for a refusal (D.8, with `{what}`). */
export function refusalText(check: PlaceCheck, errors: Readonly<Record<SweepersErrorKey, string>>): string | null {
  if (check.ok) return null;
  if (check.reason === 'invalid') return 'Ide nem lehet építeni.';
  return errors[check.reason].replace('{what}', check.what ?? '');
}

/** A free out port: an open end of a node (its link target is null). */
export function freeOutPorts(rows: Iterable<StructRow>, links: ReadonlyMap<string, LinkTarget>): (WorldPort & { readonly lvl: number; readonly baseY: number })[] {
  const out: (WorldPort & { lvl: number; baseY: number })[] = [];
  for (const r of rows) {
    const spec = STRUCT_TYPES[r.type];
    outPorts(r).forEach((port, i) => {
      if (links.get(`${r.id}:${i}`) === null) out.push({ ...port, lvl: r.lvl + (spec?.outs[i]?.dl ?? 0), baseY: r.baseY });
    });
  }
  return out;
}

export interface Ghost extends PlaceRequest {
  /** Snapped onto a free port. */
  readonly snapped: boolean;
}

/**
 * The ghost at a hovered point (D.7): snapped to the 0.5 m lattice, or onto a free out port within
 * `radius` (its heading sets the rotation, its deck the level) when the type has an input.
 */
export function ghostAt(type: number, rot: number, lvl: number, hover: { x: number; z: number }, free: readonly (WorldPort & { readonly lvl: number })[], radius = 0.75): Ghost {
  const snap = (v: number): number => Math.round(v * 2) / 2;
  const spec = STRUCT_TYPES[type];
  const input = spec?.ins[0];
  if (spec && input) {
    let best: (WorldPort & { lvl: number }) | null = null;
    let bestD = radius;
    for (const p of free) {
      const d = Math.hypot(p.x - hover.x, p.z - hover.z);
      if (d <= bestD) {
        best = p;
        bestD = d;
      }
    }
    if (best && best.lvl >= spec.lvlMin && best.lvl <= spec.lvlMax) {
      for (let r = 0; r < 4; r++) {
        const h = toWorld(input.hx, input.hz, r);
        if (Math.abs(h.x - best.hx) > 1e-6 || Math.abs(h.z - best.hz) > 1e-6) continue;
        const o = toWorld(input.x, input.z, r);
        return { type, rot: r, lvl: best.lvl, x: snap(best.x - o.x), z: snap(best.z - o.z), snapped: true };
      }
    }
  }
  const lo = spec?.lvlMin ?? 0;
  const hi = spec?.lvlMax ?? 0;
  return { type, rot, lvl: Math.min(hi, Math.max(lo, lvl)), x: snap(hover.x), z: snap(hover.z), snapped: false };
}
