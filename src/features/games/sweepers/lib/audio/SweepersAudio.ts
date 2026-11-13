// Játékhangok Web Audio szintézissel, a hívásbeállításokban választott kimeneti eszközre irányítva.

/** AudioContext.setSinkId (Chrome 110+) is not in lib.dom yet. */
interface SinkSelectable {
  setSinkId(sinkId: string): Promise<void>;
}

export function supportsSinkSelection(ctx: object): ctx is SinkSelectable {
  return 'setSinkId' in ctx && typeof ctx.setSinkId === 'function';
}

/** Routes `ctx` to `deviceId` ('default' = system default). No-op where unsupported; never throws. */
export async function applyOutputDevice(ctx: object, deviceId: string): Promise<boolean> {
  if (!supportsSinkSelection(ctx)) return false;
  try {
    await ctx.setSinkId(deviceId === 'default' ? '' : deviceId);
    return true;
  } catch {
    return false;
  }
}

const MASTER_VOLUME = 0.6;

export class SweepersAudio {
  #ctx: AudioContext | null = null;
  #master: GainNode | null = null;
  #noise: AudioBuffer | null = null;
  #deviceId = 'default';
  #muted = false;

  /** Creates / resumes the context; call from a user gesture. */
  unlock(): void {
    if (typeof AudioContext === 'undefined') return;
    if (!this.#ctx) {
      this.#ctx = new AudioContext();
      this.#master = this.#ctx.createGain();
      this.#master.gain.value = this.#muted ? 0 : MASTER_VOLUME;
      this.#master.connect(this.#ctx.destination);
      void applyOutputDevice(this.#ctx, this.#deviceId);
    }
    if (this.#ctx.state === 'suspended') this.#ctx.resume().catch(() => {});
  }

  setOutputDevice(deviceId: string): void {
    this.#deviceId = deviceId || 'default';
    if (this.#ctx) void applyOutputDevice(this.#ctx, this.#deviceId);
  }

  setMuted(muted: boolean): void {
    this.#muted = muted;
    if (this.#master && this.#ctx) this.#master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, this.#ctx.currentTime, 0.05);
  }

  /** Short filtered noise burst on asphalt; `sprint` makes it heavier. */
  footstep(sprint: boolean): void {
    const ctx = this.#ctx;
    const master = this.#master;
    if (!ctx || !master || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.#noiseBuffer(ctx);
    src.playbackRate.value = 0.8 + Math.random() * 0.3;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = sprint ? 900 : 1300;
    filter.Q.value = 0.9;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(sprint ? 0.32 : 0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(filter).connect(gain).connect(master);
    src.start(t);
    src.stop(t + 0.14);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  /** Low thump when landing from a jump. */
  land(): void {
    const ctx = this.#ctx;
    const master = this.#master;
    if (!ctx || !master || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.15);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + 0.2);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  /** Spec 24 chime when a hex reaches 90 %: a bright two-note bell (E6 then B6) with partials. */
  chime(): void {
    const ctx = this.#ctx;
    const master = this.#master;
    if (!ctx || !master || ctx.state !== 'running') return;
    const t0 = ctx.currentTime;
    for (const [freq, delay] of [[1318.5, 0], [1975.5, 0.14]] as const) {
      for (const [ratio, level] of [[1, 0.22], [2.76, 0.07], [5.4, 0.03]] as const) {
        const t = t0 + delay;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq * ratio, t);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(level, t + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1 / ratio + 0.25);
        osc.connect(gain).connect(master);
        osc.start(t);
        osc.stop(t + 1.5);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
      }
    }
  }

  dispose(): void {
    this.#master?.disconnect();
    this.#ctx?.close().catch(() => {});
    this.#ctx = null;
    this.#master = null;
    this.#noise = null;
  }

  #noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.#noise) return this.#noise;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.#noise = buffer;
    return buffer;
  }
}
