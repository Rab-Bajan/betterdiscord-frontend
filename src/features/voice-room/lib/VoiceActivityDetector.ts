// Beszédérzékelés (VAD): a mikrofon frekvencia-átlagából dönti el, beszél-e a felhasználó.
// Rövid szünetek után még 4 mérésig (≈400 ms) beszédnek tekinti, hogy ne villogjon a jelzés.

const THRESHOLD = 14;
const HOLD_TICKS = 4;
const TICK_MS = 100;

export interface VoiceActivityOptions {
  /** Called only when the speaking state changes. */
  onSpeakingChange: (speaking: boolean) => void;
  /** Muted users never count as speaking. */
  isMuted: () => boolean;
  createContext?: () => AudioContext;
}

const defaultContext = (): AudioContext => {
  const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return new Ctx();
};

export class VoiceActivityDetector {
  readonly #onSpeakingChange: (speaking: boolean) => void;
  readonly #isMuted: () => boolean;
  readonly #createContext: () => AudioContext;
  #ctx: AudioContext | null = null;
  #timer: ReturnType<typeof setInterval> | undefined;
  #speaking = false;

  constructor({ onSpeakingChange, isMuted, createContext = defaultContext }: VoiceActivityOptions) {
    this.#onSpeakingChange = onSpeakingChange;
    this.#isMuted = isMuted;
    this.#createContext = createContext;
  }

  get speaking(): boolean {
    return this.#speaking;
  }

  /** The audio context of the meter (resumed together with playback on user gestures). */
  get context(): AudioContext | null {
    return this.#ctx;
  }

  start(stream: MediaStream): void {
    try {
      const audioCtx = this.#createContext();
      this.#ctx = audioCtx;
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.minDecibels = -85;
      analyser.maxDecibels = -10;
      analyser.smoothingTimeConstant = 0.4;
      audioCtx.createMediaStreamSource(stream).connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      let holdTicks = 0;
      this.#timer = setInterval(() => {
        analyser.getByteFrequencyData(data);
        const average = data.reduce((a, b) => a + b, 0) / data.length;
        if (average > THRESHOLD && !this.#isMuted()) {
          holdTicks = HOLD_TICKS;
          this.setSpeaking(true);
        } else if (holdTicks > 0) {
          holdTicks--;
        } else {
          this.setSpeaking(false);
        }
      }, TICK_MS);
    } catch (e) {
      console.warn('VAD hiba:', e);
    }
  }

  stop(): void {
    clearInterval(this.#timer);
    this.#timer = undefined;
    this.#ctx?.close().catch(() => {});
    this.#ctx = null;
    this.setSpeaking(false);
  }

  /** Sets the state (e.g. false on mute) and reports changes. */
  setSpeaking(value: boolean): void {
    if (this.#speaking === value) return;
    this.#speaking = value;
    this.#onSpeakingChange(value);
  }
}
