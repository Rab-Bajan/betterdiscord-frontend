// Fog of war: a DataTexture (one texel per tile) sampled by a mesh draped over the terrain.
// Visible = clear, explored = dim haze, unexplored = near-black drifting mist.
import * as THREE from 'three';
import { WATER_Y } from './terrain.js';

export function createFog(store, terrainGeometry) {
  const { w, h } = store.map;
  const data = new Uint8Array(w * h * 4);
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { tFog: { value: tex }, uSize: { value: new THREE.Vector2(w, h) }, uTime: { value: 0 } },
    vertexShader: `
      varying vec2 vXZ;
      void main() {
        vec3 p = position;
        p.y = max(p.y, ${WATER_Y.toFixed(3)}) + 0.05;
        vXZ = p.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D tFog; uniform vec2 uSize; uniform float uTime;
      varying vec2 vXZ;
      float hsh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float nz(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hsh(i), hsh(i + vec2(1, 0)), f.x), mix(hsh(i + vec2(0, 1)), hsh(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        float f = texture2D(tFog, vXZ / uSize).r;
        if (f < 0.01) discard;
        float m = nz(vXZ * 0.35 + vec2(uTime * 0.05, uTime * 0.03)) * 0.6 + nz(vXZ * 1.1 - vec2(uTime * 0.08, 0.0)) * 0.4;
        vec3 col = mix(vec3(0.025, 0.03, 0.05), vec3(0.11, 0.12, 0.15), m * (1.0 - f) + 0.15);
        float a = clamp(f * (0.86 + 0.14 * m), 0.0, 0.985);
        gl_FragColor = vec4(col, a);
      }`
  });
  const mesh = new THREE.Mesh(terrainGeometry, mat);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  mesh.name = 'EmpireFog';
  let ver = -1;

  return {
    mesh,
    update(time) {
      mat.uniforms.uTime.value = time;
      if (ver === store.fogVersion) return;
      ver = store.fogVersion;
      const vis = store.visible, exp = store.explored, spec = store.spectator;
      for (let i = 0; i < w * h; i++) {
        data[i * 4] = spec || vis[i] ? 0 : exp[i] ? 132 : 255;
      }
      tex.needsUpdate = true;
    },
    dispose() {
      mesh.removeFromParent();
      mat.dispose();
      tex.dispose();
    }
  };
}
