// MiskolcSweepers Phase E protokoll (E.3–E.5): gazdaság-, áram-, LME-, ellenőr- és mérlegelés-őrzők.
// Minden bejövő payload `unknown`; a hibás sor egyenként esik ki, a foglalás korlátos.
import { isRecord, isString } from '../../../shared/lib/guards';
import { MATERIALS, PROC_NAMES } from './lib/economy/tables';
import type { Refusal } from './debrisTypes';

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isInt = (value: unknown): value is number => Number.isInteger(value);
const intIn = (value: unknown, lo: number, hi: number): value is number => isInt(value) && value >= lo && value <= hi;
const MAX_ROWS = 256;

/** `GridRow` (E.3); `dieselL` from the wire's 0.1 L. */
export interface GridRow {
  readonly st: 0 | 1 | 2;
  readonly pf: number;
  readonly solarW: number;
  readonly genW: number;
  readonly demandW: number;
  readonly battWh: number;
  readonly dieselL: number;
  readonly genOn: boolean;
}

/** `LmeRow` (E.3): pct per series [alu, iron, copper]. */
export interface LmeRow {
  readonly epoch: number;
  readonly pct: readonly [number, number, number];
  readonly until: number;
  readonly msg: string;
}

/** `InspRow` (E.3): next visit (server ms), kg so far and the effective quota per district. */
export interface InspRow {
  readonly at: number;
  readonly kg: readonly number[];
  readonly quota: readonly number[];
}

export interface EconomyInit {
  readonly funds: number;
  readonly bp: number;
  readonly grid: GridRow;
  readonly lme: LmeRow;
  readonly insp: InspRow;
}

/** `miskolc:economy` (E.5); an absent field is unchanged. */
export interface EconomyUpdate {
  readonly t: number;
  readonly funds?: number;
  readonly life?: number;
  readonly bp?: number;
  readonly grid?: GridRow;
  readonly lme?: LmeRow;
  readonly insp?: InspRow;
  readonly coins: readonly { readonly node: number; readonly ft: number }[];
}

/** `ReceiptLine = [mat, proc, kgDg, ftPerKg, ft]` (E.3). */
export interface ReceiptLine {
  readonly mat: number;
  readonly proc: number;
  readonly kgDg: number;
  readonly ftPerKg: number;
  readonly ft: number;
}

/** `miskolc:scale_weighed` (E.5). */
export interface ScaleWeighed {
  readonly scale: 0 | 1;
  readonly by: number;
  readonly kgDg: number;
  readonly lines: readonly ReceiptLine[];
  readonly dirtyFt: number;
  readonly total: number;
  readonly team: number;
  readonly each: number;
  readonly to: readonly number[];
  readonly epoch: number;
}

/** `miskolc:inspection` (E.5). */
export interface Inspection {
  readonly results: readonly { readonly district: number; readonly quotaKg: number; readonly kg: number; readonly fineFt: number }[];
  readonly fine: number;
  readonly funds: number;
}

const tuple = (value: unknown, n: number): unknown[] | null => (Array.isArray(value) && value.length >= n ? value : null);
const listOf = <T>(value: unknown, parse: (entry: unknown) => T | null): T[] =>
  Array.isArray(value) ? value.slice(0, MAX_ROWS).flatMap((entry: unknown) => parse(entry) ?? []) : [];
const ints6 = (value: unknown): number[] | null => {
  const a = tuple(value, 6);
  return a && a.slice(0, 6).every((v) => isInt(v) && v >= 0) ? a.slice(0, 6).filter(isInt) : null;
};

export function parseGridRow(value: unknown): GridRow | null {
  if (!isRecord(value)) return null;
  const { st, pf, solarW, genW, demandW, battWh, dieselDl, genOn } = value;
  if (!(st === 0 || st === 1 || st === 2) || !isFiniteNumber(pf) || pf < 0 || pf > 1) return null;
  if (!isInt(solarW) || !isInt(genW) || !isInt(demandW) || !isInt(battWh) || !intIn(dieselDl, 0, 10_000) || typeof genOn !== 'boolean') return null;
  return { st, pf, solarW, genW, demandW, battWh, dieselL: dieselDl / 10, genOn };
}

export function parseLmeRow(value: unknown): LmeRow | null {
  if (!isRecord(value)) return null;
  const { epoch, pct, until, msg } = value;
  const p = tuple(pct, 3);
  const [alu, iron, copper]: unknown[] = p ?? [];
  if (!isInt(epoch) || !isInt(alu) || !isInt(iron) || !isInt(copper) || !isFiniteNumber(until) || !isString(msg)) return null;
  return { epoch, pct: [alu, iron, copper], until, msg: msg.slice(0, 200) };
}

export function parseInspRow(value: unknown): InspRow | null {
  if (!isRecord(value) || !isFiniteNumber(value.at)) return null;
  const kg = ints6(value.kg);
  const quota = ints6(value.quota);
  return kg && quota ? { at: value.at, kg, quota } : null;
}

/** `init_state.economy`; null on a server without the economy. */
export function parseEconomyInit(value: unknown): EconomyInit | null {
  if (!isRecord(value) || !isFiniteNumber(value.funds) || !intIn(value.bp, 0, 15)) return null;
  const grid = parseGridRow(value.grid);
  const lme = parseLmeRow(value.lme);
  const insp = parseInspRow(value.insp);
  return grid && lme && insp ? { funds: value.funds, bp: value.bp, grid, lme, insp } : null;
}

function decodeCoin(value: unknown): { node: number; ft: number } | null {
  const a = tuple(value, 2);
  if (!a) return null;
  const [node, ft] = a;
  return intIn(node, 0, 65535) && intIn(ft, 0, 1e6) ? { node, ft } : null;
}

export function parseEconomyUpdate(value: unknown): EconomyUpdate | null {
  if (!isRecord(value) || !isFiniteNumber(value.t)) return null;
  const grid = parseGridRow(value.grid);
  const lme = parseLmeRow(value.lme);
  const insp = parseInspRow(value.insp);
  return {
    t: value.t,
    ...(isFiniteNumber(value.funds) ? { funds: value.funds } : {}),
    ...(isFiniteNumber(value.life) ? { life: value.life } : {}),
    ...(intIn(value.bp, 0, 15) ? { bp: value.bp } : {}),
    ...(grid ? { grid } : {}),
    ...(lme ? { lme } : {}),
    ...(insp ? { insp } : {}),
    coins: listOf(value.coins, decodeCoin)
  };
}

export function decodeReceiptLine(value: unknown): ReceiptLine | null {
  const a = tuple(value, 5);
  if (!a) return null;
  const [mat, proc, kgDg, ftPerKg, ft] = a;
  if (!intIn(mat, 0, MATERIALS.length - 1) || !intIn(proc, 0, PROC_NAMES.length - 1) || !intIn(kgDg, 0, 1e9) || !intIn(ftPerKg, 0, 1e7) || !intIn(ft, 0, 1e12)) return null;
  return { mat, proc, kgDg, ftPerKg, ft };
}

export function parseScaleWeighed(value: unknown): ScaleWeighed | null {
  if (!isRecord(value)) return null;
  const { scale, by, kgDg, lines, dirtyFt, total, team, each, to, epoch } = value;
  if (!(scale === 0 || scale === 1) || !isInt(by) || !intIn(kgDg, 0, 1e9) || !isInt(dirtyFt) || dirtyFt > 0) return null;
  if (!intIn(total, 0, 1e12) || !isInt(team) || !intIn(each, 0, 1e12) || !isInt(epoch)) return null;
  return {
    scale, by, kgDg, dirtyFt, total, team, each, epoch,
    lines: listOf(lines, decodeReceiptLine),
    to: Array.isArray(to) ? to.slice(0, MAX_ROWS).filter(isInt) : []
  };
}

function decodeResult(value: unknown): Inspection['results'][number] | null {
  const a = tuple(value, 4);
  if (!a) return null;
  const [district, quotaKg, kg, fineFt] = a;
  return intIn(district, 0, 5) && intIn(quotaKg, 0, 1e9) && intIn(kg, 0, 1e12) && intIn(fineFt, 0, 1e9) ? { district, quotaKg, kg, fineFt } : null;
}

export function parseInspection(value: unknown): Inspection | null {
  if (!isRecord(value) || !intIn(value.fine, 0, 1e12) || !isFiniteNumber(value.funds)) return null;
  return { results: listOf(value.results, decodeResult), fine: value.fine, funds: value.funds };
}

// Acks (E.4). A missing / malformed ack is a silent refusal, as in C/D.
const UNKNOWN_REFUSAL = 'A szerver elutasította a műveletet.';
const MALFORMED: Refusal = { ok: false, error: UNKNOWN_REFUSAL, code: null };
function ack<T>(value: unknown, ok: (v: Readonly<Record<string, unknown>>) => T | null): T | Refusal {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return MALFORMED;
  if (!value.ok) return { ok: false, error: isString(value.error) ? value.error : UNKNOWN_REFUSAL, code: isString(value.code) ? value.code : null };
  return ok(value) ?? MALFORMED;
}

export type GreaseAck = { readonly ok: true; readonly mask: number; readonly done: boolean } | Refusal;
export type GeneratorAck = { readonly ok: true; readonly on: boolean } | Refusal;

export const parseGreaseAck = (value: unknown): GreaseAck =>
  ack(value, (v) => (intIn(v.mask, 0, 15) && typeof v.done === 'boolean' ? { ok: true, mask: v.mask, done: v.done } : null));
export const parseGeneratorAck = (value: unknown): GeneratorAck =>
  ack(value, (v) => (typeof v.on === 'boolean' ? { ok: true, on: v.on } : null));
