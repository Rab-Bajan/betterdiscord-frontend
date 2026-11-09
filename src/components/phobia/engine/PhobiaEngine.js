import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { FilmShader } from 'three/addons/shaders/FilmShader.js';

import {
  VhsHuntGlitchShader,
  GhostDissolveMaterial,
  DotsLaserMatrix,
  RainParticles,
  FreezingBreathParticles
} from '../shaders/index.js';

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
export class PhobiaEngine {
  constructor(options = {}) {
    const { canvas, container } = options;
    if (!canvas) {
      throw new Error('PhobiaEngine requires a HTMLCanvasElement in options.canvas');
    }

    this.canvas = canvas;
    this.container = container || canvas.parentElement || canvas;

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
    this.flashlightBaseIntensity = 2.2;
    this.flashlightTimer = 0.0;

    // Hunt and environment states
    this.huntIntensity = 0.0;
    this.ambientTemperature = 15.0; // Celsius

    this._initRenderer();
    this._initScene();
    this._initCameraAndPlayer();
    this._initLighting();
    this._initPostProcessing();
    this._initParticleSystems();
    this._initResizeObserver();
  }

  /* -------------------------------------------------------------------------- */
  /*                             INITIALIZATION                                 */
  /* -------------------------------------------------------------------------- */

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false
    });

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const initialWidth = this.container.clientWidth || window.innerWidth;
    const initialHeight = this.container.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(initialWidth, initialHeight, false);
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x06070e);
    this.scene.fog = new THREE.FogExp2(0x090a18, 0.022);

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
    this.ambientLight = new THREE.AmbientLight(0x161a2e, 0.18);
    this.lightingGroup.add(this.ambientLight);

    // Dynamic player camera child SpotLight (Flashlight)
    this.flashlight = new THREE.SpotLight(0xfff4e0, this.flashlightBaseIntensity);
    this.flashlight.distance = 18.0;
    this.flashlight.angle = Math.PI / 6; // 30 degrees cone
    this.flashlight.penumbra = 0.35;
    this.flashlight.decay = 2.0; // quadratic attenuation
    this.flashlight.castShadow = true;

    this.flashlight.shadow.mapSize.width = 1024;
    this.flashlight.shadow.mapSize.height = 1024;
    this.flashlight.shadow.camera.near = 0.1;
    this.flashlight.shadow.camera.far = 18.0;
    this.flashlight.shadow.bias = -0.0005;

    // Flashlight target fixed forward in front of camera
    this.flashlightTarget = new THREE.Object3D();
    this.flashlightTarget.position.set(0, 0, -5);
    this.camera.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;

    this.camera.add(this.flashlight);
  }

  _initPostProcessing() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.composer = new EffectComposer(this.renderer);

    // Pass 1: Base scene render
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    // Pass 2: Vignette Shader
    this.vignettePass = new ShaderPass(VignetteShader);
    this.vignettePass.uniforms.offset.value = 1.05;
    this.vignettePass.uniforms.darkness.value = 1.25;
    this.composer.addPass(this.vignettePass);

    // Pass 3: Film Grain Shader
    this.filmPass = new ShaderPass(FilmShader);
    this.filmPass.uniforms.intensity.value = 0.22;
    this.filmPass.uniforms.time.value = 0.0;
    this.composer.addPass(this.filmPass);

    // Pass 4: Custom VHS Hunt Glitch Shader
    this.vhsPass = new ShaderPass(VhsHuntGlitchShader);
    this.vhsPass.uniforms.uHuntIntensity.value = 0.0;
    this.vhsPass.uniforms.uTime.value = 0.0;
    this.composer.addPass(this.vhsPass);

    // Pass 5: Output Color Space & Tone Mapping pass
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    this.composer.setSize(width, height);
  }

  _initParticleSystems() {
    // 1. Dynamic Rain System: 3000 line streaks + ground mist
    this.rain = new RainParticles({
      rainCount: 3000,
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

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);

    if (this.composer) {
      this.composer.setSize(width, height);
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

    // 1. Update Post-processing uniforms
    if (this.filmPass) {
      this.filmPass.uniforms.time.value = elapsedTime;
    }
    if (this.vhsPass) {
      this.vhsPass.uniforms.uTime.value = elapsedTime;
      this.vhsPass.uniforms.uHuntIntensity.value = this.huntIntensity;
    }

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
    try {
      this.composer.render(delta);
    } catch (err) {
      console.warn('Composer render failed, falling back to WebGLRenderer:', err);
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

  removeUpdateHook(fn) {
    this.updateHooks.delete(fn);
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

    // Traverse and dispose scene meshes, materials, and geometries
    if (this.scene) {
      this.scene.traverse((obj) => {
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
      this.scene.clear();
      this.scene = null;
    }

    // Dispose renderer
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer = null;
    }
  }
}

export default PhobiaEngine;
