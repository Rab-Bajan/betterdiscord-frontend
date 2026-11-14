// MiskolcSweepers Phase C protokoll (C.4/C.5): törmelék-, személyes állapot- és ack-őrzők.
// Minden bejövő payload `unknown`; a hibás listaelemek egyenként esnek ki, a foglalás korlátos.
import { isRecord, isString } from '../../../shared/lib/guards';
import { CELLS_PER_CHUNK, CHUNK_COUNT, FLAG_BURIED, FLAG_STUCK, ITEM_KINDS, type ItemKind } from './lib/debris/tables';
import { FUEL_TANK_ML, PACK_LEVELS, TOOLS, HAND_TOOL } from './lib/tools/catalog';
import { parseBagStock } from './logisticsTypes';

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isInt = (value: unknown): value is number => Number.isInteger(value);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const numberIn = (value: unknown, lo: number, hi: number, fallback: number): number => (isFiniteNumber(value) ? clamp(value, lo, hi) : fallback);
/** An integer in [lo, hi]; anything else (out of range too) is the fallback (C.6 defaults). */
const intIn = (value: unknown, lo: number, hi: number, fallback: number): number => (isInt(value) && value >= lo && value <= hi ? value : fallback);

/** Allocation caps (the server sends at most 6 000 items per room, 4 096 chunks). */
const MAX_ITEMS = 6000;
const MAX_CHUNKS = CHUNK_COUNT;
const MAX_CELL_TRIPLETS = 65_536;
const MAX_IDS = 10_000;

/** A carried load (backpack or tool buffer). */
export interface Load {
  readonly dustG: number;
  readonly seedG: number;
  readonly cans: number;
  readonly crushed: number;
  readonly ironG: number;
  readonly copperG: number;
  /** Item kind indices 5..7. */
  readonly jackpots: readonly number[];
  readonly kg: number;
  readonly l: number;
}

export interface PersonalFx {
  readonly stench?: number;
  readonly beer?: number;
  readonly kofola?: number;
}

export interface PersonalState {
  readonly cash: number;
  /** Equipped tool id 0..7. */
  readonly toolTier: number;
  readonly backpackTier: number;
  readonly totalKg: number;
  /** Bit i = tool i owned; bits 0 and 7 always set. */
  readonly owned: number;
  readonly widthLvl: number;
  readonly hardLvl: number;
  readonly gloves: boolean;
  /** Durability of tools 1..3, permille. */
  readonly dur: readonly [number, number, number];
  readonly fuelMl: number;
  /** Tenths: 0..1000. */
  readonly stamina: number;
  readonly clogged: boolean;
  readonly buf: Load;
  readonly pack: Load;
  readonly caps: { readonly bufKg: number; readonly packKg: number; readonly packL: number };
  /** Effects, each until a server time (ms). */
  readonly fx: PersonalFx;
  /** Bag stock per tier [kék, fekete, Big-Bag] (Phase D). */
  readonly bags: readonly [number, number, number];
  /** Zsírzóprés owned (Phase E, 89). */
  readonly greaseGun: boolean;
}

export const EMPTY_LOAD: Load = { dustG: 0, seedG: 0, cans: 0, crushed: 0, ironG: 0, copperG: 0, jackpots: [], kg: 0, l: 0 };
export const STARTER_OWNED = 0b10000001;

export const DEFAULT_PERSONAL: PersonalState = {
  cash: 0,
  toolTier: 0,
  backpackTier: 0,
  totalKg: 0,
  owned: STARTER_OWNED,
  widthLvl: 0,
  hardLvl: 0,
  gloves: false,
  dur: [1000, 1000, 1000],
  fuelMl: FUEL_TANK_ML,
  stamina: 1000,
  clogged: false,
  buf: EMPTY_LOAD,
  pack: EMPTY_LOAD,
  caps: { bufKg: TOOLS[0]?.bufKg ?? 0.5, packKg: PACK_LEVELS[0]?.kg ?? 10, packL: PACK_LEVELS[0]?.l ?? 8 },
  fx: {},
  bags: [0, 0, 0],
  greaseGun: false
};

export function parseLoad(value: unknown): Load {
  if (!isRecord(value)) return EMPTY_LOAD;
  const n = (v: unknown): number => numberIn(v, 0, 1e9, 0);
  const jackpots = Array.isArray(value.jackpots) ? value.jackpots.slice(0, 1000).filter((k): k is number => isInt(k) && k >= 5 && k < ITEM_KINDS.length) : [];
  return {
    dustG: n(value.dustG),
    seedG: n(value.seedG),
    cans: Math.floor(n(value.cans)),
    crushed: Math.floor(n(value.crushed)),
    ironG: n(value.ironG),
    copperG: n(value.copperG),
    jackpots,
    kg: n(value.kg),
    l: n(value.l)
  };
}

function parseFx(value: unknown): PersonalFx {
  if (!isRecord(value)) return {};
  const out: { stench?: number; beer?: number; kofola?: number } = {};
  if (isFiniteNumber(value.stench)) out.stench = value.stench;
  if (isFiniteNumber(value.beer)) out.beer = value.beer;
  if (isFiniteNumber(value.kofola)) out.kofola = value.kofola;
  return out;
}

/**
 * `PersonalState` (init_state.personal and `miskolc:personal_update`); null without a cash number.
 * Every other field is parsed on its own with its default (a Phase A personal parses too).
 */
export function parsePersonalState(value: unknown): PersonalState | null {
  if (!isRecord(value) || !isFiniteNumber(value.cash)) return null;
  const d = DEFAULT_PERSONAL;
  // bits 0 and 7 are always owned
  const owned = (intIn(value.owned, 0, 0xff, d.owned) | STARTER_OWNED) & 0xff;
  const toolTier = intIn(value.toolTier, 0, HAND_TOOL, 0);
  const dur = Array.isArray(value.dur) ? value.dur : [];
  const caps = isRecord(value.caps) ? value.caps : {};
  return {
    cash: value.cash,
    toolTier: ((owned >> toolTier) & 1) === 1 ? toolTier : 0,
    backpackTier: intIn(value.backpackTier, 0, PACK_LEVELS.length - 1, 0),
    totalKg: numberIn(value.totalKg, 0, 1e12, 0),
    owned,
    widthLvl: intIn(value.widthLvl, 0, 5, 0),
    hardLvl: intIn(value.hardLvl, 0, 3, 0),
    gloves: value.gloves === true,
    dur: [numberIn(dur[0], 0, 1000, 1000), numberIn(dur[1], 0, 1000, 1000), numberIn(dur[2], 0, 1000, 1000)],
    fuelMl: numberIn(value.fuelMl, 0, FUEL_TANK_ML, d.fuelMl),
    stamina: numberIn(value.stamina, 0, 1000, d.stamina),
    clogged: value.clogged === true,
    buf: parseLoad(value.buf),
    pack: parseLoad(value.pack),
    caps: {
      bufKg: numberIn(caps.bufKg, 0, 1e6, d.caps.bufKg),
      packKg: numberIn(caps.packKg, 0, 1e6, d.caps.packKg),
      packL: numberIn(caps.packL, 0, 1e6, d.caps.packL)
    },
    fx: parseFx(value.fx),
    bags: parseBagStock(value.bags),
    greaseGun: value.greaseGun === true
  };
}

/** `init_state.debris`: the grid the server streams. Null on a Phase B server (no debris). */
export interface DebrisInit {
  readonly gen: number;
  readonly origin: number;
  readonly chunkM: number;
  readonly cellM: number;
  readonly n: number;
  readonly loadM: number;
}

export function parseDebrisInit(value: unknown): DebrisInit | null {
  if (!isRecord(value)) return null;
  const { gen, origin, chunkM, cellM, n, loadM } = value;
  if (!isInt(gen) || !isFiniteNumber(origin) || !isFiniteNumber(chunkM) || !isFiniteNumber(cellM) || !isInt(n) || !isFiniteNumber(loadM)) return null;
  // the client hard-codes the C.2 grid; another grid is a protocol it does not speak
  if (origin !== -256 || chunkM !== 8 || cellM !== 0.5 || n !== 64) return null;
  return { gen, origin, chunkM, cellM, n, loadM };
}

/** One item, decoded from `ItemRow = [id, kind, xCm, zCm, rf, massDg, seedDg?]`. */
export interface DebrisItem {
  readonly id: number;
  readonly kind: ItemKind;
  readonly x: number;
  readonly z: number;
  /** Yaw, radians (rot8 of a full turn). */
  readonly rot: number;
  readonly stuck: boolean;
  readonly buried: boolean;
  /** Total mass, kg (a pile: dust + seed). */
  readonly massKg: number;
  /** A pile's seed share, kg (0 otherwise). */
  readonly seedKg: number;
}

export function decodeItemRow(value: unknown): DebrisItem | null {
  if (!Array.isArray(value) || value.length < 6) return null;
  const [id, kind, xCm, zCm, rf, massDg, seedDg]: unknown[] = value;
  if (!isInt(id) || id < 0 || !isInt(kind) || !isInt(xCm) || !isInt(zCm) || !isInt(rf) || !isInt(massDg)) return null;
  const k = ITEM_KINDS[kind];
  if (!k || massDg < 0) return null;
  const flags = (rf >> 8) & 0xff;
  return {
    id,
    kind: k,
    x: xCm / 100,
    z: zCm / 100,
    rot: ((rf & 0xff) / 256) * Math.PI * 2,
    stuck: (flags & FLAG_STUCK) !== 0,
    buried: (flags & FLAG_BURIED) !== 0,
    massKg: massDg / 100,
    seedKg: k === 'pile' && isInt(seedDg) && seedDg >= 0 ? Math.min(seedDg, massDg) / 100 : 0
  };
}

/** Standard base64 -> bytes; null when it is not valid base64. */
export function decodeBase64(text: string): Uint8Array | null {
  if (text.length > 4096 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) return null;
  try {
    const bin = atob(text);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export interface ChunkLoad {
  readonly id: number;
  /** 256 cell bytes: high nibble dust level, low nibble seed level. */
  readonly cells: Uint8Array;
  readonly items: readonly DebrisItem[];
}

export interface CellDelta {
  readonly chunk: number;
  readonly idx: number;
  readonly byte: number;
}

export interface KickDelta {
  readonly id: number;
  readonly fromX: number;
  readonly fromZ: number;
  readonly toX: number;
  readonly toZ: number;
}

export interface HexC10 {
  readonly hexId: number;
  /** Cleanliness in 0.1 % (0..1000). */
  readonly c10: number;
}

/** `miskolc:debris_chunk_update` (one shape for per-socket loads and room-wide deltas). */
export interface ChunkUpdate {
  readonly t: number;
  readonly load: readonly ChunkLoad[];
  readonly drop: readonly number[];
  readonly cells: readonly CellDelta[];
  readonly add: readonly DebrisItem[];
  readonly del: readonly number[];
  readonly kicks: readonly KickDelta[];
  readonly hx: readonly HexC10[];
}

const isChunkId = (v: unknown): v is number => isInt(v) && v >= 0 && v < CHUNK_COUNT;

function parseChunkLoad(value: unknown): ChunkLoad | null {
  if (!isRecord(value) || !isChunkId(value.id) || !isString(value.c)) return null;
  const cells = decodeBase64(value.c);
  if (!cells || cells.length !== CELLS_PER_CHUNK) return null;
  const items = Array.isArray(value.i) ? value.i.slice(0, MAX_ITEMS).flatMap((row: unknown) => decodeItemRow(row) ?? []) : [];
  return { id: value.id, cells, items };
}

function parseCells(value: unknown): CellDelta[] {
  if (!Array.isArray(value)) return [];
  const out: CellDelta[] = [];
  const n = Math.min(Math.floor(value.length / 3), MAX_CELL_TRIPLETS);
  for (let i = 0; i < n; i++) {
    const chunk: unknown = value[i * 3];
    const idx: unknown = value[i * 3 + 1];
    const byte: unknown = value[i * 3 + 2];
    if (isChunkId(chunk) && isInt(idx) && idx >= 0 && idx < CELLS_PER_CHUNK && isInt(byte) && byte >= 0 && byte <= 0xff) out.push({ chunk, idx, byte });
  }
  return out;
}

function parseKick(value: unknown): KickDelta | null {
  if (!Array.isArray(value) || value.length < 5) return null;
  const [id, fx, fz, tx, tz]: unknown[] = value;
  if (!isInt(id) || !isInt(fx) || !isInt(fz) || !isInt(tx) || !isInt(tz)) return null;
  return { id, fromX: fx / 100, fromZ: fz / 100, toX: tx / 100, toZ: tz / 100 };
}

function parseHx(value: unknown): HexC10 | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const [hexId, c10]: unknown[] = value;
  if (!isInt(hexId) || hexId < 0 || !isInt(c10)) return null;
  return { hexId, c10: clamp(c10, 0, 1000) };
}

const listOf = <T>(value: unknown, max: number, parse: (entry: unknown) => T | null): T[] =>
  Array.isArray(value) ? value.slice(0, max).flatMap((entry: unknown) => parse(entry) ?? []) : [];

const ids = (value: unknown, max: number, ok: (v: unknown) => v is number): number[] =>
  Array.isArray(value) ? value.slice(0, max).filter(ok) : [];

const isItemId = (v: unknown): v is number => isInt(v) && v >= 0;

export function parseChunkUpdate(value: unknown): ChunkUpdate | null {
  if (!isRecord(value) || !isFiniteNumber(value.t)) return null;
  return {
    t: value.t,
    load: listOf(value.load, MAX_CHUNKS, parseChunkLoad),
    drop: ids(value.drop, MAX_CHUNKS, isChunkId),
    cells: parseCells(value.cells),
    add: listOf(value.add, MAX_ITEMS, decodeItemRow),
    del: ids(value.del, MAX_IDS, isItemId),
    kicks: listOf(value.kicks, MAX_ITEMS, parseKick),
    hx: listOf(value.hx, 64, parseHx)
  };
}

/** A refused ack of any Phase C event: the Hungarian `error` text and the server's `code`. */
export interface Refusal {
  readonly ok: false;
  readonly error: string;
  readonly code: string | null;
}

export type SweepAck = { readonly ok: true; readonly seq: number; readonly kg: number; readonly items: readonly number[]; readonly pushed: boolean } | Refusal;
/** `player_action` ack; a `dump` into a hopper intake carries the hopper's kg (D.4). */
export type ActionAck = { readonly ok: true; readonly hopperKg?: number } | Refusal;
/** E.4 adds `teamFunds` (team purchases); absent from a pre-E server. */
export type BuyAck = { readonly ok: true; readonly cash: number; readonly teamFunds?: number } | Refusal;

/** Codes the client never toasts (C.8): cadence refusals, and a rate-limited sweep_hit. */
export const TOO_FAST_CODE = 'SWEEPERS_TOO_FAST';
export const RATE_LIMITED_CODE = 'SWEEPERS_RATE_LIMITED';

const UNKNOWN_REFUSAL = 'A szerver elutasította a műveletet.';

function parseRefusal(value: Readonly<Record<string, unknown>>): Refusal {
  return { ok: false, error: isString(value.error) ? value.error : UNKNOWN_REFUSAL, code: isString(value.code) ? value.code : null };
}

/** A missing / malformed ack counts as a silent refusal (nothing to toast, prediction rolls back). */
const MALFORMED: Refusal = { ok: false, error: UNKNOWN_REFUSAL, code: null };

export function parseSweepAck(value: unknown): SweepAck {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return MALFORMED;
  if (!value.ok) return parseRefusal(value);
  if (!isInt(value.seq)) return MALFORMED;
  return {
    ok: true,
    seq: value.seq,
    kg: isFiniteNumber(value.kg) ? Math.max(0, value.kg) : 0,
    items: ids(value.items, MAX_IDS, isItemId),
    pushed: value.pushed === true
  };
}

export function parseActionAck(value: unknown): ActionAck {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return MALFORMED;
  if (!value.ok) return parseRefusal(value);
  return isFiniteNumber(value.hopperKg) ? { ok: true, hopperKg: value.hopperKg } : { ok: true };
}

export function parseBuyAck(value: unknown): BuyAck {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return MALFORMED;
  if (!value.ok) return parseRefusal(value);
  if (!isFiniteNumber(value.cash)) return MALFORMED;
  return isFiniteNumber(value.teamFunds) ? { ok: true, cash: value.cash, teamFunds: value.teamFunds } : { ok: true, cash: value.cash };
}

/** True when a refusal should be shown to the player (C.8: cadence and rate limits are silent). */
export const isToastable = (refusal: Refusal, sweep: boolean): boolean =>
  refusal !== MALFORMED && refusal.code !== TOO_FAST_CODE && !(sweep && refusal.code === RATE_LIMITED_CODE);
