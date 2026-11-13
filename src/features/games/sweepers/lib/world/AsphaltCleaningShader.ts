// AsphaltCleaningShader (spec 18): 2048² képernyőn kívüli tisztasági maszk világ-XZ-ben (R = 1 tiszta).
// Alap: hexenként a c10 kitöltés, csak ha a c10 változott (B LOW-7). Rá a betöltött chunkok cellái
// (`paintCells`, maszk = 1 − max(por, szotyi)/15), legfelül a puha ecsetek (`paint`).
// A föld-anyagok (materials.groundMaterial) ugyanazzal a képlettel mintavételeznek (cleanMask.ts).
import * as THREE from 'three';
import { AssetCache } from '../engine/AssetCache';
import { MASK_HALF_EXTENT as MASK_HALF, MASK_SIZE, worldLengthToClip, worldToMaskClip } from './cleanMask';
import { WORLD_UNIFORMS, neutralMaskTexture } from './materials';
import { HEX_SIZE, hexToWorld } from './hexGrid';
import { uploadInstances } from './geometryKit';
import { CELL_M, cellCleanliness } from '../debris/tables';
import type { HexSnapshot } from '../../types';
import type { CellPaint } from '../debris/ChunkStore';

/** Value outside the hex grid (moderately dirty asphalt). */
const OUTSIDE_CLEANLINESS = 0.45;
const MAX_BRUSHES = 256;
const HEX_CAPACITY = 64;
/** Cells drawn per flush; the rest of a big burst follows on the next frames. */
export const MAX_CELLS_PER_FLUSH = 16_384;

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

/** c10 of a hex snapshot (cleanliness has one decimal on the wire). */
const c10Of = (hex: HexSnapshot): number => Math.round(hex.cleanliness * 10);

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
  readonly #cells: THREE.InstancedMesh;
  readonly #pending: MaskBrush[] = [];
  /** Queued cell values by cell key (the newest value of a cell wins). */
  readonly #cellQueue = new Map<number, { readonly x: number; readonly z: number; readonly v: number }>();
  /** c10 last painted per hex id, and the hexes whose fill is queued. */
  readonly #appliedC10 = new Map<number, number>();
  readonly #hexQueue = new Map<number, HexSnapshot>();
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
    const cellMat = cache.material('mask.cell', () => new THREE.ShaderMaterial({ vertexShader: MASK_VERTEX, fragmentShader: FILL_FRAGMENT, depthTest: false, depthWrite: false }));
    this.#cells = new THREE.InstancedMesh(quad, cellMat, MAX_CELLS_PER_FLUSH);
    this.#cells.count = 0;
    this.#cells.frustumCulled = false;
    this.#cells.setColorAt(0, this.#c.setRGB(1, 1, 1));
    // opaque passes draw by renderOrder: hex fill, then cells on top; brushes (transparent) last
    this.#hexFill.renderOrder = 0;
    this.#cells.renderOrder = 1;
    this.#brushes.renderOrder = 2;
    this.#scene.add(this.#hexFill, this.#cells, this.#brushes);
    this.#camera.position.z = 1;
    WORLD_UNIFORMS.uSweepMask.value = this.target.texture;
  }

  /**
   * Queues the c10 fill of every hex whose c10 differs from the one already painted (B LOW-7: a
   * reconnect with the same values repaints nothing). Returns the hexes repainted: their loaded cells
   * must be painted again on top (`paintCells`).
   */
  setHexes(hexes: readonly HexSnapshot[]): HexSnapshot[] {
    const changed: HexSnapshot[] = [];
    for (const hex of hexes) {
      if (this.#appliedC10.get(hex.id) === c10Of(hex)) continue;
      this.#appliedC10.set(hex.id, c10Of(hex));
      this.#hexQueue.set(hex.id, hex);
      changed.push(hex);
    }
    return changed;
  }

  /** Paints cells (world centre + byte) as 1 − max(dust, seed)/15 on top of the hex fill. */
  paintCells(cells: readonly CellPaint[]): void {
    for (const cell of cells) {
      const key = Math.floor((cell.x + MASK_HALF) / CELL_M) * 4096 + Math.floor((cell.z + MASK_HALF) / CELL_M);
      this.#cellQueue.set(key, { x: cell.x, z: cell.z, v: cellCleanliness(cell.byte) });
    }
  }

  get pendingCells(): number {
    return this.#cellQueue.size;
  }

  /** Hexes whose fill is queued (tests). */
  get pendingHexes(): readonly HexSnapshot[] {
    return [...this.#hexQueue.values()];
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

  /** Renders the queued initialisation, hex fills, cells and brushes into the mask (before the main render). */
  flush(renderer: THREE.WebGLRenderer): void {
    if (!this.#needsInit && this.#pending.length === 0 && this.#hexQueue.size === 0 && this.#cellQueue.size === 0) return;
    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.target);
    if (this.#needsInit) {
      renderer.setClearColor(this.#c.setRGB(OUTSIDE_CLEANLINESS, OUTSIDE_CLEANLINESS, OUTSIDE_CLEANLINESS), 1);
      renderer.clear(true, false, false);
    }
    this.#fillHexes();
    this.#fillCells();
    this.#brushes.count = this.#pending.length;
    this.#pending.forEach((b, i) => {
      const clip = worldToMaskClip(b.x, b.z);
      const r = worldLengthToClip(b.radius);
      this.#m.makeScale(r, r, 1).setPosition(clip.x, clip.y, 0);
      this.#brushes.setMatrixAt(i, this.#m);
      this.#brushes.setColorAt(i, this.#c.setRGB(b.strength, b.strength, b.strength));
    });
    this.#brushes.visible = this.#pending.length > 0;
    uploadInstances(this.#brushes, this.#brushes.count);
    renderer.autoClear = false;
    renderer.render(this.#scene, this.#camera);
    renderer.autoClear = prevAutoClear;
    renderer.setClearColor(prevClear, prevAlpha);
    renderer.setRenderTarget(prevTarget);
    this.#pending.length = 0;
    this.#needsInit = false;
  }

  #fillHexes(): void {
    let i = 0;
    for (const hex of this.#hexQueue.values()) {
      if (i >= HEX_CAPACITY) break;
      const { x, z } = hexToWorld(hex.q, hex.r);
      const clip = worldToMaskClip(x, z);
      this.#hexFill.setMatrixAt(i, this.#m.makeTranslation(clip.x, clip.y, 0));
      const v = c10Of(hex) / 1000;
      this.#hexFill.setColorAt(i, this.#c.setRGB(v, v, v));
      i += 1;
    }
    this.#hexQueue.clear();
    this.#hexFill.count = i;
    this.#hexFill.visible = i > 0;
    uploadInstances(this.#hexFill, i);
  }

  #fillCells(): void {
    const half = worldLengthToClip(CELL_M / 2);
    let i = 0;
    for (const [key, cell] of this.#cellQueue) {
      if (i >= MAX_CELLS_PER_FLUSH) break;
      const clip = worldToMaskClip(cell.x, cell.z);
      this.#m.makeScale(half, half, 1).setPosition(clip.x, clip.y, 0);
      this.#cells.setMatrixAt(i, this.#m);
      this.#cells.setColorAt(i, this.#c.setRGB(cell.v, cell.v, cell.v));
      this.#cellQueue.delete(key);
      i += 1;
    }
    this.#cells.count = i;
    this.#cells.visible = i > 0;
    uploadInstances(this.#cells, i);
  }

  dispose(): void {
    this.#hexFill.dispose();
    this.#brushes.dispose();
    this.#cells.dispose();
    this.target.dispose();
    if (WORLD_UNIFORMS.uSweepMask.value === this.target.texture) {
      WORLD_UNIFORMS.uSweepMask.value = neutralMaskTexture();
    }
  }
}
