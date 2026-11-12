import { isRecord } from '../../../../shared/lib/guards';

const ID_ONLY = /^[a-zA-Z0-9_-]{11}$/;
const URL_RE =
  /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/live\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/i;

export function extractYouTubeId(urlOrId: string | null | undefined): string {
  if (!urlOrId) return '';
  const str = urlOrId.trim();
  if (ID_ONLY.test(str)) return str;
  const match = str.match(URL_RE);
  // the capture group is mandatory, so a match always has [1]
  return match ? (match[1] ?? '') : '';
}

/** Watch-party state as sent by the server, stamped with `receivedAt` (ms) on arrival. */
export interface WatchPlaybackState {
  currentTime?: number | null;
  isPlaying?: boolean | null;
  receivedAt?: number | null;
}

// A szerver által küldött állapot aktuális időkódja (a megérkezés óta eltelt idővel korrigálva)
export function getLiveTime(state: WatchPlaybackState | null | undefined): number {
  if (!state) return 0;
  const base = state.currentTime || 0;
  if (!state.isPlaying || !state.receivedAt) return base;
  return base + Math.max(0, (Date.now() - state.receivedAt) / 1000);
}

/** The room's watch-party session as the view reads it. */
export interface WatchState extends WatchPlaybackState {
  active?: boolean | null;
  videoId?: string | null;
  title?: string | null;
  url?: string | null;
  startedBy?: string | null;
}

const optional = (value: unknown, type: 'string' | 'number' | 'boolean'): boolean => value === undefined || value === null || typeof value === type;

/** True when a room session has watch-party fields of the right types. */
export const isWatchState = (value: unknown): value is WatchState =>
  isRecord(value) && optional(value.active, 'boolean') && optional(value.videoId, 'string') && optional(value.title, 'string')
  && optional(value.url, 'string') && optional(value.startedBy, 'string') && optional(value.currentTime, 'number')
  && optional(value.isPlaying, 'boolean') && optional(value.receivedAt, 'number');
