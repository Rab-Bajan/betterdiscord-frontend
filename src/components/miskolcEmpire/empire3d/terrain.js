// One merged terrain mesh for the whole map: vertex colours for large-scale tint, per-vertex splat
// weights (dead grass / mud / gravel / cracked concrete) blended in the fragment shader with the
// procedural albedo+roughness and normal maps, plus a per-vertex wetness that darkens and glosses the
// ground along shores. Water tiles get a depth-tinted, alpha-blended, env-mapped surface with two
// drifting ripple layers; ground clutter comes from groundProps.js.
import * as THREE from 'three';
import { TILE_CODE } from '../empireStore.js';
import { vnoise } from './textures.js';
import { buildGroundProps } from './groundProps.js';
const SUB = 2; // vertices per tile edge
export const WATER_Y = -0.14;

// tile code -> splat weights [grass, mud, gravel, concrete]
const SPLAT = {
  [TILE_CODE.g]: [1, 0, 0, 0],
  [TILE_CODE.d]: [0, 1, 0, 0],
  [TILE_CODE.r]: [0, 0.15, 0.85, 0],
  [TILE_CODE.c]: [0, 0, 0.1, 0.9],
  [TILE_CODE.w]: [0, 1, 0, 0],
  [TILE_CODE.x]: [0, 0.35, 0.45, 0.2]
};

// value noise in the shader for macro variation (world-space, so it never repeats with the textures)
export const NOISE_GLSL = `
  float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float tNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), f.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }`;

function patchTerrainShader(mat, albedo, normals) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tAlb0 = { value: albedo[0] }; shader.uniforms.tAlb1 = { value: albedo[1] };
    shader.uniforms.tAlb2 = { value: albedo[2] }; shader.uniforms.tAlb3 = { value: albedo[3] };
    shader.uniforms.tNor0 = { value: normals[0] }; shader.uniforms.tNor1 = { value: normals[1] };
    shader.uniforms.tNor2 = { value: normals[2] }; shader.uniforms.tNor3 = { value: normals[3] };
    shader.vertexShader = 'attribute vec4 splat;\nattribute float wet;\nvarying vec4 vSplat;\nvarying vec2 vTUv;\nvarying float vWet;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\n vSplat = splat;\n vTUv = uv;\n vWet = wet;'
    );
    shader.fragmentShader = [
      'uniform sampler2D tAlb0; uniform sampler2D tAlb1; uniform sampler2D tAlb2; uniform sampler2D tAlb3;',
      'uniform sampler2D tNor0; uniform sampler2D tNor1; uniform sampler2D tNor2; uniform sampler2D tNor3;',
      'varying vec4 vSplat; varying vec2 vTUv; varying float vWet;',
      NOISE_GLSL,
      // normal of a sample taken at the 90-degree rotated uv, expressed in the unrotated tangent frame
      'vec3 unrot(vec3 n) { return vec3(n.y, -n.x, n.z); }',
      shader.fragmentShader
    ].join('\n')
      .replace('#include <map_fragment>', `
        // anti-tiling: every layer cross-fades to a 90-degree rotated copy in noisy world-space patches
        vec2 tuvA = vTUv;
        vec2 tuvR = vec2(-tuvA.y, tuvA.x) + vec2(0.5, 0.0); // 90-degree turn keeps concrete joints on tile edges
        float rotW = smoothstep(0.4, 0.6, tNoise(vTUv * 1.7 + 3.1));
        float macro = tNoise(vTUv * 0.9) * 0.6 + tNoise(vTUv * 2.6 + 7.0) * 0.4;
        vec4 a0 = vec4(0.5), a1 = vec4(0.5), a2 = vec4(0.5), a3 = vec4(0.5);
        if (vSplat.x > 0.001) a0 = mix(texture2D(tAlb0, tuvA), texture2D(tAlb0, tuvR), rotW);
        if (vSplat.y > 0.001) a1 = mix(texture2D(tAlb1, tuvA), texture2D(tAlb1, tuvR), rotW);
        if (vSplat.z > 0.001) a2 = mix(texture2D(tAlb2, tuvA), texture2D(tAlb2, tuvR), rotW);
        if (vSplat.w > 0.001) a3 = mix(texture2D(tAlb3, tuvA), texture2D(tAlb3, tuvR), rotW);
        // macro tint: grass drifts between straw and olive, the rest between lighter and darker patches
        a0.rgb *= mix(vec3(1.1, 1.03, 0.86), vec3(0.84, 0.95, 0.86), macro);
        a1.rgb *= 0.82 + macro * 0.32; a2.rgb *= 0.88 + macro * 0.22; a3.rgb *= 0.82 + macro * 0.3;
        // height-aware blend: brighter (higher) texels win at material borders, sharpened
        vec4 hw = vSplat * vec4(0.55 + dot(a0.rgb, vec3(0.7)), 0.5 + dot(a1.rgb, vec3(0.9)), 0.6 + dot(a2.rgb, vec3(0.6)), 0.7 + dot(a3.rgb, vec3(0.35)));
        hw = pow(hw + 1e-4, vec4(4.0));
        hw /= (hw.x + hw.y + hw.z + hw.w);
        vec4 splatAlb = a0 * hw.x + a1 * hw.y + a2 * hw.z + a3 * hw.w;
        // world-space oil and grime stains on gravel and concrete (never repeat with the texture)
        float stainN = tNoise(vTUv * 2.3 + 11.0) * 0.7 + tNoise(vTUv * 7.1 + 5.0) * 0.3;
        float oil = smoothstep(0.7, 0.82, stainN) * (hw.z * 0.45 + hw.w);
        splatAlb.rgb *= 1.0 - oil * 0.62;
        splatAlb.a = mix(splatAlb.a, 0.3, oil);
        // wet ground near water: darker, slightly more saturated, glossy
        float wetK = vWet * (0.75 + macro * 0.25);
        splatAlb.rgb = mix(splatAlb.rgb, splatAlb.rgb * splatAlb.rgb * 1.6, wetK * 0.55) * (1.0 - wetK * 0.3);
        diffuseColor.rgb *= splatAlb.rgb;
      `)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * splatAlb.a * (1.0 - wetK * 0.65);')
      .replace('#include <normal_fragment_maps>', `
        vec3 mapN = vec3(0.0);
        if (hw.x > 0.001) mapN += mix(texture2D(tNor0, tuvA).xyz * 2.0 - 1.0, unrot(texture2D(tNor0, tuvR).xyz * 2.0 - 1.0), rotW) * hw.x;
        if (hw.y > 0.001) mapN += mix(texture2D(tNor1, tuvA).xyz * 2.0 - 1.0, unrot(texture2D(tNor1, tuvR).xyz * 2.0 - 1.0), rotW) * hw.y;
        if (hw.z > 0.001) mapN += mix(texture2D(tNor2, tuvA).xyz * 2.0 - 1.0, unrot(texture2D(tNor2, tuvR).xyz * 2.0 - 1.0), rotW) * hw.z;
        if (hw.w > 0.001) mapN += mix(texture2D(tNor3, tuvA).xyz * 2.0 - 1.0, unrot(texture2D(tNor3, tuvR).xyz * 2.0 - 1.0), rotW) * hw.w;
        mapN.xy *= normalScale * (1.0 - wetK * 0.5);
        normal = normalize( tbn * mapN );
      `);
  };
  mat.customProgramCacheKey = () => 'empire-terrain-splat-v2';
}

function patchWaterShader(mat, time) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = 'attribute float depth;\nvarying float vDepth;\nvarying vec2 vWXZ;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\n vDepth = depth;\n vWXZ = position.xz;'
    );
    shader.fragmentShader = 'uniform float uTime;\nvarying float vDepth;\nvarying vec2 vWXZ;\n' + shader.fragmentShader
      .replace('#include <color_fragment>', `
        // murky shallows over the mud fade into dark deep water; shallow water lets the bed show through
        float deep = smoothstep(0.0, 0.42, vDepth);
        diffuseColor.rgb = mix(vec3(0.2, 0.18, 0.1), vec3(0.03, 0.055, 0.05), deep);
        diffuseColor.a = mix(0.25, 0.9, deep);
      `)
      .replace('#include <normal_fragment_maps>', `
        // two ripple layers drifting in different directions at different scales
        vec2 wuv = vWXZ * 0.21;
        vec3 nA = texture2D(normalMap, wuv + uTime * vec2(0.011, 0.006)).xyz * 2.0 - 1.0;
        vec3 nB = texture2D(normalMap, vec2(-wuv.y, wuv.x) * 1.9 + uTime * vec2(-0.008, 0.013)).xyz * 2.0 - 1.0;
        vec3 mapN = normalize(vec3(nA.xy + vec2(nB.y, -nB.x), nA.z * nB.z));
        mapN.xy *= normalScale;
        normal = normalize( tbn * mapN );
        // grazing angles reflect the sky instead of showing the bed
        float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 4.0);
        diffuseColor.a = clamp(diffuseColor.a + fres * 0.7, 0.0, 0.97);
      `);
  };
  mat.customProgramCacheKey = () => 'empire-water-v2';
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
  const wetA = new Float32Array(nx * ny);
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
      // wetness: distance to the nearest water tile rectangle, fading out ~1.3 tiles from the shore
      let dw = 9;
      for (let qy = Math.floor(vy) - 2; qy <= Math.floor(vy) + 1; qy++) {
        for (let qx = Math.floor(vx) - 2; qx <= Math.floor(vx) + 1; qx++) {
          if (qx < 0 || qy < 0 || qx >= w || qy >= h || codes[qy * w + qx] !== TILE_CODE.w) continue;
          dw = Math.min(dw, Math.hypot(Math.max(qx - vx, 0, vx - qx - 1), Math.max(qy - vy, 0, vy - qy - 1)));
        }
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
      col[vi * 3] = tint * (1 - ruin * 0.15);
      col[vi * 3 + 1] = tint * (1 - ruin * 0.15);
      col[vi * 3 + 2] = tint * (1 - ruin * 0.12);
      spl[vi * 4] = wgt[0]; spl[vi * 4 + 1] = wgt[1]; spl[vi * 4 + 2] = wgt[2]; spl[vi * 4 + 3] = wgt[3];
      const k = Math.max(0, 1 - dw / 1.3);
      wetA[vi] = k * k * (3 - 2 * k);
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
  geo.setAttribute('wet', new THREE.BufferAttribute(wetA, 1));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const sets = [
    lib.set('deadGrass', { size: 512, normalStrength: 1.6 }),
    lib.set('mud', { normalStrength: 2.2 }),
    lib.set('gravel', { normalStrength: 3 }),
    lib.set('concrete', { normalStrength: 2.2 })
  ];
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, normalMap: sets[0].normalMap, normalScale: new THREE.Vector2(1, 1) });
  patchTerrainShader(mat, sets.map((s) => s.map), sets.map((s) => s.normalMap));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'EmpireTerrain';

  const group = new THREE.Group();
  group.add(mesh);
  const disposables = [geo, mat];

  const heightAt = (x, y) => {
    const gx = Math.max(0, Math.min(nx - 1.001, x * SUB)), gy = Math.max(0, Math.min(ny - 1.001, y * SUB));
    const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j;
    const a = heights[j * nx + i], b = heights[j * nx + i + 1], c = heights[(j + 1) * nx + i], d = heights[(j + 1) * nx + i + 1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };

  // ---- water: non-overlapping half-tile cells covering every water tile plus a half-tile margin ----
  const waterTime = { value: 0 };
  const isWater = (tx, ty) => tx >= 0 && ty >= 0 && tx < w && ty < h && codes[ty * w + tx] === TILE_CODE.w;
  const cellsW = [];
  for (let cy = -1; cy < h * 2 + 1; cy++) {
    for (let cx = -1; cx < w * 2 + 1; cx++) {
      const mx = cx / 2 + 0.25, my = cy / 2 + 0.25;
      let hit = false;
      for (let qy = Math.floor(my - 0.5); qy <= Math.floor(my + 0.5) && !hit; qy++) {
        for (let qx = Math.floor(mx - 0.5); qx <= Math.floor(mx + 0.5) && !hit; qx++) hit = isWater(qx, qy);
      }
      if (hit) cellsW.push(cx, cy);
    }
  }
  if (cellsW.length) {
    const n = cellsW.length / 2;
    const wp = new Float32Array(n * 12), wuv = new Float32Array(n * 8), wn = new Float32Array(n * 12), wd = new Float32Array(n * 4);
    const wi = new Uint32Array(n * 6);
    for (let q = 0; q < n; q++) {
      const x0 = cellsW[q * 2] / 2, y0 = cellsW[q * 2 + 1] / 2, x1 = x0 + 0.5, y1 = y0 + 0.5;
      [[x0, y0], [x0, y1], [x1, y0], [x1, y1]].forEach(([cx, cy], k) => {
        wp[q * 12 + k * 3] = cx; wp[q * 12 + k * 3 + 1] = WATER_Y; wp[q * 12 + k * 3 + 2] = cy;
        wn[q * 12 + k * 3 + 1] = 1;
        wuv[q * 8 + k * 2] = cx * 0.25; wuv[q * 8 + k * 2 + 1] = cy * 0.25;
        wd[q * 4 + k] = Math.max(0, WATER_Y - heightAt(cx, cy));
      });
      const b = q * 4;
      wi.set([b, b + 1, b + 2, b + 1, b + 3, b + 2], q * 6);
    }
    const wgeo = new THREE.BufferGeometry();
    wgeo.setAttribute('position', new THREE.BufferAttribute(wp, 3));
    wgeo.setAttribute('normal', new THREE.BufferAttribute(wn, 3));
    wgeo.setAttribute('uv', new THREE.BufferAttribute(wuv, 2));
    wgeo.setAttribute('depth', new THREE.BufferAttribute(wd, 1));
    wgeo.setIndex(new THREE.BufferAttribute(wi, 1));
    wgeo.computeBoundingSphere();
    const wset = lib.set('water', { normalStrength: 4 });
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.05, metalness: 0, normalMap: wset.normalMap, normalScale: new THREE.Vector2(0.3, 0.3),
      envMapIntensity: 1.7, transparent: true
    });
    patchWaterShader(waterMat, waterTime);
    const water = new THREE.Mesh(wgeo, waterMat);
    water.receiveShadow = true;
    water.name = 'EmpireWater';
    group.add(water);
    disposables.push(wgeo, waterMat);
  }

  const props = buildGroundProps(store, heightAt, lib);
  group.add(props.group);
  disposables.push(props);

  return {
    group,
    heightAt,
    geometry: geo,
    update(time) {
      waterTime.value = time;
      props.update(time);
    },
    dispose() {
      group.removeFromParent();
      for (const d of disposables) d.dispose();
    }
  };
}
