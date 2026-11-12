import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FilmShader } from 'three/addons/shaders/FilmShader.js';

import { VhsHuntGlitchShader } from '../shaders/VhsHuntGlitchShader.ts';
import { GhostDissolveMaterial } from '../shaders/GhostDissolveMaterial.ts';
import { DotsLaserMatrix } from '../shaders/DotsLaserMatrix.ts';
import { RainParticles } from '../shaders/RainParticles.ts';
import { FreezingBreathParticles } from '../shaders/FreezingBreathParticles.ts';
import { QUALITY_PRESETS, normalizeQuality, createNightEnvironment, ColorGradeShader } from '../visual/Atmosphere.ts';
import { setTextureQuality, disposeTextureLibrary } from '../visual/ProceduralTextures.ts';
import { createGhostFigure } from '../visual/HumanFigure.ts';
import type { GhostFigure } from '../visual/HumanFigure.ts';
import type { QualityLevel } from '../visual/Atmosphere.ts';
import type { DotsLaserMatrixOptions } from '../shaders/DotsLaserMatrix.ts';
import type { GhostDissolveOptions } from '../shaders/GhostDissolveMaterial.ts';

export interface PhobiaEngineOptions {
  canvas?: HTMLCanvasElement | null;
  container?: HTMLElement | null;
  mount?: HTMLElement | null;
  quality?: unknown;
  adaptiveQuality?: boolean;
}

export type EngineUpdateHook = (delta: number, elapsedTime: number) => void;

export interface RoomLightOptions {
  id: string;
  color?: THREE.ColorRepresentation;
  intensity?: number;
  distance?: number;
  decay?: number;
  position?: { x: number; y: number; z: number };
  castShadow?: boolean;
}

interface RoomLightRecord {
  light: THREE.PointLight;
  baseIntensity: number;
  isOn: boolean;
}

interface QualityProbe {
  time: number;
  frames: number;
  done: boolean;
  sum?: number;
}

/** The lights that carry a shadow (three's Light subclasses with a `shadow`). */
type ShadowLight = THREE.PointLight | THREE.SpotLight | THREE.DirectionalLight;

const hasShadow = (o: THREE.Object3D): o is ShadowLight =>
  o instanceof THREE.PointLight || o instanceof THREE.SpotLight || o instanceof THREE.DirectionalLight;

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

/** Set a float uniform a pass is known to declare (shader constants above / three's FilmShader). */
function setUniform(pass: ShaderPass, name: string, value: number): void {
  const uniform = pass.uniforms[name];
  if (uniform) uniform.value = value;
}

export class PhobiaEngine {
  canvas: HTMLCanvasElement | null;
  readonly mount: HTMLElement | null;
  readonly container: HTMLElement;
  readonly clock: THREE.Clock;
  isRunning: boolean;
  animationFrameId: number | null;
  readonly updateHooks: Set<EngineUpdateHook>;
  readonly roomLights: Map<string, RoomLightRecord>;
  readonly dotsProjectors: Set<DotsLaserMatrix>;
  flashlightOn: boolean;
  flashlightFlickerActive: boolean;
  flashlightFlickerIntensity: number;
  flashlightBaseIntensity: number;
  flashlightTimer: number;
  huntIntensity: number;
  ambientTemperature: number;
  qualityLevel: QualityLevel;
  _qualityProbe: QualityProbe;
  _qualityFrames?: number;
  avgFrameMs?: number;
  maxPixelRatio: number;
  renderer: THREE.WebGLRenderer | null = null;
  scene: THREE.Scene | null = null;
  worldMeshGroup!: THREE.Group;
  interactivePropsGroup!: THREE.Group;
  lightingGroup!: THREE.Group;
  ghostGroup!: THREE.Group;
  particlesGroup!: THREE.Group;
  localPlayerGroup!: THREE.Group;
  _envTarget: THREE.WebGLRenderTarget | null = null;
  camera!: THREE.PerspectiveCamera;
  viewmodelGroup!: THREE.Group;
  ambientLight!: THREE.AmbientLight;
  moonFill!: THREE.HemisphereLight;
  moonLight!: THREE.DirectionalLight;
  _moonOffset!: THREE.Vector3;
  _tmpV?: THREE.Vector3;
  flashlight!: THREE.SpotLight;
  flashlightTarget!: THREE.Object3D;
  composer: EffectComposer | null = null;
  renderPass?: RenderPass;
  vignettePass?: ShaderPass;
  filmPass?: ShaderPass;
  vhsPass?: ShaderPass;
  gradePass?: ShaderPass;
  outputPass?: OutputPass;
  rain: RainParticles | null = null;
  freezingBreath: FreezingBreathParticles | null = null;
  resizeObserver: ResizeObserver | null = null;

  constructor(options: PhobiaEngineOptions = {}) {
    const { canvas, container, mount } = options;
    if (!canvas && !mount) {
      throw new Error('PhobiaEngine requires a HTMLCanvasElement in options.canvas or a mount element in options.mount');
    }

    this.canvas = canvas || null;
    this.mount = mount || null;
    // canvas is set whenever mount is not (checked above)
    this.container = container || mount || (canvas as HTMLCanvasElement).parentElement || (canvas as HTMLCanvasElement);

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
    } catch {
      // no usable location (non-browser host)
    }
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

  _initRenderer(): void {
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

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: freshCanvas,
        antialias: QUALITY_PRESETS[this.qualityLevel].antialias,
        powerPreference: 'high-performance',
        alpha: false,
        stencil: false
      });
    } catch (err1) {
      console.warn('Three.js WebGLRenderer default creation failed, falling back to minimal parameters:', err1);
      try {
        renderer = new THREE.WebGLRenderer({
          canvas: freshCanvas,
          antialias: false,
          alpha: false
        });
      } catch {
        throw new Error(
          'A WebGL2 grafikus motor nem tudott elindulni a böngészőben. Kérjük, engedélyezd a hardveres gyorsítást a beállításokban (chrome://settings/system).'
        );
      }
    }

    this.renderer = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const initialWidth = this.container.clientWidth || window.innerWidth;
    const initialHeight = this.container.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxPixelRatio || 2));
    renderer.setSize(initialWidth, initialHeight, false);
  }

  _initScene(): void {
    const scene = new THREE.Scene();
    this.scene = scene;
    scene.background = new THREE.Color(0x0b0e1c);
    // Exponential-squared fog reads as damp night air: clear within ~15 m, thick past ~60 m
    scene.fog = new THREE.FogExp2(0x0b0e1c, QUALITY_PRESETS[this.qualityLevel].fogDensity);

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

    scene.add(this.worldMeshGroup);
    scene.add(this.interactivePropsGroup);
    scene.add(this.lightingGroup);
    scene.add(this.ghostGroup);
    scene.add(this.particlesGroup);
    scene.add(this.localPlayerGroup);
  }

  /** Baked night IBL so metals/wet surfaces reflect something (skipped on 'low'). */
  _initEnvironment(): void {
    this._envTarget = null;
    if (!QUALITY_PRESETS[this.qualityLevel].envMap) return;
    const { renderer, scene } = this;
    if (!renderer || !scene) return;
    try {
      this._envTarget = createNightEnvironment(renderer);
      scene.environment = this._envTarget.texture;
      scene.environmentIntensity = 0.45;
    } catch (err) {
      console.warn('Night environment map failed, continuing without IBL:', err);
    }
  }

  _initCameraAndPlayer(): void {
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

  _initLighting(): void {
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

  _initPostProcessing(): void {
    try {
      const width = this.container.clientWidth || window.innerWidth;
      const height = this.container.clientHeight || window.innerHeight;
      const { renderer, scene } = this;
      if (!renderer || !scene) throw new Error('renderer and scene must exist before post-processing');

      const composer = new EffectComposer(renderer);
      this.composer = composer;

      // Pass 1: Base scene render
      this.renderPass = new RenderPass(scene, this.camera);
      composer.addPass(this.renderPass);

      // Pass 2: Vignette Shader
      this.vignettePass = new ShaderPass(SafeVignetteShader);
      composer.addPass(this.vignettePass);

      // Pass 3: Film Grain Shader
      this.filmPass = new ShaderPass(FilmShader);
      setUniform(this.filmPass, 'intensity', 0.06);
      if (this.filmPass.uniforms.grayscale) this.filmPass.uniforms.grayscale.value = 0;
      setUniform(this.filmPass, 'time', 0.0);
      composer.addPass(this.filmPass);

      // Pass 4: Custom VHS Hunt Glitch Shader
      this.vhsPass = new ShaderPass(VhsHuntGlitchShader);
      setUniform(this.vhsPass, 'uHuntIntensity', 0.0);
      setUniform(this.vhsPass, 'uTime', 0.0);
      composer.addPass(this.vhsPass);

      // Pass 4b: linear-space colour grade (cold shadows, warm highlights); before tone mapping
      this.gradePass = new ShaderPass(ColorGradeShader);
      this.gradePass.enabled = QUALITY_PRESETS[this.qualityLevel].grade;
      composer.addPass(this.gradePass);

      // Pass 5: Output Color Space & Tone Mapping pass
      this.outputPass = new OutputPass();
      composer.addPass(this.outputPass);

      composer.setSize(width, height);
    } catch (err) {
      console.warn('PostProcessing init failed, falling back to direct WebGLRenderer:', err);
      this.composer = null;
    }
  }

  _initParticleSystems(): void {
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

  _initResizeObserver(): void {
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

  handleResize(width: number, height: number): void {
    if (!width || !height) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    // (after dispose the renderer is gone; the old code threw here)
    if (!this.renderer) return;
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
  setQuality(level: unknown): void {
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
    if (this.scene?.fog instanceof THREE.FogExp2) this.scene.fog.density = preset.fogDensity;
    if (this.scene) {
      this.scene.traverse((o) => {
        if (hasShadow(o) && o !== this.flashlight && o !== this.moonLight) {
          o.userData._shadowWanted ??= o.castShadow;
          o.castShadow = preset.shadows && Boolean(o.userData._shadowWanted);
          this._resizeShadow(o, preset.floodShadowSize);
        }
        if (shadowToggled && o instanceof THREE.Mesh && o.material) {
          const mats: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => { m.needsUpdate = true; });
        }
      });
    }
    const w = this.container?.clientWidth, h = this.container?.clientHeight;
    if (w && h) this.handleResize(w, h);
  }

  _resizeShadow(light: ShadowLight, size: number): void {
    if (!light.shadow || light.shadow.mapSize.x === size) return;
    light.shadow.mapSize.set(size, size);
    if (light.shadow.map) {
      light.shadow.map.dispose();
      light.shadow.map = null;
    }
  }

  /** Slide the moon shadow window over the player so one map covers the area around them. */
  _updateMoonShadow(): void {
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

  _probeQuality(delta: number): void {
    const pr = this._qualityProbe;
    if (pr.done) return;
    pr.time += delta;
    if (pr.time < 0.75) return; // ignore shader-compile warm-up
    pr.frames++;
    const sum = (pr.sum || 0) + delta;
    pr.sum = sum;
    if (pr.time >= 2.75) {
      pr.done = true;
      const avgMs = (sum / Math.max(1, pr.frames)) * 1000;
      this.avgFrameMs = avgMs;
      if (avgMs > 40) this.setQuality(this.qualityLevel === 'high' ? 'medium' : 'low');
      else if (avgMs > 30 && this.qualityLevel === 'high') this.setQuality('medium');
    }
  }

  start(): void {
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

  pause(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  resume(): void {
    this.start();
  }

  stop(): void {
    this.pause();
  }

  render(): void {
    const delta = this.clock.getDelta();
    const elapsedTime = this.clock.getElapsedTime();
    this._probeQuality(delta);

    // 1. Update Post-processing uniforms
    if (this.filmPass) {
      setUniform(this.filmPass, 'time', elapsedTime);
    }
    if (this.vhsPass) {
      setUniform(this.vhsPass, 'uTime', elapsedTime);
      setUniform(this.vhsPass, 'uHuntIntensity', this.huntIntensity);
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

  toggleFlashlight(state: unknown = null): boolean {
    if (state === null) {
      this.flashlightOn = !this.flashlightOn;
    } else {
      this.flashlightOn = !!state;
    }
    this.flashlight.visible = this.flashlightOn;
    return this.flashlightOn;
  }

  setFlashlight(isOn: unknown): boolean {
    return this.toggleFlashlight(isOn);
  }

  isFlashlightOn(): boolean {
    return this.flashlightOn;
  }

  setFlashlightIntensity(intensity: number): void {
    this.flashlightBaseIntensity = Math.max(0, intensity);
    if (!this.flashlightFlickerActive && this.flashlightOn) {
      this.flashlight.intensity = this.flashlightBaseIntensity;
    }
  }

  /**
   * Sets paranormal flashlight flickering (triggered during hunts or ghost events)
   */
  setFlashlightFlicker(active: unknown, intensity = 1.0): void {
    this.flashlightFlickerActive = !!active;
    this.flashlightFlickerIntensity = THREE.MathUtils.clamp(intensity, 0.0, 1.0);
    if (!this.flashlightFlickerActive) {
      this.flashlight.intensity = this.flashlightOn ? this.flashlightBaseIntensity : 0.0;
    }
  }

  _updateFlashlight(_delta: number, time: number): void {
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

  setHuntIntensity(val: number): void {
    this.huntIntensity = THREE.MathUtils.clamp(val, 0.0, 1.0);
    if (this.vhsPass) {
      setUniform(this.vhsPass, 'uHuntIntensity', this.huntIntensity);
    }
  }

  getHuntIntensity(): number {
    return this.huntIntensity;
  }

  setAmbientTemperature(tempCelsius: unknown): void {
    this.ambientTemperature = Number(tempCelsius);
    if (this.freezingBreath) {
      this.freezingBreath.setTemperature(this.ambientTemperature);
    }
  }

  getAmbientTemperature(): number {
    return this.ambientTemperature;
  }

  setRainEnabled(enabled: boolean): void {
    if (this.rain) {
      this.rain.setEnabled(enabled);
    }
  }

  /**
   * Factory: Creates a Ghost Dissolve Material
   */
  createGhostMaterial(options: GhostDissolveOptions = {}): GhostDissolveMaterial {
    return new GhostDissolveMaterial(options);
  }

  /**
   * Factory: articulated ghost figure (hunched, floating, long hair and shroud) wearing `material`
   * (default: a fresh Ghost Dissolve material). Returns { group, figure, update(delta, { moving, hunting }), dispose }.
   * `group` has its feet at y = 0 and faces +Z; the caller adds it to ghostGroup and owns the material.
   */
  createGhostFigure(material: THREE.Material | null = null): GhostFigure {
    return createGhostFigure(material || this.createGhostMaterial());
  }

  /**
   * Factory: Creates and tracks a D.O.T.S. Laser Matrix projector
   */
  createDotsProjector(options: DotsLaserMatrixOptions = {}): DotsLaserMatrix {
    const dots = new DotsLaserMatrix(options);
    this.dotsProjectors.add(dots);
    this.interactivePropsGroup.add(dots.group);
    return dots;
  }

  removeDotsProjector(dots: DotsLaserMatrix): void {
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
  }: RoomLightOptions): THREE.PointLight {
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

  setRoomLightState(id: string, isOn: unknown): void {
    const record = this.roomLights.get(id);
    if (!record) return;
    record.isOn = !!isOn;
    record.light.intensity = record.isOn ? record.baseIntensity : 0.0;
  }

  setBreakerState(breakerOn: unknown): void {
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

  addUpdateHook(fn: EngineUpdateHook): void {
    if (typeof fn === 'function') {
      this.updateHooks.add(fn);
    }
  }

  registerUpdateHook(fn: EngineUpdateHook): () => void {
    this.addUpdateHook(fn);
    return () => this.removeUpdateHook(fn);
  }

  removeUpdateHook(fn: EngineUpdateHook): void {
    this.updateHooks.delete(fn);
  }

  destroy(): void {
    this.dispose();
  }

  dispose(): void {
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
        pass.dispose();
      });
      this.composer.renderTarget1?.dispose();
      this.composer.renderTarget2?.dispose();
      this.composer = null;
    }

    // Traverse and dispose scene meshes, materials, geometries and their textures
    if (this.scene) {
      this.scene.traverse((obj) => {
        const { geometry, material } = obj as { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
        if (material) {
          const list = Array.isArray(material) ? material : [material];
          for (const m of list) {
            for (const v of Object.values(m)) {
              if (v instanceof THREE.Texture) v.dispose();
            }
          }
        }
        if (geometry) {
          geometry.dispose();
        }
        if (material) {
          if (Array.isArray(material)) {
            material.forEach((mat) => mat.dispose());
          } else {
            material.dispose();
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
        this.renderer.forceContextLoss();
      } catch {
        // context already lost
      }
      this.renderer = null;
    }
    if (this.mount && this.canvas?.parentNode === this.mount) {
      this.mount.removeChild(this.canvas);
    }
  }
}

export default PhobiaEngine;
