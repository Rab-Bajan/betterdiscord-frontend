import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GRID_RADIUS, HEX_SIZE, cleanlinessColor, hexCorner, hexDistance, hexToWorld, worldToHex } from '../../../../../src/features/games/sweepers/lib/world/hexGrid';
import { AssetCache } from '../../../../../src/features/games/sweepers/lib/engine/AssetCache';
import { applyOutputDevice, supportsSinkSelection } from '../../../../../src/features/games/sweepers/lib/audio/SweepersAudio';
import { cleanlinessTone } from '../../../../../src/features/games/sweepers/theme';

const grid = (): Array<{ q: number; r: number }> => {
  const out: Array<{ q: number; r: number }> = [];
  for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++)
    for (let r = -GRID_RADIUS; r <= GRID_RADIUS; r++)
      if (hexDistance({ q: 0, r: 0 }, { q, r }) <= GRID_RADIUS) out.push({ q, r });
  return out;
};

describe('hex grid', () => {
  it('has 37 hexes of outer radius 40 m', () => {
    expect(grid()).toHaveLength(37);
    expect(HEX_SIZE).toBe(40);
  });
  it('round-trips centres and points near them', () => {
    for (const { q, r } of grid()) {
      const { x, z } = hexToWorld(q, r);
      expect(worldToHex(x, z)).toEqual({ q, r });
      expect(worldToHex(x + 20, z - 15)).toEqual({ q, r });
    }
  });
  it('is pointy-top: corner 2 is straight below the centre (+Z)', () => {
    const c = hexCorner(0, 0, 2);
    expect(c.x).toBeCloseTo(0);
    expect(c.z).toBeCloseTo(HEX_SIZE);
  });
  it('colours by cleanliness', () => {
    expect(cleanlinessColor(0)).toBe(0xe94b64);
    expect(cleanlinessColor(49.9)).toBe(0xe94b64);
    expect(cleanlinessColor(50)).toBe(0xf5a623);
    expect(cleanlinessColor(89)).toBe(0xf5a623);
    expect(cleanlinessColor(90)).toBe(0x28c997);
    expect(cleanlinessTone(95)).toBe('#28C997');
    expect(cleanlinessTone(10)).toBe('#E94B64');
  });
});

describe('AssetCache', () => {
  it('creates each key once (re-entering re-uses)', () => {
    const cache = AssetCache.get();
    expect(AssetCache.get()).toBe(cache);
    const before = cache.createdCount;
    let calls = 0;
    const make = (): THREE.Texture => {
      calls += 1;
      return new THREE.Texture();
    };
    const a = cache.texture('test.key', make);
    const b = cache.texture('test.key', make);
    expect(a).toBe(b);
    expect(calls).toBe(1);
    expect(cache.createdCount).toBe(before + 1);
  });
  it('releaseGpu() fires dispose on every asset but keeps the CPU-side objects cached', () => {
    const cache = AssetCache.get();
    const geometry = cache.geometry('test.release', () => new THREE.BoxGeometry(1, 1, 1));
    let disposed = 0;
    geometry.addEventListener('dispose', () => { disposed += 1; });
    const before = cache.createdCount;
    cache.releaseGpu();
    expect(disposed).toBe(1);
    expect(cache.geometry('test.release', () => new THREE.BoxGeometry(2, 2, 2))).toBe(geometry);
    expect(geometry.getAttribute('position').count).toBeGreaterThan(0);
    expect(cache.createdCount).toBe(before);
  });
});

describe('audio output routing', () => {
  it('uses setSinkId when supported, mapping default to the empty id', async () => {
    const ids: string[] = [];
    const ctx = { setSinkId: async (id: string) => { ids.push(id); } };
    expect(supportsSinkSelection(ctx)).toBe(true);
    expect(await applyOutputDevice(ctx, 'default')).toBe(true);
    expect(await applyOutputDevice(ctx, 'speaker-2')).toBe(true);
    expect(ids).toEqual(['', 'speaker-2']);
  });
  it('is a graceful no-op without support or on failure', async () => {
    expect(supportsSinkSelection({})).toBe(false);
    expect(await applyOutputDevice({}, 'x')).toBe(false);
    expect(await applyOutputDevice({ setSinkId: () => Promise.reject(new Error('NotAllowed')) }, 'x')).toBe(false);
  });
});
