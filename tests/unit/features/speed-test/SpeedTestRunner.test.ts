import { describe, it, expect, vi, afterEach } from 'vitest';
import { SpeedTestRunner, pingStats, type SpeedTestListener } from '../../../../src/features/speed-test/lib/SpeedTestRunner';
import type { SocketLike, SocketListener } from '../../../../src/shared/services/socket/SocketLike';

afterEach(() => vi.useRealTimers());

describe('pingStats', () => {
  it('averages round trips and their consecutive differences', () => {
    expect(pingStats([10, 20, 30])).toEqual({ ping: 20, jitter: 10 });
    expect(pingStats([40])).toEqual({ ping: 40, jitter: 0 });
  });
  it('falls back to 25 ms when no pong arrived', () => {
    expect(pingStats([])).toEqual({ ping: 25, jitter: 0 });
  });
});

/** Answers every ping with a pong right away. */
class PongSocket implements SocketLike {
  readonly listeners = new Map<string, Set<SocketListener>>();
  readonly emitted: Array<[string, unknown]> = [];
  on(event: string, l: SocketListener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)?.add(l);
  }
  off(event: string, l?: SocketListener) {
    if (l) this.listeners.get(event)?.delete(l);
  }
  emit(event: string, payload?: unknown) {
    this.emitted.push([event, payload]);
    if (event === 'speedtest:ping') queueMicrotask(() => [...(this.listeners.get('speedtest:pong') ?? [])].forEach((l) => l()));
  }
}

const listener = (): SpeedTestListener & { phases: string[] } => {
  const phases: string[] = [];
  return { phases, onPhase: (p) => phases.push(p), onProgress: vi.fn(), onPing: vi.fn(), onDownload: vi.fn() };
};

describe('SpeedTestRunner', () => {
  it('measures ping, download and upload, then saves the result', async () => {
    let clock = 0;
    const now = () => (clock += 125); // every read advances 125 ms
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('download')
        ? new Response(new Uint8Array(1024 * 1024))
        : new Response('ok'));
    const socket = new PongSocket();
    const l = listener();

    const result = await new SpeedTestRunner(socket, { fetch: fetchMock as typeof fetch, now }).run(l);

    expect(l.phases).toEqual(['ping', 'download', 'upload']);
    expect(result.ping).toBe(125);
    expect(result.jitter).toBe(0);
    // 1 MiB in 0.125 s = 64 Mbit/s; 2 MiB upload in 0.125 s = 128 Mbit/s
    expect(result.download).toBe(64);
    expect(result.upload).toBe(128);
    expect(l.onPing).toHaveBeenCalledWith(125, 0);
    expect(l.onDownload).toHaveBeenCalledWith(64);
    expect(l.onProgress).toHaveBeenLastCalledWith(100);
    expect(socket.emitted.at(-1)).toEqual(['speedtest:save-result', result]);
    expect(socket.listeners.get('speedtest:pong')?.size).toBe(0);
  });

  it('rejects when a request fails, without saving', async () => {
    const socket = new PongSocket();
    const failing = vi.fn(async () => { throw new TypeError('network'); });
    await expect(new SpeedTestRunner(socket, { fetch: failing as typeof fetch, now: () => 0 }).run(listener())).rejects.toThrow('network');
    expect(socket.emitted.some(([e]) => e === 'speedtest:save-result')).toBe(false);
  });
});
