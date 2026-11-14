import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { WorldBuilder } from '../../../../../src/features/games/sweepers/lib/world/WorldBuilder';
import { AssetCache } from '../../../../../src/features/games/sweepers/lib/engine/AssetCache';
import { hexToWorld } from '../../../../../src/features/games/sweepers/lib/world/hexGrid';
import type { HexSnapshot } from '../../../../../src/features/games/sweepers/types';

const hexes: HexSnapshot[] = [
  { id: 0, q: 0, r: 0, district: 0, cleanliness: 95 },
  { id: 1, q: 1, r: 0, district: 1, cleanliness: 60 },
  { id: 2, q: 0, r: 1, district: 2, cleanliness: 10 }
];

const outlines = (scene: THREE.Scene): THREE.InstancedMesh => {
  const mesh = scene.getObjectByName('hex-outlines');
  if (!(mesh instanceof THREE.InstancedMesh)) throw new Error('no outlines');
  return mesh;
};

describe('WorldBuilder (Phase A)', () => {
  it('builds ground, hex outlines and the MÉH fence, and finds the hex under a point', () => {
    const scene = new THREE.Scene();
    const world = new WorldBuilder(scene);
    world.applyHexes(hexes);
    expect(scene.getObjectByName('ground')).toBeDefined();
    expect(scene.getObjectByName('meh-yard')).toBeDefined();
    const mesh = outlines(scene);
    expect(mesh.count).toBe(3);
    const c = new THREE.Color();
    mesh.getColorAt(2, c);
    expect(c.getHex()).toBe(0xe94b64);
    const { x, z } = hexToWorld(1, 0);
    expect(world.hexAt(x, z)?.district).toBe(1);
    expect(world.hexAt(5000, 0)).toBeNull();
    world.dispose();
    expect(scene.getObjectByName('world')).toBeUndefined();
  });

  it('re-entering re-uses cached geometry and materials (spec 12)', () => {
    const first = new WorldBuilder(new THREE.Scene());
    first.dispose();
    const created = AssetCache.get().createdCount;
    const sceneB = new THREE.Scene();
    const second = new WorldBuilder(sceneB);
    second.applyHexes(hexes);
    expect(AssetCache.get().createdCount).toBe(created);
    second.dispose();
  });
});
