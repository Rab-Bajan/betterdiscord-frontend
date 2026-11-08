// Hívás-beállítások: böngészőben (localStorage) tárolt felhasználói preferenciák.
import { useSyncExternalStore } from 'react';

const KEY = 'sharkvoic_call_settings';

// Opus átlagos bitráta-célok (mono, 48 kHz). A hívás közben a hálózat alapján lejjebb is szabályozódik.
export const QUALITY_PRESETS = {
  standard: { label: 'Takarékos', bitrate: 32000, hint: '32 kbps · gyenge hálózathoz' },
  high: { label: 'Kiváló', bitrate: 64000, hint: '64 kbps · ajánlott' },
  studio: { label: 'Stúdió', bitrate: 128000, hint: '128 kbps · maximális tisztaság' }
};

export const DEFAULT_SETTINGS = {
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

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) { /* nincs tárhely */ }
  return { ...DEFAULT_SETTINGS };
}

let state = load();
const listeners = new Set();

export const getCallSettings = () => state;

export function updateCallSettings(patch) {
  state = { ...state, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  listeners.forEach((l) => l());
}

const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useCallSettings() {
  return useSyncExternalStore(subscribe, getCallSettings, getCallSettings);
}
