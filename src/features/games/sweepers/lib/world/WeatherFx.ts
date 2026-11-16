// Szitáló eső (spec 29): 3000 csepp-csík egyetlen LineSegments rajzolásban; a mozgás a vertex
// shaderben fut (idő + kamera körüli tekercselés), a CPU képkockánként csak uniformokat ír.
import * as THREE from 'three';
import { AssetCache } from '../engine/AssetCache';

export const RAIN_DROPS = 3000;
const BOX = 36;
const HEIGHT = 18;

/** Per-frame rain state shared by the cached material. */
export const RAIN_UNIFORMS = {
  uTime: { value: 0 },
  uCenter: { value: new THREE.Vector3() },
  uOpacity: { value: 0 }
};

function rainGeometry(): THREE.BufferGeometry {
  const offsets = new Float32Array(RAIN_DROPS * 2 * 3);
  const ends = new Float32Array(RAIN_DROPS * 2);
  let seed = 7;
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < RAIN_DROPS; i++) {
    const x = rand() * BOX;
    const y = rand() * HEIGHT;
    const z = rand() * BOX;
    for (let e = 0; e < 2; e++) {
      offsets.set([x, y, z], (i * 2 + e) * 3);
      ends[i * 2 + e] = e;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(offsets, 3));
  g.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
  // drops wrap around the camera in the shader; the static bounds would cull them wrongly
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
  return g;
}

const VERTEX = /* glsl */ `
uniform float uTime;
uniform vec3 uCenter;
attribute float aEnd;
void main() {
  vec3 p = position;
  p.y = mod(p.y - uTime * 9.0, ${HEIGHT.toFixed(1)}) - aEnd * 0.42;
  p.x = mod(p.x - uCenter.x + aEnd * 0.06, ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)} + uCenter.x;
  p.z = mod(p.z - uCenter.z, ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)} + uCenter.z;
  p.y += uCenter.y - 4.0;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FRAGMENT = /* glsl */ `
uniform float uOpacity;
void main() { gl_FragColor = vec4(0.72, 0.78, 0.86, uOpacity); }`;

export class WeatherFx {
  readonly root: THREE.LineSegments;

  constructor() {
    const cache = AssetCache.get();
    const geometry = cache.geometry('rain.drops', rainGeometry);
    const material = cache.material('rain.drops', () => new THREE.ShaderMaterial({
      uniforms: RAIN_UNIFORMS,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false
    }));
    this.root = new THREE.LineSegments(geometry, material);
    this.root.name = 'rain';
    this.root.frustumCulled = false;
    this.root.visible = false;
    this.root.renderOrder = 5;
  }

  /** `amount` 0..1 fades the drizzle in / out. */
  update(timeSec: number, camera: THREE.Vector3, amount: number): void {
    RAIN_UNIFORMS.uTime.value = timeSec;
    RAIN_UNIFORMS.uCenter.value.copy(camera);
    RAIN_UNIFORMS.uOpacity.value = 0.42 * amount;
    this.root.visible = amount > 0.01;
  }

  dispose(): void {
    this.root.removeFromParent();
    RAIN_UNIFORMS.uOpacity.value = 0;
  }
}
