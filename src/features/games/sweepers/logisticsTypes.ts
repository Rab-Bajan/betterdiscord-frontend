// MiskolcSweepers Phase D protokoll (D.4/D.5): zsák-, épületelem-, szalagrakomány-, daru- és telemetria-őrzők.
// Minden bejövő payload `unknown`; a hibás sor egyenként esik ki, a foglalás korlátos.
import { isRecord, isString } from '../../../shared/lib/guards';
import { BAG_TIERS, STRUCT_TYPES, dgToKg } from './lib/logistics/tables';
import type { Refusal } from './debrisTypes';

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isInt = (value: unknown): value is number => Number.isInteger(value);
const intIn = (value: unknown, lo: number, hi: number): value is number => isInt(value) && value >= lo && value <= hi;
const isId = (value: unknown): value is number => intIn(value, 1, 65535);
const isNodeId = (value: unknown): value is number => intIn(value, 0, 65535);

/** Allocation caps (the room caps are 256 structures, 300 bags, 150 lots; slack for a burst). */
const MAX_ROWS = 2048;

/** `StructRow = [id, type, xCm, zCm, baseYCm, rot, lvl, flags]` (flags: bit 0 jammed, 1 busy, 2 smoking, 3–6 grease mask; E.3). */
export interface StructRow {
  readonly id: number;
  readonly type: number;
  readonly x: number;
  readonly z: number;
  readonly baseY: number;
  readonly rot: number;
  readonly lvl: number;
  readonly jammed: boolean;
  readonly busy: boolean;
  /** Stripper / baler past its maintenance interval (E.3 bit 2). */
  readonly smoking: boolean;
  /** Service points greased so far, bits 0..3 (E.3 bits 3–6). */
  readonly grease: number;
}

/** `BagRow = [id, tier, tint, st, xCm, yCm, zCm, rot8, kgDg]`; st 0 ground, 1 carried, 2 crane. */
export interface BagRow {
  readonly id: number;
  readonly tier: number;
  readonly tint: number;
  readonly st: 0 | 1 | 2;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Yaw, radians. */
  readonly rot: number;
  readonly kg: number;
}

/** `CargoRow = [id, kind, sub, tint, node, sMm, route, mv, kgDg]`; kind 0 lot (sub = group), 1 bag (sub = tier). */
export interface CargoRow {
  readonly id: number;
  readonly kind: 0 | 1;
  readonly sub: number;
  readonly tint: number;
  readonly node: number;
  /** Metres along the node's path. */
  readonly s: number;
  readonly route: number;
  readonly mv: boolean;
  readonly kg: number;
}

/** `CraneJob = { bag, fx, fz, tx, tz, t0, durMs }` (metres, server ms). */
export interface CraneJob {
  readonly bag: number;
  readonly fx: number;
  readonly fz: number;
  readonly tx: number;
  readonly tz: number;
  readonly t0: number;
  readonly durMs: number;
}

/** `[id, fxCm, fyCm, fzCm, txCm, tyCm, tzCm, apexYCm, durMs]`: a throw / drop / fall ending at that id's row. */
export interface ArcRow {
  readonly id: number;
  readonly fx: number;
  readonly fy: number;
  readonly fz: number;
  readonly tx: number;
  readonly ty: number;
  readonly tz: number;
  readonly apexY: number;
  readonly durMs: number;
}

/** Buffer fill of a hopper / packager node, kg. */
export interface NodeFill {
  readonly node: number;
  readonly kg: number;
}

export interface LogisticsInit {
  readonly beltMps: number;
  readonly structures: readonly StructRow[];
  readonly bags: readonly BagRow[];
  readonly cargo: readonly CargoRow[];
  readonly hoppers: readonly NodeFill[];
  readonly packagers: readonly NodeFill[];
  readonly hook: { readonly x: number; readonly z: number };
  readonly job: CraneJob | null;
}

export interface LogisticsUpdate {
  readonly t: number;
  readonly s: readonly StructRow[];
  readonly sdel: readonly number[];
  readonly b: readonly BagRow[];
  readonly c: readonly CargoRow[];
  readonly del: readonly number[];
  readonly arcs: readonly ArcRow[];
  readonly burst: readonly { readonly id: number; readonly x: number; readonly z: number }[];
  /** undefined: unchanged; null: the crane went idle. */
  readonly crane: CraneJob | null | undefined;
  readonly hop: readonly NodeFill[];
  readonly pk: readonly NodeFill[];
}

export interface Telemetry {
  readonly kgMin: number;
  readonly loadPct: number;
  readonly kW: number;
  readonly ftHour: number;
  readonly beltM: number;
  readonly jams: number;
}

const tuple = (value: unknown, n: number): unknown[] | null => (Array.isArray(value) && value.length >= n ? value : null);

export function decodeStructRow(value: unknown): StructRow | null {
  const a = tuple(value, 8);
  if (!a) return null;
  const [id, type, xCm, zCm, baseYCm, rot, lvl, flags] = a;
  if (!isId(id) || !intIn(type, 0, STRUCT_TYPES.length - 1) || !isInt(xCm) || !isInt(zCm) || !isInt(baseYCm) || !intIn(rot, 0, 3) || !isInt(lvl) || !isInt(flags)) return null;
  const spec = STRUCT_TYPES[type];
  if (!spec || lvl < spec.lvlMin || lvl > spec.lvlMax) return null;
  return { id, type, x: xCm / 100, z: zCm / 100, baseY: baseYCm / 100, rot, lvl, jammed: (flags & 1) !== 0, busy: (flags & 2) !== 0, smoking: (flags & 4) !== 0, grease: (flags >> 3) & 15 };
}

export function decodeBagRow(value: unknown): BagRow | null {
  const a = tuple(value, 9);
  if (!a) return null;
  const [id, tier, tint, st, xCm, yCm, zCm, rot8, kgDg] = a;
  if (!isId(id) || !intIn(tier, 0, BAG_TIERS.length - 1) || !intIn(tint, 0, 3) || !(st === 0 || st === 1 || st === 2)) return null;
  if (!isInt(xCm) || !isInt(yCm) || !isInt(zCm) || !intIn(rot8, 0, 255) || !intIn(kgDg, 0, 1e8)) return null;
  return { id, tier, tint, st, x: xCm / 100, y: yCm / 100, z: zCm / 100, rot: (rot8 / 256) * Math.PI * 2, kg: dgToKg(kgDg) };
}

export function decodeCargoRow(value: unknown): CargoRow | null {
  const a = tuple(value, 9);
  if (!a) return null;
  const [id, kind, sub, tint, node, sMm, route, mv, kgDg] = a;
  if (!isId(id) || !(kind === 0 || kind === 1) || !intIn(sub, 0, kind === 0 ? 2 : BAG_TIERS.length - 1) || !intIn(tint, 0, 3) || !isNodeId(node)) return null;
  if (!intIn(sMm, 0, 1e6) || !intIn(route, 0, 2) || !(mv === 0 || mv === 1) || !intIn(kgDg, 0, 1e8)) return null;
  return { id, kind, sub, tint, node, s: sMm / 1000, route, mv: mv === 1, kg: dgToKg(kgDg) };
}

export function parseCraneJob(value: unknown): CraneJob | null {
  if (!isRecord(value)) return null;
  const { bag, fx, fz, tx, tz, t0, durMs } = value;
  if (!isId(bag) || !isInt(fx) || !isInt(fz) || !isInt(tx) || !isInt(tz) || !isFiniteNumber(t0) || !isFiniteNumber(durMs) || durMs < 0) return null;
  return { bag, fx: fx / 100, fz: fz / 100, tx: tx / 100, tz: tz / 100, t0, durMs };
}

function decodeArc(value: unknown): ArcRow | null {
  const a = tuple(value, 9);
  if (!a) return null;
  const [id, fx, fy, fz, tx, ty, tz, apexY, durMs] = a;
  if (!isId(id) || !isInt(fx) || !isInt(fy) || !isInt(fz) || !isInt(tx) || !isInt(ty) || !isInt(tz) || !isInt(apexY) || !intIn(durMs, 0, 60_000)) return null;
  return { id, fx: fx / 100, fy: fy / 100, fz: fz / 100, tx: tx / 100, ty: ty / 100, tz: tz / 100, apexY: apexY / 100, durMs };
}

function decodeBurst(value: unknown): { id: number; x: number; z: number } | null {
  const a = tuple(value, 3);
  if (!a) return null;
  const [id, xCm, zCm] = a;
  return isId(id) && isInt(xCm) && isInt(zCm) ? { id, x: xCm / 100, z: zCm / 100 } : null;
}

function decodeFill(value: unknown): NodeFill | null {
  const a = tuple(value, 2);
  if (!a) return null;
  const [node, kgDg] = a;
  return isNodeId(node) && intIn(kgDg, 0, 1e9) ? { node, kg: dgToKg(kgDg) } : null;
}

const listOf = <T>(value: unknown, parse: (entry: unknown) => T | null): T[] =>
  Array.isArray(value) ? value.slice(0, MAX_ROWS).flatMap((entry: unknown) => parse(entry) ?? []) : [];
const idsOf = (value: unknown, ok: (v: unknown) => v is number): number[] => (Array.isArray(value) ? value.slice(0, MAX_ROWS).filter(ok) : []);

/** `init_state.logistics` (v 1); null on a server without logistics or another version. */
export function parseLogisticsInit(value: unknown): LogisticsInit | null {
  if (!isRecord(value) || value.v !== 1) return null;
  const crane = isRecord(value.crane) ? value.crane : {};
  const hook = Array.isArray(crane.hook) ? crane.hook : [];
  const [hx, hz]: unknown[] = hook;
  return {
    beltMps: isFiniteNumber(value.beltMps) && value.beltMps > 0 ? value.beltMps : 1.4,
    structures: listOf(value.structures, decodeStructRow),
    bags: listOf(value.bags, decodeBagRow),
    cargo: listOf(value.cargo, decodeCargoRow),
    hoppers: listOf(value.hoppers, decodeFill),
    packagers: listOf(value.packagers, decodeFill),
    hook: isInt(hx) && isInt(hz) ? { x: hx / 100, z: hz / 100 } : { x: -8.5, z: 0 },
    job: parseCraneJob(crane.job)
  };
}

/** `miskolc:structure_spawned { row, by }`. */
export function parseStructureSpawned(value: unknown): { readonly row: StructRow; readonly by: number } | null {
  if (!isRecord(value)) return null;
  const row = decodeStructRow(value.row);
  return row ? { row, by: isInt(value.by) ? value.by : 0 } : null;
}

/** `miskolc:logistics_update`; an id is kept in at most one of `b`, `c`, `del` (the last list wins). */
export function parseLogisticsUpdate(value: unknown): LogisticsUpdate | null {
  if (!isRecord(value) || !isFiniteNumber(value.t)) return null;
  return {
    t: value.t,
    s: listOf(value.s, decodeStructRow),
    sdel: idsOf(value.sdel, isId),
    b: listOf(value.b, decodeBagRow),
    c: listOf(value.c, decodeCargoRow),
    del: idsOf(value.del, isId),
    arcs: listOf(value.arcs, decodeArc),
    burst: listOf(value.burst, decodeBurst),
    crane: value.crane === undefined ? undefined : parseCraneJob(value.crane),
    hop: listOf(value.hop, decodeFill),
    pk: listOf(value.pk, decodeFill)
  };
}

export function parseTelemetry(value: unknown): Telemetry | null {
  if (!isRecord(value)) return null;
  const { kgMin, loadPct, kW, ftHour, beltM, jams } = value;
  if (!isFiniteNumber(kgMin) || !isFiniteNumber(loadPct) || !isFiniteNumber(kW) || !isFiniteNumber(ftHour) || !isFiniteNumber(beltM) || !isInt(jams)) return null;
  return { kgMin, loadPct: Math.min(100, Math.max(0, loadPct)), kW, ftHour, beltM, jams };
}

// Acks (D.4). A missing / malformed ack is a silent refusal, as in C.
const UNKNOWN_REFUSAL = 'A szerver elutasította a műveletet.';
const MALFORMED: Refusal = { ok: false, error: UNKNOWN_REFUSAL, code: null };
const refusal = (v: Readonly<Record<string, unknown>>): Refusal => ({ ok: false, error: isString(v.error) ? v.error : UNKNOWN_REFUSAL, code: isString(v.code) ? v.code : null });

/** Parses `{ ok }` acks: a refusal, or `ok(v)` (null when the ok payload is malformed). */
function ack<T>(value: unknown, ok: (v: Readonly<Record<string, unknown>>) => T | null): T | Refusal {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return MALFORMED;
  if (!value.ok) return refusal(value);
  return ok(value) ?? MALFORMED;
}

export type TieAck = { readonly ok: true; readonly id: number; readonly tier: number; readonly kg: number } | Refusal;
export type PlaceAck = { readonly ok: true; readonly id: number } | Refusal;
export type ThrowAck = { readonly ok: true; readonly id: number; readonly to: { readonly x: number; readonly y: number; readonly z: number }; readonly into: 'ground' | 'belt' | 'hopper'; readonly burst: boolean } | Refusal;
export type CraneAck = { readonly ok: true; readonly durMs: number } | Refusal;
export type OkAck = { readonly ok: true } | Refusal;

export const parseTieAck = (value: unknown): TieAck =>
  ack(value, (v) => (isId(v.id) && intIn(v.tier, 0, 2) && isFiniteNumber(v.kg) ? { ok: true, id: v.id, tier: v.tier, kg: v.kg } : null));
export const parsePlaceAck = (value: unknown): PlaceAck => ack(value, (v) => (isId(v.id) ? { ok: true, id: v.id } : null));
export const parseOkAck = (value: unknown): OkAck => ack(value, () => ({ ok: true }));
export const parseCraneAck = (value: unknown): CraneAck =>
  ack(value, (v) => (isFiniteNumber(v.durMs) && v.durMs >= 0 ? { ok: true, durMs: v.durMs } : null));
export const parseThrowAck = (value: unknown): ThrowAck =>
  ack(value, (v) => {
    const to = Array.isArray(v.to) ? v.to : [];
    const [x, y, z]: unknown[] = to;
    const into = v.into === 'ground' || v.into === 'belt' || v.into === 'hopper' ? v.into : null;
    if (!isId(v.id) || !isInt(x) || !isInt(y) || !isInt(z) || !into) return null;
    return { ok: true, id: v.id, to: { x: x / 100, y: y / 100, z: z / 100 }, into, burst: v.burst === true };
  });

/** `PersonalState.bags` = [n0, n1, n2], each clamped to its stock cap (default 0). */
export function parseBagStock(value: unknown): readonly [number, number, number] {
  const a = Array.isArray(value) ? value : [];
  const n = (i: number): number => {
    const v: unknown = a[i];
    const cap = BAG_TIERS[i]?.cap ?? 0;
    return isInt(v) && v >= 0 ? Math.min(v, cap) : 0;
  };
  return [n(0), n(1), n(2)];
}
