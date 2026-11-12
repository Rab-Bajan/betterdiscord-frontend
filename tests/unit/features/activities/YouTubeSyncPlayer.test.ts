// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { YouTubeSyncPlayer, type YTNamespace, type YTPlayer } from '../../../../src/features/activities/watch-party/lib/YouTubeSyncPlayer';
import { isWatchState } from '../../../../src/features/activities/watch-party/lib/youtube';

afterEach(() => vi.useRealTimers());

function fakeApi() {
  const players: Array<{ player: YTPlayer & Record<string, ReturnType<typeof vi.fn>>; options: { videoId: string; playerVars: Record<string, unknown>; events: { onReady: (e: { target: YTPlayer }) => void; onStateChange: (e: { data: number }) => void } } }> = [];
  const api = {
    PlayerState: { PLAYING: 1, PAUSED: 2 },
    Player: vi.fn(function (this: unknown, _el: HTMLElement, options: never) {
      const player = { seekTo: vi.fn(), playVideo: vi.fn(), pauseVideo: vi.fn(), getCurrentTime: vi.fn(() => 42), destroy: vi.fn() };
      players.push({ player, options });
      return player;
    })
  } as unknown as YTNamespace;
  return { api, players };
}

describe('YouTubeSyncPlayer', () => {
  it('starts at the live time and does not echo the initial state change', () => {
    vi.useFakeTimers();
    const { api, players } = fakeApi();
    const onLocalControl = vi.fn();
    const host = document.createElement('div');
    const p = new YouTubeSyncPlayer({ getState: () => ({ currentTime: 30, isPlaying: false }), onLocalControl, getApi: () => api });
    p.start(host, 'abcdefghijk');
    const created = players[0];
    expect(created?.options.videoId).toBe('abcdefghijk');
    expect(created?.options.playerVars).toMatchObject({ start: 30, autoplay: 0 });
    created?.options.events.onStateChange({ data: 1 });
    expect(onLocalControl).not.toHaveBeenCalled();

    vi.advanceTimersByTime(4000);
    created?.options.events.onStateChange({ data: 1 });
    expect(onLocalControl).toHaveBeenCalledWith('play', 42);
  });

  it('waits for the API, applies remote seeks only on real drift, and cleans up', () => {
    vi.useFakeTimers();
    const { api, players } = fakeApi();
    let loaded: YTNamespace | undefined;
    const host = document.createElement('div');
    const p = new YouTubeSyncPlayer({ getState: () => null, onLocalControl: vi.fn(), getApi: () => loaded });
    p.start(host, 'abcdefghijk');
    expect(players).toHaveLength(0);
    loaded = api;
    vi.advanceTimersByTime(150);
    const player = players[0]?.player;

    p.applyRemote('pause', 42.5);
    expect(player?.seekTo).not.toHaveBeenCalled();
    expect(player?.pauseVideo).toHaveBeenCalled();
    p.applyRemote('play', 50);
    expect(player?.seekTo).toHaveBeenCalledWith(50, true);

    p.destroy();
    expect(player?.destroy).toHaveBeenCalled();
    expect(host.children).toHaveLength(0);
  });

  it('validates watch states', () => {
    expect(isWatchState({ active: true, videoId: 'x', title: null })).toBe(true);
    expect(isWatchState({ active: 'yes' })).toBe(false);
  });
});
