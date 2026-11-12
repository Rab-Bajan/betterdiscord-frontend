/**
 * webAudio.ts
 *
 * The Web Audio surface PhobiaAudio uses, as structural types (a real AudioContext satisfies them),
 * a headless mock context for Node tests, and the walkie-talkie overdrive curve.
 */

export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, startTime: number): unknown;
  linearRampToValueAtTime(value: number, endTime: number): unknown;
  exponentialRampToValueAtTime(value: number, endTime: number): unknown;
  setTargetAtTime(target: number, startTime: number, timeConstant: number): unknown;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike | AudioParamLike): unknown;
  disconnect(): void;
}

export interface GainNodeLike extends AudioNodeLike {
  gain: AudioParamLike;
}

export interface OscillatorNodeLike extends AudioNodeLike {
  type: OscillatorType;
  frequency: AudioParamLike;
  detune: AudioParamLike;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface BiquadFilterNodeLike extends AudioNodeLike {
  type: BiquadFilterType;
  frequency: AudioParamLike;
  Q: AudioParamLike;
  gain: AudioParamLike;
}

export interface AudioBufferLike {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  duration: number;
  getChannelData(channel: number): Float32Array;
}

export interface AudioBufferSourceNodeLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  playbackRate: AudioParamLike;
  loop: boolean;
  start(when?: number, offset?: number, duration?: number): void;
  stop(when?: number): void;
}

export interface WaveShaperNodeLike extends AudioNodeLike {
  curve: Float32Array<ArrayBuffer> | null;
  oversample: OverSampleType;
}

export interface PannerNodeLike extends AudioNodeLike {
  panningModel?: PanningModelType;
  distanceModel: DistanceModelType;
  refDistance: number;
  maxDistance: number;
  rolloffFactor: number;
  positionX?: AudioParamLike;
  positionY?: AudioParamLike;
  positionZ?: AudioParamLike;
  setPosition?(x: number, y: number, z: number): void;
}

export interface AudioContextLike {
  currentTime: number;
  sampleRate: number;
  state: AudioContextState;
  destination: AudioNodeLike;
  createGain(): GainNodeLike;
  createOscillator(): OscillatorNodeLike;
  createBiquadFilter(): BiquadFilterNodeLike;
  createBufferSource(): AudioBufferSourceNodeLike;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  createWaveShaper(): WaveShaperNodeLike;
  createPanner(): PannerNodeLike;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Creates an overdrive WaveShaper curve.
 * @param {number} amount - Distortion drive amount (0 - 100)
 * @param {number} samples - Number of curve samples
 * @returns {Float32Array}
 */
export function createOverdriveCurve(amount = 25, samples = 1024): Float32Array<ArrayBuffer> {
  const k = Math.max(1, amount);
  const curve = new Float32Array(samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < samples; ++i) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

/**
 * Mock Web Audio Context for Headless Node.js Unit Testing
 */
export function createMockAudioContext(): AudioContextLike {
  const createParam = (defaultValue = 0): AudioParamLike & { defaultValue: number } => ({
    value: defaultValue,
    defaultValue,
    setValueAtTime(val: number) { this.value = val; return this; },
    linearRampToValueAtTime(val: number) { this.value = val; return this; },
    exponentialRampToValueAtTime(val: number) { this.value = val; return this; },
    setTargetAtTime(val: number) { this.value = val; return this; }
  });

  const baseNode = (): AudioNodeLike => ({
    connect(dest: AudioNodeLike | AudioParamLike) { return dest; },
    disconnect() {}
  });

  return {
    currentTime: 0.1,
    sampleRate: 44100,
    state: 'running',
    destination: baseNode(),
    createGain() {
      return { ...baseNode(), gain: createParam(1.0) };
    },
    createOscillator() {
      return {
        ...baseNode(),
        type: 'sine',
        frequency: createParam(440),
        detune: createParam(0),
        start() {},
        stop() {}
      };
    },
    createBiquadFilter() {
      return {
        ...baseNode(),
        type: 'lowpass',
        frequency: createParam(1000),
        Q: createParam(1.0),
        gain: createParam(0)
      };
    },
    createBufferSource() {
      return {
        ...baseNode(),
        buffer: null,
        playbackRate: createParam(1.0),
        loop: false,
        start() {},
        stop() {}
      };
    },
    createBuffer(channels: number, length: number, sampleRate: number) {
      const buffers = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: (ch = 0): Float32Array => buffers[ch] || new Float32Array(length)
      };
    },
    createWaveShaper() {
      return {
        ...baseNode(),
        curve: null,
        oversample: 'none'
      };
    },
    createPanner() {
      return {
        ...baseNode(),
        distanceModel: 'linear',
        refDistance: 1.0,
        maxDistance: 10.0,
        rolloffFactor: 1.0,
        positionX: createParam(0),
        positionY: createParam(0),
        positionZ: createParam(0)
      };
    },
    resume() { return Promise.resolve(); },
    suspend() { return Promise.resolve(); },
    close() { return Promise.resolve(); }
  };
}
