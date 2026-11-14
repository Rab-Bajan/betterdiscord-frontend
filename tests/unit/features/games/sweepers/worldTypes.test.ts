import { describe, it, expect } from 'vitest';
import {
  BUILDING_KINDS,
  PROP_KINDS,
  parseBorder,
  parseBuilding,
  parseClock,
  parseCollider,
  parseDistrictUnlocked,
  parseHeightfield,
  parseLayout,
  parseProp,
  parseRoad,
  parseSurface,
  parseUnlockedDistricts,
  parseWeather
} from '../../../../../src/features/games/sweepers/worldTypes';
import { parseInitState } from '../../../../../src/features/games/sweepers/types';
import { REAL_FIXTURE, SMALL_INIT, realEvent, realInit, realInitPayload, smallInit } from './fixtures';
import { isRecord } from '../../../../../src/shared/lib/guards';

const rawLayout = (): Record<string, unknown> => {
  const init = realInitPayload();
  if (!isRecord(init) || !isRecord(init.layout)) throw new Error('fixture');
  return { ...init.layout };
};

describe('Phase B parsers – real backend fixture', () => {
  it('parses the whole init_state with nothing dropped', () => {
    const payload = realInitPayload();
    const raw = rawLayout();
    const init = realInit();
    const layout = init.layout;
    expect(layout.version).toBe(1);
    expect(layout.heightfield.size).toBe(61);
    expect(layout.heightfield.heightsCm).toHaveLength(61 * 61);
    for (const key of ['roads', 'buildings', 'props', 'colliders', 'surfaces', 'borders'] as const) {
      const list = raw[key];
      expect(Array.isArray(list) ? list.length : -1, key).toBe(layout[key].length);
    }
    expect(layout.landmarks.weighbridge).toMatchObject({ w: 12, d: 3.5 });
    expect(layout.landmarks.hopper).toMatchObject({ w: 4, d: 4 });
    expect(init.unlockedDistricts).toEqual([0]);
    expect(init.lifetimeEarned).toBe(0);
    expect(init.clock).toMatchObject({ dayMs: 2_160_000, daylightMs: 1_440_000, timeMs: 0, day: 1 });
    expect(init.weather).toEqual({ kind: 'clear', untilServerTime: null });
    expect(init.hexes).toHaveLength(37);
    expect(isRecord(payload)).toBe(true);
  });

  it('knows every building and prop kind the backend emits', () => {
    const layout = realInit().layout;
    for (const b of layout.buildings) expect(BUILDING_KINDS).toContain(b.kind);
    for (const p of layout.props) expect(PROP_KINDS).toContain(p.kind);
    expect(layout.props.filter((p) => p.kind === 'hex_lamp')).toHaveLength(37);
  });

  it('parses the recorded events', () => {
    const base = realInit().clock;
    expect(parseClock(realEvent('clockOnJoin'), base)).toMatchObject({ timeMs: 0, day: 1, dayMs: 2_160_000 });
    expect(parseClock(realEvent('clockPeriodic'), base)).toMatchObject({ timeMs: 1_749_681, day: 3 });
    expect(parseWeather(realEvent('weather'))).toEqual({ kind: 'smog', untilServerTime: 1_750_006_632_862 });
    expect(parseDistrictUnlocked(realEvent('districtUnlocked'))).toEqual({ district: 1, unlockedDistricts: [0, 1] });
    expect(isRecord(REAL_FIXTURE)).toBe(true);
  });
});

describe('Phase B parsers – own fixture and malformed input', () => {
  it('parses the hand-made fixture (no borders key)', () => {
    const init = smallInit();
    expect(init.layout.buildings).toHaveLength(BUILDING_KINDS.length);
    expect(init.layout.borders).toEqual([]);
    expect(init.unlockedDistricts).toEqual([0, 1]);
    expect(init.weather.kind).toBe('drizzle');
    expect(init.clock).toMatchObject({ timeMs: 600_000, day: 2 });
    expect(isRecord(SMALL_INIT)).toBe(true);
  });

  it('keeps the Phase A init working without any Phase B field', () => {
    const init = parseInitState({ roomId: 'r', selfId: 1, serverTime: 5, players: [], hexes: [] });
    expect(init?.layout).toBeNull();
    expect(init?.unlockedDistricts).toEqual([0]);
    expect(init?.lifetimeEarned).toBe(0);
    expect(init?.clock).toMatchObject({ timeMs: 0, day: 1, serverTime: 5 });
    expect(init?.weather).toEqual({ kind: 'clear', untilServerTime: null });
  });

  it('rejects an unusable layout core but keeps the rest of init_state', () => {
    const init = realInitPayload();
    if (!isRecord(init)) throw new Error('fixture');
    expect(parseInitState({ ...init, layout: { ...rawLayout(), version: 2 } })?.layout).toBeNull();
    expect(parseInitState({ ...init, layout: { ...rawLayout(), landmarks: {} } })?.layout).toBeNull();
    expect(parseInitState({ ...init, layout: 'nope' })?.layout).toBeNull();
    expect(parseInitState({ ...init, layout: null })?.roomId).toBe('hang-chill');
  });

  it('validates the heightfield', () => {
    expect(parseHeightfield({ origin: 0, cell: 1, size: 2, heightsCm: [0, 1, 2, 3] })?.heightsCm).toEqual(new Int32Array([0, 1, 2, 3]));
    expect(parseHeightfield({ origin: 0, cell: 1, size: 2, heightsCm: [0, 1, 2] })).toBeNull();
    expect(parseHeightfield({ origin: 0, cell: 1, size: 2, heightsCm: [0, 1, 2, 3.5] })).toBeNull();
    expect(parseHeightfield({ origin: 0, cell: 0, size: 2, heightsCm: [0, 1, 2, 3] })).toBeNull();
    expect(parseHeightfield({ origin: 0, cell: 1, size: 100000, heightsCm: [] })).toBeNull();
  });

  it('drops malformed entries one by one', () => {
    expect(parseRoad({ kind: 'road', width: 7, points: [[0, 0], [1, 1]] })).toEqual({ kind: 'road', width: 7, points: [[0, 0], [1, 1]] });
    expect(parseRoad({ kind: 'road', width: 7, points: [[0, 0], ['x', 1], [2, 2]] })?.points).toEqual([[0, 0], [2, 2]]);
    expect(parseRoad({ kind: 'road', width: 7, points: [[0, 0]] })).toBeNull();
    expect(parseRoad({ kind: 'canal', width: 7, points: [[0, 0], [1, 1]] })).toBeNull();
    expect(parseBuilding({ id: 'x', kind: 'panel10', district: 6, x: 0, z: 0, w: 1, d: 1, h: 1, rotY: 0 })).toBeNull();
    expect(parseBuilding({ id: 'x', kind: 'castle', district: 1, x: 0, z: 0, w: 1, d: 1, h: 1, rotY: 0 })).toBeNull();
    expect(parseBuilding({ id: 'x', kind: 'panel10', district: 1, x: 0, z: 0, w: -1, d: 1, h: 1, rotY: 0 })).toBeNull();
    expect(parseProp({ kind: 'tree', x: 1, z: 2, rotY: 0 })).toEqual({ kind: 'tree', x: 1, z: 2, rotY: 0, s: 1 });
    expect(parseProp({ kind: 'tree', x: Infinity, z: 2, rotY: 0 })).toBeNull();
    expect(parseCollider({ shape: 'cyl', x: 0, z: 0, r: 1, h: 2 })).toEqual({ shape: 'cyl', x: 0, z: 0, r: 1, h: 2 });
    expect(parseCollider({ shape: 'box', x: 0, z: 0, w: 1, d: 1, h: 2 })).toBeNull();
    expect(parseCollider({ shape: 'cone', x: 0, z: 0, r: 1, h: 2 })).toBeNull();
    expect(parseSurface({ kind: 'mud', shape: 'square', x: 0, z: 0, r: 1 })).toBeNull();
    expect(parseSurface({ kind: 'lava', shape: 'circle', x: 0, z: 0, r: 1 })).toBeNull();
    expect(parseBorder({ a: 0, b: 0, x: 0, z: 0, rotY: 0, len: 40 })).toBeNull();
    expect(parseBorder({ a: 0, b: 3, x: 0, z: 0, rotY: 0, len: 40 })).toEqual({ a: 0, b: 3, x: 0, z: 0, rotY: 0, len: 40 });
    const layout = parseLayout({ ...rawLayout(), buildings: [null, 4, { id: 'ok', kind: 'chimney', district: 3, x: 0, z: 0, w: 3, d: 3, h: 40, rotY: 0 }] });
    expect(layout?.buildings.map((b) => b.id)).toEqual(['ok']);
  });

  it('guards the unlock list, the clock, the weather and the unlock event', () => {
    expect(parseUnlockedDistricts([3, 3, 'x', 9, -1, 1])).toEqual([0, 1, 3]);
    expect(parseUnlockedDistricts(null)).toEqual([0]);
    expect(parseClock({ timeMs: -1, day: 1, serverTime: 0 })).toBeNull();
    expect(parseClock({ timeMs: 1, day: 1 })).toBeNull();
    expect(parseClock({ timeMs: 2_200_000, day: 1, serverTime: 0 })?.timeMs).toBe(40_000);
    expect(parseClock({ timeMs: 5, day: 'x', serverTime: 0, dayMs: 100, daylightMs: 400 })).toMatchObject({ dayMs: 100, daylightMs: 100, day: 1 });
    expect(parseWeather({ kind: 'hail' })).toBeNull();
    expect(parseWeather({ kind: 'drizzle', untilServerTime: 'soon' })).toEqual({ kind: 'drizzle', untilServerTime: null });
    expect(parseDistrictUnlocked({ district: 4, unlockedDistricts: [1] })).toEqual({ district: 4, unlockedDistricts: [0, 1, 4] });
    expect(parseDistrictUnlocked({ district: 'x' })).toBeNull();
  });
});
