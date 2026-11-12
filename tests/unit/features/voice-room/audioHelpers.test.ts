import { describe, it, expect, vi, afterEach } from 'vitest';
import { VoiceActivityDetector } from '../../../../src/features/voice-room/lib/VoiceActivityDetector';
import { SpatialVoiceMixer } from '../../../../src/features/voice-room/lib/SpatialVoiceMixer';

afterEach(() => vi.useRealTimers());

const param = () => ({ value: 0, setTargetAtTime: vi.fn() });
const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });

function fakeAudioContext(level: { value: number }) {
  return {
    state: 'running',
    currentTime: 0,
    destination: {},
    listener: { positionX: param(), positionY: param(), positionZ: param(), forwardX: param(), forwardY: param(), forwardZ: param(), upX: param(), upY: param(), upZ: param() },
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    createAnalyser: () => ({ fftSize: 0, frequencyBinCount: 4, getByteFrequencyData: (d: Uint8Array) => d.fill(level.value), ...node() }),
    createMediaStreamSource: () => node(),
    createBiquadFilter: () => ({ type: '', frequency: param(), ...node() }),
    createPanner: () => ({ positionX: param(), positionY: param(), positionZ: param(), ...node() }),
    createGain: () => ({ gain: param(), ...node() })
  } as unknown as AudioContext;
}

describe('VoiceActivityDetector', () => {
  it('reports speaking above the threshold and holds it for 4 quiet ticks', () => {
    vi.useFakeTimers();
    const level = { value: 40 };
    const changes: boolean[] = [];
    const vad = new VoiceActivityDetector({ onSpeakingChange: (s) => changes.push(s), isMuted: () => false, createContext: () => fakeAudioContext(level) });
    vad.start({} as MediaStream);
    vi.advanceTimersByTime(100);
    expect(changes).toEqual([true]);
    level.value = 0;
    vi.advanceTimersByTime(400);
    expect(changes).toEqual([true]);
    vi.advanceTimersByTime(100);
    expect(changes).toEqual([true, false]);
    vad.stop();
  });

  it('never reports speaking while muted', () => {
    vi.useFakeTimers();
    const onSpeakingChange = vi.fn();
    const vad = new VoiceActivityDetector({ onSpeakingChange, isMuted: () => true, createContext: () => fakeAudioContext({ value: 99 }) });
    vad.start({} as MediaStream);
    vi.advanceTimersByTime(500);
    expect(onSpeakingChange).not.toHaveBeenCalled();
    vad.stop();
  });
});

describe('SpatialVoiceMixer', () => {
  it('builds one chain per stream and positions the source', () => {
    const mixer = new SpatialVoiceMixer(() => fakeAudioContext({ value: 0 }));
    const stream = {} as MediaStream;
    const chain = mixer.apply(null, stream, { x: 1, y: 2, z: 3 }, false);
    expect(chain).not.toBeNull();
    expect(chain?.panner.positionX.setTargetAtTime).toHaveBeenCalledWith(1, 0, 0.04);
    expect(mixer.apply(chain, stream, { x: 4, y: 0, z: 0, muffled: true }, true)).toBe(chain);
    expect(chain?.lp.frequency.setTargetAtTime).toHaveBeenLastCalledWith(700, 0, 0.04);
    expect(chain?.out.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.04);
  });

  it('places a radio voice at the listener with a band-pass', () => {
    const mixer = new SpatialVoiceMixer(() => fakeAudioContext({ value: 0 }));
    const chain = mixer.apply(null, {} as MediaStream, { x: 9, y: 9, z: 9, radio: true, listener: { x: 1, y: 1, z: 1, yaw: 0 } }, false);
    expect(chain?.panner.positionX.setTargetAtTime).toHaveBeenCalledWith(1, 0, 0.04);
    expect(chain?.hp.frequency.setTargetAtTime).toHaveBeenCalledWith(450, 0, 0.04);
  });

  it('does nothing without Web Audio', () => {
    expect(new SpatialVoiceMixer(() => null).apply(null, {} as MediaStream, { x: 0, y: 0, z: 0 }, false)).toBeNull();
  });
});
