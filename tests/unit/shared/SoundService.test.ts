import { describe, it, expect, vi, afterEach } from 'vitest';
import { SoundService } from '../../../src/shared/services/audio/SoundService';

function makeParam() {
  return { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
}

function makeCtx(state: AudioContextState = 'running') {
  const oscillators: any[] = [];
  const gains: any[] = [];
  const ctx = {
    state,
    currentTime: 10,
    destination: { dest: true },
    resume: vi.fn(),
    createOscillator: vi.fn(() => {
      const o = { type: '', frequency: makeParam(), connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      oscillators.push(o);
      return o;
    }),
    createGain: vi.fn(() => {
      const g = { gain: makeParam(), connect: vi.fn() };
      gains.push(g);
      return g;
    })
  };
  return { ctx, oscillators, gains };
}

afterEach(() => vi.restoreAllMocks());

describe('SoundService', () => {
  it('creates the AudioContext lazily and only once', () => {
    const { ctx } = makeCtx();
    const factory = vi.fn(() => ctx as unknown as AudioContext);
    const svc = new SoundService(factory);
    expect(factory).not.toHaveBeenCalled();
    svc.playMessage();
    svc.playJoin();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('resumes a suspended context', () => {
    const { ctx } = makeCtx('suspended');
    new SoundService(() => ctx as unknown as AudioContext).playLeave();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it('is a no-op without AudioContext support', () => {
    expect(() => new SoundService(() => null).playJoin()).not.toThrow();
  });

  it('join sound: sine 440 -> 880 Hz, routed to destination', () => {
    const { ctx, oscillators, gains } = makeCtx();
    new SoundService(() => ctx as unknown as AudioContext).playJoin();
    const [o] = oscillators;
    const [g] = gains;
    expect(o.type).toBe('sine');
    expect(o.frequency.setValueAtTime).toHaveBeenCalledWith(440, 10);
    expect(o.frequency.exponentialRampToValueAtTime.mock.calls[0][0]).toBe(880);
    expect(o.frequency.exponentialRampToValueAtTime.mock.calls[0][1]).toBeCloseTo(10.14);
    expect(g.gain.setValueAtTime).toHaveBeenCalledWith(0.12, 10);
    expect(g.gain.exponentialRampToValueAtTime.mock.calls[0][1]).toBeCloseTo(10.22);
    expect(o.connect).toHaveBeenCalledWith(g);
    expect(g.connect).toHaveBeenCalledWith(ctx.destination);
    expect(o.start).toHaveBeenCalledWith(10);
    expect(o.stop.mock.calls[0][0]).toBeCloseTo(10.22);
  });

  it('mute sound direction depends on the muted flag', () => {
    const a = makeCtx();
    const svc = new SoundService(() => a.ctx as unknown as AudioContext);
    svc.playMute(true);
    svc.playMute(false);
    const [muted, unmuted] = a.oscillators;
    expect(muted.type).toBe('triangle');
    expect(muted.frequency.setValueAtTime).toHaveBeenCalledWith(400, 10);
    expect(muted.frequency.exponentialRampToValueAtTime.mock.calls[0][0]).toBe(220);
    expect(unmuted.frequency.setValueAtTime).toHaveBeenCalledWith(220, 10);
    expect(unmuted.frequency.exponentialRampToValueAtTime.mock.calls[0][0]).toBe(440);
  });

  it('private message sound plays two tones, the second delayed by 80 ms', () => {
    const { ctx, oscillators, gains } = makeCtx();
    new SoundService(() => ctx as unknown as AudioContext).playPrivateMessage();
    expect(oscillators).toHaveLength(2);
    const [, o2] = oscillators;
    expect(oscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(659.25, 10);
    expect(o2.frequency.setValueAtTime.mock.calls[0][0]).toBe(1046.5);
    expect(o2.frequency.setValueAtTime.mock.calls[0][1]).toBeCloseTo(10.08);
    expect(gains[1].gain.setValueAtTime.mock.calls[0][0]).toBe(0.11);
    expect(o2.start.mock.calls[0][0]).toBeCloseTo(10.08);
    expect(o2.stop.mock.calls[0][0]).toBeCloseTo(10.35);
  });

  it('logs and swallows audio errors with the original labels', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ctx } = makeCtx();
    ctx.createOscillator.mockImplementation(() => { throw new Error('boom'); });
    const svc = new SoundService(() => ctx as unknown as AudioContext);
    expect(() => svc.playMessage()).not.toThrow();
    expect(() => svc.playPrivateMessage()).not.toThrow();
    expect(err.mock.calls[0]?.[0]).toBe('Audio play error:');
    expect(err.mock.calls[1]?.[0]).toBe('Private audio play error:');
  });
});
