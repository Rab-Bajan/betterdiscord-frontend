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

/** Phase C sound ids (43): the spec's file names without `.mp3`, plus three lead additions. */
export const SFX_IDS = [
  'sfx_broom_scratch_asphalt',
  'sfx_broom_gravel',
  'sfx_vacuum_hum_loop',
  'sfx_vacuum_slurp',
  'sfx_leaf_blower_2t',
  'sfx_can_crunch',
  'sfx_metal_clink',
  'sfx_copper_heavy_thud',
  'sfx_can_rattle',
  'sfx_acid_sizzle',
  'sfx_detector_click'
] as const;
export type SfxId = (typeof SFX_IDS)[number];

/** One synthesised layer: filtered noise or an oscillator, with an attack/decay envelope. */
interface SfxLayer {
  readonly src: 'noise' | OscillatorType;
  readonly freq?: number;
  readonly freqEnd?: number;
  readonly filter?: { readonly type: BiquadFilterType; readonly freq: number; readonly freqEnd?: number; readonly q?: number };
  readonly gain: number;
  readonly attack: number;
  readonly decay: number;
  readonly delay?: number;
  /** Tremolo rate (Hz): the 2-stroke putter, scratch strokes. */
  readonly tremolo?: number;
}

const SFX: Readonly<Record<SfxId, readonly SfxLayer[]>> = {
  sfx_broom_scratch_asphalt: [{ src: 'noise', filter: { type: 'bandpass', freq: 2600, freqEnd: 1800, q: 1.2 }, gain: 0.28, attack: 0.03, decay: 0.32, tremolo: 22 }],
  sfx_broom_gravel: [
    { src: 'noise', filter: { type: 'lowpass', freq: 1100, q: 0.8 }, gain: 0.3, attack: 0.02, decay: 0.34, tremolo: 31 },
    { src: 'noise', filter: { type: 'highpass', freq: 3500 }, gain: 0.08, attack: 0.005, decay: 0.08, delay: 0.12 }
  ],
  sfx_vacuum_hum_loop: [
    { src: 'sawtooth', freq: 118, gain: 0.07, attack: 0.04, decay: 0.3 },
    { src: 'noise', filter: { type: 'lowpass', freq: 700 }, gain: 0.1, attack: 0.04, decay: 0.3 }
  ],
  sfx_vacuum_slurp: [{ src: 'noise', filter: { type: 'bandpass', freq: 400, freqEnd: 2400, q: 3 }, gain: 0.3, attack: 0.01, decay: 0.24 }],
  sfx_leaf_blower_2t: [
    { src: 'sawtooth', freq: 78, freqEnd: 84, gain: 0.12, attack: 0.02, decay: 0.3, tremolo: 38 },
    { src: 'noise', filter: { type: 'highpass', freq: 1500 }, gain: 0.12, attack: 0.03, decay: 0.3 }
  ],
  sfx_can_crunch: [
    { src: 'noise', filter: { type: 'highpass', freq: 2800 }, gain: 0.35, attack: 0.002, decay: 0.06 },
    { src: 'noise', filter: { type: 'bandpass', freq: 1800, q: 2 }, gain: 0.25, attack: 0.002, decay: 0.08, delay: 0.05 }
  ],
  sfx_metal_clink: [
    { src: 'sine', freq: 2350, gain: 0.16, attack: 0.002, decay: 0.3 },
    { src: 'sine', freq: 3720, gain: 0.07, attack: 0.002, decay: 0.18 }
  ],
  sfx_copper_heavy_thud: [
    { src: 'sine', freq: 95, freqEnd: 48, gain: 0.4, attack: 0.004, decay: 0.32 },
    { src: 'noise', filter: { type: 'lowpass', freq: 500 }, gain: 0.18, attack: 0.002, decay: 0.12 }
  ],
  sfx_can_rattle: [0, 0.11, 0.2, 0.33, 0.47, 0.62].map((delay, i) => ({ src: 'triangle' as const, freq: 2900 - i * 180, gain: 0.12 - i * 0.012, attack: 0.002, decay: 0.07, delay })),
  sfx_acid_sizzle: [{ src: 'noise', filter: { type: 'highpass', freq: 4200 }, gain: 0.22, attack: 0.05, decay: 0.8, tremolo: 47 }],
  sfx_detector_click: [{ src: 'square', freq: 1850, gain: 0.08, attack: 0.001, decay: 0.018 }]
};

/** Beyond this distance a positioned sound is not played (the full mix is Phase H). */
const SFX_HEARING_M = 40;

export class SweepersAudio {
  #ctx: AudioContext | null = null;
  #master: GainNode | null = null;
  #noise: AudioBuffer | null = null;
  #deviceId = 'default';
  #muted = false;
  #listener = { x: 0, z: 0 };
  /** Every sfx id played (debug / tests), most recent last; bounded. */
  readonly played: SfxId[] = [];

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

  /** Where the player hears from (simple distance falloff for positioned sounds). */
  setListener(x: number, z: number): void {
    this.#listener = { x, z };
  }

  /** Plays a synthesised Phase C sound; `at` attenuates it by distance from the listener. */
  sfx(id: SfxId, at?: { readonly x: number; readonly z: number }): void {
    const level = at ? 1 / (1 + Math.hypot(at.x - this.#listener.x, at.z - this.#listener.z) / 6) : 1;
    if (at && Math.hypot(at.x - this.#listener.x, at.z - this.#listener.z) > SFX_HEARING_M) return;
    this.played.push(id);
    if (this.played.length > 64) this.played.shift();
    const ctx = this.#ctx;
    const master = this.#master;
    if (!ctx || !master || ctx.state !== 'running') return;
    const t0 = ctx.currentTime;
    for (const layer of SFX[id]) this.#layer(ctx, master, layer, t0 + (layer.delay ?? 0), level);
  }

  #layer(ctx: AudioContext, master: GainNode, layer: SfxLayer, t: number, level: number): void {
    const end = t + layer.attack + layer.decay;
    let src: AudioScheduledSourceNode;
    if (layer.src === 'noise') {
      const noise = ctx.createBufferSource();
      noise.buffer = this.#noiseBuffer(ctx);
      noise.loop = true;
      src = noise;
    } else {
      const osc = ctx.createOscillator();
      osc.type = layer.src;
      osc.frequency.setValueAtTime(layer.freq ?? 440, t);
      if (layer.freqEnd) osc.frequency.exponentialRampToValueAtTime(layer.freqEnd, end);
      src = osc;
    }
    const nodes: AudioNode[] = [src];
    if (layer.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = layer.filter.type;
      filter.frequency.setValueAtTime(layer.filter.freq, t);
      if (layer.filter.freqEnd) filter.frequency.exponentialRampToValueAtTime(layer.filter.freqEnd, end);
      filter.Q.value = layer.filter.q ?? 0.9;
      nodes.push(filter);
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, layer.gain * level), t + layer.attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    nodes.push(gain);
    if (layer.tremolo) {
      const trem = ctx.createGain();
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = layer.tremolo;
      depth.gain.value = 0.5;
      trem.gain.value = 0.5;
      lfo.connect(depth).connect(trem.gain);
      lfo.start(t);
      lfo.stop(end + 0.02);
      lfo.onended = () => {
        lfo.disconnect();
        depth.disconnect();
      };
      nodes.push(trem);
    }
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i];
      const b = nodes[i + 1];
      if (a && b) a.connect(b);
    }
    nodes[nodes.length - 1]?.connect(master);
    src.start(t);
    src.stop(end + 0.02);
    src.onended = () => {
      for (const node of nodes) node.disconnect();
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
