// A layoutból épülő statikus rétegek: domborzat-háló a heightfieldből, terepre simított utak / járdák /
// sínek, felületfoltok (sár, olaj, sav, tócsa), hexhatárok tisztaság szerinti színnel, zárt kerületek
// kordonszalagja és a hex-lámpák jeladói. Minden geometria és anyag az AssetCache-en át megy.
import * as THREE from 'three';
import { AssetCache } from '../engine/AssetCache';
import { sampleHeight } from './heightfield';
import { GRID_RADIUS, HEX_SIZE, cleanlinessColor, districtOf, hexCorner, hexDistance, hexToWorld, worldToHex } from './hexGrid';
import { beaconMaterial, groundMaterial, hazardTapeMaterial, surfaceMaterial, type GroundKind } from './materials';
import { LAMP_COLORS, lampIntensity, lampMode } from './lampState';
import type { Heightfield, LayoutBorder, LayoutProp, RoadKind, RoadPath, Surface, SurfaceKind, WorldLayout } from '../../worldTypes';
import type { HexSnapshot } from '../../types';

/** Stable cache key of a layout (identical for every room of one layout version). */
export function layoutKey(layout: WorldLayout): string {
  let h = 2166136261;
  const mix = (n: number): void => {
    h ^= n | 0;
    h = Math.imul(h, 16777619);
  };
  for (const v of layout.heightfield.heightsCm) mix(v);
  mix(layout.roads.length);
  for (const r of layout.roads) for (const [x, z] of r.points) mix(Math.round(x * 100) ^ Math.round(z * 100));
  mix(layout.buildings.length);
  mix(layout.props.length);
  mix(layout.surfaces.length);
  return `v${layout.version}.${(h >>> 0).toString(36)}`;
}

/** District signature of the hex list (part of terrain / border cache keys). */
export const hexesKey = (hexes: readonly HexSnapshot[]): string => hexes.map((h) => `${h.q},${h.r}:${h.district}`).join(';');

/** Ground cover colour per district (roads are draped on top). */
const DISTRICT_GROUND = [0x6b665c, 0x5a5f45, 0x77746c, 0x5a4c40, 0x7d7a72, 0x3f6a32] as const;
const OUTSIDE_GROUND = 0x4d5a3c;

const ROAD_LIFT: Readonly<Record<RoadKind, number>> = { road: 0.04, sidewalk: 0.08, path: 0.03, rail: 0.06, stairs: 0.05 };
const RAIL_GAUGE_HALF = 0.72;
const SLEEPER_SPACING = 0.65;
const RESAMPLE_M = 2;

type Ground = (x: number, z: number) => number;

function terrainGeometry(hf: Heightfield, districtAt: (x: number, z: number) => number | null): THREE.BufferGeometry {
  const sub = 2;
  const n = (hf.size - 1) * sub + 1;
  const step = hf.cell / sub;
  const positions = new Float32Array(n * n * 3);
  const colors = new Float32Array(n * n * 3);
  const uvs = new Float32Array(n * n * 2);
  const c = new THREE.Color();
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const i = iz * n + ix;
      const x = hf.origin + ix * step;
      const z = hf.origin + iz * step;
      positions[i * 3] = x;
      positions[i * 3 + 1] = sampleHeight(hf, x, z);
      positions[i * 3 + 2] = z;
      const d = districtAt(x, z);
      c.setHex(d === null ? OUTSIDE_GROUND : DISTRICT_GROUND[d] ?? OUTSIDE_GROUND, THREE.SRGBColorSpace);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      uvs[i * 2] = ix / (n - 1);
      uvs[i * 2 + 1] = iz / (n - 1);
    }
  }
  const index = new Uint32Array((n - 1) * (n - 1) * 6);
  let k = 0;
  for (let iz = 0; iz < n - 1; iz++) {
    for (let ix = 0; ix < n - 1; ix++) {
      const a = iz * n + ix;
      const b = a + 1;
      const d = a + n;
      const e = d + 1;
      // counter-clockwise seen from above (+Y)
      index[k++] = a; index[k++] = d; index[k++] = b;
      index[k++] = b; index[k++] = d; index[k++] = e;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Polyline resampled to ≤ RESAMPLE_M steps with unit tangents. */
function resample(points: RoadPath['points']): { x: number; z: number; tx: number; tz: number; s: number }[] {
  const out: { x: number; z: number; tx: number; tz: number; s: number }[] = [];
  let s = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-4) continue;
    const steps = Math.max(1, Math.ceil(len / RESAMPLE_M));
    for (let k = i === 0 ? 0 : 1; k <= steps; k++) {
      const t = k / steps;
      out.push({ x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, tx: (b[0] - a[0]) / len, tz: (b[1] - a[1]) / len, s: s + len * t });
    }
    s += len;
  }
  // average tangents at joints so ribbons do not crack at corners
  for (let i = 1; i < out.length - 1; i++) {
    const p = out[i - 1];
    const c = out[i];
    const n = out[i + 1];
    if (!p || !c || !n) continue;
    const tx = n.x - p.x;
    const tz = n.z - p.z;
    const l = Math.hypot(tx, tz) || 1;
    out[i] = { ...c, tx: tx / l, tz: tz / l };
  }
  return out;
}

interface RibbonBuffers {
  positions: number[];
  uvs: number[];
  index: number[];
}

/** Appends a terrain-draped ribbon (3 vertices across) between offsets `left`..`right` from the centreline. */
function appendRibbon(buf: RibbonBuffers, samples: ReturnType<typeof resample>, left: number, right: number, lift: number, ground: Ground): void {
  const base = buf.positions.length / 3;
  for (const p of samples) {
    // left-hand normal of the tangent in XZ
    const nx = -p.tz;
    const nz = p.tx;
    for (const [o, u] of [[left, 0], [(left + right) / 2, 0.5], [right, 1]] as const) {
      const x = p.x + nx * o;
      const z = p.z + nz * o;
      buf.positions.push(x, ground(x, z) + lift, z);
      buf.uvs.push(u, p.s);
    }
  }
  for (let i = 0; i < samples.length - 1; i++) {
    const a = base + i * 3;
    const b = a + 3;
    for (let j = 0; j < 2; j++) {
      // counter-clockwise from above when `left` > `right`
      buf.index.push(a + j, b + j, a + j + 1, a + j + 1, b + j, b + j + 1);
    }
  }
}

function ribbonGeometry(buf: RibbonBuffers): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(buf.positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uvs, 2));
  g.setIndex(buf.index);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

function discGeometry(surfaces: readonly Surface[], ground: Ground): THREE.BufferGeometry {
  const positions: number[] = [];
  const index: number[] = [];
  const rim = 20;
  const rings = 3;
  for (const s of surfaces) {
    const base = positions.length / 3;
    positions.push(s.x, ground(s.x, s.z) + 0.05, s.z);
    for (let ring = 1; ring <= rings; ring++) {
      const rr = (s.r * ring) / rings;
      for (let i = 0; i < rim; i++) {
        const a = (i / rim) * Math.PI * 2;
        // a little wobble keeps the patches from looking stamped
        const wob = ring === rings ? 0.85 + 0.15 * Math.sin(a * 3 + s.x) : 1;
        const x = s.x + Math.cos(a) * rr * wob;
        const z = s.z + Math.sin(a) * rr * wob;
        positions.push(x, ground(x, z) + 0.05, z);
      }
    }
    for (let i = 0; i < rim; i++) index.push(base, base + 1 + ((i + 1) % rim), base + 1 + i);
    for (let ring = 1; ring < rings; ring++) {
      const r0 = base + 1 + (ring - 1) * rim;
      const r1 = r0 + rim;
      for (let i = 0; i < rim; i++) {
        const j = (i + 1) % rim;
        index.push(r0 + i, r0 + j, r1 + i, r0 + j, r1 + j, r1 + i);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const staticMesh = (geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
};

/** Terrain, roads, rails and surface patches. */
export class GroundLayers {
  readonly root = new THREE.Group();
  readonly #owned: THREE.InstancedMesh[] = [];

  constructor(layout: WorldLayout, key: string, hexKey: string, districtAt: (x: number, z: number) => number | null) {
    this.root.name = 'ground-layers';
    const cache = AssetCache.get();
    const hf = layout.heightfield;
    const ground: Ground = (x, z) => sampleHeight(hf, x, z);
    const terrain = cache.geometry(`terrain.${key}.${hexKey}`, () => terrainGeometry(hf, districtAt));
    this.root.add(staticMesh(terrain, groundMaterial('terrain'), 'terrain'));

    const byKind = new Map<RoadKind, RoadPath[]>();
    for (const r of layout.roads) {
      const list = byKind.get(r.kind);
      if (list) list.push(r);
      else byKind.set(r.kind, [r]);
    }
    for (const [kind, roads] of byKind) {
      const geometry = cache.geometry(`road.${kind}.${key}`, () => {
        const buf: RibbonBuffers = { positions: [], uvs: [], index: [] };
        for (const r of roads) {
          const w = kind === 'rail' ? Math.max(r.width, 3.2) : r.width;
          appendRibbon(buf, resample(r.points), w / 2, -w / 2, ROAD_LIFT[kind], ground);
        }
        return ribbonGeometry(buf);
      });
      this.root.add(staticMesh(geometry, groundMaterial(kind satisfies GroundKind), `road.${kind}`));
    }

    const rails = byKind.get('rail');
    if (rails) {
      const steel = cache.geometry(`rail.steel.${key}`, () => {
        const buf: RibbonBuffers = { positions: [], uvs: [], index: [] };
        for (const r of rails) {
          const samples = resample(r.points);
          for (const side of [-1, 1]) appendRibbon(buf, samples, side * RAIL_GAUGE_HALF + 0.04, side * RAIL_GAUGE_HALF - 0.04, 0.24, ground);
        }
        return ribbonGeometry(buf);
      });
      const steelMat = cache.material('rail.steel', () => new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.35, metalness: 0.85 }));
      this.root.add(staticMesh(steel, steelMat, 'rail.steel'));

      const sleeperGeo = cache.geometry('rail.sleeper', () => new THREE.BoxGeometry(2.4, 0.14, 0.24));
      const sleeperMat = cache.material('rail.sleeper', () => new THREE.MeshStandardMaterial({ color: 0x4a3828, roughness: 0.95 }));
      const transforms: THREE.Matrix4[] = [];
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      for (const r of rails) {
        const samples = resample(r.points);
        let next = 0;
        for (const p of samples) {
          if (p.s < next) continue;
          next = p.s + SLEEPER_SPACING;
          q.setFromAxisAngle(up, Math.atan2(p.tx, p.tz));
          transforms.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, ground(p.x, p.z) + 0.12, p.z), q, new THREE.Vector3(1, 1, 1)));
        }
      }
      const sleepers = new THREE.InstancedMesh(sleeperGeo, sleeperMat, Math.max(1, transforms.length));
      transforms.forEach((t, i) => sleepers.setMatrixAt(i, t));
      sleepers.count = transforms.length;
      sleepers.name = 'rail.sleepers';
      sleepers.receiveShadow = true;
      sleepers.computeBoundingSphere();
      this.root.add(sleepers);
      this.#owned.push(sleepers);
    }

    const surfaceKinds = new Map<SurfaceKind, Surface[]>();
    for (const s of layout.surfaces) {
      const list = surfaceKinds.get(s.kind);
      if (list) list.push(s);
      else surfaceKinds.set(s.kind, [s]);
    }
    for (const [kind, list] of surfaceKinds) {
      const geometry = cache.geometry(`surface.${kind}.${key}`, () => discGeometry(list, ground));
      const mesh = staticMesh(geometry, surfaceMaterial(kind), `surface.${kind}`);
      mesh.renderOrder = 2;
      this.root.add(mesh);
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const m of this.#owned) m.dispose();
  }
}

const HEX_DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]] as const;
const BORDER_SEGMENTS = 10;

/** Hex outlines draped on the terrain; colour by cleanliness (red < 50, orange 50–89, green ≥ 90). */
export class HexBorderLayer {
  readonly root: THREE.Mesh;
  readonly #colors: THREE.BufferAttribute;
  readonly #vertsPerHex = 6 * (BORDER_SEGMENTS + 1) * 2;
  readonly #order: string[];

  constructor(hexes: readonly HexSnapshot[], key: string, ground: Ground) {
    const cache = AssetCache.get();
    this.#order = hexes.map((h) => `${h.q},${h.r}`);
    const geometry = cache.geometry(`hex.borders.${key}.${hexesKey(hexes)}`, () => {
      const positions: number[] = [];
      const index: number[] = [];
      for (const hex of hexes) {
        const c = hexToWorld(hex.q, hex.r);
        for (let e = 0; e < 6; e++) {
          const base = positions.length / 3;
          for (let k = 0; k <= BORDER_SEGMENTS; k++) {
            const t = k / BORDER_SEGMENTS;
            for (const r of [HEX_SIZE - 0.4, HEX_SIZE - 1.4]) {
              const a = hexCorner(c.x, c.z, e, r);
              const b = hexCorner(c.x, c.z, (e + 1) % 6, r);
              const x = a.x + (b.x - a.x) * t;
              const z = a.z + (b.z - a.z) * t;
              positions.push(x, ground(x, z) + 0.07, z);
            }
          }
          for (let k = 0; k < BORDER_SEGMENTS; k++) {
            const o = base + k * 2;
            index.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
          }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      // per-session colour state: rewritten from the hex list on every init (see setHexes)
      g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(positions.length), 3));
      g.setIndex(index);
      g.computeBoundingSphere();
      return g;
    });
    const material = cache.material('hex.borders', () => new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
      // Transparent + DoubleSide is drawn as two passes unless forced single (keeps the draw budget exact).
      forceSinglePass: true,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3
    }));
    const colors = geometry.getAttribute('color');
    if (!(colors instanceof THREE.BufferAttribute)) throw new Error('hex border geometry without colours');
    this.#colors = colors;
    this.root = new THREE.Mesh(geometry, material);
    this.root.name = 'hex-borders';
    this.root.renderOrder = 1;
    this.setHexes(hexes);
  }

  setHexes(hexes: readonly HexSnapshot[]): void {
    for (const hex of hexes) this.setCleanliness(hex.q, hex.r, hex.cleanliness);
  }

  setCleanliness(q: number, r: number, cleanliness: number): void {
    const i = this.#order.indexOf(`${q},${r}`);
    if (i < 0) return;
    const c = new THREE.Color(cleanlinessColor(cleanliness));
    for (let v = 0; v < this.#vertsPerHex; v++) this.#colors.setXYZ(i * this.#vertsPerHex + v, c.r, c.g, c.b);
    this.#colors.needsUpdate = true;
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}

/** Edge endpoints of a border: midpoint ± len/2 along local x = (cos θ, −sin θ). */
export function borderSegment(b: LayoutBorder): [number, number, number, number] {
  const hx = (Math.cos(b.rotY) * b.len) / 2;
  const hz = (-Math.sin(b.rotY) * b.len) / 2;
  return [b.x - hx, b.z - hz, b.x + hx, b.z + hz];
}

/** Borders between grid hexes of different districts, for layouts that do not send `borders`. */
export function bordersFromHexes(hexes: readonly HexSnapshot[]): LayoutBorder[] {
  const byAxial = new Map(hexes.map((h) => [`${h.q},${h.r}`, h]));
  const out: LayoutBorder[] = [];
  for (const hex of hexes) {
    const c = hexToWorld(hex.q, hex.r);
    HEX_DIRS.forEach(([dq, dr], e) => {
      const n = byAxial.get(`${hex.q + dq},${hex.r + dr}`);
      if (!n || n.district <= hex.district) return; // each pair once, a < b
      const p = hexCorner(c.x, c.z, e);
      const q = hexCorner(c.x, c.z, (e + 1) % 6);
      out.push({ a: hex.district, b: n.district, x: (p.x + q.x) / 2, z: (p.z + q.z) / 2, rotY: Math.atan2(-(q.z - p.z), q.x - p.x), len: Math.hypot(q.x - p.x, q.z - p.z) });
    });
  }
  return out;
}

/** Outskirts rings that still reach the ±300 m playable bounds (corner distance ≈ 424 m ≈ 6.1 rings). */
const OUTSKIRTS_RING = 7;
const PLAY_HALF_EXTENT = 300;
const ORIGIN = { q: 0, r: 0 };

/**
 * District borders outside the 37 grid hexes: the lock applies per sector there too (backend
 * `districtAt`), but `layout.borders` covers only the grid. Edges with a midpoint beyond the playable
 * bounds are left out.
 */
export function outskirtsBorders(): LayoutBorder[] {
  const out: LayoutBorder[] = [];
  for (let q = -OUTSKIRTS_RING; q <= OUTSKIRTS_RING; q++) {
    for (let r = -OUTSKIRTS_RING; r <= OUTSKIRTS_RING; r++) {
      if (hexDistance({ q, r }, ORIGIN) > OUTSKIRTS_RING) continue;
      const district = districtOf(q, r);
      const c = hexToWorld(q, r);
      HEX_DIRS.forEach(([dq, dr], e) => {
        const n = { q: q + dq, r: r + dr };
        const other = districtOf(n.q, n.r);
        if (other <= district) return; // each pair once, a < b
        if (hexDistance({ q, r }, ORIGIN) <= GRID_RADIUS && hexDistance(n, ORIGIN) <= GRID_RADIUS) return; // in layout.borders
        const p = hexCorner(c.x, c.z, e);
        const p2 = hexCorner(c.x, c.z, (e + 1) % 6);
        const x = (p.x + p2.x) / 2;
        const z = (p.z + p2.z) / 2;
        if (Math.abs(x) > PLAY_HALF_EXTENT || Math.abs(z) > PLAY_HALF_EXTENT) return;
        out.push({ a: district, b: other, x, z, rotY: Math.atan2(-(p2.z - p.z), p2.x - p.x), len: Math.hypot(p2.x - p.x, p2.z - p.z) });
      });
    }
  }
  return out;
}

/** True when exactly one side of the border is open: that is where the tape goes. */
export const tapedBorder = (b: LayoutBorder, unlocked: ReadonlySet<number>): boolean => unlocked.has(b.a) !== unlocked.has(b.b);

/**
 * Hazard tape (two striped bands on posts) along every district border with exactly one side
 * unlocked. Visual only: the lock itself is enforced by the movement rules, so this adds no colliders.
 */
export class LockedTapeLayer {
  readonly root = new THREE.Group();
  #mesh: THREE.Mesh | null = null;
  #taped = 0;
  readonly #key: string;
  readonly #borders: readonly LayoutBorder[];
  readonly #ground: Ground;

  constructor(key: string, borders: readonly LayoutBorder[], ground: Ground) {
    this.root.name = 'locked-tape-layer';
    this.#key = key;
    this.#borders = borders;
    this.#ground = ground;
  }

  update(unlocked: ReadonlySet<number>): void {
    const edges = this.#borders.filter((b) => tapedBorder(b, unlocked)).map(borderSegment);
    this.#taped = edges.length;
    const unlockedKey = [...unlocked].sort((a, b) => a - b).join(',');
    const ground = this.#ground;
    const geometry = AssetCache.get().geometry(`locked.tape.${this.#key}.${unlockedKey}`, () => tapeGeometry(edges, ground));
    if (this.#mesh) this.#mesh.removeFromParent();
    this.#mesh = new THREE.Mesh(geometry, hazardTapeMaterial());
    this.#mesh.name = 'locked-tape';
    this.#mesh.castShadow = false; // thin bands; a caster would cost a draw in each of the 3 shadow passes
    this.#mesh.visible = edges.length > 0;
    this.root.add(this.#mesh);
  }

  /** Borders currently taped. */
  get taped(): number {
    return this.#taped;
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}

function tapeGeometry(edges: readonly [number, number, number, number][], ground: Ground): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  const quad = (p: readonly [number, number, number][], u0: number, u1: number, v: number): void => {
    const base = positions.length / 3;
    for (const [x, y, z] of p) positions.push(x, y, z);
    uvs.push(u0, v, u1, v, u1, v, u0, v);
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (const [ax, az, bx, bz] of edges) {
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.round(len / 4));
    for (let k = 0; k < steps; k++) {
      const t0 = k / steps;
      const t1 = (k + 1) / steps;
      const x0 = ax + (bx - ax) * t0;
      const z0 = az + (bz - az) * t0;
      const x1 = ax + (bx - ax) * t1;
      const z1 = az + (bz - az) * t1;
      const g0 = ground(x0, z0);
      const g1 = ground(x1, z1);
      for (const [lo, hi] of [[0.55, 0.65], [0.95, 1.05]] as const) {
        quad([[x0, g0 + lo, z0], [x1, g1 + lo, z1], [x1, g1 + hi, z1], [x0, g0 + hi, z0]], len * t0, len * t1, 0.5);
      }
      // post: two crossed quads, sampled inside a yellow stripe
      for (const [dx, dz] of [[0.05, 0], [0, 0.05]] as const) {
        quad([[x0 - dx, g0, z0 - dz], [x0 + dx, g0, z0 + dz], [x0 + dx, g0 + 1.1, z0 + dz], [x0 - dx, g0 + 1.1, z0 - dz]], 0.05, 0.05, 0.5);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Height of the beacon above the lamp base (hex_lamp archetype head + 0.6 m). */
export const BEACON_HEIGHT = 7.75;

/** Spec 24 beacons on the hex lamps: strobing yellow < 50, steady orange 50–89, bright green ≥ 90. */
export class HexBeaconLayer {
  readonly root: THREE.InstancedMesh;
  /** Beacon i -> hex "q,r". */
  readonly #hexOf: string[] = [];
  readonly #clean = new Map<string, number>();
  readonly #color = new THREE.Color();

  constructor(lamps: readonly LayoutProp[], ground: Ground) {
    const cache = AssetCache.get();
    const geometry = cache.geometry('beacon.core', () => new THREE.SphereGeometry(0.32, 12, 8));
    this.root = new THREE.InstancedMesh(geometry, beaconMaterial(), Math.max(1, lamps.length));
    this.root.name = 'hex-beacons';
    const m = new THREE.Matrix4();
    lamps.forEach((lamp, i) => {
      const { q, r } = worldToHex(lamp.x, lamp.z);
      this.#hexOf.push(`${q},${r}`);
      this.root.setMatrixAt(i, m.makeTranslation(lamp.x, ground(lamp.x, lamp.z) + BEACON_HEIGHT * lamp.s, lamp.z));
      this.root.setColorAt(i, this.#color.setHex(LAMP_COLORS.strobe));
    });
    this.root.count = lamps.length;
    this.root.computeBoundingSphere();
  }

  setCleanliness(q: number, r: number, cleanliness: number): void {
    this.#clean.set(`${q},${r}`, cleanliness);
  }

  /** Per-frame colour (strobe) update. */
  update(timeSec: number): void {
    const colors = this.root.instanceColor;
    if (!colors) return;
    this.#hexOf.forEach((hex, i) => {
      const mode = lampMode(this.#clean.get(hex) ?? 0);
      const k = lampIntensity(mode, timeSec, i * 0.137) * (mode === 'clean' ? 2.2 : 1.8);
      this.root.setColorAt(i, this.#color.setHex(LAMP_COLORS[mode]).multiplyScalar(k));
    });
    colors.needsUpdate = true;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.dispose();
  }
}
