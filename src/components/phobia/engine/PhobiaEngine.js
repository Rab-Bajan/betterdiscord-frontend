import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FilmShader } from 'three/addons/shaders/FilmShader.js';

import {
  VhsHuntGlitchShader,
  GhostDissolveMaterial,
  DotsLaserMatrix,
  RainParticles,
  FreezingBreathParticles
} from '../shaders/index.js';
import { QUALITY_PRESETS, normalizeQuality, createNightEnvironment, ColorGradeShader } from '../visual/Atmosphere.js';
import { setTextureQuality, disposeTextureLibrary } from '../visual/ProceduralTextures.js';
import { createGhostFigure } from '../visual/HumanFigure.js';

/**
 * PhobiaEngine
 * Core 3D WebGL 2.0 rendering engine for MiskolcPhobia.
 *
 * Manages:
 * - High-performance WebGL 2.0 renderer with sRGB color management & ACESFilmic tone mapping
 * - PCFSoftShadowMap real-time soft shadows
 * - Layered scene graph hierarchy (World, Interactive Props, Lighting, Ghost, Particles, Local Player)
 * - Camera child dynamic SpotLight flashlight with realistic decay and hunt flickering
 * - Horror post-processing pipeline (RenderPass, Vignette, Film Grain, VHS Hunt Glitch, OutputPass)
 * - Dynamic environmental particle systems (3000 rain streaks, ground mist, freezing breath condensation)
 * - Custom GLSL materials (Ghost Dissolve, D.O.T.S. Laser Matrix Projectors)
 * - Full lifecycle: ResizeObserver, pause/resume render loop, clean resource disposal
 */
// Safe multiplicative vignette (three's VignetteShader goes negative for darkness > 1,
// which tone-mapping turns into bright garbage at the screen edges).
const SafeVignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    strength: { value: 0.55 },
    radius: { value: 0.95 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float strength;
    uniform float radius;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = (vUv - 0.5) * vec2(1.0, 0.85) * 1.6;
      float v = smoothstep(radius, 0.15, length(d));
      c.rgb *= mix(1.0 - strength, 1.0, v);
      gl_FragColor = c;
    }
  `
};

export class PhobiaEngine {
  constructor(options = {}) {
    const { canvas, container, mount } = options;
    if (!canvas && !mount) {
      throw new Error('PhobiaEngine requires a HTMLCanvasElement in options.canvas or a mount element in options.mount');
    }

    this.canvas = canvas || null;
    this.mount = mount || null;
    this.container = container || mount || canvas.parentElement || canvas;

    this.clock = new THREE.Clock();
    this.isRunning = false;
    this.animationFrameId = null;
    this.updateHooks = new Set();
    this.roomLights = new Map();
    this.dotsProjectors = new Set();

    // Flashlight flicker state
    this.flashlightOn = true;
    this.flashlightFlickerActive = false;
    this.flashlightFlickerIntensity = 0.0;
    this.flashlightBaseIntensity = 60.0; // candela-ish (physically based decay)
    this.flashlightTimer = 0.0;

    // Hunt and environment states
    this.huntIntensity = 0.0;
    this.ambientTemperature = 15.0; // Celsius

    // Quality: options.quality ('low' | 'medium' | 'high'), else ?quality= in the URL, else adaptive
    // (starts on 'high' and measures average frame time for ~2s after start, downgrading on slow GPUs).
    // Resolved before the renderer/map exist so texture resolution and AA can follow the preset.
    this.qualityLevel = 'high';
    this._qualityProbe = { time: 0, frames: 0, done: false };
    let requested = normalizeQuality(options.quality);
    try {
      const q = typeof location !== 'undefined' ? normalizeQuality(new URLSearchParams(location.search).get('quality')) : null;
      if (!requested && q) requested = q;
    } catch (_) {}
    if (requested || options.adaptiveQuality === false) this._qualityProbe.done = true;
    if (requested) this.qualityLevel = requested;
    this.maxPixelRatio = QUALITY_PRESETS[this.qualityLevel].pixelRatio;
    setTextureQuality(QUALITY_PRESETS[this.qualityLevel].textures);

    this._initRenderer();
    this._initScene();
    this._initEnvironment();
    this._initCameraAndPlayer();
    this._initLighting();
    this._initPostProcessing();
    this._initParticleSystems();
    this._initResizeObserver();
    this.setQuality(this.qualityLevel);
  }

  /* -------------------------------------------------------------------------- */
  /*                             INITIALIZATION                                 */
  /* -------------------------------------------------------------------------- */

  _initRenderer() {
    // Always create a fresh dedicated canvas element inside the container
    // to prevent React StrictMode remounts or browser extensions from locking the context
    const freshCanvas = document.createElement('canvas');
    freshCanvas.className = this.canvas?.className || 'w-full h-full block cursor-crosshair focus:outline-none';
    freshCanvas.tabIndex = 0;

    if (this.mount) {
      this.mount.appendChild(freshCanvas);
    } else if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.replaceChild(freshCanvas, this.canvas);
    } else if (this.container) {
      this.container.appendChild(freshCanvas);
    }
    this.canvas = freshCanvas;

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: QUALITY_PRESETS[this.qualityLevel].antialias,
        powerPreference: 'high-performance',
        alpha: false,
        stencil: false
      });
    } catch (err1) {
      console.warn('Three.js WebGLRenderer default creation failed, falling back to minimal parameters:', err1);
      try {
        this.renderer = new THREE.WebGLRenderer({
          canvas: this.canvas,
          antialias: false,
          alpha: false
        });
      } catch (err2) {
        throw new Error(
          'A WebGL2 grafikus motor nem tudott elindulni a böngészőben. Kérjük, engedélyezd a hardveres gyorsítást a beállításokban (chrome://settings/system).'
        );
      }
    }

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const initialWidth = this.container.clientWidth || window.innerWidth;
    const initialHeight = this.container.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxPixelRatio || 2));
    this.renderer.setSize(initialWidth, initialHeight, false);
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0e1c);
    // Exponential-squared fog reads as damp night air: clear within ~15 m, thick past ~60 m
    this.scene.fog = new THREE.FogExp2(0x0b0e1c, QUALITY_PRESETS[this.qualityLevel].fogDensity);

    // Layered Scene Hierarchy
    this.worldMeshGroup = new THREE.Group();
    this.worldMeshGroup.name = 'WorldMeshGroup';

    this.interactivePropsGroup = new THREE.Group();
    this.interactivePropsGroup.name = 'InteractivePropsGroup';

    this.lightingGroup = new THREE.Group();
    this.lightingGroup.name = 'LightingGroup';

    this.ghostGroup = new THREE.Group();
    this.ghostGroup.name = 'GhostGroup';

    this.particlesGroup = new THREE.Group();
    this.particlesGroup.name = 'ParticlesGroup';

    this.localPlayerGroup = new THREE.Group();
    this.localPlayerGroup.name = 'LocalPlayerGroup';

    this.scene.add(this.worldMeshGroup);
    this.scene.add(this.interactivePropsGroup);
    this.scene.add(this.lightingGroup);
    this.scene.add(this.ghostGroup);
    this.scene.add(this.particlesGroup);
    this.scene.add(this.localPlayerGroup);
  }

  /** Baked night IBL so metals/wet surfaces reflect something (skipped on 'low'). */
  _initEnvironment() {
    this._envTarget = null;
    if (!QUALITY_PRESETS[this.qualityLevel].envMap) return;
    try {
      this._envTarget = createNightEnvironment(this.renderer);
      this.scene.environment = this._envTarget.texture;
      this.scene.environmentIntensity = 0.45;
    } catch (err) {
      console.warn('Night environment map failed, continuing without IBL:', err);
    }
  }

  _initCameraAndPlayer() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const aspect = width / (height || 1);

    this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
    this.camera.position.set(0, 1.65, 0); // eye level

    // Viewmodel container child of camera (held items with synchronized bobbing)
    this.viewmodelGroup = new THREE.Group();
    this.viewmodelGroup.name = 'ViewmodelGroup';
    this.camera.add(this.viewmodelGroup);

    this.localPlayerGroup.add(this.camera);
  }

  _initLighting() {
    // Dim ambient baseline for night horror atmosphere
    this.ambientLight = new THREE.AmbientLight(0x5a6694, 0.9);
    this.lightingGroup.add(this.ambientLight);

    // Cold moonlight: sky/ground bounce + a soft directional so the yard is readable at night
    this.moonFill = new THREE.HemisphereLight(0x8aa0e0, 0x2a2830, 0.9);
    this.lightingGroup.add(this.moonFill);
    this.moonLight = new THREE.DirectionalLight(0x9fb4f0, 1.4);
    this.moonLight.position.set(-30, 60, 20);
    // Key-light shadows: an orthographic window that follows the player (see _updateMoonShadow)
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.set(1024, 1024);
    const msc = this.moonLight.shadow.camera;
    msc.left = -26; msc.right = 26; msc.top = 26; msc.bottom = -26; msc.near = 10; msc.far = 140;
    this.moonLight.shadow.bias = -0.0004;
    this.moonLight.shadow.normalBias = 0.04;
    this._moonOffset = new THREE.Vector3(-30, 60, 20);
    this.lightingGroup.add(this.moonLight);
    this.lightingGroup.add(this.moonLight.target);

    // Dynamic player camera child SpotLight (Flashlight)
    this.flashlight = new THREE.SpotLight(0xfff4e0, this.flashlightBaseIntensity);
    this.flashlight.distance = 28.0;
    this.flashlight.angle = Math.PI / 5; // 36 degrees cone
    this.flashlight.penumbra = 0.5;
    this.flashlight.decay = 2.0; // quadratic attenuation
    this.flashlight.castShadow = true;

    this.flashlight.shadow.mapSize.width = 512;
    this.flashlight.shadow.mapSize.height = 512;
    this.flashlight.shadow.camera.near = 0.1;
    this.flashlight.shadow.camera.far = 28.0;
    this.flashlight.shadow.bias = -0.0005;

    // Flashlight target fixed forward in front of camera
    this.flashlightTarget = new THREE.Object3D();
    this.flashlightTarget.position.set(0, 0, -5);
    this.camera.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;

    this.camera.add(this.flashlight);
  }

  _initPostProcessing() {
    try {
      const width = this.container.clientWidth || window.innerWidth;
      const height = this.container.clientHeight || window.innerHeight;

      this.composer = new EffectComposer(this.renderer);

      // Pass 1: Base scene render
      this.renderPass = new RenderPass(this.scene, this.camera);
      this.composer.addPass(this.renderPass);

      // Pass 2: Vignette Shader
      this.vignettePass = new ShaderPass(SafeVignetteShader);
      this.composer.addPass(this.vignettePass);

      // Pass 3: Film Grain Shader
      this.filmPass = new ShaderPass(FilmShader);
      this.filmPass.uniforms.intensity.value = 0.06;
      if (this.filmPass.uniforms.grayscale) this.filmPass.uniforms.grayscale.value = 0;
      this.filmPass.uniforms.time.value = 0.0;
      this.composer.addPass(this.filmPass);

      // Pass 4: Custom VHS Hunt Glitch Shader
      this.vhsPass = new ShaderPass(VhsHuntGlitchShader);
      this.vhsPass.uniforms.uHuntIntensity.value = 0.0;
      this.vhsPass.uniforms.uTime.value = 0.0;
      this.composer.addPass(this.vhsPass);

      // Pass 4b: linear-space colour grade (cold shadows, warm highlights); before tone mapping
      this.gradePass = new ShaderPass(ColorGradeShader);
      this.gradePass.enabled = QUALITY_PRESETS[this.qualityLevel].grade;
      this.composer.addPass(this.gradePass);

      // Pass 5: Output Color Space & Tone Mapping pass
      this.outputPass = new OutputPass();
      this.composer.addPass(this.outputPass);

      this.composer.setSize(width, height);
    } catch (err) {
      console.warn('PostProcessing init failed, falling back to direct WebGLRenderer:', err);
      this.composer = null;
    }
  }

  _initParticleSystems() {
    // 1. Dynamic Rain System: 3000 line streaks + ground mist
    this.rain = new RainParticles({
      rainCount: Math.round(1800 * QUALITY_PRESETS[this.qualityLevel].rainScale),
      mistCount: 100,
      boxWidth: 70,
      boxHeight: 20,
      boxDepth: 80,
      enabled: true
    });
    this.particlesGroup.add(this.rain.group);

    // 2. Freezing Breath System: emitted every 3s in freezing zone (< 0.0°C)
    this.freezingBreath = new FreezingBreathParticles({
      temperature: this.ambientTemperature,
      interval: 3.0
    });
    this.particlesGroup.add(this.freezingBreath.group);
  }

  _initResizeObserver() {
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width <= 0 || height <= 0) continue;
        this.handleResize(width, height);
      }
    });

    if (this.container) {
      this.resizeObserver.observe(this.container);
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                             LIFECYCLE & RENDER                             */
  /* -------------------------------------------------------------------------- */

  handleResize(width, height) {
    if (!width || !height) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxPixelRatio || 2));
    this.renderer.setSize(width, height, false);

    if (this.composer) {
      this.composer.setSize(width, height);
    }
  }

  /**
   * 'low' | 'medium' | 'high' (anything else maps to 'high'). Drives pixel ratio, shadow maps and sizes,
   * grading, fog density. Texture resolution and IBL are decided at construction (before assets exist).
   */
  setQuality(level) {
    this.qualityLevel = normalizeQuality(level) || 'high';
    const preset = QUALITY_PRESETS[this.qualityLevel];
    if (!this.renderer) return;
    this.maxPixelRatio = preset.pixelRatio;
    const shadowToggled = this.renderer.shadowMap.enabled !== preset.shadows;
    this.renderer.shadowMap.enabled = preset.shadows;
    this.renderer.shadowMap.needsUpdate = true;
    if (this.flashlight) {
      this.flashlight.castShadow = preset.flashlightShadow;
      this._resizeShadow(this.flashlight, preset.flashlightShadowSize);
    }
    if (this.moonLight) {
      this.moonLight.castShadow = preset.shadows;
      this._resizeShadow(this.moonLight, preset.shadows ? (this.qualityLevel === 'high' ? 2048 : 1024) : 512);
    }
    if (this.gradePass) this.gradePass.enabled = preset.grade;
    if (this.scene?.fog) this.scene.fog.density = preset.fogDensity;
    if (this.scene) {
      this.scene.traverse((o) => {
        if (o.isLight && o !== this.flashlight && o !== this.moonLight && o.shadow) {
          o.userData._shadowWanted ??= o.castShadow;
          o.castShadow = preset.shadows && o.userData._shadowWanted;
          this._resizeShadow(o, preset.floodShadowSize);
        }
        if (shadowToggled && o.isMesh && o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => { m.needsUpdate = true; });
        }
      });
    }
    const w = this.container?.clientWidth, h = this.container?.clientHeight;
    if (w && h) this.handleResize(w, h);
  }

  _resizeShadow(light, size) {
    if (!light.shadow || light.shadow.mapSize.x === size) return;
    light.shadow.mapSize.set(size, size);
    if (light.shadow.map) {
      light.shadow.map.dispose();
      light.shadow.map = null;
    }
  }

  /** Slide the moon shadow window over the player so one map covers the area around them. */
  _updateMoonShadow() {
    if (!this.moonLight || !this.moonLight.castShadow) return;
    const p = this.camera.getWorldPosition(this._tmpV || (this._tmpV = new THREE.Vector3()));
    // snap to the shadow texel grid to avoid shimmering
    const texel = 52 / this.moonLight.shadow.mapSize.x;
    p.x = Math.round(p.x / texel) * texel;
    p.z = Math.round(p.z / texel) * texel;
    this.moonLight.target.position.set(p.x, 0, p.z);
    this.moonLight.position.copy(this.moonLight.target.position).add(this._moonOffset);
    this.moonLight.target.updateMatrixWorld();
  }

  _probeQuality(delta) {
    const pr = this._qualityProbe;
    if (pr.done) return;
    pr.time += delta;
    if (pr.time < 0.75) return; // ignore shader-compile warm-up
    pr.frames++;
    pr.sum = (pr.sum || 0) + delta;
    if (pr.time >= 2.75) {
      pr.done = true;
      const avgMs = (pr.sum / Math.max(1, pr.frames)) * 1000;
      this.avgFrameMs = avgMs;
      if (avgMs > 40) this.setQuality(this.qualityLevel === 'high' ? 'medium' : 'low');
      else if (avgMs > 30 && this.qualityLevel === 'high') this.setQuality('medium');
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.clock.start();

    const loop = () => {
      if (!this.isRunning) return;
      this.render();
      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  pause() {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  resume() {
    this.start();
  }

  stop() {
    this.pause();
  }

  render() {
    const delta = this.clock.getDelta();
    const elapsedTime = this.clock.getElapsedTime();
    this._probeQuality(delta);

    // 1. Update Post-processing uniforms
    if (this.filmPass) {
      this.filmPass.uniforms.time.value = elapsedTime;
    }
    if (this.vhsPass) {
      this.vhsPass.uniforms.uTime.value = elapsedTime;
      this.vhsPass.uniforms.uHuntIntensity.value = this.huntIntensity;
    }

    // Lights added by the map after construction pick up the quality preset on the 3rd frame
    if (this._qualityFrames === undefined) this._qualityFrames = 0;
    if (this._qualityFrames < 3 && ++this._qualityFrames === 3) this.setQuality(this.qualityLevel);
    this._updateMoonShadow();

    // 2. Update Flashlight Flicker (active during hunts or ghost interference)
    this._updateFlashlight(delta, elapsedTime);

    // 3. Update Dynamic Rain & Ground Mist around camera
    if (this.rain) {
      this.rain.update(delta, this.camera.position);
    }

    // 4. Update Freezing Breath Puffs
    if (this.freezingBreath) {
      this.freezingBreath.update(delta, this.camera);
    }

    // 5. Update Registered D.O.T.S. Laser Projectors
    for (const dots of this.dotsProjectors) {
      dots.update(delta);
    }

    // 6. Execute external update hooks (player movement, ghost AI lerp, etc.)
    for (const hook of this.updateHooks) {
      try {
        hook(delta, elapsedTime);
      } catch (err) {
        console.error('Error in PhobiaEngine update hook:', err);
      }
    }

    // 7. Render frame via Composer pipeline (with graceful fallback)
    if (this.composer) {
      try {
        this.composer.render(delta);
      } catch (err) {
        console.warn('Composer render failed, falling back to WebGLRenderer:', err);
        if (this.renderer && this.scene && this.camera) {
          this.renderer.render(this.scene, this.camera);
        }
      }
    } else if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                            FLASHLIGHT CONTROLS                             */
  /* -------------------------------------------------------------------------- */

  toggleFlashlight(state = null) {
    if (state === null) {
      this.flashlightOn = !this.flashlightOn;
    } else {
      this.flashlightOn = !!state;
    }
    this.flashlight.visible = this.flashlightOn;
    return this.flashlightOn;
  }

  setFlashlight(isOn) {
    return this.toggleFlashlight(isOn);
  }

  isFlashlightOn() {
    return this.flashlightOn;
  }

  setFlashlightIntensity(intensity) {
    this.flashlightBaseIntensity = Math.max(0, intensity);
    if (!this.flashlightFlickerActive && this.flashlightOn) {
      this.flashlight.intensity = this.flashlightBaseIntensity;
    }
  }

  /**
   * Sets paranormal flashlight flickering (triggered during hunts or ghost events)
   */
  setFlashlightFlicker(active, intensity = 1.0) {
    this.flashlightFlickerActive = !!active;
    this.flashlightFlickerIntensity = THREE.MathUtils.clamp(intensity, 0.0, 1.0);
    if (!this.flashlightFlickerActive) {
      this.flashlight.intensity = this.flashlightOn ? this.flashlightBaseIntensity : 0.0;
    }
  }

  _updateFlashlight(delta, time) {
    if (!this.flashlightOn) {
      this.flashlight.intensity = 0.0;
      return;
    }

    if (this.flashlightFlickerActive || this.huntIntensity > 0.05) {
      const flickerStrength = Math.max(this.flashlightFlickerIntensity, this.huntIntensity);
      // Fast stuttering strobe with stochastic dropouts
      const noise = Math.sin(time * 65.0) * Math.cos(time * 33.0);
      const isBlackout = Math.random() < (0.28 * flickerStrength);

      if (isBlackout) {
        this.flashlight.intensity = 0.0;
      } else {
        const factor = 1.0 - Math.abs(noise) * (0.85 * flickerStrength);
        this.flashlight.intensity = Math.max(0.1, this.flashlightBaseIntensity * factor);
      }
    } else {
      this.flashlight.intensity = this.flashlightBaseIntensity;
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                          ENVIRONMENT & SHADERS                             */
  /* -------------------------------------------------------------------------- */

  setHuntIntensity(val) {
    this.huntIntensity = THREE.MathUtils.clamp(val, 0.0, 1.0);
    if (this.vhsPass) {
      this.vhsPass.uniforms.uHuntIntensity.value = this.huntIntensity;
    }
  }

  getHuntIntensity() {
    return this.huntIntensity;
  }

  setAmbientTemperature(tempCelsius) {
    this.ambientTemperature = Number(tempCelsius);
    if (this.freezingBreath) {
      this.freezingBreath.setTemperature(this.ambientTemperature);
    }
  }

  getAmbientTemperature() {
    return this.ambientTemperature;
  }

  setRainEnabled(enabled) {
    if (this.rain) {
      this.rain.setEnabled(enabled);
    }
  }

  /**
   * Factory: Creates a Ghost Dissolve Material
   */
  createGhostMaterial(options = {}) {
    return new GhostDissolveMaterial(options);
  }

  /**
   * Factory: articulated ghost figure (hunched, floating, long hair and shroud) wearing `material`
   * (default: a fresh Ghost Dissolve material). Returns { group, figure, update(delta, { moving, hunting }), dispose }.
   * `group` has its feet at y = 0 and faces +Z; the caller adds it to ghostGroup and owns the material.
   */
  createGhostFigure(material = null) {
    return createGhostFigure(material || this.createGhostMaterial());
  }

  /**
   * Factory: Creates and tracks a D.O.T.S. Laser Matrix projector
   */
  createDotsProjector(options = {}) {
    const dots = new DotsLaserMatrix(options);
    this.dotsProjectors.add(dots);
    this.interactivePropsGroup.add(dots.group);
    return dots;
  }

  removeDotsProjector(dots) {
    if (this.dotsProjectors.has(dots)) {
      this.dotsProjectors.delete(dots);
      this.interactivePropsGroup.remove(dots.group);
      dots.dispose();
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                            ROOM LIGHTING HELPERS                           */
  /* -------------------------------------------------------------------------- */

  createRoomLight({
    id,
    color = 0xffcc77,
    intensity = 1.5,
    distance = 10.0,
    decay = 2.0,
    position = { x: 0, y: 3, z: 0 },
    castShadow = false
  }) {
    const light = new THREE.PointLight(color, intensity, distance, decay);
    light.position.set(position.x, position.y, position.z);
    light.castShadow = !!castShadow;

    if (castShadow) {
      light.shadow.mapSize.width = 512;
      light.shadow.mapSize.height = 512;
      light.shadow.camera.near = 0.2;
      light.shadow.camera.far = distance;
      light.shadow.bias = -0.002;
    }

    this.lightingGroup.add(light);
    this.roomLights.set(id, { light, baseIntensity: intensity, isOn: true });
    return light;
  }

  setRoomLightState(id, isOn) {
    const record = this.roomLights.get(id);
    if (!record) return;
    record.isOn = !!isOn;
    record.light.intensity = record.isOn ? record.baseIntensity : 0.0;
  }

  setBreakerState(breakerOn) {
    for (const [, record] of this.roomLights) {
      if (!breakerOn) {
        record.light.intensity = 0.0;
      } else {
        record.light.intensity = record.isOn ? record.baseIntensity : 0.0;
      }
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                               HOOKS & CLEANUP                              */
  /* -------------------------------------------------------------------------- */

  addUpdateHook(fn) {
    if (typeof fn === 'function') {
      this.updateHooks.add(fn);
    }
  }

  registerUpdateHook(fn) {
    this.addUpdateHook(fn);
    return () => this.removeUpdateHook(fn);
  }

  removeUpdateHook(fn) {
    this.updateHooks.delete(fn);
  }

  destroy() {
    this.dispose();
  }

  dispose() {
    this.stop();

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.updateHooks.clear();

    // Dispose particle systems
    if (this.rain) {
      this.rain.dispose();
      this.rain = null;
    }
    if (this.freezingBreath) {
      this.freezingBreath.dispose();
      this.freezingBreath = null;
    }

    // Dispose DOTS projectors
    for (const dots of this.dotsProjectors) {
      dots.dispose();
    }
    this.dotsProjectors.clear();

    // Dispose Composer and passes
    if (this.composer) {
      this.composer.passes.forEach((pass) => {
        if (pass.dispose) pass.dispose();
      });
      this.composer.renderTarget1?.dispose();
      this.composer.renderTarget2?.dispose();
      this.composer = null;
    }

    // Traverse and dispose scene meshes, materials, geometries and their textures
    if (this.scene) {
      this.scene.traverse((obj) => {
        if (obj.material) {
          const list = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of list) {
            for (const key of Object.keys(m)) {
              const v = m[key];
              if (v && v.isTexture) v.dispose();
            }
          }
        }
        if (obj.geometry) {
          obj.geometry.dispose();
        }
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((mat) => mat.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      this.scene.environment = null;
      this.scene.clear();
      this.scene = null;
    }
    if (this._envTarget) {
      this._envTarget.dispose();
      this._envTarget = null;
    }
    disposeTextureLibrary();

    // Dispose renderer and release the WebGL context (avoids context leaks on remount)
    if (this.renderer) {
      try {
        this.renderer.dispose();
        this.renderer.forceContextLoss?.();
      } catch (_) {}
      this.renderer = null;
    }
    if (this.mount && this.canvas?.parentNode === this.mount) {
      this.mount.removeChild(this.canvas);
    }
  }
}

export default PhobiaEngine;
