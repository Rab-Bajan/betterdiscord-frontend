import { describe, it, expect, vi, afterEach } from 'vitest';
import { SweepersNet, RTT_PROBE_INTERVAL_MS, type SweepersNetHandlers } from '../../../../../src/features/games/sweepers/lib/net/SweepersNet';
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
    onKicked: (reason) => calls.push(`kicked:${reason}`)
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
    expect(socket.count()).toBe(7);
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
});
