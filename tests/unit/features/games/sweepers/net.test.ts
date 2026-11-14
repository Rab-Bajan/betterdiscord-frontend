import { describe, it, expect, vi, afterEach } from 'vitest';
import { SweepersNet, JOIN_RETRY_DELAYS_MS, RTT_PROBE_INTERVAL_MS, type SweepersNetHandlers } from '../../../../../src/features/games/sweepers/lib/net/SweepersNet';
import type { SocketLike, SocketListener } from '../../../../../src/shared/services/socket/SocketLike';

class FakeSocket implements SocketLike {
  readonly listeners = new Map<string, Set<SocketListener>>();
  readonly emitted: Array<{ event: string; args: unknown[] }> = [];
  on(event: string, listener: SocketListener): void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener);
    this.listeners.set(event, set);
  }
  off(event: string, listener?: SocketListener): void {
    if (listener) this.listeners.get(event)?.delete(listener);
  }
  emit(event: string, ...args: unknown[]): void {
    this.emitted.push({ event, args });
  }
  fire(event: string, payload?: unknown): void {
    for (const l of this.listeners.get(event) ?? []) l(payload);
  }
  count(): number {
    let n = 0;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  }
}

const recorder = () => {
  const calls: string[] = [];
  const handlers: SweepersNetHandlers = {
    onInit: (s) => calls.push(`init:${s.selfId}`),
    onTick: (t) => calls.push(`tick:${t.t}`),
    onPlayerJoined: (p) => calls.push(`joined:${p.id}`),
    onPlayerLeft: (id) => calls.push(`left:${id}`),
    onJoinError: (e) => calls.push(`error:${e}`),
    onRtt: (ms) => calls.push(`rtt:${ms}`),
    onKicked: (reason) => calls.push(`kicked:${reason}`),
    onDistrictUnlocked: (e) => calls.push(`unlocked:${e.district}:${e.unlockedDistricts.join(',')}`),
    onClock: (c) => calls.push(`clock:${c.timeMs}:${c.day}:${c.dayMs}`),
    onWeather: (w) => calls.push(`weather:${w.kind}:${w.untilServerTime ?? 'null'}`),
    onDebris: (u) => calls.push(`debris:${u.t}:${u.load.length}:${u.del.join(',')}`),
    onPersonal: (p) => calls.push(`personal:${p.cash}:${p.toolTier}`),
    onStructureSpawned: (row, by) => calls.push(`spawned:${row.id}:${by}`),
    onLogistics: (u) => calls.push(`logistics:${u.t}`),
    onTelemetry: (t) => calls.push(`telemetry:${t.jams}`)
  };
  return { calls, handlers };
};

const init = { roomId: 'r', selfId: 1, serverTime: 0, players: [], hexes: [] };
const input = { seq: 1, x: 0, y: 0, z: 0, rotY: 0, state: 'IDLE' as const };

afterEach(() => vi.useRealTimers());

describe('SweepersNet', () => {
  it('joins on start and re-joins on reconnect (spec 13)', () => {
    const socket = new FakeSocket();
    const net = new SweepersNet(socket, 'ch-1', recorder().handlers);
    net.start();
    socket.fire('connect');
    const joins = socket.emitted.filter((e) => e.event === 'miskolc:join_room');
    expect(joins).toHaveLength(2);
    expect(joins[0]?.args[0]).toEqual({ channelId: 'ch-1' });
    expect(typeof joins[0]?.args[1]).toBe('function');
  });

  it('routes parsed events and drops malformed ones', () => {
    const socket = new FakeSocket();
    const { calls, handlers } = recorder();
    new SweepersNet(socket, 'ch-1', handlers).start();
    socket.fire('miskolc:init_state', init);
    socket.fire('miskolc:init_state', { nope: true });
    socket.fire('miskolc:tick_sync', { t: 42, p: [] });
    socket.fire('miskolc:tick_sync', 'garbage');
    socket.fire('miskolc:player_joined', { id: 2, username: 'b', x: 0, y: 0, z: 0, rotY: 0 });
    socket.fire('miskolc:player_joined', { id: 2 });
    socket.fire('miskolc:player_left', { id: 2 });
    socket.fire('miskolc:player_left', {});
    expect(calls).toEqual(['init:1', 'tick:42', 'joined:2', 'left:2']);
  });

  it('routes Phase B world events and drops malformed ones', () => {
    const socket = new FakeSocket();
    const { calls, handlers } = recorder();
    new SweepersNet(socket, 'ch-1', handlers).start();
    socket.fire('miskolc:init_state', { ...init, clock: { dayMs: 1000, daylightMs: 600, timeMs: 10, day: 1, serverTime: 0 } });
    socket.fire('miskolc:district_unlocked', { district: 2, unlockedDistricts: [0, 1] });
    socket.fire('miskolc:district_unlocked', { district: 9, unlockedDistricts: [0] });
    socket.fire('miskolc:clock', { timeMs: 500, day: 3, serverTime: 100 });
    socket.fire('miskolc:clock', { timeMs: 'x', day: 3, serverTime: 100 });
    socket.fire('miskolc:weather', { kind: 'smog', untilServerTime: 5000 });
    socket.fire('miskolc:weather', { kind: 'hail' });
    // the clock event keeps the day lengths from init_state
    expect(calls).toEqual(['init:1', 'unlocked:2:0,1,2', 'clock:500:3:1000', 'weather:smog:5000']);
  });

  it('drops world events until init_state arrives (init_state carries unlocks, clock and weather)', () => {
    const socket = new FakeSocket();
    const { calls, handlers } = recorder();
    new SweepersNet(socket, 'ch-1', handlers).start();
    const world = (): void => {
      socket.fire('miskolc:district_unlocked', { district: 1, unlockedDistricts: [0, 1] });
      socket.fire('miskolc:clock', { timeMs: 500, day: 3, serverTime: 100 });
      socket.fire('miskolc:weather', { kind: 'drizzle', untilServerTime: 9000 });
    };
    world();
    expect(calls).toEqual([]);
    socket.fire('miskolc:init_state', init);
    world();
    expect(calls).toEqual(['init:1', 'unlocked:1:0,1', 'clock:500:3:2160000', 'weather:drizzle:9000']);
    // a reconnect waits for the new init_state again
    socket.fire('connect');
    world();
    expect(calls).toHaveLength(4);
  });

  describe('join retry (rate-limited join)', () => {
    const limited = { ok: false, error: 'Túl gyorsan próbálkozol, várj egy kicsit.', code: 'SWEEPERS_RATE_LIMITED' };
    const joinAcks = (socket: FakeSocket): Array<(res: unknown) => void> =>
      socket.emitted.filter((e) => e.event === 'miskolc:join_room').map((e) => {
        const ack = e.args[1];
        if (typeof ack !== 'function') throw new Error('no ack');
        return (res: unknown) => ack(res);
      });
    const lastAck = (socket: FakeSocket): ((res: unknown) => void) => {
      const ack = joinAcks(socket).at(-1);
      if (!ack) throw new Error('no join');
      return ack;
    };

    it('retries a rate-limited join after the backoff and succeeds', () => {
      vi.useFakeTimers();
      const socket = new FakeSocket();
      const { calls, handlers } = recorder();
      new SweepersNet(socket, 'ch-1', handlers).start();
      lastAck(socket)(limited);
      expect(joinAcks(socket)).toHaveLength(1);
      vi.advanceTimersByTime(JOIN_RETRY_DELAYS_MS[0] ?? 0);
      expect(joinAcks(socket)).toHaveLength(2);
      lastAck(socket)({ ok: true });
      socket.fire('miskolc:init_state', init);
      vi.advanceTimersByTime(10_000);
      expect(joinAcks(socket)).toHaveLength(2);
      expect(calls).toEqual(['init:1']);
    });

    it('shows the Hungarian error once the retries are used up', () => {
      vi.useFakeTimers();
      const socket = new FakeSocket();
      const { calls, handlers } = recorder();
      new SweepersNet(socket, 'ch-1', handlers).start();
      for (const delay of JOIN_RETRY_DELAYS_MS) {
        lastAck(socket)(limited);
        expect(calls).toEqual([]);
        vi.advanceTimersByTime(delay - 1);
        const before = joinAcks(socket).length;
        vi.advanceTimersByTime(1);
        expect(joinAcks(socket)).toHaveLength(before + 1); // backoff: not a moment earlier
      }
      expect(joinAcks(socket)).toHaveLength(JOIN_RETRY_DELAYS_MS.length + 1);
      lastAck(socket)(limited);
      vi.advanceTimersByTime(10_000);
      expect(joinAcks(socket)).toHaveLength(JOIN_RETRY_DELAYS_MS.length + 1);
      expect(calls).toEqual([`error:${limited.error}`]);
    });

    it('a refusal with another code (or none) stays fatal and does not retry', () => {
      vi.useFakeTimers();
      for (const res of [{ ok: false, error: 'Nem vagy a hívásban.', code: 'SWEEPERS_REFUSED' }, { ok: false, error: 'room_full' }]) {
        const socket = new FakeSocket();
        const { calls, handlers } = recorder();
        new SweepersNet(socket, 'ch-1', handlers).start();
        lastAck(socket)(res);
        vi.advanceTimersByTime(10_000);
        expect(joinAcks(socket)).toHaveLength(1);
        expect(calls).toEqual([`error:${res.error}`]);
      }
    });

    it('does not retry after stop (leave) or a kick, nor for the ack of an older join', () => {
      vi.useFakeTimers();
      const stopped = new FakeSocket();
      const a = recorder();
      const net = new SweepersNet(stopped, 'ch-1', a.handlers);
      net.start();
      lastAck(stopped)(limited);
      net.stop();
      vi.advanceTimersByTime(10_000);
      expect(joinAcks(stopped)).toHaveLength(1);
      expect(stopped.emitted.some((e) => e.event === 'miskolc:leave_room')).toBe(true);
      expect(a.calls).toEqual([]);

      const kicked = new FakeSocket();
      const b = recorder();
      new SweepersNet(kicked, 'ch-1', b.handlers).start();
      lastAck(kicked)(limited);
      kicked.fire('miskolc:kicked', { reason: 'displaced' });
      vi.advanceTimersByTime(10_000);
      expect(joinAcks(kicked)).toHaveLength(1);
      expect(b.calls).toEqual(['kicked:displaced']);

      // a reconnect starts a new join: the old one's late ack neither retries nor reports
      const stale = new FakeSocket();
      const c = recorder();
      new SweepersNet(stale, 'ch-1', c.handlers).start();
      const first = lastAck(stale);
      stale.fire('connect');
      first(limited);
      vi.advanceTimersByTime(10_000);
      expect(joinAcks(stale)).toHaveLength(2);
      expect(c.calls).toEqual([]);
    });

    it('ignores a fatal refusal of an older join after a reconnect', () => {
      const socket = new FakeSocket();
      const { calls, handlers } = recorder();
      new SweepersNet(socket, 'ch-1', handlers).start();
      const first = lastAck(socket);
      socket.fire('connect');
      first({ ok: false, error: 'Nem vagy a hívásban.', code: 'SWEEPERS_REFUSED' });
      expect(calls).toEqual([]);
      lastAck(socket)({ ok: true });
      expect(calls).toEqual([]);
    });

    it('a disconnect cancels a pending retry (the reconnect joins afresh, no extra token)', () => {
      vi.useFakeTimers();
      const socket = new FakeSocket();
      const { calls, handlers } = recorder();
      new SweepersNet(socket, 'ch-1', handlers).start();
      lastAck(socket)(limited);
      socket.fire('disconnect');
      vi.advanceTimersByTime(10_000);
      expect(joinAcks(socket)).toHaveLength(1);
      socket.fire('connect');
      expect(joinAcks(socket)).toHaveLength(2);
      vi.advanceTimersByTime(10_000);
      expect(joinAcks(socket)).toHaveLength(2);
      expect(calls).toEqual([]);
    });
  });

  it('reports a refused join', () => {
    const socket = new FakeSocket();
    const { calls, handlers } = recorder();
    new SweepersNet(socket, 'ch-1', handlers).start();
    const ack = socket.emitted[0]?.args[1];
    if (typeof ack !== 'function') throw new Error('no ack');
    ack({ ok: false, error: 'room_full' });
    ack({ ok: true });
    expect(calls).toEqual(['error:room_full']);
  });

  it('measures RTT on a player_input ack at most every probe interval', () => {
    vi.useFakeTimers();
    let now = 0;
    const socket = new FakeSocket();
    const { calls, handlers } = recorder();
    const net = new SweepersNet(socket, 'ch-1', handlers, () => now);
    net.start();
    socket.fire('miskolc:init_state', init);
    calls.length = 0;
    net.sendInput(input);
    net.sendInput({ ...input, seq: 2 });
    const inputs = socket.emitted.filter((e) => e.event === 'miskolc:player_input');
    expect(inputs[0]?.args[0]).toEqual({ channelId: 'ch-1', ...input });
    const ack = inputs[0]?.args[1];
    expect(inputs[1]?.args).toHaveLength(1); // no probe while one is in flight
    if (typeof ack !== 'function') throw new Error('no ack');
    now = 48;
    ack({ ok: true });
    ack({ ok: true }); // duplicate ack ignored
    expect(calls).toEqual(['rtt:48']);
    now = 48 + RTT_PROBE_INTERVAL_MS / 2;
    net.sendInput(input);
    expect(socket.emitted.at(-1)?.args).toHaveLength(1);
    now = RTT_PROBE_INTERVAL_MS + 1;
    net.sendInput(input);
    expect(socket.emitted.at(-1)?.args).toHaveLength(2);
  });

  it('ignores a probe ack after it timed out', () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const { calls, handlers } = recorder();
    const net = new SweepersNet(socket, 'ch-1', handlers, () => 0);
    net.start();
    socket.fire('miskolc:init_state', init);
    calls.length = 0;
    net.sendInput(input);
    const ack = socket.emitted.at(-1)?.args[1];
    vi.advanceTimersByTime(6000);
    if (typeof ack !== 'function') throw new Error('no ack');
    ack({});
    expect(calls).toEqual([]);
  });

  it('stop() removes every listener and leaves the room', () => {
    const socket = new FakeSocket();
    const net = new SweepersNet(socket, 'ch-1', recorder().handlers);
    net.start();
    expect(socket.count()).toBe(15); // 7 Phase A + district_unlocked, clock, weather + debris_chunk_update, personal_update + structure_spawned, logistics_update, logistics_telemetry
    net.stop();
    net.stop();
    expect(socket.count()).toBe(0);
    expect(socket.emitted.filter((e) => e.event === 'miskolc:leave_room')).toEqual([{ event: 'miskolc:leave_room', args: [{ channelId: 'ch-1' }] }]);
  });

  it('drops inputs while disconnected and until init_state after a re-join (no reconnect flood)', () => {
    const socket = new FakeSocket();
    const net = new SweepersNet(socket, 'ch-1', recorder().handlers);
    const sent = () => socket.emitted.filter((e) => e.event === 'miskolc:player_input').length;
    net.start();
    net.sendInput(input); // before the first init_state
    expect(sent()).toBe(0);
    socket.fire('miskolc:init_state', init);
    expect(net.canSend).toBe(true);
    net.sendInput(input);
    expect(sent()).toBe(1);
    socket.fire('disconnect');
    for (let i = 0; i < 50; i++) net.sendInput(input);
    expect(sent()).toBe(1);
    socket.fire('connect'); // re-joins, still waiting for the rebuild
    net.sendInput(input);
    expect(sent()).toBe(1);
    socket.fire('miskolc:init_state', init);
    net.sendInput(input);
    expect(sent()).toBe(2);
  });

  it('respects a socket.io `connected` flag at start', () => {
    const socket = Object.assign(new FakeSocket(), { connected: false });
    const net = new SweepersNet(socket, 'ch-1', recorder().handlers);
    net.start();
    socket.fire('miskolc:init_state', init);
    expect(net.canSend).toBe(false);
    socket.fire('connect');
    socket.fire('miskolc:init_state', init);
    expect(net.canSend).toBe(true);
  });

  it('ignores a join ack that arrives after stop()', () => {
    const socket = new FakeSocket();
    const { calls, handlers } = recorder();
    const net = new SweepersNet(socket, 'ch-1', handlers);
    net.start();
    const ack = socket.emitted[0]?.args[1];
    net.stop();
    if (typeof ack !== 'function') throw new Error('no ack');
    ack({ ok: false, error: 'x' });
    expect(calls).toEqual([]);
  });

  it('miskolc:kicked stops sending, rejoining and leaving', () => {
    const socket = new FakeSocket();
    const { calls, handlers } = recorder();
    const net = new SweepersNet(socket, 'ch-1', handlers);
    net.start();
    socket.fire('miskolc:init_state', init);
    socket.fire('miskolc:kicked', { reason: 7 }); // malformed: ignored
    expect(net.kicked).toBe(false);
    socket.fire('miskolc:kicked', { reason: 'displaced' });
    socket.fire('miskolc:kicked', { reason: 'displaced' });
    expect(calls).toEqual(['init:1', 'kicked:displaced']);
    expect(net.canSend).toBe(false);
    const before = socket.emitted.length;
    net.sendInput(input);
    socket.fire('connect');
    socket.fire('miskolc:init_state', init);
    net.stop();
    expect(socket.emitted.length).toBe(before); // no input, no join_room, no leave_room
    expect(calls).toEqual(['init:1', 'kicked:displaced']);
  });

  it('routes Phase C debris and personal updates only on top of an init_state', () => {
    const socket = new FakeSocket();
    const { calls, handlers } = recorder();
    new SweepersNet(socket, 'ch-1', handlers).start();
    const phaseC = (): void => {
      socket.fire('miskolc:debris_chunk_update', { t: 7, del: [3, 4] });
      socket.fire('miskolc:debris_chunk_update', { del: [3] }); // no t: dropped
      socket.fire('miskolc:personal_update', { cash: 2000, toolTier: 7 });
      socket.fire('miskolc:personal_update', { toolTier: 1 }); // no cash: dropped
    };
    phaseC();
    expect(calls).toEqual([]);
    socket.fire('miskolc:init_state', init);
    phaseC();
    expect(calls).toEqual(['init:1', 'debris:7:0:3,4', 'personal:2000:7']);
    socket.fire('connect');
    phaseC();
    expect(calls).toHaveLength(3);
  });

  it('sends sweep_hit / player_action / buy_upgrade with the channel and parses their acks', () => {
    const socket = new FakeSocket();
    const net = new SweepersNet(socket, 'ch-1', recorder().handlers);
    const acks: string[] = [];
    expect(net.sendSweep({ seq: 1, tool: 2, alt: 0, x: 1, z: 2, rotY: 0 }, () => acks.push('early'))).toBe(false);
    net.start();
    socket.fire('miskolc:init_state', init);
    expect(net.sendSweep({ seq: 3, tool: 2, alt: 1, x: 1.23456, z: -2.0004, rotY: 0.12349 }, (a) => acks.push(a.ok ? `ok:${a.items.join(',')}` : `no:${a.code ?? '-'}`))).toBe(true);
    expect(net.sendAction({ kind: 'kick', id: 0x30007, vx: 2.34567, vz: -1 }, (a) => acks.push(a.ok ? 'kick:ok' : 'kick:no'))).toBe(true);
    expect(net.buyUpgrade({ item: 'width', level: 1 }, (a) => acks.push(a.ok ? `buy:${a.cash}` : `buy:${a.error}`))).toBe(true);
    const sweep = socket.emitted.find((e) => e.event === 'miskolc:sweep_hit');
    const kick = socket.emitted.find((e) => e.event === 'miskolc:player_action');
    const buy = socket.emitted.find((e) => e.event === 'miskolc:buy_upgrade');
    // floats go out with at most 3 decimals (C intro)
    expect(sweep?.args[0]).toEqual({ channelId: 'ch-1', seq: 3, tool: 2, alt: 1, x: 1.235, z: -2, rotY: 0.123 });
    expect(kick?.args[0]).toEqual({ channelId: 'ch-1', kind: 'kick', id: 0x30007, vx: 2.346, vz: -1 });
    expect(buy?.args[0]).toEqual({ channelId: 'ch-1', item: 'width', level: 1 });
    const ack = (e: { args: unknown[] } | undefined, payload: unknown): void => {
      const cb = e?.args[1];
      if (typeof cb === 'function') cb(payload);
    };
    ack(sweep, { ok: true, seq: 3, kg: 0.5, items: [7], pushed: false });
    ack(kick, { ok: false, error: 'Túl messze vagy ehhez.', code: 'tooFar' });
    ack(buy, { ok: true, cash: 0 });
    expect(acks).toEqual(['ok:7', 'kick:no', 'buy:0']);
    // nothing goes out while disconnected; a late ack after stop() is ignored
    socket.fire('disconnect');
    expect(net.sendAction({ kind: 'dump' }, () => acks.push('dump'))).toBe(false);
    socket.fire('connect');
    socket.fire('miskolc:init_state', init);
    net.sendAction({ kind: 'dump' }, () => acks.push('dump'));
    const dump = socket.emitted.filter((e) => e.event === 'miskolc:player_action').at(-1);
    expect(dump?.args[0]).toEqual({ channelId: 'ch-1', kind: 'dump' });
    net.stop();
    ack(dump, { ok: true });
    expect(acks).toEqual(['ok:7', 'kick:no', 'buy:0']);
  });
});
