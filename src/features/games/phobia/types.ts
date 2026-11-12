// MiskolcPhobia socket contracts (betterdiscord/miskolcPhobiaHandler.js, miskolcPhobiaAI.js).
// Incoming payloads are `unknown`; each parser returns the narrowed shape, or null when the
// payload lacks what the listener needs (the listener then ignores it, as before).
import { isRecord, isString, optionalString } from '../../../shared/lib/guards.ts';

/** `value` as a string array when it is an array (non-strings dropped), otherwise undefined. */
const stringArray = (value: unknown): string[] | undefined =>
  Array.isArray(value) ? value.filter(isString) : undefined;

/* --------------------------------- electrical -------------------------------- */

/** `phobia:breaker-updated` / `phobia:breaker-state`: { breakerOn, tripped?, sabotage?, activeLights? }. */
export interface BreakerUpdatePayload {
  breakerOn: boolean;
  activeLights?: string[];
}

export function parseBreakerUpdate(data: unknown): BreakerUpdatePayload | null {
  if (!isRecord(data) || typeof data.breakerOn !== 'boolean') return null;
  const activeLights = stringArray(data.activeLights);
  return activeLights ? { breakerOn: data.breakerOn, activeLights } : { breakerOn: data.breakerOn };
}

/** `phobia:breaker-tripped`: { reason: 'overload', maxLights }. */
export function parseBreakerTrippedReason(data: unknown): string | undefined {
  return isRecord(data) && isString(data.reason) ? data.reason : undefined;
}

/** `phobia:light-updated` / `phobia:light-toggled`: { lightId, state, activeLights }. */
export interface LightUpdatePayload {
  lightId: string;
  state: boolean;
  activeLights?: string[];
}

export function parseLightUpdate(data: unknown): LightUpdatePayload | null {
  if (!isRecord(data) || !isString(data.lightId) || !data.lightId) return null;
  const activeLights = stringArray(data.activeLights);
  const base = { lightId: data.lightId, state: Boolean(data.state) };
  return activeLights ? { ...base, activeLights } : base;
}

/** `phobia:lightbulb-shattered`: { lightId, ... }. The light id, or null. */
export function parseLightId(data: unknown): string | null {
  return isRecord(data) && isString(data.lightId) && data.lightId ? data.lightId : null;
}

/* ----------------------------------- props ----------------------------------- */

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

const firstId = (...values: unknown[]): string | undefined =>
  values.find((v): v is string => isString(v) && v.length > 0);

/**
 * `phobia:item-thrown`, normalised. The server sends three shapes:
 * { propId, x, y, z, impulse: [x, y, z] } (player throw relay / scrap interaction),
 * { item, impulse } (drop) and { itemId, item?, impulse: {x, y, z}, ... } (ghost throw).
 */
export interface ItemThrownPayload {
  itemId: string;
  position: Vec3Like | null;
  velocity: Vec3Like | null;
}

export function parseItemThrown(raw: unknown): ItemThrownPayload | null {
  if (!isRecord(raw)) return null;
  const item = isRecord(raw.item) ? raw.item : undefined;
  const itemId = firstId(raw.itemId, raw.propId, item?.id);
  if (!itemId) return null;
  let position: Vec3Like | null = null;
  if (isRecord(raw.position)) {
    position = { x: Number(raw.position.x), y: Number(raw.position.y), z: Number(raw.position.z) };
  } else if (typeof (raw.x ?? item?.x) === 'number') {
    position = { x: Number(raw.x ?? item?.x), y: Number(raw.y ?? item?.y), z: Number(raw.z ?? item?.z) };
  }
  let velocity: Vec3Like | null = null;
  if (isRecord(raw.velocity)) {
    velocity = { x: Number(raw.velocity.x), y: Number(raw.velocity.y), z: Number(raw.velocity.z) };
  } else if (Array.isArray(raw.impulse) && raw.impulse.length === 3) {
    velocity = { x: Number(raw.impulse[0]), y: Number(raw.impulse[1]), z: Number(raw.impulse[2]) };
  }
  return { itemId, position, velocity };
}

/** A world item transform (`worldItemView` on the server): { id, type, x, y, z, rx, ry, rz }. */
export interface ServerWorldItem {
  id: string;
  type?: string;
  name?: string;
  x: number;
  y: number;
  z: number;
  rx?: number;
  ry?: number;
  rz?: number;
}

const finiteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const optionalNumber = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined);

/** A server world item with an id and a finite position, or null. */
export function parseWorldItem(value: unknown): ServerWorldItem | null {
  if (!isRecord(value) || !isString(value.id) || !value.id) return null;
  const { x, y, z } = value;
  if (!finiteNumber(x) || !finiteNumber(y) || !finiteNumber(z)) return null;
  const item: ServerWorldItem = { id: value.id, x, y, z };
  if (isString(value.type)) item.type = value.type;
  if (isString(value.name)) item.name = value.name;
  const rx = optionalNumber(value.rx);
  const ry = optionalNumber(value.ry);
  const rz = optionalNumber(value.rz);
  if (rx !== undefined) item.rx = rx;
  if (ry !== undefined) item.ry = ry;
  if (rz !== undefined) item.rz = rz;
  return item;
}

/* ---------------------------------- players ---------------------------------- */

/**
 * A player as the server describes it: `phobia:tick` players (flat x/y/z, yaw/pitch, id = socket id),
 * session-summary players (position/rotation arrays, id + socketId) and `phobia:player-joined` /
 * session-init `self` (socketId, position/rotation). Every field is optional; parsePlayer keeps the
 * ones whose type matches.
 */
export interface PhobiaPlayer {
  id?: string;
  socketId?: string;
  userId?: string;
  username?: string;
  name?: string;
  avatarColor?: string;
  x?: number;
  y?: number;
  z?: number;
  yaw?: number;
  pitch?: number;
  position?: number[];
  rotation?: number[];
  sanity?: number;
  alive?: boolean;
  flashlightOn?: boolean;
  isSpeaking?: boolean;
  isInsideTruck?: boolean;
  crouched?: boolean;
  sprinting?: boolean;
  hidingSpotId?: string | null;
  activeSlot?: number;
  /** Walkie-talkie flag / held items, when a payload carries them (proximity voice reads both). */
  hasRadio?: boolean;
  inventory?: unknown[];
}

const PLAYER_STRING_KEYS = ['id', 'socketId', 'userId', 'username', 'name', 'avatarColor'] as const;
const PLAYER_NUMBER_KEYS = ['x', 'y', 'z', 'yaw', 'pitch', 'sanity', 'activeSlot'] as const;
const PLAYER_BOOLEAN_KEYS = ['alive', 'flashlightOn', 'isSpeaking', 'isInsideTruck', 'crouched', 'sprinting', 'hasRadio'] as const;

const numberArray = (value: unknown): number[] | undefined =>
  Array.isArray(value) ? value.map((v) => (typeof v === 'number' ? v : Number.NaN)) : undefined;

/** A server player record narrowed to PhobiaPlayer (wrong-typed fields dropped), or null for a non-object. */
export function parsePlayer(value: unknown): PhobiaPlayer | null {
  if (!isRecord(value)) return null;
  const player: PhobiaPlayer = {};
  for (const key of PLAYER_STRING_KEYS) {
    const v = value[key];
    if (isString(v)) player[key] = v;
  }
  for (const key of PLAYER_NUMBER_KEYS) {
    const v = value[key];
    if (typeof v === 'number') player[key] = v;
  }
  for (const key of PLAYER_BOOLEAN_KEYS) {
    const v = value[key];
    if (typeof v === 'boolean') player[key] = v;
  }
  const position = numberArray(value.position);
  if (position) player.position = position;
  const rotation = numberArray(value.rotation);
  if (rotation) player.rotation = rotation;
  if (isString(value.hidingSpotId) || value.hidingSpotId === null) player.hidingSpotId = value.hidingSpotId;
  if (Array.isArray(value.inventory)) player.inventory = [...value.inventory];
  return player;
}

/** The player records of an array payload field (non-objects dropped); [] when it is not an array. */
export function parsePlayers(value: unknown): PhobiaPlayer[] {
  if (!Array.isArray(value)) return [];
  const out: PhobiaPlayer[] = [];
  for (const entry of value) {
    const player = parsePlayer(entry);
    if (player) out.push(player);
  }
  return out;
}

/* ---------------------------------- settings --------------------------------- */

/** Host lobby settings (`session.settings`, `phobia:settings-updated`). */
export interface PhobiaSettings {
  evidenceCount: number;
  startingSanity: number;
}

/* ------------------------------------ HUD ------------------------------------ */

/** An inventory slot item as the HUD shows it (ItemSystem's InventoryItem or a server item). */
export interface PhobiaHudItem {
  id?: string;
  type?: string;
  name?: string;
  icon?: string;
  charges?: number | undefined;
}

/** A teammate row on the HUD: a player plus the client-side hidden flag. */
export interface HudTeammate extends PhobiaPlayer {
  hidden?: boolean;
}

/** A side task (`session.sideTasks`): { id, desc, reward, completed }. */
export interface HudSideTask {
  id?: string;
  title?: string;
  desc?: string;
  reward?: number;
  completed?: boolean;
}

/** The primary objective (`session.primaryObjective` / `phobia:objectives-updated`.primary). */
export interface HudObjective {
  textHu?: string;
  title?: string;
  done?: boolean;
  completed?: boolean;
}

/* ---------------------------------- journal ---------------------------------- */

/** Journal evidence mark: 0 none, 1 found, 2 ruled out. */
export type EvidenceMark = 0 | 1 | 2;

/** A journal photo (ItemSystem snapshot or `phobia:photo-taken`). */
export interface JournalPhotoEntry {
  id?: string;
  subject?: string;
  stars?: number;
  reward?: number;
  dataUrl?: string | null;
}

/**
 * `phobia:verdict-result` / `phobia:match-concluded`: { correct, ghostType, ghostArchetype, rewardFt, ... };
 * the client fills actualGhost / payoutFt for offline verdicts and `concluded` / `reason` for a match
 * that ended without one.
 */
export interface PhobiaMatchResult {
  correct: boolean;
  actualGhost?: string;
  ghostType?: string;
  payoutFt?: number;
  rewardFt?: number;
  concluded?: boolean;
  reason?: string;
}

/** Host settings from a payload: the numeric evidenceCount / startingSanity it carries (others dropped). */
export function parseSettings(value: unknown): Partial<PhobiaSettings> | null {
  if (!isRecord(value)) return null;
  const out: Partial<PhobiaSettings> = {};
  if (typeof value.evidenceCount === 'number') out.evidenceCount = value.evidenceCount;
  if (typeof value.startingSanity === 'number') out.startingSanity = value.startingSanity;
  return out;
}

/** Server objective { id, textHu, done, rewardFt } (or a legacy side task) -> HUD / journal task shape. */
export function toTask(value: unknown): HudSideTask {
  const o = isRecord(value) ? value : {};
  return {
    id: optionalString(o.id),
    title: optionalString(o.textHu) || optionalString(o.title) || optionalString(o.desc) || '',
    reward: typeof o.rewardFt === 'number' ? o.rewardFt : (typeof o.reward === 'number' ? o.reward : undefined),
    completed: !!(o.done ?? o.completed)
  };
}

/** The primary objective record narrowed for the HUD, or null when the payload has none. */
export function parseObjective(value: unknown): HudObjective | null {
  if (!isRecord(value)) return null;
  const out: HudObjective = {};
  const textHu = optionalString(value.textHu);
  const title = optionalString(value.title);
  if (textHu !== undefined) out.textHu = textHu;
  if (title !== undefined) out.title = title;
  if (typeof value.done === 'boolean') out.done = value.done;
  if (typeof value.completed === 'boolean') out.completed = value.completed;
  return out;
}

/** `phobia:photo-taken` / an ItemSystem snapshot narrowed to a journal photo, or null for a non-object. */
export function parsePhoto(value: unknown): JournalPhotoEntry | null {
  if (!isRecord(value)) return null;
  const out: JournalPhotoEntry = {};
  const id = optionalString(value.id);
  const subject = optionalString(value.subject);
  if (id !== undefined) out.id = id;
  if (subject !== undefined) out.subject = subject;
  if (typeof value.stars === 'number') out.stars = value.stars;
  if (typeof value.reward === 'number') out.reward = value.reward;
  if (isString(value.dataUrl) || value.dataUrl === null) out.dataUrl = value.dataUrl;
  return out;
}

/** `phobia:verdict-result` / `phobia:match-concluded` fields (wrong-typed ones dropped), or null for a non-object. */
export function parseMatchResult(value: unknown): Partial<PhobiaMatchResult> | null {
  if (!isRecord(value)) return null;
  const out: Partial<PhobiaMatchResult> = {};
  if (typeof value.correct === 'boolean') out.correct = value.correct;
  for (const key of ['actualGhost', 'ghostType', 'reason'] as const) {
    const v = value[key];
    if (isString(v)) out[key] = v;
  }
  for (const key of ['payoutFt', 'rewardFt'] as const) {
    const v = value[key];
    if (typeof v === 'number') out[key] = v;
  }
  if (typeof value.concluded === 'boolean') out.concluded = value.concluded;
  return out;
}
