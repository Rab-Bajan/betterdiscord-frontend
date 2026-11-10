// Scenery ring around the playable map: foothills that start flush with the map edge and rise into
// forested, rocky Bükk-style ridges with a dusting of snow on the peaks, plus a far ground plane so
// the camera never looks into empty space. Purely visual: not pickable, not fogged, no gameplay.
import * as THREE from 'three';
import { vnoise, hash2 } from './textures.js';

const BORDER = 72; // tiles of scenery outside each map edge
const STEP = 1; // grid spacing in tiles
const FOOTHILL = 3; // tiles of gentle slope before the ridges start
const RAMP = 22; // tiles until the ridges reach full height

const smooth = (a, b, t) => { const k = Math.max(0, Math.min(1, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
const mix = (a, b, t) => a + (b - a) * t;

function fbm(u, v, period, octaves, seed) {
  let sum = 0, amp = 0.5, norm = 0, p = period;
  for (let o = 0; o < octaves; o++) { sum += amp * vnoise(u, v, p, seed + o * 31); norm += amp; amp *= 0.5; p *= 2; }
  return sum / norm;
}
// ridged noise: sharp crests instead of round blobs
function ridged(u, v, period, octaves, seed) {
  let sum = 0, amp = 0.5, norm = 0, p = period;
  for (let o = 0; o < octaves; o++) {
    const n = 1 - Math.abs(vnoise(u, v, p, seed + o * 13) * 2 - 1);
    sum += amp * n * n; norm += amp; amp *= 0.5; p *= 2;
  }
  return sum / norm;
}

const C_GRASS = [0.25, 0.25, 0.14];
const C_FOREST = [0.1, 0.14, 0.07];
const C_AUTUMN = [0.26, 0.16, 0.07];
const C_ROCK = [0.3, 0.29, 0.27];
const C_SNOW = [0.78, 0.8, 0.83];

export function buildMountains(w, h, edgeHeight, lib) {
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
      uv[vi * 2] = x * 0.9; uv[vi * 2 + 1] = y * 0.9;
    }
  }

  // only quads outside the map: the playable terrain mesh covers the inside
  const tris = [];
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

  // colour by altitude, slope and noise: grass foothills, mixed autumn forest, bare rock, snowy crests
  const nrm = geo.getAttribute('normal');
  const col = new Float32Array(nx * ny * 3);
  for (let vi = 0; vi < nx * ny; vi++) {
    const x = pos[vi * 3], y = pos[vi * 3 + 2], hgt = heights[vi];
    const u = (x - x0) / spanX, v = (y - y0) / spanY;
    const steep = 1 - nrm.getY(vi); // 0 flat .. 1 vertical
    const n = fbm(u, v, 24, 3, 503);
    const forest = smooth(0.6, 3, hgt) * (1 - smooth(17, 23, hgt + n * 4)) * (1 - smooth(0.55, 0.75, steep));
    const autumn = smooth(0.45, 0.7, fbm(u, v, 14, 2, 601));
    const rock = Math.max(smooth(0.5, 0.72, steep), smooth(19, 25, hgt + n * 4));
    const snow = smooth(22, 27, hgt + n * 5) * (1 - smooth(0.45, 0.65, steep));
    const c = [0, 1, 2].map((k) => {
      let val = C_GRASS[k];
      val = mix(val, mix(C_FOREST[k], C_AUTUMN[k], autumn * 0.6), forest);
      val = mix(val, C_ROCK[k], rock);
      val = mix(val, C_SNOW[k], snow);
      return val * (0.7 + n * 0.25);
    });
    col[vi * 3] = c[0]; col[vi * 3 + 1] = c[1]; col[vi * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();

  const rockSet = lib.set('gravel', { normalStrength: 2.4 });
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.96, metalness: 0, normalMap: rockSet.normalMap, normalScale: new THREE.Vector2(0.55, 0.55)
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'EmpireMountains';

  const group = new THREE.Group();
  group.add(mesh);
  const disposables = [geo, mat];

  // far ground under and beyond the ring so no gap ever shows the sky colour from above
  const farGeo = new THREE.PlaneGeometry(4000, 4000);
  farGeo.rotateX(-Math.PI / 2);
  const farMat = new THREE.MeshStandardMaterial({ color: 0x2c3320, roughness: 1, metalness: 0 });
  const far = new THREE.Mesh(farGeo, farMat);
  far.position.set(w / 2, -1.5, h / 2);
  far.name = 'EmpireFarGround';
  group.add(far);
  disposables.push(farGeo, farMat);

  // instanced trees on the forested band (conifers and bare autumn broadleaves)
  const heightAt = (x, y) => {
    const gx = Math.max(0, Math.min(nx - 1.001, (x - x0) / STEP)), gy = Math.max(0, Math.min(ny - 1.001, (y - y0) / STEP));
    const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j;
    const a = heights[j * nx + i], b = heights[j * nx + i + 1], c = heights[(j + 1) * nx + i], d = heights[(j + 1) * nx + i + 1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const conifers = [], broad = [];
  for (let ty = y0; ty < h + BORDER; ty += 1) {
    for (let tx = x0; tx < w + BORDER; tx += 1) {
      const dx = Math.max(-tx, tx - w, 0), dy = Math.max(-ty, ty - h, 0);
      const d = Math.hypot(dx, dy);
      if (d < 1.5 || d > 46) continue; // trees thin out with distance where fog hides them anyway
      const r = (k) => hash2(tx + 5000, ty + 5000, k);
      const x = tx + r(1), y = ty + r(2);
      const hgt = heightAt(x, y);
      const slope = Math.abs(heightAt(x + 0.5, y) - heightAt(x - 0.5, y)) + Math.abs(heightAt(x, y + 0.5) - heightAt(x, y - 0.5));
      if (hgt < 0.5 || hgt > 19 || slope > 2.6) continue;
      const u = (x - x0) / spanX, v = (y - y0) / spanY;
      const dens = fbm(u, v, 18, 2, 701);
      if (r(3) > dens * 1.5) continue;
      const s = 0.5 + r(4) * 0.45;
      (r(5) < 0.65 ? conifers : broad).push([x, hgt, y, s, r(6) * 6.28]);
    }
  }
  const tmp = new THREE.Object3D();
  const addInst = (geom, material, list, place) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geom, material, list.length);
    list.forEach((it, i) => { place(it, tmp); tmp.updateMatrix(); im.setMatrixAt(i, tmp.matrix); });
    im.castShadow = false; im.receiveShadow = true;
    im.computeBoundingSphere();
    group.add(im);
    disposables.push(geom);
  };
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1c, roughness: 1, metalness: 0 });
  const pineMat = new THREE.MeshStandardMaterial({ color: 0x1d2b19, roughness: 0.95, metalness: 0, flatShading: true });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x6b4520, roughness: 0.95, metalness: 0, flatShading: true });
  disposables.push(trunkMat, pineMat, leafMat);
  const trunkGeo = new THREE.CylinderGeometry(0.07, 0.11, 1, 5);
  trunkGeo.translate(0, 0.5, 0);
  const pineGeo = new THREE.ConeGeometry(0.55, 2.2, 6);
  pineGeo.translate(0, 1.7, 0);
  const crownGeo = new THREE.IcosahedronGeometry(0.75, 0);
  crownGeo.translate(0, 1.5, 0);
  const all = conifers.concat(broad);
  addInst(trunkGeo, trunkMat, all, ([x, y, z, s, rot], t) => { t.position.set(x, y - 0.05, z); t.rotation.set(0, rot, 0); t.scale.set(s, s * 1.1, s); });
  addInst(pineGeo, pineMat, conifers, ([x, y, z, s, rot], t) => { t.position.set(x, y - 0.05, z); t.rotation.set(0, rot, 0); t.scale.set(s, s * (0.9 + (rot % 1) * 0.4), s); });
  addInst(crownGeo, leafMat, broad, ([x, y, z, s, rot], t) => { t.position.set(x, y - 0.05, z); t.rotation.set(rot, rot * 0.5, 0); t.scale.set(s, s * 0.85, s); });

  return {
    group,
    dispose() {
      group.removeFromParent();
      for (const d of disposables) d.dispose();
    }
  };
}
