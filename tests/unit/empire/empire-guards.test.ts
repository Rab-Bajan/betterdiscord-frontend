import { describe, it, expect } from 'vitest';
import { isChatPayload, isEmpireSnapshot, isEmpireTick, isMatchResults, isMatchSummary } from '../../../src/features/games/empire/types';
import { isResKey, normalizeContent, reqEpoch } from '../../../src/features/games/empire/lib/empireContent';
import { DEFAULT_DEMOLISH, demolishRefundPreview, refundText } from '../../../src/features/games/empire/lib/empireDemolish';
import type { BuildingDef } from '../../../src/features/games/empire/types';

describe('MiskolcEmpire socket payload guards', () => {
  it('accepts a snapshot as sendSnapshot emits it (simulation snapshot + roomId)', () => {
    const snap = {
      roomId: 'r1', status: 'playing', tick: 3, tickHz: 10, you: { idx: 0, team: 0 },
      players: [{ idx: 0, name: 'Bence', team: 0, color: '#e74c3c', isAi: false, alive: true, connected: true, epoch: 1, spectator: false }],
      map: { w: 4, h: 4, tiles: 'g'.repeat(16) }, nodes: [], units: [], buildings: [], res: { iron: 0 }, paused: null, spy: []
    };
    expect(isEmpireSnapshot(snap)).toBe(true);
  });

  it('rejects a snapshot without room id or map', () => {
    expect(isEmpireSnapshot({ map: { w: 1, h: 1, tiles: 'g' } })).toBe(false);
    expect(isEmpireSnapshot({ roomId: 'r1' })).toBe(false);
    expect(isEmpireSnapshot({ roomId: 'r1', map: 'g' })).toBe(false);
    expect(isEmpireSnapshot(null)).toBe(false);
    expect(isEmpireSnapshot([{ roomId: 'r1', map: {} }])).toBe(false);
  });

  it('a tick only needs its tick number (view.js buildTick sends only what changed)', () => {
    expect(isEmpireTick({ t: 12 })).toBe(true);
    expect(isEmpireTick({ t: 12, u: [{ i: 1, x: 2 }], x: [5], ev: [{ e: 'hit', i: 1 }] })).toBe(true);
    expect(isEmpireTick({ t: '12' })).toBe(false);
    expect(isEmpireTick({})).toBe(false);
    expect(isEmpireTick(undefined)).toBe(false);
  });

  it('match summaries and results are keyed by room id', () => {
    const summary = {
      roomId: 'r1', channelId: null, name: 'Szoba', mode: '1v1', status: 'lobby', active: true, startedBy: 'Bence', host: 0,
      players: [{ idx: 0, name: 'Bence', team: 0, color: '#e74c3c', isAi: false, connected: true }], maxPlayers: 2, difficulty: 'medium', mapSize: null
    };
    expect(isMatchSummary(summary)).toBe(true);
    expect(isMatchSummary({ name: 'Szoba' })).toBe(false);
    expect(isMatchResults({ roomId: 'r1', winnerTeam: 0, results: [{ idx: 0, name: 'Bence', team: 0, won: true }] })).toBe(true);
    expect(isMatchResults({ winnerTeam: 0 })).toBe(false);
  });

  it('chat payloads need text; the sender fields are optional', () => {
    expect(isChatPayload({ from: '[Néző] Bence', idx: 0, text: 'szia', spectator: true, t: 1 })).toBe(true);
    expect(isChatPayload({ text: '' })).toBe(true);
    expect(isChatPayload({ from: 'Bence' })).toBe(false);
    expect(isChatPayload({ text: 5 })).toBe(false);
  });
});

describe('MiskolcEmpire content helpers', () => {
  it('isResKey accepts only the four resources, not inherited object keys', () => {
    expect(['iron', 'copper', 'food', 'wood'].every(isResKey)).toBe(true);
    expect(isResKey('gold')).toBe(false);
    expect(isResKey('toString')).toBe(false);
  });

  it('normalizeContent accepts arrays or id-keyed objects and sorts epochs', () => {
    const c = normalizeContent({ epochs: [{ id: 2, name: 'B' }, { id: 1, name: 'A' }], units: [{ id: 'knife', hp: 70 }], buildings: { house: { size: 2 } } });
    expect(c.epochs.map((e) => [e.n, e.name])).toEqual([[1, 'A'], [2, 'B']]);
    expect(c.units.knife?.hp).toBe(70);
    expect(c.buildings.house?.id).toBe('house');
    expect(normalizeContent(null).unitList).toEqual([]);
    // ids are coerced to strings, so a numeric array id still indexes and compares as a string
    const n = normalizeContent({ units: [{ id: 7, name: 'Hét' }, { name: 'Névtelen' }], buildings: [{ id: 3 }] });
    expect(n.unitList.map((u) => u.id)).toEqual(['7', '1']);
    expect(n.units['7']?.name).toBe('Hét');
    expect(n.buildingList[0]?.id).toBe('3');
  });

  it('reqEpoch reads epoch, requires.epoch or minEpoch and defaults to 1', () => {
    expect(reqEpoch({ epoch: 3 })).toBe(3);
    expect(reqEpoch({ requires: { epoch: 2 } })).toBe(2);
    expect(reqEpoch({ minEpoch: '4' })).toBe(4);
    expect(reqEpoch({})).toBe(1);
    expect(reqEpoch(null)).toBe(1);
  });
});

describe('MiskolcEmpire demolish refund preview', () => {
  const house: BuildingDef = {
    id: 'house', cost: { wood: 100, iron: 20 },
    upgrades: [{ cost: { wood: 70, iron: 20 } }, { cost: { wood: 90, iron: 40, copper: 20 } }]
  };
  const done = { bp: 100, hp: 300, mhp: 300, lv: 1, up: -1 };

  it('an unfinished building returns maxRefund scaled by build progress', () => {
    expect(demolishRefundPreview(house, { ...done, bp: 50 })).toEqual({ wood: 25, iron: 5 });
  });

  it('a healthy finished building returns maxRefund, a half-dead one minRefund, a wreck nearly nothing', () => {
    expect(demolishRefundPreview(house, done)).toEqual({ wood: 50, iron: 10 });
    expect(demolishRefundPreview(house, { ...done, hp: 150 })).toEqual({ wood: 35, iron: 7 });
    expect(demolishRefundPreview(house, { ...done, hp: 0 })).toEqual({ wood: 0, iron: 0 });
  });

  it('paid upgrades come back at the same rate and a running upgrade in full', () => {
    // level 2: base + first upgrade at 50 %; the running upgrade to level 3 is refunded in full
    expect(demolishRefundPreview(house, { ...done, lv: 2, up: 40 })).toEqual({ wood: 50 + 35 + 90, iron: 10 + 10 + 40, copper: 20 });
  });

  it('honours a server-provided config and a missing def', () => {
    expect(demolishRefundPreview(house, done, { ...DEFAULT_DEMOLISH, maxRefund: 1 })).toEqual({ wood: 100, iron: 20 });
    expect(demolishRefundPreview(undefined, done)).toEqual({});
  });

  it('refundText lists positive amounts in resource order', () => {
    expect(refundText({ wood: 50, iron: 10, copper: 0 })).toBe('Bontás: +10 Vas, +50 Fa');
    expect(refundText({})).toBe('Bontás: nincs visszatérítés.');
    expect(refundText(null)).toBe('Bontás: nincs visszatérítés.');
  });
});
