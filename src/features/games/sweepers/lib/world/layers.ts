// Phase A világrétegek: aszfaltsík, hatszög-körvonalak tisztaság szerinti színnel, MÉH telep kerítés.
import * as THREE from 'three';
import { AssetCache } from '../engine/AssetCache';
import { GRID_RADIUS, HEX_SIZE, cleanlinessColor, hexToWorld } from './hexGrid';
import type { HexSnapshot } from '../../types';

/** One self-contained part of the world. Phase B districts add more layers. */
export interface WorldLayer {
  readonly root: THREE.Object3D;
  applyHexes?(hexes: readonly HexSnapshot[]): void;
  dispose(): void;
}

const GROUND_SIZE = 640;
/** 3·r·(r+1)+1 hexes for radius r, with headroom for a larger grid. */
const HEX_CAPACITY = 3 * (GRID_RADIUS + 1) * (GRID_RADIUS + 2) + 1;

function asphaltTexture(): THREE.Texture {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  let seed = 1337;
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < size * size; i++) {
    const grain = 46 + rand() * 26 + (rand() > 0.97 ? 40 : 0); // aggregate stones
    data[i * 4] = grain;
    data[i * 4 + 1] = grain;
    data[i * 4 + 2] = grain + 4;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(GROUND_SIZE / 4, GROUND_SIZE / 4);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export class GroundLayer implements WorldLayer {
  readonly root: THREE.Mesh;

  constructor() {
    const cache = AssetCache.get();
    const geometry = cache.geometry('ground.plane', () => new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE).rotateX(-Math.PI / 2));
    const material = cache.material('ground.asphalt', () =>
      new THREE.MeshStandardMaterial({ map: cache.texture('tex.asphalt', asphaltTexture), color: 0x8a8a90, roughness: 0.95, metalness: 0 }));
    this.root = new THREE.Mesh(geometry, material);
    this.root.receiveShadow = true;
    this.root.name = 'ground';
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}

export class HexOutlineLayer implements WorldLayer {
  readonly root: THREE.InstancedMesh;
  readonly #matrix = new THREE.Matrix4();
  readonly #color = new THREE.Color();

  constructor() {
    const cache = AssetCache.get();
    // RingGeometry with 6 segments is a hexagon; θ0 = 30° makes it pointy-top after laying it flat
    const geometry = cache.geometry('hex.outline', () =>
      new THREE.RingGeometry(HEX_SIZE - 1.4, HEX_SIZE - 0.4, 6, 1, Math.PI / 6).rotateX(-Math.PI / 2));
    const material = cache.material('hex.outline', () =>
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
    this.root = new THREE.InstancedMesh(geometry, material, HEX_CAPACITY);
    this.root.count = 0;
    this.root.name = 'hex-outlines';
    this.root.renderOrder = 1;
    this.root.frustumCulled = false;
  }

  applyHexes(hexes: readonly HexSnapshot[]): void {
    const n = Math.min(hexes.length, HEX_CAPACITY);
    for (let i = 0; i < n; i++) {
      const hex = hexes[i];
      if (!hex) continue;
      const { x, z } = hexToWorld(hex.q, hex.r);
      this.#matrix.makeTranslation(x, 0.03, z);
      this.root.setMatrixAt(i, this.#matrix);
      this.root.setColorAt(i, this.#color.setHex(cleanlinessColor(hex.cleanliness)));
    }
    this.root.count = n;
    this.root.instanceMatrix.needsUpdate = true;
    if (this.root.instanceColor) this.root.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.dispose(); // instance buffers are owned here; geometry/material are cached
  }
}

const FENCE_RADIUS = 24;
const POST_SPACING = 2.5;
const FENCE_HEIGHT = 2.2;
/** Gate opening (radians) facing +Z, towards the ring districts' road. */
const GATE_HALF_ANGLE = 0.16;

/** MÉH telep placeholder: a post-and-rail fence ring with a gate gap around the centre hex. */
export class MehYardLayer implements WorldLayer {
  readonly root = new THREE.Group();
  readonly #posts: THREE.InstancedMesh;
  readonly #rails: THREE.InstancedMesh;
  readonly #sign: THREE.Mesh;

  constructor() {
    const cache = AssetCache.get();
    const metal = cache.material('meh.metal', () => new THREE.MeshStandardMaterial({ color: 0x7c828c, roughness: 0.55, metalness: 0.7 }));
    const post = cache.geometry('meh.post', () => new THREE.CylinderGeometry(0.06, 0.06, FENCE_HEIGHT, 8).translate(0, FENCE_HEIGHT / 2, 0));
    const rail = cache.geometry('meh.rail', () => new THREE.BoxGeometry(1, 0.05, 0.05));

    const count = Math.floor((Math.PI * 2 * FENCE_RADIUS) / POST_SPACING);
    const step = (Math.PI * 2) / count;
    const angles: number[] = [];
    for (let i = 0; i < count; i++) {
      const a = i * step;
      if (Math.abs(angleFromGate(a)) > GATE_HALF_ANGLE) angles.push(a);
    }
    this.#posts = new THREE.InstancedMesh(post, metal, angles.length);
    this.#rails = new THREE.InstancedMesh(rail, metal, angles.length * 3);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const chord = 2 * FENCE_RADIUS * Math.sin(step / 2);
    let r = 0;
    angles.forEach((a, i) => {
      const x = Math.sin(a) * FENCE_RADIUS;
      const z = Math.cos(a) * FENCE_RADIUS;
      this.#posts.setMatrixAt(i, m.makeTranslation(x, 0, z));
      const next = a + step;
      if (Math.abs(angleFromGate(next)) <= GATE_HALF_ANGLE) return; // no rail across the gate
      const mid = a + step / 2;
      q.setFromAxisAngle(up, mid); // rotates +X onto the tangent (cos, -sin)
      for (const h of [0.3, 1.2, 2.1]) {
        m.compose(new THREE.Vector3(Math.sin(mid) * FENCE_RADIUS * Math.cos(step / 2), h, Math.cos(mid) * FENCE_RADIUS * Math.cos(step / 2)), q, new THREE.Vector3(chord, 1, 1));
        this.#rails.setMatrixAt(r++, m);
      }
    });
    this.#rails.count = r;
    for (const mesh of [this.#posts, this.#rails]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
    }

    // Gate sign board above the opening
    const board = cache.geometry('meh.sign', () => new THREE.BoxGeometry(6, 1.1, 0.12));
    const signMat = cache.material('meh.sign', () => new THREE.MeshStandardMaterial({ color: 0x1f6f4a, roughness: 0.7 }));
    this.#sign = new THREE.Mesh(board, signMat);
    this.#sign.position.set(0, 3.1, FENCE_RADIUS);
    this.#sign.castShadow = true;
    this.root.add(this.#posts, this.#rails, this.#sign);
    this.root.name = 'meh-yard';
  }

  dispose(): void {
    this.root.removeFromParent();
    this.#posts.dispose();
    this.#rails.dispose();
  }
}

/** Signed angle of `a` from the gate direction (+Z, angle 0). */
function angleFromGate(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
