// Instanced batches keyed by (geometry, material). Every frame: begin(), push() per instance, end().
// Capacity doubles on demand; instance colours are always allocated so the shader variant is stable.
import * as THREE from 'three';

export interface BatchOptions {
  cap?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  renderOrder?: number;
}

export interface Batch {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  opts: BatchOptions;
  cap: number;
  count: number;
  mesh: InstancedBatchMesh | null;
}

/** A batch mesh always carries its instance colours (allocated in grow). */
type InstancedBatchMesh = THREE.InstancedMesh & { instanceColor: THREE.InstancedBufferAttribute };

export class Batcher {
  readonly parent: THREE.Object3D;
  readonly batches = new Map<string, Batch>();

  constructor(parent: THREE.Object3D) {
    this.parent = parent;
  }

  get(geo: THREE.BufferGeometry, mat: THREE.Material, opts: BatchOptions = {}): Batch {
    const key = `${geo.uuid}|${mat.uuid}`;
    let b = this.batches.get(key);
    if (!b) {
      b = { geo, mat, opts, cap: 0, count: 0, mesh: null };
      this.grow(b, opts.cap || 16);
      this.batches.set(key, b);
    }
    return b;
  }

  grow(b: Batch, cap: number): InstancedBatchMesh {
    const colors = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    const mesh: InstancedBatchMesh = Object.assign(new THREE.InstancedMesh(b.geo, b.mat, cap), { instanceColor: colors });
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = b.opts.castShadow !== false;
    mesh.receiveShadow = b.opts.receiveShadow !== false;
    mesh.frustumCulled = false;
    if (b.opts.renderOrder) mesh.renderOrder = b.opts.renderOrder;
    if (b.mesh) {
      mesh.instanceMatrix.array.set(b.mesh.instanceMatrix.array.subarray(0, b.cap * 16));
      mesh.instanceColor.array.set(b.mesh.instanceColor.array.subarray(0, b.cap * 3));
      b.mesh.removeFromParent();
      b.mesh.dispose();
    }
    mesh.count = 0;
    this.parent.add(mesh);
    b.mesh = mesh;
    b.cap = cap;
    return mesh;
  }

  begin(): void {
    for (const b of this.batches.values()) b.count = 0;
  }

  push(b: Batch, matrix: THREE.Matrix4, r = 1, g = 1, bl = 1): void {
    const mesh = b.count >= b.cap || !b.mesh ? this.grow(b, b.cap * 2) : b.mesh;
    const i = b.count++;
    matrix.toArray(mesh.instanceMatrix.array, i * 16);
    const c = mesh.instanceColor.array;
    c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = bl;
  }

  end(): void {
    for (const b of this.batches.values()) {
      const m = b.mesh;
      if (!m) continue;
      m.count = b.count;
      m.visible = b.count > 0;
      if (b.count) {
        m.instanceMatrix.clearUpdateRanges();
        m.instanceMatrix.addUpdateRange(0, b.count * 16);
        m.instanceMatrix.needsUpdate = true;
        m.instanceColor.clearUpdateRanges();
        m.instanceColor.addUpdateRange(0, b.count * 3);
        m.instanceColor.needsUpdate = true;
      }
    }
  }

  dispose(): void {
    for (const b of this.batches.values()) { b.mesh?.removeFromParent(); b.mesh?.dispose(); }
    this.batches.clear();
  }
}
