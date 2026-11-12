// Shared toolkit for the procedural models: cached primitive geometry, PBR materials and the assembler
// that turns a list of parts into instancing-ready merged geometry.
//
// A model is a list of parts placed either in model space or on a joint. Parts that end up on the same
// (joint, material, tint group) are merged into one geometry with baked vertex colours, so a detailed
// model still costs only a handful of instanced draw calls. Joints form a small skeleton (hip -> knee,
// shoulder -> elbow, wheel hubs, cranes); the renderer poses them per instance every frame.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2 } from './textures.ts';
import type { TextureLib, TextureSetOptions } from './textures.ts';
import type { Batch } from './batcher.ts';

export const PI = Math.PI;
export const HALF = PI / 2;

export type Vec3T = readonly [number, number, number];
export type Axis = 'x' | 'y' | 'z';

/** Keys of the shared material set (see buildMaterials). */
export type MatKey =
  | 'rust' | 'sheet' | 'copper' | 'steel' | 'crumble' | 'plaster' | 'panel' | 'concrete' | 'brick' | 'wood' | 'planks'
  | 'roofTile' | 'bitumen' | 'burlap' | 'cloth' | 'paint' | 'matte' | 'satin' | 'metal' | 'glass' | 'glassLit' | 'chrome'
  | 'gold' | 'headlight' | 'taillight' | 'lamp' | 'fire' | 'cargo' | 'flag' | 'decal' | 'sign' | 'debris';
export type Mats = Record<MatKey, THREE.MeshStandardMaterial>;

/** Options of P(): see the comment above P. */
export interface PartOptions {
  r?: Vec3T | undefined;
  s?: number | Vec3T | undefined;
  c?: number | undefined;
  j?: string | null | undefined;
  team?: boolean | undefined;
  cargo?: boolean | undefined;
  scaffold?: boolean | undefined;
  keepUV?: boolean | undefined;
  shade?: number | undefined;
  uvo?: readonly [number, number] | null | undefined;
}

/** A part before assembly: geometry, material key and its placement (mutable while a model is built). */
export interface RawPart {
  g: THREE.BufferGeometry;
  mat: MatKey;
  m: THREE.Matrix4;
  c: number;
  shade: number;
  uvo: readonly [number, number] | null;
  j: string | null;
  team: boolean;
  cargo: boolean;
  scaffold: boolean;
  keepUV: boolean;
}

/** Nested lists of parts, flattened by flattenParts. */
export type PartTree = RawPart | readonly PartTree[];

export interface JointDef {
  parent?: string | undefined;
  p: Vec3T;
  rest?: Vec3T | undefined;
  src?: string | null | undefined;
  axis?: Axis | undefined;
  hold?: number | undefined;
  swing?: number | undefined;
  actBase?: number | undefined;
  actAmp?: number | undefined;
  actPh?: number | undefined;
  share?: string | undefined;
}
export type JointDefs = Record<string, JointDef>;

export interface Emitter {
  type: 'smoke' | 'fire' | 'weld';
  p: Vec3T;
  rate: number;
  dark?: boolean;
  scale?: number;
}

export interface ModelMeta {
  top: number;
  radius: number;
  emitters?: Emitter[];
  size?: number;
  vehicle?: boolean;
  grime?: number;
  joints?: JointDefs;
}

/** A posable joint of a finished model; scene.ts poses the skeleton per instance. */
export interface Joint {
  parent: number;
  p: THREE.Vector3;
  rest: THREE.Quaternion | null;
  src: string | null;
  axis: Axis;
  hold: number;
  swing: number;
  actBase: number;
  actAmp: number;
  actPh: number;
}

export interface ModelPart {
  geo: THREE.BufferGeometry;
  mat: THREE.MeshStandardMaterial;
  team: boolean;
  cargo: boolean;
  scaffold: boolean;
  /** index of the joint the part rides on, or -1 */
  ji: number;
  /** instanced batch, cached by the renderer */
  batch?: Batch;
}

export interface Model {
  parts: ModelPart[];
  joints: Joint[];
  top: number;
  radius: number;
  emitters: Emitter[];
  size: number;
  vehicle: boolean;
}

export function flattenParts(tree: readonly PartTree[]): RawPart[] {
  const out: RawPart[] = [];
  const walk = (t: PartTree): void => {
    if (Array.isArray(t)) for (const x of t) walk(x);
    else out.push(t as RawPart);
  };
  for (const t of tree) walk(t);
  return out;
}

// Flat colours baked into vertices (sRGB hex). Textured materials are tinted by them as well.
export const COL = {
  white: 0xffffff, offWhite: 0xd9d4c7, cream: 0xcfc3a4, black: 0x16161a, char: 0x26262a, dark: 0x34332f,
  grey: 0x77787c, lightGrey: 0xa9aaad, coat: 0x4b473f, khaki: 0x7b7252, olive: 0x4f5536, navy: 0x27314a,
  denim: 0x3a4a6b, denimDark: 0x252e44, brown: 0x5a3d26, leather: 0x4f2f1b, tan: 0x9a7650, sand: 0xab9770,
  skin: 0xc7936f, skinDark: 0x9a6a48, skinPale: 0xd7ab8b, hair: 0x241a13, hairGrey: 0x8d8a84, hairBrown: 0x4b2f1a,
  red: 0xa3241d, hivis: 0xf07a14, yellow: 0xe0a91c, green: 0x4f7a3a, leaf: 0x587832, blue: 0x2f5f9a,
  horse: 0x5b3b24, horseDark: 0x2a1a10, hay: 0xc4a557, straw: 0xd6bd74, rubber: 0x18181a, tyre: 0x202022,
  iron: 0x55585e, rustTint: 0x8a4a2a, soot: 0x2b2826, bone: 0xe7e0cf, pink: 0xc98f8a, teal: 0x4a8a84,
  plasterYellow: 0xd7c592, plasterPink: 0xcfa693, plasterGreen: 0xa9b79a, plasterBlue: 0x9db0bd, plasterGrey: 0xb9b6ad
};

const _c = new THREE.Color();
const WHITE = new THREE.Color(1, 1, 1);
const AXIS = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();
const _v = new THREE.Vector3();
const _e = new THREE.Euler();
const smooth = (a: number, b: number, t: number): number => { const k = Math.max(0, Math.min(1, (t - a) / (b - a))); return k * k * (3 - 2 * k); };

export function matrixOf(p: Vec3T = [0, 0, 0], r: Vec3T = [0, 0, 0], s: Vec3T = [1, 1, 1]): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(p[0], p[1], p[2]), new THREE.Quaternion().setFromEuler(_e.set(r[0], r[1], r[2])), new THREE.Vector3(s[0], s[1], s[2]));
}

// Move a finished sub-assembly (parts in model space) as one piece.
export function place(parts: RawPart[], p: Vec3T, r: Vec3T = [0, 0, 0], s: number | Vec3T = [1, 1, 1]): RawPart[] {
  const m = matrixOf(p, r, typeof s === 'number' ? [s, s, s] : s);
  for (const part of parts) {
    if (part.j) throw new Error('place() cannot move parts that sit on a joint');
    part.m.premultiply(m);
  }
  return parts;
}

// `base` is the full-detail kit when building the low-detail one: the distant version shares its materials,
// uses coarser primitives and leaves out parts too small to see from far away.
export interface Geometries {
  box(w: number, h: number, d: number): THREE.BufferGeometry;
  rbox(w: number, h: number, d: number, r?: number, seg?: number): THREE.BufferGeometry;
  cyl(r: number, h: number, seg?: number, rt?: number, open?: boolean): THREE.CylinderGeometry;
  sph(r?: number, ws?: number, hs?: number): THREE.SphereGeometry;
  dome(r?: number, ws?: number, hs?: number, cut?: number): THREE.SphereGeometry;
  cone(r: number, h: number, seg?: number): THREE.ConeGeometry;
  torus(r: number, t: number, rs?: number, ts?: number, arc?: number): THREE.TorusGeometry;
  capsule(r: number, len: number, seg?: number): THREE.CapsuleGeometry;
  lathe(profile: ReadonlyArray<readonly [number, number]>, seg?: number): THREE.LatheGeometry;
  rock(r: number, seed?: number, detail?: number, rough?: number): THREE.BufferGeometry;
  prism(w: number, h: number, d: number): THREE.ExtrudeGeometry;
  extrude(pts: ReadonlyArray<readonly [number, number]>, width: number, bevel?: number, key?: string): THREE.ExtrudeGeometry;
  slab(w: number, h: number): THREE.PlaneGeometry;
  corr(w: number, h: number, ridge?: number, depth?: number): THREE.PlaneGeometry;
  tube(pts: ReadonlyArray<Vec3T>, r?: number, radial?: number, sag?: number): THREE.TubeGeometry;
  card(w: number, h: number, k: number, cols: number, rows: number): THREE.PlaneGeometry;
  cloth(w: number, h: number, sx?: number, sy?: number): THREE.PlaneGeometry;
}

export type PartFactory = (g: THREE.BufferGeometry, m: MatKey, p: Vec3T, x?: PartOptions) => RawPart;

export interface Kit {
  G: Geometries;
  P: PartFactory;
  mats: Mats;
  wind: { value: number };
  finalize(raw: readonly RawPart[], jointDefs: JointDefs | null, meta: ModelMeta): Model;
  setTime(t: number): void;
  dispose(): void;
}

export function createKit(lib: TextureLib, base: Kit | null = null): Kit {
  const low = !!base;
  const q = (n: number, min = 3): number => (low ? Math.max(min, Math.round(n * 0.55)) : n);
  const geos = new Map<string, THREE.BufferGeometry>();
  const owned: Array<{ dispose(): void }> = [];
  const cache = <T extends THREE.BufferGeometry>(key: string, make: () => T): T => {
    const hit = geos.get(key);
    if (hit) return hit as T;
    const g = make();
    geos.set(key, g);
    return g;
  };

  // ---------------- primitives (all cached by their parameters) ----------------
  const G: Geometries = {
    box: (w, h, d) => cache(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d)),
    // box with softened edges; catches highlights like a real moulded or worn object
    rbox: (w, h, d, r = 0.01, seg = 1) => cache(`rbox:${w}:${h}:${d}:${r}:${seg}`, () => (low ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)))),
    cyl: (r, h, seg = 12, rt = r, open = false) => cache(`cyl:${r}:${h}:${seg}:${rt}:${open}`, () => new THREE.CylinderGeometry(rt, r, h, q(seg), 1, open)),
    sph: (r = 1, ws = 12, hs = 8) => cache(`sph:${r}:${ws}:${hs}`, () => new THREE.SphereGeometry(r, q(ws, 5), q(hs, 4))),
    // upper part of a sphere down to polar angle `cut` (HALF = hemisphere)
    dome: (r = 1, ws = 12, hs = 6, cut = HALF) => cache(`dome:${r}:${ws}:${hs}:${cut}`, () => new THREE.SphereGeometry(r, q(ws, 5), q(hs, 3), 0, PI * 2, 0, cut)),
    cone: (r, h, seg = 8) => cache(`cone:${r}:${h}:${seg}`, () => new THREE.ConeGeometry(r, h, q(seg))),
    torus: (r, t, rs = 6, ts = 14, arc = PI * 2) => cache(`torus:${r}:${t}:${rs}:${ts}:${arc}`, () => new THREE.TorusGeometry(r, t, q(rs), q(ts, 6), arc)),
    capsule: (r, len, seg = 8) => cache(`cap:${r}:${len}:${seg}`, () => new THREE.CapsuleGeometry(r, len, low ? 2 : 3, q(seg, 5))),
    // surface of revolution from [radius, y] pairs listed bottom to top
    lathe: (profile, seg = 10) => cache(`lathe:${seg}:${profile.flat().join(',')}`, () => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), q(seg, 5))),
    // irregular chunk: an icosphere pushed around by a deterministic hash, smooth shaded
    rock: (r, seed = 1, detail = 1, rough = 0.35) => cache(`rock:${r}:${seed}:${detail}:${rough}`, () => {
      const g = new THREE.IcosahedronGeometry(r, low ? Math.max(0, detail - 1) : detail);
      g.deleteAttribute('uv');
      const merged = mergeVerts(g);
      const pos = merged.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        _v.fromBufferAttribute(pos, i);
        const k = 1 + (hash2(Math.round(_v.x / r * 50), Math.round(_v.y / r * 50) + Math.round(_v.z / r * 50) * 131, seed) - 0.5) * 2 * rough;
        pos.setXYZ(i, _v.x * k, _v.y * k, _v.z * k);
      }
      merged.computeVertexNormals();
      g.dispose();
      return merged;
    }),
    // triangular prism: gable roof volume (ridge along z, base at y = 0)
    prism: (w, h, d) => cache(`prism:${w}:${h}:${d}`, () => {
      const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
      const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
      g.translate(0, 0, -d / 2);
      return g;
    }),
    // closed 2D outline [[z, y], ...] (side view) extruded across x; used for vehicle bodies and profiles
    extrude: (pts, width, bevel = 0, key = '') => cache(`ext:${key}:${width}:${bevel}:${pts.flat().join(',')}`, () => {
      const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
      const g = new THREE.ExtrudeGeometry(s, bevel > 0
        ? { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 }
        : { depth: width, bevelEnabled: false, curveSegments: 6 });
      // the shape lies in XY and extrudes along +Z: remap so the outline's first axis is model z and the depth is x
      g.translate(0, 0, -(bevel > 0 ? width - bevel * 2 : width) / 2);
      g.rotateY(-HALF);
      return g;
    }),
    // flat sheet in the XY plane with UVs in world units (v runs up the sheet): roof slopes, signs of any size
    slab: (w, h) => cache(`slab:${w}:${h}`, () => {
      const g = new THREE.PlaneGeometry(w, h);
      const pos = g.getAttribute('position'), uv = g.getAttribute('uv');
      for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i), pos.getY(i));
      return g;
    }),
    // corrugated sheet in the XY plane (ridges run along y), centred, UVs in world units
    corr: (w, h, ridge = 0.07, depth = 0.012) => cache(`corr:${w}:${h}:${ridge}:${depth}`, () => {
      const n = Math.max(2, Math.round(w / ridge));
      const g = new THREE.PlaneGeometry(w, h, n * (low ? 3 : 4), 1);
      const pos = g.getAttribute('position'), uv = g.getAttribute('uv');
      for (let i = 0; i < pos.count; i++) {
        pos.setZ(i, Math.sin((pos.getX(i) / w + 0.5) * n * PI * 2) * depth);
        uv.setXY(i, pos.getX(i), pos.getY(i));
      }
      g.computeVertexNormals();
      return g;
    }),
    // round pipe / cable through points; `sag` hangs the middle like a slack wire
    tube: (pts, r = 0.012, radial = 5, sag = 0) => cache(`tube:${r}:${radial}:${sag}:${pts.flat().join(',')}`, () => {
      let path = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
      if (sag && pts.length === 2) {
        const [a, b] = path as [THREE.Vector3, THREE.Vector3];
        path = [];
        for (let i = 0; i <= 8; i++) { const t = i / 8; path.push(new THREE.Vector3().lerpVectors(a, b, t).setY(a.y + (b.y - a.y) * t - Math.sin(t * PI) * sag)); }
      }
      const [p0, p1] = path as [THREE.Vector3, THREE.Vector3];
      const curve = path.length === 2 ? new THREE.LineCurve3(p0, p1) : new THREE.CatmullRomCurve3(path, false, 'catmullrom', 0.35);
      return new THREE.TubeGeometry(curve, path.length === 2 ? 1 : path.length * (low ? 2 : 4), r, q(radial), false);
    }),
    // flat card with UVs remapped to one cell of an atlas (cols x rows, cell index k from the top-left)
    card: (w, h, k, cols, rows) => cache(`card:${w}:${h}:${k}:${cols}:${rows}`, () => {
      const g = new THREE.PlaneGeometry(w, h);
      const uv = g.getAttribute('uv');
      const u0 = (k % cols) / cols, v0 = 1 - (Math.floor(k / cols) + 1) / rows;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) / cols, v0 + uv.getY(i) / rows);
      return g;
    }),
    // cloth panel hanging from / attached along its u = 0 edge; uv.x drives the wind sway in the shader
    cloth: (w, h, sx = 8, sy = 3) => cache(`cloth:${w}:${h}:${sx}:${sy}`, () => {
      const g = new THREE.PlaneGeometry(w, h, q(sx, 2), q(sy, 1));
      g.translate(w / 2, 0, 0);
      return g;
    })
  };

  function mergeVerts(g: THREE.BufferGeometry): THREE.BufferGeometry {
    // weld an unindexed polyhedron so the displaced chunk shades smoothly
    const pos = g.getAttribute('position');
    const map = new Map<string, number>(), verts: number[] = [], index: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
      let id = map.get(key);
      if (id === undefined) { id = verts.length / 3; map.set(key, id); verts.push(pos.getX(i), pos.getY(i), pos.getZ(i)); }
      index.push(id);
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    out.setIndex(index);
    return out;
  }

  // ---------------- materials ----------------
  const wind = base ? base.wind : { value: 0 };
  const mats = base ? base.mats : buildMaterials();
  function buildMaterials(): Mats {
    const std = (o: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial => { const m = new THREE.MeshStandardMaterial({ vertexColors: true, ...o }); owned.push(m); return m; };
    const phys = (o: THREE.MeshPhysicalMaterialParameters): THREE.MeshPhysicalMaterial => { const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, ...o }); owned.push(m); return m; };
    const textured = (kind: string, extra: THREE.MeshStandardMaterialParameters = {}, texOpts?: TextureSetOptions): THREE.MeshStandardMaterial => {
      const s = lib.set(kind, texOpts);
      return std({ map: s.map, normalMap: s.normalMap, roughnessMap: s.ormMap, metalnessMap: s.ormMap, roughness: 1, metalness: 1, ...extra });
    };
    const fabric = lib.set('fabric', { normalStrength: 1.3 });
    const mats: Mats = {
      rust: textured('rust'),
      sheet: textured('sheet', { side: THREE.DoubleSide }),
      copper: textured('copper'),
      steel: textured('steel'),
      crumble: textured('crumble'),
      plaster: textured('plaster'),
      panel: textured('panel'),
      concrete: textured('concrete'),
      brick: textured('brick'),
      wood: textured('wood'),
      planks: textured('planks'),
      roofTile: textured('roofTile', {}, { normalStrength: 3 }),
      bitumen: textured('bitumen'),
      burlap: textured('burlap', {}, { normalStrength: 3 }),
      // every garment, skin and soft good: one woven material, coloured per vertex (white = team colour)
      cloth: std({ map: fabric.map, normalMap: fabric.normalMap, normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.84, metalness: 0 }),
      paint: phys({ map: lib.set('paintWorn').map, roughnessMap: lib.set('paintWorn').ormMap, roughness: 1, metalness: 0.25, clearcoat: 0.7, clearcoatRoughness: 0.22 }),
      matte: std({ roughness: 0.88, metalness: 0 }),
      satin: std({ roughness: 0.42, metalness: 0 }),
      metal: std({ roughness: 0.42, metalness: 0.9 }),
      glass: phys({ color: 0x0d1418, roughness: 0.04, metalness: 0.2, envMapIntensity: 2.4, clearcoat: 1, clearcoatRoughness: 0.02 }),
      glassLit: std({ color: 0x4a3518, emissive: 0xffa040, emissiveIntensity: 1.6, roughness: 0.25 }),
      chrome: std({ color: 0xd8dce0, roughness: 0.14, metalness: 1 }),
      gold: std({ color: 0xd9ab4a, roughness: 0.28, metalness: 1 }),
      headlight: std({ color: 0xfff6d8, emissive: 0xfff0c8, emissiveIntensity: 4, roughness: 0.2 }),
      taillight: std({ color: 0x400000, emissive: 0xff2010, emissiveIntensity: 2.2, roughness: 0.3 }),
      lamp: std({ color: 0xffffff, emissive: 0xfff2c0, emissiveIntensity: 3, roughness: 0.3 }),
      fire: std({ color: 0x000000, emissive: 0xff7a20, emissiveIntensity: 3.5, roughness: 1 }),
      cargo: std({ roughness: 0.55, metalness: 0.5 }),
      // flags, laundry, awnings: double sided cloth that ripples in the vertex shader
      flag: std({ map: fabric.map, normalMap: fabric.normalMap, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.8, metalness: 0, side: THREE.DoubleSide }),
      decal: std({ map: lib.graffiti(), transparent: true, alphaTest: 0.04, depthWrite: false, roughness: 0.75, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4 }),
      sign: std({ map: lib.signs(), roughness: 0.6, metalness: 0.1 }),
      // debris chunks thrown by the particle system (plain geometry without vertex colours)
      debris: (() => { const s = lib.set('crumble'); const m = new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.normalMap, roughnessMap: s.ormMap, roughness: 1, metalness: 0 }); owned.push(m); return m; })()
    };
    mats.flag.onBeforeCompile = (shader) => {
      shader.uniforms.uWind = wind;
      shader.vertexShader = 'uniform float uWind;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float flagPhase = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3;
        #else
          float flagPhase = 0.0;
        #endif
        float flagWave = sin(uv.x * 9.0 - uWind * 5.2 + flagPhase) * 0.6 + sin(uv.x * 4.0 + uv.y * 5.0 - uWind * 3.1 + flagPhase * 0.7) * 0.4;
        transformed += objectNormal * flagWave * uv.x * 0.05;`);
    };
    mats.flag.customProgramCacheKey = () => 'empire-flag';
    mats.decal.userData.overlay = true;
    for (const k of ['decal', 'sign', 'lamp', 'headlight', 'taillight', 'fire', 'glassLit', 'gold'] as const) mats[k].userData.noShadow = true;
    for (const [k, m] of Object.entries(mats)) m.userData.key = k;
    return mats;
  }
  // metres of surface per texture repeat for the box-projected UVs
  const TILE: Readonly<Partial<Record<MatKey, number>>> = { brick: 0.8, panel: 1.1, roofTile: 0.5, planks: 0.9, wood: 0.9, plaster: 1.4, crumble: 1.3, bitumen: 1.2, burlap: 0.35, cloth: 0.16, paint: 1.3, concrete: 1.5, steel: 0.9, rust: 0.9, sheet: 1.1, copper: 0.9 };
  const TEAM_DEFAULT = new Set<MatKey>(['paint']);
  // textures that already carry a strong colour of their own: a vertex tint only nudges them (stain, fading)
  const SOFT_TINT = new Set<MatKey>(['wood', 'planks', 'burlap', 'brick', 'roofTile', 'rust', 'sheet', 'steel', 'copper', 'crumble', 'concrete']);
  // small emissive parts stay in the distant version: they are the glints that sell a lamp or a fire
  const GLOW = new Set<MatKey>(['lamp', 'headlight', 'taillight', 'fire', 'glassLit']);
  // materials whose UVs address cells of an atlas (never rescaled) / drive the cloth shader
  const ATLAS = new Set<MatKey>(['decal', 'sign', 'flag']);

  // ---------------- parts ----------------
  // P(geometry, materialKey, position, { r, s, c, j, team, cargo, scaffold, keepUV, shade, uvo })
  //   c: vertex colour (hex), j: joint name, team: tinted with the owner's colour, keepUV: keep the geometry's
  //   own UVs (scaled by the material's tile size) instead of box projecting, shade: extra darkening
  //   multiplier (soot, interiors), uvo: [x, z] texture shift in repeats for faces looking along z / along x
  const P: PartFactory = (g, m, p, x = {}) => ({
    g, mat: m, m: matrixOf(p, x.r, typeof x.s === 'number' ? [x.s, x.s, x.s] : x.s), c: x.c ?? 0xffffff, shade: x.shade ?? 1,
    uvo: x.uvo || null, j: x.j || null, team: x.team ?? TEAM_DEFAULT.has(m), cargo: !!x.cargo, scaffold: !!x.scaffold, keepUV: !!x.keepUV || ATLAS.has(m)
  });

  // the geometry's index, creating the identity index for an unindexed geometry
  function indexOf(g: THREE.BufferGeometry): THREE.BufferAttribute {
    if (!g.index) g.setIndex([...Array(g.getAttribute('position').count).keys()]);
    const index = g.getIndex();
    if (!index) throw new Error('geometry without index');
    return index;
  }

  function bake(part: RawPart, matrix: THREE.Matrix4, grime: number): THREE.BufferGeometry {
    let g = part.g.clone();
    g.applyMatrix4(matrix);
    if (matrix.determinant() < 0) {
      // mirrored placement: restore the winding so the faces still point outwards
      const idx = indexOf(g).array;
      for (let i = 0; i < idx.length; i += 3) { const t = idx[i] ?? 0; idx[i] = idx[i + 2] ?? 0; idx[i + 2] = t; }
    }
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    // textured parts are projected per face, so their triangles must not share corners
    const project = !part.keepUV && !!mats[part.mat].map;
    if (project && g.index) { const flat = g.toNonIndexed(); g.dispose(); g = flat; }
    const pos = g.getAttribute('position'), nor = g.getAttribute('normal');
    if (!g.hasAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
    const index = indexOf(g);
    const uv = g.getAttribute('uv'), tile = TILE[part.mat] || 1;
    if (part.keepUV) {
      if (!ATLAS.has(part.mat)) for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tile, uv.getY(i) / tile);
    } else if (project) {
      // box projection along the dominant axis of each face normal: constant texel density, no smeared faces
      const ox = part.uvo ? part.uvo[0] : 0, oz = part.uvo ? part.uvo[1] : 0;
      const idx = index.array;
      for (let t = 0; t < idx.length; t += 3) {
        _v.fromBufferAttribute(pos, idx[t] ?? 0);
        _n.crossVectors(_a.fromBufferAttribute(pos, idx[t + 1] ?? 0).sub(_v), _b.fromBufferAttribute(pos, idx[t + 2] ?? 0).sub(_v));
        const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
        for (let c = 0; c < 3; c++) {
          const i = idx[t + c] ?? 0;
          const x = pos.getX(i) / tile, y = pos.getY(i) / tile, z = pos.getZ(i) / tile;
          if (ax >= ay && ax >= az) uv.setXY(i, z + oz, y); else if (ay >= az) uv.setXY(i, x + ox, z + oz); else uv.setXY(i, x + ox, y);
        }
      }
    }
    _c.set(part.c);
    if (SOFT_TINT.has(part.mat)) _c.lerp(WHITE, 0.55);
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      let k = part.shade;
      if (grime) {
        // weathering: dirt splashed up from the ground, faint darkening under overhangs, blotchy fading
        const y = pos.getY(i);
        k *= 0.66 + 0.34 * smooth(0, grime, y);
        k *= 0.93 + 0.14 * hash2(Math.round(pos.getX(i) * 9), Math.round(pos.getZ(i) * 9) + Math.round(y * 9) * 57, 5);
        if (nor.getY(i) < -0.5) k *= 0.6;
      }
      col[i * 3] = _c.r * k; col[i * 3 + 1] = _c.g * k; col[i * 3 + 2] = _c.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.morphAttributes = {};
    return g;
  }

  // Joint description: { parent, p, rest: [x, y, z], src, axis, hold, swing, actBase, actAmp, actPh, share }
  //   src names the animation channel the renderer drives; a joint without src (and without an animated
  //   ancestor) is a fixed pose and gets baked into the static geometry.
  function finalize(raw: readonly RawPart[], jointDefs: JointDefs | null, meta: ModelMeta): Model {
    const defs = jointDefs || {};
    const def = (name: string): JointDef => {
      const d = defs[name];
      if (!d) throw new Error(`unknown joint ${name}`);
      return d;
    };
    const animated = (name: string): boolean => { for (let n: string | undefined = name; n; n = def(n).parent) if (def(n).src) return true; return false; };
    const restMatrix = (name: string): THREE.Matrix4 => {
      const d = def(name);
      const m = matrixOf(d.p, d.rest);
      // a fixed joint keeps the constant bend the live skeleton would add on top of its rest pose
      if (d.hold) m.multiply(new THREE.Matrix4().makeRotationAxis(AXIS[d.axis || 'x'], d.hold));
      return d.parent ? restMatrix(d.parent).multiply(m) : m;
    };
    const joints: Joint[] = [];
    const jointIndex = new Map<string, number>();
    const useJoint = (name: string): number => {
      const known = jointIndex.get(name);
      if (known !== undefined) return known;
      const d = def(name);
      const parent = d.parent ? useJoint(d.parent) : -1;
      const idx = joints.length;
      joints.push({
        parent, p: new THREE.Vector3(...d.p), rest: d.rest ? new THREE.Quaternion().setFromEuler(new THREE.Euler(...d.rest)) : null,
        src: d.src || null, axis: d.axis || 'x', hold: d.hold || 0, swing: d.swing ?? 1, actBase: d.actBase || 0, actAmp: d.actAmp || 0, actPh: d.actPh || 0
      });
      jointIndex.set(name, idx);
      return idx;
    };
    interface Group {
      ji: number;
      mat: MatKey;
      team: boolean;
      cargo: boolean;
      scaffold: boolean;
      share: string | null;
      list: Array<{ part: RawPart; matrix: THREE.Matrix4 }>;
    }
    const groups = new Map<string, Group>();
    for (const part of raw) {
      if (low && !GLOW.has(part.mat)) {
        if (!part.g.boundingSphere) part.g.computeBoundingSphere();
        if ((part.g.boundingSphere?.radius ?? 0) * part.m.getMaxScaleOnAxis() < 0.014) continue;
      }
      let ji = -1, matrix = part.m, share: string | null = null;
      if (part.j) {
        const jd = def(part.j);
        if (animated(part.j)) { ji = useJoint(part.j); share = jd.share || null; } else matrix = restMatrix(part.j).multiply(part.m);
      }
      const key = `${ji}|${part.mat}|${part.team ? 1 : 0}|${part.cargo ? 1 : 0}|${part.scaffold ? 1 : 0}`;
      let g = groups.get(key);
      if (!g) { g = { ji, mat: part.mat, team: part.team, cargo: part.cargo, scaffold: part.scaffold, share, list: [] }; groups.set(key, g); }
      g.list.push({ part, matrix });
    }
    const parts: ModelPart[] = [];
    const shared = new Map<string, THREE.BufferGeometry>();
    for (const g of groups.values()) {
      const shareKey = g.share && `${g.share}|${g.mat}|${g.team}|${g.cargo}`;
      let geo = shareKey ? shared.get(shareKey) : null;
      if (!geo) {
        const baked = g.list.map(({ part, matrix }) => bake(part, matrix, g.ji < 0 && !g.scaffold ? meta.grime || 0 : 0));
        geo = mergeGeometries(baked, false);
        baked.forEach((b) => b.dispose());
        geo.computeBoundingSphere();
        owned.push(geo);
        if (shareKey) shared.set(shareKey, geo);
      }
      parts.push({ geo, mat: mats[g.mat], team: g.team, cargo: g.cargo, scaffold: g.scaffold, ji: g.ji });
    }
    return { parts, joints, top: meta.top, radius: meta.radius, emitters: meta.emitters || [], size: meta.size || 1, vehicle: !!meta.vehicle };
  }

  return {
    G, P, mats, wind, finalize,
    setTime(t) { wind.value = t; },
    dispose() {
      for (const g of geos.values()) g.dispose();
      geos.clear();
      for (const o of owned) o.dispose();
      owned.length = 0;
    }
  };
}
