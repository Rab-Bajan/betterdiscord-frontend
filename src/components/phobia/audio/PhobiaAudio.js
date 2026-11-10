import * as THREE from 'three';

/**
 * Surface Profiles for Footstep Synthesis
 */
export const SURFACE_PROFILES = Object.freeze({
  GRAVEL: 'gravel',
  CONCRETE: 'concrete',
  MUD: 'mud',
  METAL: 'metal'
});

/**
 * Hungarian Spirit Box Voice Line Dictionary
 */
export const SPIRIT_BOX_PHRASES = Object.freeze({
  ITT_VAGYOK: 'Itt vagyok',
  MOGOTTED: 'Mögötted',
  MENJ_INNEN: 'Menj innen',
  GYILKOLNI: 'Gyilkolni',
  HIDEG: 'Hideg'
});

/**
 * EMF Pulse Frequencies (Hz) per Level (1 - 5)
 */
export const EMF_PULSE_RATES = Object.freeze({
  0: 0,
  1: 1.5,
  2: 5.0,
  3: 15.0,
  4: 30.0,
  5: 50.0
});

/**
 * Creates an overdrive WaveShaper curve.
 * @param {number} amount - Distortion drive amount (0 - 100)
 * @param {number} samples - Number of curve samples
 * @returns {Float32Array}
 */
export function createOverdriveCurve(amount = 25, samples = 1024) {
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
export function createMockAudioContext() {
  const createParam = (defaultValue = 0) => ({
    value: defaultValue,
    defaultValue,
    setValueAtTime(val) { this.value = val; return this; },
    linearRampToValueAtTime(val) { this.value = val; return this; },
    exponentialRampToValueAtTime(val) { this.value = val; return this; },
    setTargetAtTime(val) { this.value = val; return this; }
  });

  const baseNode = () => ({
    connect(dest) { return dest; },
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
    createBuffer(channels, length, sampleRate) {
      const buffers = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: (ch = 0) => buffers[ch] || new Float32Array(length)
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

/**
 * PhobiaAudio
 * Procedural Horror Audio System for MiskolcPhobia.
 *
 * Implements:
 * - 12 Procedural/Synthesized SFX Catalog
 * - 5 Hungarian Formant Speech Synthesizer Voice Lines
 * - 3D Positional Audio Attenuation with Three.js AudioListener & PositionalAudio
 * - DSP Walkie-Talkie Filter Chain (400-3500Hz bandpass, overdrive, squelch, hunt corruption)
 * - Proximity 3D Voice Attenuation
 */
export class PhobiaAudio {
  constructor(options = {}) {
    const {
      listener = null,
      audioContext = null,
      camera = null,
      masterVolume = 1.0,
      sfxVolume = 0.9,
      voiceVolume = 1.0,
      radioVolume = 0.85
    } = options;

    // Initialize Web Audio Context
    if (audioContext) {
      this.context = audioContext;
    } else if (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.context = new AudioCtx();
    } else {
      this.context = createMockAudioContext();
    }

    // Browsers start the context suspended until a user gesture: resume on the first one
    if (typeof window !== 'undefined' && this.context && this.context.state === 'suspended') {
      this._gestureResume = () => {
        this.resumeContext();
        window.removeEventListener('pointerdown', this._gestureResume, true);
        window.removeEventListener('keydown', this._gestureResume, true);
      };
      window.addEventListener('pointerdown', this._gestureResume, true);
      window.addEventListener('keydown', this._gestureResume, true);
    }

    // Initialize Three.js AudioListener
    if (listener) {
      this.listener = listener;
    } else if (typeof THREE !== 'undefined' && typeof window !== 'undefined' && this.context) {
      try {
        this.listener = new THREE.AudioListener();
      } catch {
        this.listener = null;
      }
    } else {
      this.listener = null;
    }

    if (camera && this.listener && camera.add) {
      camera.add(this.listener);
    }

    // Master bus structure
    this.masterGain = this.context.createGain();
    this.masterGain.gain.setValueAtTime(masterVolume, this.context.currentTime);
    this.masterGain.connect(this.context.destination);

    this.sfxGain = this.context.createGain();
    this.sfxGain.gain.setValueAtTime(sfxVolume, this.context.currentTime);
    this.sfxGain.connect(this.masterGain);

    this.voiceGain = this.context.createGain();
    this.voiceGain.gain.setValueAtTime(voiceVolume, this.context.currentTime);
    this.voiceGain.connect(this.masterGain);

    this.radioGain = this.context.createGain();
    this.radioGain.gain.setValueAtTime(radioVolume, this.context.currentTime);
    this.radioGain.connect(this.masterGain);

    // Active continuous sound loops
    this.heartbeatState = {
      active: false,
      timerId: null,
      sanity: 100,
      ghostDistance: 30,
      isHunting: false,
      currentBpm: 75,
      gainNode: null
    };

    this.breakerBuzzNodes = null;
    this.emfLoopState = {
      level: 0,
      intervalId: null
    };
    this.spiritBoxSweepNodes = null;
    this.carAlarmState = {
      active: false,
      intervalId: null
    };

    // Walkie-Talkie Filter Chain
    this.walkieTalkie = this._initWalkieTalkieChain();

    // Cache precomputed noise buffers
    this.noiseBuffer = this._generateNoiseBuffer(3.0);
    this.pinkNoiseBuffer = this._generatePinkNoiseBuffer(3.0);
  }

  /* -------------------------------------------------------------------------- */
  /*                                NOISE BUFFERS                               */
  /* -------------------------------------------------------------------------- */

  _generateNoiseBuffer(seconds = 2.0) {
    if (!this.context || !this.context.createBuffer) return null;
    const length = Math.floor(this.context.sampleRate * seconds);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  _generatePinkNoiseBuffer(seconds = 2.0) {
    if (!this.context || !this.context.createBuffer) return null;
    const length = Math.floor(this.context.sampleRate * seconds);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  /* -------------------------------------------------------------------------- */
  /*                            3D SPATIAL AUDIO                                */
  /* -------------------------------------------------------------------------- */

  /**
   * Creates a THREE.PositionalAudio instance with linear attenuation (Point 95).
   * RefDistance: 1.5m, MaxDistance: 25.0m, Rolloff: 1.0.
   */
  createPositionalAudio(options = {}) {
    const {
      refDistance = 1.5,
      maxDistance = 25.0,
      rolloffFactor = 1.0,
      distanceModel = 'linear'
    } = options;

    if (this.listener && typeof THREE !== 'undefined' && THREE.PositionalAudio) {
      const posAudio = new THREE.PositionalAudio(this.listener);
      posAudio.setRefDistance(refDistance);
      posAudio.setMaxDistance(maxDistance);
      posAudio.setRolloffFactor(rolloffFactor);
      posAudio.setDistanceModel(distanceModel);
      return posAudio;
    }

    return null;
  }

  /**
   * Attaches a positional audio source to a 3D Object3D / Mesh.
   */
  attachToMesh(mesh, options = {}) {
    if (!mesh || typeof mesh.add !== 'function') return null;
    const posAudio = this.createPositionalAudio(options);
    if (posAudio) {
      mesh.add(posAudio);
    }
    return posAudio;
  }

  /**
   * Resolves routing destination node for a sound playback.
   */
  _resolveDestination(options = {}) {
    if (options.positionalAudio && options.positionalAudio.gain) {
      return options.positionalAudio.gain;
    }
    if (options.destinationNode) {
      return options.destinationNode;
    }
    if (options.bus === 'voice') return this.voiceGain;
    if (options.bus === 'radio') return this.radioGain;
    return this.sfxGain;
  }

  /* -------------------------------------------------------------------------- */
  /*           12 SYNTHESIZED / PROCEDURAL HORROR SFX CATALOG (Point 96)        */
  /* -------------------------------------------------------------------------- */

  /**
   * 1. Footsteps: 4 surface profiles ('gravel', 'concrete', 'mud', 'metal')
   * with randomized pitch, filter cutoffs, and tactile transients.
   */
  playFootstep(surface = 'concrete', options = {}) {
    const now = this.context.currentTime;
    const opts = typeof options === 'boolean' ? { isSprinting: options } : (options || {});
    const dest = this._resolveDestination(opts);
    const volume = (opts.volume ?? (opts.isSprinting ? 1.25 : 1.0));
    const normalizedSurface = String(surface).toLowerCase();

    // Random pitch multiplier between 0.88 and 1.12
    const pitchMod = 0.88 + Math.random() * 0.24;

    const gainNode = this.context.createGain();
    gainNode.connect(dest);

    if (normalizedSurface === SURFACE_PROFILES.GRAVEL) {
      // Loose stones & granular crunch
      const bandpass = this.context.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime((1400 + (Math.random() * 400 - 200)) * pitchMod, now);
      bandpass.Q.setValueAtTime(1.6, now);

      const noiseSrc = this.context.createBufferSource();
      noiseSrc.buffer = this.noiseBuffer;
      noiseSrc.playbackRate.setValueAtTime(pitchMod, now);

      gainNode.gain.setValueAtTime(0.001, now);
      gainNode.gain.linearRampToValueAtTime(0.55 * volume, now + 0.015);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      noiseSrc.connect(bandpass);
      bandpass.connect(gainNode);
      noiseSrc.start(now);
      noiseSrc.stop(now + 0.17);

      // Low thump
      const thud = this.context.createOscillator();
      const thudGain = this.context.createGain();
      thud.type = 'triangle';
      thud.frequency.setValueAtTime(90 * pitchMod, now);
      thud.frequency.exponentialRampToValueAtTime(40, now + 0.06);
      thudGain.gain.setValueAtTime(0.3 * volume, now);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      thud.connect(thudGain);
      thudGain.connect(dest);
      thud.start(now);
      thud.stop(now + 0.07);

    } else if (normalizedSurface === SURFACE_PROFILES.MUD) {
      // Wet squelch & suction release
      const osc = this.context.createOscillator();
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450 * pitchMod, now);
      filter.Q.setValueAtTime(4.0, now);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(240 * pitchMod, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.14);

      gainNode.gain.setValueAtTime(0.001, now);
      gainNode.gain.linearRampToValueAtTime(0.6 * volume, now + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(filter);
      filter.connect(gainNode);
      osc.start(now);
      osc.stop(now + 0.16);

    } else if (normalizedSurface === SURFACE_PROFILES.METAL) {
      // Hollow resonant steel floor clank
      const bandpass = this.context.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(1200 * pitchMod, now);
      bandpass.Q.setValueAtTime(4.5, now);

      // Resonant harmonic pair
      const osc1 = this.context.createOscillator();
      const osc2 = this.context.createOscillator();
      osc1.type = 'square';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(840 * pitchMod, now);
      osc2.frequency.setValueAtTime(1260 * pitchMod, now);

      gainNode.gain.setValueAtTime(0.001, now);
      gainNode.gain.linearRampToValueAtTime(0.45 * volume, now + 0.008);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc1.connect(bandpass);
      osc2.connect(bandpass);
      bandpass.connect(gainNode);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.23);
      osc2.stop(now + 0.23);

    } else {
      // Default: Solid concrete impact
      const osc = this.context.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160 * pitchMod, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.07);

      const highNoise = this.context.createBufferSource();
      highNoise.buffer = this.noiseBuffer;
      const noiseFilter = this.context.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(2200 * pitchMod, now);
      noiseFilter.Q.setValueAtTime(1.0, now);

      gainNode.gain.setValueAtTime(0.001, now);
      gainNode.gain.linearRampToValueAtTime(0.65 * volume, now + 0.005);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gainNode);
      highNoise.connect(noiseFilter);
      noiseFilter.connect(gainNode);
      osc.start(now);
      highNoise.start(now);
      osc.stop(now + 0.09);
      highNoise.stop(now + 0.09);
    }
  }

  /**
   * 2. Heartbeat: Lub-dub loop whose playback rate and volume scale up
   * with low sanity (< 30%) and ghost hunt proximity.
   */
  startHeartbeat() {
    if (this.heartbeatState.active) return;
    this.heartbeatState.active = true;
    this._scheduleHeartbeatTick();
  }

  stopHeartbeat() {
    this.heartbeatState.active = false;
    if (this.heartbeatState.timerId) {
      clearTimeout(this.heartbeatState.timerId);
      this.heartbeatState.timerId = null;
    }
  }

  updateHeartbeat(optionsOrSanity = {}, maybeHunting = false) {
    let sanity = 100;
    let ghostDistance = 30;
    let isHunting = false;

    if (typeof optionsOrSanity === 'number') {
      sanity = optionsOrSanity;
      isHunting = !!maybeHunting;
    } else if (optionsOrSanity && typeof optionsOrSanity === 'object') {
      sanity = optionsOrSanity.sanity ?? 100;
      ghostDistance = optionsOrSanity.ghostDistance ?? 30;
      isHunting = Boolean(optionsOrSanity.isHunting);
    }

    this.heartbeatState.sanity = Math.max(0, Math.min(100, sanity));
    this.heartbeatState.ghostDistance = Math.max(0, ghostDistance);
    this.heartbeatState.isHunting = !!isHunting;

    // Heartbeat BPM calculation:
    // Normal: 72 BPM. Low sanity (<30%): ramps up to 120 BPM.
    // Close ghost proximity (<15m) or active hunt: accelerates up to 155 BPM.
    let targetBpm = 72;
    if (this.heartbeatState.sanity < 30) {
      const sanityFactor = (30 - this.heartbeatState.sanity) / 30;
      targetBpm += sanityFactor * 48; // up to 120
    }
    if (this.heartbeatState.isHunting) {
      targetBpm = Math.max(targetBpm, 145);
    }
    if (this.heartbeatState.ghostDistance < 15) {
      const distFactor = (15 - this.heartbeatState.ghostDistance) / 15;
      targetBpm += distFactor * 35;
    }
    this.heartbeatState.currentBpm = Math.min(160, targetBpm);

    const shouldBeActive = this.heartbeatState.sanity < 50 ||
      this.heartbeatState.isHunting ||
      this.heartbeatState.ghostDistance < 12;

    if (shouldBeActive && !this.heartbeatState.active) {
      this.startHeartbeat();
    } else if (!shouldBeActive && this.heartbeatState.active) {
      this.stopHeartbeat();
    }
  }

  _scheduleHeartbeatTick() {
    if (!this.heartbeatState.active) return;

    this._playSingleHeartbeatPulse();

    const bpm = this.heartbeatState.currentBpm || 80;
    const intervalMs = Math.max(370, (60 / bpm) * 1000);

    this.heartbeatState.timerId = setTimeout(() => {
      this._scheduleHeartbeatTick();
    }, intervalMs);
  }

  _playSingleHeartbeatPulse() {
    const now = this.context.currentTime;
    const bpm = this.heartbeatState.currentBpm;
    // Volume scales up as intensity grows
    const intensity = Math.min(1.0, Math.max(0.2, (bpm - 70) / 80));

    // "Lub" pulse
    const osc1 = this.context.createOscillator();
    const gain1 = this.context.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(58, now);
    osc1.frequency.exponentialRampToValueAtTime(38, now + 0.08);

    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.linearRampToValueAtTime(0.7 * intensity, now + 0.015);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc1.connect(gain1);
    gain1.connect(this.sfxGain);
    osc1.start(now);
    osc1.stop(now + 0.1);

    // "Dub" pulse (~120ms later, slightly lower pitch)
    const tDub = now + 0.12;
    const osc2 = this.context.createOscillator();
    const gain2 = this.context.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(50, tDub);
    osc2.frequency.exponentialRampToValueAtTime(32, tDub + 0.07);

    gain2.gain.setValueAtTime(0.001, tDub);
    gain2.gain.linearRampToValueAtTime(0.55 * intensity, tDub + 0.015);
    gain2.gain.exponentialRampToValueAtTime(0.001, tDub + 0.08);

    osc2.connect(gain2);
    gain2.connect(this.sfxGain);
    osc2.start(tDub);
    osc2.stop(tDub + 0.09);
  }

  /**
   * 3. Breaker knife switch heavy snap, electric buzz, and overload electrical arc.
   */
  playBreakerFlip(options = {}) {
    const now = this.context.currentTime;
    const dest = this._resolveDestination(options);
    const volume = options.volume ?? 1.0;

    // Heavy cast-iron mechanical snap
    const click = this.context.createOscillator();
    const clickGain = this.context.createGain();
    click.type = 'square';
    click.frequency.setValueAtTime(650, now);
    click.frequency.exponentialRampToValueAtTime(120, now + 0.03);

    clickGain.gain.setValueAtTime(0.8 * volume, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    click.connect(clickGain);
    clickGain.connect(dest);
    click.start(now);
    click.stop(now + 0.05);

    // Deep iron clunk thump
    const thud = this.context.createOscillator();
    const thudGain = this.context.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(95, now);
    thud.frequency.exponentialRampToValueAtTime(35, now + 0.09);
    thudGain.gain.setValueAtTime(0.9 * volume, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    thud.connect(thudGain);
    thudGain.connect(dest);
    thud.start(now);
    thud.stop(now + 0.11);
  }

  startBreakerBuzz(options = {}) {
    if (this.breakerBuzzNodes) return;
    const now = this.context.currentTime;
    const dest = this._resolveDestination(options);
    const volume = options.volume ?? 0.7;

    // European 50Hz mains hum fundamental + 100Hz / 150Hz harmonics
    const osc50 = this.context.createOscillator();
    const osc100 = this.context.createOscillator();
    const osc150 = this.context.createOscillator();
    osc50.type = 'sawtooth';
    osc100.type = 'sine';
    osc150.type = 'square';
    osc50.frequency.setValueAtTime(50, now);
    osc100.frequency.setValueAtTime(100, now);
    osc150.frequency.setValueAtTime(150, now);

    // Harsh white noise spark sizzle (~4000 Hz)
    const noise = this.context.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;
    const sizzleFilter = this.context.createBiquadFilter();
    sizzleFilter.type = 'bandpass';
    sizzleFilter.frequency.setValueAtTime(4200, now);
    sizzleFilter.Q.setValueAtTime(3.0, now);

    const gainNode = this.context.createGain();
    gainNode.gain.setValueAtTime(volume * 0.45, now);

    osc50.connect(gainNode);
    osc100.connect(gainNode);
    osc150.connect(gainNode);
    noise.connect(sizzleFilter);
    sizzleFilter.connect(gainNode);
    gainNode.connect(dest);

    osc50.start(now);
    osc100.start(now);
    osc150.start(now);
    noise.start(now);

    this.breakerBuzzNodes = { osc50, osc100, osc150, noise, gainNode };
  }

  stopBreakerBuzz() {
    if (!this.breakerBuzzNodes) return;
    const now = this.context.currentTime;
    try {
      this.breakerBuzzNodes.gainNode.gain.linearRampToValueAtTime(0.001, now + 0.05);
      this.breakerBuzzNodes.osc50.stop(now + 0.06);
      this.breakerBuzzNodes.osc100.stop(now + 0.06);
      this.breakerBuzzNodes.osc150.stop(now + 0.06);
      this.breakerBuzzNodes.noise.stop(now + 0.06);
    } catch {
      // Ignore if already stopped
    }
    this.breakerBuzzNodes = null;
  }

  playBreakerOverload(options = {}) {
    const now = this.context.currentTime;
    const dest = this._resolveDestination(options);
    const volume = options.volume ?? 1.0;

    // Overload electrical arc burst with downward sweeping discharge
    const noise = this.context.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3500, now);
    filter.frequency.exponentialRampToValueAtTime(110, now + 0.35);
    filter.Q.setValueAtTime(2.5, now);

    const gainNode = this.context.createGain();
    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.linearRampToValueAtTime(1.0 * volume, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(dest);
    noise.start(now);
    noise.stop(now + 0.42);

    // Trip snap at conclusion
    setTimeout(() => {
      this.playBreakerFlip(options);
    }, 320);
  }

  /**
   * 4. Lightbulb shatter pop and glass crunch.
   */
  playLightbulbShatter(options = {}) {
    const now = this.context.currentTime;
    const dest = this._resolveDestination(options);
    const volume = options.volume ?? 1.0;

    // Filament pop explosion
    const popOsc = this.context.createOscillator();
    const popGain = this.context.createGain();
    popOsc.type = 'triangle';
    popOsc.frequency.setValueAtTime(280, now);
    popOsc.frequency.exponentialRampToValueAtTime(45, now + 0.05);
    popGain.gain.setValueAtTime(0.9 * volume, now);
    popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    popOsc.connect(popGain);
    popGain.connect(dest);
    popOsc.start(now);
    popOsc.stop(now + 0.07);

    // Glass shard resonant shower (multi-frequency pings)
    const glassFreqs = [2600, 3900, 5200, 7100];
    glassFreqs.forEach((freq, idx) => {
      const ping = this.context.createOscillator();
      const pingGain = this.context.createGain();
      const tPing = now + idx * 0.015;
      ping.type = 'sine';
      ping.frequency.setValueAtTime(freq * (0.95 + Math.random() * 0.1), tPing);

      const decay = 0.08 + Math.random() * 0.12;
      pingGain.gain.setValueAtTime(0.4 * volume, tPing);
      pingGain.gain.exponentialRampToValueAtTime(0.001, tPing + decay);

      ping.connect(pingGain);
      pingGain.connect(dest);
      ping.start(tPing);
      ping.stop(tPing + decay + 0.01);
    });

    // Glass crunch scatter
    this.playGlassCrunch({ ...options, delay: 0.05, volume: volume * 0.8 });
  }

  playGlassCrunch(options = {}) {
    const now = this.context.currentTime + (options.delay || 0);
    const dest = this._resolveDestination(options);
    const volume = options.volume ?? 0.7;

    const noise = this.context.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(3200, now);

    const gainNode = this.context.createGain();
    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.linearRampToValueAtTime(0.5 * volume, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(dest);
    noise.start(now);
    noise.stop(now + 0.15);
  }

  /**
   * 5. Hinged metal/wood door slow creak and loud slam.
   */
  playDoorCreak(options = {}) {
    const now = this.context.currentTime;
    const dest = this._resolveDestination(options);
    const volume = options.volume ?? 0.8;
    const duration = options.duration ?? 1.2;

    // Screeching hinge friction: pitch sweep 320 Hz -> 840 Hz with jitter
    const osc = this.context.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.linearRampToValueAtTime(840, now + duration);

    // Friction LFO vibrato (22 Hz chatter)
    const lfo = this.context.createOscillator();
    const lfoGain = this.context.createGain();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(24, now);
    lfoGain.gain.setValueAtTime(45, now);
    lfo.connect(osc.frequency);

    const bandpass = this.context.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(700, now);
    bandpass.Q.setValueAtTime(3.5, now);

    const gainNode = this.context.createGain();
    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.linearRampToValueAtTime(0.55 * volume, now + 0.15);
    gainNode.gain.linearRampToValueAtTime(0.45 * volume, now + duration - 0.2);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(bandpass);
    bandpass.connect(gainNode);
    gainNode.connect(dest);

    lfo.start(now);
    osc.start(now);
    lfo.stop(now + duration + 0.05);
    osc.stop(now + duration + 0.05);
  }

  playDoorSlam(options = {}) {
    const now = this.context.currentTime;
    const dest = this._resolveDestination(options);
    const volume = options.volume ?? 1.0;

    // Sub-bass heavy punch (60 Hz sub-bass boom)
    const subOsc = this.context.createOscillator();
    const subGain = this.context.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(62, now);
    subOsc.frequency.exponentialRampToValueAtTime(25, now + 0.35);
    subGain.gain.setValueAtTime(1.0 * volume, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    subOsc.connect(subGain);
    subGain.connect(dest);
    subOsc.start(now);
    subOsc.stop(now + 0.42);

    // 1200 Hz metallic slapback reverb echo
    const slapOsc = this.context.createOscillator();
    const slapGain = this.context.createGain();
    slapOsc.type = 'square';
    slapOsc.frequency.setValueAtTime(1200, now);
    slapGain.gain.setValueAtTime(0.6 * volume, now);
    slapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    slapOsc.connect(slapGain);
    slapGain.connect(dest);
    slapOsc.start(now);
    slapOsc.stop(now + 0.15);
  }

  /**
   * 6. EMF reader clicks (1 Hz to 50 Hz pulse train scaling with EMF levels 1 to 5).
   */
  setEmfLevel(level = 0) {
    const clamped = Math.max(0, Math.min(5, Math.floor(level)));
    this.emfLoopState.level = clamped;

    if (clamped === 0) {
      this.stopEmf();
      return;
    }

    if (this.emfLoopState.intervalId) {
      clearInterval(this.emfLoopState.intervalId);
    }

    const rateHz = EMF_PULSE_RATES[clamped] || 1.5;
    const intervalMs = Math.max(18, Math.floor(1000 / rateHz));

    this.emfLoopState.intervalId = setInterval(() => {
      this.playEmfClick();
    }, intervalMs);
  }

  startEmf(level = 1) {
    this.setEmfLevel(level);
  }

  stopEmf() {
    this.emfLoopState.level = 0;
    if (this.emfLoopState.intervalId) {
      clearInterval(this.emfLoopState.intervalId);
      this.emfLoopState.intervalId = null;
    }
  }

  playEmfClick(options = {}) {
    const now = this.context.currentTime;
    const dest = this._resolveDestination(options);
    const volume = options.volume ?? 0.65;

    // Sharp tactile chirp (2800 Hz micro-click)
    const osc = this.context.createOscillator();
    const gainNode = this.context.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(2800, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.007);

    gainNode.gain.setValueAtTime(0.8 * volume, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.008);

    osc.connect(gainNode);
    gainNode.connect(dest);
    osc.start(now);
    osc.stop(now + 0.01);
  }

  /**
   * 7. Spirit Box radio frequency white noise static sweep.
   */
  startSpiritBoxSweep(options = {}) {
    if (this.spiritBoxSweepNodes) return;
    const now = this.context.currentTime;
    const dest = this._resolveDestination(options);
    const volume = options.volume ?? 0.55;

    const noise = this.context.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;

    // Sweeping bandpass filter across frequencies (400 Hz to 3800 Hz)
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(500, now);
    filter.Q.setValueAtTime(2.0, now);

    // LFO frequency sweep (3.5 Hz sweep rate)
    const lfo = this.context.createOscillator();
    const lfoGain = this.context.createGain();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(3.5, now);
    lfoGain.gain.setValueAtTime(1600, now);
    lfo.connect(filter.frequency);

    const gainNode = this.context.createGain();
    gainNode.gain.setValueAtTime(volume * 0.4, now);

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(dest);

    lfo.start(now);
    noise.start(now);

    this.spiritBoxSweepNodes = { noise, lfo, filter, gainNode };
  }

  stopSpiritBoxSweep() {
    if (!this.spiritBoxSweepNodes) return;
    const now = this.context.currentTime;
    try {
      this.spiritBoxSweepNodes.gainNode.gain.linearRampToValueAtTime(0.001, now + 0.05);
      this.spiritBoxSweepNodes.noise.stop(now + 0.06);
      this.spiritBoxSweepNodes.lfo.stop(now + 0.06);
    } catch {
      // Ignore
    }
    this.spiritBoxSweepNodes = null;
  }

  playSpiritBoxBlip(options = {}) {
    const now = this.context.currentTime;
    const dest = this._resolveDestination(options);
    const volume = options.volume ?? 0.5;

    const osc = this.context.createOscillator();
    const gainNode = this.context.createGain();
    osc.type = 'sine';
    const randFreq = 600 + Math.random() * 2000;
    osc.frequency.setValueAtTime(randFreq, now);

    gainNode.gain.setValueAtTime(0.4 * volume, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gainNode);
    gainNode.connect(dest);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  /**
   * 8. Hunt warning siren and distant heavy metallic footsteps.
   */
  playHuntSiren(options = {}) {
    const now = this.context.currentTime;
    const dest = this._resolveDestination(options);
    const volume = options.volume ?? 0.85;
    const duration = options.duration ?? 2.4;

    // Distant industrial siren with descending pitch bend (440 Hz -> 330 Hz)
    const osc = this.context.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.linearRampToValueAtTime(330, now + duration);

    const lowpass = this.context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(950, now);

    const gainNode = this.context.createGain();
    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.linearRampToValueAtTime(0.7 * volume, now + 0.25);
    gainNode.gain.setValueAtTime(0.65 * volume, now + duration - 0.3);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(lowpass);
    lowpass.connect(gainNode);
    gainNode.connect(dest);

    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  playHeavyMetallicFootstep(options = {}) {
    const now = this.context.currentTime;
    const dest = this._resolveDestination(options);
    const volume = options.volume ?? 1.0;

    // Deep heavy sub-bass thud (45 Hz)
    const subOsc = this.context.createOscillator();
    const subGain = this.context.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(45, now);
    subOsc.frequency.exponentialRampToValueAtTime(20, now + 0.28);
    subGain.gain.setValueAtTime(0.9 * volume, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    subOsc.connect(subGain);
    subGain.connect(dest);
    subOsc.start(now);
    subOsc.stop(now + 0.32);

    // Hollow metallic ring (680 Hz and 1150 Hz)
    const ring1 = this.context.createOscillator();
    const ringGain = this.context.createGain();
    ring1.type = 'square';
    ring1.frequency.setValueAtTime(680, now);

    ringGain.gain.setValueAtTime(0.35 * volume, now);
    ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    ring1.connect(ringGain);
    ringGain.connect(dest);
    ring1.start(now);
    ring1.stop(now + 0.48);
  }

  /**
   * 9. Jumpscare musical sting and screeching ghost scream.
   */
  playJumpscareSting(options = {}) {
    const now = this.context.currentTime;
    const dest = this._resolveDestination(options);
    const volume = options.volume ?? 1.0;

    // Dissonant tritone horror cluster: C#3, G3, C4, F#4
    const chordFreqs = [138.59, 196.00, 261.63, 369.99, 440.00];
    chordFreqs.forEach((freq) => {
      const osc = this.context.createOscillator();
      const gainNode = this.context.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      gainNode.gain.setValueAtTime(0.001, now);
      gainNode.gain.linearRampToValueAtTime(0.45 * volume, now + 0.005);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

      osc.connect(gainNode);
      gainNode.connect(dest);
      osc.start(now);
      osc.stop(now + 0.95);
    });
  }

  playGhostScream(options = {}) {
    const now = this.context.currentTime;
    const dest = this._resolveDestination(options);
    const volume = options.volume ?? 1.0;
    const duration = options.duration ?? 0.8;

    // Dual FM screech: Carrier 1600 Hz modulated by 130 Hz with high FM index
    const carrier = this.context.createOscillator();
    const modulator = this.context.createOscillator();
    const modGain = this.context.createGain();

    carrier.type = 'sawtooth';
    carrier.frequency.setValueAtTime(1800, now);
    carrier.frequency.exponentialRampToValueAtTime(650, now + duration);

    modulator.type = 'sine';
    modulator.frequency.setValueAtTime(130, now);
    modGain.gain.setValueAtTime(600, now);

    modulator.connect(carrier.frequency);

    // Harsh scream shriek noise
    const noise = this.context.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const bandpass = this.context.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(3200, now);
    bandpass.Q.setValueAtTime(2.0, now);

    const gainNode = this.context.createGain();
    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.linearRampToValueAtTime(0.85 * volume, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    carrier.connect(gainNode);
    noise.connect(bandpass);
    bandpass.connect(gainNode);
    gainNode.connect(dest);

    modulator.start(now);
    carrier.start(now);
    noise.start(now);

    modulator.stop(now + duration + 0.05);
    carrier.stop(now + duration + 0.05);
    noise.stop(now + duration + 0.05);
  }

  playJumpscare(options = {}) {
    this.playJumpscareSting(options);
    this.playGhostScream(options);
  }

  /**
   * 10. Pálinka flask liquid gulp and satisfied sigh sound.
   */
  playPalinkaDrink(options = {}) {
    const now = this.context.currentTime;
    const dest = this._resolveDestination(options);
    const volume = options.volume ?? 0.85;

    // Multi-gulp sequence (3 liquid gulps)
    const gulps = [
      { delay: 0.00, startF: 520, endF: 240 },
      { delay: 0.22, startF: 490, endF: 220 },
      { delay: 0.44, startF: 460, endF: 200 }
    ];

    gulps.forEach((g) => {
      const tGulp = now + g.delay;
      const osc = this.context.createOscillator();
      const gainNode = this.context.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(g.startF, tGulp);
      osc.frequency.exponentialRampToValueAtTime(g.endF, tGulp + 0.08);

      gainNode.gain.setValueAtTime(0.001, tGulp);
      gainNode.gain.linearRampToValueAtTime(0.6 * volume, tGulp + 0.015);
      gainNode.gain.exponentialRampToValueAtTime(0.001, tGulp + 0.09);

      osc.connect(gainNode);
      gainNode.connect(dest);
      osc.start(tGulp);
      osc.stop(tGulp + 0.1);
    });

    // Satisfied sigh sound delayed after last gulp
    this.playPalinkaSigh({ ...options, delay: 0.72, volume: volume * 0.7 });
  }

  playPalinkaSigh(options = {}) {
    const now = this.context.currentTime + (options.delay || 0);
    const dest = this._resolveDestination(options);
    const volume = options.volume ?? 0.6;
    const duration = 0.65;

    // Soft breath exhalation ("Ahhh")
    const breath = this.context.createBufferSource();
    breath.buffer = this.pinkNoiseBuffer;
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(850, now);
    filter.frequency.linearRampToValueAtTime(380, now + duration);
    filter.Q.setValueAtTime(1.5, now);

    const gainNode = this.context.createGain();
    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.linearRampToValueAtTime(0.45 * volume, now + 0.12);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    breath.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(dest);
    breath.start(now);
    breath.stop(now + duration + 0.05);
  }

  /**
   * 11. Mobile Jesus crucifix sizzling holy fire burn.
   * Stage 1: Sizzling crackle of burning embers
   * Stage 2: Sizzle + violent metallic fracture snap
   */
  playMobileJesusBurn(options = {}) {
    const now = this.context.currentTime;
    const dest = this._resolveDestination(options);
    const stage = options.stage ?? 1;
    const volume = options.volume ?? 0.9;
    const duration = 1.6;

    // Sizzling crackle of burning embers (filtered noise bursts)
    const noise = this.context.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const highpass = this.context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(3600, now);

    const sizzleGain = this.context.createGain();
    sizzleGain.gain.setValueAtTime(0.001, now);
    sizzleGain.gain.linearRampToValueAtTime(0.6 * volume, now + 0.1);
    sizzleGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(highpass);
    highpass.connect(sizzleGain);
    sizzleGain.connect(dest);
    noise.start(now);
    noise.stop(now + duration + 0.05);

    // Warm holy flame resonance hum
    const hum = this.context.createOscillator();
    const humGain = this.context.createGain();
    hum.type = 'triangle';
    hum.frequency.setValueAtTime(330, now);
    humGain.gain.setValueAtTime(0.001, now);
    humGain.gain.linearRampToValueAtTime(0.35 * volume, now + 0.15);
    humGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.7);
    hum.connect(humGain);
    humGain.connect(dest);
    hum.start(now);
    hum.stop(now + duration * 0.75);

    // Stage 2: High-tension metallic fracture snap
    if (stage >= 2) {
      const snapOsc = this.context.createOscillator();
      const snapGain = this.context.createGain();
      const tSnap = now + 0.65;
      snapOsc.type = 'sawtooth';
      snapOsc.frequency.setValueAtTime(2400, tSnap);
      snapOsc.frequency.exponentialRampToValueAtTime(450, tSnap + 0.08);

      snapGain.gain.setValueAtTime(0.85 * volume, tSnap);
      snapGain.gain.exponentialRampToValueAtTime(0.001, tSnap + 0.12);

      snapOsc.connect(snapGain);
      snapGain.connect(dest);
      snapOsc.start(tSnap);
      snapOsc.stop(tSnap + 0.15);
    }
  }

  /**
   * 12. Car alarm loud horn blare and entrance gate padlock rattle.
   */
  startCarAlarm(options = {}) {
    if (this.carAlarmState.active) return;
    this.carAlarmState.active = true;

    let toggle = false;
    this.carAlarmState.intervalId = setInterval(() => {
      this.playCarAlarmHorn({
        ...options,
        freq: toggle ? 415 : 470,
        duration: 0.22
      });
      toggle = !toggle;
    }, 280);
  }

  stopCarAlarm() {
    this.carAlarmState.active = false;
    if (this.carAlarmState.intervalId) {
      clearInterval(this.carAlarmState.intervalId);
      this.carAlarmState.intervalId = null;
    }
  }

  playCarAlarmHorn(options = {}) {
    const now = this.context.currentTime;
    const dest = this._resolveDestination(options);
    const volume = options.volume ?? 0.8;
    const duration = options.duration ?? 0.22;
    const freq = options.freq ?? 440;

    const osc1 = this.context.createOscillator();
    const osc2 = this.context.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'square';
    osc1.frequency.setValueAtTime(freq, now);
    osc2.frequency.setValueAtTime(freq * 1.5, now);

    const gainNode = this.context.createGain();
    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.linearRampToValueAtTime(0.65 * volume, now + 0.02);
    gainNode.gain.setValueAtTime(0.65 * volume, now + duration - 0.02);
    gainNode.gain.linearRampToValueAtTime(0.001, now + duration);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(dest);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration + 0.02);
    osc2.stop(now + duration + 0.02);
  }

  playPadlockRattle(options = {}) {
    const now = this.context.currentTime;
    const dest = this._resolveDestination(options);
    const volume = options.volume ?? 0.9;

    // Heavy iron padlock clanking with multi-tap chain delays
    const taps = [0.0, 0.025, 0.065, 0.11];
    taps.forEach((tapDelay, idx) => {
      const tTap = now + tapDelay;
      const osc = this.context.createOscillator();
      const gainNode = this.context.createGain();
      osc.type = 'triangle';
      const baseF = 1800 + idx * 300;
      osc.frequency.setValueAtTime(baseF, tTap);
      osc.frequency.exponentialRampToValueAtTime(320, tTap + 0.04);

      gainNode.gain.setValueAtTime(0.7 * volume, tTap);
      gainNode.gain.exponentialRampToValueAtTime(0.001, tTap + 0.05);

      osc.connect(gainNode);
      gainNode.connect(dest);
      osc.start(tTap);
      osc.stop(tTap + 0.06);
    });

    // Deep iron gate clonk
    const gateBoom = this.context.createOscillator();
    const boomGain = this.context.createGain();
    gateBoom.type = 'sine';
    gateBoom.frequency.setValueAtTime(75, now + 0.08);
    gateBoom.frequency.exponentialRampToValueAtTime(30, now + 0.3);
    boomGain.gain.setValueAtTime(0.85 * volume, now + 0.08);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    gateBoom.connect(boomGain);
    boomGain.connect(dest);
    gateBoom.start(now + 0.08);
    gateBoom.stop(now + 0.35);
  }

  /* -------------------------------------------------------------------------- */
  /*                      ADDITIONAL USEFUL SFX (Point 96)                      */
  /* -------------------------------------------------------------------------- */

  playFlashlightClick(options = {}) {
    const now = this.context.currentTime;
    const dest = this._resolveDestination(options);
    const volume = options.volume ?? 0.7;

    const osc = this.context.createOscillator();
    const gainNode = this.context.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2200, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.035);

    gainNode.gain.setValueAtTime(0.75 * volume, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gainNode);
    gainNode.connect(dest);
    osc.start(now);
    osc.stop(now + 0.045);
  }

  playGhostWhisper(options = {}) {
    const now = this.context.currentTime;
    const dest = this._resolveDestination(options);
    const volume = options.volume ?? 0.6;
    const duration = options.duration ?? 1.8;

    const breath = this.context.createBufferSource();
    breath.buffer = this.pinkNoiseBuffer;
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1100, now);
    filter.frequency.linearRampToValueAtTime(650, now + duration);
    filter.Q.setValueAtTime(3.0, now);

    const gainNode = this.context.createGain();
    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.linearRampToValueAtTime(0.5 * volume, now + 0.3);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    breath.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(dest);
    breath.start(now);
    breath.stop(now + duration + 0.05);
  }

  playScrapDrop(options = {}) {
    const now = this.context.currentTime;
    const dest = this._resolveDestination(options);
    const volume = options.volume ?? 0.8;

    // Metallic clatter with random delay taps (15ms, 35ms, 60ms)
    const taps = [0.0, 0.015, 0.035, 0.06];
    taps.forEach((tap) => {
      const t = now + tap;
      const osc = this.context.createOscillator();
      const gainNode = this.context.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(900 + Math.random() * 800, t);

      gainNode.gain.setValueAtTime(0.5 * volume, t);
      gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      osc.connect(gainNode);
      gainNode.connect(dest);
      osc.start(t);
      osc.stop(t + 0.09);
    });
  }

  playSpatialSFX(sfxKey, pos, options = {}) {
    const opts = { ...options };
    if (pos) {
      opts.position = pos;
    }
    const key = String(sfxKey).toLowerCase();
    if (key.includes('buzz') || key.includes('overload') || key.includes('trip')) {
      return this.playBreakerOverload(opts);
    }
    if (key.includes('breaker') || key.includes('flip')) {
      return this.playBreakerFlip(opts);
    }
    if (key.includes('shatter') || key.includes('bulb')) {
      return this.playLightbulbShatter(opts);
    }
    if (key.includes('switch') || key.includes('click')) {
      return this.playFlashlightClick(opts);
    }
    if (key.includes('scrap') || key.includes('drop') || key.includes('clatter')) {
      return this.playScrapDrop(opts);
    }
    return this.playFlashlightClick(opts);
  }

  /* -------------------------------------------------------------------------- */
  /*            HUNGARIAN SPIRIT BOX FORMANT VOICE SYNTHESIS (Point 97)         */
  /* -------------------------------------------------------------------------- */

  /**
   * Synthesizes 5 Hungarian phrases using Web Audio Formant & Phoneme Oscillators.
   * Formants: F1 (pharyngeal), F2 (oral), F3 (naso-pharyngeal).
   * Glottal source: F0 fundamental pulse with spectral shaping.
   */
  playHungarianVoice(phraseKeyOrText, options = {}) {
    const normalized = String(phraseKeyOrText).toLowerCase().trim();

    if (normalized.includes('itt') || normalized.includes('vagyok')) {
      return this.playVoiceIttVagyok(options);
    }
    if (normalized.includes('mögött') || normalized.includes('mogott')) {
      return this.playVoiceMogotted(options);
    }
    if (normalized.includes('menj') || normalized.includes('innen')) {
      return this.playVoiceMenjInnen(options);
    }
    if (normalized.includes('gyilkol') || normalized.includes('halal')) {
      return this.playVoiceGyilkolni(options);
    }
    if (normalized.includes('hideg') || normalized.includes('fazom')) {
      return this.playVoiceHideg(options);
    }

    // Default to "Itt vagyok"
    return this.playVoiceIttVagyok(options);
  }

  _synthesizePhoneme(phoneme, startTime, duration, options = {}) {
    const dest = this._resolveDestination(options);
    const volume = (options.volume ?? 0.85);
    const { f0 = 95, f1 = 500, f2 = 1500, f3 = 2400, isVoiced = true, isNoise = false } = phoneme;

    const gainNode = this.context.createGain();
    gainNode.gain.setValueAtTime(0.001, startTime);
    gainNode.gain.linearRampToValueAtTime(0.4 * volume, startTime + 0.02);
    gainNode.gain.setValueAtTime(0.4 * volume, startTime + duration - 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    // Formant BiquadFilter Bank
    const filter1 = this.context.createBiquadFilter();
    filter1.type = 'bandpass';
    filter1.frequency.setValueAtTime(f1, startTime);
    filter1.Q.setValueAtTime(5.0, startTime);

    const filter2 = this.context.createBiquadFilter();
    filter2.type = 'bandpass';
    filter2.frequency.setValueAtTime(f2, startTime);
    filter2.Q.setValueAtTime(7.0, startTime);

    const filter3 = this.context.createBiquadFilter();
    filter3.type = 'bandpass';
    filter3.frequency.setValueAtTime(f3, startTime);
    filter3.Q.setValueAtTime(9.0, startTime);

    if (isVoiced) {
      // Glottal pulse oscillator (creepy ghost vocal fundamental)
      const glottal = this.context.createOscillator();
      glottal.type = 'sawtooth';
      glottal.frequency.setValueAtTime(f0, startTime);
      glottal.frequency.linearRampToValueAtTime(f0 * 0.94, startTime + duration);

      glottal.connect(filter1);
      glottal.connect(filter2);
      glottal.connect(filter3);

      glottal.start(startTime);
      glottal.stop(startTime + duration + 0.02);
    }

    if (isNoise) {
      // Breathy / fricative noise component
      const noise = this.context.createBufferSource();
      noise.buffer = this.noiseBuffer;
      noise.connect(filter1);
      noise.connect(filter2);
      noise.start(startTime);
      noise.stop(startTime + duration + 0.02);
    }

    filter1.connect(gainNode);
    filter2.connect(gainNode);
    filter3.connect(gainNode);
    gainNode.connect(dest);
  }

  playVoiceIttVagyok(options = {}) {
    const now = this.context.currentTime;
    const phonemes = [
      { f0: 108, f1: 280, f2: 2250, f3: 2900, duration: 0.14, isVoiced: true },        // [i]
      { f0: 105, f1: 3200, f2: 4500, f3: 6000, duration: 0.04, isVoiced: false, isNoise: true }, // [t]
      { f0: 102, f1: 320, f2: 1300, f3: 2400, duration: 0.07, isVoiced: true },         // [v]
      { f0: 98,  f1: 750, f2: 1250, f3: 2450, duration: 0.16, isVoiced: true },         // [a]
      { f0: 94,  f1: 300, f2: 2100, f3: 2800, duration: 0.08, isVoiced: true },         // [gy]
      { f0: 90,  f1: 500, f2: 950,  f3: 2400, duration: 0.18, isVoiced: true },         // [o]
      { f0: 88,  f1: 2200, f2: 3800, f3: 5000, duration: 0.05, isVoiced: false, isNoise: true } // [k]
    ];

    let t = now;
    phonemes.forEach((p) => {
      this._synthesizePhoneme(p, t, p.duration, options);
      t += p.duration;
    });

    // Injects spirit box burst
    this.playSpiritBoxBlip({ ...options, delay: 0.02 });
    return t - now;
  }

  playVoiceMogotted(options = {}) {
    const now = this.context.currentTime;
    const phonemes = [
      { f0: 106, f1: 250, f2: 1100, f3: 2200, duration: 0.11, isVoiced: true },        // [m]
      { f0: 104, f1: 460, f2: 1500, f3: 2250, duration: 0.16, isVoiced: true },        // [ö]
      { f0: 100, f1: 250, f2: 1800, f3: 2400, duration: 0.06, isVoiced: true },        // [g]
      { f0: 96,  f1: 460, f2: 1500, f3: 2250, duration: 0.16, isVoiced: true },        // [ö]
      { f0: 94,  f1: 3200, f2: 4500, f3: 6000, duration: 0.04, isVoiced: false, isNoise: true }, // [t]
      { f0: 92,  f1: 530, f2: 1840, f3: 2500, duration: 0.15, isVoiced: true },        // [e]
      { f0: 88,  f1: 220, f2: 1600, f3: 2400, duration: 0.09, isVoiced: true }         // [d]
    ];

    let t = now;
    phonemes.forEach((p) => {
      this._synthesizePhoneme(p, t, p.duration, options);
      t += p.duration;
    });

    this.playSpiritBoxBlip({ ...options, delay: 0.02 });
    return t - now;
  }

  playVoiceMenjInnen(options = {}) {
    const now = this.context.currentTime;
    const phonemes = [
      { f0: 112, f1: 250, f2: 1100, f3: 2200, duration: 0.10, isVoiced: true }, // [m]
      { f0: 108, f1: 530, f2: 1840, f3: 2500, duration: 0.16, isVoiced: true }, // [e]
      { f0: 104, f1: 280, f2: 2000, f3: 2800, duration: 0.14, isVoiced: true }, // [ny]
      { f0: 100, f1: 280, f2: 2250, f3: 2900, duration: 0.14, isVoiced: true }, // [i]
      { f0: 96,  f1: 250, f2: 1500, f3: 2400, duration: 0.10, isVoiced: true }, // [n]
      { f0: 92,  f1: 530, f2: 1840, f3: 2500, duration: 0.15, isVoiced: true }, // [e]
      { f0: 88,  f1: 250, f2: 1500, f3: 2400, duration: 0.13, isVoiced: true }  // [n]
    ];

    let t = now;
    phonemes.forEach((p) => {
      this._synthesizePhoneme(p, t, p.duration, options);
      t += p.duration;
    });

    this.playSpiritBoxBlip({ ...options, delay: 0.02 });
    return t - now;
  }

  playVoiceGyilkolni(options = {}) {
    const now = this.context.currentTime;
    const phonemes = [
      { f0: 114, f1: 300, f2: 2100, f3: 2800, duration: 0.08, isVoiced: true }, // [gy]
      { f0: 110, f1: 280, f2: 2250, f3: 2900, duration: 0.16, isVoiced: true }, // [i]
      { f0: 106, f1: 350, f2: 1200, f3: 2600, duration: 0.09, isVoiced: true }, // [l]
      { f0: 102, f1: 2200, f2: 3800, f3: 5000, duration: 0.05, isVoiced: false, isNoise: true }, // [k]
      { f0: 98,  f1: 500, f2: 950,  f3: 2400, duration: 0.16, isVoiced: true }, // [o]
      { f0: 94,  f1: 350, f2: 1200, f3: 2600, duration: 0.09, isVoiced: true }, // [l]
      { f0: 90,  f1: 250, f2: 1500, f3: 2400, duration: 0.09, isVoiced: true }, // [n]
      { f0: 86,  f1: 280, f2: 2250, f3: 2900, duration: 0.18, isVoiced: true }  // [i]
    ];

    let t = now;
    phonemes.forEach((p) => {
      this._synthesizePhoneme(p, t, p.duration, options);
      t += p.duration;
    });

    this.playSpiritBoxBlip({ ...options, delay: 0.02 });
    return t - now;
  }

  playVoiceHideg(options = {}) {
    const now = this.context.currentTime;
    const phonemes = [
      { f0: 114, f1: 600, f2: 1800, f3: 2600, duration: 0.16, isVoiced: false, isNoise: true }, // [h]
      { f0: 110, f1: 280, f2: 2250, f3: 2900, duration: 0.22, isVoiced: true },                 // [i]
      { f0: 104, f1: 220, f2: 1600, f3: 2400, duration: 0.08, isVoiced: true },                 // [d]
      { f0: 98,  f1: 530, f2: 1840, f3: 2500, duration: 0.20, isVoiced: true },                 // [e]
      { f0: 90,  f1: 200, f2: 1800, f3: 2400, duration: 0.12, isVoiced: true }                  // [g]
    ];

    let t = now;
    phonemes.forEach((p) => {
      this._synthesizePhoneme(p, t, p.duration, options);
      t += p.duration;
    });

    this.playSpiritBoxBlip({ ...options, delay: 0.02 });
    return t - now;
  }

  /* -------------------------------------------------------------------------- */
  /*            PROXIMITY VOICE & WALKIE-TALKIE FILTER (Point 98)               */
  /* -------------------------------------------------------------------------- */

  /**
   * Initializes the DSP Walkie-Talkie Filter Chain.
   * Chain: Input -> Highpass(400Hz) -> Lowpass(3500Hz) -> PreGain(1.8x) -> Overdrive -> FlutterGain -> NoiseMixer -> Output
   */
  _initWalkieTalkieChain() {
    const now = this.context.currentTime;

    const inputNode = this.context.createGain();

    // 400 Hz Highpass Filter
    const highpass = this.context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(400, now);
    highpass.Q.setValueAtTime(0.707, now);

    // 3500 Hz Lowpass Filter
    const lowpass = this.context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(3500, now);
    lowpass.Q.setValueAtTime(0.707, now);

    // Overdrive saturation with 1.8x boost
    const driveGain = this.context.createGain();
    driveGain.gain.setValueAtTime(1.8, now);

    const waveShaper = this.context.createWaveShaper();
    waveShaper.curve = createOverdriveCurve(22, 1024);
    waveShaper.oversample = '2x';

    // Hunt Corruption Flutter Gain (20 - 50 Hz amplitude tremolo)
    const flutterGain = this.context.createGain();
    flutterGain.gain.setValueAtTime(1.0, now);

    // Hunt Corruption Noise Mixer (+6dB pink/white noise during active hunts)
    const corruptionNoiseGain = this.context.createGain();
    corruptionNoiseGain.gain.setValueAtTime(0.0001, now);

    let corruptionNoiseSrc = null;
    if (this.pinkNoiseBuffer) {
      corruptionNoiseSrc = this.context.createBufferSource();
      corruptionNoiseSrc.buffer = this.pinkNoiseBuffer;
      corruptionNoiseSrc.loop = true;
      corruptionNoiseSrc.connect(corruptionNoiseGain);
      corruptionNoiseSrc.start(now);
    }

    const outputNode = this.context.createGain();
    outputNode.gain.setValueAtTime(1.0, now);

    // Connect filter chain
    inputNode.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(driveGain);
    driveGain.connect(waveShaper);
    waveShaper.connect(flutterGain);
    flutterGain.connect(outputNode);
    corruptionNoiseGain.connect(outputNode);
    outputNode.connect(this.radioGain);

    return {
      active: false,
      huntCorrupted: false,
      flutterOsc: null,
      corruptionNoiseGain,
      corruptionNoiseSrc,
      flutterGain,
      highpass,
      lowpass,
      waveShaper,
      driveGain,
      inputNode,
      outputNode
    };
  }

  /**
   * Activates or deactivates Walkie-Talkie transmit mode (`V` key).
   * Automatically triggers radio squelch chirp on press and release.
   */
  setWalkieTalkieActive(active = true) {
    if (this.walkieTalkie.active === !!active) return;
    this.walkieTalkie.active = !!active;

    if (this.walkieTalkie.active) {
      this.playRadioSquelch('start');
    } else {
      this.playRadioSquelch('end');
    }
  }

  /**
   * Sets Hunt Corruption for Walkie-Talkie (Point 98).
   * During hunts: injects heavy +6 dB noise and 35 Hz amplitude flutter.
   */
  setHuntCorruption(corrupted = false) {
    this.walkieTalkie.huntCorrupted = !!corrupted;
    const now = this.context.currentTime;

    if (corrupted) {
      // +6 dB noise injection
      this.walkieTalkie.corruptionNoiseGain.gain.linearRampToValueAtTime(0.85, now + 0.05);

      // 35 Hz amplitude flutter / tremolo
      if (!this.walkieTalkie.flutterOsc) {
        const lfo = this.context.createOscillator();
        const lfoGain = this.context.createGain();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(32, now);
        lfoGain.gain.setValueAtTime(0.55, now);

        lfo.connect(lfoGain);
        lfoGain.connect(this.walkieTalkie.flutterGain.gain);
        lfo.start(now);
        this.walkieTalkie.flutterOsc = { lfo, lfoGain };
      }
    } else {
      this.walkieTalkie.corruptionNoiseGain.gain.linearRampToValueAtTime(0.0001, now + 0.05);
      if (this.walkieTalkie.flutterOsc) {
        try {
          this.walkieTalkie.flutterOsc.lfo.stop(now + 0.05);
        } catch {
          // Ignore
        }
        this.walkieTalkie.flutterOsc = null;
        this.walkieTalkie.flutterGain.gain.setValueAtTime(1.0, now + 0.06);
      }
    }
  }

  /**
   * Plays Walkie-Talkie Radio Squelch Chirp (Point 98).
   * Dual-tone burst: 2400 Hz + 1800 Hz for 45 ms on key press & release.
   */
  playRadioSquelch(type = 'start') {
    const now = this.context.currentTime;
    const dest = this.radioGain;
    const duration = 0.045;

    const osc1 = this.context.createOscillator();
    const osc2 = this.context.createOscillator();
    const gainNode = this.context.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';

    if (type === 'start') {
      osc1.frequency.setValueAtTime(2400, now);
      osc2.frequency.setValueAtTime(1800, now);
    } else {
      // End release: descending squelch snap
      osc1.frequency.setValueAtTime(2400, now);
      osc1.frequency.exponentialRampToValueAtTime(1200, now + duration);
      osc2.frequency.setValueAtTime(1800, now);
      osc2.frequency.exponentialRampToValueAtTime(900, now + duration);
    }

    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.linearRampToValueAtTime(0.65, now + 0.005);
    gainNode.gain.setValueAtTime(0.65, now + duration - 0.005);
    gainNode.gain.linearRampToValueAtTime(0.001, now + duration);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(dest);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration + 0.01);
    osc2.stop(now + duration + 0.01);

    // Static burst after end squelch
    if (type === 'end') {
      const burst = this.context.createBufferSource();
      burst.buffer = this.noiseBuffer;
      const burstGain = this.context.createGain();
      burstGain.gain.setValueAtTime(0.4, now + duration);
      burstGain.gain.exponentialRampToValueAtTime(0.001, now + duration + 0.035);
      burst.connect(burstGain);
      burstGain.connect(dest);
      burst.start(now + duration);
      burst.stop(now + duration + 0.04);
    }
  }

  /**
   * Creates a 3D Proximity Voice Attenuation Node (Point 98).
   * Linear falloff to 10.0m.
   */
  createProximityVoiceNode(options = {}) {
    const {
      refDistance = 1.0,
      maxDistance = 10.0,
      rolloffFactor = 1.0
    } = options;

    if (this.context && this.context.createPanner) {
      const panner = this.context.createPanner();
      panner.distanceModel = 'linear';
      panner.refDistance = refDistance;
      panner.maxDistance = maxDistance;
      panner.rolloffFactor = rolloffFactor;
      panner.connect(this.voiceGain);
      return panner;
    }

    return null;
  }

  /* -------------------------------------------------------------------------- */
  /*                            BUS CONTROLS & LIFECYCLE                        */
  /* -------------------------------------------------------------------------- */

  setMasterVolume(volume = 1.0) {
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(Math.max(0, Math.min(2, volume)), this.context.currentTime);
    }
  }

  setSfxVolume(volume = 1.0) {
    if (this.sfxGain) {
      this.sfxGain.gain.setValueAtTime(Math.max(0, Math.min(2, volume)), this.context.currentTime);
    }
  }

  setVoiceVolume(volume = 1.0) {
    if (this.voiceGain) {
      this.voiceGain.gain.setValueAtTime(Math.max(0, Math.min(2, volume)), this.context.currentTime);
    }
  }

  setRadioVolume(volume = 1.0) {
    if (this.radioGain) {
      this.radioGain.gain.setValueAtTime(Math.max(0, Math.min(2, volume)), this.context.currentTime);
    }
  }

  resumeContext() {
    if (this.context && this.context.state === 'suspended' && typeof this.context.resume === 'function') {
      return this.context.resume();
    }
    return Promise.resolve();
  }

  dispose() {
    if (this._gestureResume && typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this._gestureResume, true);
      window.removeEventListener('keydown', this._gestureResume, true);
    }
    this.stopHeartbeat();
    this.stopBreakerBuzz();
    this.stopEmf();
    this.stopSpiritBoxSweep();
    this.stopCarAlarm();
    this.setHuntCorruption(false);

    if (this.context && typeof this.context.close === 'function') {
      try {
        this.context.close();
      } catch {
        // Ignore
      }
    }
  }
}

export default PhobiaAudio;
