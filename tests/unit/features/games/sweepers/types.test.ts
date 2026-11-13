import { describe, it, expect } from 'vitest';
import {
  PLAYER_ANIM_STATES,
  ackFor,
  decodeCm,
  decodeRot16,
  decodeTickPlayer,
  encodeRot16,
  parseHexSnapshot,
  parseInitState,
  parseJoinAck,
  parseKicked,
  parsePlayerLeft,
  parsePlayerSnapshot,
  parseTickSync
} from '../../../../../src/features/games/sweepers/types';
import { DEFAULT_PERSONAL } from '../../../../../src/features/games/sweepers/debrisTypes';

const player = { id: 3, accountId: 'acc-1', username: 'Béla', avatarColor: '#ff0000', x: 1.5, y: 0, z: -2, rotY: 0.5, state: 'WALK' };
const hex = { id: 0, q: 0, r: 0, district: 0, cleanliness: 42 };
const init = {
  roomId: 'room-1',
  selfId: 3,
  tickRate: 12,
  serverTime: 1000,
  players: [player],
  hexes: [hex],
  teamFunds: 5000,
  personal: { cash: 120, toolTier: 1, backpackTier: 0, totalKg: 3.5 }
};

describe('sweepers PlayerSnapshot guard', () => {
  it('accepts a full snapshot', () => {
    expect(parsePlayerSnapshot(player)).toEqual({ ...player, tool: 0 });
    expect(parsePlayerSnapshot({ ...player, tool: 5 })?.tool).toBe(5);
    expect(parsePlayerSnapshot({ ...player, tool: 8 })?.tool).toBe(0);
  });
  it('defaults accountId, colour and unknown state', () => {
    expect(parsePlayerSnapshot({ ...player, accountId: null, avatarColor: 7, state: 'DANCING' }))
      .toEqual({ ...player, accountId: null, avatarColor: '#FF7A1A', state: 'IDLE', tool: 0 });
    expect(parsePlayerSnapshot({ ...player, accountId: undefined })?.accountId).toBeNull();
  });
  it('rejects malformed snapshots', () => {
    expect(parsePlayerSnapshot(null)).toBeNull();
    expect(parsePlayerSnapshot([])).toBeNull();
    expect(parsePlayerSnapshot({ ...player, id: 1.5 })).toBeNull();
    expect(parsePlayerSnapshot({ ...player, id: '3' })).toBeNull();
    expect(parsePlayerSnapshot({ ...player, username: 5 })).toBeNull();
    expect(parsePlayerSnapshot({ ...player, x: Number.NaN })).toBeNull();
    expect(parsePlayerSnapshot({ ...player, rotY: Infinity })).toBeNull();
    expect(parsePlayerSnapshot({ ...player, accountId: 12 })).toBeNull();
  });
});

describe('sweepers HexSnapshot guard', () => {
  it('accepts and clamps cleanliness', () => {
    expect(parseHexSnapshot(hex)).toEqual(hex);
    expect(parseHexSnapshot({ ...hex, cleanliness: 140 })?.cleanliness).toBe(100);
    expect(parseHexSnapshot({ ...hex, cleanliness: -3 })?.cleanliness).toBe(0);
  });
  it('rejects malformed hexes', () => {
    expect(parseHexSnapshot({ ...hex, district: 6 })).toBeNull();
    expect(parseHexSnapshot({ ...hex, district: -1 })).toBeNull();
    expect(parseHexSnapshot({ ...hex, q: 0.5 })).toBeNull();
    expect(parseHexSnapshot({ ...hex, cleanliness: '50' })).toBeNull();
    expect(parseHexSnapshot('hex')).toBeNull();
  });
});

describe('sweepers init_state guard', () => {
  it('parses a Phase A init_state (no world fields) with the Phase B and C defaults', () => {
    expect(parseInitState(init)).toEqual({
      ...init,
      players: [{ ...player, tool: 0 }],
      // the Phase A fields keep their values; tool 1 is not owned there, so it is 0 (C.6)
      personal: { ...DEFAULT_PERSONAL, cash: 120, toolTier: 0, backpackTier: 0, totalKg: 3.5 },
      debris: null,
      layout: null,
      unlockedDistricts: [0],
      lifetimeEarned: 0,
      clock: { dayMs: 2_160_000, daylightMs: 1_440_000, timeMs: 0, day: 1, serverTime: init.serverTime },
      weather: { kind: 'clear', untilServerTime: null }
    });
  });
  it('drops malformed list entries and defaults optional numbers', () => {
    const parsed = parseInitState({ ...init, tickRate: 0, players: [player, { id: 'x' }], hexes: [hex, null], teamFunds: 'lots', personal: null });
    expect(parsed?.tickRate).toBe(12);
    expect(parsed?.players).toHaveLength(1);
    expect(parsed?.hexes).toHaveLength(1);
    expect(parsed?.teamFunds).toBe(0);
    expect(parsed?.personal).toEqual(DEFAULT_PERSONAL);
  });
  it('rejects payloads without core fields', () => {
    expect(parseInitState(null)).toBeNull();
    expect(parseInitState({ ...init, roomId: 1 })).toBeNull();
    expect(parseInitState({ ...init, selfId: 'me' })).toBeNull();
    expect(parseInitState({ ...init, serverTime: undefined })).toBeNull();
    expect(parseInitState({ ...init, players: {} })).toBeNull();
    expect(parseInitState({ ...init, hexes: undefined })).toBeNull();
  });
});

describe('sweepers quantization decode', () => {
  it('decodes centimetre integers', () => {
    expect(decodeCm(12345)).toBeCloseTo(123.45);
    expect(decodeCm(-50)).toBeCloseTo(-0.5);
  });
  it('round-trips rot16 within one step', () => {
    for (const rad of [0, 0.001, 1, Math.PI, 5.5, Math.PI * 2 - 0.0001]) {
      const back = decodeRot16(encodeRot16(rad));
      const err = Math.abs(Math.atan2(Math.sin(back - rad), Math.cos(back - rad)));
      expect(err).toBeLessThanOrEqual((Math.PI * 2) / 65536);
    }
    expect(encodeRot16(-Math.PI / 2)).toBe(49152);
    expect(decodeRot16(16384)).toBeCloseTo(Math.PI / 2);
    expect(decodeRot16(65536)).toBe(0);
  });
  it('decodes a tick tuple', () => {
    expect(decodeTickPlayer([4, 150, 0, -275, 16384, 2, 1, 3])).toEqual({ id: 4, x: 1.5, y: 0, z: -2.75, rotY: Math.PI / 2, state: 'SPRINT', corr: true, tool: 3 });
    expect(decodeTickPlayer([4, 150, 0, -275, 0, 99, 0, 0])?.state).toBe('IDLE');
    expect(decodeTickPlayer([4, 150, 0, -275, 0, 0, 0, 7])?.corr).toBe(false);
    // C.5: the row has 8 elements; the 8th is the held tool 0..7
    expect(decodeTickPlayer([4, 150, 0, -275, 0, 0, 1])).toBeNull();
    expect(decodeTickPlayer([4, 150, 0, -275, 0, 0, 1, 8])).toBeNull();
    expect(decodeTickPlayer([4, 150, 0, -275, 0, 0, 1, 1.5])).toBeNull();
  });
  it('rejects malformed tuples', () => {
    expect(decodeTickPlayer([4, 150, 0])).toBeNull();
    expect(decodeTickPlayer([4, 1.5, 0, 0, 0, 0, 0, 0])).toBeNull();
    expect(decodeTickPlayer({ id: 4 })).toBeNull();
    expect(decodeTickPlayer(['4', 0, 0, 0, 0, 0, 0, 0])).toBeNull();
  });
  it('keeps the protocol state order', () => {
    expect(PLAYER_ANIM_STATES).toEqual(['IDLE', 'WALK', 'SPRINT', 'SWEEPING_ARCS', 'HOLDING_BAG', 'OPERATING_VACUUM', 'DRIVING_VEHICLE', 'PUSHING_CART']);
  });
});

describe('sweepers tick_sync guard', () => {
  it('parses players, acks and gone', () => {
    const tick = parseTickSync({ t: 5000, acks: { 3: 17, 4: 'x' }, p: [[3, 0, 0, 0, 0, 0, 1, 2], 'junk'], gone: [9, 'a'] });
    expect(tick).toEqual({
      t: 5000,
      acks: { 3: 17 },
      ack: null,
      players: [{ id: 3, x: 0, y: 0, z: 0, rotY: 0, state: 'IDLE', corr: true, tool: 2 }],
      gone: [9]
    });
    expect(tick && ackFor(tick, 3)).toBe(17);
    expect(tick && ackFor(tick, 4)).toBeNull();
  });
  it('falls back to the single ack', () => {
    const tick = parseTickSync({ t: 1, ack: 8 });
    expect(tick && ackFor(tick, 3)).toBe(8);
    expect(tick?.players).toEqual([]);
    expect(tick?.gone).toEqual([]);
  });
  it('rejects ticks without server time', () => {
    expect(parseTickSync({ p: [] })).toBeNull();
    expect(parseTickSync({ t: '5' })).toBeNull();
    expect(parseTickSync(null)).toBeNull();
  });
});

describe('sweepers small payload guards', () => {
  it('player_left', () => {
    expect(parsePlayerLeft({ id: 2 })).toBe(2);
    expect(parsePlayerLeft({ id: '2' })).toBeNull();
    expect(parsePlayerLeft(2)).toBeNull();
  });
  it('join ack', () => {
    expect(parseJoinAck({ ok: true })).toEqual({ ok: true });
    expect(parseJoinAck({ ok: false, error: 'room_full' })).toEqual({ ok: false, error: 'room_full' });
    expect(parseJoinAck({ ok: false })).toEqual({ ok: false, error: 'Nem sikerült csatlakozni.' });
    expect(parseJoinAck({ ok: false, error: 'x', code: 'SWEEPERS_RATE_LIMITED' })).toEqual({ ok: false, error: 'x', code: 'SWEEPERS_RATE_LIMITED' });
    expect(parseJoinAck({ ok: false, error: 'x', code: 7 })).toStrictEqual({ ok: false, error: 'x' });
    expect(parseJoinAck({ ok: 'yes' })).toBeNull();
    expect(parseJoinAck(undefined)).toBeNull();
  });
  it('kicked', () => {
    expect(parseKicked({ reason: 'displaced' })).toEqual({ reason: 'displaced' });
    expect(parseKicked({ reason: 1 })).toBeNull();
    expect(parseKicked({})).toBeNull();
    expect(parseKicked('displaced')).toBeNull();
  });
});
