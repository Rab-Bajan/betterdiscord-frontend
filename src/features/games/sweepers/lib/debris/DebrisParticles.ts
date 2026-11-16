// Szívás- és fúvásrészecskék (spec 36): egyetlen Points objektum (≤ 512 részecske). A vakuum a régió
// pontjaiból másodfokú Bézier mentén a szívócsőbe húzza őket, a lombfúvó a csőtől előre fújja; söprés-
// ütéskor porpamacs száll fel. Egy rajzolás, árnyék nélkül.
import * as THREE from 'three';
import { AssetCache } from '../engine/AssetCache';

export const MAX_PARTICLES = 512;
export const PARTICLE_DRAW_CALLS = 1;

interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export class DebrisParticles {
  readonly points: THREE.Points;
  readonly #geo = new THREE.BufferGeometry();
  readonly #pos = new Float32Array(MAX_PARTICLES * 3);
  readonly #col = new Float32Array(MAX_PARTICLES * 3);
  /** Per particle: p0 (3), p1 (3), p2 (3), t, rate. */
  readonly #sim = new Float32Array(MAX_PARTICLES * 11);
  #alive = 0;
  #seed = 1;

  constructor() {
    this.#geo.setAttribute('position', new THREE.BufferAttribute(this.#pos, 3));
    this.#geo.setAttribute('color', new THREE.BufferAttribute(this.#col, 3));
    this.#geo.setDrawRange(0, 0);
    const material = AssetCache.get().material('particles.debris', () => new THREE.PointsMaterial({
      size: 0.05,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    }));
    this.points = new THREE.Points(this.#geo, material);
    this.points.name = 'debris-particles';
    this.points.frustumCulled = false;
    this.points.castShadow = false;
    this.points.visible = false;
  }

  get alive(): number {
    return this.#alive;
  }

  /** Vacuum: particles from each source point along a Bézier into the nozzle. */
  pull(sources: readonly Vec3[], nozzle: Vec3, color = 0x8a8170): void {
    for (const s of sources) {
      const mid = { x: (s.x + nozzle.x) / 2 + (this.#rand() - 0.5) * 0.3, y: Math.max(s.y, nozzle.y) + 0.25, z: (s.z + nozzle.z) / 2 + (this.#rand() - 0.5) * 0.3 };
      this.#spawn(s, mid, nozzle, 2.2 + this.#rand() * 1.2, color);
    }
  }

  /** Blower: a fan of particles from the nozzle forward along `dir` (unit, horizontal) to ~`reach` m. */
  blow(nozzle: Vec3, dir: { x: number; z: number }, reach: number, count: number, color = 0x9b9282): void {
    for (let i = 0; i < count; i++) {
      const spread = (this.#rand() - 0.5) * 0.5;
      const d = reach * (0.5 + this.#rand() * 0.5);
      const sx = dir.x * Math.cos(spread) - dir.z * Math.sin(spread);
      const sz = dir.x * Math.sin(spread) + dir.z * Math.cos(spread);
      const end = { x: nozzle.x + sx * d, y: nozzle.y - 1.2 + this.#rand() * 0.4, z: nozzle.z + sz * d };
      const mid = { x: nozzle.x + sx * d * 0.5, y: nozzle.y + 0.1, z: nozzle.z + sz * d * 0.5 };
      this.#spawn(nozzle, mid, end, 1.6 + this.#rand(), color);
    }
  }

  /** A dust puff rising from a broom stroke at (x, y, z). */
  puff(at: Vec3, count: number, color = 0x9c9384): void {
    for (let i = 0; i < count; i++) {
      const a = this.#rand() * Math.PI * 2;
      const r = 0.15 + this.#rand() * 0.3;
      const end = { x: at.x + Math.cos(a) * r, y: at.y + 0.3 + this.#rand() * 0.4, z: at.z + Math.sin(a) * r };
      const mid = { x: at.x + Math.cos(a) * r * 0.4, y: at.y + 0.25, z: at.z + Math.sin(a) * r * 0.4 };
      this.#spawn(at, mid, end, 1.5 + this.#rand(), color);
    }
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.#alive) {
      const o = i * 11;
      const t = (this.#sim[o + 9] ?? 1) + dt * (this.#sim[o + 10] ?? 1);
      if (t >= 1) {
        this.#kill(i);
        continue;
      }
      this.#sim[o + 9] = t;
      const u = 1 - t;
      for (let k = 0; k < 3; k++) {
        const p0 = this.#sim[o + k] ?? 0;
        const p1 = this.#sim[o + 3 + k] ?? 0;
        const p2 = this.#sim[o + 6 + k] ?? 0;
        this.#pos[i * 3 + k] = u * u * p0 + 2 * u * t * p1 + t * t * p2;
      }
      i += 1;
    }
    this.#geo.setDrawRange(0, this.#alive);
    const attr = this.#geo.getAttribute('position');
    attr.needsUpdate = true;
    this.#geo.getAttribute('color').needsUpdate = true;
    this.points.visible = this.#alive > 0;
  }

  dispose(): void {
    this.#geo.dispose();
    this.points.removeFromParent();
  }

  #spawn(p0: Vec3, p1: Vec3, p2: Vec3, rate: number, color: number): void {
    if (this.#alive >= MAX_PARTICLES) return;
    const i = this.#alive;
    const o = i * 11;
    this.#sim.set([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, 0, rate], o);
    this.#pos.set([p0.x, p0.y, p0.z], i * 3);
    const shade = 0.8 + this.#rand() * 0.4;
    this.#col.set([(((color >> 16) & 0xff) / 255) * shade, (((color >> 8) & 0xff) / 255) * shade, ((color & 0xff) / 255) * shade], i * 3);
    this.#alive += 1;
  }

  /** Swap-remove: the last live particle takes slot i. */
  #kill(i: number): void {
    const last = this.#alive - 1;
    if (i !== last) {
      this.#sim.copyWithin(i * 11, last * 11, last * 11 + 11);
      this.#pos.copyWithin(i * 3, last * 3, last * 3 + 3);
      this.#col.copyWithin(i * 3, last * 3, last * 3 + 3);
    }
    this.#alive = last;
  }

  #rand(): number {
    this.#seed = (this.#seed * 1664525 + 1013904223) >>> 0;
    return this.#seed / 4294967296;
  }
}
