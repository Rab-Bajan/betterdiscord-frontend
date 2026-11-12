// Közös YouTube nézés: a YouTube IFrame lejátszó a szoba élő állapotához igazítva.
// A helyi play/pause kimegy a szobának; a távoli szinkron idejére a kimenő eseményeket
// letiltjuk, hogy ne vezessünk vissza visszhangot.
import { getLiveTime, type WatchPlaybackState } from './youtube';

/** The parts of the YouTube IFrame API this player uses. */
export interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): number;
  destroy(): void;
}

interface YTPlayerOptions {
  videoId: string;
  width: string;
  height: string;
  playerVars: Record<string, string | number>;
  events: {
    onReady: (event: { target: YTPlayer }) => void;
    onStateChange: (event: { data: number }) => void;
  };
}

export interface YTNamespace {
  Player: new (element: HTMLElement, options: YTPlayerOptions) => YTPlayer;
  PlayerState: { PLAYING: number; PAUSED: number };
}

declare global {
  interface Window {
    YT?: YTNamespace;
  }
}

const API_URL = 'https://www.youtube.com/iframe_api';
const API_POLL_MS = 150;

/** Adds the IFrame API script once; `window.YT` appears when it has loaded. */
export function loadYouTubeApi(): void {
  if (window.YT) return;
  const tag = document.createElement('script');
  tag.src = API_URL;
  const firstScriptTag = document.getElementsByTagName('script')[0];
  firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
}

export type PlaybackAction = 'play' | 'pause';

export interface YouTubeSyncPlayerOptions {
  /** The latest room state, read when the player starts. */
  getState: () => WatchPlaybackState | null | undefined;
  /** A play/pause made by the local user. */
  onLocalControl: (action: PlaybackAction, currentTime: number) => void;
  getApi?: () => YTNamespace | undefined;
}

export class YouTubeSyncPlayer {
  readonly #getState: () => WatchPlaybackState | null | undefined;
  readonly #onLocalControl: (action: PlaybackAction, currentTime: number) => void;
  readonly #getApi: () => YTNamespace | undefined;
  #player: YTPlayer | null = null;
  #mount: HTMLElement | null = null;
  #cancelled = false;
  #retryTimer: ReturnType<typeof setTimeout> | undefined;
  #suppressTimer: ReturnType<typeof setTimeout> | undefined;
  #suppressed = false;

  constructor({ getState, onLocalControl, getApi = () => window.YT }: YouTubeSyncPlayerOptions) {
    this.#getState = getState;
    this.#onLocalControl = onLocalControl;
    this.#getApi = getApi;
  }

  /**
   * Creates the player inside `host`, starting at the room's live time. Every player gets its
   * own element, because destroy() removes its target div.
   */
  start(host: HTMLElement, videoId: string): void {
    const mount = document.createElement('div');
    mount.style.width = '100%';
    mount.style.height = '100%';
    host.appendChild(mount);
    this.#mount = mount;
    this.#init(mount, videoId);
  }

  /** Applies a play/pause/seek that came from the room. */
  applyRemote(action: unknown, currentTime: unknown): void {
    const player = this.#player;
    if (!player?.seekTo) return;
    this.#suppress(900);
    try {
      if (typeof currentTime === 'number') {
        // Csak akkor ugrunk, ha érdemben eltér, így nincs felesleges megakadás
        const diff = Math.abs((player.getCurrentTime?.() || 0) - currentTime);
        if (diff > 0.75) player.seekTo(currentTime, true);
      }
      if (action === 'play') player.playVideo();
      else if (action === 'pause') player.pauseVideo();
    } catch (e) {
      console.warn('Sync YouTube error:', e);
    }
  }

  /** Jumps to the room's live time (manual resync). */
  resync(state: WatchPlaybackState): void {
    if (!this.#player?.seekTo) return;
    this.#suppress(900);
    this.#player.seekTo(getLiveTime(state), true);
  }

  destroy(): void {
    this.#cancelled = true;
    clearTimeout(this.#retryTimer);
    clearTimeout(this.#suppressTimer);
    this.#suppressed = false;
    try {
      this.#player?.destroy?.();
    } catch { /* ignore */ }
    this.#player = null;
    this.#mount?.remove();
    this.#mount = null;
  }

  #suppress(ms: number): void {
    this.#suppressed = true;
    clearTimeout(this.#suppressTimer);
    this.#suppressTimer = setTimeout(() => {
      this.#suppressed = false;
    }, ms);
  }

  #init(mount: HTMLElement, videoId: string): void {
    if (this.#cancelled) return;
    const YT = this.#getApi();
    if (!YT || !YT.Player) {
      this.#retryTimer = setTimeout(() => this.#init(mount, videoId), API_POLL_MS);
      return;
    }

    const state = this.#getState();
    const startAt = Math.floor(getLiveTime(state));
    // A kezdeti seek/play ne menjen ki a szobának, különben mindenkit visszaugrasztana
    this.#suppress(4000);

    this.#player = new YT.Player(mount, {
      videoId,
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: state?.isPlaying ? 1 : 0,
        start: startAt,
        controls: 1,
        rel: 0,
        modestbranding: 1,
        enablejsapi: 1,
        origin: window.location.origin
      },
      events: {
        onReady: (event) => {
          if (this.#cancelled) return;
          const current = this.#getState();
          this.#suppress(1500);
          event.target.seekTo(getLiveTime(current), true);
          if (current?.isPlaying) event.target.playVideo();
          else event.target.pauseVideo();
        },
        onStateChange: (event) => {
          if (this.#suppressed || this.#cancelled) return;
          const player = this.#player;
          if (!player?.getCurrentTime) return;
          if (event.data === YT.PlayerState.PLAYING) this.#onLocalControl('play', player.getCurrentTime());
          else if (event.data === YT.PlayerState.PAUSED) this.#onLocalControl('pause', player.getCurrentTime());
        }
      }
    });
  }
}
