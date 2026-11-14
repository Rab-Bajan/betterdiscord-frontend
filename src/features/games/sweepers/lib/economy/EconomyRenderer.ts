// Phase E látványelemek (E.7): mérleg-LED (2 példány, 1 rajzolás), LME-szalag az iroda ablaka fölött,
// az ellenőr fekete autója, füst (generátor + füstölő gépek) és a kenési pontok: 5 rajzolás.
// Semmi sem vet árnyékot; a vásznak 2D kontextus nélkül (tesztek) üresek maradnak.
import * as THREE from 'three';
import { AssetCache } from '../engine/AssetCache';
import { PartsBuilder, uploadInstances } from '../world/geometryKit';
import { litMaterial } from '../world/materials';
import { CRANE, wearsOut } from '../logistics/tables';
import { LED_CELLS, ledCells } from './format';
import { servicePoints } from './world';
import type { StructRow } from '../../logisticsTypes';
import type { WorldLayout } from '../../worldTypes';

/** Main-pass draws Phase E adds here (LED 1, ticker 1, car 1, smoke 1, grease markers 1). */
export const ECONOMY_DRAW_CALLS = 5;
export const CAR_DRIVE_MS = 20_000;
const MAX_PUFFS = 64;
const PUFFS_PER_SOURCE = 4;
const MAX_MARKERS = 32;
const TICKER_MPS = 0.06;

function canvasTexture(w: number, h: number): { canvas: HTMLCanvasElement | null; texture: THREE.Texture } {
  const canvas = typeof document === 'undefined' ? null : document.createElement('canvas');
  if (canvas) {
    canvas.width = w;
    canvas.height = h;
  }
  const texture = canvas ? new THREE.CanvasTexture(canvas) : new THREE.Texture();
  texture.colorSpace = THREE.SRGBColorSpace;
  return { canvas, texture };
}

/** Segment rectangles of one cell (x, y, w, h in cell units 0..1 × 0..2): a b c d e f g. */
const SEGMENTS: readonly (readonly [number, number, number, number])[] = [
  [0.15, 0, 0.7, 0.12], [0.85, 0.1, 0.12, 0.8], [0.85, 1.1, 0.12, 0.8], [0.15, 1.88, 0.7, 0.12],
  [0.03, 1.1, 0.12, 0.8], [0.03, 0.1, 0.12, 0.8], [0.15, 0.94, 0.7, 0.12]
];

function instanced(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number, colors: boolean): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = name;
  mesh.count = 0;
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  if (colors) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  return mesh;
}

function carGeometry(): THREE.BufferGeometry {
  const b = new PartsBuilder();
  b.box(1.8, 0.7, 4.4, 0x111114, { y: 0.55 }).box(1.6, 0.55, 2.2, 0x1a1c22, { y: 1.15, z: -0.2 });
  for (const [x, z] of [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]]) b.add(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 12).rotateZ(Math.PI / 2), 0x050505, { x, y: 0.33, z });
  b.box(1.5, 0.12, 0.05, 0xf2f2f2, { y: 0.6, z: 2.21 });
  return b.build();
}

export interface EconomyFrame {
  readonly now: number;
  readonly dt: number;
  readonly timeSec: number;
  readonly ground: (x: number, z: number) => number;
  readonly structures: Iterable<StructRow>;
  readonly genOn: boolean;
}

export class EconomyRenderer {
  readonly root = new THREE.Group();
  readonly led: THREE.InstancedMesh;
  readonly ticker: THREE.Mesh;
  readonly car: THREE.Mesh;
  readonly smoke: THREE.InstancedMesh;
  readonly markers: THREE.InstancedMesh;
  readonly #ledTex = canvasTexture(256, 64);
  readonly #tickerTex = canvasTexture(1024, 64);
  readonly #m = new THREE.Matrix4();
  readonly #q = new THREE.Quaternion();
  readonly #p = new THREE.Vector3();
  readonly #s = new THREE.Vector3();
  readonly #c = new THREE.Color();
  readonly #up = new THREE.Vector3(0, 1, 0);
  #ledUntil = -Infinity;
  #carFrom = -Infinity;
  #office: { x: number; z: number; rotY: number } | null = null;
  #generator: { x: number; z: number; rotY: number } | null = null;

  constructor() {
    this.root.name = 'economy';
    this.#ledTex.texture.magFilter = THREE.NearestFilter;
    this.led = instanced('economy.led', AssetCache.get().geometry('economy.ledQuad', () => new THREE.PlaneGeometry(1, 1)), new THREE.MeshBasicMaterial({ map: this.#ledTex.texture, toneMapped: false }), 2, false);
    const tex = this.#tickerTex.texture;
    tex.wrapS = THREE.RepeatWrapping;
    this.ticker = new THREE.Mesh(AssetCache.get().geometry('economy.tickerQuad', () => new THREE.PlaneGeometry(4, 0.4)), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    this.ticker.name = 'economy.ticker';
    this.ticker.visible = false;
    this.car = new THREE.Mesh(AssetCache.get().geometry('economy.car', carGeometry), litMaterial());
    this.car.name = 'economy.car';
    this.car.visible = false;
    this.smoke = instanced('economy.smoke', AssetCache.get().geometry('economy.puff', () => new THREE.IcosahedronGeometry(0.35, 0)),
      AssetCache.get().material('economy.smoke', () => new THREE.MeshBasicMaterial({ color: 0x6b6b6b, transparent: true, opacity: 0.45, depthWrite: false })), MAX_PUFFS, false);
    this.markers = instanced('economy.grease', AssetCache.get().geometry('economy.marker', () => new THREE.OctahedronGeometry(0.15, 0)),
      AssetCache.get().material('economy.marker', () => new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })), MAX_MARKERS, true);
    for (const o of [this.ticker, this.car]) o.castShadow = false;
    this.root.add(this.led, this.ticker, this.car, this.smoke, this.markers);
  }

  /** Anchors from the layout: the LED building (+ the crane pad sign), the office ticker, the generator. */
  setLayout(layout: WorldLayout | null, ground: (x: number, z: number) => number): void {
    this.#office = layout?.landmarks.office ?? null;
    this.#generator = layout?.landmarks.generator ?? null;
    const sign = layout?.buildings.find((b) => b.kind === 'led_display');
    let n = 0;
    if (sign) {
      // the archetype's face: 0.92 w × 0.32 h at 0.8 h, on the +z side
      const o = { x: Math.sin(sign.rotY) * (sign.d * 0.505 + 0.01), z: Math.cos(sign.rotY) * (sign.d * 0.505 + 0.01) };
      this.#compose(this.led, n++, sign.x + o.x, ground(sign.x, sign.z) + sign.h * 0.8, sign.z + o.z, sign.rotY, sign.w * 0.92, sign.h * 0.32);
    }
    // a small sign under the crane girder, facing the pad
    const pad = CRANE.targets[0];
    this.#compose(this.led, n++, pad.x, ground(pad.x, pad.z) + 4.6, CRANE.area.z1 - 0.3, Math.PI, 1.6, 0.4);
    this.led.count = n;
    uploadInstances(this.led, n);
    const office = this.#office;
    this.ticker.visible = office !== null;
    if (office) {
      const d = 2.5 / 2 + 0.03;
      this.ticker.position.set(office.x + Math.sin(office.rotY) * d, ground(office.x, office.z) + 2.3, office.z + Math.cos(office.rotY) * d);
      this.ticker.rotation.set(0, office.rotY, 0);
    }
  }

  /** The weight for 10 s after `scale_weighed` (76). */
  showLed(kgDg: number, until: number): void {
    this.#ledUntil = until;
    const g = this.#ledTex.canvas?.getContext('2d');
    if (!g) return;
    g.fillStyle = '#050805';
    g.fillRect(0, 0, 256, 64);
    const cw = 256 / LED_CELLS;
    ledCells(kgDg).forEach((cell, i) => {
      const x0 = i * cw + cw * 0.18;
      const sx = cw * 0.6;
      const sy = 24;
      SEGMENTS.forEach(([x, y, w, h], bit) => {
        g.fillStyle = ((cell.mask >> bit) & 1) === 1 ? '#39FF6A' : '#0E2412';
        g.fillRect(x0 + x * sx, 8 + y * sy, w * sx, h * sy);
      });
      if (cell.dp) {
        g.fillStyle = '#39FF6A';
        g.fillRect(x0 + sx * 1.05, 50, 5, 5);
      }
    });
    this.#ledTex.texture.needsUpdate = true;
  }

  setTicker(text: string): void {
    const g = this.#tickerTex.canvas?.getContext('2d');
    if (!g) return;
    g.fillStyle = '#0b0b10';
    g.fillRect(0, 0, 1024, 64);
    g.fillStyle = '#FFB020';
    g.font = '700 34px "Courier New", monospace';
    g.textBaseline = 'middle';
    g.fillText(text, 8, 33, 1008);
    this.#tickerTex.texture.needsUpdate = true;
  }

  /** The inspector's visit (86): gate → office → gate over 20 s. */
  startCar(now: number): void {
    this.#carFrom = now;
  }

  update(f: EconomyFrame): void {
    this.led.visible = this.led.count > 0 && f.now < this.#ledUntil;
    this.#tickerTex.texture.offset.x = (this.#tickerTex.texture.offset.x + f.dt * TICKER_MPS) % 1;
    this.#drawCar(f);
    const sources: { x: number; y: number; z: number }[] = [];
    const markers: { x: number; y: number; z: number; done: boolean }[] = [];
    for (const r of f.structures) {
      if (!wearsOut(r.type) || !r.smoking) continue;
      sources.push({ x: r.x, y: r.baseY + (r.type === 15 ? 2.4 : 1.6), z: r.z });
      servicePoints(r).forEach((p, i) => markers.push({ ...p, y: r.baseY + 1, done: ((r.grease >> i) & 1) === 1 }));
    }
    const gen = this.#generator;
    if (f.genOn && gen) sources.push({ x: gen.x + Math.cos(gen.rotY) * 1.05, y: f.ground(gen.x, gen.z) + 2.1, z: gen.z - Math.sin(gen.rotY) * 1.05 });
    let n = 0;
    for (const [k, s] of sources.entries()) {
      for (let j = 0; j < PUFFS_PER_SOURCE && n < MAX_PUFFS; j++) {
        const u = (f.timeSec * 0.4 + j / PUFFS_PER_SOURCE + k * 0.13) % 1;
        const r = 0.6 + u * 1.6;
        this.#compose(this.smoke, n++, s.x + Math.sin(u * 7 + k) * 0.3, s.y + u * 2.5, s.z, 0, r, r);
      }
    }
    this.smoke.count = n;
    this.smoke.visible = n > 0;
    uploadInstances(this.smoke, n);
    const m = Math.min(MAX_MARKERS, markers.length);
    const pulse = 1 + 0.25 * Math.sin(f.timeSec * 6);
    for (let i = 0; i < m; i++) {
      const p = markers[i];
      if (!p) continue;
      this.#compose(this.markers, i, p.x, p.y, p.z, f.timeSec, pulse, pulse);
      this.markers.setColorAt(i, this.#c.set(p.done ? '#28C997' : '#FFD21A'));
    }
    this.markers.count = m;
    this.markers.visible = m > 0;
    uploadInstances(this.markers, m);
  }

  #drawCar(f: EconomyFrame): void {
    const office = this.#office;
    const t = f.now - this.#carFrom;
    this.car.visible = office !== null && t >= 0 && t < CAR_DRIVE_MS;
    if (!office || !this.car.visible) return;
    // shortcut: the "gate" is a point 35 m from the office along +z; use a real gate landmark once the layout has one
    const gate = { x: office.x, z: office.z + 35 };
    const stop = { x: office.x + Math.sin(office.rotY) * 4, z: office.z + Math.cos(office.rotY) * 4 };
    // 0–7 s in, 7–13 s parked, 13–20 s out
    const u = t < 7000 ? t / 7000 : t < 13_000 ? 1 : 1 - (t - 13_000) / 7000;
    const x = gate.x + (stop.x - gate.x) * u;
    const z = gate.z + (stop.z - gate.z) * u;
    this.car.position.set(x, f.ground(x, z), z);
    this.car.rotation.set(0, Math.atan2(stop.x - gate.x, stop.z - gate.z) + (t >= 13_000 ? Math.PI : 0), 0);
  }

  #compose(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, rotY: number, sx: number, sy: number): void {
    this.#q.setFromAxisAngle(this.#up, rotY);
    this.#m.compose(this.#p.set(x, y, z), this.#q, this.#s.set(sx, sy, mesh === this.led ? 1 : sx));
    mesh.setMatrixAt(i, this.#m);
  }

  dispose(): void {
    for (const mesh of [this.led, this.smoke, this.markers]) mesh.dispose();
    for (const o of [this.led, this.ticker]) {
      const mat = o.material;
      if (mat instanceof THREE.Material) mat.dispose();
    }
    this.#ledTex.texture.dispose();
    this.#tickerTex.texture.dispose();
    this.root.removeFromParent();
  }
}
