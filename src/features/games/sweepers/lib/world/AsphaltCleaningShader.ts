// AsphaltCleaningShader (spec 18): 2048² képernyőn kívüli tisztasági maszk világ-XZ-ben (R = 1 tiszta).
// Kezdőérték a hexenkénti tisztaságból; `paint(x, z, sugár, erősség)` sepréskor (Phase C) növeli.
// A föld-anyagok (materials.groundMaterial) ugyanazzal a képlettel mintavételeznek (cleanMask.ts).
import * as THREE from 'three';
import { AssetCache } from '../engine/AssetCache';
import { MASK_SIZE, worldLengthToClip, worldToMaskClip } from './cleanMask';
import { WORLD_UNIFORMS, neutralMaskTexture } from './materials';
import { HEX_SIZE, hexToWorld } from './hexGrid';
import type { HexSnapshot } from '../../types';

/** Value outside the hex grid (moderately dirty asphalt). */
const OUTSIDE_CLEANLINESS = 0.45;
const MAX_BRUSHES = 256;
const HEX_CAPACITY = 64;

const MASK_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
void main() {
  vUv = uv;
  vColor = vec3(1.0);
#ifdef USE_INSTANCING_COLOR
  vColor = instanceColor;
#endif
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

/** Hex fill: writes the cleanliness (instance colour r) as is. */
const FILL_FRAGMENT = /* glsl */ `
varying vec3 vColor;
void main() { gl_FragColor = vec4(vColor.r, vColor.r, vColor.r, 1.0); }`;

/** Brush: soft radial falloff, added on top (instance colour r = strength). */
const BRUSH_FRAGMENT = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = vColor.r * (1.0 - smoothstep(0.55, 1.0, d));
  gl_FragColor = vec4(a, a, a, 1.0);
}`;

export interface MaskBrush {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly strength: number;
}

export class AsphaltCleaningShader {
  readonly target: THREE.WebGLRenderTarget;
  readonly #scene = new THREE.Scene();
  readonly #camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  readonly #hexFill: THREE.InstancedMesh;
  readonly #brushes: THREE.InstancedMesh;
  readonly #pending: MaskBrush[] = [];
  readonly #m = new THREE.Matrix4();
  readonly #c = new THREE.Color();
  #needsInit = true;

  constructor() {
    this.target = new THREE.WebGLRenderTarget(MASK_SIZE, MASK_SIZE, {
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    });
    this.target.texture.name = 'sweepers.cleanMask';
    const cache = AssetCache.get();
    // pointy-top: CircleGeometry with 6 segments starting at 30° puts corners at 60°·i − 30° (± sign symmetric)
    const hexGeo = cache.geometry('mask.hex', () => new THREE.CircleGeometry(worldLengthToClip(HEX_SIZE), 6, Math.PI / 6));
    const fillMat = cache.material('mask.fill', () => new THREE.ShaderMaterial({ vertexShader: MASK_VERTEX, fragmentShader: FILL_FRAGMENT, depthTest: false, depthWrite: false }));
    this.#hexFill = new THREE.InstancedMesh(hexGeo, fillMat, HEX_CAPACITY);
    this.#hexFill.count = 0;
    this.#hexFill.frustumCulled = false;
    this.#hexFill.setColorAt(0, this.#c.setRGB(1, 1, 1));

    const quad = cache.geometry('mask.brush', () => new THREE.PlaneGeometry(2, 2));
    const brushMat = cache.material('mask.brush', () => new THREE.ShaderMaterial({
      vertexShader: MASK_VERTEX,
      fragmentShader: BRUSH_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      transparent: true
    }));
    this.#brushes = new THREE.InstancedMesh(quad, brushMat, MAX_BRUSHES);
    this.#brushes.count = 0;
    this.#brushes.frustumCulled = false;
    this.#brushes.setColorAt(0, this.#c.setRGB(1, 1, 1));
    this.#scene.add(this.#hexFill, this.#brushes);
    this.#camera.position.z = 1;
    WORLD_UNIFORMS.uSweepMask.value = this.target.texture;
  }

  /** (Re)initialises the mask from per-hex cleanliness on the next flush. */
  setHexes(hexes: readonly HexSnapshot[]): void {
    const n = Math.min(hexes.length, HEX_CAPACITY);
    for (let i = 0; i < n; i++) {
      const hex = hexes[i];
      if (!hex) continue;
      const { x, z } = hexToWorld(hex.q, hex.r);
      const clip = worldToMaskClip(x, z);
      this.#hexFill.setMatrixAt(i, this.#m.makeTranslation(clip.x, clip.y, 0));
      const v = hex.cleanliness / 100;
      this.#hexFill.setColorAt(i, this.#c.setRGB(v, v, v));
    }
    this.#hexFill.count = n;
    this.#hexFill.instanceMatrix.needsUpdate = true;
    if (this.#hexFill.instanceColor) this.#hexFill.instanceColor.needsUpdate = true;
    this.#needsInit = true;
  }

  /** Cleans a soft disc around world (x, z); `strength` 0..1 is added at the centre. Applied on flush. */
  paint(x: number, z: number, radius: number, strength: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !(radius > 0) || !(strength > 0)) return;
    if (this.#pending.length >= MAX_BRUSHES) this.#pending.shift();
    this.#pending.push({ x, z, radius, strength: Math.min(1, strength) });
  }

  get pendingBrushes(): readonly MaskBrush[] {
    return this.#pending;
  }

  get needsInit(): boolean {
    return this.#needsInit;
  }

  /** Renders the queued initialisation / brushes into the mask (call before the main render). */
  flush(renderer: THREE.WebGLRenderer): void {
    if (!this.#needsInit && this.#pending.length === 0) return;
    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.target);
    if (this.#needsInit) {
      renderer.setClearColor(this.#c.setRGB(OUTSIDE_CLEANLINESS, OUTSIDE_CLEANLINESS, OUTSIDE_CLEANLINESS), 1);
      renderer.clear(true, false, false);
    }
    this.#hexFill.visible = this.#needsInit;
    this.#brushes.count = this.#pending.length;
    this.#pending.forEach((b, i) => {
      const clip = worldToMaskClip(b.x, b.z);
      const r = worldLengthToClip(b.radius);
      this.#m.makeScale(r, r, 1).setPosition(clip.x, clip.y, 0);
      this.#brushes.setMatrixAt(i, this.#m);
      this.#brushes.setColorAt(i, this.#c.setRGB(b.strength, b.strength, b.strength));
    });
    this.#brushes.visible = this.#pending.length > 0;
    this.#brushes.instanceMatrix.needsUpdate = true;
    if (this.#brushes.instanceColor) this.#brushes.instanceColor.needsUpdate = true;
    renderer.autoClear = false;
    renderer.render(this.#scene, this.#camera);
    renderer.autoClear = prevAutoClear;
    renderer.setClearColor(prevClear, prevAlpha);
    renderer.setRenderTarget(prevTarget);
    this.#pending.length = 0;
    this.#needsInit = false;
  }

  dispose(): void {
    this.#hexFill.dispose();
    this.#brushes.dispose();
    this.target.dispose();
    if (WORLD_UNIFORMS.uSweepMask.value === this.target.texture) {
      WORLD_UNIFORMS.uSweepMask.value = neutralMaskTexture();
    }
  }
}
