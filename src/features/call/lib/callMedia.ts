// Mikrofon megszerzése a hívás-beállítások alapján, és a hibák felhasználói hibakódra fordítása.
import type { CallSettings } from './callSettings';

export type MicErrorCode = 'mic-denied' | 'mic-missing' | 'mic-busy';

export type GetUserMedia = (constraints: MediaStreamConstraints) => Promise<MediaStream>;

const errorName = (err: unknown): string | undefined =>
  typeof err === 'object' && err !== null && 'name' in err && typeof err.name === 'string' ? err.name : undefined;

export function micErrorCode(err: unknown): MicErrorCode {
  const n = errorName(err);
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'mic-denied';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'mic-missing';
  return 'mic-busy';
}

export function buildAudioConstraints(settings: CallSettings, deviceId?: string): MediaStreamConstraints {
  const dev = deviceId ?? settings.inputDeviceId;
  return {
    audio: {
      ...(dev && dev !== 'default' ? { deviceId: { exact: dev } } : {}),
      echoCancellation: settings.echoCancellation,
      noiseSuppression: settings.noiseSuppression,
      autoGainControl: settings.autoGainControl,
      channelCount: { ideal: 1 },
      sampleRate: { ideal: 48000 },
      sampleSize: { ideal: 16 }
    },
    video: false
  };
}

export async function getMic(getUserMedia: GetUserMedia, settings: CallSettings, deviceId?: string): Promise<MediaStream> {
  try {
    return await getUserMedia(buildAudioConstraints(settings, deviceId));
  } catch (err) {
    // Eltűnt/ismeretlen eszköz: visszaesés az alapértelmezett mikrofonra
    const name = errorName(err);
    if ((name === 'OverconstrainedError' || name === 'NotFoundError') && (deviceId ?? settings.inputDeviceId) !== 'default') {
      return getUserMedia(buildAudioConstraints(settings, 'default'));
    }
    throw err;
  }
}
