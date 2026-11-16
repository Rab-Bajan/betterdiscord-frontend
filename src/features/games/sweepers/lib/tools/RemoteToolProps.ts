// Távoli játékosok kézi kelléke (C.7 "Rigs"): a tick sor 8. eleme (`tool`) szerinti seprű / lombfúvó /
// vakuum / gereblye, állapot szerint animálva. Családonként egy InstancedMesh (4 rajzolás minden
// játékosra együtt); a kéz (7) nem mutat kelléket. Árnyékot nem vet.
import * as THREE from 'three';
import { AssetCache } from '../engine/AssetCache';
import { PartsBuilder } from '../world/geometryKit';
import { litMaterial } from '../world/materials';
import type { PlayerAnimState } from '../../types';

export const PROP_FAMILIES = ['broom', 'blower', 'vacuum', 'rake'] as const;
export type PropFamily = (typeof PROP_FAMILIES)[number];
export const REMOTE_PROP_DRAW_CALLS = PROP_FAMILIES.length;
const CAPACITY = 64;

export function propFamily(tool: number): PropFamily | null {
  if (tool >= 0 && tool <= 3) return 'broom';
  if (tool === 4) return 'blower';
  if (tool === 5) return 'vacuum';
  if (tool === 6) return 'rake';
  return null;
}

/** Broom size per tier (the WC brush is tiny, the road broom wide). */
const BROOM_SCALE: readonly number[] = [0.35, 0.8, 1, 1.25];

function familyGeometry(family: PropFamily): THREE.BufferGeometry {
  return AssetCache.get().geometry(`prop.${family}`, () => {
    const b = new PartsBuilder();
    switch (family) {
      case 'broom':
        b.cyl(0.015, 0.015, 1.3, 0xa8763e, { y: -1.1, z: -0.35, rx: 0.3 }).box(0.45, 0.1, 0.07, 0xc0262d, { y: -1.12, z: -0.68 });
        break;
      case 'blower':
        b.box(0.14, 0.16, 0.28, 0xd8541c).cyl(0.03, 0.04, 0.6, 0x333840, { z: -0.1, rx: -Math.PI / 2 - 0.4 });
        break;
      case 'vacuum':
        b.box(0.3, 0.4, 0.2, 0x3a4d6b, { y: 0.3, z: 0.25 }).cyl(0.022, 0.022, 0.9, 0x9aa3ad, { z: -0.1, rx: -Math.PI / 2 - 0.6 });
        break;
      case 'rake':
        b.cyl(0.015, 0.015, 1.4, 0x6b6f75, { y: -1.15, z: -0.35, rx: 0.3 }).box(0.55, 0.04, 0.05, 0x4c5158, { y: -1.15, z: -0.7 });
        break;
    }
    return b.build();
  });
}

export interface PropHolder {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotY: number;
  readonly tool: number;
  readonly state: PlayerAnimState;
}

export class RemoteToolProps {
  readonly root = new THREE.Group();
  readonly meshes: ReadonlyMap<PropFamily, THREE.InstancedMesh>;
  readonly #m = new THREE.Matrix4();
  readonly #local = new THREE.Matrix4();
  readonly #q = new THREE.Quaternion();
  readonly #e = new THREE.Euler(0, 0, 0, 'YXZ');
  readonly #p = new THREE.Vector3();
  readonly #s = new THREE.Vector3();

  constructor() {
    this.root.name = 'remote-props';
    const meshes = new Map<PropFamily, THREE.InstancedMesh>();
    for (const family of PROP_FAMILIES) {
      const mesh = new THREE.InstancedMesh(familyGeometry(family), litMaterial(), CAPACITY);
      mesh.name = `remote-props.${family}`;
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      meshes.set(family, mesh);
      this.root.add(mesh);
    }
    this.meshes = meshes;
  }

  /** Places every holder's prop at its right hand; sweeping swings it, operating vibrates it. */
  update(holders: readonly PropHolder[], time: number): void {
    const counts = new Map<PropFamily, number>();
    for (const h of holders) {
      const family = propFamily(h.tool);
      const mesh = family ? this.meshes.get(family) : undefined;
      if (!family || !mesh) continue;
      const n = counts.get(family) ?? 0;
      if (n >= CAPACITY) continue;
      const swing = h.state === 'SWEEPING_ARCS' ? Math.sin(time * Math.PI * 4) * 0.6 : 0;
      const buzz = h.state === 'OPERATING_VACUUM' ? Math.sin(time * 120) * 0.01 : 0;
      const scale = family === 'broom' ? (BROOM_SCALE[h.tool] ?? 1) : 1;
      this.#q.setFromEuler(this.#e.set(0, h.rotY, 0));
      this.#m.compose(this.#p.set(h.x, h.y, h.z), this.#q, this.#s.set(1, 1, 1));
      this.#q.setFromEuler(this.#e.set(0, swing, 0));
      this.#local.compose(this.#p.set(0.32, 1.15 + buzz, -0.15), this.#q, this.#s.set(scale, 1, scale));
      mesh.setMatrixAt(n, this.#m.multiply(this.#local));
      counts.set(family, n + 1);
    }
    for (const [family, mesh] of this.meshes) {
      mesh.count = counts.get(family) ?? 0;
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) mesh.dispose();
    this.root.removeFromParent();
  }
}
