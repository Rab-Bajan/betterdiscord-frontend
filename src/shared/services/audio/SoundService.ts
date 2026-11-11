// Discord-style sound effects generated via Web Audio API

type AudioContextFactory = () => AudioContext | null;

interface ToneSpec {
  type: OscillatorType;
  /** Indulási idő a "most"-hoz képest (s). */
  offset?: number;
  fromHz: number;
  toHz: number;
  /** A frekvencia-rámpa vége (s, a "most"-hoz képest). */
  rampEnd: number;
  volume: number;
  /** A hangerő-lecsengés és a leállítás ideje (s, a "most"-hoz képest). */
  end: number;
}

const defaultContextFactory: AudioContextFactory = () => {
  const w = window as Window & { webkitAudioContext?: typeof AudioContext };
  const AudioContextClass = window.AudioContext || w.webkitAudioContext;
  return AudioContextClass ? new AudioContextClass() : null;
};

/** Szintetizált UI hangeffektek; egyetlen AudioContextet hoz létre lustán, első használatkor. */
export class SoundService {
  #ctx: AudioContext | null = null;
  readonly #createContext: AudioContextFactory;

  constructor(createContext: AudioContextFactory = defaultContextFactory) {
    this.#createContext = createContext;
  }

  #getAudioContext(): AudioContext | null {
    if (!this.#ctx) {
      this.#ctx = this.#createContext();
    }
    if (this.#ctx && this.#ctx.state === 'suspended') {
      this.#ctx.resume();
    }
    return this.#ctx;
  }

  #tone(ctx: AudioContext, now: number, spec: ToneSpec): void {
    const start = now + (spec.offset ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = spec.type;
    osc.frequency.setValueAtTime(spec.fromHz, start);
    osc.frequency.exponentialRampToValueAtTime(spec.toHz, now + spec.rampEnd);
    gain.gain.setValueAtTime(spec.volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, now + spec.end);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(now + spec.end);
  }

  #play(specs: readonly ToneSpec[], errorLabel = 'Audio play error:'): void {
    try {
      const ctx = this.#getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      for (const spec of specs) this.#tone(ctx, now, spec);
    } catch (err) {
      console.error(errorLabel, err);
    }
  }

  // Discord-like connect tones: 440 -> 880 Hz
  playJoin(): void {
    this.#play([{ type: 'sine', fromHz: 440, toHz: 880, rampEnd: 0.14, volume: 0.12, end: 0.22 }]);
  }

  // Discord-like disconnect tone: 600 -> 260 Hz
  playLeave(): void {
    this.#play([{ type: 'sine', fromHz: 600, toHz: 260, rampEnd: 0.16, volume: 0.12, end: 0.22 }]);
  }

  playMute(isMuted: boolean): void {
    this.#play([
      isMuted
        ? { type: 'triangle', fromHz: 400, toHz: 220, rampEnd: 0.08, volume: 0.08, end: 0.1 }
        : { type: 'triangle', fromHz: 220, toHz: 440, rampEnd: 0.08, volume: 0.08, end: 0.1 }
    ]);
  }

  playMessage(): void {
    this.#play([{ type: 'sine', fromHz: 800, toHz: 1100, rampEnd: 0.06, volume: 0.07, end: 0.12 }]);
  }

  // Különálló, elegáns kéthangú csengő privát üzenetekhez (DM)
  playPrivateMessage(): void {
    this.#play(
      [
        // 1. hang: Lágy magas harang (E5 -> G5)
        { type: 'sine', fromHz: 659.25, toHz: 783.99, rampEnd: 0.08, volume: 0.09, end: 0.22 },
        // 2. hang: Kristályos csengő akkord 80ms-sel később (C6 -> E6)
        { type: 'sine', offset: 0.08, fromHz: 1046.5, toHz: 1318.5, rampEnd: 0.18, volume: 0.11, end: 0.35 }
      ],
      'Private audio play error:'
    );
  }
}

export const soundService = new SoundService();

export const playJoinSound = (): void => soundService.playJoin();
export const playLeaveSound = (): void => soundService.playLeave();
export const playMuteSound = (isMuted: boolean): void => soundService.playMute(isMuted);
export const playMessageSound = (): void => soundService.playMessage();
export const playPrivateMessageSound = (): void => soundService.playPrivateMessage();
