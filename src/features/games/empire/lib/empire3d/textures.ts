// Procedural PBR texture library for the MiskolcEmpire 3D view. Everything is generated in code
// (tileable value noise into DataTextures, canvas for graffiti); nothing is downloaded. Each scene
// owns one library and disposes it on unmount.
import * as THREE from 'three';

/** [r, g, b, roughness, metalness, height] */
type Pixel = [number, number, number, number, number, number];
type Rgb = readonly [number, number, number];

function hash2(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
const smooth = (t: number): number => t * t * (3 - 2 * t);
function vnoise(x: number, y: number, period: number, seed: number): number {
  const px = x * period, py = y * period;
  const x0 = Math.floor(px), y0 = Math.floor(py);
  const fx = smooth(px - x0), fy = smooth(py - y0);
  const xa = ((x0 % period) + period) % period, ya = ((y0 % period) + period) % period;
  const xb = (xa + 1) % period, yb = (ya + 1) % period;
  const a = hash2(xa, ya, seed), b = hash2(xb, ya, seed), c = hash2(xa, yb, seed), d = hash2(xb, yb, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(x: number, y: number, period: number, octaves: number, seed: number): number {
  let sum = 0, amp = 0.5, norm = 0, p = period;
  for (let o = 0; o < octaves; o++) { sum += amp * vnoise(x, y, p, seed + o * 17); norm += amp; amp *= 0.5; p *= 2; }
  return sum / norm;
}
// Worley-ish cell distance (tileable) for stones and cracks
function cells(u: number, v: number, n: number, seed: number): [number, number, number] {
  const px = u * n, py = v * n;
  const cx = Math.floor(px), cy = Math.floor(py);
  let d1 = 9, d2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gx = cx + i, gy = cy + j;
      const wx = ((gx % n) + n) % n, wy = ((gy % n) + n) % n;
      const fx = gx + hash2(wx, wy, seed), fy = gy + hash2(wx, wy, seed + 1);
      const d = Math.hypot(px - fx, py - fy);
      if (d < d1) { d2 = d1; d1 = d; id = hash2(wx, wy, seed + 2); } else if (d < d2) d2 = d;
    }
  }
  return [d1, d2, id];
}
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

// value noise with independent periods per axis: stretched grain, drips and brushed streaks that still tile
function aniso(u: number, v: number, pu: number, pv: number, seed: number): number {
  const px = u * pu, py = v * pv;
  const x0 = Math.floor(px), y0 = Math.floor(py);
  const fx = smooth(px - x0), fy = smooth(py - y0);
  const xa = ((x0 % pu) + pu) % pu, ya = ((y0 % pv) + pv) % pv;
  const xb = (xa + 1) % pu, yb = (ya + 1) % pv;
  const a = hash2(xa, ya, seed), b = hash2(xb, ya, seed), c = hash2(xa, yb, seed), d = hash2(xb, yb, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
// soft round bolt / nail heads: `n` per tile along u, in `rows` rows across v centred on v = (offset + k + 0.5) / rows
function boltRow(u: number, v: number, n: number, rows: number, offset: number, radius: number): number {
  const fu = (u * n) % 1 - 0.5;
  const fv = (((v - offset / rows + 1) * rows) % 1) - 0.5;
  const d = Math.hypot(fu / n, fv / rows) * n;
  return clamp01(1 - d / radius);
}
// one brick course pattern -> [r, g, b, height]; bricks vary individually and the mortar sits recessed
function brickAt(u: number, v: number, cols: number, rows: number, seed: number): [number, number, number, number] {
  const row = Math.floor(v * rows);
  const bu = u * cols + (row % 2) * 0.5;
  const col = Math.floor(bu);
  const fu = bu - col, fv = v * rows - row;
  const edge = Math.min(fu, 1 - fu) * (rows / cols) * 2.2, edgeV = Math.min(fv, 1 - fv);
  const e = Math.min(edge, edgeV);
  const wc = ((col % cols) + cols) % cols;
  const id = hash2(wc, row, seed), id2 = hash2(wc, row, seed + 1);
  const grain = fbm(u, v, 32, 2, seed + 2);
  if (e < 0.09) { const m = 0.44 + grain * 0.14; return [m, m * 0.96, m * 0.88, -0.6 + grain * 0.3]; }
  const k = (0.62 + id * 0.45 + grain * 0.2) * (id2 > 0.86 ? 0.55 : 1);
  const orange = id2 < 0.2 ? 0.07 : 0;
  return [(0.5 + orange) * k, (0.23 + orange * 0.6) * k, 0.16 * k, clamp01(e * 6) * 0.9 + grain * 0.5 + id * 0.3];
}
// sawn boards running along `b`, `count` boards across `a`: grain, knots, nail heads, silvered weathering
function boards(a: number, b: number, count: number, seed0: number): Pixel {
  const bu = a * count, board = Math.floor(bu), bf = bu - board;
  const gap = bf < 0.035 || bf > 0.965 ? 1 : 0;
  const seed = seed0 + board * 13;
  const warp = fbm(a, b, 3, 2, seed + 3);
  const grain = aniso(a, b + board * 0.37, count * 14, 3, seed) * 0.6 + Math.sin((bf * 5 + warp * 2.2 + aniso(a, b, count * 2, 4, seed + 5) * 1.5) * Math.PI * 2) * 0.2 + 0.2;
  const kx = hash2(board, 1, seed0 + 7), ky = hash2(board, 2, seed0 + 7);
  const kd = Math.hypot((bf - 0.3 - kx * 0.4) / count * 2.2, ((b - ky + 1.5) % 1) - 0.5);
  const knot = clamp01(1 - kd * 26);
  const nail = Math.max(clamp01(1 - Math.hypot((bf - 0.5) / count, ((b + 0.94) % 1) - 0.5) * 70), clamp01(1 - Math.hypot((bf - 0.5) / count, ((b + 0.56) % 1) - 0.5) * 70));
  const grey = clamp01((fbm(a, b, 4, 4, seed0 + 9) - 0.38) * 2.2);
  const tone = (0.46 + grain * 0.55 + hash2(board, 3, seed0) * 0.18) * (1 - gap * 0.75) * (1 - knot * 0.55) * (1 - nail * 0.6);
  return [mix(0.66 * tone, 0.56 * tone, grey), mix(0.5 * tone, 0.54 * tone, grey), mix(0.34 * tone, 0.5 * tone, grey), 0.86 - nail * 0.4, nail * 0.6, grain * 0.7 - gap * 1.6 - knot * 0.5 + nail * 0.4];
}

// ground palettes (sRGB albedo)
const ENV_STRAW: Rgb = [0.68, 0.6, 0.38], ENV_TAN: Rgb = [0.55, 0.45, 0.27], ENV_DEADGREY: Rgb = [0.5, 0.48, 0.4], ENV_OLIVE: Rgb = [0.33, 0.37, 0.15];
const ENV_STONES: readonly Rgb[] = [[0.62, 0.6, 0.55], [0.56, 0.55, 0.51], [0.5, 0.49, 0.46], [0.44, 0.43, 0.41], [0.54, 0.49, 0.41], [0.46, 0.41, 0.34], [0.36, 0.35, 0.34], [0.27, 0.26, 0.25], [0.2, 0.19, 0.18], [0.58, 0.56, 0.5], [0.48, 0.46, 0.42], [0.46, 0.36, 0.3]];
// integer wave vectors keep the ripple spectrum tileable: [ku, kv, amplitude, phase]
const ENV_WAVES: ReadonlyArray<readonly [number, number, number, number]> = [[3, 1, 0.3, 0.1], [-2, 4, 0.24, 0.6], [5, -3, 0.17, 0.3], [1, 7, 0.12, 0.8], [-7, 2, 0.1, 0.2], [9, 5, 0.07, 0.5], [-4, -11, 0.05, 0.9], [13, -6, 0.04, 0.4]];
// deadGrass blade layers (bottom to top): `per` straight blades anchored in each cell of an n x n grid, each shorter
// than a cell so only the 3x3 neighbourhood can reach a pixel; lengths and widths are in cell units
interface BladeLayer {
  n: number;
  per: number;
  len: number;
  wid: number;
  seed: number;
}
const ENV_BLADES: readonly BladeLayer[] = [{ n: 20, per: 4, len: 0.95, wid: 0.08, seed: 201 }, { n: 15, per: 4, len: 0.95, wid: 0.07, seed: 301 }, { n: 11, per: 3, len: 0.95, wid: 0.055, seed: 401 }];
const envBladeTables = new Map<BladeLayer, Float32Array>();
function envBladeTable(L: BladeLayer): Float32Array {
  let t = envBladeTables.get(L);
  if (t) return t;
  const tab = new Float32Array(L.n * L.n * L.per * 6);
  for (let wy = 0; wy < L.n; wy++) {
    for (let wx = 0; wx < L.n; wx++) {
      for (let k = 0; k < L.per; k++) {
        const s = L.seed + k * 5, o = ((wy * L.n + wx) * L.per + k) * 6;
        const ax = hash2(wx, wy, s), ay = hash2(wx, wy, s + 1);
        // blades lie roughly along a slowly turning flow field, like grass flattened by wind and rain
        const ang = (fbm((wx + ax) / L.n, (wy + ay) / L.n, 2, 2, 11) - 0.5) * 7 + (hash2(wx, wy, s + 2) - 0.5) * 1.8;
        const len = L.len * (0.6 + hash2(wx, wy, s + 3) * 0.4);
        tab[o] = ax; tab[o + 1] = ay; tab[o + 2] = Math.cos(ang) * len; tab[o + 3] = Math.sin(ang) * len; tab[o + 4] = 1 / (len * len); tab[o + 5] = hash2(wx, wy, s + 4);
      }
    }
  }
  envBladeTables.set(L, tab);
  return tab;
}
const envHit = { key: 0, prof: 0, t: 0 };
// topmost blade of layer L covering (u, v) -> fills envHit, returns false when the pixel shows the layer below
function envBladeAt(u: number, v: number, L: BladeLayer): boolean {
  const tab = envBladeTable(L), n = L.n;
  const px = u * n, py = v * n, cx = Math.floor(px), cy = Math.floor(py);
  let found = false;
  envHit.key = -1;
  for (let j = -1; j <= 1; j++) {
    const gy = cy + j, wy = ((gy % n) + n) % n;
    for (let i = -1; i <= 1; i++) {
      const gx = cx + i, wx = ((gx % n) + n) % n;
      for (let k = 0; k < L.per; k++) {
        const o = ((wy * n + wx) * L.per + k) * 6;
        const key = tab[o + 5] ?? 0;
        if (key < envHit.key) continue;
        const rx = px - gx - (tab[o] ?? 0), ry = py - gy - (tab[o + 1] ?? 0), ex = tab[o + 2] ?? 0, ey = tab[o + 3] ?? 0;
        const t = clamp01((rx * ex + ry * ey) * (tab[o + 4] ?? 0));
        const dx = rx - ex * t, dy = ry - ey * t, w = L.wid * (1 - t * 0.8);
        if (dx * dx + dy * dy >= w * w) continue;
        envHit.key = key; envHit.prof = 1 - Math.sqrt(dx * dx + dy * dy) / w; envHit.t = t;
        found = true;
      }
    }
  }
  return found;
}

// Generators: (u, v) in [0,1) -> [r, g, b, roughness, metalness, height]
type Generator = (u: number, v: number) => Pixel;

const KINDS: Readonly<Record<string, Generator>> = {
  // matted dry grass: three layers of individual blades over a dark thatch, green/straw patches, bare soil spots
  deadGrass(u, v): Pixel {
    const patch = fbm(u, v, 3, 3, 3);
    const bare = clamp01((fbm(u, v, 4, 3, 9) - 0.6) * 4.5);
    const fine = vnoise(u, v, 96, 13);
    let r = mix(0.2, 0.36, bare) * (0.8 + fine * 0.4), g = mix(0.16, 0.29, bare) * (0.8 + fine * 0.4), b = mix(0.09, 0.2, bare) * (0.8 + fine * 0.4);
    let h = fine * 0.15 - 0.2, rough = 0.95;
    for (const [layer, blade] of ENV_BLADES.entries()) {
      if (!envBladeAt(u, v, blade) || envHit.key < bare * 1.15) continue;
      const k = envHit.key, kc = hash2(k * 1e4 | 0, layer, 17);
      const c = kc < 0.45 ? ENV_STRAW : kc < 0.72 ? ENV_TAN : ENV_DEADGREY;
      const green = clamp01(patch * 2.4 - 0.95 + (hash2(k * 1e4 | 0, layer, 15) - 0.5) * 0.7);
      const shade = (0.62 + layer * 0.16) * (0.72 + envHit.prof * 0.38) * (0.85 + envHit.t * 0.25);
      r = mix(c[0], ENV_OLIVE[0], green) * shade; g = mix(c[1], ENV_OLIVE[1], green) * shade; b = mix(c[2], ENV_OLIVE[2], green) * shade;
      h = 0.1 + layer * 0.16 + envHit.prof * 0.14;
      rough = 0.84;
    }
    return [r, g, b, rough, 0, h];
  },
  // churned clay: meandering tyre ruts with tread prints, glossy puddles in the low spots, sun-cracked crust, pebbles
  mud(u, v) {
    const n = fbm(u, v, 4, 5, 61);
    const lump = fbm(u, v, 24, 2, 62);
    const cx = 0.5 + (fbm(0.37, v, 3, 3, 63) - 0.5) * 0.55;
    const fade = clamp01((fbm(0.71, v, 2, 2, 64) - 0.42) * 4);
    const du = ((u - cx + 1.5) % 1) - 0.5;
    let rut = 0, berm = 0, tread = 0;
    for (const side of [-0.12, 0.12]) {
      const t = Math.abs(du - side) / 0.045;
      if (t < 1) { rut = Math.max(rut, (1 - t * t) * fade); tread = Math.sin((v * 90 + Math.abs(du - side) * 140) * Math.PI * 2) > 0.2 ? fade : 0; }
      else if (t < 1.8) berm = Math.max(berm, (1 - Math.abs(t - 1.35) / 0.45) * fade);
    }
    const ground = n * 0.85 + lump * 0.25 - rut * 0.5 + berm * 0.2 - tread * 0.08;
    const puddle = clamp01((0.3 - ground - rut * 0.35 + (fbm(u, v, 5, 3, 67) - 0.5) * 0.4) * 8);
    const crust = clamp01((ground - 0.62) * 5) * (1 - puddle);
    const [cd1, cd2] = cells(u + n * 0.05, v, 14, 65);
    const crack = clamp01(1 - (cd2 - cd1) / 0.06) * crust;
    const [p1, p2, pid] = cells(u, v, 30, 69);
    const peb = pid > 0.9 ? clamp01(Math.min(1 - p1 / 0.3, (p2 - p1) * 3)) * (1 - puddle) : 0;
    const damp = clamp01(0.9 - ground * 1.2) * (1 - crust);
    const k = (0.78 + lump * 0.3) * (1 - damp * 0.38) * (1 - crack * 0.45);
    let r = mix(0.31, 0.42, crust) * k, g = mix(0.24, 0.35, crust) * k, b = mix(0.16, 0.25, crust) * k;
    if (peb > 0) { const pc = (0.2 + (pid - 0.9) * 2) * (0.6 + Math.sqrt(peb) * 0.4); r = pc; g = pc * 0.94; b = pc * 0.86; }
    r = mix(r, 0.1, puddle * 0.8); g = mix(g, 0.092, puddle * 0.8); b = mix(b, 0.075, puddle * 0.8);
    const rough = mix(mix(0.92, 0.5, damp), 0.05, puddle) - peb * 0.1;
    return [r, g, b, rough, 0, mix(ground - crack * 0.4 + peb * 0.5, 0.2, puddle)];
  },
  // crushed limestone, slag and brick bits of two sizes bedded in dusty grit
  gravel(u, v) {
    const grit = vnoise(u, v, 128, 73) * 0.6 + vnoise(u, v, 64, 74) * 0.4;
    const dirt = clamp01((fbm(u, v, 3, 3, 79) - 0.42) * 2.2);
    let r = 0.3 + grit * 0.12, g = 0.27 + grit * 0.1, b = 0.22 + grit * 0.08, h = grit * 0.3 - 0.4, rough = 0.96;
    for (const [n, seed, size] of [[34, 71, 0.6], [16, 75, 1]] as const) {
      const [d1, d2, id] = cells(u, v, n, seed);
      if (id < 0.2) continue;
      const f = Math.min((d2 - d1 - 0.12) * 3.2, 1 - d1 / (0.5 + id * 0.25));
      if (f <= 0) continue;
      const dome = Math.sqrt(Math.min(1, f * 2.2));
      if (dome * size - 0.4 < h) continue;
      const c = ENV_STONES[Math.floor(hash2(id * 1e5 | 0, seed, 76) * ENV_STONES.length)] ?? ENV_STONES[0] ?? ENV_STRAW;
      const mott = 0.82 + vnoise(u, v, 96, seed + 1) * 0.36;
      const k = (0.68 + dome * 0.32) * mott;
      r = (c[0] * 0.7 + 0.13) * k; g = (c[1] * 0.7 + 0.12) * k; b = (c[2] * 0.7 + 0.11) * k;
      h = dome * size - 0.4; rough = 0.68 + id * 0.2;
    }
    const dust = 0.12 + dirt * 0.6;
    return [mix(r, 0.36, dust), mix(g, 0.3, dust), mix(b, 0.23, dust), rough, 0.02, h];
  },
  // poured slabs (2x2 per texture, one per tile) with tar-filled joints, meandering cracks with moss, water stains
  // (oil stains are added in world space by the terrain shader so they do not repeat with the texture)
  concrete(u, v) {
    const su = u * 2, sv = v * 2, ix = Math.floor(su), iy = Math.floor(sv), fu = su - ix, fv = sv - iy;
    const sid = hash2(ix, iy, 37);
    const jd = Math.min(fu, 1 - fu, fv, 1 - fv);
    const joint = clamp01(1 - jd / 0.014), edgeDirt = clamp01(1 - jd / 0.08) * 0.3;
    const n = fbm(u, v, 4, 4, 21), agg = vnoise(u, v, 64, 27) * 0.6 + vnoise(u, v, 128, 28) * 0.4;
    const stain = clamp01((fbm(u, v, 3, 3, 31) - 0.42) * 2.2);
    const streak = clamp01((aniso(u, v, 24, 3, 32) - 0.6) * 2) * 0.5;
    const warp = fbm(u, v, 5, 3, 43) - 0.5;
    const wu = u + warp * 0.12, wv = v + (vnoise(u, v, 7, 45) - 0.5) * 0.12;
    const [c1, c2] = cells(wu, wv, 5, 33);
    const crack = clamp01(1 - (c2 - c1) / 0.045) * clamp01((fbm(u, v, 4, 2, 47) - 0.5) * 4);
    const [h1, h2] = cells(wu, wv, 11, 34);
    const hair = clamp01(1 - (h2 - h1) / 0.07) * clamp01((vnoise(u, v, 6, 48) - 0.55) * 4) * 0.6;
    const spall = clamp01((fbm(u, v, 6, 2, 85) - 0.64) * 5);
    const gap = Math.max(joint, crack);
    const moss = clamp01((fbm(u, v, 7, 2, 35) - 0.42) * 3) * clamp01(Math.max(joint * 1.3, crack * 1.5, spall * 0.5, edgeDirt));
    const pits = clamp01((agg - 0.72) * 5) * 0.25;
    const tone = (0.36 + (sid - 0.5) * 0.12 + n * 0.2 + agg * 0.07) * (1 - stain * 0.3) * (1 - streak * 0.3) * (1 - edgeDirt) * (1 - pits) * (1 - spall * 0.22);
    let r = tone, g = tone * 0.985, b = tone * 0.95;
    const dark = gap * 0.85 + hair * 0.35;
    r = mix(r, 0.1, dark); g = mix(g, 0.095, dark); b = mix(b, 0.09, dark);
    r = mix(r, 0.2, moss); g = mix(g, 0.26, moss); b = mix(b, 0.08, moss);
    const rough = 0.88 - agg * 0.08 - stain * 0.15 + moss * 0.05;
    return [r, g, b, rough, 0.02, n * 0.3 + agg * 0.25 - joint * 1.4 - crack * 1.0 - hair * 0.35 - spall * 0.35 - pits + moss * 0.25];
  },
  rust(u, v) {
    // corrugated galvanised sheet painted into a flat surface: ridges, overlapping sheet seams, bolt rows
    const ridges = 10;
    const wave = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * ridges);
    const n = fbm(u, v, 4, 5, 41);
    const streak = aniso(u, v, 28, 3, 45);
    const seam = (v * 2) % 1 < 0.03 ? 1 : 0;
    const bolt = boltRow(u, v, 10, 2, 0.5, 0.25);
    const rustMask = clamp01((fbm(u, v, 5, 4, 43) - 0.4) * 2.8 + streak * 0.35 + bolt * 0.8 + seam * 0.5);
    const galv: Rgb = [0.5, 0.52, 0.53], rustC: Rgb = [0.45, 0.2, 0.08], deep: Rgb = [0.22, 0.09, 0.05];
    const rt = clamp01(n * 1.5 - 0.3);
    const rc: Rgb = [mix(rustC[0], deep[0], rt), mix(rustC[1], deep[1], rt), mix(rustC[2], deep[2], rt)];
    const k = (0.7 + wave * 0.3) * (1 - streak * 0.22) * (1 - seam * 0.35) * (1 - bolt * 0.5);
    return [mix(galv[0], rc[0], rustMask) * k, mix(galv[1], rc[1], rustMask) * k, mix(galv[2], rc[2], rustMask) * k, mix(0.4, 0.93, rustMask), mix(0.8, 0.08, rustMask), wave * 1.6 + n * 0.25 + bolt * 0.8 - seam * 0.6];
  },
  sheet(u, v) {
    // flat sheet metal for real corrugated geometry: zinc spangle, rust creeping from fixings and streaking down
    const [, , id] = cells(u, v, 18, 141);
    const n = fbm(u, v, 5, 5, 143);
    const streak = aniso(u, v, 36, 3, 145);
    const bolt = boltRow(u, v, 8, 2, 0.5, 0.2);
    const rustMask = clamp01((fbm(u, v, 4, 4, 147) - 0.46) * 3 + streak * 0.5 * n + bolt);
    const galv = 0.5 + id * 0.1 + n * 0.08;
    const rt = clamp01(n * 1.6 - 0.35);
    const rc: Rgb = [mix(0.46, 0.2, rt), mix(0.21, 0.09, rt), mix(0.09, 0.05, rt)];
    const k = 1 - streak * 0.2 - bolt * 0.3;
    return [mix(galv * 0.97, rc[0], rustMask) * k, mix(galv, rc[1], rustMask) * k, mix(galv * 1.03, rc[2], rustMask) * k, mix(0.36 + id * 0.12, 0.94, rustMask), mix(0.85, 0.06, rustMask), n * 0.35 + bolt * 1.2 + rustMask * 0.25];
  },
  copper(u, v) {
    const seam = Math.abs(((u * 6) % 1) - 0.5) > 0.47 ? 1 : 0;
    const n = fbm(u, v, 4, 5, 51);
    const pat = clamp01((fbm(u, v, 5, 4, 53) - 0.58) * 4);
    const drip = clamp01(aniso(u, v, 24, 3, 55) - 0.62);
    const cu: Rgb = [0.62, 0.34, 0.18], verd: Rgb = [0.28, 0.58, 0.5], dark: Rgb = [0.17, 0.3, 0.27];
    const vc: Rgb = [mix(verd[0], dark[0], n), mix(verd[1], dark[1], n), mix(verd[2], dark[2], n)];
    const t = clamp01(pat + drip * 0.6);
    const k = 0.8 + n * 0.3 - seam * 0.25;
    return [mix(cu[0], vc[0], t) * k, mix(cu[1], vc[1], t) * k, mix(cu[2], vc[2], t) * k, mix(0.36, 0.85, t), mix(0.9, 0.15, t), n * 0.3 + seam * 1.2];
  },
  steel(u, v) {
    // riveted plate: brushed finish, scratches, grease, orange bloom along the seams
    const brushed = aniso(u, v, 3, 160, 61) * 0.14;
    const n = fbm(u, v, 4, 5, 63);
    const grease = clamp01((fbm(u, v, 4, 4, 65) - 0.52) * 3);
    const eu = Math.abs((u * 2) % 1 - 0.5), ev = Math.abs((v * 2) % 1 - 0.5);
    const panel = eu > 0.488 || ev > 0.488 ? 1 : 0;
    const nearSeam = clamp01((Math.max(eu, ev) - 0.4) * 10);
    const rivet = Math.max(boltRow(u, v, 16, 2, 0.41, 0.16), boltRow(u, v, 16, 2, 0.59, 0.16), boltRow(v, u, 16, 2, 0.41, 0.16), boltRow(v, u, 16, 2, 0.59, 0.16));
    const scratch = clamp01(aniso(u + n * 0.05, v, 90, 5, 67) - 0.72) * 3;
    const bloom = clamp01((fbm(u, v, 9, 3, 69) - 0.45) * 3) * nearSeam;
    const k = (0.4 + n * 0.22 + brushed + scratch * 0.2) * (1 - grease * 0.5) * (1 - panel * 0.45) * (1 + rivet * 0.25);
    return [mix(k * 0.95, 0.4, bloom * 0.7), mix(k * 0.97, 0.2, bloom * 0.7), mix(k, 0.1, bloom * 0.7), mix(0.36, 0.2, grease) + panel * 0.2 + bloom * 0.45 - scratch * 0.1, mix(0.88, 0.6, grease) * (1 - bloom * 0.7), n * 0.2 - panel * 0.9 + rivet * 1.3 - scratch * 0.3];
  },
  crumble(u, v) {
    // failing render over brickwork: stains, rain streaks, broken patches showing the bricks underneath
    const n = fbm(u, v, 3, 6, 81);
    const fine = fbm(u, v, 40, 2, 83);
    const spall = clamp01((fbm(u, v, 5, 4, 85) - 0.57) * 7);
    const streak = clamp01(aniso(u, v, 18, 2, 87) - 0.42);
    const [d1, d2] = cells(u, v, 6, 89);
    const crack = clamp01(1 - (d2 - d1) * 22) * clamp01((fbm(u, v, 4, 2, 91) - 0.4) * 4);
    const br = brickAt(u, v, 6, 14, 93);
    const k = (0.62 + n * 0.32 + fine * 0.1) * (1 - streak * 0.4) * (1 - crack * 0.5);
    const conc: Rgb = [0.68 * k, 0.66 * k, 0.61 * k];
    const lip = clamp01(spall * (1 - spall) * 4);
    return [mix(conc[0], br[0], spall) * (1 - lip * 0.3), mix(conc[1], br[1], spall) * (1 - lip * 0.3), mix(conc[2], br[2], spall) * (1 - lip * 0.3), 0.9, 0.02, n * 0.3 + fine * 0.2 - crack * 0.9 + mix(0, br[3] - 1.2, spall)];
  },
  plaster(u, v) {
    // lime-washed render (tinted per building): hairline cracks, damp blotches, dirty streaks, a few bare patches
    const n = fbm(u, v, 3, 5, 161);
    const fine = fbm(u, v, 64, 2, 163);
    const damp = clamp01((fbm(u, v, 3, 4, 165) - 0.55) * 3.5);
    const streak = clamp01(aniso(u, v, 26, 2, 167) - 0.5) * 1.6;
    const [d1, d2] = cells(u, v, 5, 169);
    const crack = clamp01(1 - (d2 - d1) * 30) * clamp01((fbm(u, v, 3, 2, 171) - 0.42) * 5);
    const spall = clamp01((fbm(u, v, 4, 4, 173) - 0.68) * 9);
    const br = brickAt(u, v, 6, 14, 175);
    const k = (0.8 + n * 0.16 + fine * 0.08) * (1 - damp * 0.22) * (1 - streak * 0.28) * (1 - crack * 0.45);
    const lip = clamp01(spall * (1 - spall) * 4);
    return [mix(k, br[0], spall) * (1 - lip * 0.25), mix(k * 0.985, br[1], spall) * (1 - lip * 0.25), mix(k * 0.95, br[2], spall) * (1 - lip * 0.25), 0.9 - damp * 0.12, 0, n * 0.25 + fine * 0.3 - crack * 0.8 + mix(0, br[3] - 1.1, spall)];
  },
  panel(u, v) {
    // prefabricated concrete wall panels: exposed aggregate, sealed joints, rain streaks under every joint
    const pu = (u * 2) % 1, pv = (v * 2) % 1;
    const joint = pu < 0.018 || pv < 0.03 ? 1 : 0;
    const [d1, d2, id] = cells(u, v, 56, 181);
    const stone = clamp01((d2 - d1) * 4);
    const n = fbm(u, v, 4, 5, 183);
    const pid = hash2(Math.floor(u * 2), Math.floor(v * 2), 185);
    const streak = clamp01(aniso(u, v, 44, 2, 187) - 0.35) * clamp01((pv - 0.45) * 1.9) * 0.55;
    const stain = clamp01((fbm(u, v, 3, 4, 189) - 0.55) * 3) * 0.25;
    const tone = (0.74 + pid * 0.08 + n * 0.12 + id * 0.08 * stone) * (0.92 + stone * 0.08) * (1 - streak) * (1 - stain) * (1 - joint * 0.6);
    return [tone * 1.01, tone * 0.99, tone * 0.94, 0.93 - joint * 0.3, 0.02, stone * 0.45 + n * 0.2 - joint * 2.2];
  },
  brick(u, v) {
    const br = brickAt(u, v, 5, 12, 7);
    const n = fbm(u, v, 8, 4, 111);
    const soot = clamp01(aniso(u, v, 14, 3, 113) - 0.42) * 0.55;
    const salt = clamp01((fbm(u, v, 5, 3, 115) - 0.62) * 5) * 0.35;
    const k = (0.9 + n * 0.2) * (1 - soot);
    return [mix(br[0] * k, 0.75, salt), mix(br[1] * k, 0.73, salt), mix(br[2] * k, 0.68, salt), 0.88, 0, br[3] + n * 0.3];
  },
  wood(u, v) { return boards(u, v, 5, 100); },
  planks(u, v) { return boards(v, u, 6, 300); },
  roofTile(u, v) {
    // beaver-tail clay tiles: staggered courses, rounded lower edges, lichen and moss in the sheltered gaps
    const rows = 8, cols = 10;
    const row = Math.floor(v * rows), fv = v * rows - row;
    const cu = u * cols + (row % 2) * 0.5;
    const col = Math.floor(cu), fu = cu - col;
    const dx = (fu - 0.5) * 2;
    const arc = fv < 0.34 ? dx * dx + ((0.34 - fv) / 0.34) ** 2 : dx * dx * 0.9;
    const inTile = arc < 0.94;
    const id = hash2(((col % cols) + cols) % cols, row, 191), id2 = hash2(((col % cols) + cols) % cols, row, 193);
    const n = fbm(u, v, 6, 4, 195);
    const fine = fbm(u, v, 48, 2, 197);
    const moss = clamp01((fbm(u, v, 5, 4, 199) - 0.56) * 5) * clamp01(1.2 - fv * 1.4 + (inTile ? 0 : 1));
    const lichen = clamp01((fbm(u, v, 22, 2, 201) - 0.66) * 8) * 0.6;
    const burnt = id2 > 0.82 ? 0.55 : 1;
    const k = (0.62 + id * 0.42 + n * 0.2 + fine * 0.1) * burnt * (inTile ? 1 : 0.4) * (0.82 + fv * 0.25);
    let r = 0.5 * k, g = 0.25 * k, b = 0.18 * k;
    r = mix(r, 0.62, lichen); g = mix(g, 0.6, lichen); b = mix(b, 0.46, lichen);
    r = mix(r, 0.2, moss); g = mix(g, 0.27, moss); b = mix(b, 0.1, moss);
    const curve = 1 - dx * dx * 0.35;
    return [r, g, b, 0.84 + moss * 0.1, 0, inTile ? (1 - fv) * 2.2 * curve + fine * 0.2 + moss * 0.3 : -0.4];
  },
  bitumen(u, v) {
    // roofing felt laid in lapped strips: mineral grit, tar repairs, pale dried puddles
    const [d1, , id] = cells(u, v, 64, 211);
    const grit = clamp01(1 - d1 * 3) * id;
    const n = fbm(u, v, 4, 5, 213);
    const lap = (u * 2) % 1;
    const seam = lap < 0.03 ? 1 : 0;
    const tar = clamp01((fbm(u, v, 3, 3, 215) - 0.63) * 9);
    const puddle = clamp01((fbm(u, v, 2, 4, 217) - 0.55) * 4) * 0.25;
    const k = (0.2 + grit * 0.16 + n * 0.1 + puddle) * (1 - seam * 0.4);
    return [mix(k * 1.02, 0.03, tar), mix(k, 0.03, tar), mix(k * 0.98, 0.035, tar), mix(0.92, 0.28, tar), 0, grit * 0.8 + n * 0.3 + seam * 1.2 * (1 - lap * 20) + tar * 0.5];
  },
  burlap(u, v) {
    const n = 22;
    const tu = u * n, tv = v * n;
    const iu = Math.floor(tu), iv = Math.floor(tv);
    const over = (iu + iv) % 2 === 0;
    const a = Math.sin((tu - iu) * Math.PI), b = Math.sin((tv - iv) * Math.PI);
    const weave = over ? a * (0.55 + 0.45 * b) : b * (0.55 + 0.45 * a);
    const t = fbm(u, v, 6, 3, 221);
    const fleck = hash2(iu, iv, 223);
    const k = (0.55 + weave * 0.4 + t * 0.2) * (0.9 + fleck * 0.2);
    return [k * 0.98, k * 0.9, k * 0.72, 0.95, 0, weave * 1.6 + t * 0.4];
  },
  fabric(u, v) {
    // plain woven cloth, near white so vertex and team colours carry the hue; soft folds in the height
    const n = 40;
    const tu = u * n, tv = v * n;
    const weave = Math.sin(tu * Math.PI * 2) * Math.sin(tv * Math.PI * 2) * (Math.floor(tu) % 2 === Math.floor(tv) % 2 ? 1 : -1);
    const fold = fbm(u, v, 3, 3, 231);
    const wear = fbm(u, v, 7, 3, 233);
    const k = 0.86 + weave * 0.05 + wear * 0.12;
    return [k, k, k, 0.86, 0, weave * 0.5 + fold * 2.4];
  },
  paintWorn(u, v) {
    // old enamel: near white for tinting, road grime, dulled patches, fine scratches and a few rust chips
    const n = fbm(u, v, 3, 5, 241);
    const grime = clamp01((fbm(u, v, 5, 4, 243) - 0.5) * 2.2);
    const scratch = clamp01(aniso(u + n * 0.08, v, 70, 6, 245) - 0.75) * 3;
    const chip = clamp01((fbm(u, v, 22, 3, 247) - 0.78) * 14);
    const k = (0.92 + n * 0.1) * (1 - grime * 0.24) * (1 - scratch * 0.12);
    return [mix(k, 0.36, chip), mix(k, 0.19, chip), mix(k, 0.1, chip), 0.26 + grime * 0.4 + chip * 0.5 + scratch * 0.2, 0, n * 0.2 - chip];
  },
  // wind ripples: a spectrum of tileable directional waves plus fine chop (only the normal map is used)
  water(u, v) {
    let h = fbm(u, v, 16, 3, 151) * 0.12;
    for (const [kx, ky, a, ph] of ENV_WAVES) h += a * Math.sin((kx * u + ky * v + ph) * Math.PI * 2);
    return [0.1, 0.13, 0.12, 0.04, 0, h];
  },
  // grey Bükk limestone: bedding strata, joints, pale lichen
  envRock(u, v) {
    const n = fbm(u, v, 3, 6, 801);
    const strata = Math.sin((v * 6 + n * 1.3) * Math.PI * 2) * 0.5 + 0.5;
    const [d1, d2] = cells(u + n * 0.1, v, 5, 803);
    const crack = clamp01(1 - (d2 - d1) / 0.05) * clamp01((fbm(u, v, 5, 2, 805) - 0.38) * 4);
    const lichen = clamp01((fbm(u, v, 12, 3, 807) - 0.68) * 5);
    const fine = vnoise(u, v, 64, 809);
    const tone = (0.6 + n * 0.28 + strata * 0.08 + fine * 0.07) * (1 - crack * 0.55);
    return [mix(tone, 0.66, lichen * 0.7), mix(tone * 0.97, 0.64, lichen * 0.7), mix(tone * 0.9, 0.42, lichen * 0.7), 0.82 + fine * 0.1, 0, n * 0.9 + strata * 0.3 + fine * 0.2 - crack * 0.9];
  },
  // tyre rubber for a lathe (u around the wheel, v across the profile): staggered tread blocks, sidewall ribs, dust
  envRubber(u, v) {
    const n = fbm(u, v, 8, 3, 821);
    const dust = clamp01((fbm(u, v, 4, 3, 823) - 0.42) * 2.2);
    let k = 0.1 + n * 0.035, h = n * 0.1;
    if (v > 0.36 && v < 0.64) {
      const bv = (v - 0.36) / 0.28, bu = (u * 40 + (bv < 0.5 ? 0 : 0.5)) % 1;
      const groove = Math.abs(bv - 0.5) < 0.07 || bu < 0.2 || Math.abs(bv - 0.5 - (bu - 0.6) * 0.3) < 0.03;
      h = groove ? -0.6 : 0.4; k *= groove ? 0.55 : 1.15;
    } else {
      const rib = Math.abs(((v < 0.5 ? v : 1 - v) - 0.2) * 40) < 1 ? 1 : 0;
      h += rib * 0.3;
    }
    return [mix(k, 0.34, dust * 0.6), mix(k, 0.31, dust * 0.6), mix(k, 0.27, dust * 0.6), 0.8 + dust * 0.15, 0, h];
  },
  // steel drum for a lathe: near-white paint (tinted per instance) eaten by rust from the rims down, drip streaks
  envDrum(u, v) {
    const n = fbm(u, v, 4, 4, 841);
    const rim = Math.min(v, 1 - v) * 2;
    const rust = clamp01((fbm(u, v, 6, 4, 843) - 0.62 + (1 - rim) * 0.35 + aniso(u, v, 30, 2, 845) * 0.25) * 3.5);
    const streak = aniso(u, v, 40, 3, 847) * 0.2;
    const paint = (0.78 + n * 0.15) * (1 - streak);
    const rc = 0.6 + n * 0.5;
    return [mix(paint, 0.4 * rc, rust), mix(paint, 0.2 * rc, rust), mix(paint, 0.09 * rc, rust), mix(0.5, 0.92, rust), mix(0.35, 0.15, rust), n * 0.2 - rust * 0.4];
  }
};

function makeTex(data: Uint8Array<ArrayBuffer>, size: number, srgb: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

export interface TextureSet {
  map: THREE.DataTexture;
  normalMap: THREE.DataTexture;
  ormMap: THREE.DataTexture;
}

function buildSet(kind: string, size: number, normalStrength: number): TextureSet {
  const gen = KINDS[kind];
  if (!gen) throw new Error(`unknown texture kind ${kind}`);
  const alb = new Uint8Array(size * size * 4);
  const orm = new Uint8Array(size * size * 4);
  const nor = new Uint8Array(size * size * 4);
  const hgt = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const px = gen(x / size, v);
      alb[i * 4] = clamp01(px[0]) * 255; alb[i * 4 + 1] = clamp01(px[1]) * 255; alb[i * 4 + 2] = clamp01(px[2]) * 255;
      alb[i * 4 + 3] = clamp01(px[3]) * 255; // roughness packed in alpha (terrain splatting reads it)
      orm[i * 4] = 255; orm[i * 4 + 1] = clamp01(px[3]) * 255; orm[i * 4 + 2] = clamp01(px[4]) * 255; orm[i * 4 + 3] = 255;
      hgt[i] = px[5];
    }
  }
  const at = (x: number, y: number): number => hgt[((y + size) % size) * size + ((x + size) % size)] ?? 0;
  const s = normalStrength * (size / 256);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * s, dy = (at(x, y + 1) - at(x, y - 1)) * s;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * size + x) * 4;
      nor[i] = (-dx * inv * 0.5 + 0.5) * 255; nor[i + 1] = (-dy * inv * 0.5 + 0.5) * 255; nor[i + 2] = (inv * 0.5 + 0.5) * 255; nor[i + 3] = 255;
    }
  }
  return { map: makeTex(alb, size, true), normalMap: makeTex(nor, size, false), ormMap: makeTex(orm, size, false) };
}

const GRAFFITI_WORDS = ['DVTK', 'AVAS', '3530', 'VASAS', 'DIÓSGYŐR', 'MÉH', 'KILIÁN', 'TELEP'];
const SPRAY = ['#e94b64', '#f5b041', '#5ec8ff', '#28c997', '#ff8fd0', '#f4f3ff', '#7655f5', '#ffe14d'];

export interface TextureSetOptions {
  size?: number;
  normalStrength?: number;
}

export interface TextureLib {
  set(kind: string, opts?: TextureSetOptions): TextureSet;
  graffiti(): THREE.CanvasTexture;
  signs(): THREE.CanvasTexture;
  particle(): THREE.DataTexture;
  blob(): THREE.DataTexture;
  dispose(): void;
}

interface SignBoard {
  bg: string;
  fg: string;
  text: string;
  sub?: string;
  edge?: string;
  plate?: boolean;
  stripes?: boolean;
}

// the 2D context an atlas is painted with
function context2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas context unavailable');
  return g;
}

export function createTextureLib(): TextureLib {
  const sets = new Map<string, TextureSet>();
  const owned: THREE.Texture[] = [];
  let graffitiTex: THREE.CanvasTexture | null = null;
  let signsTex: THREE.CanvasTexture | null = null;
  let particleTex: THREE.DataTexture | null = null;
  let blobTex: THREE.DataTexture | null = null;
  const lib: TextureLib = {
    set(kind, { size = 256, normalStrength = 2.2 } = {}) {
      const key = `${kind}:${size}:${normalStrength}`;
      let s = sets.get(key);
      if (!s) { s = buildSet(kind, size, normalStrength); sets.set(key, s); }
      return s;
    },
    // 2x2 atlas of spray-painted tags with drips on a transparent background
    graffiti() {
      if (graffitiTex) return graffitiTex;
      const c = document.createElement('canvas');
      c.width = 512; c.height = 256;
      const g = context2d(c);
      let seed = 7;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let k = 0; k < 4; k++) {
        const ox = (k % 2) * 256, oy = Math.floor(k / 2) * 128;
        const word = GRAFFITI_WORDS[Math.floor(rnd() * GRAFFITI_WORDS.length)] ?? '';
        const fill = SPRAY[Math.floor(rnd() * SPRAY.length)] ?? '';
        const line = SPRAY[Math.floor(rnd() * SPRAY.length)] ?? '';
        g.save();
        g.translate(ox + 128, oy + 64);
        g.rotate((rnd() - 0.5) * 0.3);
        g.font = `900 ${word.length > 5 ? 40 : 56}px Impact, "Arial Black", sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineJoin = 'round';
        g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 6;
        g.lineWidth = 12; g.strokeStyle = '#121212'; g.strokeText(word, 0, 0);
        g.shadowBlur = 0;
        g.lineWidth = 5; g.strokeStyle = line; g.strokeText(word, 0, 0);
        g.fillStyle = fill; g.fillText(word, 0, 0);
        // drips
        g.fillStyle = fill;
        for (let d = 0; d < 7; d++) {
          const dx = (rnd() - 0.5) * 170, len = 8 + rnd() * 30;
          g.fillRect(dx, 14, 2.5, len);
          g.beginPath(); g.arc(dx + 1.2, 14 + len, 2.4, 0, Math.PI * 2); g.fill();
        }
        g.restore();
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      owned.push(t);
      graffitiTex = t;
      return t;
    },
    // 2x4 atlas of hand-painted boards and plates used on buildings and vehicles
    signs() {
      if (signsTex) return signsTex;
      const c = document.createElement('canvas');
      c.width = 512; c.height = 512;
      const g = context2d(c);
      const boards: SignBoard[] = [
        { bg: '#1f4a2c', fg: '#efe2b0', text: 'KOCSMA', sub: 'sör · bor · pálinka', edge: '#caa955' },
        { bg: '#e2b21c', fg: '#17140f', text: 'MÉH TELEP', sub: 'vas · réz átvétel', edge: '#17140f' },
        { bg: '#e8e4d8', fg: '#1d3f7a', text: 'MŰHELY', sub: 'szerviz · hegesztés', edge: '#1d3f7a' },
        { bg: '#b3261e', fg: '#f6efdc', text: 'CÉLLÖVÖLDE', sub: 'csúzli · légpuska', edge: '#f6efdc' },
        { bg: '#f4f4f0', fg: '#101010', text: 'MIS-530', plate: true },
        { bg: '#1e4f9c', fg: '#f4f4f0', text: 'AVAS 12', sub: 'lakótelep', edge: '#f4f4f0' },
        { bg: '#5a1418', fg: '#e3bb55', text: 'VAJDA HÁZA', sub: '· · ·', edge: '#e3bb55' },
        { bg: '#e2b21c', fg: '#17140f', text: 'ÁTVÉTEL', sub: 'H-P 8-16', stripes: true }
      ];
      let seed = 11;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      boards.forEach((b, k) => {
        const ox = (k % 2) * 256, oy = Math.floor(k / 2) * 128;
        g.save();
        g.beginPath(); g.rect(ox, oy, 256, 128); g.clip();
        g.fillStyle = b.bg; g.fillRect(ox, oy, 256, 128);
        if (b.stripes) {
          g.fillStyle = '#17140f';
          for (let s = -2; s < 12; s++) { g.beginPath(); g.moveTo(ox + s * 32, oy + 128); g.lineTo(ox + s * 32 + 16, oy + 128); g.lineTo(ox + s * 32 + 40, oy + 104); g.lineTo(ox + s * 32 + 24, oy + 104); g.fill(); }
        }
        if (b.plate) {
          g.fillStyle = '#1e4f9c'; g.fillRect(ox + 6, oy + 6, 34, 116);
          g.strokeStyle = '#101010'; g.lineWidth = 5; g.strokeRect(ox + 5, oy + 5, 246, 118);
        } else {
          g.strokeStyle = b.edge ?? ''; g.lineWidth = 6; g.strokeRect(ox + 9, oy + 9, 238, 110);
        }
        g.fillStyle = b.fg;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        const big = b.plate ? 58 : b.text.length > 8 ? 34 : b.text.length > 6 ? 42 : 54;
        g.font = `900 ${big}px "Arial Black", Impact, sans-serif`;
        g.fillText(b.text, ox + (b.plate ? 146 : 128), oy + (b.sub ? 52 : 66), b.plate ? 196 : 226);
        if (b.sub) { g.font = '700 19px Arial, sans-serif'; g.fillText(b.sub, ox + 128, oy + 96, 220); }
        // sun-faded paint, grime and rust weeping from the fixings
        for (let d = 0; d < 260; d++) {
          g.fillStyle = `rgba(${rnd() < 0.5 ? '40,28,18' : '230,225,210'},${0.03 + rnd() * 0.07})`;
          g.fillRect(ox + rnd() * 256, oy + rnd() * 128, 2 + rnd() * 14, 1 + rnd() * 3);
        }
        for (const [bx, by] of [[18, 18], [238, 18], [18, 110], [238, 110]] as const) {
          const gr = g.createLinearGradient(0, oy + by, 0, oy + by + 34);
          gr.addColorStop(0, 'rgba(110,52,20,0.75)'); gr.addColorStop(1, 'rgba(110,52,20,0)');
          g.fillStyle = gr; g.fillRect(ox + bx - 2, oy + by, 4 + rnd() * 3, 34);
          g.fillStyle = '#3a3a3c'; g.beginPath(); g.arc(ox + bx, oy + by, 3.2, 0, Math.PI * 2); g.fill();
        }
        g.restore();
      });
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      owned.push(t);
      signsTex = t;
      return t;
    },
    // soft round sprite used by every particle (alpha in all channels)
    particle() {
      if (particleTex) return particleTex;
      const size = 64;
      const d = new Uint8Array(size * size * 4);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const r = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2;
          const n = 0.75 + 0.25 * fbm(x / size, y / size, 4, 3, 991);
          const a = clamp01(1 - r) ** 1.5 * n;
          const i = (y * size + x) * 4;
          d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = a * 255;
        }
      }
      const t = new THREE.DataTexture(d, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
      owned.push(t);
      particleTex = t;
      return t;
    },
    // soft dark disc for contact shadows under units
    blob() {
      if (blobTex) return blobTex;
      const size = 64;
      const d = new Uint8Array(size * size * 4);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const r = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2;
          const i = (y * size + x) * 4;
          d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = clamp01(1 - r) ** 1.4 * 200;
        }
      }
      const t = new THREE.DataTexture(d, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
      owned.push(t);
      blobTex = t;
      return t;
    },
    dispose() {
      for (const s of sets.values()) { s.map.dispose(); s.normalMap.dispose(); s.ormMap.dispose(); }
      sets.clear();
      for (const t of owned) t.dispose();
      owned.length = 0;
      graffitiTex = signsTex = particleTex = blobTex = null;
    }
  };
  return lib;
}

export { fbm, vnoise, hash2 };
