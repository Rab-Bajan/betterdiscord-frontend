// One merged terrain mesh for the whole map: vertex colours for large-scale tint, per-vertex splat
// weights (dead grass / mud / gravel / cracked concrete) blended in the fragment shader with the
// procedural albedo+roughness and normal maps. Water tiles get an opaque, glossy, env-mapped surface;
// ruins and grass get instanced rubble and weeds.
import * as THREE from 'three';
import { TILE_CODE } from '../empireStore.js';
import { vnoise, hash2 } from './textures.js';

const SUB = 2; // vertices per tile edge
export const WATER_Y = -0.14;

// tile code -> splat weights [grass, mud, gravel, concrete]
const SPLAT = {
  [TILE_CODE.g]: [1, 0, 0, 0],
  [TILE_CODE.d]: [0, 1, 0, 0],
  [TILE_CODE.r]: [0, 0.15, 0.85, 0],
  [TILE_CODE.c]: [0, 0, 0.1, 0.9],
  [TILE_CODE.w]: [0, 1, 0, 0],
  [TILE_CODE.x]: [0, 0.1, 0.45, 0.45]
};

function patchTerrainShader(mat, albedo, normals) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tAlb0 = { value: albedo[0] }; shader.uniforms.tAlb1 = { value: albedo[1] };
    shader.uniforms.tAlb2 = { value: albedo[2] }; shader.uniforms.tAlb3 = { value: albedo[3] };
    shader.uniforms.tNor0 = { value: normals[0] }; shader.uniforms.tNor1 = { value: normals[1] };
    shader.uniforms.tNor2 = { value: normals[2] }; shader.uniforms.tNor3 = { value: normals[3] };
    shader.vertexShader = 'attribute vec4 splat;\nvarying vec4 vSplat;\nvarying vec2 vTUv;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\n vSplat = splat;\n vTUv = uv;'
    );
    shader.fragmentShader = [
      'uniform sampler2D tAlb0; uniform sampler2D tAlb1; uniform sampler2D tAlb2; uniform sampler2D tAlb3;',
      'uniform sampler2D tNor0; uniform sampler2D tNor1; uniform sampler2D tNor2; uniform sampler2D tNor3;',
      'varying vec4 vSplat; varying vec2 vTUv;',
      shader.fragmentShader
    ].join('\n')
      .replace('#include <map_fragment>', `
        vec2 tuvA = vTUv;
        vec2 tuvB = vTUv * 0.37 + vec2(0.31, 0.17);
        vec4 a0 = mix(texture2D(tAlb0, tuvA), texture2D(tAlb0, tuvB), 0.35);
        vec4 a1 = mix(texture2D(tAlb1, tuvA), texture2D(tAlb1, tuvB), 0.35);
        vec4 a2 = texture2D(tAlb2, tuvA);
        vec4 a3 = texture2D(tAlb3, tuvA * 0.5);
        // height-aware blend: brighter (higher) texels win at the borders
        vec4 hw = vSplat * vec4(0.6 + dot(a0.rgb, vec3(0.6)), 0.5 + dot(a1.rgb, vec3(0.9)), 0.7 + dot(a2.rgb, vec3(0.5)), 0.7 + dot(a3.rgb, vec3(0.4)));
        hw = pow(hw + 1e-4, vec4(3.0));
        hw /= (hw.x + hw.y + hw.z + hw.w);
        vec4 splatAlb = a0 * hw.x + a1 * hw.y + a2 * hw.z + a3 * hw.w;
        diffuseColor.rgb *= splatAlb.rgb;
      `)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * splatAlb.a;')
      .replace('#include <normal_fragment_maps>', `
        vec3 mapN = (texture2D(tNor0, tuvA).xyz * hw.x + texture2D(tNor1, tuvA).xyz * hw.y + texture2D(tNor2, tuvA).xyz * hw.z + texture2D(tNor3, tuvA * 0.5).xyz * hw.w) * 2.0 - 1.0;
        mapN.xy *= normalScale;
        normal = normalize( tbn * mapN );
      `);
  };
  mat.customProgramCacheKey = () => 'empire-terrain-splat';
}

export function buildTerrain(store, lib) {
  const { w, h } = store.map;
  const codes = store.codes;
  const nx = w * SUB + 1, ny = h * SUB + 1;
  const heights = new Float32Array(nx * ny);
  const code = (tx, ty) => codes[Math.max(0, Math.min(h - 1, ty)) * w + Math.max(0, Math.min(w - 1, tx))];

  const pos = new Float32Array(nx * ny * 3);
  const col = new Float32Array(nx * ny * 3);
  const spl = new Float32Array(nx * ny * 4);
  const uv = new Float32Array(nx * ny * 2);
  const wgt = [0, 0, 0, 0];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const vx = i / SUB, vy = j / SUB;
      // bilinear weights of the four nearest tile centres
      const px = vx - 0.5, py = vy - 0.5;
      const tx = Math.floor(px), ty = Math.floor(py);
      const fx = px - tx, fy = py - ty;
      wgt[0] = wgt[1] = wgt[2] = wgt[3] = 0;
      let water = 0, ruin = 0, conc = 0, road = 0;
      const corners = [[tx, ty, (1 - fx) * (1 - fy)], [tx + 1, ty, fx * (1 - fy)], [tx, ty + 1, (1 - fx) * fy], [tx + 1, ty + 1, fx * fy]];
      for (const [cx, cy, k] of corners) {
        const c = code(cx, cy);
        const s = SPLAT[c] || SPLAT[0];
        for (let q = 0; q < 4; q++) wgt[q] += s[q] * k;
        if (c === TILE_CODE.w) water += k;
        if (c === TILE_CODE.x) ruin += k;
        if (c === TILE_CODE.c) conc += k;
        if (c === TILE_CODE.r) road += k;
      }
      const u = vx / w, v = vy / h;
      let hgt = (vnoise(u, v, 7, 11) - 0.5) * 0.22 + (vnoise(u, v, 23, 13) - 0.5) * 0.08;
      hgt *= 1 - conc * 0.75 - road * 0.5;
      hgt -= road * 0.03;
      hgt += ruin * (vnoise(u, v, 60, 17) * 0.25);
      hgt -= water * water * 0.55;
      const vi = j * nx + i;
      heights[vi] = hgt;
      pos[vi * 3] = vx; pos[vi * 3 + 1] = hgt; pos[vi * 3 + 2] = vy;
      const tint = 0.82 + vnoise(u, v, 11, 19) * 0.28;
      const wet = Math.min(1, water * 1.6);
      col[vi * 3] = tint * (1 - wet * 0.45) * (1 - ruin * 0.15);
      col[vi * 3 + 1] = tint * (1 - wet * 0.4) * (1 - ruin * 0.15);
      col[vi * 3 + 2] = tint * (1 - wet * 0.32) * (1 - ruin * 0.12);
      spl[vi * 4] = wgt[0]; spl[vi * 4 + 1] = wgt[1]; spl[vi * 4 + 2] = wgt[2]; spl[vi * 4 + 3] = wgt[3];
      uv[vi * 2] = vx * 0.5; uv[vi * 2 + 1] = vy * 0.5;
    }
  }
  const idx = new Uint32Array((nx - 1) * (ny - 1) * 6);
  let o = 0;
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = (j + 1) * nx + i, c = j * nx + i + 1, d = (j + 1) * nx + i + 1;
      idx[o++] = a; idx[o++] = b; idx[o++] = c;
      idx[o++] = b; idx[o++] = d; idx[o++] = c;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('splat', new THREE.BufferAttribute(spl, 4));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const kinds = ['deadGrass', 'mud', 'gravel', 'concrete'];
  const sets = kinds.map((k) => lib.set(k, { normalStrength: k === 'gravel' ? 3 : 2.2 }));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, normalMap: sets[0].normalMap, normalScale: new THREE.Vector2(1, 1) });
  patchTerrainShader(mat, sets.map((s) => s.map), sets.map((s) => s.normalMap));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'EmpireTerrain';

  const group = new THREE.Group();
  group.add(mesh);
  const disposables = [geo, mat];

  // ---- water ----
  const waterQuads = [];
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) if (codes[ty * w + tx] === TILE_CODE.w) waterQuads.push(tx, ty);
  let waterMat = null;
  if (waterQuads.length) {
    const n = waterQuads.length / 2;
    const wp = new Float32Array(n * 12), wuv = new Float32Array(n * 8), wn = new Float32Array(n * 12);
    const wi = new Uint32Array(n * 6);
    const m = 0.5;
    for (let q = 0; q < n; q++) {
      const x0 = waterQuads[q * 2] - m, y0 = waterQuads[q * 2 + 1] - m, x1 = x0 + 1 + m * 2, y1 = y0 + 1 + m * 2;
      const corners = [[x0, y0], [x0, y1], [x1, y0], [x1, y1]];
      corners.forEach(([cx, cy], k) => {
        wp[q * 12 + k * 3] = cx; wp[q * 12 + k * 3 + 1] = WATER_Y; wp[q * 12 + k * 3 + 2] = cy;
        wn[q * 12 + k * 3 + 1] = 1;
        wuv[q * 8 + k * 2] = cx * 0.25; wuv[q * 8 + k * 2 + 1] = cy * 0.25;
      });
      const b = q * 4;
      wi.set([b, b + 1, b + 2, b + 1, b + 3, b + 2], q * 6);
    }
    const wgeo = new THREE.BufferGeometry();
    wgeo.setAttribute('position', new THREE.BufferAttribute(wp, 3));
    wgeo.setAttribute('normal', new THREE.BufferAttribute(wn, 3));
    wgeo.setAttribute('uv', new THREE.BufferAttribute(wuv, 2));
    wgeo.setIndex(new THREE.BufferAttribute(wi, 1));
    const wset = lib.set('water', { normalStrength: 1.4 });
    waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x1d2a26, roughness: 0.05, metalness: 0.0, normalMap: wset.normalMap, normalScale: new THREE.Vector2(0.35, 0.35),
      envMapIntensity: 1.4, clearcoat: 0.6, clearcoatRoughness: 0.08, reflectivity: 0.7
    });
    const water = new THREE.Mesh(wgeo, waterMat);
    water.receiveShadow = true;
    water.name = 'EmpireWater';
    group.add(water);
    disposables.push(wgeo, waterMat);
  }

  // ---- static props: rubble on ruins, weeds on grass, tyres on mud ----
  const heightAt = (x, y) => {
    const gx = Math.max(0, Math.min(nx - 1.001, x * SUB)), gy = Math.max(0, Math.min(ny - 1.001, y * SUB));
    const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j;
    const a = heights[j * nx + i], b = heights[j * nx + i + 1], c = heights[(j + 1) * nx + i], d = heights[(j + 1) * nx + i + 1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const rubble = [], rebar = [], weeds = [], tyres = [];
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const c = codes[ty * w + tx];
      const r = (k) => hash2(tx, ty, k);
      if (c === TILE_CODE.x) {
        for (let k = 0; k < 6; k++) rubble.push([tx + r(k * 3 + 1), ty + r(k * 3 + 2), 0.12 + r(k * 3 + 3) * 0.32, r(k + 40) * 6.28]);
        if (r(90) > 0.4) rebar.push([tx + r(91), ty + r(92), r(93)]);
      } else if (c === TILE_CODE.g && r(5) > 0.62) {
        weeds.push([tx + r(6), ty + r(7), 0.6 + r(8) * 0.8]);
      } else if ((c === TILE_CODE.d || c === TILE_CODE.g) && r(9) > 0.985) {
        tyres.push([tx + r(10), ty + r(11), r(12) * 6.28]);
      }
    }
  }
  const tmp = new THREE.Object3D();
  const addInst = (geom, material, list, place, shadow = true) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geom, material, list.length);
    list.forEach((it, i) => { place(it, tmp); tmp.updateMatrix(); im.setMatrixAt(i, tmp.matrix); });
    im.castShadow = shadow; im.receiveShadow = true;
    im.frustumCulled = false;
    group.add(im);
    disposables.push(geom);
  };
  const crumble = lib.set('crumble');
  const rubbleMat = new THREE.MeshStandardMaterial({ map: crumble.map, normalMap: crumble.normalMap, roughnessMap: crumble.ormMap, roughness: 1, metalness: 0 });
  const rustSet = lib.set('rust');
  const rebarMat = new THREE.MeshStandardMaterial({ map: rustSet.map, roughness: 0.9, metalness: 0.4 });
  const weedMat = new THREE.MeshStandardMaterial({ color: 0x6b6436, roughness: 1, metalness: 0 });
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.85, metalness: 0 });
  disposables.push(rubbleMat, rebarMat, weedMat, tyreMat);
  addInst(new THREE.DodecahedronGeometry(0.5, 0), rubbleMat, rubble, ([x, y, s, rot], t) => {
    t.position.set(x, heightAt(x, y) + s * 0.2, y); t.rotation.set(rot, rot * 0.7, rot * 1.3); t.scale.set(s * 1.3, s * 0.7, s);
  });
  addInst(new THREE.CylinderGeometry(0.02, 0.02, 1, 5), rebarMat, rebar, ([x, y, k], t) => {
    t.position.set(x, heightAt(x, y) + 0.25, y); t.rotation.set(0.3 + k, k * 4, 0.4 - k); t.scale.set(1, 0.6 + k * 0.4, 1);
  });
  addInst(new THREE.ConeGeometry(0.09, 0.28, 5, 1, true), weedMat, weeds, ([x, y, s], t) => {
    t.position.set(x, heightAt(x, y) + 0.12 * s, y); t.rotation.set(0, x * 3, 0); t.scale.set(s, s, s);
  }, false);
  addInst(new THREE.TorusGeometry(0.2, 0.08, 6, 12), tyreMat, tyres, ([x, y, rot], t) => {
    t.position.set(x, heightAt(x, y) + 0.06, y); t.rotation.set(Math.PI / 2 + 0.15, 0, rot); t.scale.set(1, 1, 1);
  });

  return {
    group,
    heightAt,
    geometry: geo,
    update(time) {
      if (waterMat?.normalMap) {
        waterMat.normalMap.offset.set(time * 0.013, time * 0.008);
      }
    },
    dispose() {
      group.removeFromParent();
      for (const d of disposables) d.dispose();
    }
  };
}
