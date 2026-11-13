// Procedurális geometria-építő: primitívek összefésülése egyetlen, csúcsszínezett BufferGeometryvé
// (egy anyag + egy rajzolás alkatrészenként).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const tmpColor = new THREE.Color();
const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3();

export interface PartTransform {
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
  readonly rx?: number;
  readonly ry?: number;
  readonly rz?: number;
  readonly sx?: number;
  readonly sy?: number;
  readonly sz?: number;
}

/** Collects coloured primitives and merges them into one geometry with position/normal/uv/color. */
export class PartsBuilder {
  readonly #parts: THREE.BufferGeometry[] = [];

  add(geometry: THREE.BufferGeometry, color: number, t: PartTransform = {}): this {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    tmpEuler.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0);
    tmpQuat.setFromEuler(tmpEuler);
    tmpMatrix.compose(tmpPos.set(t.x ?? 0, t.y ?? 0, t.z ?? 0), tmpQuat, tmpScale.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1));
    g.applyMatrix4(tmpMatrix);
    tmpColor.setHex(color, THREE.SRGBColorSpace);
    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') g.deleteAttribute(name);
    }
    this.#parts.push(g);
    return this;
  }

  /** Box centred at (x, y, z) with size (w, h, d). */
  box(w: number, h: number, d: number, color: number, t: PartTransform = {}): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, t);
  }

  /** Cylinder whose base sits at y (axis vertical unless rotated). */
  cyl(rTop: number, rBottom: number, h: number, color: number, t: PartTransform = {}, segments = 10): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, segments).translate(0, h / 2, 0), color, t);
  }

  sphere(r: number, color: number, t: PartTransform = {}, w = 10, h = 8): this {
    return this.add(new THREE.SphereGeometry(r, w, h), color, t);
  }

  build(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.#parts, false);
    for (const p of this.#parts) p.dispose();
    this.#parts.length = 0;
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
  }
}

/** Deterministic 0..1 hash of a string id (stable per building across clients). */
export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** Small seeded PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = Math.floor(seed * 4294967296) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
