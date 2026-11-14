// Phase D (D.1–D.8) client logic: tables, guards, path geometry, links, extrapolation, the b/c/del map rules,
// arcs, the throw march, the D.3 copy, ghost snapping, E priority, keymap, slot 6, the tie, instance caps and
// the combined collision index. The fixture checks live in logisticsFixture.test.ts.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { BAG_TIERS, CRANE, STRUCT_TYPES, deckY, rotYOf, toWorld } from '../../../../../src/features/games/sweepers/lib/logistics/tables';
import { computeLinks, extrapolateNode, inPorts, intakeZones, outPorts, pathPoint, type CargoEntry } from '../../../../../src/features/games/sweepers/lib/logistics/network';
import { LogisticsStore } from '../../../../../src/features/games/sweepers/lib/logistics/LogisticsStore';
import { LogisticsRenderer, MAX_BAG_INSTANCES, MAX_STRUCT_INSTANCES, arcPoint, LOGISTICS_DRAW_CALLS } from '../../../../../src/features/games/sweepers/lib/logistics/LogisticsRenderer';
import { checkPlacement, freeOutPorts, ghostAt, refusalText, structureColliders, type PlacementWorld } from '../../../../../src/features/games/sweepers/lib/logistics/placement';
import { simulateThrow, chargePower, type ThrowWorld } from '../../../../../src/features/games/sweepers/lib/logistics/throwArc';
import { TieAnimation, chooseInteraction, TIE_MS } from '../../../../../src/features/games/sweepers/lib/logistics/interact';
import { nearestJam, nearestPickableBag, craneBags } from '../../../../../src/features/games/sweepers/lib/logistics/queries';
import { bagSlotEnabled, nextBagTier, shownBagTier } from '../../../../../src/features/games/sweepers/lib/tools/hotbar';
import { actionForKey } from '../../../../../src/features/games/sweepers/lib/input/keymap';
import { InputManager } from '../../../../../src/features/games/sweepers/lib/input/InputManager';
import { WorldCollision } from '../../../../../src/features/games/sweepers/lib/movement/WorldCollision';
import { hotbarSlots } from '../../../../../src/features/games/sweepers/components/ToolHud';
import { shopOffers } from '../../../../../src/features/games/sweepers/components/ShopPanel';
import { telemetryLines } from '../../../../../src/features/games/sweepers/components/LogisticsPanel';
import { SWEEPERS_ERRORS } from '../../../../../src/features/games/sweepers/errors';
import { DEFAULT_PERSONAL, parseActionAck } from '../../../../../src/features/games/sweepers/debrisTypes';
import {
  decodeBagRow,
  decodeCargoRow,
  decodeStructRow,
  parseCraneAck,
  parseLogisticsInit,
  parseLogisticsUpdate,
  parsePlaceAck,
  parseStructureSpawned,
  parseTelemetry,
  parseThrowAck,
  parseTieAck,
  type BagRow,
  type LogisticsUpdate,
  type StructRow
} from '../../../../../src/features/games/sweepers/logisticsTypes';
import { realInit } from './fixtures';

const row = (id: number, type: number, x: number, z: number, rot = 0, lvl = 0, baseY = 0): StructRow => ({ id, type, x, z, baseY, rot, lvl, jammed: false, busy: false, smoking: false, grease: 0 });
const bag = (id: number, x: number, z: number, y = 0, tier = 0, st: 0 | 1 | 2 = 0): BagRow => ({ id, tier, tint: 0, st, x, y, z, rot: 0, kg: 5 });
const update = (u: Partial<LogisticsUpdate> & { t: number }): LogisticsUpdate => ({ s: [], sdel: [], b: [], c: [], del: [], arcs: [], burst: [], crane: undefined, hop: [], pk: [], ...u });
const near = (a: { x: number; z: number }, b: { x: number; z: number }): void => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.z).toBeCloseTo(b.z, 9);
};

describe('D.1 tables', () => {
  it('rot → rotY in (−π, π]; rot 1 faces +x (clockwise from above); odd rot swaps w and d', () => {
    expect([0, 1, 2, 3].map(rotYOf)).toEqual([0, -Math.PI / 2, Math.PI, Math.PI / 2]);
    expect(toWorld(0, -1, 0)).toEqual({ x: 0, z: -1 });
    expect(toWorld(0, -1, 1)).toEqual({ x: 1, z: 0 });
    expect(toWorld(0, -1, 2)).toEqual({ x: 0, z: 1 });
    expect(toWorld(0, -1, 3)).toEqual({ x: -1, z: 0 });
    // local x → world (cos θ, −sin θ)
    expect(toWorld(1, 0, 1)).toEqual({ x: 0, z: 1 });
  });
  it('18 structure types (D 14 + E machines), 5 bag tiers, the path lengths and level ranges', () => {
    expect(STRUCT_TYPES.map((t) => t.key)).toEqual(['found2', 'found4', 'belt1', 'belt2', 'belt5', 'bendL', 'bendR', 'rampUp', 'rampDown', 'splitter', 'merger', 'hopper', 'packager', 'fence', 'stripper', 'baler', 'magnet', 'trommel']);
    expect(STRUCT_TYPES.map((t) => t.len)).toEqual([null, null, 1, 2, 5, Math.PI / 4, Math.PI / 4, Math.sqrt(4.81), Math.sqrt(4.81), 1, 1, null, 2, null, 2, 2, 2, 4]);
    expect(STRUCT_TYPES[7]).toMatchObject({ lvlMin: 0, lvlMax: 1 });
    expect(STRUCT_TYPES[8]).toMatchObject({ lvlMin: 1, lvlMax: 2 });
    expect(BAG_TIERS.map((b) => [b.l, b.kg, b.cost, b.cap])).toEqual([[30, 20, 50, 99], [60, 50, 150, 99], [1000, 1000, 2500, 9], [50, 50, 0, 0], [8, 20, 0, 0]]);
    expect(deckY(1, 2)).toBeCloseTo(1 + 0.35 + 1.8);
  });
});

describe('D.5 guards', () => {
  it('StructRow: flags, lvl valid for its type, id ≥ 1', () => {
    expect(decodeStructRow([5, 4, 150, -250, 20, 1, 2, 3])).toEqual({ id: 5, type: 4, x: 1.5, z: -2.5, baseY: 0.2, rot: 1, lvl: 2, jammed: true, busy: true, smoking: false, grease: 0 });
    expect(decodeStructRow([5, 7, 0, 0, 0, 0, 2, 0])).toBeNull(); // rampUp input lvl ≤ 1
    expect(decodeStructRow([5, 13, 0, 0, 0, 0, 1, 0])).toBeNull(); // a fence is lvl 0
    expect(decodeStructRow([0, 2, 0, 0, 0, 0, 0, 0])).toBeNull();
    expect(decodeStructRow([5, 18, 0, 0, 0, 0, 0, 0])).toBeNull();
    // E.3: bit 2 smoking, bits 3–6 the grease mask
    expect(decodeStructRow([5, 14, 0, 0, 0, 0, 0, 4 | (0b1010 << 3)])).toMatchObject({ type: 14, smoking: true, grease: 0b1010, jammed: false, busy: false });
    expect(decodeStructRow([5, 2, 0, 0, 0, 4, 0, 0])).toBeNull();
  });
  it('BagRow and CargoRow (cm, rot8, kgDg, sMm)', () => {
    expect(decodeBagRow([9, 1, 2, 0, 100, 35, -50, 64, 1234])).toEqual({ id: 9, tier: 1, tint: 2, st: 0, x: 1, y: 0.35, z: -0.5, rot: Math.PI / 2, kg: 12.34 });
    expect(decodeBagRow([9, 5, 0, 0, 0, 0, 0, 0, 0])).toBeNull();
    expect(decodeBagRow([9, 4, 3, 0, 0, 0, 0, 0, 2000])).toMatchObject({ tier: 4, tint: 3, kg: 20 });
    expect(decodeCargoRow([7, 1, 3, 2, 0, 0, 0, 0, 5000])).toMatchObject({ kind: 1, sub: 3 });
    expect(decodeCargoRow([7, 0, 3, 2, 0, 0, 0, 0, 5000])).toBeNull(); // lot groups stay 0..2
    expect(decodeBagRow([9, 0, 0, 3, 0, 0, 0, 0, 0])).toBeNull();
    expect(decodeCargoRow([7, 0, 2, 3, 0, 1500, 1, 1, 2000])).toEqual({ id: 7, kind: 0, sub: 2, tint: 3, node: 0, s: 1.5, route: 1, mv: true, kg: 20 });
    expect(decodeCargoRow([7, 2, 0, 0, 0, 0, 0, 0, 0])).toBeNull();
    expect(decodeCargoRow([7, 0, 0, 0, 0, -1, 0, 0, 0])).toBeNull();
  });
  it('init (v 1 only), spawned, update (every key optional), telemetry and acks', () => {
    expect(parseLogisticsInit({ v: 2 })).toBeNull();
    const init = parseLogisticsInit({ v: 1, beltMps: 1.4, structures: [[1, 2, 0, 0, 0, 0, 0, 0], 'x'], bags: [], cargo: [], hoppers: [[0, 1500]], packagers: [], crane: { hook: [-850, 0], job: null } });
    expect(init).toMatchObject({ structures: [{ id: 1 }], hoppers: [{ node: 0, kg: 15 }], hook: { x: -8.5, z: 0 }, job: null });
    expect(parseStructureSpawned({ row: [3, 13, 0, 0, 0, 0, 0, 0], by: 2 })).toMatchObject({ row: { id: 3, type: 13 }, by: 2 });
    expect(parseStructureSpawned({ row: [3, 13] })).toBeNull();
    expect(parseLogisticsUpdate({ t: 5 })).toEqual(update({ t: 5 }));
    const u = parseLogisticsUpdate({ t: 5, crane: null, arcs: [[4, 0, 140, 0, 300, 0, 0, 200, 600]], burst: [[4, 10, 20]], hop: [[0, 100]], sdel: [3, 'x'] });
    expect(u?.crane).toBeNull();
    expect(u?.arcs[0]).toEqual({ id: 4, fx: 0, fy: 1.4, fz: 0, tx: 3, ty: 0, tz: 0, apexY: 2, durMs: 600 });
    expect(u?.burst).toEqual([{ id: 4, x: 0.1, z: 0.2 }]);
    expect(u?.sdel).toEqual([3]);
    expect(parseTelemetry({ kgMin: 1, loadPct: 120, kW: 0.1, ftHour: 5, beltM: 9, jams: 0 })?.loadPct).toBe(100);
    expect(parseTieAck({ ok: true, id: 3, tier: 0, kg: 4.25 })).toEqual({ ok: true, id: 3, tier: 0, kg: 4.25 });
    expect(parseTieAck({ ok: false, error: SWEEPERS_ERRORS.noBags, code: 'SWEEPERS_REFUSED' })).toEqual({ ok: false, error: SWEEPERS_ERRORS.noBags, code: 'SWEEPERS_REFUSED' });
    expect(parsePlaceAck({ ok: true })).toMatchObject({ ok: false, code: null });
    expect(parseThrowAck({ ok: true, id: 4, to: [100, 0, -200], into: 'belt', burst: false })).toEqual({ ok: true, id: 4, to: { x: 1, y: 0, z: -2 }, into: 'belt', burst: false });
    expect(parseCraneAck({ ok: true, durMs: 9000 })).toEqual({ ok: true, durMs: 9000 });
    expect(parseActionAck({ ok: true, hopperKg: 12.5 })).toEqual({ ok: true, hopperKg: 12.5 });
  });
});

describe('path geometry and links (D.1/D.2)', () => {
  it('every path starts at its in port and ends at its out port, for every rotation and level', () => {
    for (let type = 2; type <= 12; type++) {
      const len = STRUCT_TYPES[type]?.len;
      if (!len) continue;
      for (let rot = 0; rot < 4; rot++) {
        const r = row(1, type, 3.5, -2, rot, type === 8 ? 1 : 0, 0.4);
        const ins = inPorts(r);
        const outs = outPorts(r);
        ins.forEach((p, input) => {
          const a = pathPoint(r, 0, 0, input);
          near(a, p);
          expect(a.y).toBeCloseTo(p.y, 9);
        });
        outs.forEach((p, route) => {
          const b = pathPoint(r, len, route, 0);
          near(b, p);
          expect(b.y).toBeCloseTo(p.y, 9);
        });
      }
    }
  });
  it('a bend is a quarter circle of r 0.5; a ramp rises 0.9 m; headings turn with rot', () => {
    const bend = row(1, 5, 0, 0);
    const mid = pathPoint(bend, Math.PI / 8);
    expect(Math.hypot(mid.x + 0.5, mid.z - 0.5)).toBeCloseTo(0.5, 9);
    const ramp = row(2, 7, 0, 0, 0, 0, 0);
    expect(pathPoint(ramp, Math.sqrt(4.81)).y - pathPoint(ramp, 0).y).toBeCloseTo(0.9, 9);
    expect(outPorts(row(3, 4, 0, 0, 1))[0]).toMatchObject({ x: 2.5, z: 0, hx: 1, hz: 0 });
  });
  it('out → in links need the same point, deck (≤ 0.05) and heading; else a hopper intake, else open', () => {
    const a = row(1, 3, 0, 30); // out (0, 29)
    const b = row(2, 2, 0, 28.5); // in (0, 29)
    const rows = new Map([[1, a], [2, b]]);
    expect(computeLinks(rows, []).get('1:0')).toEqual({ kind: 'node', node: 2, input: 0 });
    expect(computeLinks(rows, []).get('2:0')).toBeNull();
    expect(computeLinks(new Map([[1, a], [2, { ...b, lvl: 1 }]]), []).get('1:0')).toBeNull();
    expect(computeLinks(new Map([[1, a], [2, { ...b, rot: 2, z: 29.5 }]]), []).get('1:0')).toBeNull(); // in port there, opposite heading
    const ramp = row(3, 7, 0, 0); // out (0, −1) at lvl 1
    const up = row(4, 2, 0, -1.5, 0, 1);
    expect(computeLinks(new Map([[3, ramp], [4, up]]), []).get('3:0')).toEqual({ kind: 'node', node: 4, input: 0 });
    const hopper = row(5, 11, 0, 27.5); // a buildable hopper's intake is its footprint (z 25.5..29.5)
    const zones = intakeZones([a, hopper], null);
    expect(computeLinks(new Map([[1, a], [5, hopper]]), zones).get('1:0')).toEqual({ kind: 'hopper', node: 5 });
    // the landmark intake is its footprint + 1.5 m
    const lm = intakeZones([], { x: 14, z: 12, rotY: 0, w: 4, d: 4 })[0];
    expect(lm).toEqual({ node: 0, x0: 10.5, x1: 17.5, z0: 8.5, z1: 15.5 });
  });
  it('a merger knows which input a lot came by (from the node it left)', () => {
    const store = new LogisticsStore();
    const merger = row(1, 10, 0, 0); // ins: left (−0.5, 0) +x, right (+0.5, 0) −x
    const right = row(2, 2, 1, 0, 3); // rot 3 faces −x: out (0.5, 0)
    store.applyInit({ beltMps: 1.4, structures: [merger, right], bags: [], cargo: [{ id: 9, kind: 0, sub: 0, tint: 0, node: 2, s: 0.9, route: 0, mv: true, kg: 5 }], hoppers: [], packagers: [], hook: { x: 0, z: 0 }, job: null }, null, 0);
    store.applyUpdate(update({ t: 100, c: [{ id: 9, kind: 0, sub: 0, tint: 0, node: 1, s: 0, route: 0, mv: true, kg: 5 }] }));
    expect(store.cargo.get(9)?.input).toBe(1);
    near(pathPoint(merger, 0, 0, 1), { x: 0.5, z: 0 });
  });
});

describe('client motion between rows (D.5)', () => {
  const entry = (id: number, s: number, mv = true, t = 0): CargoEntry => ({ id, kind: 0, sub: 0, tint: 0, node: 1, s, route: 0, mv, kg: 5, t, input: 0 });
  it('1.4 m/s from the row time, capped by len and 0.6 m behind the cargo ahead; mv 0 stays', () => {
    const s = extrapolateNode([entry(1, 1), entry(2, 0.2), entry(3, 3, false)], 5, 1000);
    expect(s.get(3)).toBe(3);
    expect(s.get(1)).toBeCloseTo(2.4, 9); // 1 + 1.4 (behind 3 − 0.6 = 2.4)
    expect(s.get(2)).toBeCloseTo(1.6, 9); // 0.2 + 1.4 = 1.6 ≤ 2.4 − 0.6
    expect(extrapolateNode([entry(1, 4.5)], 5, 2000).get(1)).toBe(5);
    expect(extrapolateNode([entry(1, 1, true, 500)], 5, 400).get(1)).toBe(1); // a row from the future does not move back
  });
});

describe('the b / c / del map rules (D.5)', () => {
  it('b moves an id into the bag map, c into the cargo map, del removes it from both', () => {
    const store = new LogisticsStore();
    store.applyInit(null, null, 0);
    const cargo = { id: 4, kind: 1 as const, sub: 0, tint: 0, node: 1, s: 0.3, route: 0, mv: true, kg: 5 };
    store.applyUpdate(update({ t: 1, b: [bag(4, 0, 0)] }));
    expect([store.bags.has(4), store.cargo.has(4)]).toEqual([true, false]);
    store.applyUpdate(update({ t: 2, c: [cargo] }));
    expect([store.bags.has(4), store.cargo.has(4)]).toEqual([false, true]);
    expect(store.cargo.get(4)?.t).toBe(2);
    store.applyUpdate(update({ t: 3, b: [bag(4, 1, 1)] }));
    expect([store.bags.has(4), store.cargo.has(4)]).toEqual([true, false]);
    store.applyUpdate(update({ t: 4, del: [4] }));
    expect([store.bags.has(4), store.cargo.has(4)]).toEqual([false, false]);
  });
  it('structure rows relink; jams and packager cycles are reported once; crane idle parks the hook at the target', () => {
    const store = new LogisticsStore();
    store.applyInit(null, null, 0);
    store.applySpawned(row(1, 9, 0, 0));
    const v = store.version;
    const e1 = store.applyUpdate(update({ t: 1, s: [{ ...row(1, 9, 0, 0), jammed: true }] }));
    expect(e1.jammed.map((r) => r.id)).toEqual([1]);
    expect(store.version).toBe(v); // a flag change does not relink
    expect(store.applyUpdate(update({ t: 2, s: [{ ...row(1, 9, 0, 0), jammed: true }] })).jammed).toEqual([]);
    store.applyUpdate(update({ t: 3, sdel: [1] }));
    expect(store.structures.size).toBe(0);
    const job = { bag: 2, fx: -11, fz: -3.5, tx: -8.5, tz: 0, t0: 0, durMs: 9000 };
    store.applyUpdate(update({ t: 4, crane: job }));
    expect(store.hookAt(0, 1.5)).toMatchObject({ x: -8.5, z: 0, carrying: false });
    expect(store.hookAt(9000, 1.5)).toMatchObject({ x: -8.5, z: 0, lift: 0 });
    store.applyUpdate(update({ t: 5, crane: null }));
    expect(store.hook).toEqual({ x: -8.5, z: 0 });
  });
  it('a server arc ends exactly at the row and peaks at its apex; a drop is a free fall', () => {
    const arc = { id: 1, fx: 0, fy: 1.4, fz: 0, tx: 6, ty: 0.2, tz: -2, apexY: 3, durMs: 1000, t0: 500 };
    expect(arcPoint(arc, 500)).toEqual({ x: 0, y: 1.4, z: 0 });
    const end = arcPoint(arc, 1500);
    expect([end.x, end.y, end.z].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([6, 0.2, -2]);
    let top = 0;
    for (let t = 500; t <= 1500; t += 5) top = Math.max(top, arcPoint(arc, t).y);
    expect(top).toBeCloseTo(3, 3);
    const drop = { ...arc, fx: 1, tx: 1, fz: 0, tz: 0, fy: 2, ty: 0, apexY: 2 };
    expect(arcPoint(drop, 1000).y).toBeCloseTo(2 - 2 * 0.25, 9);
  });
});

describe('the throw march (D.2)', () => {
  const flat: ThrowWorld = { ground: () => 0, support: () => 0, blocked: () => false, hopperAt: () => null };
  it('is deterministic, clamps the power to 12 m/s and lands on the support', () => {
    const a = simulateThrow(flat, { x: 0, z: 0 }, 0, 8, 0.5);
    expect(simulateThrow(flat, { x: 0, z: 0 }, 0, 8, 0.5)).toEqual(a);
    expect(simulateThrow(flat, { x: 0, z: 0 }, 0, 50, 0.5)).toEqual(simulateThrow(flat, { x: 0, z: 0 }, 0, 12, 0.5));
    expect(a.points[0]).toEqual({ x: 0, y: 1.4, z: -0.4 });
    expect(a.rest.y).toBe(0);
    expect(a.rest.z).toBeLessThan(-3); // thrown forward (−z at rotY 0)
    expect(a.apexY).toBeGreaterThan(1.4);
  });
  it('a power < 1 drops from pose + dir·0.5 at support + 1; a blocker stops it and it falls from the last point', () => {
    const d = simulateThrow(flat, { x: 0, z: 0 }, Math.PI / 2, 0.5, 0); // faces −x
    expect(d.rest.x).toBeCloseTo(-0.5, 9);
    expect(d.points[0]?.y).toBe(1);
    const wall: ThrowWorld = { ...flat, blocked: (x, _y, z) => z < -2 && x > -1 };
    const w = simulateThrow(wall, { x: 0, z: 0 }, 0, 10, 0.3);
    expect(w.rest.z).toBeGreaterThanOrEqual(-2);
    expect(w.rest.y).toBe(0);
    const hopper: ThrowWorld = { ...flat, hopperAt: (_x, _y, z) => (z < -3 ? 0 : null) };
    expect(simulateThrow(hopper, { x: 0, z: 0 }, 0, 10, 0.3)).toMatchObject({ into: 'hopper', hopper: 0 });
  });
  it('the LMB charge: 0 → 12 m/s over 1.2 s; a tap under 0.2 s drops', () => {
    expect(chargePower(150)).toBe(0);
    expect(chargePower(600)).toBe(6);
    expect(chargePower(5000)).toBe(12);
  });
});

describe('the client D.3 copy (real layout)', () => {
  const init = realInit();
  const col = new WorldCollision(init.layout);
  col.setUnlocked(init.unlockedDistricts);
  const world = (over: Partial<PlacementWorld> = {}): PlacementWorld => ({
    layout: init.layout,
    ground: (x, z) => col.terrain(x, z),
    isLocked: (x, z) => col.isLocked(x, z),
    structures: [],
    groundBags: [],
    players: [],
    pose: { x: 0, z: 30 },
    ...over
  });
  const belt = { type: 4, x: 0, z: 30, rot: 0, lvl: 0 };
  it('accepts a free belt; refuses in rule order', () => {
    expect(checkPlacement(world(), belt)).toEqual({ ok: true, baseY: 0 });
    expect(checkPlacement(world(), { ...belt, x: 0.25 })).toEqual({ ok: false, reason: 'invalid' });
    expect(checkPlacement(world(), { ...belt, type: 7, lvl: 2 })).toEqual({ ok: false, reason: 'invalid' });
    expect(checkPlacement(world({ pose: { x: 0, z: 41 } }), belt)).toEqual({ ok: false, reason: 'tooFar' });
    expect(checkPlacement(world({ pose: { x: 239, z: 0 }, isLocked: () => true }), { ...belt, x: 242, z: 0, rot: 1 })).toEqual({ ok: false, reason: 'outOfGrid' });
    expect(checkPlacement(world({ isLocked: () => true }), belt)).toEqual({ ok: false, reason: 'lockedDistrict' });
    expect(checkPlacement(world({ pose: { x: -8.5, z: 0 } }), { ...belt, x: -8.5, z: 0 })).toEqual({ ok: false, reason: 'reserved' });
    expect(checkPlacement(world({ pose: { x: 15, z: 3 } }), { ...belt, x: 15, z: 3, type: 2 })).toEqual({ ok: false, reason: 'reserved' }); // weighbridge pad + 1 m reaches z 2.75 (fixture tables.reserved)
    expect(checkPlacement(world({ pose: { x: -4, z: -7 } }), { ...belt, x: -4, z: -7, type: 2 })).toEqual({ ok: false, reason: 'reserved' }); // console within 1 m
    expect(checkPlacement(world({ pose: { x: 0, z: 20 } }), { ...belt, z: 20 })).toEqual({ ok: false, reason: 'blocked' }); // the depot fence
  });
  it('samples 0.01 m inside the footprint like the server: a belt touching a foundation edge sits on the ground', () => {
    const slab = row(1, 0, 1.5, 30, 0, 0, 0.2); // found2 x 0.5..2.5, touching the belt's x = 0.5 edge
    expect(checkPlacement(world({ structures: [slab] }), { ...belt, type: 2 })).toEqual({ ok: true, baseY: 0 });
  });
  it('limits name what is full', () => {
    const fences = Array.from({ length: 64 }, (_, i) => row(i + 1, 13, -100 + i * 3, 100));
    const check = checkPlacement(world({ structures: fences }), { ...belt, type: 13 });
    expect(check).toEqual({ ok: false, reason: 'buildLimit', what: 'kerítés' });
    expect(refusalText(check, SWEEPERS_ERRORS)).toBe('Elérted az építési korlátot: kerítés.');
    const belts = Array.from({ length: 60 }, (_, i) => row(i + 1, 4, -100 + i * 2, 100));
    expect(checkPlacement(world({ structures: belts }), { ...belt, type: 2 })).toMatchObject({ reason: 'buildLimit', what: 'szalaghossz' });
  });
  it('collisions: structures (non-foundations may overlap foundations only), bags, players for blocking types', () => {
    expect(checkPlacement(world({ structures: [row(1, 2, 0, 31)] }), belt)).toEqual({ ok: false, reason: 'blocked' });
    expect(checkPlacement(world({ structures: [row(1, 2, 1, 30)] }), belt)).toEqual({ ok: true, baseY: 0 }); // edge to edge
    expect(checkPlacement(world({ groundBags: [bag(1, 0, 31)] }), belt)).toEqual({ ok: false, reason: 'blocked' });
    expect(checkPlacement(world({ players: [{ x: 0, z: 30 }] }), belt)).toEqual({ ok: true, baseY: 0 }); // a lvl 0 deck is step-over
    expect(checkPlacement(world({ players: [{ x: 0, z: 30 }] }), { ...belt, type: 13 })).toEqual({ ok: false, reason: 'blocked' });
    expect(checkPlacement(world({ players: [{ x: 0, z: 30 }] }), { ...belt, lvl: 1 })).toEqual({ ok: false, reason: 'blocked' });
  });
  it('foundations: top = ceil10(max ground + 0.2), snapping to an edge-adjacent slab; others sit on one top or fail notFlat', () => {
    expect(checkPlacement(world(), { type: 1, x: 0, z: 30, rot: 0, lvl: 0 })).toEqual({ ok: true, baseY: 0.2 });
    const slab = { ...row(1, 1, 4, 30), baseY: 0.6 };
    expect(checkPlacement(world({ structures: [slab] }), { type: 1, x: 0, z: 30, rot: 0, lvl: 0 })).toEqual({ ok: true, baseY: 0.6 });
    expect(checkPlacement(world({ structures: [{ ...slab, baseY: 0.8 }] }), { type: 1, x: 0, z: 30, rot: 0, lvl: 0 })).toEqual({ ok: true, baseY: 0.2 });
    const under = { ...row(1, 1, 0, 30), baseY: 0.6 };
    expect(checkPlacement(world({ structures: [under] }), { ...belt, type: 3 })).toEqual({ ok: true, baseY: 0.6 });
    expect(checkPlacement(world({ structures: [under] }), belt)).toEqual({ ok: false, reason: 'notFlat' }); // 5 m on a 4 m slab
    expect(checkPlacement(world({ structures: [under] }), { type: 1, x: 0, z: 30, rot: 0, lvl: 0 })).toEqual({ ok: false, reason: 'blocked' }); // a foundation overlaps nothing
  });
});

describe('build-mode ghost snapping (D.7)', () => {
  it('snaps onto a free out port: the in port meets it, the heading sets rot, the deck sets lvl', () => {
    const ramp = row(1, 7, 0, 30, 1); // faces +x, ends at lvl 1
    const store = new LogisticsStore();
    store.applyInit({ beltMps: 1.4, structures: [ramp], bags: [], cargo: [], hoppers: [], packagers: [], hook: { x: 0, z: 0 }, job: null }, null, 0);
    const free = freeOutPorts(store.structures.values(), store.links);
    expect(free).toHaveLength(1);
    const g = ghostAt(3, 0, 0, { x: free[0]?.x ?? 0, z: (free[0]?.z ?? 0) + 0.3 }, free);
    expect(g).toMatchObject({ snapped: true, rot: 1, lvl: 1 });
    near(inPorts({ ...row(2, g.type, g.x, g.z, g.rot, g.lvl), baseY: 0 })[0] ?? { x: NaN, z: NaN }, free[0] ?? { x: NaN, z: NaN });
    // away from the port it snaps to the 0.5 m lattice with the chosen rot / lvl
    expect(ghostAt(3, 2, 5, { x: 10.3, z: 3.8 }, free)).toEqual({ type: 3, rot: 2, lvl: 2, x: 10.5, z: 4, snapped: false });
    // a foundation has no input: never port-snapped
    expect(ghostAt(0, 0, 0, { x: free[0]?.x ?? 0, z: free[0]?.z ?? 0 }, free).snapped).toBe(false);
  });
});

describe('E priority, keymap, slot 6 and the tie (D.7)', () => {
  const none = { jam: null, broom: false, bag: null, craneD: Infinity, officeD: Infinity, kiosk: false };
  it('jam with a broom → bag → crane → office → kiosk', () => {
    expect(chooseInteraction({ ...none, jam: { id: 3, d: 1.5 }, broom: true, bag: { id: 9, d: 0.5 }, craneD: 1, officeD: 1, kiosk: true })).toEqual({ kind: 'clearJam', id: 3 });
    expect(chooseInteraction({ ...none, jam: { id: 3, d: 1.5 }, broom: false, bag: { id: 9, d: 0.5 }, craneD: 1 })).toEqual({ kind: 'pickup', id: 9 });
    expect(chooseInteraction({ ...none, jam: { id: 3, d: 2.5 }, broom: true, craneD: 2.4, officeD: 1 })).toEqual({ kind: 'crane' });
    expect(chooseInteraction({ ...none, bag: { id: 9, d: 2.1 }, officeD: 7.9, kiosk: true })).toEqual({ kind: 'office' });
    expect(chooseInteraction({ ...none, kiosk: true })).toEqual({ kind: 'kiosk' });
    expect(chooseInteraction(none)).toBeNull();
  });
  it('keys: Q tie, B build, R rotate, PgUp/PgDn level, Esc leaves; the wheel cycles the palette', () => {
    expect(['KeyQ', 'KeyB', 'KeyR', 'PageUp', 'PageDown', 'Escape', 'KeyE'].map(actionForKey)).toEqual(['tieBag', 'toggleBuild', 'rotateBuild', 'buildLevelUp', 'buildLevelDown', 'exitBuild', 'interact']);
    const input = new InputManager(() => 0);
    const seen: string[] = [];
    input.onAction((a, e) => seen.push(`${a}:${e}`));
    input.wheel(120);
    input.wheel(-3);
    input.wheel(0);
    expect(seen).toEqual(['paletteNext:down', 'paletteNext:up', 'palettePrev:down', 'palettePrev:up']);
  });
  it('clear() (Esc, blur) releases a charging LMB without a held time, so it never throws', () => {
    let now = 0;
    const input = new InputManager(() => now);
    const ups: (number | undefined)[] = [];
    input.onAction((a, e, held) => {
      if (a === 'primaryUse' && e === 'up') ups.push(held);
    });
    input.mouseDown(0);
    now = 900;
    input.clear();
    input.mouseDown(0);
    now = 1500;
    input.mouseUp(0);
    expect(ups).toEqual([undefined, 600]);
  });
  it('slot 6: enabled with stock, 6 cycles the tiers in stock, the slot shows the tier and its count', () => {
    expect(bagSlotEnabled([0, 0, 0])).toBe(false);
    expect(nextBagTier([0, 0, 0], null)).toBeNull();
    expect(nextBagTier([4, 0, 1], null)).toBe(0);
    expect(nextBagTier([4, 0, 1], 0)).toBe(2);
    expect(nextBagTier([4, 0, 1], 2)).toBe(0);
    expect(shownBagTier([0, 2, 0], 0)).toBe(1);
    const personal = { ...DEFAULT_PERSONAL, bags: [10, 2, 1] as const };
    const hud = { personal, tool: 0, stamina: 100, fx: { stench: false, beer: false, kofola: false }, shop: { workbench: false, kiosk: false }, debris: true, carrying: false, bagTier: 1, tie: 0.5 };
    expect(hotbarSlots(hud)[5]).toMatchObject({ label: 'Zsák: Fekete', count: 2, disabled: false, tie: 0.5, active: false });
    expect(hotbarSlots({ ...hud, personal: DEFAULT_PERSONAL, bagTier: null, tie: 0 })[5]).toMatchObject({ label: 'Zsák', disabled: true, count: null });
    expect(hotbarSlots({ ...hud, carrying: true }).map((s) => s.active)).toEqual([false, false, false, false, false, true]);
  });
  it('the tie sends after 1.2 s unless the player moves > 0.5 m or it is cancelled', () => {
    const tie = new TieAnimation();
    tie.start(0, 0, 1, 0);
    expect(tie.update(0.3, 0, TIE_MS - 1)).toBeNull();
    expect(tie.update(0.3, 0, TIE_MS)).toBe(1);
    expect(tie.active).toBe(false);
    tie.start(0, 0, 0, 0);
    expect(tie.update(0, 0.51, 100)).toBe('cancelled');
    tie.start(0, 0, 0, 0);
    expect(tie.cancel()).toBe(true);
    expect(tie.update(0, 0, TIE_MS)).toBeNull();
  });
});

describe('queries over the mirror', () => {
  it('pickup needs tier ≤ 1, top of the stack, 2 m; jams by footprint distance; crane bags in the area', () => {
    const store = new LogisticsStore();
    store.applyInit({ beltMps: 1.4, structures: [{ ...row(1, 9, 3, 0), jammed: true }], bags: [bag(1, 1, 0), bag(2, 1, 0, 0.6), bag(3, 0, 1.5, 0, 2), bag(4, -8, 0, 0, 2)], cargo: [], hoppers: [], packagers: [], hook: { x: 0, z: 0 }, job: null }, null, 0);
    expect(nearestPickableBag(store, new Map(), () => null, 0, 0, 0)).toEqual({ id: 2, d: 1 }); // 1 is under 2; 3 is a Big-Bag
    expect(nearestJam(store, 0, 0)).toEqual({ id: 1, d: 2.5 });
    expect(craneBags(store).map((b) => b.id)).toEqual([4]);
    expect(CRANE.targets).toHaveLength(5);
  });
});

describe('rendering caps and the combined collision index', () => {
  it('a crane-held bag stays at its source until the hook takes it, then rides the hook', () => {
    const store = new LogisticsStore();
    const job = { bag: 1, fx: -6, fz: 1, tx: -11, tz: -3.5, t0: 0, durMs: 20000 };
    store.applyInit({ beltMps: 1.4, structures: [], bags: [bag(1, -11, -3.5, 0, 0, 2)], cargo: [], hoppers: [], packagers: [], hook: { x: -8.5, z: 0 }, job }, null, 0);
    const r = new LogisticsRenderer(store);
    const at = (t: number): THREE.Vector3 => {
      r.update({ serverNow: t, ground: () => 0, carried: [] }, t);
      const m = new THREE.Matrix4();
      r.bags[0]?.getMatrixAt(0, m);
      return new THREE.Vector3().setFromMatrixPosition(m);
    };
    expect(store.hookAt(100, CRANE.liftS).carrying).toBe(false);
    const src = at(100);
    expect([src.x, src.z]).toEqual([-6, 1]);
    const hook = store.hookAt(15000, CRANE.liftS);
    expect(hook.carrying).toBe(true);
    const p = at(15000);
    expect(p.x).toBeCloseTo(hook.x, 4); // instance matrices are float32
    expect(p.z).toBeCloseTo(hook.z, 4);
    r.dispose();
  });
  it('Phase D adds 18 draws (+ E machines 4, processed bags 2); instances never exceed their capacity', () => {
    expect(LOGISTICS_DRAW_CALLS).toBe(24);
    const store = new LogisticsStore();
    const structures = Array.from({ length: 300 }, (_, i) => row(i + 1, 2, (i % 20) * 2, Math.floor(i / 20) * 2));
    const bags = Array.from({ length: 600 }, (_, i) => bag(i + 1, i * 0.01, 0));
    store.applyInit({ beltMps: 1.4, structures, bags, cargo: [], hoppers: [], packagers: [], hook: { x: -8.5, z: 0 }, job: null }, null, 0);
    const r = new LogisticsRenderer(store);
    r.update({ serverNow: 0, ground: () => 0, carried: [] }, 0);
    expect(r.structures.get('belt')?.count).toBe(MAX_STRUCT_INSTANCES);
    expect(r.bags[0]?.count).toBe(MAX_BAG_INSTANCES);
    expect(r.stats.conveyors).toBe(MAX_STRUCT_INSTANCES);
    const casters: string[] = [];
    r.root.traverse((o) => {
      if (o.castShadow) casters.push(o.name);
    });
    expect(casters).toEqual([]);
    r.dispose();
  });
  it('a fence blocks the player; the crane legs are always in the index', () => {
    const col = new WorldCollision(null);
    col.setUnlocked([0, 1, 2, 3, 4, 5]);
    expect(col.resolve(0, 1, 0, -1)).toEqual({ x: 0, z: -1 });
    col.setStructureColliders(structureColliders([row(1, 13, 0, 0)], () => 0));
    expect(col.resolve(0, 1, 0, -1).z).toBeGreaterThan(0.1 + 0.35 - 1e-6);
    expect(col.blockingAt(CRANE.area.x0, CRANE.area.z0)).toHaveLength(1);
    col.setStructureColliders([]);
    expect(col.resolve(0, 1, 0, -1)).toEqual({ x: 0, z: -1 });
  });
});

describe('panels', () => {
  it('the shop sells bags ×1/5/10 within the stock cap', () => {
    const offers = shopOffers({ ...DEFAULT_PERSONAL, cash: 1000, bags: [95, 0, 9] }).filter((o) => o.section === 'bags');
    expect(offers.map((o) => o.key)).toEqual(['bag.0.1', 'bag.0.5', 'bag.0.10', 'bag.1.1', 'bag.1.5', 'bag.1.10', 'bag.2.1', 'bag.2.5', 'bag.2.10']);
    expect(offers.find((o) => o.key === 'bag.0.5')).toMatchObject({ price: 250, blocked: 'Nem fér több', buy: { item: 'bag', tier: 0, qty: 5 } });
    expect(offers.find((o) => o.key === 'bag.1.5')).toMatchObject({ price: 750, blocked: null });
    expect(offers.find((o) => o.key === 'bag.1.10')?.blocked).toBe('Nincs elég pénzed');
  });
  it('telemetry labels (D.8)', () => {
    expect(telemetryLines({ kgMin: 12.5, loadPct: 40, kW: 0.36, ftHour: 12000, beltM: 30, jams: 1 })).toEqual([
      'Szállított mennyiség: 12,5 kg/perc',
      'Szalagterhelés: 40 %',
      'Fogyasztás: 0,36 kW (a hálózat még nincs bekötve)',
      'Becsült bevétel: 12\u00a0000 Ft/óra', // hu-HU groups with a no-break space
      'Szalaghossz: 30 m',
      'Elakadások: 1'
    ]);
  });
});
