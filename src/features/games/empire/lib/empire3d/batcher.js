// Instanced batches keyed by (geometry, material). Every frame: begin(), push() per instance, end().
// Capacity doubles on demand; instance colours are always allocated so the shader variant is stable.
import * as THREE from 'three';

export class Batcher {
  constructor(parent) {
    this.parent = parent;
    this.batches = new Map();
  }

  get(geo, mat, opts = {}) {
    const key = `${geo.uuid}|${mat.uuid}`;
    let b = this.batches.get(key);
    if (!b) {
      b = { geo, mat, opts, cap: 0, count: 0, mesh: null };
      this.grow(b, opts.cap || 16);
      this.batches.set(key, b);
    }
    return b;
  }

  grow(b, cap) {
    const mesh = new THREE.InstancedMesh(b.geo, b.mat, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
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
  }

  begin() {
    for (const b of this.batches.values()) b.count = 0;
  }

  push(b, matrix, r = 1, g = 1, bl = 1) {
    if (b.count >= b.cap) this.grow(b, b.cap * 2);
    const i = b.count++;
    matrix.toArray(b.mesh.instanceMatrix.array, i * 16);
    const c = b.mesh.instanceColor.array;
    c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = bl;
  }

  end() {
    for (const b of this.batches.values()) {
      const m = b.mesh;
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

  dispose() {
    for (const b of this.batches.values()) { b.mesh.removeFromParent(); b.mesh.dispose(); }
    this.batches.clear();
  }
}
