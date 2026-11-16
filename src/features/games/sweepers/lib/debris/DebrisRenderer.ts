// Példányosított törmelék (spec 33, C.7): tárgytípusonként egy InstancedMesh (8 rajzolás), összesen
// ≤ 4 000 példány a betöltött chunkokból. Chunkonkénti látómező- és távolságvágás; a lista csak akkor
// épül újra, ha a tükör változott, a kamera > 2 m-t mozdult vagy > 10°-ot fordult; guruló rúgott doboznak csak a
// saját példánya íródik újra. A GPU-ra csak a használt példánytartomány megy fel.
// A törmelék nem vet árnyékot.
import * as THREE from 'three';
import { AssetCache } from '../engine/AssetCache';
import { PartsBuilder, uploadInstances } from '../world/geometryKit';
import { litMaterial, rustMaterial } from '../world/materials';
import { CHUNK_M, ITEM_KINDS, chunkCentre, type ItemKind } from './tables';
import type { ChunkStore } from './ChunkStore';
import type { DebrisItem, KickDelta } from '../../debrisTypes';

export const MAX_DEBRIS_INSTANCES = 4000;
/** One InstancedMesh per item kind. */
export const DEBRIS_DRAW_CALLS = ITEM_KINDS.length;
/** Chunks farther than this from the camera are not drawn. */
export const DEBRIS_DRAW_DISTANCE_M = 60;
export const REBUILD_MOVE_M = 2;
export const REBUILD_TURN_RAD = (10 * Math.PI) / 180;
const CHUNK_RADIUS = (CHUNK_M * Math.SQRT2) / 2 + 1;

/** Kick roll (C.5): duration clamp(dist / 3, 0.3, 2.5) s, ending exactly at `to`. */
export const kickDuration = (distance: number): number => Math.min(2.5, Math.max(0.3, distance / 3));

interface KickAnim {
  readonly fromX: number;
  readonly fromZ: number;
  readonly toX: number;
  readonly toZ: number;
  readonly start: number;
  readonly duration: number;
}

/** Position of a rolling can at `now` (ms): an air hop, then a decelerating roll; exactly `to` at the end. */
export function kickPose(anim: KickAnim, now: number): { x: number; z: number; y: number; done: boolean } {
  const p = Math.min(1, Math.max(0, (now - anim.start) / (anim.duration * 1000)));
  const s = 1 - (1 - p) * (1 - p);
  const hop = p < 0.25 ? Math.sin((p / 0.25) * Math.PI) * 0.35 : Math.abs(Math.sin(((p - 0.25) / 0.75) * Math.PI * 3)) * 0.06 * (1 - p);
  return { x: anim.fromX + (anim.toX - anim.fromX) * s, z: anim.fromZ + (anim.toZ - anim.fromZ) * s, y: p >= 1 ? 0 : hop, done: p >= 1 };
}

/** Unit geometry of a kind (its origin sits on the ground). */
function kindGeometry(kind: ItemKind): THREE.BufferGeometry {
  return AssetCache.get().geometry(`debris.${kind}`, () => {
    const b = new PartsBuilder();
    switch (kind) {
      case 'can':
        b.add(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 10), 0xc9ced6, { y: 0.033, rz: Math.PI / 2 })
          .add(new THREE.CylinderGeometry(0.0335, 0.0335, 0.05, 10, 1, true), 0xb3262e, { y: 0.033, rz: Math.PI / 2 });
        break;
      case 'iron':
        b.add(new THREE.CylinderGeometry(0.045, 0.045, 0.8, 8), 0x6b4a33, { y: 0.045, rz: Math.PI / 2 })
          .box(0.18, 0.06, 0.12, 0x5a3e2b, { x: 0.25, y: 0.03, z: 0.08, ry: 0.4 });
        break;
      case 'copper':
        b.add(new THREE.TorusGeometry(0.11, 0.028, 6, 14), 0xc8743a, { y: 0.03, rx: Math.PI / 2 })
          .add(new THREE.TorusGeometry(0.08, 0.022, 6, 12), 0xd98a4a, { y: 0.07, rx: Math.PI / 2 });
        break;
      case 'pile':
        b.add(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x6f6658, { sy: 0.35 });
        break;
      case 'cabbage':
        b.sphere(0.22, 0x5d7a2e, { y: 0.18, sy: 0.8 }, 9, 7).sphere(0.12, 0x4a3b22, { x: 0.18, y: 0.08, z: 0.05 }, 7, 5);
        break;
      case 'cauldron':
        b.add(new THREE.SphereGeometry(0.36, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0xb8642e, { y: 0.36 })
          .add(new THREE.TorusGeometry(0.36, 0.03, 6, 18), 0xd8894a, { y: 0.36, rx: Math.PI / 2 })
          .cyl(0.04, 0.06, 0.3, 0x9a5426, { x: 0.3, y: 0.5, rz: -0.9 });
        break;
      case 'catalyst':
        b.box(0.42, 0.16, 0.26, 0x9ea4ab, { y: 0.08 })
          .add(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 8), 0x7d838a, { x: 0.3, y: 0.08, rz: Math.PI / 2 })
          .add(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 8), 0x7d838a, { x: -0.3, y: 0.08, rz: Math.PI / 2 });
        break;
      case 'lenin':
        b.sphere(0.3, 0x8c6b3a, { y: 0.32, sy: 1.1 }, 14, 10)
          .box(0.34, 0.16, 0.28, 0x7a5c30, { y: 0.1, z: 0.04 })
          .sphere(0.08, 0x7a5c30, { y: 0.3, z: -0.27 }, 6, 5);
        break;
    }
    return b.build();
  });
}

/** Instance scale of an item: iron / copper by mass, a pile mound by its kg (C.2 piles). */
export function itemScale(item: DebrisItem): number {
  switch (item.kind) {
    case 'iron':
      return Math.cbrt(Math.max(0.5, item.massKg) / 6);
    case 'copper':
      return Math.cbrt(Math.max(0.3, item.massKg) / 3);
    case 'pile':
      return Math.min(1.4, 0.2 + Math.cbrt(Math.max(0, item.massKg)) * 0.22);
    default:
      return 1;
  }
}

export interface DebrisStats {
  readonly rendered: number;
  readonly chunksDrawn: number;
  readonly rebuilds: number;
}

export class DebrisRenderer {
  readonly root = new THREE.Group();
  readonly meshes: ReadonlyMap<ItemKind, THREE.InstancedMesh>;
  readonly #store: ChunkStore;
  readonly #ground: (x: number, z: number) => number;
  readonly #kicks = new Map<number, KickAnim>();
  /** Instance index of every drawn item at the last rebuild (rolling cans are rewritten in place). */
  readonly #slots = new Map<number, number>();
  readonly #frustum = new THREE.Frustum();
  readonly #projView = new THREE.Matrix4();
  readonly #sphere = new THREE.Sphere();
  readonly #m = new THREE.Matrix4();
  readonly #q = new THREE.Quaternion();
  readonly #pos = new THREE.Vector3();
  readonly #scale = new THREE.Vector3();
  readonly #up = new THREE.Vector3(0, 1, 0);
  #builtVersion = -1;
  #builtAt = { x: NaN, z: NaN, yaw: NaN, pitch: NaN };
  #stats: DebrisStats = { rendered: 0, chunksDrawn: 0, rebuilds: 0 };

  constructor(store: ChunkStore, ground: (x: number, z: number) => number) {
    this.#store = store;
    this.#ground = ground;
    this.root.name = 'debris';
    const meshes = new Map<ItemKind, THREE.InstancedMesh>();
    for (const kind of ITEM_KINDS) {
      const material = kind === 'iron' ? rustMaterial() : litMaterial();
      const mesh = new THREE.InstancedMesh(kindGeometry(kind), material, MAX_DEBRIS_INSTANCES);
      mesh.name = `debris.${kind}`;
      mesh.count = 0;
      mesh.frustumCulled = false; // culled per chunk
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.visible = false;
      meshes.set(kind, mesh);
      this.root.add(mesh);
    }
    this.meshes = meshes;
  }

  get stats(): DebrisStats {
    return this.#stats;
  }

  /** Starts the roll of a kicked can (the mirror already holds its rest point). */
  kick(kick: KickDelta, now: number): void {
    const dist = Math.hypot(kick.toX - kick.fromX, kick.toZ - kick.fromZ);
    this.#kicks.set(kick.id, { ...kick, start: now, duration: kickDuration(dist) });
  }

  get rolling(): number {
    return this.#kicks.size;
  }

  /** Rebuilds the instance lists when needed; `now` in ms (kick animations). */
  update(camera: THREE.Camera, now: number, force = false): void {
    const p = camera.position;
    const dir = camera.getWorldDirection(this.#pos);
    const yaw = Math.atan2(dir.x, dir.z);
    const pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    const b = this.#builtAt;
    const moved = !(Math.hypot(p.x - b.x, p.z - b.z) <= REBUILD_MOVE_M);
    const turned = !(Math.abs(Math.atan2(Math.sin(yaw - b.yaw), Math.cos(yaw - b.yaw))) <= REBUILD_TURN_RAD && Math.abs(pitch - b.pitch) <= REBUILD_TURN_RAD);
    if (!force && !moved && !turned && this.#builtVersion === this.#store.version) {
      if (this.#kicks.size > 0) this.#roll(now);
      return;
    }
    this.#builtAt = { x: p.x, z: p.z, yaw, pitch };
    this.#builtVersion = this.#store.version;
    this.#rebuild(camera, now);
  }

  #rebuild(camera: THREE.Camera, now: number): void {
    camera.updateMatrixWorld();
    this.#projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.#frustum.setFromProjectionMatrix(this.#projView);
    const cx = camera.position.x;
    const cz = camera.position.z;
    const chunks: { id: number; d: number }[] = [];
    for (const id of this.#store.loadedChunks()) {
      if (this.#store.itemsInChunk(id).size === 0) continue;
      const c = chunkCentre(id);
      const d = Math.hypot(c.x - cx, c.z - cz);
      if (d > DEBRIS_DRAW_DISTANCE_M + CHUNK_RADIUS) continue;
      this.#sphere.center.set(c.x, this.#ground(c.x, c.z) + 0.5, c.z);
      this.#sphere.radius = CHUNK_RADIUS;
      if (!this.#frustum.intersectsSphere(this.#sphere)) continue;
      chunks.push({ id, d });
    }
    chunks.sort((a, b) => a.d - b.d);
    const counts = new Map<ItemKind, number>();
    this.#slots.clear();
    let total = 0;
    let drawn = 0;
    for (const { id } of chunks) {
      if (total >= MAX_DEBRIS_INSTANCES) break;
      drawn += 1;
      for (const itemId of this.#store.itemsInChunk(id)) {
        if (total >= MAX_DEBRIS_INSTANCES) break;
        const item = this.#store.item(itemId);
        if (!item || item.buried || this.#store.isHidden(itemId)) continue;
        const mesh = this.meshes.get(item.kind);
        if (!mesh) continue;
        const n = counts.get(item.kind) ?? 0;
        this.#place(mesh, n, item, now);
        this.#slots.set(itemId, n);
        counts.set(item.kind, n + 1);
        total += 1;
      }
    }
    for (const [kind, mesh] of this.meshes) {
      mesh.count = counts.get(kind) ?? 0;
      mesh.visible = mesh.count > 0;
      uploadInstances(mesh, mesh.count);
    }
    for (const [id, anim] of this.#kicks) if (kickPose(anim, now).done) this.#kicks.delete(id);
    this.#stats = { rendered: total, chunksDrawn: drawn, rebuilds: this.#stats.rebuilds + 1 };
  }

  /** Nothing else changed: only the rolling cans' instances are rewritten and uploaded. */
  #roll(now: number): void {
    for (const [id, anim] of this.#kicks) {
      const item = this.#store.item(id);
      const slot = this.#slots.get(id);
      const mesh = item && this.meshes.get(item.kind);
      if (item && mesh && slot !== undefined) {
        this.#place(mesh, slot, item, now);
        mesh.instanceMatrix.addUpdateRange(slot * 16, 16);
        mesh.instanceMatrix.needsUpdate = true;
      }
      if (kickPose(anim, now).done) this.#kicks.delete(id);
    }
  }

  #place(mesh: THREE.InstancedMesh, index: number, item: DebrisItem, now: number): void {
    let x = item.x;
    let z = item.z;
    let lift = 0;
    const anim = this.#kicks.get(item.id);
    if (anim) {
      const pose = kickPose(anim, now);
      x = pose.x;
      z = pose.z;
      lift = pose.y;
    }
    const s = itemScale(item);
    this.#q.setFromAxisAngle(this.#up, item.rot + (anim ? (now - anim.start) * 0.012 : 0));
    this.#pos.set(x, this.#ground(x, z) + lift, z);
    this.#scale.set(s, s, s);
    this.#m.compose(this.#pos, this.#q, this.#scale);
    mesh.setMatrixAt(index, this.#m);
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) mesh.dispose();
    this.root.removeFromParent();
  }
}
