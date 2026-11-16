// Épületek és kellékek példányosított rajzolása három LOD-szinttel (közel 0–25 m, közép 25–70 m, távol
// > 70 m egyszerű doboz) és példányonkénti frustum-vágással. Csoportonként (típus × alkatrész × szint)
// egy InstancedMesh; a láthatóak mátrixait átrendezéskor tömören a puffer elejére másoljuk.
import * as THREE from 'three';
import { AssetCache } from '../engine/AssetCache';
import { hashId } from './geometryKit';
import { ledMaterial, litMaterial, nightGlowMaterial, panelMaterial, rustMaterial } from './materials';
import { LOD_MID_M, LOD_NEAR_M, archetypeOf, type DrawPlan, type InstancedGroup, type Tier } from './drawPlan';
import type { Archetype, Dims, LocalPlace, MaterialId, PartSpec } from './archetypes';
import type { BuildingKind, LayoutBuilding, LayoutProp, PropKind } from '../../worldTypes';

const MID_CULL_MARGIN = 12;
const REBUCKET_MOVE_M = 0.75;
const REBUCKET_TURN_COS = Math.cos((2 * Math.PI) / 180);

export function materialFor(id: MaterialId): THREE.Material {
  switch (id) {
    case 'lit': return litMaterial();
    case 'rust': return rustMaterial();
    case 'panel': return panelMaterial();
    case 'glow': return nightGlowMaterial();
    case 'led': return ledMaterial();
  }
}

interface Instance {
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly radius: number;
  /** Per part: this instance's world matrices (16 floats per copy). */
  readonly parts: readonly Float32Array[];
  readonly impostor: Float32Array | null;
  readonly farColor: THREE.Color;
  tier: Tier | null;
}

interface PartMeshes {
  readonly spec: PartSpec;
  readonly near: THREE.InstancedMesh;
  readonly mid: THREE.InstancedMesh | null;
}

interface KindGroup {
  readonly family: 'building' | 'prop';
  readonly kind: BuildingKind | PropKind;
  readonly archetype: Archetype;
  readonly instances: Instance[];
  readonly parts: PartMeshes[];
}

const m = new THREE.Matrix4();
const local = new THREE.Matrix4();
const q = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
const pos = new THREE.Vector3();
const scl = new THREE.Vector3();

function baseMatrix(x: number, y: number, z: number, rotY: number, sx: number, sy: number, sz: number): THREE.Matrix4 {
  return m.compose(pos.set(x, y, z), q.setFromAxisAngle(up, rotY), scl.set(sx, sy, sz));
}

export interface InstancedWorldStats {
  near: number;
  mid: number;
  far: number;
  culled: number;
}

export class InstancedWorld {
  readonly root = new THREE.Group();
  readonly #groups: KindGroup[] = [];
  readonly #impostor: THREE.InstancedMesh;
  readonly #impostorInstances: Instance[] = [];
  readonly #frustum = new THREE.Frustum();
  readonly #projScreen = new THREE.Matrix4();
  readonly #lastPos = new THREE.Vector3(Infinity, 0, 0);
  readonly #lastDir = new THREE.Vector3();
  readonly #dir = new THREE.Vector3();
  readonly #sphere = new THREE.Sphere();
  #dirty = true;
  readonly stats: InstancedWorldStats = { near: 0, mid: 0, far: 0, culled: 0 };
  /** InstancedMesh count actually created (tests compare it with the plan). */
  readonly meshes: THREE.InstancedMesh[] = [];

  constructor(plan: DrawPlan, buildings: readonly LayoutBuilding[], props: readonly LayoutProp[], ground: (x: number, z: number) => number) {
    this.root.name = 'instanced-world';
    const byKind = new Map<string, KindGroup>();
    const planned = new Set(plan.instanced.map((g) => `${g.family}:${g.kind}`));
    const ensure = (family: 'building' | 'prop', kind: BuildingKind | PropKind): KindGroup | null => {
      const key = `${family}:${kind}`;
      const hit = byKind.get(key);
      if (hit) return hit;
      const archetype = archetypeOf(family, kind);
      if (!archetype || !planned.has(key)) return null;
      const group: KindGroup = { family, kind, archetype, instances: [], parts: [] };
      byKind.set(key, group);
      this.#groups.push(group);
      return group;
    };

    for (const b of buildings) {
      const group = ensure('building', b.kind);
      if (!group) continue;
      const dims: Dims = { w: b.w, d: b.d, h: b.h };
      const y = this.#footprintGround(ground, b) - 0.05;
      this.#addInstance(group, b.x, y, b.z, b.rotY, dims, 1, hashId(b.id));
    }
    props.forEach((p, i) => {
      const group = ensure('prop', p.kind);
      if (!group) return;
      const n = group.archetype.nominal;
      this.#addInstance(group, p.x, ground(p.x, p.z), p.z, p.rotY, { w: n.w * p.s, d: n.d * p.s, h: n.h * p.s }, p.s, hashId(`${p.kind}:${i}`));
    });

    const cache = AssetCache.get();
    for (const group of this.#groups) {
      group.archetype.parts.forEach((spec, partIndex) => {
        const geometry = cache.geometry(`arch.${group.kind}.${spec.id}`, spec.geometry);
        const material = materialFor(spec.material);
        const capacity = Math.max(1, group.instances.reduce((sum, inst) => sum + (inst.parts[partIndex]?.length ?? 0) / 16, 0));
        const make = (tier: Tier): THREE.InstancedMesh => {
          const mesh = new THREE.InstancedMesh(geometry, material, capacity);
          mesh.name = `${group.kind}.${spec.id}.${tier}`;
          mesh.count = 0;
          mesh.visible = false;
          mesh.frustumCulled = false; // culled per instance in update()
          // three r170 draws every caster into every shadow map (sun and both lamps), so only the near
          // tier casts: the mid tier (25–70 m) has no shadows (draw budget, spec 11)
          mesh.castShadow = tier === 'near' && spec.castShadow;
          mesh.receiveShadow = true;
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          this.root.add(mesh);
          this.meshes.push(mesh);
          return mesh;
        };
        group.parts.push({ spec, near: make('near'), mid: group.archetype.mid.includes(spec.id) ? make('mid') : null });
      });
    }

    const box = cache.geometry('impostor.box', () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
    const impostorMat = cache.material('impostor.lit', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }));
    this.#impostor = new THREE.InstancedMesh(box, impostorMat, Math.max(1, this.#impostorInstances.length));
    this.#impostor.name = 'impostors.far';
    this.#impostor.count = 0;
    this.#impostor.frustumCulled = false;
    this.#impostor.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.#impostor.setColorAt(0, new THREE.Color(0xffffff)); // allocates instanceColor
    this.root.add(this.#impostor);
    this.meshes.push(this.#impostor);
  }

  /** Re-buckets instances into tiers when the camera moved or turned enough. */
  update(camera: THREE.PerspectiveCamera, force = false): void {
    camera.getWorldDirection(this.#dir);
    const moved = this.#lastPos.distanceToSquared(camera.position) > REBUCKET_MOVE_M * REBUCKET_MOVE_M;
    const turned = this.#dir.dot(this.#lastDir) < REBUCKET_TURN_COS;
    if (!force && !this.#dirty && !moved && !turned) return;
    this.#dirty = false;
    this.#lastPos.copy(camera.position);
    this.#lastDir.copy(this.#dir);
    camera.updateMatrixWorld();
    this.#projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.#frustum.setFromProjectionMatrix(this.#projScreen);
    this.#rebucket(camera.position.x, camera.position.z);
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const mesh of this.meshes) mesh.dispose(); // instance buffers are ours; geometry/material are cached
    this.meshes.length = 0;
  }

  #footprintGround(ground: (x: number, z: number) => number, b: LayoutBuilding): number {
    const c = Math.cos(b.rotY);
    const s = Math.sin(b.rotY);
    let min = ground(b.x, b.z);
    for (const [lx, lz] of [[-b.w / 2, -b.d / 2], [b.w / 2, -b.d / 2], [-b.w / 2, b.d / 2], [b.w / 2, b.d / 2]] as const) {
      min = Math.min(min, ground(b.x + lx * c + lz * s, b.z - lx * s + lz * c));
    }
    return min;
  }

  #addInstance(group: KindGroup, x: number, y: number, z: number, rotY: number, dims: Dims, s: number, seed: number): void {
    const a = group.archetype;
    const isProp = group.family === 'prop';
    const base = baseMatrix(x, y, z, rotY, 1, 1, 1).clone();
    const parts = a.parts.map((spec) => {
      if (spec.scaled) {
        const out = new Float32Array(16);
        baseMatrix(x, y, z, rotY, dims.w, dims.h, dims.d).toArray(out);
        return out;
      }
      const places: readonly LocalPlace[] = spec.places?.(isProp ? a.nominal : dims, seed) ?? [];
      const out = new Float32Array(places.length * 16);
      places.forEach((p, i) => {
        const ps = p.s * (isProp ? s : 1);
        local.compose(pos.set(p.x * (isProp ? s : 1), p.y * (isProp ? s : 1), p.z * (isProp ? s : 1)), q.setFromAxisAngle(up, p.rotY), scl.set(ps, ps, ps));
        m.multiplyMatrices(base, local).toArray(out, i * 16);
      });
      return out;
    });
    const radius = Math.hypot(dims.w, dims.d, dims.h) / 2 + 1;
    let impostor: Float32Array | null = null;
    if (a.far) {
      impostor = new Float32Array(16);
      baseMatrix(x, y, z, rotY, dims.w, dims.h, dims.d).toArray(impostor);
    }
    const inst: Instance = {
      cx: x,
      cy: y + dims.h / 2,
      cz: z,
      radius,
      parts,
      impostor,
      farColor: new THREE.Color().setHex(a.farColor, THREE.SRGBColorSpace),
      tier: null
    };
    group.instances.push(inst);
    if (impostor) this.#impostorInstances.push(inst);
  }

  #visible(inst: Instance, margin: number): boolean {
    this.#sphere.center.set(inst.cx, inst.cy, inst.cz);
    this.#sphere.radius = inst.radius + margin;
    return this.#frustum.intersectsSphere(this.#sphere);
  }

  #rebucket(camX: number, camZ: number): void {
    const stats = this.stats;
    stats.near = 0;
    stats.mid = 0;
    stats.far = 0;
    stats.culled = 0;
    for (const group of this.#groups) {
      for (const inst of group.instances) {
        const dist = Math.hypot(inst.cx - camX, inst.cz - camZ) - inst.radius * 0.5;
        let tier: Tier | null;
        // near casters stay even when off-screen, their shadows fall into view
        if (dist <= LOD_NEAR_M) tier = 'near';
        else if (dist <= LOD_MID_M) tier = this.#visible(inst, MID_CULL_MARGIN) ? 'mid' : null;
        else tier = inst.impostor && this.#visible(inst, 0) ? 'far' : null;
        inst.tier = tier;
        if (tier === null) stats.culled += 1;
        else stats[tier] += 1;
      }
      group.parts.forEach((pm, partIndex) => {
        this.#fill(pm.near, group.instances, partIndex, 'near');
        if (pm.mid) this.#fill(pm.mid, group.instances, partIndex, 'mid');
      });
    }
    const arr = this.#impostor.instanceMatrix.array;
    let n = 0;
    for (const inst of this.#impostorInstances) {
      if (inst.tier !== 'far' || !inst.impostor) continue;
      arr.set(inst.impostor, n * 16);
      this.#impostor.setColorAt(n, inst.farColor);
      n += 1;
    }
    this.#impostor.count = n;
    this.#impostor.visible = n > 0;
    this.#impostor.instanceMatrix.needsUpdate = true;
    if (this.#impostor.instanceColor) this.#impostor.instanceColor.needsUpdate = true;
  }

  #fill(mesh: THREE.InstancedMesh, instances: readonly Instance[], partIndex: number, tier: Tier): void {
    const arr = mesh.instanceMatrix.array;
    let n = 0;
    for (const inst of instances) {
      if (inst.tier !== tier) continue;
      const mats = inst.parts[partIndex];
      if (!mats || mats.length === 0) continue;
      arr.set(mats, n * 16);
      n += mats.length / 16;
    }
    mesh.count = n;
    mesh.visible = n > 0;
    mesh.instanceMatrix.needsUpdate = true;
  }
}

/** The mesh name a planned group gets (tests match the built meshes against the plan). */
export const groupMeshName = (g: InstancedGroup): string => `${g.kind}.${g.part}.${g.tier}`;
