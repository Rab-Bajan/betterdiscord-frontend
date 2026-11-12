// Static ground clutter for the terrain: grass tufts, dry weeds, shrubs and reeds (one wind-swayed vertex-coloured
// material), stones, broken concrete, bricks, rebar, tyres, drums, pallets and pipe segments. Everything is built once
// from code and drawn as one InstancedMesh per prop type; placement is deterministic per tile via hash2. Props stay
// low and sparse on walkable tiles; ruins (impassable) and shores get the dense detail.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { TILE_CODE } from '../empireStore.ts';
import { hash2 } from './textures.ts';
import type { HeightAt } from './terrain.ts';
import type { TextureLib } from './textures.ts';
import type { EmpireStore } from '../../types.ts';

type Rgb = readonly [number, number, number];
type Vec3T = readonly [number, number, number];
/** [x, y, lift, rx, ry, rz, sx, sy, sz] plus an optional [r, g, b] tint */
type PropInstance = [number, number, number, number, number, number, number, number, number, ...number[]];

export interface GroundProps {
  group: THREE.Group;
  update(time: number): void;
  dispose(): void;
}

const lin = (c: Rgb): Rgb => [Math.pow(c[0], 2.2), Math.pow(c[1], 2.2), Math.pow(c[2], 2.2)];
const rng = (seed: number): (() => number) => { let k = 0; return () => hash2(seed, k++, 9137); };
const scaled = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];
// colour k of a palette (k is always in range; the first entry stands in otherwise)
const pick = <T extends readonly [Rgb, ...Rgb[]]>(cols: T, k: number): Rgb => cols[k] ?? cols[0];

// ---- foliage (vertex colours: dark base -> blade colour -> pale tip) ----
const TUFT_COLS: readonly [Rgb, Rgb, Rgb, Rgb, Rgb] = [lin([0.55, 0.48, 0.29]), lin([0.47, 0.4, 0.23]), lin([0.4, 0.4, 0.2]), lin([0.32, 0.35, 0.15]), lin([0.5, 0.47, 0.35])];
const REED_COLS: readonly [Rgb, Rgb, Rgb] = [lin([0.42, 0.45, 0.2]), lin([0.55, 0.5, 0.28]), lin([0.36, 0.4, 0.18])];
const LEAF_COLS: readonly [Rgb, Rgb, Rgb, Rgb, Rgb] = [lin([0.3, 0.33, 0.14]), lin([0.36, 0.37, 0.17]), lin([0.42, 0.36, 0.17]), lin([0.26, 0.3, 0.13]), lin([0.4, 0.3, 0.15])];
const HEAD_COL = lin([0.3, 0.2, 0.1]);

class Builder {
  readonly p: number[] = [];
  readonly n: number[] = [];
  readonly c: number[] = [];
  readonly i: number[] = [];

  v(x: number, y: number, z: number, nx: number, ny: number, nz: number, col: Rgb): number { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(col[0], col[1], col[2]); return this.p.length / 3 - 1; }
  tri(a: number, b: number, c: number): void { this.i.push(a, b, c); }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    return g;
  }
}

// one curved, tapering blade from (bx, bz) leaning along angle `a`; normals tilt upward so thin blades catch the sky light
function blade(B: Builder, bx: number, bz: number, a: number, height: number, lean: number, width: number, col: Rgb, tipCol: Rgb): void {
  const S = 2, dx = Math.cos(a), dz = Math.sin(a), sx = -dz * width, sz = dx * width;
  const nx = dx * 0.5, nz = dz * 0.5, nl = Math.hypot(nx, 1, nz);
  let prev: [number, number] | null = null;
  for (let s = 0; s <= S; s++) {
    const t = s / S, k = t * t * t * (3 - 2 * t);
    const cx = bx + dx * lean * height * t * t, cz = bz + dz * lean * height * t * t, y = height * t * (1 - 0.3 * lean * t);
    const cc: Rgb = t < 0.5 ? scaled(col, 0.45 + t * 1.1) : [col[0] + (tipCol[0] - col[0]) * (t - 0.5) * 2, col[1] + (tipCol[1] - col[1]) * (t - 0.5) * 2, col[2] + (tipCol[2] - col[2]) * (t - 0.5) * 2];
    if (s === S) { const tip = B.v(cx, y, cz, nx / nl, 1 / nl, nz / nl, cc); if (prev) B.tri(prev[0], prev[1], tip); break; }
    const w = 1 - k * 0.85;
    const l = B.v(cx - sx * w, y, cz - sz * w, nx / nl, 1 / nl, nz / nl, cc), r = B.v(cx + sx * w, y, cz + sz * w, nx / nl, 1 / nl, nz / nl, cc);
    if (prev) { B.tri(prev[0], prev[1], r); B.tri(prev[0], r, l); }
    prev = [l, r];
  }
}
// two crossed vertical quads (seed heads, cattails)
function spike(B: Builder, x: number, y: number, z: number, w: number, h: number, col: Rgb): void {
  for (const [ax, az] of [[1, 0], [0, 1]] as const) {
    const a = B.v(x - ax * w, y, z - az * w, 0, 1, 0, col), b = B.v(x + ax * w, y, z + az * w, 0, 1, 0, col);
    const c = B.v(x + ax * w * 0.6, y + h, z + az * w * 0.6, 0, 1, 0, col), d = B.v(x - ax * w * 0.6, y + h, z - az * w * 0.6, 0, 1, 0, col);
    B.tri(a, b, c); B.tri(a, c, d);
  }
}

function tuftGeo(seed: number, count: number, hMin: number, hMax: number, spread: number, width: number, cols: readonly [Rgb, ...Rgb[]]): THREE.BufferGeometry {
  const B = new Builder(), r = rng(seed);
  for (let k = 0; k < count; k++) {
    const a = r() * Math.PI * 2, rad = spread * Math.sqrt(r());
    const col = pick(cols, Math.floor(r() * cols.length)), tip: Rgb = [Math.min(1, col[0] * 1.3 + 0.02), Math.min(1, col[1] * 1.3 + 0.02), Math.min(1, col[2] * 1.3 + 0.02)];
    blade(B, Math.cos(a) * rad, Math.sin(a) * rad, a + (r() - 0.5) * 0.9, hMin + r() * (hMax - hMin), 0.3 + r() * 0.9, width * (0.7 + r() * 0.6), col, tip);
  }
  return B.geometry();
}
function weedGeo(seed: number): THREE.BufferGeometry {
  const B = new Builder(), r = rng(seed);
  for (let k = 0; k < 5; k++) {
    const a = r() * Math.PI * 2;
    blade(B, Math.cos(a) * 0.03, Math.sin(a) * 0.03, a, 0.08 + r() * 0.08, 0.9, 0.02, pick(TUFT_COLS, k % 3), TUFT_COLS[1]);
  }
  for (let k = 0; k < 4; k++) {
    const a = r() * Math.PI * 2, h = 0.26 + r() * 0.16, lean = 0.12 + r() * 0.15;
    const x = Math.cos(a) * 0.02, z = Math.sin(a) * 0.02;
    blade(B, x, z, a, h, lean, 0.006, TUFT_COLS[1], TUFT_COLS[0]);
    spike(B, x + Math.cos(a) * lean * h, h * (1 - 0.3 * lean) - 0.02, z + Math.sin(a) * lean * h, 0.012, 0.06, HEAD_COL);
  }
  return B.geometry();
}
function reedGeo(seed: number): THREE.BufferGeometry {
  const B = new Builder(), r = rng(seed);
  for (let k = 0; k < 11; k++) {
    const a = r() * Math.PI * 2, rad = 0.08 * Math.sqrt(r());
    const col = pick(REED_COLS, Math.floor(r() * REED_COLS.length));
    blade(B, Math.cos(a) * rad, Math.sin(a) * rad, a, 0.3 + r() * 0.2, 0.15 + r() * 0.3, 0.014, col, lin([0.7, 0.62, 0.4]));
  }
  for (let k = 0; k < 2; k++) {
    const a = r() * Math.PI * 2, x = Math.cos(a) * 0.04, z = Math.sin(a) * 0.04, h = 0.36 + r() * 0.1;
    blade(B, x, z, a, h, 0.05, 0.005, REED_COLS[0], REED_COLS[1]);
    spike(B, x, h - 0.12, z, 0.014, 0.08, lin([0.24, 0.15, 0.08]));
  }
  return B.geometry();
}
// low shrub: brown twigs fanning out of the root, small leaves along them with sphere-like normals for soft shading
function shrubGeo(seed: number): THREE.BufferGeometry {
  const B = new Builder(), r = rng(seed), twig = lin([0.25, 0.18, 0.12]);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + r() * 0.6, el = 0.45 + r() * 0.7, len = 0.2 + r() * 0.12;
    const dx = Math.cos(a) * Math.cos(el), dy = Math.sin(el), dz = Math.sin(a) * Math.cos(el);
    blade(B, 0, 0, a, len * dy, Math.cos(el) / Math.max(0.3, dy), 0.008, twig, twig);
    for (let q = 0; q < 8; q++) {
      const t = 0.3 + (q / 8) * 0.8, cx = dx * len * t + (r() - 0.5) * 0.06, cy = dy * len * t + (r() - 0.5) * 0.05, cz = dz * len * t + (r() - 0.5) * 0.06;
      const nl = Math.hypot(cx, cy + 0.08, cz) || 1, col = scaled(pick(LEAF_COLS, Math.floor(r() * LEAF_COLS.length)), 0.6 + 0.4 * t);
      const la = r() * Math.PI * 2, lt = (r() - 0.3) * 1.2, s = 0.036 + r() * 0.02;
      const ux = Math.cos(la) * s, uz = Math.sin(la) * s, vy = Math.sin(lt) * s * 0.7, vx = -Math.sin(la) * s * 0.6, vz = Math.cos(la) * s * 0.6;
      const N: Vec3T = [cx / nl, (cy + 0.08) / nl, cz / nl];
      const p0 = B.v(cx - ux, cy - vy, cz - uz, ...N, col), p1 = B.v(cx + vx, cy, cz + vz, ...N, col);
      const p2 = B.v(cx + ux, cy + vy, cz + uz, ...N, col), p3 = B.v(cx - vx, cy, cz - vz, ...N, col);
      B.tri(p0, p1, p2); B.tri(p0, p2, p3);
    }
  }
  return B.geometry();
}

// ---- hard props ----
// noise-displaced smooth rock with a flattened base; vertex colour carries a little ambient occlusion
function rockGeo(detail: number, seed: number, squash: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(0.5, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const r = rng(seed), waves: Array<readonly [number, number, number, number, number, number]> = [];
  for (let k = 0; k < 5; k++) {
    const th = r() * Math.PI * 2, ph = Math.acos(r() * 2 - 1);
    waves.push([Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th), 2 + r() * 5, r() * 6.3, 0.16 / (1 + k * 0.6)]);
  }
  const p = g.getAttribute('position'), cols: number[] = [], uvs: number[] = [];
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let d = 1;
    for (const [kx, ky, kz, f, o, a] of waves) d += a * Math.sin((x * kx + y * ky + z * kz) * f + o);
    x *= d; z *= d; y *= d * squash;
    if (y < -0.1) y = -0.1 + (y + 0.1) * 0.25;
    p.setXYZ(i, x, y, z);
    const ao = 0.55 + 0.45 * Math.min(1, Math.max(0, (y + 0.1) / 0.35));
    cols.push(ao, ao, ao);
    uvs.push((x + z * 0.7) * 1.3, y * 1.3);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}
// faceted broken block (concrete chunk or brick): jittered box corners, flat shading, per-face planar uvs
function chunkGeo(sx: number, sy: number, sz: number, seed: number, jitter: number, segs: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.BoxGeometry(sx, sy, sz, segs, 1, segs);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  let p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), key = Math.round(x * 997 + y * 131 + z * 7919);
    p.setXYZ(i, x * (1 - hash2(key, seed, 1) * jitter), y * (1 - hash2(key, seed, 2) * jitter * (y > 0 ? 1.4 : 0.2)), z * (1 - hash2(key, seed, 3) * jitter));
  }
  g = g.toNonIndexed();
  g.computeVertexNormals();
  p = g.getAttribute('position');
  const n = g.getAttribute('normal'), uvs = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const [a, b]: [number, number] = ay >= ax && ay >= az ? [p.getX(i), p.getZ(i)] : ax >= az ? [p.getZ(i), p.getY(i)] : [p.getX(i), p.getY(i)];
    uvs[i * 2] = a * 1.6; uvs[i * 2 + 1] = b * 1.6;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(p.count * 3).fill(1), 3));
  return g;
}
// bent reinforcement bar
const bar = (pts: ReadonlyArray<Vec3T>, r = 0.011): THREE.TubeGeometry => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z))), 5, r, 3, false);
// broken floor slab (irregular outline, 7cm thick) and the rebar ends sticking out of two of its edges
function slabGeos(seed: number): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const r = rng(seed), shape = new THREE.Shape(), pts: Array<[number, number]> = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + (r() - 0.5) * 0.5, rad = 0.3 + r() * 0.2;
    const pt: [number, number] = [Math.cos(a) * rad, Math.sin(a) * rad];
    pts.push(pt);
    if (k) shape.lineTo(pt[0], pt[1]); else shape.moveTo(pt[0], pt[1]);
  }
  const slab = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false });
  slab.rotateX(-Math.PI / 2);
  // keep the cap inside one slab of the concrete texture so no expansion joint crosses the piece
  const suv = slab.getAttribute('uv');
  for (let i = 0; i < suv.count; i++) suv.setXY(i, suv.getX(i) * 0.45 + 0.25, suv.getY(i) * 0.45 + 0.25);
  const bars = [1, 4].map((k) => {
    const [x, y] = pts[k] ?? [0, 0], droop = 0.04 + r() * 0.08;
    return bar([[x * 0.8, 0.035, -y * 0.8], [x * 1.12, 0.04, -y * 1.12], [x * 1.3, 0.035 - droop * 0.4, -y * 1.3], [x * 1.42, 0.03 - droop, -y * 1.42]]);
  });
  const rebar = mergeGeometries(bars);
  bars.forEach((b) => b.dispose());
  return [slab, rebar];
}
// three bars sticking out of the ground and bent over at different angles
function rebarGeo(seed: number): THREE.BufferGeometry {
  const r = rng(seed), bars: THREE.TubeGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const a = r() * Math.PI * 2, x = (r() - 0.5) * 0.3, z = (r() - 0.5) * 0.3, h = 0.15 + r() * 0.2, bend = 0.08 + r() * 0.16, ba = a + (r() - 0.5);
    bars.push(bar([[x, -0.05, z], [x + Math.cos(a) * 0.02, h * 0.6, z + Math.sin(a) * 0.02], [x + Math.cos(ba) * bend * 0.4, h, z + Math.sin(ba) * bend * 0.4], [x + Math.cos(ba) * bend, h - bend * (0.3 + r() * 0.5), z + Math.sin(ba) * bend]]));
  }
  const g = mergeGeometries(bars);
  bars.forEach((b) => b.dispose());
  return g;
}
const lathe = (prof: ReadonlyArray<readonly [number, number]>, segs: number): THREE.LatheGeometry => new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), segs);
// car tyre lying flat: bead, bulging sidewalls, flat tread (blocks come from the envRubber texture), open centre
const tyreGeo = (): THREE.LatheGeometry => lathe([[0.13, 0], [0.138, -0.05], [0.165, -0.069], [0.2, -0.066], [0.222, -0.046], [0.229, -0.014], [0.229, 0.014], [0.222, 0.046], [0.2, 0.066], [0.165, 0.069], [0.138, 0.05], [0.13, 0]], 16);
// 200 l drum (scaled down to prop size) with two rolling hoops and a rim around the lid
const drumGeo = (): THREE.LatheGeometry => lathe([[0, 0], [0.15, 0], [0.158, 0.012], [0.158, 0.1], [0.167, 0.115], [0.158, 0.13], [0.158, 0.3], [0.167, 0.315], [0.158, 0.33], [0.158, 0.44], [0.162, 0.452], [0.15, 0.445], [0, 0.44]], 14);
// open-ended concrete pipe segment lying on its side: outer and inner shells plus the two end rings
function pipeGeo(): THREE.BufferGeometry {
  const outer = new THREE.CylinderGeometry(0.2, 0.2, 0.55, 16, 1, true);
  const inner = new THREE.CylinderGeometry(0.155, 0.155, 0.55, 16, 1, true);
  const innerIndex = inner.getIndex();
  if (!innerIndex) throw new Error('cylinder geometry without index');
  const idx = innerIndex.array;
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i] ?? 0; idx[i] = idx[i + 2] ?? 0; idx[i + 2] = t; }
  const nn = inner.getAttribute('normal');
  for (let i = 0; i < nn.count; i++) nn.setXYZ(i, -nn.getX(i), -nn.getY(i), -nn.getZ(i));
  const top = new THREE.RingGeometry(0.155, 0.2, 16), bottom = new THREE.RingGeometry(0.155, 0.2, 16);
  top.rotateX(-Math.PI / 2); top.translate(0, 0.275, 0);
  bottom.rotateX(Math.PI / 2); bottom.translate(0, -0.275, 0);
  const parts = [outer, inner, top, bottom];
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  g.rotateZ(Math.PI / 2);
  g.translate(0, 0.19, 0);
  return g;
}
// euro pallet: three bottom boards, three blocks/stringers, five top boards
function palletGeo(): THREE.BufferGeometry {
  const parts: THREE.BoxGeometry[] = [];
  const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number): void => { const b = new THREE.BoxGeometry(sx, sy, sz); b.translate(x, y, z); parts.push(b); };
  for (const z of [-0.22, 0, 0.22]) { box(0.6, 0.016, 0.08, 0, 0.008, z); box(0.6, 0.06, 0.07, 0, 0.046, z); }
  for (let k = 0; k < 5; k++) box(0.09, 0.016, 0.52, -0.255 + k * 0.1275, 0.084, 0);
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return g;
}

// The fog-of-war overlay is draped on the ground, so anything standing above it would show through unfogged.
// Prop materials therefore apply the same per-tile fog themselves (0 visible, ~0.5 explored, 1 unexplored).
interface PropFog {
  tex: { value: THREE.DataTexture };
  size: { value: THREE.Vector2 };
}

function fogAware(mat: THREE.Material, fog: PropFog, key: string): void {
  const inner = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    inner.call(mat, shader, renderer);
    shader.uniforms.tPropFog = fog.tex; shader.uniforms.uPropFogSize = fog.size;
    shader.vertexShader = 'varying vec2 vPropXZ;\n' + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      #ifdef USE_INSTANCING
      vPropXZ = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xz;
      #else
      vPropXZ = (modelMatrix * vec4(transformed, 1.0)).xz;
      #endif`);
    shader.fragmentShader = 'uniform sampler2D tPropFog;\nuniform vec2 uPropFogSize;\nvarying vec2 vPropXZ;\n' + shader.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      float propFog = texture2D(tPropFog, vPropXZ / uPropFogSize).r;
      gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.05, 0.055, 0.075), clamp(propFog * 0.95, 0.0, 0.985));`);
  };
  mat.customProgramCacheKey = () => key;
}

export function buildGroundProps(store: EmpireStore, heightAt: HeightAt, lib: TextureLib): GroundProps {
  const { w, h } = store.map;
  const codes = store.codes ?? new Uint8Array(w * h);
  const code = (x: number, y: number): number | undefined => (x < 0 || y < 0 || x >= w || y >= h ? -1 : codes[y * w + x]);
  const L: Record<'tuft' | 'tuftTall' | 'weed' | 'shrub' | 'reed' | 'pebble' | 'rock' | 'chunk' | 'brick' | 'slab' | 'rebar' | 'tyre' | 'drum' | 'pallet' | 'pipe', PropInstance[]> = {
    tuft: [], tuftTall: [], weed: [], shrub: [], reed: [], pebble: [], rock: [], chunk: [], brick: [], slab: [], rebar: [], tyre: [], drum: [], pallet: [], pipe: []
  };
  // entry: x, y, lift, rotX, rotY, rotZ, scaleX, scaleY, scaleZ[, r, g, b (sRGB tint)]
  const put = (list: PropInstance[], x: number, y: number, lift: number, rx: number, ry: number, rz: number, s: number, sy = s, col?: readonly number[]): number => list.push(col ? [x, y, lift, rx, ry, rz, s, sy, s, ...col] : [x, y, lift, rx, ry, rz, s, sy, s]);
  const plant = (list: PropInstance[], x: number, y: number, lift: number, ry: number, s: number, col?: Rgb): number => put(list, x, y, lift, 0, ry, 0, s, s, col);
  const greyCol = (k: number): Rgb => [0.4 + k * 0.25, 0.39 + k * 0.25, 0.37 + k * 0.23];
  const stoneCol = (k: number): Rgb => (k < 0.7 ? greyCol(k * 0.6) : k < 0.9 ? [0.5, 0.44, 0.36] : [0.28, 0.26, 0.25]);
  const mudStone = (k: number): Rgb => [0.3 + k * 0.12, 0.27 + k * 0.1, 0.23 + k * 0.08];
  const brickCol = (k: number): Rgb => (k < 0.75 ? [0.62, 0.3 + k * 0.08, 0.22] : [0.5, 0.45, 0.4]);
  const tint = (k: number): Rgb => [0.85 + k * 0.3, 0.88 + k * 0.2, 0.85 + k * 0.15];
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  const W = TILE_CODE.w, X = TILE_CODE.x;

  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const c = codes[ty * w + tx];
      const r = (k: number): number => hash2(tx, ty, k);
      const px = (k: number): number => tx + 0.08 + r(k) * 0.84, py = (k: number): number => ty + 0.08 + r(k + 1) * 0.84;
      const rot = (k: number): number => r(k) * Math.PI * 2;
      const nearGrass = DIRS.some(([dx, dy]) => code(tx + dx, ty + dy) === TILE_CODE.g);
      if (c === TILE_CODE.g) {
        for (let k = 0; k < 2; k++) if (r(10 + k * 7) > 0.62) plant(r(15 + k * 7) > 0.7 ? L.tuftTall : L.tuft, px(11 + k * 7), py(11 + k * 7), -0.01, rot(13 + k * 7), 0.75 + r(14 + k * 7) * 0.5, tint(r(16 + k * 7)));
        if (r(30) > 0.9) plant(L.weed, px(31), py(31), -0.01, rot(33), 0.8 + r(34) * 0.35);
        if (r(36) > 0.975) plant(L.shrub, px(37), py(37), -0.02, rot(39), 0.65 + r(40) * 0.4);
        if (r(42) > 0.94) put(L.pebble, px(43), py(43), 0.005, (r(45) - 0.5) * 0.6, rot(46), 0, 0.05 + r(47) * 0.05, undefined, stoneCol(r(48)));
        if (r(50) > 0.993) put(L.tyre, px(51), py(51), 0.03, (r(53) - 0.5) * 0.25, rot(54), 0, 0.95);
        if (r(56) > 0.985) put(L.brick, px(57), py(57), 0.02, 0, rot(59), 0, 1, undefined, brickCol(r(60)));
      } else if (c === TILE_CODE.d) {
        for (let k = 0; k < 2; k++) if (r(10 + k * 5) > 0.55) put(L.pebble, px(11 + k * 5), py(11 + k * 5), -0.005, (r(13 + k * 5) - 0.5) * 0.6, rot(14 + k * 5), 0, 0.04 + r(15 + k * 5) * 0.05, undefined, mudStone(r(16 + k * 5)));
        if (r(30) > 0.982) put(L.tyre, px(31), py(31), -0.01, (r(33) - 0.5) * 0.4, rot(34), (r(35) - 0.5) * 0.3, 0.95);
        if (nearGrass && r(40) > 0.6) plant(L.tuft, px(41), py(41), -0.01, rot(43), 0.6 + r(44) * 0.4, tint(r(45)));
      } else if (c === TILE_CODE.r) {
        for (let k = 0; k < 2; k++) if (r(10 + k * 5) > 0.6) put(L.pebble, px(11 + k * 5), py(11 + k * 5), 0, (r(13 + k * 5) - 0.5) * 0.6, rot(14 + k * 5), 0, 0.04 + r(15 + k * 5) * 0.05, undefined, stoneCol(r(16 + k * 5)));
        if (nearGrass && r(30) > 0.55) plant(L.tuft, px(31), py(31), -0.01, rot(33), 0.5 + r(34) * 0.4, tint(r(35)));
      } else if (c === TILE_CODE.c) {
        if (r(10) > 0.78) plant(L.tuft, px(11), py(11), -0.01, rot(13), 0.45 + r(14) * 0.3, tint(r(15)));
        if (r(20) > 0.9) put(L.brick, px(21), py(21), 0.02, 0, rot(23), 0, 1, undefined, brickCol(r(24)));
        if (r(26) > 0.92) put(L.chunk, px(27), py(27), 0.02, 0, rot(29), 0, 0.35 + r(30) * 0.25, 0.6, greyCol(r(31) * 0.5));
        if (r(32) > 0.985) put(L.pallet, px(33), py(33), 0, 0, rot(35), 0, 1);
      } else if (c === X) {
        for (let k = 0; k < 3; k++) put(L.chunk, px(10 + k * 6), py(10 + k * 6), 0.02, (r(12 + k * 6) - 0.5) * 0.5, rot(13 + k * 6), (r(14 + k * 6) - 0.5) * 0.5, 0.5 + r(15 + k * 6) * 0.6, 0.45 + r(15 + k * 6) * 0.5, greyCol(r(16 + k * 6) * 0.5));
        if (r(30) > 0.45) put(L.rock, px(31), py(31), 0.02, 0, rot(33), 0, 0.22 + r(34) * 0.2, undefined, stoneCol(r(35)));
        if (r(36) > 0.4) put(L.slab, px(37), py(37), 0.04, (r(39) - 0.5) * 0.5, rot(40), (r(41) - 0.5) * 0.5, 0.8 + r(42) * 0.5, 1);
        if (r(43) > 0.4) put(L.rebar, px(44), py(44), 0, 0, rot(46), 0, 0.8 + r(47) * 0.4);
        for (let k = 0; k < 4; k++) put(L.brick, px(50 + k * 5), py(50 + k * 5), 0.03, (r(52 + k * 5) - 0.5) * 0.8, rot(53 + k * 5), (r(54 + k * 5) - 0.5) * 0.8, 1, undefined, brickCol(r(54 + k * 5)));
        if (r(69) > 0.5) put(L.pebble, px(70), py(70), 0.01, (r(72) - 0.5) * 0.6, rot(73), 0, 0.06 + r(74) * 0.06, undefined, greyCol(r(75) * 0.4));
        if (r(85) > 0.86) { const lying = r(86) > 0.5; put(L.drum, px(87), py(87), lying ? 0.16 : 0, lying ? Math.PI / 2 : 0, rot(89), 0, 0.95, undefined, [[0.42, 0.48, 0.58], [0.6, 0.32, 0.24], [0.42, 0.47, 0.35], [0.62, 0.62, 0.6]][Math.floor(r(90) * 4)]); }
        if (r(91) > 0.9) put(L.pipe, px(92), py(92), 0, 0, rot(94), 0, 0.9 + r(95) * 0.2);
        if (r(96) > 0.92) put(L.pallet, px(97), py(97), 0.03, (r(99) - 0.5) * 0.3, rot(100), (r(101) - 0.5) * 0.3, 1);
        if (r(102) > 0.93) { const x = px(103), y = py(103); put(L.tyre, x, y, 0.06, 0, rot(105), 0, 0.95); put(L.tyre, x + 0.03, y - 0.02, 0.2, 0.1, rot(106), 0.05, 0.95); }
        if (r(107) > 0.8) plant(L.shrub, px(108), py(108), 0, rot(110), 0.7 + r(111) * 0.4);
        if (r(112) > 0.45) plant(L.weed, px(113), py(113), 0, rot(115), 0.8 + r(116) * 0.4);
        if (r(117) > 0.3) plant(L.tuft, px(118), py(118), 0, rot(120), 0.6 + r(121) * 0.5, tint(r(122)));
      }
      // reeds along shores: on the land side of the edge and standing in the shallows just inside the water tile
      if (c !== X) {
        for (const [dx, dy] of DIRS) {
          const nc = code(tx + dx, ty + dy);
          if (nc === -1 || (c === W) === (nc === W)) continue;
          const d = dx * 3 + dy * 7 + 20;
          for (let k = 0; k < 2; k++) {
            if (r(d * 10 + k * 3) < 0.45) continue;
            const along = (r(d * 10 + k * 3 + 1) - 0.5) * 0.9, depth = c === W ? 0.32 + r(d * 10 + k * 3 + 2) * 0.12 : 0.28 + r(d * 10 + k * 3 + 2) * 0.16;
            const x = tx + 0.5 + dx * depth + dy * along, y = ty + 0.5 + dy * depth + dx * along;
            plant(L.reed, x, y, -0.02, rot(d * 10 + k * 3 + 4), 0.75 + r(d * 10 + k * 3 + 5) * 0.3);
          }
        }
      }
    }
  }

  const wind = { value: 0 };
  const foliage = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.86, metalness: 0 });
  foliage.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind;
    shader.vertexShader = 'uniform float uWind;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      vec2 wp = instanceMatrix[3].xz;
      #else
      vec2 wp = vec2(0.0);
      #endif
      float wph = uWind * 1.6 + wp.x * 0.43 + wp.y * 0.31;
      float bend = transformed.y * transformed.y * 0.6;
      transformed.x += bend * (sin(wph) * 0.55 + sin(wph * 2.7 + 1.3) * 0.2);
      transformed.z += bend * sin(wph * 0.7 + 0.4) * 0.3;`);
    // thin double-sided blades keep their upward-tilted normal on both faces instead of going dark from behind
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize( vNormal );\n nonPerturbedNormal = normal;');
  };
  const rockSet = lib.set('envRock'), concSet = lib.set('concrete'), rubSet = lib.set('envRubber'), drumSet = lib.set('envDrum'), woodSet = lib.set('wood');
  const stone = new THREE.MeshStandardMaterial({ vertexColors: true, map: rockSet.map, normalMap: rockSet.normalMap, roughness: 0.92, metalness: 0 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0xc4bfb5, map: concSet.map, normalMap: concSet.normalMap, roughness: 0.92, metalness: 0 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x5c3421, roughness: 0.82, metalness: 0.35 });
  const rubber = new THREE.MeshStandardMaterial({ map: rubSet.map, normalMap: rubSet.normalMap, roughness: 0.9, metalness: 0 });
  const drum = new THREE.MeshStandardMaterial({ map: drumSet.map, normalMap: drumSet.normalMap, roughnessMap: drumSet.ormMap, metalnessMap: drumSet.ormMap, roughness: 1, metalness: 1 });
  const wood = new THREE.MeshStandardMaterial({ map: woodSet.map, normalMap: woodSet.normalMap, roughnessMap: woodSet.ormMap, roughness: 1, metalness: 0 });
  const fogData = new Uint8Array(w * h);
  const fogTex = new THREE.DataTexture(fogData, w, h, THREE.RedFormat, THREE.UnsignedByteType);
  fogTex.magFilter = fogTex.minFilter = THREE.LinearFilter;
  fogTex.needsUpdate = true;
  const fog = { tex: { value: fogTex }, size: { value: new THREE.Vector2(w, h) } };
  fogAware(foliage, fog, 'empire-foliage-wind-fog');
  for (const m of [stone, concrete, rust, rubber, drum, wood]) fogAware(m, fog, 'empire-prop-fog');
  let fogVer = -1;
  const disposables: Array<{ dispose(): void }> = [foliage, stone, concrete, rust, rubber, drum, wood, fogTex];

  const group = new THREE.Group();
  group.name = 'EmpireGroundProps';
  const tmp = new THREE.Object3D(), col = new THREE.Color();
  // large sets are split into map quadrants so the quarters off screen frustum-cull as a whole
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, all: PropInstance[], cast: boolean): void => {
    disposables.push(geo);
    const parts = all.length > 400 ? [0, 1, 2, 3].map((q) => all.filter((e) => (e[0] < w / 2 ? 0 : 1) + (e[1] < h / 2 ? 0 : 2) === q)) : [all];
    for (const list of parts) if (list.length) addMesh(geo, mat, list, cast);
  };
  const addMesh = (geo: THREE.BufferGeometry, mat: THREE.Material, list: PropInstance[], cast: boolean): void => {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((e, i) => {
      tmp.position.set(e[0], heightAt(e[0], e[1]) + e[2], e[1]);
      tmp.rotation.set(e[3], e[4], e[5]);
      tmp.scale.set(e[6], e[7], e[8]);
      tmp.updateMatrix();
      im.setMatrixAt(i, tmp.matrix);
      if (e.length > 9) im.setColorAt(i, col.setRGB(e[9] ?? 0, e[10] ?? 0, e[11] ?? 0, THREE.SRGBColorSpace));
    });
    im.castShadow = cast; im.receiveShadow = true;
    im.computeBoundingSphere();
    group.add(im);
  };
  add(tuftGeo(11, 16, 0.08, 0.2, 0.06, 0.01, TUFT_COLS), foliage, L.tuft, false);
  add(tuftGeo(23, 15, 0.15, 0.3, 0.08, 0.009, TUFT_COLS), foliage, L.tuftTall, false);
  add(weedGeo(31), foliage, L.weed, false);
  add(shrubGeo(41), foliage, L.shrub, false);
  add(reedGeo(53), foliage, L.reed, false);
  add(rockGeo(0, 61, 0.7), stone, L.pebble, false);
  add(rockGeo(1, 67, 0.62), stone, L.rock, true);
  add(chunkGeo(0.42, 0.2, 0.32, 71, 0.35, 2), stone, L.chunk, true);
  add(chunkGeo(0.2, 0.065, 0.1, 73, 0.18, 1), stone, L.brick, false);
  const [slab, slabBars] = slabGeos(79);
  add(slab, concrete, L.slab, true);
  add(slabBars, rust, L.slab, false);
  add(rebarGeo(83), rust, L.rebar, false);
  add(tyreGeo(), rubber, L.tyre, true);
  add(drumGeo(), drum, L.drum, true);
  add(pipeGeo(), concrete, L.pipe, true);
  add(palletGeo(), wood, L.pallet, true);

  return {
    group,
    update(time) {
      wind.value = time;
      const vis = store.visible;
      if (fogVer === store.fogVersion || !vis) return;
      fogVer = store.fogVersion;
      const exp = store.explored, spec = store.spectator;
      for (let i = 0; i < w * h; i++) fogData[i] = spec || vis[i] ? 0 : exp?.[i] ? 132 : 255;
      fogTex.needsUpdate = true;
    },
    dispose() {
      group.removeFromParent();
      for (const d of disposables) d.dispose();
    }
  };
}
