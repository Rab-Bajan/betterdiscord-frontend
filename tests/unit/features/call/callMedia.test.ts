import { describe, it, expect, vi } from 'vitest';
import { buildAudioConstraints, getMic, micErrorCode } from '../../../../src/features/call/lib/callMedia';
import { DEFAULT_SETTINGS } from '../../../../src/features/call/lib/callSettings';

const named = (name: string) => Object.assign(new Error(name), { name });

describe('micErrorCode', () => {
  it('maps permission, missing-device and other errors', () => {
    expect(micErrorCode(named('NotAllowedError'))).toBe('mic-denied');
    expect(micErrorCode(named('SecurityError'))).toBe('mic-denied');
    expect(micErrorCode(named('NotFoundError'))).toBe('mic-missing');
    expect(micErrorCode(named('OverconstrainedError'))).toBe('mic-missing');
    expect(micErrorCode(named('NotReadableError'))).toBe('mic-busy');
    expect(micErrorCode(null)).toBe('mic-busy');
  });
});

describe('buildAudioConstraints', () => {
  it('pins a chosen device and passes the processing flags', () => {
    const c = buildAudioConstraints({ ...DEFAULT_SETTINGS, noiseSuppression: false }, 'mic-2');
    expect(c).toEqual({
      audio: {
        deviceId: { exact: 'mic-2' }, echoCancellation: true, noiseSuppression: false, autoGainControl: true,
        channelCount: { ideal: 1 }, sampleRate: { ideal: 48000 }, sampleSize: { ideal: 16 }
      },
      video: false
    });
  });

  it('omits deviceId for the default device', () => {
    expect(buildAudioConstraints(DEFAULT_SETTINGS).audio).not.toHaveProperty('deviceId');
  });
});

describe('getMic', () => {
  it('falls back to the default device when the chosen one vanished', async () => {
    const stream = {} as MediaStream;
    const gum = vi.fn().mockRejectedValueOnce(named('NotFoundError')).mockResolvedValueOnce(stream);
    await expect(getMic(gum, DEFAULT_SETTINGS, 'gone')).resolves.toBe(stream);
    expect(gum).toHaveBeenCalledTimes(2);
    expect(gum.mock.calls[1]?.[0]).toEqual(buildAudioConstraints(DEFAULT_SETTINGS, 'default'));
  });

  it('rethrows permission errors and errors on the default device', async () => {
    await expect(getMic(vi.fn().mockRejectedValue(named('NotAllowedError')), DEFAULT_SETTINGS, 'x')).rejects.toThrow('NotAllowedError');
    await expect(getMic(vi.fn().mockRejectedValue(named('NotFoundError')), DEFAULT_SETTINGS)).rejects.toThrow('NotFoundError');
  });
});
