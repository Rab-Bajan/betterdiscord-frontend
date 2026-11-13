// Söprési régiók és gyűjtési szabályok (C.3), a szerver másolata a kliens előrejelzéséhez: a kliens csak
// látványt jósol (cellák festése, tárgyak elrejtése), a szerver ackja és deltái felülírják. Tiszta kód.
import { CELL_M, DEBRIS_ORIGIN, MAX_LEVEL, cellIdxAt, cellKg, chunkIdAt, dustLevel, itemLitres, packCell, seedLevel } from './tables';
import { HARD_LEVELS, WIDTH_LEVELS, WORN_PERMILLE, isBroom, toolSpec, wears, type ToolSpec } from '../tools/catalog';
import type { ChunkStore } from './ChunkStore';
import type { CellDelta, DebrisItem, PersonalState } from '../../debrisTypes';
import type { SurfaceKind } from '../../worldTypes';

const DEG = Math.PI / 180;
export const ARC_HALF_ANGLE = 40 * DEG;
export const CONE_HALF_ANGLE = 15 * DEG;
export const CONE_MIN_M = 0.3;
/** Leaf blower: fraction of both levels moved per pulse. */
export const BLOWER_F = 0.35;
/** Rake magnet: ferrous items within this distance of the arc midpoint are collected too. */
export const MAGNET_M = 2.5;

/** dir(rotY) = (−sin rotY, −cos rotY): the three.js camera forward. */
export const forwardOf = (rotY: number): { x: number; z: number } => ({ x: -Math.sin(rotY), z: -Math.cos(rotY) });

/** |a − b| wrapped to [0, π]. */
export function angleBetween(a: number, b: number): number {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}

/** Arc region (35): |d − reach| ≤ w/2 and |angle(p − O) − angle(dir)| ≤ 40°. */
export function inArc(px: number, pz: number, ox: number, oz: number, rotY: number, reach: number, w: number): boolean {
  const dx = px - ox;
  const dz = pz - oz;
  const d = Math.hypot(dx, dz);
  if (Math.abs(d - reach) > w / 2) return false;
  if (d < 1e-9) return reach <= w / 2;
  const f = forwardOf(rotY);
  return angleBetween(Math.atan2(dz, dx), Math.atan2(f.z, f.x)) <= ARC_HALF_ANGLE;
}

/** Cone region (tools 4, 5): 0.3 ≤ d ≤ reach and |Δangle| ≤ 15° (`halfAngle` overrides, e.g. turbo ±20°). */
export function inCone(px: number, pz: number, ox: number, oz: number, rotY: number, reach: number, halfAngle = CONE_HALF_ANGLE): boolean {
  const dx = px - ox;
  const dz = pz - oz;
  const d = Math.hypot(dx, dz);
  if (d < CONE_MIN_M || d > reach) return false;
  const f = forwardOf(rotY);
  return angleBetween(Math.atan2(dz, dx), Math.atan2(f.z, f.x)) <= halfAngle;
}

export const arcArea = (reach: number, w: number): number => 1.396 * reach * w;
export const coneArea = (reach: number): number => 0.2618 * (reach * reach - 0.09);

/** w = table width × (1 + width upgrade, tools 0–3) × (0.5 below 20 % durability, tools 1–3). */
export function toolWidth(tool: number, personal: Pick<PersonalState, 'widthLvl' | 'dur'>): number {
  const spec = toolSpec(tool);
  if (!spec) return 0;
  const bonus = isBroom(tool) ? (WIDTH_LEVELS[personal.widthLvl]?.bonus ?? 0) : 0;
  const worn = wears(tool) && (personal.dur[tool - 1] ?? 1000) < WORN_PERMILLE ? 0.5 : 1;
  return spec.width * (1 + bonus) * worn;
}

/** The region's area A of one use. */
export function regionArea(spec: ToolSpec, w: number): number {
  return spec.region === 'cone' ? coneArea(spec.reach) : arcArea(spec.reach, w);
}

export interface CellRule {
  readonly tool: number;
  /** Swept fraction f (before eff). */
  readonly f: number;
  readonly hardLvl: number;
  readonly heavy: boolean;
  /** The seed nibble is swept too (false for the vacuum: backend planCells `seed: !vacuum`). */
  readonly seed: boolean;
}

/** One cell after a use: L' = floor(L · (1 − f · eff) + 1e-9) per class, as backend reducedLevel (dust eff 1, tool 1 0.6, heavy × 0.5 × hardness). */
export function sweptByte(byte: number, rule: CellRule): number {
  let dustEff = rule.tool === 1 ? 0.6 : 1;
  if (rule.heavy) dustEff *= 0.5 * (HARD_LEVELS[rule.hardLvl]?.eff ?? 1);
  const k = (level: number, eff: number): number => Math.max(0, Math.min(MAX_LEVEL, Math.floor(level * (1 - Math.min(1, rule.f * eff)) + 1e-9)));
  return packCell(k(dustLevel(byte), dustEff), rule.seed ? k(seedLevel(byte), 1) : seedLevel(byte));
}

/** f = min(1, speed · cadence · mods / A); mods: ×0.5 under stench, tool 2 ×1.15 on dry cells. */
export function sweepFraction(spec: ToolSpec, area: number, stench: boolean, dry: boolean): number {
  if (!(area > 0) || spec.speed <= 0) return 0;
  let mods = stench ? 0.5 : 1;
  if (spec.id === 2 && dry) mods *= 1.15;
  return Math.min(1, (spec.speed * spec.cadence * mods) / area);
}

export interface UseContext {
  readonly tool: number;
  readonly x: number;
  readonly z: number;
  readonly rotY: number;
  readonly personal: PersonalState;
  readonly stench: boolean;
  readonly drizzle: boolean;
  surfaceAt(x: number, z: number): SurfaceKind | null;
  /** Hex district of a point (null outside the grid). */
  districtAt(x: number, z: number): number | null;
  isLocked(x: number, z: number): boolean;
}

export interface UsePrediction {
  readonly cells: readonly CellDelta[];
  readonly items: readonly number[];
}

const NOTHING: UsePrediction = { cells: [], items: [] };

/** Whether the item is a class the tool collects (C.3 "Items"). Piles are never predicted. */
export function collects(tool: number, item: DebrisItem): boolean {
  if (item.kind === 'pile') return false;
  if (item.buried) return tool === 6 && item.kind === 'copper';
  switch (tool) {
    case 0:
      return item.kind === 'cabbage';
    case 1:
    case 2:
      return (item.kind === 'can' && !item.stuck) || item.kind === 'cabbage';
    case 3:
      return item.kind === 'can' || item.kind === 'iron' || item.kind === 'copper' || item.kind === 'cabbage';
    case 5:
      return (item.kind === 'can' && !item.stuck) || (item.kind === 'copper' && item.massKg <= 2);
    case 6:
      return item.kind === 'iron' || item.kind === 'copper';
    case 7:
      return item.kind === 'can' || item.kind === 'iron' || item.kind === 'copper' || item.kind === 'cauldron' || item.kind === 'catalyst' || item.kind === 'lenin';
    default:
      return false;
  }
}

/**
 * Predicts one primary use (LMB) of `ctx.tool` on the loaded mirror: the cells it changes and the
 * items it collects. Secondary uses (scoop, turbo, reverse blow, crush) and piles are not predicted.
 */
export function predictUse(store: ChunkStore, ctx: UseContext): UsePrediction {
  const spec = toolSpec(ctx.tool);
  if (!spec || ctx.isLocked(ctx.x, ctx.z)) return NOTHING;
  const p = ctx.personal;
  if (spec.id === 5 && (p.clogged || p.buf.kg >= p.caps.bufKg)) return NOTHING;
  if (spec.id === 4 && p.fuelMl <= 0) return NOTHING;
  const w = toolWidth(spec.id, p);
  const inRegion = (px: number, pz: number): boolean =>
    spec.region === 'cone' ? inCone(px, pz, ctx.x, ctx.z, ctx.rotY, spec.reach) : inArc(px, pz, ctx.x, ctx.z, ctx.rotY, spec.reach, w);
  const swept = spec.id === 4 || spec.speed > 0 ? predictCells(store, ctx, spec, w, inRegion) : { cells: [], kg: 0 };
  const items = spec.region === 'hand' ? handPick(store, ctx, spec) : collectItems(store, ctx, spec, w, inRegion, swept.kg);
  return { cells: swept.cells, items };
}

/**
 * The cells one use changes, nearest first, and the kg the buffer takes from them (backend `sweep`: the
 * vacuum stops at the first cell that does not fit; a broom fills the buffer and pushes the rest). Piles,
 * which the server takes before items, are not predicted.
 */
function predictCells(store: ChunkStore, ctx: UseContext, spec: ToolSpec, w: number, inRegion: (x: number, z: number) => boolean): { cells: CellDelta[]; kg: number } {
  const plans: { cell: CellDelta; d: number; kg: number }[] = [];
  const reach = spec.region === 'cone' ? spec.reach : spec.reach + w / 2;
  const area = regionArea(spec, w);
  const first = (v: number): number => DEBRIS_ORIGIN + (Math.floor((v - reach - DEBRIS_ORIGIN) / CELL_M) + 0.5) * CELL_M;
  for (let cx = first(ctx.x); cx <= ctx.x + reach; cx += CELL_M) {
    for (let cz = first(ctx.z); cz <= ctx.z + reach; cz += CELL_M) {
      if (!inRegion(cx, cz)) continue;
      const chunk = chunkIdAt(cx, cz);
      const bytes = chunk === null ? undefined : store.chunk(chunk);
      if (chunk === null || !bytes) continue;
      const idx = cellIdxAt(cx, cz);
      const byte = bytes[idx] ?? 0;
      if (byte === 0 || ctx.isLocked(cx, cz)) continue;
      const surface = ctx.surfaceAt(cx, cz);
      const district = ctx.districtAt(cx, cz);
      let next: number;
      if (spec.id === 4) {
        next = sweptByte(byte, { tool: 4, f: BLOWER_F, hardLvl: 0, heavy: false, seed: true });
      } else {
        const heavy = ctx.drizzle || district === 3 || surface === 'wet' || surface === 'mud' || surface === 'grease';
        const f = sweepFraction(spec, area, ctx.stench, surface === null && !ctx.drizzle);
        next = sweptByte(byte, { tool: spec.id, f, hardLvl: ctx.personal.hardLvl, heavy, seed: spec.id !== 5 });
      }
      if (next !== byte) plans.push({ cell: { chunk, idx, byte: next }, d: Math.hypot(cx - ctx.x, cz - ctx.z), kg: cellKg(byte, district) - cellKg(next, district) });
    }
  }
  plans.sort((a, b) => a.d - b.d || a.cell.chunk - b.cell.chunk || a.cell.idx - b.cell.idx);
  const cells: CellDelta[] = [];
  let free = freeKg(spec, ctx.personal);
  let kg = 0;
  for (const plan of plans) {
    if (spec.id === 5 && plan.kg > free + 1e-6) break;
    cells.push(plan.cell);
    const taken = Math.min(free, plan.kg);
    free -= taken;
    kg += taken;
  }
  return { cells, kg };
}

/** Free capacity of the tool buffer (the backpack for the hand), kg. */
function freeKg(spec: ToolSpec, p: PersonalState): number {
  if (spec.region === 'hand') return Math.max(0, p.caps.packKg - p.pack.kg);
  return spec.bufKg === null ? 0 : Math.max(0, p.caps.bufKg - p.buf.kg);
}

function collectItems(store: ChunkStore, ctx: UseContext, spec: ToolSpec, w: number, inRegion: (x: number, z: number) => boolean, cellsKg: number): number[] {
  if (spec.bufKg === null) return []; // the blower moves cans, it collects nothing
  let free = Math.max(0, freeKg(spec, ctx.personal) - cellsKg); // the cells fill the buffer first
  const f = forwardOf(ctx.rotY);
  const midX = ctx.x + f.x * spec.reach;
  const midZ = ctx.z + f.z * spec.reach;
  const radius = Math.max(spec.reach + w / 2, spec.id === 6 ? spec.reach + MAGNET_M : 0);
  const candidates: { id: number; d: number; mass: number }[] = [];
  for (const id of store.hash.near(ctx.x, ctx.z, radius)) {
    const item = store.item(id);
    if (!item || store.isHidden(id) || !collects(spec.id, item) || ctx.isLocked(item.x, item.z)) continue;
    const magnet = spec.id === 6 && item.kind === 'iron' && Math.hypot(item.x - midX, item.z - midZ) <= MAGNET_M;
    if (!magnet && !inRegion(item.x, item.z)) continue;
    candidates.push({ id, d: Math.hypot(item.x - ctx.x, item.z - ctx.z), mass: Math.max(item.massKg, 0) });
  }
  candidates.sort((a, b) => a.d - b.d || a.id - b.id);
  const out: number[] = [];
  for (const c of candidates) {
    if (c.mass > free) continue;
    free -= c.mass;
    out.push(c.id);
  }
  return out;
}

/** Hand (7): the nearest collectable item in the 80° arc within reach, if it fits the backpack (kg and L). */
function handPick(store: ChunkStore, ctx: UseContext, spec: ToolSpec): number[] {
  const free = freeKg(spec, ctx.personal);
  const freeL = Math.max(0, ctx.personal.caps.packL - ctx.personal.pack.l);
  const f = forwardOf(ctx.rotY);
  const ahead = Math.atan2(f.z, f.x);
  let best: { id: number; d: number } | null = null;
  for (const id of store.hash.near(ctx.x, ctx.z, spec.reach)) {
    const item = store.item(id);
    if (!item || store.isHidden(id) || !collects(7, item) || item.massKg > free || itemLitres(item.kind, item.massKg) > freeL || ctx.isLocked(item.x, item.z)) continue;
    const dx = item.x - ctx.x;
    const dz = item.z - ctx.z;
    const d = Math.hypot(dx, dz);
    if (d > spec.reach || (d > 1e-6 && angleBetween(Math.atan2(dz, dx), ahead) > ARC_HALF_ANGLE)) continue;
    if (!best || d < best.d || (d === best.d && id < best.id)) best = { id, d };
  }
  return best ? [best.id] : [];
}

/** Nearest buried copper in the loaded mirror within `radius` m of (x, z), metres (null: none). */
export function nearestBuriedCopper(store: ChunkStore, x: number, z: number, radius: number): number | null {
  let best: number | null = null;
  for (const id of store.hash.near(x, z, radius)) {
    const item = store.item(id);
    if (!item || !item.buried || item.kind !== 'copper') continue;
    const d = Math.hypot(item.x - x, item.z - z);
    if (d <= radius && (best === null || d < best)) best = d;
  }
  return best;
}

/** Detector click interval (43): 1.2 s at 6 m down to 0.1 s at 0.5 m; null beyond 6 m. */
export function detectorInterval(distance: number | null): number | null {
  if (distance === null || distance > 6) return null;
  const t = (Math.max(0.5, distance) - 0.5) / 5.5;
  return 0.1 + t * 1.1;
}
