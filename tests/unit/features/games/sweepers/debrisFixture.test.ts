// The guards against the real backend output of Phase C (a byte-identical copy of
// .omc/handoffs/sweepers-c-debris-fixture.json; regenerate there with scripts/buildSweepersDebrisFixture.mjs).
import { describe, it, expect } from 'vitest';
import rawText from '../../../../fixtures/sweepers-c-debris-fixture.json?raw';
import { isRecord } from '../../../../../src/shared/lib/guards';
import {
  isToastable,
  parseActionAck,
  parseBuyAck,
  parseChunkUpdate,
  parseDebrisInit,
  parsePersonalState,
  parseSweepAck,
  type ChunkUpdate
} from '../../../../../src/features/games/sweepers/debrisTypes';
import { parseInitState, parsePlayerSnapshot, parseTickSync } from '../../../../../src/features/games/sweepers/types';
import { ITEM_KINDS, ITEM_NAMES } from '../../../../../src/features/games/sweepers/lib/debris/tables';
import { TOOLS } from '../../../../../src/features/games/sweepers/lib/tools/catalog';
import { ChunkStore } from '../../../../../src/features/games/sweepers/lib/debris/ChunkStore';
import { SWEEPERS_ERRORS } from '../../../../../src/features/games/sweepers/errors';
import { realInitPayload } from './fixtures';

const RAW: unknown = JSON.parse(rawText);
const section = (name: string): Readonly<Record<string, unknown>> => {
  const v = isRecord(RAW) ? RAW[name] : null;
  if (!isRecord(v)) throw new Error(`fixture has no ${name}`);
  return v;
};
const events = section('events');
const event = (name: string): unknown => events[name];
const list = (value: unknown, key: string): unknown[] => (isRecord(value) && Array.isArray(value[key]) ? value[key] : []);
const mustUpdate = (name: string): ChunkUpdate => {
  const u = parseChunkUpdate(event(name));
  if (!u) throw new Error(`${name} did not parse`);
  return u;
};

describe('Phase C backend fixture: tables (C.1)', () => {
  const tables = section('tables');
  it('item kinds in protocol order', () => {
    expect(tables.itemKinds).toEqual([...ITEM_KINDS]);
  });
  it('the tool table matches the client catalog (server stamina in tenths)', () => {
    const tools = Array.isArray(tables.tools) ? tables.tools : [];
    expect(tools).toHaveLength(TOOLS.length);
    tools.forEach((t: unknown, i: number) => {
      const c = TOOLS[i];
      if (!isRecord(t) || !c) throw new Error('bad tool row');
      expect({ id: t.id, name: t.name, width: t.width, reach: t.reach, region: t.region, speed: t.speed, cadence: t.cadence, cost: t.cost })
        .toEqual({ id: c.id, name: c.name, width: c.width, reach: c.reach, region: c.region, speed: c.speed, cadence: c.cadence, cost: c.cost });
      expect(t.bufferKg).toBe(c.bufKg ?? 0);
      expect(t.stamina).toBeCloseTo(c.stamina * 10, 6);
    });
  });
  it('jackpot names match the toast names', () => {
    const jackpots = Array.isArray(tables.jackpots) ? tables.jackpots : [];
    for (const j of jackpots) {
      if (!isRecord(j) || typeof j.kind !== 'number') throw new Error('bad jackpot row');
      const kind = ITEM_KINDS[j.kind];
      expect(kind && ITEM_NAMES[kind]).toBe(j.name);
    }
  });
});

describe('Phase C backend fixture: init_state', () => {
  const init = section('initState');
  it('personal, debris and the player tool parse with nothing changed', () => {
    // Phase D adds `bags` and `carry`; a Phase C payload gets their defaults
    expect(parsePersonalState(init.personal)).toEqual({ ...(isRecord(init.personal) ? init.personal : {}), bags: [0, 0, 0] });
    expect(parseDebrisInit(init.debris)).toEqual(init.debris);
    for (const p of list(init, 'players')) expect(parsePlayerSnapshot(p)).toEqual({ ...(isRecord(p) ? p : {}), carry: 0 });
  });
  it('a full init_state (Phase B fixture + the Phase C fields) parses', () => {
    const b = realInitPayload();
    if (!isRecord(b)) throw new Error('no Phase B fixture');
    const parsed = parseInitState({ ...b, ...init });
    expect(parsed?.debris).not.toBeNull();
    expect(parsed?.personal.cash).toBe(2000); // the starter grant
    expect(parsed?.hexes).toHaveLength(37);
    expect(parsed?.players[0]?.tool).toBe(0);
  });
});

describe('Phase C backend fixture: events parse with nothing dropped', () => {
  const chunkEvents = ['joinBurst', 'sweepDelta', 'kickDelta', 'dumpDelta'];
  it.each(chunkEvents)('%s', (name) => {
    const raw = event(name);
    const u = mustUpdate(name);
    expect(u.load).toHaveLength(list(raw, 'load').length);
    list(raw, 'load').forEach((entry, i) => expect(u.load[i]?.items).toHaveLength(list(entry, 'i').length));
    expect(u.load.every((l) => l.cells.length === 256)).toBe(true);
    expect(u.drop).toHaveLength(list(raw, 'drop').length);
    expect(u.cells).toHaveLength(list(raw, 'cells').length / 3);
    expect(u.add).toHaveLength(list(raw, 'add').length);
    expect(u.del).toHaveLength(list(raw, 'del').length);
    expect(u.kicks).toHaveLength(list(raw, 'kicks').length);
    expect(u.hx).toHaveLength(list(raw, 'hx').length);
  });
  it('the join burst is the 32 nearest chunks within 50 kB', () => {
    const u = mustUpdate('joinBurst');
    expect(u.load).toHaveLength(32);
    expect(JSON.stringify(event('joinBurst')).length).toBeLessThanOrEqual(50_000);
  });
  it('personal updates, acks and the tick row with tool', () => {
    for (const name of ['personalAfterSweep', 'personalAfterBuy']) {
      const raw = event(name);
      expect(parsePersonalState(raw)).toEqual({ ...(isRecord(raw) ? raw : {}), bags: [0, 0, 0] });
    }
    expect(parseSweepAck(event('sweepAck'))).toEqual(event('sweepAck'));
    expect(parseSweepAck(event('handAck'))).toEqual(event('handAck'));
    expect(parseBuyAck(event('buyAck'))).toEqual(event('buyAck'));
    expect(parseActionAck(event('selectAck'))).toEqual({ ok: true });
    expect(parseActionAck(event('dumpAck'))).toEqual({ ok: true });
    // D.5: a tick row needs 9 elements (carry); the 8-element Phase C rows are dropped now
    const tick = parseTickSync(event('tickSyncWithTool'));
    expect(list(event('tickSyncWithTool'), 'p').length).toBeGreaterThan(0);
    expect(tick?.players).toEqual([]);
  });
  it('refusals carry the C.8 text; only SWEEPERS_TOO_FAST is silent', () => {
    const refusals = section('refusals');
    for (const [key, raw] of Object.entries(refusals)) {
      const ack = parseSweepAck(raw);
      if (ack.ok) throw new Error(`${key} parsed as ok`);
      expect(isRecord(raw) && ack.error === raw.error && ack.code === raw.code).toBe(true);
      expect(isToastable(ack, true)).toBe(key !== 'tooFast');
      const text = Object.entries(SWEEPERS_ERRORS).find(([k]) => k === key)?.[1];
      if (text !== undefined && key !== 'notEnoughCash') expect(ack.error).toBe(text);
    }
    const cash = parseBuyAck(refusals.notEnoughCash);
    expect(!cash.ok && cash.error).toBe(SWEEPERS_ERRORS.notEnoughCash.replace('{price}', '6 000'));
  });
});

describe('Phase C backend fixture: applied in order to the client mirror', () => {
  it('burst → sweep delta → kick → hand pick-up → dump', () => {
    const store = new ChunkStore();
    store.apply(mustUpdate('joinBurst'));
    expect(store.chunkCount).toBe(32);
    const sweep = mustUpdate('sweepDelta');
    const first = sweep.cells[0];
    if (!first) throw new Error('no cells');
    store.apply(sweep);
    expect(store.chunkCount).toBe(48);
    expect(store.chunk(first.chunk)?.[first.idx]).toBe(first.byte);
    const kick = mustUpdate('kickDelta');
    const k = kick.kicks[0];
    if (!k) throw new Error('no kick');
    store.apply(kick);
    expect(store.item(k.id)).toMatchObject({ kind: 'can', x: k.toX, z: k.toZ, stuck: false });
    // the hand ack collected that can; the dump deletes it and re-creates the pack as a pile + items
    const hand = parseSweepAck(event('handAck'));
    expect(hand.ok && hand.items).toEqual([k.id]);
    const dump = mustUpdate('dumpDelta');
    store.apply(dump);
    expect(store.item(k.id)).toBeUndefined();
    for (const added of dump.add) expect(store.item(added.id)?.kind).toBe(added.kind);
    expect(dump.add.map((a) => a.kind).sort()).toEqual(['can', 'pile']);
  });
});
