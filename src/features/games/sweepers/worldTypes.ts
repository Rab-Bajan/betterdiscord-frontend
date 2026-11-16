// MiskolcSweepers Phase B: a városelrendezés (layout), az óra, az időjárás és a kerületnyitás
// protokolltípusai és őrzői. Minden bejövő mező ellenőrzött; a hibás elem kiesik, a hibás mag null.
import { isRecord, isString } from '../../../shared/lib/guards';

export const BUILDING_KINDS = [
  'panel10',
  'kukatarolo',
  'playground',
  'market_row',
  'market_stall',
  'factory_hall',
  'chimney',
  'gantry_crane',
  'ore_wagon',
  'bus_shelter',
  'bus_platform',
  'ticket_kiosk',
  'subway_stairs',
  'wine_cellar',
  'tv_tower',
  'lookout',
  'scrap_fence',
  'office_container',
  'weighbridge',
  'hopper',
  'led_display',
  'generator',
  'sorting_shed',
  'scrap_pile'
] as const;
export type BuildingKind = (typeof BUILDING_KINDS)[number];

export const PROP_KINDS = [
  'hex_lamp',
  'street_lamp',
  'bench',
  'tree',
  'bin',
  'fence',
  'curb_ramp',
  'crate',
  'cardboard',
  'awning',
  'rail_segment',
  'iron_beam',
  'satellite_dish',
  'laundry',
  'hazard_tape',
  'stair_flight'
] as const;
export type PropKind = (typeof PROP_KINDS)[number];

export const ROAD_KINDS = ['road', 'sidewalk', 'rail', 'path', 'stairs'] as const;
export type RoadKind = (typeof ROAD_KINDS)[number];

export const SURFACE_KINDS = ['wet', 'mud', 'grease', 'acid'] as const;
export type SurfaceKind = (typeof SURFACE_KINDS)[number];

export const WEATHER_KINDS = ['clear', 'smog', 'drizzle'] as const;
export type WeatherKind = (typeof WEATHER_KINDS)[number];

export const DISTRICT_COUNT = 6;
export const LAYOUT_VERSION = 1;

export interface Heightfield {
  readonly origin: number;
  readonly cell: number;
  readonly size: number;
  /** Row-major: index = iz * size + ix. */
  readonly heightsCm: Int32Array;
}

export interface RoadPath {
  readonly kind: RoadKind;
  readonly width: number;
  readonly points: ReadonlyArray<readonly [number, number]>;
}

export interface LayoutBuilding {
  readonly id: string;
  readonly kind: BuildingKind;
  readonly district: number;
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly h: number;
  readonly rotY: number;
}

export interface LayoutProp {
  readonly kind: PropKind;
  readonly x: number;
  readonly z: number;
  readonly rotY: number;
  readonly s: number;
}

export type Collider =
  | { readonly shape: 'box'; readonly x: number; readonly z: number; readonly w: number; readonly d: number; readonly h: number; readonly rotY: number }
  | { readonly shape: 'cyl'; readonly x: number; readonly z: number; readonly r: number; readonly h: number };

export interface Surface {
  readonly kind: SurfaceKind;
  readonly x: number;
  readonly z: number;
  readonly r: number;
}

/** One hex edge between two districts (backend addition): midpoint, rotY along the edge, length. */
export interface LayoutBorder {
  readonly a: number;
  readonly b: number;
  readonly x: number;
  readonly z: number;
  readonly rotY: number;
  readonly len: number;
}

export interface Placement {
  readonly x: number;
  readonly z: number;
  readonly rotY: number;
}

export interface Landmarks {
  readonly weighbridge: Placement & { readonly w: number; readonly d: number };
  readonly hopper: Placement & { readonly w: number; readonly d: number };
  readonly office: Placement;
  readonly generator: Placement;
}

export interface WorldLayout {
  readonly version: number;
  readonly heightfield: Heightfield;
  readonly roads: readonly RoadPath[];
  readonly buildings: readonly LayoutBuilding[];
  readonly props: readonly LayoutProp[];
  readonly colliders: readonly Collider[];
  readonly surfaces: readonly Surface[];
  /** District borders; the client tapes those with exactly one side unlocked. Empty when not sent. */
  readonly borders: readonly LayoutBorder[];
  readonly landmarks: Landmarks;
}

export const DAY_MS = 2_160_000;
export const DAYLIGHT_MS = 1_440_000;

export interface ClockState {
  readonly dayMs: number;
  readonly daylightMs: number;
  /** 0..dayMs, 0 = sunrise. */
  readonly timeMs: number;
  readonly day: number;
  /** Server time the sample was taken at. */
  readonly serverTime: number;
}

export interface WeatherState {
  readonly kind: WeatherKind;
  readonly untilServerTime: number | null;
}

export interface DistrictUnlocked {
  readonly district: number;
  readonly unlockedDistricts: readonly number[];
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isInt = (value: unknown): value is number => Number.isInteger(value);
const isPositive = (value: unknown): value is number => isFiniteNumber(value) && value > 0;
const isNonNegative = (value: unknown): value is number => isFiniteNumber(value) && value >= 0;
const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  isString(value) && (list as readonly string[]).includes(value);
const isDistrict = (value: unknown): value is number => isInt(value) && value >= 0 && value < DISTRICT_COUNT;

/** Hard caps so a hostile payload cannot make the client allocate without bound. */
const MAX_HEIGHTFIELD_SIZE = 257;
const MAX_ENTRIES = 20_000;
const MAX_ROAD_POINTS = 2_000;

const listOf = <T>(value: unknown, parse: (entry: unknown) => T | null): T[] =>
  Array.isArray(value) ? value.slice(0, MAX_ENTRIES).flatMap((entry: unknown) => parse(entry) ?? []) : [];

export function parseHeightfield(value: unknown): Heightfield | null {
  if (!isRecord(value)) return null;
  const { origin, cell, size, heightsCm } = value;
  if (!isFiniteNumber(origin) || !isPositive(cell) || !isInt(size) || size < 2 || size > MAX_HEIGHTFIELD_SIZE) return null;
  if (!Array.isArray(heightsCm) || heightsCm.length !== size * size) return null;
  const heights = new Int32Array(heightsCm.length);
  for (let i = 0; i < heightsCm.length; i++) {
    const h: unknown = heightsCm[i];
    if (!isInt(h) || Math.abs(h) > 100_000) return null;
    heights[i] = h;
  }
  return { origin, cell, size, heightsCm: heights };
}

function parsePoint(value: unknown): readonly [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const [x, z]: unknown[] = value;
  return isFiniteNumber(x) && isFiniteNumber(z) ? [x, z] : null;
}

export function parseRoad(value: unknown): RoadPath | null {
  if (!isRecord(value) || !oneOf(ROAD_KINDS, value.kind) || !isPositive(value.width) || !Array.isArray(value.points)) return null;
  // not flatMap: a point is itself an array and would be flattened
  const points: (readonly [number, number])[] = [];
  for (const entry of value.points.slice(0, MAX_ROAD_POINTS)) {
    const point = parsePoint(entry);
    if (point) points.push(point);
  }
  return points.length >= 2 ? { kind: value.kind, width: value.width, points } : null;
}

export function parseBuilding(value: unknown): LayoutBuilding | null {
  if (!isRecord(value)) return null;
  const { id, kind, district, x, z, w, d, h, rotY } = value;
  if (!isString(id) || !oneOf(BUILDING_KINDS, kind) || !isDistrict(district)) return null;
  if (!isFiniteNumber(x) || !isFiniteNumber(z) || !isPositive(w) || !isPositive(d) || !isPositive(h) || !isFiniteNumber(rotY)) return null;
  return { id, kind, district, x, z, w, d, h, rotY };
}

export function parseProp(value: unknown): LayoutProp | null {
  if (!isRecord(value)) return null;
  const { kind, x, z, rotY, s } = value;
  if (!oneOf(PROP_KINDS, kind) || !isFiniteNumber(x) || !isFiniteNumber(z) || !isFiniteNumber(rotY)) return null;
  return { kind, x, z, rotY, s: isPositive(s) ? s : 1 };
}

export function parseCollider(value: unknown): Collider | null {
  if (!isRecord(value)) return null;
  const { shape, x, z, h } = value;
  if (!isFiniteNumber(x) || !isFiniteNumber(z) || !isFiniteNumber(h)) return null;
  if (shape === 'box') {
    const { w, d, rotY } = value;
    if (!isPositive(w) || !isPositive(d) || !isFiniteNumber(rotY)) return null;
    return { shape, x, z, w, d, h, rotY };
  }
  if (shape === 'cyl') {
    return isPositive(value.r) ? { shape, x, z, r: value.r, h } : null;
  }
  return null;
}

export function parseSurface(value: unknown): Surface | null {
  if (!isRecord(value) || !oneOf(SURFACE_KINDS, value.kind) || value.shape !== 'circle') return null;
  const { x, z, r } = value;
  return isFiniteNumber(x) && isFiniteNumber(z) && isPositive(r) ? { kind: value.kind, x, z, r } : null;
}

export function parseBorder(value: unknown): LayoutBorder | null {
  if (!isRecord(value)) return null;
  const { a, b, x, z, rotY, len } = value;
  if (!isDistrict(a) || !isDistrict(b) || a === b) return null;
  if (!isFiniteNumber(x) || !isFiniteNumber(z) || !isFiniteNumber(rotY) || !isPositive(len)) return null;
  return { a, b, x, z, rotY, len };
}

function parsePlacement(value: unknown): Placement | null {
  if (!isRecord(value)) return null;
  const { x, z, rotY } = value;
  return isFiniteNumber(x) && isFiniteNumber(z) ? { x, z, rotY: isFiniteNumber(rotY) ? rotY : 0 } : null;
}

function parseSized(value: unknown, w: number, d: number): (Placement & { w: number; d: number }) | null {
  const base = parsePlacement(value);
  if (!base || !isRecord(value)) return null;
  return { ...base, w: isPositive(value.w) ? value.w : w, d: isPositive(value.d) ? value.d : d };
}

export function parseLandmarks(value: unknown): Landmarks | null {
  if (!isRecord(value)) return null;
  const weighbridge = parseSized(value.weighbridge, 12, 3.5);
  const hopper = parseSized(value.hopper, 4, 4);
  const office = parsePlacement(value.office);
  const generator = parsePlacement(value.generator);
  if (!weighbridge || !hopper || !office || !generator) return null;
  return { weighbridge, hopper, office, generator };
}

/**
 * `init_state.layout`. Null (the client keeps the flat Phase A world) when the version is unknown or
 * the heightfield / landmarks are unusable; malformed list entries are dropped one by one.
 */
export function parseLayout(value: unknown): WorldLayout | null {
  if (!isRecord(value) || value.version !== LAYOUT_VERSION) return null;
  const heightfield = parseHeightfield(value.heightfield);
  const landmarks = parseLandmarks(value.landmarks);
  if (!heightfield || !landmarks) return null;
  return {
    version: LAYOUT_VERSION,
    heightfield,
    roads: listOf(value.roads, parseRoad),
    buildings: listOf(value.buildings, parseBuilding),
    props: listOf(value.props, parseProp),
    colliders: listOf(value.colliders, parseCollider),
    surfaces: listOf(value.surfaces, parseSurface),
    borders: listOf(value.borders, parseBorder),
    landmarks
  };
}

/** District id list; always contains 0, sorted, deduplicated. */
export function parseUnlockedDistricts(value: unknown): number[] {
  const ids = new Set<number>([0]);
  if (Array.isArray(value)) for (const id of value) if (isDistrict(id)) ids.add(id);
  return [...ids].sort((a, b) => a - b);
}

export const DEFAULT_CLOCK: ClockState = { dayMs: DAY_MS, daylightMs: DAYLIGHT_MS, timeMs: 0, day: 1, serverTime: 0 };

/**
 * `init_state.clock` (full) or `miskolc:clock` `{ timeMs, day, serverTime }` (day lengths from
 * `base`). Null when the sample is unusable.
 */
export function parseClock(value: unknown, base: ClockState = DEFAULT_CLOCK): ClockState | null {
  if (!isRecord(value)) return null;
  const { timeMs, day, serverTime } = value;
  const dayMs = isPositive(value.dayMs) ? value.dayMs : base.dayMs;
  const daylightMs = isPositive(value.daylightMs) && value.daylightMs < dayMs ? value.daylightMs : Math.min(base.daylightMs, dayMs);
  if (!isNonNegative(timeMs) || !isFiniteNumber(serverTime)) return null;
  return {
    dayMs,
    daylightMs,
    timeMs: timeMs % dayMs,
    day: isInt(day) && day >= 0 ? day : base.day,
    serverTime
  };
}

/** `init_state.weather` / `miskolc:weather`. Null when the kind is unknown. */
export function parseWeather(value: unknown): WeatherState | null {
  if (!isRecord(value) || !oneOf(WEATHER_KINDS, value.kind)) return null;
  return { kind: value.kind, untilServerTime: isFiniteNumber(value.untilServerTime) ? value.untilServerTime : null };
}

/** `miskolc:district_unlocked { district, unlockedDistricts }`. */
export function parseDistrictUnlocked(value: unknown): DistrictUnlocked | null {
  if (!isRecord(value) || !isDistrict(value.district)) return null;
  const unlocked = parseUnlockedDistricts(value.unlockedDistricts);
  if (!unlocked.includes(value.district)) unlocked.push(value.district);
  return { district: value.district, unlockedDistricts: unlocked.sort((a, b) => a - b) };
}
