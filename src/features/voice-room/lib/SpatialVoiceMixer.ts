// Térbeli hang (MiskolcPhobia): a bejövő hangot egy HRTF panneren át szólaltatja meg.
// Lánc: MediaStreamSource -> highpass -> lowpass -> HRTF panner -> gain -> süketítés-gain -> kimenet.
// A MediaStream-nek a (némított) audio elemhez csatolva kell maradnia, különben a Chromium
// nem ad hangot a WebAudio-nak.

const SPATIAL_REF = 1.5;
const SPATIAL_MAX = 25;

export interface SpatialListener {
  x: number;
  y: number;
  z: number;
  yaw?: number;
}

/**
 * Where a peer's voice comes from. `listener` is the local player; `muffled` = through a wall,
 * `gain` 0 = silent, `radio` = not positional, band-pass filtered.
 */
export interface SpatialConfig {
  x: number;
  y: number;
  z: number;
  listener?: SpatialListener | null;
  muffled?: boolean;
  gain?: number;
  radio?: boolean;
}

/** The audio graph of one spatialised peer. */
export interface SpatialChain {
  stream: MediaStream;
  src: MediaStreamAudioSourceNode;
  hp: BiquadFilterNode;
  lp: BiquadFilterNode;
  panner: PannerNode;
  gain: GainNode;
  out: GainNode;
}

type AudioContextFactory = () => AudioContext | null;

const defaultContextFactory: AudioContextFactory = () => {
  const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctx ? new Ctx() : null;
};

const setParam = (param: AudioParam | undefined, value: number, ctx: BaseAudioContext): void => {
  if (!param) return;
  try { param.setTargetAtTime(value, ctx.currentTime, 0.04); } catch { param.value = value; }
};

/** Owns the shared AudioContext of spatial voice and builds/updates per-peer chains. */
export class SpatialVoiceMixer {
  readonly #createContext: AudioContextFactory;
  #ctx: AudioContext | null = null;

  constructor(createContext: AudioContextFactory = defaultContextFactory) {
    this.#createContext = createContext;
  }

  /** Resumes the context after a user gesture (autoplay rules). */
  resume(): void {
    if (this.#ctx?.state === 'suspended') this.#ctx.resume().catch(() => {});
  }

  /**
   * Builds (or reuses) the chain for `stream` and applies `cfg`. Returns the chain, or null when
   * Web Audio is unavailable.
   */
  apply(current: SpatialChain | null, stream: MediaStream, cfg: SpatialConfig, deafened: boolean): SpatialChain | null {
    const ctx = this.#context();
    if (!ctx) return current;

    let chain = current;
    if (chain && chain.stream !== stream) {
      SpatialVoiceMixer.teardown(chain);
      chain = null;
    }
    if (!chain) chain = this.#buildChain(ctx, stream);

    const radio = !!cfg.radio;
    const l = cfg.listener;
    if (l) this.#placeListener(ctx, l);
    // Rádió: nem pozicionális (a panner a hallgatónál ül), sávszűrt hang
    const px = radio && l ? l.x : cfg.x;
    const py = radio && l ? l.y : cfg.y;
    const pz = radio && l ? l.z : cfg.z;
    const { panner } = chain;
    if (panner.positionX) {
      setParam(panner.positionX, px, ctx); setParam(panner.positionY, py, ctx); setParam(panner.positionZ, pz, ctx);
    } else if (panner.setPosition) {
      panner.setPosition(px, py, pz);
    }
    setParam(chain.hp.frequency, radio ? 450 : 20, ctx);
    setParam(chain.lp.frequency, radio ? 3200 : cfg.muffled ? 700 : 22050, ctx);
    setParam(chain.gain.gain, cfg.gain ?? (cfg.muffled ? 0.45 : 1), ctx);
    setParam(chain.out.gain, deafened ? 0 : 1, ctx);
    return chain;
  }

  /** Silences or restores a chain's output (deafen). */
  setDeafened(chain: SpatialChain, deafened: boolean): void {
    if (this.#ctx) setParam(chain.out.gain, deafened ? 0 : 1, this.#ctx);
  }

  /** Closes the shared context; the next apply() opens a new one. */
  close(): void {
    this.#ctx?.close().catch(() => {});
    this.#ctx = null;
  }

  static teardown(chain: SpatialChain): void {
    try { chain.src.disconnect(); } catch { /* ignore */ }
    try { chain.out.disconnect(); } catch { /* ignore */ }
  }

  #context(): AudioContext | null {
    let ctx = this.#ctx;
    if (!ctx || ctx.state === 'closed') {
      ctx = this.#createContext();
      if (!ctx) return null;
      this.#ctx = ctx;
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  #buildChain(ctx: AudioContext, stream: MediaStream): SpatialChain {
    const src = ctx.createMediaStreamSource(stream);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 20;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 22050;
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'linear';
    panner.refDistance = SPATIAL_REF;
    panner.maxDistance = SPATIAL_MAX;
    panner.rolloffFactor = 1;
    const gain = ctx.createGain();
    const out = ctx.createGain();
    src.connect(hp); hp.connect(lp); lp.connect(panner); panner.connect(gain); gain.connect(out);
    out.connect(ctx.destination);
    return { stream, src, hp, lp, panner, gain, out };
  }

  #placeListener(ctx: AudioContext, l: SpatialListener): void {
    const L = ctx.listener;
    const fx = -Math.sin(l.yaw || 0);
    const fz = -Math.cos(l.yaw || 0);
    if (L.positionX) {
      setParam(L.positionX, l.x, ctx); setParam(L.positionY, l.y, ctx); setParam(L.positionZ, l.z, ctx);
      setParam(L.forwardX, fx, ctx); setParam(L.forwardY, 0, ctx); setParam(L.forwardZ, fz, ctx);
      setParam(L.upX, 0, ctx); setParam(L.upY, 1, ctx); setParam(L.upZ, 0, ctx);
    } else if (L.setPosition) {
      L.setPosition(l.x, l.y, l.z);
      L.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }
}
