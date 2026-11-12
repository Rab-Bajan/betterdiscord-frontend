// Hívás-beállítások: böngészőben (localStorage) tárolt felhasználói preferenciák.
import { useSyncExternalStore } from 'react';

const KEY = 'sharkvoic_call_settings';

export interface QualityPreset {
  label: string;
  bitrate: number;
  hint: string;
}

// Opus átlagos bitráta-célok (mono, 48 kHz). A hívás közben a hálózat alapján lejjebb is szabályozódik.
export const QUALITY_PRESETS = {
  standard: { label: 'Takarékos', bitrate: 32000, hint: '32 kbps · gyenge hálózathoz' },
  high: { label: 'Kiváló', bitrate: 64000, hint: '64 kbps · ajánlott' },
  studio: { label: 'Stúdió', bitrate: 128000, hint: '128 kbps · maximális tisztaság' }
} satisfies Record<string, QualityPreset>;

export type CallQuality = keyof typeof QUALITY_PRESETS;

export interface CallSettings {
  soundsEnabled: boolean;
  volume: number;
  ringtone: string;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  inputDeviceId: string;
  outputDeviceId: string;
  quality: CallQuality;
}

export const DEFAULT_SETTINGS: CallSettings = {
  soundsEnabled: true,
  volume: 0.7,
  ringtone: 'aurora',
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  inputDeviceId: 'default',
  outputDeviceId: 'default',
  quality: 'high'
};

function load(): CallSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      // Stored value is NOT validated (behaviour kept as-is): any JSON is spread over the defaults.
      const stored: unknown = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...(stored as Partial<CallSettings>) };
    }
  } catch (e) { /* nincs tárhely */ }
  return { ...DEFAULT_SETTINGS };
}

let state = load();
const listeners = new Set<() => void>();

export const getCallSettings = (): CallSettings => state;

export function updateCallSettings(patch: Partial<CallSettings>): void {
  state = { ...state, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useCallSettings(): CallSettings {
  return useSyncExternalStore(subscribe, getCallSettings, getCallSettings);
}
