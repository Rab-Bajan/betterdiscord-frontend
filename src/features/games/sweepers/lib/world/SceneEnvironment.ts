// Égbolt, köd és fények: egyetlen árnyékot vető nap (2048² árnyéktérkép), amely követi a játékost.
import * as THREE from 'three';

export const SHADOW_MAP_SIZE = 2048;
const SHADOW_EXTENT = 60;
const SUN_OFFSET = new THREE.Vector3(70, 110, 45);

export class SceneEnvironment {
  readonly sun: THREE.DirectionalLight;
  readonly #hemi: THREE.HemisphereLight;
  readonly #scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.#scene = scene;
    scene.background = new THREE.Color(0x9fb4c9);
    scene.fog = new THREE.Fog(0x9fb4c9, 120, 520);

    this.#hemi = new THREE.HemisphereLight(0xdfe9f5, 0x3a3a34, 0.9);
    scene.add(this.#hemi);

    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    const cam = this.sun.shadow.camera;
    cam.left = -SHADOW_EXTENT;
    cam.right = SHADOW_EXTENT;
    cam.top = SHADOW_EXTENT;
    cam.bottom = -SHADOW_EXTENT;
    cam.near = 10;
    cam.far = 320;
    cam.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    scene.add(this.sun, this.sun.target);
  }

  /** Keeps the shadow frustum centred on the player; snapped to texels to avoid shimmering. */
  follow(x: number, z: number): void {
    const texel = (SHADOW_EXTENT * 2) / SHADOW_MAP_SIZE;
    const sx = Math.round(x / texel) * texel;
    const sz = Math.round(z / texel) * texel;
    this.sun.target.position.set(sx, 0, sz);
    this.sun.position.set(sx + SUN_OFFSET.x, SUN_OFFSET.y, sz + SUN_OFFSET.z);
  }

  dispose(): void {
    this.#scene.remove(this.#hemi, this.sun, this.sun.target);
    this.sun.shadow.dispose();
    this.sun.dispose();
    this.#hemi.dispose();
    this.#scene.fog = null;
    this.#scene.background = null;
  }
}
