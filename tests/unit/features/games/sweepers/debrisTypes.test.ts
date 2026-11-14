import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PERSONAL,
  EMPTY_LOAD,
  decodeBase64,
  decodeItemRow,
  isToastable,
  parseActionAck,
  parseBuyAck,
  parseChunkUpdate,
  parseDebrisInit,
  parseLoad,
  parsePersonalState,
  parseSweepAck
} from '../../../../../src/features/games/sweepers/debrisTypes';
import { parseInitState } from '../../../../../src/features/games/sweepers/types';
import { ITEM_KINDS } from '../../../../../src/features/games/sweepers/lib/debris/tables';
import { base64, itemRow, loadEntry, uniformCells } from './debrisHelpers';

const load = { dustG: 1200, seedG: 300, cans: 4, crushed: 2, ironG: 5000, copperG: 1500, jackpots: [6], kg: 8.2, l: 9.75 };
const personal = {
  cash: 2000,
  toolTier: 2,
  backpackTier: 1,
  totalKg: 12.5,
  owned: 0b10000101,
  widthLvl: 2,
  hardLvl: 1,
  gloves: true,
  dur: [1000, 640, 1000],
  fuelMl: 1500,
  stamina: 735,
  clogged: false,
  buf: load,
  pack: EMPTY_LOAD,
  caps: { bufKg: 8, packKg: 25, packL: 30 },
  fx: { stench: 123_000, kofola: 99_000 },
  bags: [3, 0, 1]
};

describe('Phase C PersonalState guard (C.5)', () => {
  it('parses the full state as sent', () => {
    expect(parsePersonalState(personal)).toEqual(personal);
  });
  it('defaults every field on its own (a Phase A personal parses too)', () => {
    expect(parsePersonalState({ cash: 5 })).toEqual({ ...DEFAULT_PERSONAL, cash: 5 });
    expect(parsePersonalState({ ...personal, gloves: 'yes', dur: [2000, -1], fuelMl: 9999, stamina: 'full', fx: { beer: 'x', kofola: 1 } }))
      .toEqual({ ...personal, gloves: false, dur: [1000, 0, 1000], fuelMl: 2000, stamina: 1000, fx: { kofola: 1 } });
  });
  it('keeps bits 0 and 7 owned and unequips a tool that is not owned (C.6)', () => {
    expect(parsePersonalState({ ...personal, owned: 0 })?.owned).toBe(0b10000001);
    expect(parsePersonalState({ ...personal, owned: 0b10000001, toolTier: 2 })?.toolTier).toBe(0);
    expect(parsePersonalState({ ...personal, toolTier: 7 })?.toolTier).toBe(7);
    // out-of-range integers fall back to the default (C.6), they are not clamped to the bound
    expect(parsePersonalState({ ...personal, toolTier: 9 })?.toolTier).toBe(0);
    expect(parsePersonalState({ ...personal, backpackTier: 9 })?.backpackTier).toBe(0);
    expect(parsePersonalState({ ...personal, widthLvl: -1, hardLvl: 4 })).toMatchObject({ widthLvl: 0, hardLvl: 0 });
  });
  it('rejects a payload without cash', () => {
    expect(parsePersonalState(null)).toBeNull();
    expect(parsePersonalState({ ...personal, cash: '2000' })).toBeNull();
    expect(parsePersonalState([])).toBeNull();
  });
  it('parses loads with only jackpot kinds 5..7', () => {
    expect(parseLoad({ ...load, jackpots: [5, 4, 7, 'x', 8] }).jackpots).toEqual([5, 7]);
    expect(parseLoad('junk')).toEqual(EMPTY_LOAD);
  });
});

describe('Phase C init_state additions', () => {
  it('reads debris and the full personal state; an older server keeps null debris', () => {
    const base = { roomId: 'r', selfId: 1, serverTime: 0, players: [], hexes: [] };
    const debris = { gen: 1, origin: -256, chunkM: 8, cellM: 0.5, n: 64, loadM: 48 };
    const init = parseInitState({ ...base, personal, debris });
    expect(init?.debris).toEqual(debris);
    expect(init?.personal).toEqual(personal);
    expect(parseInitState(base)?.debris).toBeNull();
  });
  it('refuses a grid the client does not speak', () => {
    const debris = { gen: 1, origin: -256, chunkM: 8, cellM: 0.5, n: 64, loadM: 48 };
    expect(parseDebrisInit(debris)).toEqual(debris);
    expect(parseDebrisInit({ ...debris, cellM: 0.25 })).toBeNull();
    expect(parseDebrisInit({ ...debris, gen: '1' })).toBeNull();
    expect(parseDebrisInit(undefined)).toBeNull();
  });
});

describe('ItemRow decoding (C.2)', () => {
  it('decodes id, kind, cm, rot8, flags and dg', () => {
    expect(decodeItemRow([0x0003_0007, 0, 150, -275, 64 | (1 << 8), 5])).toEqual({
      id: 0x0003_0007, kind: 'can', x: 1.5, z: -2.75, rot: Math.PI / 2, stuck: true, buried: false, massKg: 0.05, seedKg: 0
    });
    expect(decodeItemRow([9, 2, 0, 0, 2 << 8, 300])).toMatchObject({ kind: 'copper', buried: true, stuck: false, massKg: 3 });
  });
  it('reads a pile’s seed share (7th element) and clamps it to the total', () => {
    expect(decodeItemRow(itemRow({ id: 1, kind: 'pile', x: 0, z: 0, massKg: 12, seedKg: 4 }))).toMatchObject({ kind: 'pile', massKg: 12, seedKg: 4 });
    expect(decodeItemRow([1, 3, 0, 0, 0, 100, 500])?.seedKg).toBe(1);
    expect(decodeItemRow([1, 3, 0, 0, 0, 100])?.seedKg).toBe(0);
    expect(decodeItemRow([1, 0, 0, 0, 0, 5, 3])?.seedKg).toBe(0); // only piles carry seed
  });
  it('drops malformed rows', () => {
    expect(decodeItemRow([1, 8, 0, 0, 0, 5])).toBeNull(); // unknown kind
    expect(decodeItemRow([1, 0, 1.5, 0, 0, 5])).toBeNull(); // cm must be integers
    expect(decodeItemRow([1, 0, 0, 0, 0])).toBeNull();
    expect(decodeItemRow([-1, 0, 0, 0, 0, 5])).toBeNull();
    expect(decodeItemRow({ id: 1 })).toBeNull();
    expect(decodeItemRow([1, 0, 0, 0, 0, -5])).toBeNull();
  });
  it('keeps the protocol kind order', () => {
    expect(ITEM_KINDS).toEqual(['can', 'iron', 'copper', 'pile', 'cabbage', 'cauldron', 'catalyst', 'lenin']);
  });
});

describe('debris_chunk_update guard (C.5)', () => {
  it('decodes base64 chunks of exactly 256 bytes', () => {
    const cells = uniformCells(0x5a);
    expect(decodeBase64(base64(cells))).toEqual(cells);
    expect(decodeBase64('not base64!')).toBeNull();
    const short = parseChunkUpdate({ t: 1, load: [{ id: 5, c: base64(new Uint8Array(255)), i: [] }] });
    expect(short?.load).toEqual([]);
  });
  it('parses every part and drops malformed entries one by one', () => {
    const update = parseChunkUpdate({
      t: 1000,
      load: [loadEntry(2080, uniformCells(0x31), [{ id: 7, kind: 'can', x: 4.2, z: 3.1, massKg: 0.05 }]), { id: 4096, c: '', i: [] }, 'junk'],
      drop: [5, 4096, -1, 'x', 6],
      cells: [2080, 3, 0x10, 2080, 256, 1, 9999, 0, 0, 2080, 4, 0x100, 2081, 0, 0],
      add: [itemRow({ id: 8, kind: 'iron', x: 1, z: 2, massKg: 7.5 }), [1, 2]],
      del: [7, 'a', -3, 9],
      kicks: [[7, 100, 200, 300, 400], [7, 1, 2]],
      hx: [[3, 512], [4, 1200], ['x', 1]]
    });
    expect(update?.load.map((l) => l.id)).toEqual([2080]);
    expect(update?.load[0]?.cells[0]).toBe(0x31);
    expect(update?.load[0]?.items.map((i) => i.id)).toEqual([7]);
    expect(update?.drop).toEqual([5, 6]);
    expect(update?.cells).toEqual([{ chunk: 2080, idx: 3, byte: 0x10 }, { chunk: 2081, idx: 0, byte: 0 }]);
    expect(update?.add.map((i) => i.id)).toEqual([8]);
    expect(update?.del).toEqual([7, 9]);
    expect(update?.kicks).toEqual([{ id: 7, fromX: 1, fromZ: 2, toX: 3, toZ: 4 }]);
    expect(update?.hx).toEqual([{ hexId: 3, c10: 512 }, { hexId: 4, c10: 1000 }]);
  });
  it('needs a server time; every list is optional', () => {
    expect(parseChunkUpdate({ load: [] })).toBeNull();
    expect(parseChunkUpdate(null)).toBeNull();
    expect(parseChunkUpdate({ t: 5 })).toEqual({ t: 5, load: [], drop: [], cells: [], add: [], del: [], kicks: [], hx: [] });
  });
});

describe('Phase C acks (C.4)', () => {
  it('sweep_hit: success, refusal with code, and a malformed ack as a silent refusal', () => {
    expect(parseSweepAck({ ok: true, seq: 4, kg: 0.315, items: [7, 'x', 9], pushed: true })).toEqual({ ok: true, seq: 4, kg: 0.315, items: [7, 9], pushed: true });
    const refusal = parseSweepAck({ ok: false, error: 'Tele a tartály.', code: 'tankFull' });
    expect(refusal).toEqual({ ok: false, error: 'Tele a tartály.', code: 'tankFull' });
    expect(!refusal.ok && isToastable(refusal, true)).toBe(true);
    const malformed = parseSweepAck(undefined);
    expect(malformed.ok).toBe(false);
    expect(!malformed.ok && isToastable(malformed, true)).toBe(false);
    expect(parseSweepAck({ ok: true }).ok).toBe(false);
  });
  it('cadence refusals and a rate-limited sweep stay silent (C.8)', () => {
    const tooFast = parseSweepAck({ ok: false, error: 'x', code: 'SWEEPERS_TOO_FAST' });
    const limited = parseSweepAck({ ok: false, error: 'x', code: 'SWEEPERS_RATE_LIMITED' });
    expect(!tooFast.ok && isToastable(tooFast, true)).toBe(false);
    expect(!limited.ok && isToastable(limited, true)).toBe(false);
    expect(!limited.ok && isToastable(limited, false)).toBe(true); // a rate-limited buy or action is shown
  });
  it('player_action and buy_upgrade', () => {
    expect(parseActionAck({ ok: true })).toEqual({ ok: true });
    expect(parseActionAck({ ok: false, error: 'Üres a hátizsák.', code: 'emptyPack' })).toEqual({ ok: false, error: 'Üres a hátizsák.', code: 'emptyPack' });
    expect(parseBuyAck({ ok: true, cash: 500 })).toEqual({ ok: true, cash: 500 });
    expect(parseBuyAck({ ok: true }).ok).toBe(false);
    expect(parseBuyAck({ ok: false, error: 'Nincs elég pénzed: 1 500 Ft kell.' })).toEqual({ ok: false, error: 'Nincs elég pénzed: 1 500 Ft kell.', code: null });
  });
});
