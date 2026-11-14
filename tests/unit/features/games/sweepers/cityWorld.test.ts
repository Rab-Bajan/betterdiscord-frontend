import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { WorldBuilder } from '../../../../../src/features/games/sweepers/lib/world/WorldBuilder';
import { AssetCache } from '../../../../../src/features/games/sweepers/lib/engine/AssetCache';
import { DRAW_CALL_LIMIT, SPOT_SHADOW_LIGHTS, LOD_MID_M, LOD_NEAR_M, drawBudget, planDraws, planInputOf, worstCaseInput } from '../../../../../src/features/games/sweepers/lib/world/drawPlan';
import { groupMeshName } from '../../../../../src/features/games/sweepers/lib/world/InstancedWorld';
import { FIGURE_DRAW_CALLS, FIGURE_SHADOW_CASTERS, RemotePlayers } from '../../../../../src/features/games/sweepers/lib/world/RemotePlayers';
import { SceneEnvironment } from '../../../../../src/features/games/sweepers/lib/world/SceneEnvironment';
import { WeatherFx } from '../../../../../src/features/games/sweepers/lib/world/WeatherFx';
import { borderSegment, bordersFromHexes, outskirtsBorders, tapedBorder } from '../../../../../src/features/games/sweepers/lib/world/cityLayers';
import { lampHeads, nearestLamps } from '../../../../../src/features/games/sweepers/lib/world/LightingRig';
import { districtAt, hexCorner, hexDistance, hexToWorld, worldToHex } from '../../../../../src/features/games/sweepers/lib/world/hexGrid';
import { districtBanner } from '../../../../../src/features/games/sweepers/components/HUDOverlay';
import { realInit, smallInit } from './fixtures';
import { DebrisWorld } from '../../../../../src/features/games/sweepers/lib/debris/DebrisWorld';
import { ToolRig } from '../../../../../src/features/games/sweepers/lib/tools/ToolRig';
import { PHASE_C_DRAW_CALLS, PHASE_D_DRAW_CALLS } from '../../../../../src/features/games/sweepers/lib/engine/SweepersGame';

const camera = (x: number, z: number, yaw = 0): THREE.PerspectiveCamera => {
  const cam = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 900);
  cam.position.set(x, 2, z);
  cam.rotation.set(0, yaw, 0);
  cam.updateMatrixWorld();
  return cam;
};

const frame = (cam: THREE.PerspectiveCamera) => ({ camera: cam, timeSec: 0, now: 0, night: 0, lampsOn: false });

/** Draws of one renderable: one per material group when the material is an array. */
const drawsOf = (o: THREE.Object3D): number => {
  if (!(o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Points || o instanceof THREE.Sprite)) return 0;
  const m: unknown = o.material;
  return Array.isArray(m) && o.geometry instanceof THREE.BufferGeometry ? Math.max(1, o.geometry.groups.length) : 1;
};

/** three r170 WebGLRenderer.projectObject: visible subtree, layers of the camera; frustum assumed to pass. */
const mainDraws = (o: THREE.Object3D, layers: THREE.Layers): number => {
  if (!o.visible) return 0;
  let n = o.layers.test(layers) ? drawsOf(o) : 0;
  for (const c of o.children) n += mainDraws(c, layers);
  return n;
};

/** three r170 WebGLShadowMap.renderObject: visible subtree, layers of the MAIN camera, castShadow mesh/line/points. */
const shadowDraws = (o: THREE.Object3D, layers: THREE.Layers): number => {
  if (!o.visible) return 0;
  let n = o.layers.test(layers) && o.castShadow && !(o instanceof THREE.Sprite) ? drawsOf(o) : 0;
  for (const c of o.children) n += shadowDraws(c, layers);
  return n;
};

/** Shadow-casting lights three renders a map for (WebGLRenderer.projectObject: visible light with castShadow). */
const shadowLights = (scene: THREE.Scene): THREE.Light[] => {
  const out: THREE.Light[] = [];
  scene.traverseVisible((o) => {
    if (o instanceof THREE.Light && o.castShadow) out.push(o);
  });
  return out;
};

describe('draw-call budget (spec 11)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('the plan worst case (every kind visible at once, 16 remote players, night shadows, Phase C + D draws) stays under 400', () => {
    const plan = planDraws(worstCaseInput());
    const players = 16;
    const budget = drawBudget(plan, players * FIGURE_DRAW_CALLS + PHASE_C_DRAW_CALLS + PHASE_D_DRAW_CALLS, players * FIGURE_SHADOW_CASTERS);
    expect(budget.total).toBeLessThanOrEqual(DRAW_CALL_LIMIT);
    expect(budget.main + budget.sunShadow + budget.spotShadow).toBe(budget.total);
  });

  it('counts what three really draws: the real city, debris, tool rig, props and particles shown, 16 players at night', () => {
    // name tags draw on a canvas; node has no DOM
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
    const init = realInit();
    const scene = new THREE.Scene();
    const env = new SceneEnvironment(scene);
    const world = new WorldBuilder(scene);
    world.load(init.layout, init.hexes, init.unlockedDistricts);
    const remotes = new RemotePlayers(scene);
    const players = 16;
    for (let id = 1; id <= players; id++) {
      remotes.add({ id, accountId: null, username: `p${id}`, avatarColor: '#FF7A1A', x: id, y: 0, z: 0, rotY: 0, state: 'IDLE', tool: 0, carry: 0 }, 0);
    }
    const rain = new WeatherFx();
    const cam = camera(0, 0);
    const debris = new DebrisWorld(() => 0);
    const rig = new ToolRig();
    cam.add(rig.root);
    scene.add(cam, rain.root, debris.root);
    // worst case: every group of the city has instances in view, tape and rain are on, every debris kind,
    // every prop family and the particles are drawn
    scene.traverse((o) => {
      o.visible = true;
    });
    // the rig shows body + head or body + hose, never all three: the vacuum is its widest state
    rig.setTool(0);
    rig.setTool(5);
    expect(PHASE_C_DRAW_CALLS).toBeLessThanOrEqual(16);
    const lights = shadowLights(scene);
    expect(lights).toContain(env.sun);
    const casters = shadowDraws(scene, cam.layers);
    const real = { main: mainDraws(scene, cam.layers), sun: casters, spot: (lights.length - 1) * casters };
    const plan = world.plan;
    if (!plan) throw new Error('no plan');
    const budget = drawBudget(plan, players * FIGURE_DRAW_CALLS + PHASE_C_DRAW_CALLS, players * FIGURE_SHADOW_CASTERS);
    // the budget model follows the real passes exactly: every caster in every shadow map…
    expect(real).toEqual({ main: budget.main, sun: budget.sunShadow, spot: budget.spotShadow });
    expect(lights.length - 1).toBe(SPOT_SHADOW_LIGHTS);
    // …and only near-tier meshes and figures cast (mid tier and tape do not)
    const mid: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (o.castShadow && (o.name.endsWith('.mid') || o.name === 'locked-tape')) mid.push(o);
    });
    expect(mid).toEqual([]);
    expect(real.main + real.sun + real.spot).toBeLessThanOrEqual(DRAW_CALL_LIMIT);
    // debris, rig, props and particles cast no shadows
    const phaseC: THREE.Object3D[] = [];
    for (const root of [debris.root, rig.root, remotes.props.root]) root.traverse((o) => {
      if (o.castShadow) phaseC.push(o);
    });
    expect(phaseC).toEqual([]);
    debris.dispose();
    rig.dispose();
    remotes.dispose();
    rain.dispose();
    world.dispose();
    env.dispose();
  });

  it('every transparent double-sided material of the full scene is forced single-pass (B LOW-12)', () => {
    // three r170 draws transparent + DoubleSide in two passes (back, then front) unless forceSinglePass;
    // the budget counts one call per mesh, so a missing flag would silently cost one draw more
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
    const init = realInit();
    const scene = new THREE.Scene();
    const env = new SceneEnvironment(scene);
    const world = new WorldBuilder(scene);
    world.load(init.layout, init.hexes, init.unlockedDistricts);
    const remotes = new RemotePlayers(scene);
    remotes.add({ id: 1, accountId: null, username: 'p', avatarColor: '#FF7A1A', x: 0, y: 0, z: 0, rotY: 0, state: 'IDLE', tool: 3, carry: 0 }, 0);
    const rain = new WeatherFx();
    const debris = new DebrisWorld(() => 0);
    const rig = new ToolRig();
    const cam = camera(0, 0);
    cam.add(rig.root);
    scene.add(cam, rain.root, debris.root);
    const materials = new Set<THREE.Material>();
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Points || o instanceof THREE.Sprite)) return;
      const m: unknown = o.material;
      for (const mat of Array.isArray(m) ? m : [m]) if (mat instanceof THREE.Material) materials.add(mat);
    });
    expect(materials.size).toBeGreaterThan(10);
    const twoPass = [...materials].filter((m) => m.transparent && m.side === THREE.DoubleSide && !m.forceSinglePass).map((m) => m.name || m.type);
    expect(twoPass).toEqual([]);
    // the one transparent double-sided material of the city is among them, so the check is not vacuous
    expect([...materials].some((m) => m.transparent && m.side === THREE.DoubleSide)).toBe(true);
    debris.dispose();
    rig.dispose();
    remotes.dispose();
    rain.dispose();
    world.dispose();
    env.dispose();
  });

  it('the real layout builds exactly the planned InstancedMesh groups', () => {
    const init = realInit();
    const world = new WorldBuilder(new THREE.Scene());
    world.load(init.layout, init.hexes, init.unlockedDistricts);
    const plan = planDraws(planInputOf(init.layout));
    const names = world.instancedMeshes.map((m) => m.name).sort();
    expect(names).toEqual([...plan.instanced.map(groupMeshName), 'impostors.far'].sort());
    expect(world.plan?.instanced.length).toBe(plan.instanced.length);
    world.dispose();
  });
});

describe('Phase B city world', () => {
  it('tapes locked sector borders in the outskirts too (the lock applies there, layout.borders stops at the grid)', () => {
    const borders = outskirtsBorders();
    expect(borders.length).toBeGreaterThan(0);
    for (const b of borders) {
      expect(b.a).toBeLessThan(b.b);
      expect(Math.max(Math.abs(b.x), Math.abs(b.z))).toBeLessThanOrEqual(300);
      // the two sides of the edge really are those districts, and at least one side is outskirts
      const nx = Math.sin(b.rotY);
      const nz = Math.cos(b.rotY);
      const sides = [districtAt(b.x + nx, b.z + nz), districtAt(b.x - nx, b.z - nz)].sort((p, q) => p - q);
      expect(sides).toEqual([b.a, b.b]);
      const far = [worldToHex(b.x + nx, b.z + nz), worldToHex(b.x - nx, b.z - nz)].map((h) => hexDistance(h, { q: 0, r: 0 }));
      expect(Math.max(...far)).toBeGreaterThan(3);
    }
    const open = new Set([0, 1]);
    const taped = borders.filter((b) => tapedBorder(b, open));
    expect(taped.length).toBeGreaterThan(0);
    expect(taped.every((b) => b.a === 1 || b.b === 1)).toBe(true);
    expect(borders.filter((b) => tapedBorder(b, new Set([0, 1, 2, 3, 4, 5])))).toHaveLength(0);
    // the city tapes them too (WorldBuilder wiring), on top of the grid borders
    const init = realInit();
    const world = new WorldBuilder(new THREE.Scene());
    world.load(init.layout, init.hexes, [1]);
    expect(world.tapedBorders).toBe(init.layout.borders.filter((b) => tapedBorder(b, open)).length + taped.length);
    world.dispose();
    expect(districtBanner({ district: null, cleanliness: null, districtLocked: true })).toBe('VÁROSHATÁRON KÍVÜL – LEZÁRVA');
    expect(districtBanner({ district: null, cleanliness: null, districtLocked: false })).toBe('VÁROSHATÁRON KÍVÜL');
  });

  it('builds the terrain, draped roads, beacons and the locked-border tape from the layout', () => {
    const init = realInit();
    const scene = new THREE.Scene();
    const world = new WorldBuilder(scene);
    world.load(init.layout, init.hexes, init.unlockedDistricts);
    expect(scene.getObjectByName('ground')).toBeUndefined(); // the flat Phase A plane is gone
    expect(scene.getObjectByName('meh-yard')).toBeUndefined();
    const terrain = scene.getObjectByName('terrain');
    expect(terrain).toBeInstanceOf(THREE.Mesh);
    for (const kind of ['road', 'sidewalk', 'rail', 'path', 'stairs']) expect(scene.getObjectByName(`road.${kind}`), kind).toBeDefined();
    expect(scene.getObjectByName('rail.sleepers')).toBeInstanceOf(THREE.InstancedMesh);
    for (const kind of ['mud', 'grease', 'acid', 'wet']) expect(scene.getObjectByName(`surface.${kind}`), kind).toBeDefined();
    const beacons = scene.getObjectByName('hex-beacons');
    expect(beacons instanceof THREE.InstancedMesh ? beacons.count : -1).toBe(37);
    // only district 0 open: every border touching district 0 is taped
    const tape = scene.getObjectByName('locked-tape');
    expect(tape?.visible).toBe(true);
    const borders = init.layout.borders;
    expect(borders.filter((b) => tapedBorder(b, new Set([0]))).length).toBe(borders.filter((b) => b.a === 0).length);
    world.setUnlocked([1, 2, 3, 4, 5]);
    expect(scene.getObjectByName('locked-tape')?.visible).toBe(false);
    // roads sit on the terrain (draped), not on y = 0
    const road = scene.getObjectByName('road.road');
    if (!(road instanceof THREE.Mesh)) throw new Error('no road');
    const pos = road.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i += 97) expect(pos.getY(i)).toBeCloseTo(world.groundAt(pos.getX(i), pos.getZ(i)) + 0.04, 3);
    world.dispose();
    expect(scene.getObjectByName('world')).toBeUndefined();
  });

  it('LOD tiers: near ≤ 25 m, mid ≤ 70 m (frustum culled), far impostors beyond', () => {
    const init = realInit();
    const world = new WorldBuilder(new THREE.Scene());
    world.load(init.layout, init.hexes, [0, 1, 2, 3, 4, 5]);
    expect(LOD_NEAR_M).toBe(25);
    expect(LOD_MID_M).toBe(70);
    world.update(frame(camera(0, 0)));
    const front = world.lodStats;
    if (!front) throw new Error('no stats');
    const firstFront = { ...front };
    expect(firstFront.near).toBeGreaterThan(0);
    expect(firstFront.mid).toBeGreaterThan(0);
    expect(firstFront.far).toBeGreaterThan(0);
    expect(firstFront.culled).toBeGreaterThan(0); // half the city is behind the camera
    world.update(frame(camera(0, 0, Math.PI)));
    const back = world.lodStats;
    if (!back) throw new Error('no stats');
    expect(back.near).toBe(firstFront.near); // near casters are kept regardless of the view direction
    const visible = world.instancedMeshes.filter((m) => m.visible);
    for (const m of visible) expect(m.count).toBeGreaterThan(0);
    for (const m of world.instancedMeshes.filter((x) => !x.visible)) expect(m.count).toBe(0);
    world.dispose();
  });

  it('re-entering the same layout creates no new geometry or materials', () => {
    const init = realInit();
    const first = new WorldBuilder(new THREE.Scene());
    first.load(init.layout, init.hexes, init.unlockedDistricts);
    first.dispose();
    const created = AssetCache.get().createdCount;
    const second = new WorldBuilder(new THREE.Scene());
    second.load(realInit().layout, init.hexes, init.unlockedDistricts);
    second.update(frame(camera(10, 10)));
    expect(AssetCache.get().createdCount).toBe(created);
    second.dispose();
  });

  it('setHexCleanliness updates the hex and reports the previous value; a null layout falls back to Phase A', () => {
    const init = smallInit();
    const scene = new THREE.Scene();
    const world = new WorldBuilder(scene);
    world.load(init.layout, init.hexes, init.unlockedDistricts);
    const hex = init.hexes[0];
    if (!hex) throw new Error('no hex');
    const res = world.setHexCleanliness(hex.id, 91);
    expect(res?.previous).toBe(hex.cleanliness);
    const centre = hexToWorld(hex.q, hex.r);
    expect(world.hexAt(centre.x, centre.z)?.cleanliness).toBe(91);
    expect(world.setHexCleanliness(999, 50)).toBeNull();
    // the small fixture sends no borders: they are derived from the hexes
    expect(scene.getObjectByName('locked-tape')?.visible).toBe(true);
    world.load(null, init.hexes, [0]);
    expect(scene.getObjectByName('ground')).toBeDefined();
    expect(scene.getObjectByName('terrain')).toBeUndefined();
    expect(world.mask).toBeNull();
    world.dispose();
  });

  it('border segments and derived borders agree with the hex corners', () => {
    const init = smallInit();
    const derived = bordersFromHexes(init.hexes);
    expect(derived.length).toBeGreaterThan(0);
    for (const b of derived) expect(b.a).toBeLessThan(b.b);
    const east = derived.find((b) => b.a === 0 && Math.abs(b.z) < 1e-6 && b.x > 0);
    if (!east) throw new Error('no east border');
    const [ax, az, bx, bz] = borderSegment(east);
    const c0 = hexCorner(0, 0, 0);
    const c1 = hexCorner(0, 0, 1);
    const ends = [[ax, az], [bx, bz]].map(([x = 0, z = 0]) => Math.min(Math.hypot(x - c0.x, z - c0.z), Math.hypot(x - c1.x, z - c1.z)));
    for (const d of ends) expect(d).toBeLessThan(1e-6);
    expect(east.x).toBeCloseTo(hexToWorld(1, 0).x / 2);
  });

  it('lamp heads and the nearest-light pool', () => {
    const heads = lampHeads([
      { kind: 'street_lamp', x: 0, z: 0, rotY: 0, s: 1 },
      { kind: 'hex_lamp', x: 10, z: 0, rotY: Math.PI / 2, s: 1 },
      { kind: 'bench', x: 5, z: 5, rotY: 0, s: 1 }
    ], () => 1);
    expect(heads).toHaveLength(2);
    expect(heads[0]).toEqual({ x: 0, y: 6.92, z: 1.25 });
    expect(heads[1]?.x).toBeCloseTo(11.25);
    expect(nearestLamps(heads, 9, 0, 1)).toEqual([1]);
  });
});
