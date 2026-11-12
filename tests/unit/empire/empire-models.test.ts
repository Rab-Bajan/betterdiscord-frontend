/**
 * Port of tests/legacy/empire-models.legacy.mjs (9 test() cases).
 * Same 9 test names; assertions mapped 1:1. document.createElement is stubbed via vi.stubGlobal in beforeAll and restored in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type * as THREE from 'three';
import type { Lod, ModelKit } from '../../../src/features/games/empire/lib/empire3d/models';
import type { Model } from '../../../src/features/games/empire/lib/empire3d/modelKit';
import type { TextureLib } from '../../../src/features/games/empire/lib/empire3d/textures';

/** The value, or a thrown error naming what was missing. */
function must<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) throw new Error(`missing ${what}`);
  return value;
}

// Building every model/LOD is CPU heavy; the default 5s per-test limit is too tight on a loaded machine.
vi.setConfig({ testTimeout: 60000, hookTimeout: 60000 });

describe('MiskolcEmpire 3D model kit', () => {
  let lib: TextureLib;
  let kit: ModelKit;

  // the texture library paints two small atlases on a canvas; a no-op 2D context is enough here
  beforeAll(async () => {
    const ctx = new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
    const { createTextureLib } = await import('../../../src/features/games/empire/lib/empire3d/textures');
    const { createModelKit } = await import('../../../src/features/games/empire/lib/empire3d/models');
    lib = createTextureLib();
    kit = createModelKit(lib);
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  const UNITS = ['scavenger', 'builder', 'knife', 'brawler', 'slingshot', 'airgunner', 'grinder', 'elder', 'infiltrator', 'ciganyAsszony', 'civilian', 'horseWagon', 'lada', 'ram'];
  const BUILDINGS = ['townCenter', 'scrapYard', 'house', 'tavern', 'barracks', 'workshop', 'tower', 'fence', 'wall'];
  const NODES = ['iron', 'copper', 'food', 'wood'];
  const SRC = new Set(['legL', 'legR', 'kneeL', 'kneeR', 'armL', 'armR', 'elbowL', 'elbowR', 'wheel', 'disk', 'piston', 'crane', 'search']);

  const tris = (m: Model, scaffold = false): number => m.parts.filter((p) => p.scaffold === scaffold).reduce((n, p) => n + (p.geo.index?.count ?? NaN) / 3, 0);
  function check(name: string, m: Model, budget: number): number {
    expect(m.parts.length, `${name}: no parts`).toBeGreaterThan(0);
    for (const p of m.parts) {
      expect(p.geo.index, `${name}: part without index`).toBeTruthy();
      for (const a of ['position', 'normal', 'uv', 'color']) expect(p.geo.attributes[a], `${name}: part without ${a}`).toBeTruthy();
      expect(p.mat && p.mat.isMaterial, `${name}: part without material`).toBeTruthy();
      expect(p.ji >= -1 && p.ji < m.joints.length, `${name}: joint index out of range`).toBeTruthy();
      const pos = p.geo.getAttribute('position').array;
      expect(Array.from(pos).every(Number.isFinite), `${name}: non-finite vertex`).toBe(true);
    }
    m.joints.forEach((j, i) => {
      expect(j.parent, `${name}: joint ${i} listed before its parent`).toBeLessThan(i);
      expect(j.src === null || SRC.has(j.src), `${name}: unknown animation channel ${j.src}`).toBeTruthy();
    });
    expect(m.top > 0 && m.radius > 0, `${name}: missing top / radius`).toBeTruthy();
    const n = tris(m);
    expect(n, `${name}: ${n} triangles exceeds the budget of ${budget}`).toBeLessThanOrEqual(budget);
    return n;
  }

  it('every unit builds, has a posable skeleton and stays within 12k triangles', () => {
    for (const k of UNITS) {
      const m = kit.unit(k);
      check(k, m, 12000);
      expect(m.joints.length, `${k}: units are animated`).toBeGreaterThan(0);
      // civilians are neutral: nothing on them may take a player's colour
      expect(m.parts.some((p) => p.team), `${k}: wrong use of the owner's colour`).toBe(k !== 'civilian');
    }
    expect(kit.unit('no-such-unit')).toBe(kit.unit('unit_generic'));
  });
  it('every building builds with scaffolding and stays within 40k triangles', () => {
    for (const k of BUILDINGS) {
      const m = kit.building(k, 1, 2);
      check(k, m, 40000);
      expect(m.parts.some((p) => p.scaffold), `${k}: no scaffolding for the construction phase`).toBeTruthy();
      expect(m.parts.some((p) => p.team), `${k}: nothing shows the owner's colour`).toBeTruthy();
      expect(m.size).toBeGreaterThanOrEqual(1);
    }
  });
  it('the house becomes a panel block from epoch 3 and unknown kinds fall back to a generic building', () => {
    expect(kit.building('house', 3, 2)).not.toBe(kit.building('house', 1, 2));
    expect(kit.building('house', 4, 2)).toBe(kit.building('house', 3, 2));
    check('house_panel', kit.building('house', 3, 2), 40000);
    const g = kit.building('no-such-building', 1, 3);
    expect(g.size).toBe(3);
    expect(kit.building('another-unknown', 1, 3)).toBe(g);
    check('generic', g, 40000);
  });
  it('resource nodes build and unknown kinds fall back to iron', () => {
    for (const k of NODES) check(`node_${k}`, kit.node(k), 9000);
    expect(kit.node('nope')).toBe(kit.node('iron'));
  });
  it('emitters sit inside the building they belong to', () => {
    for (const k of BUILDINGS) for (const e of kit.building(k, 1, 2).emitters) {
      expect(['smoke', 'fire', 'weld'].includes(e.type)).toBeTruthy();
      expect(Math.abs(e.p[0]) < 1.6 && Math.abs(e.p[2]) < 1.6 && e.p[1] > 0 && e.p[1] < 3.2, `${k}: emitter out of bounds`).toBeTruthy();
    }
  });
  it('wheels of one vehicle share a single geometry per material', () => {
    const lada = kit.unit('lada');
    const wheelParts = lada.parts.filter((p) => p.ji >= 0 && lada.joints[p.ji]?.src === 'wheel');
    expect(new Set(wheelParts.map((p) => p.geo.uuid)).size * 4).toBe(wheelParts.length);
  });
  it('the thrown clog is a small rigid model with a distant version; other projectiles have none', () => {
    const near = must(kit.projectile('ciganyAsszony'), 'clog'), far = must(kit.projectile('ciganyAsszony', 1), 'far clog');
    check('clog', near, 1500);
    check('clog (far)', far, 1500);
    expect(tris(far)).toBeLessThan(tris(near));
    for (const m of [near, far]) {
      expect(m.joints.length).toBe(0);
      expect(m.parts.some((p) => p.team || p.ji >= 0)).toBeFalsy();
      expect(m.parts.some((p) => p.mat === kit.mats.wood)).toBeTruthy();
    }
    expect(kit.projectile('slingshot')).toBe(null);
  });
  it('the distant level of detail keeps skeleton, materials and bounds with far fewer triangles', () => {
    const pairs: Array<readonly [string, Model, Model]> = [...UNITS.map((k) => [k, kit.unit(k), kit.unit(k, 1)] as const), ...BUILDINGS.map((k) => [k, kit.building(k, 1, 2), kit.building(k, 1, 2, 1)] as const), ...NODES.map((k) => [k, kit.node(k), kit.node(k, 1)] as const)];
    for (const [k, hi, lo] of pairs) {
      const n = check(`${k} (far)`, lo, 40000);
      // rounded figures simplify a lot; buildings are mostly flat boards that were cheap to begin with
      expect(n <= tris(hi) * (UNITS.includes(k) ? 0.5 : 0.8) || n < 400, `${k}: far model has ${n} of ${tris(hi)} triangles`).toBeTruthy();
      expect(lo.joints.map((j) => [j.src, j.parent]), `${k}: skeletons differ`).toStrictEqual(hi.joints.map((j) => [j.src, j.parent]));
      expect([lo.top, lo.radius, lo.size, lo.emitters.length]).toStrictEqual([hi.top, hi.radius, hi.size, hi.emitters.length]);
      const mats = new Set(hi.parts.map((p) => p.mat));
      for (const p of lo.parts) expect(mats.has(p.mat), `${k}: far model uses a material the near one does not`).toBe(true);
    }
  });
  it('dispose releases every geometry of every built model exactly once', () => {
    const LODS: readonly Lod[] = [0, 1];
    const geos = new Set<THREE.BufferGeometry>();
    for (const k of UNITS) for (const l of LODS) kit.unit(k, l).parts.forEach((p) => geos.add(p.geo));
    for (const k of BUILDINGS) for (const l of LODS) kit.building(k, 1, 2, l).parts.forEach((p) => geos.add(p.geo));
    for (const l of LODS) must(kit.projectile('ciganyAsszony', l), 'clog').parts.forEach((p) => geos.add(p.geo));
    const count = new Map<THREE.BufferGeometry, number>();
    for (const g of geos) g.addEventListener('dispose', () => count.set(g, (count.get(g) || 0) + 1));
    kit.dispose();
    lib.dispose();
    for (const g of geos) expect(count.get(g)).toBe(1);
  });
});
