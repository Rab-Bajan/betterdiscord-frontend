// Scenery ring around the playable map: foothills that start flush with the map edge and rise into
// forested, rocky Bükk-style ridges with a dusting of snow on the peaks, plus a far ground plane so
// the camera never looks into empty space. Purely visual: not pickable, no gameplay. It is always covered
// by dark mist (applyOutsideMist) so the area outside the map reads like unexplored fog of war.
// The slopes blend the terrain's dry-grass texture with grey limestone; the forest is instanced tiered
// conifers and lumpy autumn beech crowns, with cheaper versions beyond the first band of trees.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { vnoise, hash2 } from './textures.ts';
import { NOISE_GLSL } from './terrain.ts';
import type { HeightAt } from './terrain.ts';
import type { TextureLib, TextureSet } from './textures.ts';

type Rgb = readonly [number, number, number];
/** [x, height, y, scale, rotation, tint] */
type TreeInstance = readonly [number, number, number, number, number, number];

export interface Mountains {
  group: THREE.Group;
  dispose(): void;
}

const BORDER = 72; // tiles of scenery outside each map edge
const STEP = 1; // grid spacing in tiles
const FOOTHILL = 3; // tiles of gentle slope before the ridges start
const RAMP = 22; // tiles until the ridges reach full height

const smooth = (a: number, b: number, t: number): number => { const k = Math.max(0, Math.min(1, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

function fbm(u: number, v: number, period: number, octaves: number, seed: number): number {
  let sum = 0, amp = 0.5, norm = 0, p = period;
  for (let o = 0; o < octaves; o++) { sum += amp * vnoise(u, v, p, seed + o * 31); norm += amp; amp *= 0.5; p *= 2; }
  return sum / norm;
}
// ridged noise: sharp crests instead of round blobs
function ridged(u: number, v: number, period: number, octaves: number, seed: number): number {
  let sum = 0, amp = 0.5, norm = 0, p = period;
  for (let o = 0; o < octaves; o++) {
    const n = 1 - Math.abs(vnoise(u, v, p, seed + o * 13) * 2 - 1);
    sum += amp * n * n; norm += amp; amp *= 0.5; p *= 2;
  }
  return sum / norm;
}

const NEAR = 11; // tiles from the map edge that get the detailed tree models

const lin = (c: Rgb): Rgb => [Math.pow(c[0], 2.2), Math.pow(c[1], 2.2), Math.pow(c[2], 2.2)];
// colour tints multiplied onto the textures (grass texture for meadow/forest floor, limestone for rock/snow)
const T_MEADOW: Rgb = [1, 1, 1];
const T_FOREST: Rgb = [0.5, 0.58, 0.42];
const T_AUTUMN: Rgb = [0.78, 0.55, 0.38];
const T_ROCK: Rgb = [0.78, 0.77, 0.74];
const T_SNOW: Rgb = [1.75, 1.8, 1.9];

function patchMountainShader(mat: THREE.MeshStandardMaterial, grass: TextureSet, rock: TextureSet): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tGrass = { value: grass.map }; shader.uniforms.tGrassN = { value: grass.normalMap };
    shader.uniforms.tRock = { value: rock.map }; shader.uniforms.tRockN = { value: rock.normalMap };
    shader.vertexShader = 'attribute float rockW;\nvarying float vRockW;\nvarying vec2 vMUv;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\n vRockW = rockW;\n vMUv = uv;'
    );
    shader.fragmentShader = [
      'uniform sampler2D tGrass; uniform sampler2D tGrassN; uniform sampler2D tRock; uniform sampler2D tRockN;',
      'varying float vRockW; varying vec2 vMUv;',
      NOISE_GLSL,
      shader.fragmentShader
    ].join('\n')
      .replace('#include <map_fragment>', `
        vec4 mg = texture2D(tGrass, vMUv);
        vec4 mr = texture2D(tRock, vMUv * 0.3);
        float macro = tNoise(vMUv * 0.9) * 0.6 + tNoise(vMUv * 2.6 + 7.0) * 0.4;
        mg.rgb *= mix(vec3(1.1, 1.03, 0.86), vec3(0.84, 0.95, 0.86), macro);
        // limestone breaks through where its texture is bright, so the grass/rock edge follows the rock relief
        float rw = smoothstep(0.35, 0.65, vRockW + (mr.r - 0.55) * 0.8);
        diffuseColor.rgb *= mix(mg.rgb, mr.rgb, rw);
      `)
      .replace('#include <normal_fragment_maps>', `
        vec3 mapN = mix(texture2D(tGrassN, vMUv).xyz, texture2D(tRockN, vMUv * 0.3).xyz, rw) * 2.0 - 1.0;
        mapN.xy *= normalScale;
        normal = normalize( tbn * mapN );
      `);
  };
  mat.customProgramCacheKey = () => 'empire-mountains-v2';
}

// Everything outside the playable rectangle is drawn as the same near-black mist as unexplored fog of war
// (see fog.ts), fading in over the first tiles past the edge. Chains onto any existing onBeforeCompile.
const MIST_FADE = 2.5; // tiles past the edge until the mist is fully dark
function applyOutsideMist(mat: THREE.Material, w: number, h: number, key: string): void {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uMapSize = { value: new THREE.Vector2(w, h) };
    shader.vertexShader = 'varying vec2 vOutXZ;\n' + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 outP = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        outP = instanceMatrix * outP;
      #endif
      vOutXZ = (modelMatrix * outP).xz;`);
    shader.fragmentShader = 'uniform vec2 uMapSize;\nvarying vec2 vOutXZ;\n' + shader.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      {
        vec2 od = max(max(-vOutXZ, vOutXZ - uMapSize), vec2(0.0));
        float outK = smoothstep(0.0, ${MIST_FADE.toFixed(1)}, length(od));
        vec2 mp = vOutXZ * 0.35;
        vec2 mi = floor(mp), mf = fract(mp); mf = mf * mf * (3.0 - 2.0 * mf);
        float h00 = fract(sin(dot(mi, vec2(127.1, 311.7))) * 43758.5453);
        float h10 = fract(sin(dot(mi + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5453);
        float h01 = fract(sin(dot(mi + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5453);
        float h11 = fract(sin(dot(mi + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5453);
        float mm = mix(mix(h00, h10, mf.x), mix(h01, h11, mf.x), mf.y);
        vec3 mistCol = mix(vec3(0.025, 0.03, 0.05), vec3(0.11, 0.12, 0.15), 0.15);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, mistCol, outK * (0.86 + 0.14 * mm));
      }`);
  };
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.customProgramCacheKey = () => prevKey() + '|outside-mist-' + key;
}

// ---- tree models: one merged geometry each (trunk + foliage), vertex colours, soft outward normals ----
class Builder {
  readonly p: number[] = [];
  readonly n: number[] = [];
  readonly c: number[] = [];
  readonly i: number[] = [];

  v(x: number, y: number, z: number, nx: number, ny: number, nz: number, col: Rgb): number {
    const l = Math.hypot(nx, ny, nz) || 1;
    this.p.push(x, y, z); this.n.push(nx / l, ny / l, nz / l); this.c.push(col[0], col[1], col[2]);
    return this.p.length / 3 - 1;
  }
  tri(a: number, b: number, c: number): void { this.i.push(a, b, c); }
  trunk(r0: number, r1: number, h: number, segs: number, col: Rgb): void {
    const base = this.p.length / 3;
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
      this.v(cx * r0, -0.1, cz * r0, cx, 0, cz, [col[0] * 0.6, col[1] * 0.6, col[2] * 0.6]);
      this.v(cx * r1, h, cz * r1, cx, 0, cz, col);
    }
    for (let s = 0; s < segs; s++) { const a = base + s * 2; this.tri(a, a + 1, a + 2); this.tri(a + 1, a + 3, a + 2); }
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    return g;
  }
}
const BARK = lin([0.3, 0.24, 0.19]);
const BEECH_BARK = lin([0.46, 0.44, 0.4]);
const NEEDLE_DARK = lin([0.07, 0.11, 0.07]);
const NEEDLE = lin([0.14, 0.21, 0.12]);
const NEEDLE_TIP = lin([0.25, 0.32, 0.16]);

// spruce: stacked drooping skirts with a ragged rim, each tier narrower; tips lighter, inside and low tiers darker
const scaled = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];

function coniferGeo(tiers: number, segs: number, seed: number): THREE.BufferGeometry {
  const B = new Builder();
  B.trunk(0.07, 0.03, 1.2, Math.max(3, segs - 3), BARK);
  const H = 2.9, base = 0.4, step = (H - base) / (tiers + 0.6);
  for (let k = 0; k < tiers; k++) {
    const yb = base + k * step, top = yb + step * 1.9, R = 0.6 * (1 - (k / tiers) * 0.75);
    const ao = 0.55 + 0.45 * (k / Math.max(1, tiers - 1));
    const apex = B.v(0, top, 0, 0, 1, 0, scaled(NEEDLE_TIP, 0.8 + ao * 0.3));
    const mid: number[] = [], rim: number[] = [];
    for (let s = 0; s < segs; s++) {
      const a = ((s + (k % 2) * 0.5) / segs) * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
      const rr = R * (s % 2 ? 0.82 : 1) * (0.92 + hash2(seed, k * 31 + s, 3) * 0.16);
      mid.push(B.v(cx * R * 0.5, top - step * 1.05, cz * R * 0.5, cx * 0.6, 1, cz * 0.6, scaled(NEEDLE_DARK, 0.7 + ao * 0.5)));
      rim.push(B.v(cx * rr, yb - step * 0.35, cz * rr, cx, 0.45, cz, [(NEEDLE[0] + (NEEDLE_TIP[0] - NEEDLE[0]) * 0.4) * ao, (NEEDLE[1] + (NEEDLE_TIP[1] - NEEDLE[1]) * 0.4) * ao, (NEEDLE[2] + (NEEDLE_TIP[2] - NEEDLE[2]) * 0.4) * ao]));
    }
    for (let s = 0; s < segs; s++) {
      const n = (s + 1) % segs;
      const ms = mid[s] ?? 0, mn = mid[n] ?? 0, rs = rim[s] ?? 0, rn = rim[n] ?? 0;
      B.tri(apex, mn, ms);
      B.tri(ms, mn, rs); B.tri(mn, rn, rs);
    }
  }
  return B.geometry();
}
// beech/oak: trunk and a clumpy crown of noise-displaced lobes; normals point away from the crown centre so the
// lobes shade as one canopy, vertex colours darken the underside and the gaps between lobes. The crown is near
// white so the instance colour sets the autumn hue.
function broadleafGeo(lobeCount: number, seed: number): THREE.BufferGeometry {
  const B = new Builder();
  B.trunk(0.08, 0.05, 1.15, lobeCount > 3 ? 6 : 4, BEECH_BARK);
  const parts = [B.geometry()];
  const r = (k: number): number => hash2(seed, k, 23), cy = 1.5;
  for (let li = 0; li < lobeCount; li++) {
    const a = (li / lobeCount) * Math.PI * 2 + r(li) * 0.8, up = li === 0 ? 1 : (r(li + 40) - 0.35) * 0.9;
    const off = li === 0 ? 0.32 : 0.42, rad = (li === 0 ? 0.5 : 0.36 + r(li + 80) * 0.14) * (lobeCount > 3 ? 1 : 1.35);
    const ox = li === 0 ? 0 : Math.cos(a) * off * Math.sqrt(1 - up * up * 0.5), oy = cy + up * off * 0.7, oz = li === 0 ? 0 : Math.sin(a) * off * Math.sqrt(1 - up * up * 0.5);
    let c: THREE.BufferGeometry = new THREE.IcosahedronGeometry(rad, 0);
    c.deleteAttribute('normal'); c.deleteAttribute('uv');
    c = mergeVertices(c);
    const p = c.getAttribute('position'), nrm: number[] = [], col: number[] = [], tint = 0.82 + r(li + 120) * 0.3;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) * (0.85 + hash2(i, seed + li, 5) * 0.3) + ox, y = p.getY(i) * (0.8 + hash2(i, seed + li, 6) * 0.25) + oy, z = p.getZ(i) * (0.85 + hash2(i, seed + li, 7) * 0.3) + oz;
      p.setXYZ(i, x, y, z);
      const ex = x, ey = (y - cy) * 1.3, ez = z, el = Math.hypot(ex, ey, ez) || 1;
      const lx = p.getX(i) - ox, ly = p.getY(i) - oy, lz = p.getZ(i) - oz, ll = Math.hypot(lx, ly, lz) || 1;
      nrm.push(ex / el * 0.7 + lx / ll * 0.3, ey / el * 0.7 + ly / ll * 0.3 + 0.15, ez / el * 0.7 + lz / ll * 0.3);
      const k = (0.45 + 0.55 * Math.min(1, Math.max(0, (ey / el + 0.7) / 1.5))) * (0.75 + 0.25 * Math.min(1, el / 0.8)) * tint;
      col.push(k * 1.02, k, k * 0.95);
    }
    c.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    c.normalizeNormals();
    c.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    parts.push(c);
  }
  const g = mergeGeometries(parts);
  parts.forEach((q) => q.dispose());
  return g;
}
const AUTUMN: readonly Rgb[] = [[0.44, 0.28, 0.14], [0.48, 0.37, 0.17], [0.37, 0.24, 0.12], [0.3, 0.32, 0.15], [0.24, 0.29, 0.13], [0.4, 0.33, 0.18], [0.28, 0.31, 0.14]];

export function buildMountains(w: number, h: number, edgeHeight: HeightAt, lib: TextureLib): Mountains {
  const x0 = -BORDER, y0 = -BORDER;
  const nx = Math.round((w + BORDER * 2) / STEP) + 1;
  const ny = Math.round((h + BORDER * 2) / STEP) + 1;
  const spanX = w + BORDER * 2, spanY = h + BORDER * 2;
  const heights = new Float32Array(nx * ny);
  const pos = new Float32Array(nx * ny * 3);
  const uv = new Float32Array(nx * ny * 2);

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * STEP, y = y0 + j * STEP;
      // distance outside the playable rectangle (0 on and inside the edge)
      const dx = Math.max(-x, x - w, 0), dy = Math.max(-y, y - h, 0);
      const d = Math.hypot(dx, dy);
      const u = (x - x0) / spanX, v = (y - y0) / spanY;
      const edge = edgeHeight(Math.max(0, Math.min(w, x)), Math.max(0, Math.min(h, y)));
      let hgt = edge;
      if (d > 0) {
        const foot = smooth(0, FOOTHILL, d) * (0.4 + fbm(u, v, 9, 3, 101) * 1.4);
        const ridge = ridged(u, v, 5, 5, 211);
        const mass = fbm(u, v, 3, 3, 307);
        const peak = (3 + ridge * 15 + mass * 7) * smooth(FOOTHILL * 0.6, RAMP, d) * (0.75 + Math.min(1, d / 50) * 0.45);
        // occasional valleys keep the ring from looking like a uniform wall
        const valley = 1 - smooth(0.62, 0.8, fbm(u, v, 4, 2, 401)) * 0.55 * smooth(RAMP, RAMP * 2.2, d);
        hgt = mix(edge, foot + peak * valley, smooth(0, 1.5, d));
      }
      const vi = j * nx + i;
      heights[vi] = hgt;
      pos[vi * 3] = x; pos[vi * 3 + 1] = hgt; pos[vi * 3 + 2] = y;
      // same world mapping as the terrain (0.5 per tile) so the grass continues seamlessly over the map edge
      uv[vi * 2] = x * 0.5; uv[vi * 2 + 1] = y * 0.5;
    }
  }

  // only quads outside the map: the playable terrain mesh covers the inside
  const tris: number[] = [];
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const qx = x0 + i * STEP, qy = y0 + j * STEP;
      if (qx >= 0 && qx + STEP <= w && qy >= 0 && qy + STEP <= h) continue;
      const a = j * nx + i, b = (j + 1) * nx + i, c = j * nx + i + 1, e = (j + 1) * nx + i + 1;
      tris.push(a, b, c, b, e, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(tris), 1));
  geo.computeVertexNormals();

  // tint by altitude, slope and noise: grass foothills, mixed autumn forest floor, bare limestone, snowy crests
  const nrm = geo.getAttribute('normal');
  const col = new Float32Array(nx * ny * 3);
  const rockA = new Float32Array(nx * ny);
  for (let vi = 0; vi < nx * ny; vi++) {
    const x = pos[vi * 3] ?? 0, y = pos[vi * 3 + 2] ?? 0, hgt = heights[vi] ?? 0;
    const u = (x - x0) / spanX, v = (y - y0) / spanY;
    const steep = 1 - nrm.getY(vi); // 0 flat .. 1 vertical
    const n = fbm(u, v, 24, 3, 503);
    const forest = smooth(0.6, 3, hgt) * (1 - smooth(17, 23, hgt + n * 4)) * (1 - smooth(0.55, 0.75, steep));
    const autumn = smooth(0.45, 0.7, fbm(u, v, 14, 2, 601));
    const rock = Math.max(smooth(0.45, 0.7, steep), smooth(19, 25, hgt + n * 4));
    const snow = smooth(22, 27, hgt + n * 5) * (1 - smooth(0.45, 0.65, steep));
    for (const k of [0, 1, 2] as const) {
      let val = T_MEADOW[k];
      val = mix(val, mix(T_FOREST[k], T_AUTUMN[k], autumn * 0.6), forest);
      val = mix(val, T_ROCK[k], rock);
      val = mix(val, T_SNOW[k], snow);
      col[vi * 3 + k] = val * (0.85 + n * 0.3);
    }
    rockA[vi] = Math.max(rock, snow);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('rockW', new THREE.BufferAttribute(rockA, 1));
  geo.computeBoundingSphere();

  const grassSet = lib.set('deadGrass', { size: 512, normalStrength: 1.6 });
  const rockSet = lib.set('envRock');
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0, normalMap: rockSet.normalMap, normalScale: new THREE.Vector2(0.8, 0.8)
  });
  patchMountainShader(mat, grassSet, rockSet);
  applyOutsideMist(mat, w, h, 'mountains');
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'EmpireMountains';

  const group = new THREE.Group();
  group.add(mesh);
  const disposables: Array<{ dispose(): void }> = [geo, mat];

  // far ground under and beyond the ring so no gap ever shows the sky colour from above
  const farGeo = new THREE.PlaneGeometry(4000, 4000);
  farGeo.rotateX(-Math.PI / 2);
  const farMat = new THREE.MeshStandardMaterial({ color: 0x2c3320, roughness: 1, metalness: 0 });
  applyOutsideMist(farMat, w, h, 'far');
  const far = new THREE.Mesh(farGeo, farMat);
  far.position.set(w / 2, -1.5, h / 2);
  far.name = 'EmpireFarGround';
  group.add(far);
  disposables.push(farGeo, farMat);

  // instanced trees on the forested band, split by the map side they stand on so whole sides frustum-cull
  const heightAt: HeightAt = (x, y) => {
    const gx = Math.max(0, Math.min(nx - 1.001, (x - x0) / STEP)), gy = Math.max(0, Math.min(ny - 1.001, (y - y0) / STEP));
    const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j;
    const a = heights[j * nx + i] ?? 0, b = heights[j * nx + i + 1] ?? 0, c = heights[(j + 1) * nx + i] ?? 0, d = heights[(j + 1) * nx + i + 1] ?? 0;
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const kinds = ['coniferNear', 'coniferFar', 'broadNear', 'broadFar'];
  const lists = kinds.map((): [TreeInstance[], TreeInstance[], TreeInstance[], TreeInstance[]] => [[], [], [], []]);
  for (let ty = y0; ty < h + BORDER; ty += 1) {
    for (let tx = x0; tx < w + BORDER; tx += 1) {
      const dx = Math.max(-tx, tx - w, 0), dy = Math.max(-ty, ty - h, 0);
      const d = Math.hypot(dx, dy);
      if (d < 1.5 || d > 40) continue; // trees thin out with distance where fog hides them anyway
      const r = (k: number): number => hash2(tx + 5000, ty + 5000, k);
      if (d > NEAR && r(7) > 1 - (d - NEAR) / 34) continue;
      const x = tx + r(1), y = ty + r(2);
      const hgt = heightAt(x, y);
      const slope = Math.abs(heightAt(x + 0.5, y) - heightAt(x - 0.5, y)) + Math.abs(heightAt(x, y + 0.5) - heightAt(x, y - 0.5));
      if (hgt < 0.5 || hgt > 19 || slope > 2.6) continue;
      const u = (x - x0) / spanX, v = (y - y0) / spanY;
      const dens = fbm(u, v, 18, 2, 701);
      if (r(3) > dens * 1.5) continue;
      const s = 0.6 + r(4) * 0.55;
      const side = Math.abs(x - w / 2) * h > Math.abs(y - h / 2) * w ? (x < w / 2 ? 0 : 1) : (y < h / 2 ? 2 : 3);
      // conifers dominate higher up, beech lower down
      const conifer = r(5) < 0.45 + smooth(4, 14, hgt) * 0.4;
      lists[(conifer ? 0 : 2) + (d > NEAR ? 1 : 0)]?.[side]?.push([x, hgt, y, s, r(6) * 6.28, r(8)]);
    }
  }
  const geos = [coniferGeo(4, 7, 11), coniferGeo(2, 5, 13), broadleafGeo(5, 17), broadleafGeo(2, 19)];
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  // open conifer skirts are seen from below too: keep the outward normal on back faces so they stay lit like foliage
  treeMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize( vNormal );\n nonPerturbedNormal = normal;');
  };
  treeMat.customProgramCacheKey = () => 'empire-trees-v2';
  applyOutsideMist(treeMat, w, h, 'trees');
  disposables.push(treeMat, ...geos);
  const tmp = new THREE.Object3D(), tc = new THREE.Color();
  kinds.forEach((kind, ki) => {
    const geoK = geos[ki];
    for (const list of lists[ki] ?? []) {
      if (!list.length || !geoK) continue;
      const im = new THREE.InstancedMesh(geoK, treeMat, list.length);
      list.forEach(([x, y, z, s, rot, c], i) => {
        tmp.position.set(x, y - 0.05, z);
        tmp.rotation.set(0, rot, 0);
        tmp.scale.set(s, s * (0.85 + (rot % 1) * 0.35), s);
        tmp.updateMatrix();
        im.setMatrixAt(i, tmp.matrix);
        if (ki < 2) tc.setRGB(0.85 + c * 0.3, 0.9 + c * 0.2, 0.85 + c * 0.2);
        else { const a = AUTUMN[Math.floor(c * AUTUMN.length)] ?? T_AUTUMN; tc.setRGB(a[0], a[1], a[2], THREE.SRGBColorSpace); }
        im.setColorAt(i, tc);
      });
      im.castShadow = false; im.receiveShadow = true;
      im.computeBoundingSphere();
      im.name = 'EmpireTrees_' + kind;
      group.add(im);
    }
  });

  return {
    group,
    dispose() {
      group.removeFromParent();
      for (const d of disposables) d.dispose();
    }
  };
}
