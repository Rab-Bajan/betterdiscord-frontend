import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { chooseSlot, broomSlotTool, ownedBrooms, slotOfTool, slotTool } from '../../../../../src/features/games/sweepers/lib/tools/hotbar';
import { ToolSession, REGEN_DELAY_MS } from '../../../../../src/features/games/sweepers/lib/tools/ToolSession';
import { ToolRig, HOSE_SEGMENTS, bezier } from '../../../../../src/features/games/sweepers/lib/tools/ToolRig';
import { RemoteToolProps } from '../../../../../src/features/games/sweepers/lib/tools/RemoteToolProps';
import { KOFOLA_SPRINT, repairCost } from '../../../../../src/features/games/sweepers/lib/tools/catalog';
import { ChunkStore } from '../../../../../src/features/games/sweepers/lib/debris/ChunkStore';
import { DebrisRenderer, MAX_DEBRIS_INSTANCES, kickDuration, kickPose } from '../../../../../src/features/games/sweepers/lib/debris/DebrisRenderer';
import { DebrisParticles, MAX_PARTICLES } from '../../../../../src/features/games/sweepers/lib/debris/DebrisParticles';
import { chunkIdAt, FLAG_BURIED } from '../../../../../src/features/games/sweepers/lib/debris/tables';
import { stepBody, SPRINT_SPEED, type BodyState } from '../../../../../src/features/games/sweepers/lib/movement/MovementModel';
import { DEFAULT_PERSONAL, parseChunkUpdate, type PersonalState } from '../../../../../src/features/games/sweepers/debrisTypes';
import { actionForKey } from '../../../../../src/features/games/sweepers/lib/input/keymap';
import { hotbarSlots } from '../../../../../src/features/games/sweepers/components/ToolHud';
import { shopOffers } from '../../../../../src/features/games/sweepers/components/ShopPanel';
import { loadEntry, uniformCells, type RowSpec } from './debrisHelpers';

const ALL = 0xff;
const bits = (...tools: number[]): number => tools.reduce((m, t) => m | (1 << t), 0b10000001);

describe('hotbar mapping and cycling (60, C.7)', () => {
  it('slot 1 is the broom family, slots 2–5 tools 4–7, slot 6 the bag', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(slotOfTool)).toEqual([0, 0, 0, 0, 1, 2, 3, 4]);
    expect(slotTool(0, bits(2), 7)).toBe(2); // best owned broom
    expect(slotTool(5, ALL, 0)).toBeNull();
    expect(ownedBrooms(bits(1, 3))).toEqual([3, 1, 0]);
    expect(broomSlotTool(bits(1, 3), 1)).toBe(1); // the equipped broom shows
  });
  it('pressing 1 picks the best broom, then cycles the owned ones downward and wraps', () => {
    const owned = bits(1, 3);
    expect(chooseSlot(0, owned, 7)).toEqual({ kind: 'select', tool: 3 });
    expect(chooseSlot(0, owned, 3)).toEqual({ kind: 'select', tool: 1 });
    expect(chooseSlot(0, owned, 1)).toEqual({ kind: 'select', tool: 0 });
    expect(chooseSlot(0, owned, 0)).toEqual({ kind: 'select', tool: 3 });
    expect(chooseSlot(0, bits(), 0)).toEqual({ kind: 'same' }); // only the WC brush
  });
  it('an unowned tool is refused locally, the equipped one is a no-op, the bag is disabled', () => {
    expect(chooseSlot(1, bits(), 0)).toEqual({ kind: 'unowned', tool: 4 });
    expect(chooseSlot(3, bits(6), 0)).toEqual({ kind: 'select', tool: 6 });
    expect(chooseSlot(4, bits(), 7)).toEqual({ kind: 'same' });
    expect(chooseSlot(5, ALL, 0)).toEqual({ kind: 'disabled' });
  });
  it('G dumps the pack', () => {
    expect(actionForKey('KeyG')).toBe('dumpPack');
  });
  it('the hotbar view shows durability (tools 1–3), the equipped buffer and the blower fuel', () => {
    const personal: PersonalState = { ...DEFAULT_PERSONAL, owned: bits(2, 4), toolTier: 2, dur: [1000, 150, 1000], fuelMl: 500, buf: { ...DEFAULT_PERSONAL.buf, kg: 2 }, caps: { bufKg: 8, packKg: 10, packL: 8 } };
    const slots = hotbarSlots({ personal, tool: 2, stamina: 50, fx: { stench: false, beer: false, kofola: false }, shop: { workbench: false, kiosk: false }, debris: true, carrying: false, bagTier: null, tie: 0 });
    expect(slots.map((s) => s.active)).toEqual([true, false, false, false, false, false]);
    expect(slots[0]).toMatchObject({ tool: 2, durability: 0.15, fill: 0.25 });
    expect(slots[1]).toMatchObject({ tool: 4, owned: true, fuel: 0.25, fill: null });
    expect(slots[2]).toMatchObject({ tool: 5, owned: false });
    expect(slots[5]).toMatchObject({ disabled: true, label: 'Zsák' });
  });
});

describe('ToolSession: cadence, stamina gate, switching (C.3/C.4)', () => {
  const personal = (p: Partial<PersonalState> = {}): PersonalState => ({ ...DEFAULT_PERSONAL, owned: ALL, toolTier: 2, ...p });
  it('one use per cadence and alt separately; seq grows across uses and resets', () => {
    const s = new ToolSession(personal(), 0);
    const first = s.tryUse(false, 0, 'IDLE');
    expect(first).toEqual({ ok: true, seq: 1, tool: 2 });
    expect(s.tryUse(false, 499, 'IDLE')).toEqual({ ok: false, reason: 'cadence' });
    expect(s.tryUse(true, 499, 'IDLE')).toMatchObject({ ok: true, seq: 2 }); // scoop has its own cadence
    expect(s.tryUse(false, 500, 'IDLE')).toMatchObject({ ok: true, seq: 3 });
    s.reset(personal(), 600);
    expect(s.tryUse(false, 600, 'IDLE')).toMatchObject({ ok: true, seq: 4 });
  });
  it('stamina: costs are spent locally, regeneration starts 1 s after the last use (IDLE 3/s, WALK 2/s)', () => {
    const s = new ToolSession(personal({ stamina: 500 }), 0);
    expect(s.stamina(0, 'IDLE')).toBe(50);
    s.tryUse(false, 0, 'IDLE');
    expect(s.stamina(500, 'IDLE')).toBeCloseTo(49, 6);
    expect(s.stamina(REGEN_DELAY_MS + 1000, 'IDLE')).toBeCloseTo(52, 6);
    expect(s.stamina(REGEN_DELAY_MS + 1000, 'WALK')).toBeCloseTo(51, 6);
    expect(s.stamina(REGEN_DELAY_MS + 1000, 'SPRINT')).toBeCloseTo(49, 6);
  });
  it('a use with too little stamina is not sent', () => {
    const s = new ToolSession(personal({ stamina: 5, toolTier: 3 }), 0);
    expect(s.tryUse(false, 0, 'SPRINT')).toEqual({ ok: false, reason: 'exhausted' });
  });
  it('uses wait for a pending tool switch; a refused switch reverts', () => {
    const s = new ToolSession(personal(), 0);
    s.beginSelect(6);
    expect(s.tool).toBe(6);
    expect(s.tryUse(false, 0, 'IDLE')).toEqual({ ok: false, reason: 'switching' });
    s.endSelect(false, 10);
    expect(s.tool).toBe(2);
    s.beginSelect(6);
    s.endSelect(true, 20);
    expect(s.tool).toBe(6);
    expect(s.tryUse(true, 30, 'IDLE')).toEqual({ ok: false, reason: 'noAction' }); // the rake has no RMB
  });
});

describe('Kofola sprint (59, C.5)', () => {
  it('sprint speed ×1.15 while the effect is on, as the server budget allows', () => {
    const run = (sprintMul?: number): number => {
      const body: BodyState = { x: 0, y: 0, z: 0, vy: 0, grounded: true };
      stepBody(body, { forward: 1, strafe: 0, sprint: true, jump: false, yaw: 0, sprintMul }, 1);
      return -body.z;
    };
    expect(run()).toBeCloseTo(SPRINT_SPEED, 6);
    expect(run(KOFOLA_SPRINT)).toBeCloseTo(SPRINT_SPEED * 1.15, 6);
    // walking is unchanged
    const body: BodyState = { x: 0, y: 0, z: 0, vy: 0, grounded: true };
    stepBody(body, { forward: 1, strafe: 0, sprint: false, jump: false, yaw: 0, sprintMul: KOFOLA_SPRINT }, 1);
    expect(-body.z).toBeCloseTo(4.5, 6);
  });
});

/** A camera at (x, 1.75, z) looking down −z. */
const cam = (x = 0, z = 0, yaw = 0): THREE.PerspectiveCamera => {
  const c = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 900);
  c.position.set(x, 1.75, z);
  c.rotation.set(0, yaw, 0);
  c.updateMatrixWorld();
  return c;
};

const fill = (store: ChunkStore, chunkX: number, chunkZ: number, n: number, firstId: number, extra: Partial<RowSpec> = {}): void => {
  const id = chunkIdAt(chunkX, chunkZ);
  if (id === null) throw new Error('outside');
  const baseX = Math.floor(chunkX / 8) * 8;
  const baseZ = Math.floor(chunkZ / 8) * 8;
  const items: RowSpec[] = [];
  for (let i = 0; i < n; i++) items.push({ id: firstId + i, kind: 'can', x: baseX + 0.25 + (i % 30) * 0.25, z: baseZ + 0.25 + Math.floor(i / 30) * 0.05, massKg: 0.05, ...extra });
  const update = parseChunkUpdate({ t: 0, load: [loadEntry(id, uniformCells(0), items)] });
  if (update) store.apply(update);
};

describe('instanced debris: culling and the instance cap (33, C.7)', () => {
  it('draws chunks in front within 60 m only; buried and predicted-hidden items are skipped', () => {
    const store = new ChunkStore();
    fill(store, 0.5, -20, 10, 1); // ahead
    fill(store, 0.5, 30, 10, 100); // behind the camera
    fill(store, 0.5, -100, 10, 200); // too far
    fill(store, 8.5, -20, 3, 300, { kind: 'copper', massKg: 2, flags: FLAG_BURIED });
    const r = new DebrisRenderer(store, () => 0);
    r.update(cam(), 0);
    expect(r.stats.rendered).toBe(10);
    store.hide([1, 2]);
    r.update(cam(), 0);
    expect(r.stats.rendered).toBe(8);
    expect(r.meshes.get('can')?.count).toBe(8);
    expect(r.meshes.get('copper')?.visible).toBe(false);
    // every debris mesh: no shadows, culled per chunk
    for (const m of r.meshes.values()) expect([m.castShadow, m.frustumCulled]).toEqual([false, false]);
    r.dispose();
  });
  it('caps the instances at 4 000, nearest chunks first', () => {
    const store = new ChunkStore();
    // chunk centres x = ±20, ±12, ±4 (z −12), loaded far-first so that only the sort puts the near ones first
    for (const i of [0, 5, 1, 4, 2, 3]) fill(store, 0.5 + i * 8 - 24, -12, 900, 10_000 * (i + 1));
    expect(store.itemCount).toBe(5400);
    const r = new DebrisRenderer(store, () => 0);
    r.update(cam(0, 0), 0);
    expect(r.stats.rendered).toBe(MAX_DEBRIS_INSTANCES);
    const cans = r.meshes.get('can');
    if (!cans) throw new Error('no can mesh');
    let near = 0;
    for (let i = 0; i < cans.count; i++) if (Math.abs(cans.instanceMatrix.array[i * 16 + 12] ?? 99) < 16) near += 1;
    expect(near).toBe(3600); // the four nearest chunks whole, 400 from a far one
    r.dispose();
  });
  it('uploads only the used instance range, and nothing for empty kinds', () => {
    const store = new ChunkStore();
    fill(store, 0.5, -20, 5, 1);
    const r = new DebrisRenderer(store, () => 0);
    const cans = r.meshes.get('can');
    const iron = r.meshes.get('iron');
    if (!cans || !iron) throw new Error('no mesh');
    const v = iron.instanceMatrix.version;
    r.update(cam(), 0);
    expect(cans.instanceMatrix.updateRanges).toEqual([{ start: 0, count: 5 * 16 }]);
    expect(iron.instanceMatrix.version).toBe(v);
    r.dispose();
  });
  it('a rolling can rewrites only its own instance; cells-only updates do not rebuild', () => {
    const store = new ChunkStore();
    fill(store, 0.5, -20, 5, 1);
    const r = new DebrisRenderer(store, () => 0);
    r.update(cam(), 0);
    const n = r.stats.rebuilds;
    const cellsOnly = parseChunkUpdate({ t: 1, cells: [chunkIdAt(0.5, -20), 0, 0x11] });
    if (!cellsOnly) throw new Error('bad update');
    store.apply(cellsOnly);
    r.update(cam(), 0);
    expect(r.stats.rebuilds).toBe(n);
    const cans = r.meshes.get('can');
    if (!cans) throw new Error('no can mesh');
    cans.instanceMatrix.clearUpdateRanges();
    r.kick({ id: 3, fromX: 0.75, fromZ: -23.75, toX: 2, toZ: -22 }, 0);
    r.update(cam(), 100);
    expect(r.stats.rebuilds).toBe(n);
    expect(cans.instanceMatrix.updateRanges).toEqual([{ start: 2 * 16, count: 16 }]);
    r.update(cam(), 5000); // the roll ended: back to idle
    expect(r.rolling).toBe(0);
    r.dispose();
  });
  it('rebuilds only after the mirror changed, the camera moved > 2 m or turned > 10°', () => {
    const store = new ChunkStore();
    fill(store, 0.5, -20, 5, 1);
    const r = new DebrisRenderer(store, () => 0);
    r.update(cam(0, 0), 0);
    const n = r.stats.rebuilds;
    r.update(cam(1.9, 0), 0);
    r.update(cam(0, 0, 0.17), 0);
    expect(r.stats.rebuilds).toBe(n);
    r.update(cam(2.1, 0), 0);
    expect(r.stats.rebuilds).toBe(n + 1);
    r.update(cam(2.1, 0, 0.18), 0);
    expect(r.stats.rebuilds).toBe(n + 2);
    store.hide([1]);
    r.update(cam(2.1, 0, 0.18), 0);
    expect(r.stats.rebuilds).toBe(n + 3);
    r.dispose();
  });
  it('a kicked can rolls and ends exactly at its rest point', () => {
    expect(kickDuration(0.3)).toBe(0.3);
    expect(kickDuration(3)).toBe(1);
    expect(kickDuration(30)).toBe(2.5);
    const anim = { fromX: 0, fromZ: 0, toX: 3, toZ: 4, start: 1000, duration: kickDuration(5) };
    const mid = kickPose(anim, 1000 + 500);
    expect(mid.done).toBe(false);
    expect(Math.hypot(mid.x, mid.z)).toBeLessThan(5);
    expect(kickPose(anim, 1000 + anim.duration * 1000)).toEqual({ x: 3, z: 4, y: 0, done: true });
  });
});

describe('tool rig, remote props and particles (36/58)', () => {
  it('the vacuum hose is a 12-segment tube along a quadratic Bézier; the rig casts no shadow', () => {
    const rig = new ToolRig();
    rig.setTool(5);
    rig.update({ dt: 0.016, time: 1, moving: true, sprint: false, animSpeed: 1 });
    const hose = rig.root.getObjectByName('tool-rig.hose');
    if (!(hose instanceof THREE.Mesh)) throw new Error('no hose');
    expect(hose.visible).toBe(true);
    const pos = hose.geometry.getAttribute('position');
    expect(pos.count).toBe((HOSE_SEGMENTS + 1) * 6);
    // ring 6 is centred on the Bézier at t = 0.5
    const c = rig.hoseCentre(6);
    let cx = 0;
    for (let k = 0; k < 6; k++) cx += pos.getX(6 * 6 + k) / 6;
    expect(cx).toBeCloseTo(c.x, 3);
    const visible: string[] = [];
    rig.root.traverse((o) => {
      if (o instanceof THREE.Mesh && o.visible) visible.push(o.name);
      expect(o.castShadow).toBe(false);
    });
    expect(visible.sort()).toEqual(['tool-rig.body', 'tool-rig.hose']);
    rig.dispose();
  });
  it('the broom swings left to right in its cadence and squashes the bristles mid-swing', () => {
    const rig = new ToolRig();
    rig.setTool(2);
    rig.use(false);
    rig.update({ dt: 0.125, time: 0, moving: false, sprint: false, animSpeed: 1 });
    const head = rig.root.getObjectByName('tool-rig.head');
    const early = head?.parent?.rotation.y ?? 0;
    rig.update({ dt: 0.125, time: 0, moving: false, sprint: false, animSpeed: 1 });
    expect(head?.scale.y).toBeCloseTo(0.7, 2); // contact at the middle of the swing
    rig.update({ dt: 0.2, time: 0, moving: false, sprint: false, animSpeed: 1 });
    expect(head?.parent?.rotation.y ?? 0).toBeLessThan(early);
    rig.update({ dt: 0.2, time: 0, moving: false, sprint: false, animSpeed: 1 });
    expect(rig.swinging).toBe(false);
    // under stench the same swing takes twice as long
    rig.use(false);
    rig.update({ dt: 0.4, time: 0, moving: false, sprint: false, animSpeed: 0.5 });
    expect(rig.swinging).toBe(true);
    rig.dispose();
    expect(bezier(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 2, 0), new THREE.Vector3(2, 0, 0), 0.5, new THREE.Vector3())).toEqual(new THREE.Vector3(1, 1, 0));
  });
  it('remote props: one instanced draw per family for every player, the hand shows none', () => {
    const props = new RemoteToolProps();
    props.update([
      { x: 0, y: 0, z: 0, rotY: 0, tool: 1, state: 'SWEEPING_ARCS' },
      { x: 2, y: 0, z: 0, rotY: 0, tool: 3, state: 'IDLE' },
      { x: 4, y: 0, z: 0, rotY: 0, tool: 5, state: 'OPERATING_VACUUM' },
      { x: 6, y: 0, z: 0, rotY: 0, tool: 7, state: 'WALK' }
    ], 0.3);
    expect(props.meshes.get('broom')?.count).toBe(2);
    expect(props.meshes.get('vacuum')?.count).toBe(1);
    expect(props.meshes.get('blower')?.visible).toBe(false);
    expect(props.meshes.size).toBe(4);
    props.dispose();
  });
  it('particles: one Points object, never more than 512, they die at the nozzle', () => {
    const p = new DebrisParticles();
    p.pull(Array.from({ length: 600 }, (_, i) => ({ x: i * 0.01, y: 0, z: -2 })), { x: 0, y: 1, z: -0.5 });
    expect(p.alive).toBe(MAX_PARTICLES);
    p.update(0.1);
    expect(p.points.visible).toBe(true);
    p.update(1);
    expect(p.alive).toBe(0);
    expect(p.points.visible).toBe(false);
    p.dispose();
  });
});

describe('shop offers (C.4, C.7)', () => {
  it('lists tools, next levels, gloves, repairs at 10 %, fuel and refreshments with what blocks them', () => {
    const p: PersonalState = { ...DEFAULT_PERSONAL, cash: 2000, owned: bits(1, 4), dur: [800, 1000, 1000], fuelMl: 2000, widthLvl: 5 };
    const offers = shopOffers(p);
    const by = (key: string) => offers.find((o) => o.key === key);
    expect(by('tool.1')).toMatchObject({ blocked: 'Megvan', buy: null });
    expect(by('tool.2')).toMatchObject({ price: 6000, blocked: 'Nincs elég pénzed', buy: { item: 'tool', tier: 2 } });
    expect(by('width')).toMatchObject({ buy: null, blocked: 'Legmagasabb szint' });
    expect(by('pack')).toMatchObject({ price: 2500, blocked: 'Nincs elég pénzed', buy: { item: 'pack', level: 1 } });
    expect(by('hard')).toMatchObject({ price: 5000, buy: { item: 'hard', level: 1 } });
    expect(by('repair.1')).toMatchObject({ price: repairCost(1), blocked: null, buy: { item: 'repair', tier: 1 }, repair: true });
    expect(repairCost(1)).toBe(150);
    expect(by('repair.2')).toBeUndefined(); // not owned
    expect(by('fuel')).toMatchObject({ blocked: 'Tele', buy: null });
    expect(by('beer')).toMatchObject({ section: 'kiosk', price: 450, blocked: null, buy: { item: 'beer' } });
    expect(by('zsiros')).toMatchObject({ price: 900, blocked: null });
  });
});
