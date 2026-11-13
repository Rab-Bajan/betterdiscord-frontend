// MiskolcSweepers: a szerver socket-üzeneteinek típusai és őrzői (Phase A protokoll).
import { isRecord, isString } from '../../../shared/lib/guards';
import {
  DEFAULT_CLOCK,
  parseClock,
  parseLayout,
  parseUnlockedDistricts,
  parseWeather,
  type ClockState,
  type WeatherState,
  type WorldLayout
} from './worldTypes';
import { DEFAULT_PERSONAL, parseDebrisInit, parsePersonalState, type DebrisInit, type PersonalState } from './debrisTypes';

/** Index order is protocol: `stateIdx` in tick_sync is an index into this list. */
export const PLAYER_ANIM_STATES = [
  'IDLE',
  'WALK',
  'SPRINT',
  'SWEEPING_ARCS',
  'HOLDING_BAG',
  'OPERATING_VACUUM',
  'DRIVING_VEHICLE',
  'PUSHING_CART'
] as const;

export type PlayerAnimState = (typeof PLAYER_ANIM_STATES)[number];

export const isPlayerAnimState = (value: unknown): value is PlayerAnimState =>
  isString(value) && (PLAYER_ANIM_STATES as readonly string[]).includes(value);

/** District index -> Hungarian name (0 = centre hex). */
export const DISTRICT_NAMES = [
  'Központi MÉH Telep',
  'Avas',
  'Újgyőri Piac',
  'Vasgyár',
  'Búza tér',
  'Avas Kilátó & Parkerdő'
] as const;

/** Upper-case HUD banner names (spec 30: "AVAS LAKÓTELEP – 68.4% TISZTA"). */
export const DISTRICT_HUD_NAMES = [
  'KÖZPONTI MÉH TELEP',
  'AVAS LAKÓTELEP',
  'ÚJGYŐRI PIAC',
  'VASGYÁR',
  'BÚZA TÉR',
  'AVAS KILÁTÓ & PARKERDŐ'
] as const;

export interface PlayerSnapshot {
  readonly id: number;
  readonly accountId: string | null;
  readonly username: string;
  readonly avatarColor: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotY: number;
  readonly state: PlayerAnimState;
  /** Held tool 0..7 (Phase C); 0 from an older server. */
  readonly tool: number;
}

export interface HexSnapshot {
  readonly id: number;
  readonly q: number;
  readonly r: number;
  readonly district: number;
  readonly cleanliness: number;
}

export interface PersonalStats {
  readonly cash: number;
  readonly toolTier: number;
  readonly backpackTier: number;
  readonly totalKg: number;
}

export interface InitState {
  readonly roomId: string;
  readonly selfId: number;
  readonly tickRate: number;
  readonly serverTime: number;
  readonly players: readonly PlayerSnapshot[];
  readonly hexes: readonly HexSnapshot[];
  readonly teamFunds: number;
  /** Phase C `PersonalState`; its first four fields are the Phase A `PersonalStats`. */
  readonly personal: PersonalState;
  /** Phase B city layout; null keeps the flat Phase A world (old server / malformed layout). */
  readonly layout: WorldLayout | null;
  readonly unlockedDistricts: readonly number[];
  readonly lifetimeEarned: number;
  readonly clock: ClockState;
  readonly weather: WeatherState;
  /** Phase C debris grid; null on a server without debris. */
  readonly debris: DebrisInit | null;
}

/** One decoded `p` entry of tick_sync (metres / radians). */
export interface TickPlayer {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotY: number;
  readonly state: PlayerAnimState;
  readonly corr: boolean;
  /** Held tool 0..7 (8th row element). */
  readonly tool: number;
}

export interface TickSync {
  readonly t: number;
  /** Short id (as string) -> last processed input seq. */
  readonly acks: Readonly<Record<string, number>>;
  /** Legacy single ack for the receiving socket, when sent. */
  readonly ack: number | null;
  readonly players: readonly TickPlayer[];
  readonly gone: readonly number[];
}

/** A refused join carries the server's Hungarian text and, when given, its error code. */
export type JoinAck = { readonly ok: true } | { readonly ok: false; readonly error: string; readonly code?: string };

/** Join refused by the server's join/leave rate limit (backend SweepersError.RATE_LIMITED_CODE): retryable. */
export const JOIN_RATE_LIMITED_CODE = 'SWEEPERS_RATE_LIMITED';

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isInt = (value: unknown): value is number => Number.isInteger(value);
const isToolId = (value: unknown): value is number => isInt(value) && value >= 0 && value <= 7;

export function parsePlayerSnapshot(value: unknown): PlayerSnapshot | null {
  if (!isRecord(value)) return null;
  const { id, accountId, username, avatarColor, x, y, z, rotY, state, tool } = value;
  if (!isInt(id) || !isString(username)) return null;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z) || !isFiniteNumber(rotY)) return null;
  if (accountId !== null && accountId !== undefined && !isString(accountId)) return null;
  return {
    id,
    accountId: isString(accountId) ? accountId : null,
    username,
    avatarColor: isString(avatarColor) ? avatarColor : '#FF7A1A',
    x,
    y,
    z,
    rotY,
    state: isPlayerAnimState(state) ? state : 'IDLE',
    tool: isToolId(tool) ? tool : 0
  };
}

export function parseHexSnapshot(value: unknown): HexSnapshot | null {
  if (!isRecord(value)) return null;
  const { id, q, r, district, cleanliness } = value;
  if (!isInt(id) || !isInt(q) || !isInt(r) || !isInt(district) || !isFiniteNumber(cleanliness)) return null;
  if (district < 0 || district >= DISTRICT_NAMES.length) return null;
  return { id, q, r, district, cleanliness: Math.min(100, Math.max(0, cleanliness)) };
}

const numberOr = (value: unknown, fallback: number): number => (isFiniteNumber(value) ? value : fallback);

/** `miskolc:init_state`; null when the core fields are missing. Malformed list entries are dropped. */
export function parseInitState(value: unknown): InitState | null {
  if (!isRecord(value)) return null;
  const { roomId, selfId, tickRate, serverTime, players, hexes, teamFunds, personal, layout, unlockedDistricts, lifetimeEarned, clock, weather, debris } = value;
  if (!isString(roomId) || !isInt(selfId) || !isFiniteNumber(serverTime)) return null;
  if (!Array.isArray(players) || !Array.isArray(hexes)) return null;
  return {
    roomId,
    selfId,
    tickRate: isFiniteNumber(tickRate) && tickRate > 0 ? tickRate : 12,
    serverTime,
    players: players.flatMap((entry: unknown) => parsePlayerSnapshot(entry) ?? []),
    hexes: hexes.flatMap((entry: unknown) => parseHexSnapshot(entry) ?? []),
    teamFunds: numberOr(teamFunds, 0),
    personal: parsePersonalState(personal) ?? DEFAULT_PERSONAL,
    layout: parseLayout(layout),
    unlockedDistricts: parseUnlockedDistricts(unlockedDistricts),
    lifetimeEarned: Math.max(0, numberOr(lifetimeEarned, 0)),
    clock: parseClock(clock) ?? { ...DEFAULT_CLOCK, serverTime },
    weather: parseWeather(weather) ?? { kind: 'clear', untilServerTime: null },
    debris: parseDebrisInit(debris)
  };
}

/** Centimetre integer -> metres. */
export const decodeCm = (cm: number): number => cm / 100;

/** rot16 (0..65535 of a full turn) -> radians in [0, 2π). */
export const decodeRot16 = (rot16: number): number => ((rot16 & 0xffff) / 65536) * Math.PI * 2;

/** Radians -> rot16, as the server encodes it. */
export const encodeRot16 = (rad: number): number => Math.round((rad / (Math.PI * 2)) * 65536) & 0xffff;

/** One `[id, xCm, yCm, zCm, rot16, stateIdx, corr, tool]` tuple (C.5: length 8); null when malformed. */
export function decodeTickPlayer(value: unknown): TickPlayer | null {
  if (!Array.isArray(value) || value.length < 8) return null;
  const [id, xCm, yCm, zCm, rot16, stateIdx, corr, tool]: unknown[] = value;
  if (!isInt(id) || !isInt(xCm) || !isInt(yCm) || !isInt(zCm) || !isInt(rot16) || !isInt(stateIdx) || !isToolId(tool)) return null;
  return {
    id,
    x: decodeCm(xCm),
    y: decodeCm(yCm),
    z: decodeCm(zCm),
    rotY: decodeRot16(rot16),
    state: PLAYER_ANIM_STATES[stateIdx] ?? 'IDLE',
    corr: corr === 1 || corr === true,
    tool
  };
}

/** `miskolc:tick_sync`; null without a server time. */
export function parseTickSync(value: unknown): TickSync | null {
  if (!isRecord(value) || !isFiniteNumber(value.t)) return null;
  const acks: Record<string, number> = {};
  if (isRecord(value.acks)) {
    for (const [id, seq] of Object.entries(value.acks)) if (isInt(seq)) acks[id] = seq;
  }
  return {
    t: value.t,
    acks,
    ack: isInt(value.ack) ? value.ack : null,
    players: Array.isArray(value.p) ? value.p.flatMap((entry: unknown) => decodeTickPlayer(entry) ?? []) : [],
    gone: Array.isArray(value.gone) ? value.gone.filter(isInt) : []
  };
}

/** `miskolc:player_left` `{ id }`. */
export function parsePlayerLeft(value: unknown): number | null {
  return isRecord(value) && isInt(value.id) ? value.id : null;
}

/** The ack of `miskolc:join_room`. */
export function parseJoinAck(value: unknown): JoinAck | null {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return null;
  if (value.ok) return { ok: true };
  const error = isString(value.error) ? value.error : 'Nem sikerült csatlakozni.';
  return isString(value.code) ? { ok: false, error, code: value.code } : { ok: false, error };
}

/** Last processed seq for `selfId` (the per-socket map wins over the single `ack`). */
export function ackFor(tick: TickSync, selfId: number): number | null {
  return tick.acks[String(selfId)] ?? tick.ack;
}

/** `miskolc:kicked` `{ reason }` (e.g. 'displaced': the same account joined from another tab). */
export function parseKicked(value: unknown): { readonly reason: string } | null {
  return isRecord(value) && isString(value.reason) ? { reason: value.reason } : null;
}
