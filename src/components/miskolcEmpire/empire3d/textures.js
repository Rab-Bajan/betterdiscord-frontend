// Procedural PBR texture library for the MiskolcEmpire 3D view. Everything is generated in code
// (tileable value noise into DataTextures, canvas for graffiti); nothing is downloaded. Each scene
// owns one library and disposes it on unmount.
import * as THREE from 'three';

function hash2(ix, iy, seed) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
const smooth = (t) => t * t * (3 - 2 * t);
function vnoise(x, y, period, seed) {
  const px = x * period, py = y * period;
  const x0 = Math.floor(px), y0 = Math.floor(py);
  const fx = smooth(px - x0), fy = smooth(py - y0);
  const xa = ((x0 % period) + period) % period, ya = ((y0 % period) + period) % period;
  const xb = (xa + 1) % period, yb = (ya + 1) % period;
  const a = hash2(xa, ya, seed), b = hash2(xb, ya, seed), c = hash2(xa, yb, seed), d = hash2(xb, yb, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(x, y, period, octaves, seed) {
  let sum = 0, amp = 0.5, norm = 0, p = period;
  for (let o = 0; o < octaves; o++) { sum += amp * vnoise(x, y, p, seed + o * 17); norm += amp; amp *= 0.5; p *= 2; }
  return sum / norm;
}
// Worley-ish cell distance (tileable) for stones and cracks
function cells(u, v, n, seed) {
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
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;
const rgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

// Generators: (u, v) in [0,1) -> [r, g, b, roughness, metalness, height]
const KINDS = {
  deadGrass(u, v) {
    const n = fbm(u, v, 4, 5, 3);
    const blades = vnoise(u * 1.0, v * 0.25, 96, 5) * 0.6 + vnoise(u, v, 128, 7) * 0.4;
    const bare = clamp01((fbm(u, v, 3, 4, 9) - 0.56) * 4);
    const dry = [0.47, 0.42, 0.24], olive = [0.30, 0.32, 0.16], soil = [0.30, 0.24, 0.17];
    const t = clamp01(n * 1.4 - 0.2);
    let r = mix(olive[0], dry[0], t), g = mix(olive[1], dry[1], t), b = mix(olive[2], dry[2], t);
    const k = 0.7 + blades * 0.5;
    r = mix(r * k, soil[0], bare); g = mix(g * k, soil[1], bare); b = mix(b * k, soil[2], bare);
    return [r, g, b, 0.94, 0, blades * 0.8 + n * 0.3 - bare * 0.4];
  },
  mud(u, v) {
    const n = fbm(u, v, 3, 6, 61);
    const rut = Math.abs(Math.sin((u + fbm(u, v, 4, 3, 63) * 0.4) * Math.PI * 2 * 3)) * 0.35;
    const wet = clamp01((fbm(u, v, 3, 4, 67) - 0.5) * 6);
    const pebble = cells(u, v, 24, 69);
    const peb = pebble[0] < 0.18 && pebble[2] > 0.7 ? 1 : 0;
    const k = 0.45 + n * 0.6;
    const base = [0.29, 0.22, 0.15];
    const r = base[0] * k * (1 - wet * 0.45) + peb * 0.08;
    const g = base[1] * k * (1 - wet * 0.42) + peb * 0.07;
    const b = base[2] * k * (1 - wet * 0.3) + peb * 0.06;
    return [r, g, b, mix(0.9, 0.06, wet), 0, n * 0.7 + rut - wet * 0.9 + peb * 0.5];
  },
  gravel(u, v) {
    const [d1, d2, id] = cells(u, v, 20, 71);
    const edge = clamp01((d2 - d1) * 5);
    const n = fbm(u, v, 5, 4, 77);
    const dirt = clamp01(fbm(u, v, 3, 3, 79) - 0.42) * 1.4;
    const tone = 0.36 + id * 0.3 + n * 0.15;
    const r = mix(tone * 1.02, 0.25, dirt * 0.6) * (0.55 + edge * 0.45);
    const g = mix(tone * 0.98, 0.21, dirt * 0.6) * (0.55 + edge * 0.45);
    const b = mix(tone * 0.92, 0.17, dirt * 0.6) * (0.55 + edge * 0.45);
    return [r, g, b, 0.9 - id * 0.15, 0.02, edge * 1.1 + n * 0.2];
  },
  concrete(u, v) {
    const n = fbm(u, v, 3, 6, 21);
    const fine = fbm(u, v, 48, 2, 27);
    const stain = clamp01(fbm(u, v, 2, 4, 31) - 0.45) * 1.2;
    const [d1, d2] = cells(u, v, 5, 33);
    const crack = d2 - d1 < 0.035 ? 1 : 0;
    const slab = (u * 2) % 1 < 0.012 || (v * 2) % 1 < 0.012 ? 1 : 0;
    const moss = clamp01((fbm(u, v, 6, 3, 35) - 0.62) * 4) * Math.max(crack, slab);
    const k = (0.56 + n * 0.4 + fine * 0.12) * (1 - stain * 0.35) * (1 - Math.max(crack, slab) * 0.55);
    return [mix(0.6 * k, 0.24, moss), mix(0.6 * k, 0.28, moss), mix(0.58 * k, 0.14, moss), 0.86 - fine * 0.1 - stain * 0.3, 0.02, n * 0.4 + fine * 0.3 - (crack + slab) * 1.2];
  },
  rust(u, v) {
    const ridges = 10;
    const wave = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * ridges);
    const n = fbm(u, v, 4, 5, 41);
    const rustMask = clamp01((fbm(u, v, 5, 4, 43) - 0.38) * 2.6 + (1 - v) * 0.15);
    const streak = fbm(u * 0.5, v * 4, 4, 3, 45);
    const galv = [0.52, 0.53, 0.52], rustC = [0.44, 0.2, 0.08], deep = [0.24, 0.1, 0.05];
    const rt = clamp01(n * 1.5 - 0.3);
    const rc = [mix(rustC[0], deep[0], rt), mix(rustC[1], deep[1], rt), mix(rustC[2], deep[2], rt)];
    const k = (0.72 + wave * 0.28) * (1 - streak * 0.25);
    return [mix(galv[0], rc[0], rustMask) * k, mix(galv[1], rc[1], rustMask) * k, mix(galv[2], rc[2], rustMask) * k, mix(0.42, 0.93, rustMask), mix(0.75, 0.1, rustMask), wave * 1.6 + n * 0.25];
  },
  copper(u, v) {
    const seam = Math.abs(((u * 6) % 1) - 0.5) > 0.47 ? 1 : 0;
    const n = fbm(u, v, 4, 5, 51);
    const pat = clamp01((fbm(u, v, 5, 4, 53) - 0.32) * 2.2);
    const drip = clamp01(fbm(u * 4, v * 0.6, 4, 3, 55) - 0.4);
    const cu = [0.62, 0.34, 0.18], verd = [0.28, 0.58, 0.5], dark = [0.17, 0.3, 0.27];
    const vc = [mix(verd[0], dark[0], n), mix(verd[1], dark[1], n), mix(verd[2], dark[2], n)];
    const t = clamp01(pat + drip * 0.6);
    const k = 0.8 + n * 0.3 - seam * 0.25;
    return [mix(cu[0], vc[0], t) * k, mix(cu[1], vc[1], t) * k, mix(cu[2], vc[2], t) * k, mix(0.4, 0.85, t), mix(0.85, 0.15, t), n * 0.3 + seam * 1.2];
  },
  steel(u, v) {
    const brushed = vnoise(u, v * 0.02, 160, 61) * 0.15;
    const n = fbm(u, v, 4, 5, 63);
    const grease = clamp01((fbm(u, v, 4, 4, 65) - 0.5) * 3);
    const panel = Math.abs((u * 2) % 1 - 0.5) > 0.49 || Math.abs((v * 2) % 1 - 0.5) > 0.49 ? 1 : 0;
    const k = (0.42 + n * 0.25 + brushed) * (1 - grease * 0.55) * (1 - panel * 0.4);
    return [k * 0.95, k * 0.97, k, mix(0.38, 0.18, grease) + panel * 0.2, mix(0.85, 0.6, grease), n * 0.25 - panel * 0.8];
  },
  crumble(u, v) {
    const n = fbm(u, v, 3, 6, 81);
    const fine = fbm(u, v, 40, 2, 83);
    const spall = clamp01((fbm(u, v, 6, 4, 85) - 0.6) * 5);
    const streak = clamp01(fbm(u * 3, v * 0.3, 3, 4, 87) - 0.42);
    const brickU = (u * 8 + Math.floor(v * 16) % 2 * 0.5) % 1, brickV = (v * 16) % 1;
    const mortar = brickU < 0.08 || brickV < 0.12;
    const panelLine = (v * 3) % 1 < 0.015 ? 1 : 0;
    const k = (0.6 + n * 0.35 + fine * 0.1) * (1 - streak * 0.45) * (1 - panelLine * 0.5);
    const conc = [0.66 * k, 0.64 * k, 0.6 * k];
    const brick = mortar ? [0.5, 0.48, 0.44] : [0.48 + fine * 0.1, 0.24, 0.17];
    return [mix(conc[0], brick[0], spall), mix(conc[1], brick[1], spall), mix(conc[2], brick[2], spall), 0.9, 0.02, n * 0.4 - spall * 0.7 - panelLine + (mortar ? -0.3 : 0) * spall];
  },
  brick(u, v) {
    const rows = 12, cols = 5;
    const row = Math.floor(v * rows);
    const bu = u * cols + (row % 2) * 0.5;
    const fu = bu - Math.floor(bu), fv = v * rows - row;
    const mortar = fu < 0.06 || fu > 0.94 || fv < 0.1 || fv > 0.9;
    const id = hash2(Math.floor(bu) % cols, row, 7);
    const n = fbm(u, v, 8, 4, 111);
    const soot = clamp01(fbm(u * 2, v * 0.5, 3, 4, 113) - 0.4) * 0.6;
    const k = (0.62 + id * 0.4 + n * 0.3) * (1 - soot);
    return mortar ? [0.42 + n * 0.1, 0.4 + n * 0.1, 0.36, 0.95, 0, -0.5] : [0.52 * k, 0.24 * k, 0.17 * k, 0.86, 0, n * 0.4 + id * 0.2];
  },
  wood(u, v) {
    const boards = 5;
    const bu = u * boards, board = Math.floor(bu), bf = bu - board;
    const gap = bf < 0.04 || bf > 0.96 ? 1 : 0;
    const seed = 100 + board * 13;
    const grain = fbm(u, v * 0.05 + board * 0.37, 6, 4, seed) * 0.7 + Math.sin((v * 2 + fbm(u, v, 3, 2, seed + 3) * 1.5) * Math.PI * 10) * 0.12;
    const rot = clamp01((fbm(u, v, 4, 4, 107) - 0.5) * 3);
    const tone = (0.5 + grain * 0.6) * (1 - gap * 0.7);
    return [mix(0.42 * tone, 0.3, rot * 0.6), mix(0.31 * tone, 0.29, rot * 0.6), mix(0.2 * tone, 0.27, rot * 0.6), 0.86, 0, grain * 0.5 - gap * 1.2];
  },
  water(u, v) {
    const n = fbm(u, v, 4, 4, 151) * 0.6 + fbm(u, v, 12, 3, 153) * 0.4;
    return [0.1, 0.13, 0.12, 0.04, 0, n];
  }
};

function makeTex(data, size, srgb) {
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

function buildSet(kind, size, normalStrength) {
  const gen = KINDS[kind];
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
  const at = (x, y) => hgt[((y + size) % size) * size + ((x + size) % size)];
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

export function createTextureLib() {
  const sets = new Map();
  const owned = [];
  const lib = {
    set(kind, { size = 256, normalStrength = 2.2 } = {}) {
      const key = `${kind}:${size}:${normalStrength}`;
      let s = sets.get(key);
      if (!s) { s = buildSet(kind, size, normalStrength); sets.set(key, s); }
      return s;
    },
    // 2x2 atlas of spray-painted tags with drips on a transparent background
    graffiti() {
      if (lib._graffiti) return lib._graffiti;
      const c = document.createElement('canvas');
      c.width = 512; c.height = 256;
      const g = c.getContext('2d');
      let seed = 7;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let k = 0; k < 4; k++) {
        const ox = (k % 2) * 256, oy = Math.floor(k / 2) * 128;
        const word = GRAFFITI_WORDS[Math.floor(rnd() * GRAFFITI_WORDS.length)];
        const fill = SPRAY[Math.floor(rnd() * SPRAY.length)];
        const line = SPRAY[Math.floor(rnd() * SPRAY.length)];
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
      lib._graffiti = t;
      return t;
    },
    // soft round sprite used by every particle (alpha in all channels)
    particle() {
      if (lib._particle) return lib._particle;
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
      lib._particle = t;
      return t;
    },
    // soft dark disc for contact shadows under units
    blob() {
      if (lib._blob) return lib._blob;
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
      lib._blob = t;
      return t;
    },
    dispose() {
      for (const s of sets.values()) { s.map.dispose(); s.normalMap.dispose(); s.ormMap.dispose(); }
      sets.clear();
      for (const t of owned) t.dispose();
      owned.length = 0;
      lib._graffiti = lib._particle = lib._blob = null;
    }
  };
  return lib;
}

export { fbm, vnoise, hash2 };
