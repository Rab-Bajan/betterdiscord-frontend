// MiskolcSweepers Phase F protokoll (F.3–F.5): járműsorok, `vehicle_update` és a jármű-ackok őrzői.
// Minden bejövő payload `unknown`; a hibás sor egyenként esik ki, a foglalás korlátos.
import { isRecord, isString } from '../../../shared/lib/guards';
import { VEHICLE_TYPES } from './lib/vehicles/tables';
import type { Refusal } from './debrisTypes';

const isInt = (value: unknown): value is number => Number.isInteger(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const intIn = (value: unknown, lo: number, hi: number): value is number => isInt(value) && value >= lo && value <= hi;
const MAX_ROWS = 64;

/** One decoded `VehicleRow` (metres, radians, m/s, litres, kg). */
export interface Vehicle {
  readonly id: number;
  readonly type: number;
  readonly x: number;
  readonly z: number;
  readonly rotY: number;
  readonly v: number;
  readonly fuelL: number;
  readonly lights: 0 | 1 | 2;
  readonly beacon: boolean;
  readonly tipping: boolean;
  readonly punct: boolean;
  readonly stalled: boolean;
  /** The driver snaps to this pose. */
  readonly corr: boolean;
  readonly inGarage: boolean;
  readonly align: number;
  readonly bedKg: number;
  readonly bags: number;
  /** Short id per seat, 0 = free (length = the type's seats). */
  readonly seats: readonly number[];
}

/** `HitRow = [vehicleId, kind]`: 0 curb, 1 puncture. */
export interface VehicleHit {
  readonly id: number;
  readonly kind: 0 | 1;
}

/** `miskolc:vehicle_update` (F.5); absent lists are empty. */
export interface VehicleUpdate {
  readonly t: number;
  readonly rows: readonly Vehicle[];
  readonly del: readonly number[];
  readonly horn: readonly number[];
  readonly hit: readonly VehicleHit[];
}

/** `flags` bits (F.3). */
export function decodeVehicleFlags(flags: number): Pick<Vehicle, 'lights' | 'beacon' | 'tipping' | 'punct' | 'stalled' | 'corr' | 'inGarage' | 'align'> {
  const lights = flags & 3;
  return {
    lights: lights === 1 || lights === 2 ? lights : 0,
    beacon: (flags & 4) !== 0,
    tipping: (flags & 8) !== 0,
    punct: (flags & 16) !== 0,
    stalled: (flags & 32) !== 0,
    corr: (flags & 64) !== 0,
    inGarage: (flags & 128) !== 0,
    align: Math.min(4, (flags >> 8) & 7)
  };
}

/** `[id, type, xCm, zCm, rot16, vCmS, fuelDl, flags, bedKgDg, bags, s0, s1, s2]`; null when malformed. */
export function decodeVehicleRow(value: unknown): Vehicle | null {
  if (!Array.isArray(value) || value.length < 13) return null;
  const [id, type, xCm, zCm, rot16, vCmS, fuelDl, flags, bedKgDg, bags, s0, s1, s2]: unknown[] = value;
  if (!intIn(id, 1, 255) || !intIn(type, 0, VEHICLE_TYPES.length - 1) || !isInt(xCm) || !isInt(zCm) || !intIn(rot16, 0, 65535)) return null;
  if (!intIn(vCmS, 0, 1e5) || !intIn(fuelDl, 0, 1e4) || !intIn(flags, 0, 0x7ff) || !intIn(bedKgDg, 0, 1e9) || !intIn(bags, 0, 255)) return null;
  const seats = [s0, s1, s2];
  if (!seats.every((v) => intIn(v, 0, 65535))) return null;
  return {
    id,
    type,
    x: xCm / 100,
    z: zCm / 100,
    rotY: (rot16 / 65536) * Math.PI * 2,
    v: vCmS / 100,
    fuelL: fuelDl / 10,
    ...decodeVehicleFlags(flags),
    bedKg: bedKgDg / 100,
    bags,
    seats: seats.filter(isInt).slice(0, VEHICLE_TYPES[type]?.seats.length ?? 1)
  };
}

const listOf = <T>(value: unknown, parse: (entry: unknown) => T | null): T[] =>
  Array.isArray(value) ? value.slice(0, MAX_ROWS).flatMap((entry: unknown) => parse(entry) ?? []) : [];
const ids = (value: unknown): number[] => (Array.isArray(value) ? value.slice(0, MAX_ROWS).filter((v): v is number => intIn(v, 1, 255)) : []);

/** `init_state.vehicles`; an absent list (pre-F server) is empty. */
export const parseVehicleList = (value: unknown): Vehicle[] => listOf(value, decodeVehicleRow);

function decodeHit(value: unknown): VehicleHit | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const [id, kind]: unknown[] = value;
  return intIn(id, 1, 255) && (kind === 0 || kind === 1) ? { id, kind } : null;
}

export function parseVehicleUpdate(value: unknown): VehicleUpdate | null {
  if (!isRecord(value) || !isFiniteNumber(value.t)) return null;
  return { t: value.t, rows: listOf(value.v, decodeVehicleRow), del: ids(value.del), horn: ids(value.horn), hit: listOf(value.hit, decodeHit) };
}

// Acks (F.4). A missing / malformed ack is a silent refusal, as in C/D/E.
const UNKNOWN_REFUSAL = 'A szerver elutasította a műveletet.';
const MALFORMED: Refusal = { ok: false, error: UNKNOWN_REFUSAL, code: null };
function ack<T>(value: unknown, ok: (v: Readonly<Record<string, unknown>>) => T | null): T | Refusal {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return MALFORMED;
  if (!value.ok) return { ok: false, error: isString(value.error) ? value.error : UNKNOWN_REFUSAL, code: isString(value.code) ? value.code : null };
  return ok(value) ?? MALFORMED;
}

export type EnterAck = { readonly ok: true; readonly seat: number } | Refusal;
export type ExitAck = { readonly ok: true; readonly x: number; readonly z: number } | Refusal;
export type TipAck = { readonly ok: true; readonly into: 'hopper' | 'ground'; readonly kg: number } | Refusal;
export type BedAck = { readonly ok: true; readonly bedKg: number } | Refusal;
export type RefuelAck = { readonly ok: true; readonly fuelL: number } | Refusal;
export type RepairAck = { readonly ok: true; readonly teamFunds: number } | Refusal;

export const parseEnterAck = (value: unknown): EnterAck => ack(value, (v) => (intIn(v.seat, 0, 2) ? { ok: true, seat: v.seat } : null));
export const parseExitAck = (value: unknown): ExitAck => ack(value, (v) => (isFiniteNumber(v.x) && isFiniteNumber(v.z) ? { ok: true, x: v.x, z: v.z } : null));
export const parseTipAck = (value: unknown): TipAck =>
  ack(value, (v) => ((v.into === 'hopper' || v.into === 'ground') && isFiniteNumber(v.kg) && v.kg >= 0 ? { ok: true, into: v.into, kg: v.kg } : null));
export const parseBedAck = (value: unknown): BedAck => ack(value, (v) => (isFiniteNumber(v.bedKg) && v.bedKg >= 0 ? { ok: true, bedKg: v.bedKg } : null));
export const parseRefuelAck = (value: unknown): RefuelAck => ack(value, (v) => (isFiniteNumber(v.fuelL) && v.fuelL >= 0 ? { ok: true, fuelL: v.fuelL } : null));
export const parseRepairAck = (value: unknown): RepairAck => ack(value, (v) => (isFiniteNumber(v.teamFunds) ? { ok: true, teamFunds: v.teamFunds } : null));
