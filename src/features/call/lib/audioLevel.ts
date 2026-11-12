// Hangszint-mérés (AnalyserNode) a saját mikrofonhoz és a távoli hanghoz. Külön tárolóban él,
// hogy a gyakori frissítés ne renderelje újra az egész alkalmazást.
import { useSyncExternalStore } from 'react';

/** Audio levels in 0..1. */
export interface CallLevels {
  local: number;
  remote: number;
}

export interface LevelMeter {
  read(): number;
  stop(): void;
}

type AudioContextCtor = typeof AudioContext;

let snapshot: CallLevels = { local: 0, remote: 0 };
const listeners = new Set<() => void>();

export const levelStore = {
  get: (): CallLevels => snapshot,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  set(next: CallLevels): void {
    if (Math.abs(next.local - snapshot.local) < 0.02 && Math.abs(next.remote - snapshot.remote) < 0.02
      && (next.local === 0) === (snapshot.local === 0) && (next.remote === 0) === (snapshot.remote === 0)) return;
    snapshot = next;
    listeners.forEach((l) => l());
  }
};

export const useCallLevels = (): CallLevels => useSyncExternalStore(levelStore.subscribe, levelStore.get, levelStore.get);

// Egy MediaStream hangszintjét (0..1) méri. A stop() minden erőforrást felszabadít.
export function createLevelMeter(stream: MediaStream | null | undefined): LevelMeter {
  const AC: AudioContextCtor | undefined =
    window.AudioContext || (window as Window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  if (!AC || !stream || stream.getAudioTracks().length === 0) return { read: () => 0, stop: () => {} };
  let ctx: AudioContext | undefined;
  try {
    ctx = new AC();
    const audio = ctx;
    const source = audio.createMediaStreamSource(stream);
    const analyser = audio.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser); // nincs a kimenetre kötve: nem szól bele a hallgatásba
    const buf = new Uint8Array(analyser.fftSize);
    return {
      read() {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const sample of buf) {
          const v = (sample - 128) / 128;
          sum += v * v;
        }
        return Math.min(1, Math.sqrt(sum / buf.length) * 3.2);
      },
      stop() {
        try { source.disconnect(); } catch (e) { /* ignore */ }
        audio.close().catch(() => {});
      }
    };
  } catch (e) {
    try { ctx?.close(); } catch (err) { /* ignore */ }
    return { read: () => 0, stop: () => {} };
  }
}
