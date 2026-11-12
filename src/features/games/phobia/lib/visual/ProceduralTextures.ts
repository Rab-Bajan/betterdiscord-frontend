/**
 * ProceduralTextures.ts
 *
 * Shared, cached procedural PBR texture library for MiskolcPhobia.
 * Everything is generated in code from tileable value noise into DataTextures
 * (no canvas, no external assets, works headless in Node).
 *
 * Each material set provides:
 *   map          sRGB albedo
 *   normalMap    tangent-space normal (OpenGL convention)
 *   ormMap       R = 1 (AO unused), G = roughness, B = metalness
 *                (three.js reads roughness from G and metalness from B, so the same
 *                 texture is used for roughnessMap and metalnessMap; keep the material's
 *                 roughness/metalness scalars at 1)
 *
 * Use getPBRMaterial(kind, opts) for a cached MeshStandardMaterial, or getTextureSet().
 * Textures are reference-cached; disposeTextureLibrary() frees everything (called on engine teardown).
 */

import * as THREE from 'three';

let TEX_SIZE = 256;
let ANISOTROPY = 4;

/** 'low' = 128px textures, no anisotropy. Call before the first texture is requested. */
export function setTextureQuality(level: string): void {
  if (level === 'low') {
    TEX_SIZE = 128;
    ANISOTROPY = 1;
  } else if (level === 'medium') {
    TEX_SIZE = 192;
    ANISOTROPY = 2;
  } else {
    TEX_SIZE = 256;
    ANISOTROPY = 4;
  }
}

type Rgb = [number, number, number];
/** [r, g, b, roughness, metalness, height] for one texel. */
type Pixel = [number, number, number, number, number, number];
type PixelGenerator = (u: number, v: number, o: TextureOptions) => Pixel;

export interface TextureOptions {
  /** Base colour as a 0xRRGGBB number. */
  color?: number;
  normalStrength?: number;
}

export interface PBRMaterialOptions extends TextureOptions {
  /** Metres per texture repeat (default 2). */
  tile?: number;
  normalScale?: number;
  tint?: THREE.ColorRepresentation;
  roughnessScale?: number;
  metalnessScale?: number;
  side?: THREE.Side;
  transparent?: boolean;
  opacity?: number;
  emissive?: THREE.ColorRepresentation;
}

export interface TextureSet {
  map: THREE.DataTexture;
  normalMap: THREE.DataTexture;
  ormMap: THREE.DataTexture;
}

const textureCache = new Map<string, TextureSet>(); // key -> { map, normalMap, ormMap }
const materialCache = new Map<string, THREE.MeshStandardMaterial>(); // key -> MeshStandardMaterial

/* ----------------------------- tileable noise ----------------------------- */

function hash2(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Tileable value noise: lattice of `period` cells over the unit square. */
function vnoise(x: number, y: number, period: number, seed: number): number {
  const px = x * period;
  const py = y * period;
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const fx = smooth(px - x0);
  const fy = smooth(py - y0);
  const xa = ((x0 % period) + period) % period;
  const ya = ((y0 % period) + period) % period;
  const xb = (xa + 1) % period;
  const yb = (ya + 1) % period;
  const a = hash2(xa, ya, seed);
  const b = hash2(xb, ya, seed);
  const c = hash2(xa, yb, seed);
  const d = hash2(xb, yb, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function fbm(x: number, y: number, basePeriod: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let p = basePeriod;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(x, y, p, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    p *= 2;
  }
  return sum / norm;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

function hexToRgb(hex: number): Rgb {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

/* ------------------------------ material kinds ----------------------------- */
/*
 * Every generator returns, for the pixel (u, v in [0,1)):
 *   [r, g, b, roughness, metalness, height]
 */

const KINDS = {
  rust(u, v, o): Pixel {
    const base = hexToRgb(o.color ?? 0x8a4f2a);
    const n = fbm(u, v, 4, 5, 3);
    const flake = fbm(u, v, 16, 3, 9);
    const pit = vnoise(u, v, 48, 5) > 0.82 ? 0.35 : 0;
    const bare = clamp01((n - 0.55) * 3.2); // exposed steel patches
    const streak = fbm(u * 6, v * 0.5, 6, 2, 11);
    const k = 0.55 + n * 0.7 - pit * 0.5;
    const r = mix(base[0] * k, 0.42, bare * 0.5);
    const g = mix(base[1] * k, 0.40, bare * 0.5);
    const b = mix(base[2] * k, 0.38, bare * 0.5);
    const dark = 1 - streak * 0.25;
    return [r * dark, g * dark, b * dark, mix(0.95, 0.5, bare), mix(0.12, 0.7, bare), n * 0.6 + flake * 0.3 - pit];
  },

  concrete(u, v, o): Pixel {
    const tint = hexToRgb(o.color ?? 0x8a8b90);
    const n = fbm(u, v, 3, 6, 21);
    const fine = fbm(u, v, 48, 2, 27);
    const stain = fbm(u * 2, v * 0.4, 3, 4, 31); // vertical water streaks
    const pore = vnoise(u, v, 64, 33) > 0.9 ? 0.5 : 1;
    const k = (0.62 + n * 0.5) * (1 - clamp01(stain - 0.45) * 0.55) * pore;
    const crack = Math.abs(fbm(u, v, 5, 3, 37) - 0.5) < 0.012 ? 0.4 : 1;
    return [tint[0] * k * crack, tint[1] * k * crack, tint[2] * k * crack * 1.02, 0.88 - fine * 0.12, 0.02, n * 0.5 + fine * 0.35 - (1 - pore) - (1 - crack)];
  },

  corrugated(u, v, o): Pixel {
    const base = hexToRgb(o.color ?? 0x7d776a);
    const ridges = 8;
    const wave = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * ridges);
    const n = fbm(u, v, 4, 5, 41);
    const rustMask = clamp01((fbm(u, v, 6, 4, 43) - 0.5) * 3.0 + (1 - v) * 0.25);
    const scratch = vnoise(u, v * 0.08, 96, 47) > 0.93 ? 1.25 : 1;
    const rustCol: Rgb = [0.45, 0.22, 0.1];
    const k = (0.7 + wave * 0.18 + n * 0.25) * scratch;
    return [
      mix(base[0] * k, rustCol[0] * (0.7 + n * 0.5), rustMask),
      mix(base[1] * k, rustCol[1] * (0.7 + n * 0.5), rustMask),
      mix(base[2] * k, rustCol[2] * (0.7 + n * 0.5), rustMask),
      mix(0.45, 0.92, rustMask),
      mix(0.8, 0.15, rustMask),
      wave * 1.4 + n * 0.25 - rustMask * 0.1
    ];
  },

  asphalt(u, v, o): Pixel {
    const base = hexToRgb(o.color ?? 0x2b2d30);
    const n = fbm(u, v, 6, 5, 51);
    const grit = vnoise(u, v, 96, 53);
    const puddle = clamp01((fbm(u, v, 3, 4, 57) - 0.52) * 5.0); // wet patches
    const k = 0.6 + n * 0.5 + (grit - 0.5) * 0.35;
    return [base[0] * k * (1 - puddle * 0.4), base[1] * k * (1 - puddle * 0.4), base[2] * k * (1 - puddle * 0.35), mix(0.9, 0.12, puddle), 0.0, n * 0.4 + grit * 0.5 - puddle * 0.7];
  },

  mud(u, v, o): Pixel {
    const base = hexToRgb(o.color ?? 0x4a3c2e);
    const n = fbm(u, v, 3, 6, 61);
    const rut = Math.abs(Math.sin(u * Math.PI * 2 * 2 + fbm(u, v, 4, 3, 63) * 3)) * 0.5;
    const wet = clamp01((fbm(u, v, 4, 4, 67) - 0.48) * 4.5);
    const k = 0.5 + n * 0.7;
    return [base[0] * k, base[1] * k, base[2] * k, mix(0.85, 0.08, wet), 0.0, n * 0.8 + rut * 0.6 - wet * 0.5];
  },

  gravel(u, v, o): Pixel {
    const base = hexToRgb(o.color ?? 0xb5b0a6);
    const cell = vnoise(u, v, 32, 71);
    const cell2 = vnoise(u, v, 64, 73);
    const n = fbm(u, v, 5, 4, 77);
    const k = 0.45 + cell * 0.35 + cell2 * 0.25 + n * 0.2;
    const dirt = clamp01(fbm(u, v, 3, 3, 79) - 0.4);
    return [mix(base[0] * k, 0.3, dirt * 0.4), mix(base[1] * k, 0.26, dirt * 0.4), mix(base[2] * k, 0.22, dirt * 0.4), 0.93, 0.02, cell * 0.6 + cell2 * 0.5 + n * 0.3];
  },

  paint(u, v, o): Pixel {
    // peeling paint over rusted steel; o.color is the paint colour
    const paint = hexToRgb(o.color ?? 0x4a7c9b);
    const n = fbm(u, v, 4, 5, 81);
    const fine = fbm(u, v, 24, 3, 83);
    const peel = clamp01((fbm(u, v, 5, 4, 85) - 0.56) * 4.5);
    const chip = vnoise(u, v, 40, 87) > 0.88 ? 1 : 0;
    const bare = clamp01(peel + chip * 0.8);
    const dirt = clamp01(fbm(u * 1.5, v * 0.5, 3, 4, 89) - 0.35) * 0.45;
    const rustCol: Rgb = [0.4 + n * 0.2, 0.19 + n * 0.1, 0.1];
    const pk = (0.7 + fine * 0.35) * (1 - dirt);
    return [
      mix(paint[0] * pk, rustCol[0], bare),
      mix(paint[1] * pk, rustCol[1], bare),
      mix(paint[2] * pk, rustCol[2], bare),
      mix(0.55, 0.92, bare),
      mix(0.35, 0.2, bare),
      n * 0.35 + fine * 0.25 - bare * 0.7
    ];
  },

  glass(u, v, o): Pixel {
    const base = hexToRgb(o.color ?? 0x9bb5bb);
    const grime = clamp01(fbm(u, v, 3, 5, 91) * 1.3 - 0.2);
    const drip = clamp01(fbm(u * 8, v * 0.6, 8, 3, 93) - 0.45) * 1.6;
    const crack = Math.abs(fbm(u, v, 6, 3, 95) - 0.5) < 0.006 ? 1 : 0;
    const dirt = clamp01(grime * 0.7 + drip * 0.4);
    return [mix(base[0], 0.22, dirt), mix(base[1], 0.21, dirt), mix(base[2], 0.17, dirt), mix(0.08, 0.7, dirt) + crack * 0.2, 0.0, dirt * 0.2 + crack * 0.6];
  },

  wood(u, v, o): Pixel {
    const base = hexToRgb(o.color ?? 0x6a5238);
    const boards = 4;
    const bu = u * boards;
    const board = Math.floor(bu);
    const bf = bu - board;
    const gap = bf < 0.03 || bf > 0.97 ? 1 : 0;
    const seed = 100 + board * 13;
    const grain = fbm(u * 1.0, v * 0.04 + board * 0.37, 6, 4, seed) * 0.7 + Math.sin((v * 2 + fbm(u, v, 3, 2, seed + 3) * 1.5) * Math.PI * 2 * 5) * 0.15;
    const knot = vnoise(u, v, 12, seed + 5) > 0.93 ? 0.5 : 1;
    const rot = clamp01((fbm(u, v, 4, 4, 107) - 0.55) * 3);
    const tone = (0.55 + grain * 0.6) * knot * (1 - rot * 0.4) * (1 - gap * 0.7);
    const grey = rot * 0.35;
    return [mix(base[0] * tone, 0.35, grey), mix(base[1] * tone, 0.34, grey), mix(base[2] * tone, 0.32, grey), 0.88, 0.0, grain * 0.5 - gap * 1.2 - rot * 0.3];
  },

  brick(u, v, o): Pixel {
    const base = hexToRgb(o.color ?? 0xa04a3a);
    const cols = 6;
    const rows = 12;
    const row = Math.floor(v * rows);
    const bu = u * cols + (row % 2) * 0.5;
    const fu = bu - Math.floor(bu);
    const fv = v * rows - row;
    const mortar = fu < 0.06 || fu > 0.94 || fv < 0.1 || fv > 0.9 ? 1 : 0;
    const id = hash2(Math.floor(bu) % cols, row, 7);
    const n = fbm(u, v, 8, 4, 111);
    const soot = clamp01(fbm(u * 2, v * 0.5, 3, 4, 113) - 0.4) * 0.5;
    const k = (0.7 + id * 0.45 + n * 0.3) * (1 - soot);
    const m = 0.55 + n * 0.25;
    return mortar
      ? [m * 0.78, m * 0.76, m * 0.7, 0.95, 0.0, -0.4 + n * 0.2]
      : [base[0] * k, base[1] * k * 0.9, base[2] * k * 0.85, 0.88, 0.0, n * 0.4 + id * 0.2];
  },

  plastic(u, v, o): Pixel {
    // moulded plastic: orange-peel grain + scuffs (tool housings)
    const base = hexToRgb(o.color ?? 0xcccccc);
    const grain = vnoise(u, v, 96, 141) * 0.5 + vnoise(u, v, 48, 143) * 0.5;
    const scuff = clamp01((fbm(u, v, 6, 4, 145) - 0.6) * 4);
    const k = 0.9 + grain * 0.16 - scuff * 0.18;
    return [base[0] * k, base[1] * k, base[2] * k, 0.42 + grain * 0.18 + scuff * 0.3, 0.0, grain * 0.5 + scuff * 0.25];
  },

  anodized(u, v, o): Pixel {
    // brushed anodised / blued metal: horizontal brush streaks and edge wear
    const base = hexToRgb(o.color ?? 0x1f2126);
    const streak = hash2(0, Math.floor(v * 128), 9) * 0.5 + hash2(0, Math.floor(v * 64), 11) * 0.5;
    const wear = clamp01((fbm(u, v, 5, 4, 147) - 0.58) * 3.5);
    const k = 0.85 + streak * 0.3;
    return [mix(base[0] * k, 0.55, wear * 0.5), mix(base[1] * k, 0.56, wear * 0.5), mix(base[2] * k, 0.58, wear * 0.5), 0.38 + streak * 0.15 + wear * 0.3, 0.85 - wear * 0.3, streak * 0.3];
  },

  hazard(u, v): Pixel {
    // yellow / black warning stripes (4 per tile) with scuffs and grime
    const stripe = Math.floor(((u + v) * 4) % 2 + 2) % 2 === 0;
    const n = fbm(u, v, 6, 5, 131);
    const wear = clamp01((fbm(u, v, 8, 4, 133) - 0.5) * 3);
    const base: Rgb = stripe ? [0.86, 0.66, 0.06] : [0.06, 0.06, 0.06];
    const k = 0.7 + n * 0.5;
    return [mix(base[0] * k, 0.35, wear * 0.5), mix(base[1] * k, 0.3, wear * 0.5), mix(base[2] * k, 0.22, wear * 0.5), mix(0.45, 0.9, wear), 0.1, n * 0.3 - wear * 0.3];
  },

  metalPlate(u, v, o): Pixel {
    // brushed / hammered steel: panels, rivets, scuffs
    const base = hexToRgb(o.color ?? 0x666e7a);
    const brushed = vnoise(u * 0.05, v, 128, 121) * 0.12;
    const n = fbm(u, v, 4, 5, 123);
    const panel = Math.abs(u * 2 - Math.floor(u * 2) - 0.5) > 0.485 || Math.abs(v * 2 - Math.floor(v * 2) - 0.5) > 0.485 ? 1 : 0;
    const rivetU = (u * 16) % 1;
    const rivetV = (v * 16) % 1;
    const rivet = (rivetU - 0.5) ** 2 + (rivetV - 0.5) ** 2 < 0.012 && (Math.abs(u * 2 % 1 - 0.5) > 0.4 || Math.abs(v * 2 % 1 - 0.5) > 0.4) ? 1 : 0;
    const wear = clamp01((fbm(u, v, 6, 4, 127) - 0.55) * 3);
    const k = 0.7 + n * 0.4 + brushed - panel * 0.35 + rivet * 0.12;
    return [mix(base[0] * k, 0.4, wear * 0.4), mix(base[1] * k, 0.22, wear * 0.4), mix(base[2] * k, 0.12, wear * 0.4), mix(0.45, 0.85, wear), mix(0.8, 0.25, wear), n * 0.3 - panel * 0.7 + rivet * 0.6];
  }
} satisfies Record<string, PixelGenerator>;

export type TextureKind = keyof typeof KINDS;

/* ------------------------------ texture builder ----------------------------- */

function buildSet(kind: TextureKind, opts: TextureOptions): TextureSet {
  const gen: PixelGenerator = KINDS[kind] || KINDS.concrete;
  const size = TEX_SIZE;
  const albedo = new Uint8Array(size * size * 4);
  const orm = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;
      const px = gen(u, v, opts);
      albedo[i * 4] = clamp01(px[0]) * 255;
      albedo[i * 4 + 1] = clamp01(px[1]) * 255;
      albedo[i * 4 + 2] = clamp01(px[2]) * 255;
      albedo[i * 4 + 3] = 255;
      orm[i * 4] = 255;
      orm[i * 4 + 1] = clamp01(px[3]) * 255;
      orm[i * 4 + 2] = clamp01(px[4]) * 255;
      orm[i * 4 + 3] = 255;
      height[i] = px[5];
    }
  }

  const strength = opts.normalStrength ?? 2.2;
  const at = (x: number, y: number): number => height[((y + size) % size) * size + ((x + size) % size)] ?? 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength * (size / 256);
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength * (size / 256);
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * size + x) * 4;
      normal[i] = (-dx * inv * 0.5 + 0.5) * 255;
      normal[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      normal[i + 2] = (inv * 0.5 + 0.5) * 255;
      normal[i + 3] = 255;
    }
  }

  const make = (data: Uint8Array<ArrayBuffer>, srgb: boolean): THREE.DataTexture => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = ANISOTROPY;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  };

  return { map: make(albedo, true), normalMap: make(normal, false), ormMap: make(orm, false) };
}

/**
 * Cached texture set. kind: rust | concrete | corrugated | asphalt | mud | gravel | paint |
 * glass | wood | brick | metalPlate.  opts: { color, normalStrength }
 */
export function getTextureSet(kind: TextureKind, opts: TextureOptions = {}): TextureSet {
  const key = `${kind}:${opts.color ?? ''}:${opts.normalStrength ?? ''}:${TEX_SIZE}`;
  let set = textureCache.get(key);
  if (!set) {
    set = buildSet(kind, opts);
    textureCache.set(key, set);
  }
  return set;
}

/**
 * Cached MeshStandardMaterial using a procedural set. Materials are shared; do not mutate them
 * per instance (clone if you need to). Tagged userData.worldUV so applyWorldUVs() tiles them in metres.
 *
 * opts: { color, tile (metres per texture repeat, default 2), normalScale, tint (multiplier colour hex),
 *         roughnessScale, metalnessScale, side, transparent, opacity, emissive }
 */
export function getPBRMaterial(kind: TextureKind, opts: PBRMaterialOptions = {}): THREE.MeshStandardMaterial {
  const key = JSON.stringify([kind, opts]);
  let mat = materialCache.get(key);
  if (mat) return mat;
  const set = getTextureSet(kind, opts);
  mat = new THREE.MeshStandardMaterial({
    map: set.map,
    normalMap: set.normalMap,
    normalScale: new THREE.Vector2(opts.normalScale ?? 1, opts.normalScale ?? 1),
    roughnessMap: set.ormMap,
    metalnessMap: set.ormMap,
    roughness: opts.roughnessScale ?? 1,
    metalness: opts.metalnessScale ?? 1,
    color: opts.tint ?? 0xffffff,
    side: opts.side ?? THREE.FrontSide
  });
  if (opts.transparent) {
    mat.transparent = true;
    mat.opacity = opts.opacity ?? 0.5;
  }
  if (opts.emissive !== undefined) mat.emissive = new THREE.Color(opts.emissive);
  mat.userData.worldUV = opts.tile ?? 2;
  mat.userData.shared = true;
  materialCache.set(key, mat);
  return mat;
}

/** Alpha-tested chain-link fence material (diamond wire mesh; one repeat = ~0.5 m of mesh). */
let chainLinkMat: THREE.MeshStandardMaterial | null = null;
export function getChainLinkMaterial(): THREE.MeshStandardMaterial {
  if (chainLinkMat) return chainLinkMat;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const a = Math.abs(((u + v) * 4) % 1 - 0.5) < 0.07 || Math.abs(((u - v + 1) * 4) % 1 - 0.5) < 0.07;
      const i = (y * size + x) * 4;
      data[i] = 150;
      data[i + 1] = 154;
      data[i + 2] = 158;
      data[i + 3] = a ? 255 : 0;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  chainLinkMat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.8 });
  chainLinkMat.userData.worldUV = 1.2;
  chainLinkMat.userData.shared = true;
  return chainLinkMat;
}

/** Soft radial gradient used for contact shadows (shared, single-channel alpha). */
let blobTexture: THREE.DataTexture | null = null;
export function getBlobShadowTexture(): THREE.DataTexture {
  if (blobTexture) return blobTexture;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2;
      const a = clamp01(1 - d);
      const v = Math.pow(a, 1.6) * 255 * 0.62; // max darkening ~62%
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255 - v; // multiply blend: white = no darkening
      data[i + 3] = 255;
    }
  }
  blobTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  blobTexture.magFilter = blobTexture.minFilter = THREE.LinearFilter;
  blobTexture.generateMipmaps = false;
  blobTexture.needsUpdate = true;
  return blobTexture;
}

/** Free every cached texture and material. Safe to call repeatedly. */
export function disposeTextureLibrary(): void {
  textureCache.forEach((set) => {
    set.map.dispose();
    set.normalMap.dispose();
    set.ormMap.dispose();
  });
  textureCache.clear();
  materialCache.forEach((m) => m.dispose());
  materialCache.clear();
  if (blobTexture) {
    blobTexture.dispose();
    blobTexture = null;
  }
  if (chainLinkMat) {
    chainLinkMat.map?.dispose();
    chainLinkMat.dispose();
    chainLinkMat = null;
  }
}

export const TEXTURE_KINDS: string[] = Object.keys(KINDS);
