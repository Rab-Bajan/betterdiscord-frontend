// The guards, tables and the client D.3 copy against the real backend output of Phase D (a byte-identical copy
// of .omc/handoffs/sweepers-d-logistics-fixture.json; regenerate there with scripts/buildSweepersLogisticsFixture.mjs).
import { describe, it, expect } from 'vitest';
import rawText from '../../../../fixtures/sweepers-d-logistics-fixture.json?raw';
import { isRecord } from '../../../../../src/shared/lib/guards';
import {
  BAG_TIERS,
  BELT_MPS,
  CRANE,
  CRANE_LEGS,
  JAM_MS,
  LANDMARK_INTAKE_PAD_M,
  LOT_GROUPS,
  PITCH_M,
  ROOM_CAPS,
  STRUCT_TYPES,
  TINT_COLORS,
  W_PER_M,
  rotYOf
} from '../../../../../src/features/games/sweepers/lib/logistics/tables';
import { DROP_BELOW_MPS, GRAVITY, THROW_MAX_MPS, THROW_MAX_STEPS, THROW_STEP_S } from '../../../../../src/features/games/sweepers/lib/logistics/throwArc';
import { TIE_MS } from '../../../../../src/features/games/sweepers/lib/logistics/interact';
import { extrapolateNode, landmarkOutPort, pathLen } from '../../../../../src/features/games/sweepers/lib/logistics/network';
import { arcPoint } from '../../../../../src/features/games/sweepers/lib/logistics/LogisticsRenderer';
import { telemetryLines } from '../../../../../src/features/games/sweepers/components/LogisticsPanel';
import { parseActionAck, parseBuyAck, parsePersonalState } from '../../../../../src/features/games/sweepers/debrisTypes';
import { parseTickSync } from '../../../../../src/features/games/sweepers/types';
import { checkPlacement, refusalText } from '../../../../../src/features/games/sweepers/lib/logistics/placement';
import { BUILD_LIMIT_WHAT, SWEEPERS_ERRORS } from '../../../../../src/features/games/sweepers/errors';
import {
  decodeBagRow,
  decodeCargoRow,
  decodeStructRow,
  parseCraneAck,
  parseLogisticsInit,
  parseLogisticsUpdate,
  parseOkAck,
  parsePlaceAck,
  parseStructureSpawned,
  parseTelemetry,
  parseThrowAck,
  parseTieAck,
  type BagRow,
  type StructRow
} from '../../../../../src/features/games/sweepers/logisticsTypes';
import { WorldCollision } from '../../../../../src/features/games/sweepers/lib/movement/WorldCollision';
import { realInit } from './fixtures';

const RAW: unknown = JSON.parse(rawText);
const rec = (value: unknown, name: string): Readonly<Record<string, unknown>> => {
  if (!isRecord(value)) throw new Error(`fixture has no ${name}`);
  return value;
};
const fixture = rec(RAW, 'root');
const tables = rec(fixture.tables, 'tables');
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const must = <T>(value: T | null): T => {
  if (value === null) throw new Error('fixture row did not decode');
  return value;
};

describe('Phase D backend fixture: tables (D.1)', () => {
  it('bag tiers, tints and lot groups', () => {
    expect(arr(tables.bagTiers).map((t) => {
      const r = rec(t, 'bagTier');
      return { key: r.key, name: r.name, l: r.l, kg: r.kg, cost: r.cost, rupture: r.rupture, carry: r.carry, r: r.r, h: r.h, color: r.colour, cap: r.stockCap };
    })).toEqual(BAG_TIERS.slice(0, 3)); // the D fixture pins tiers 0–2; E pins 3–4
    expect(arr(tables.tints).map((t) => (t === 'tier' ? null : t))).toEqual(TINT_COLORS);
    expect(tables.lotGroups).toEqual(LOT_GROUPS);
  });
  it('structure types: key, name, size, levels, ports, path length and collider', () => {
    const collider = (c: Readonly<Record<string, unknown>>): unknown => (c.kind === 'fixed' ? c.h : c.kind === 'none' ? null : c.kind);
    expect(arr(tables.structTypes).map((t, i) => {
      const r = rec(t, 'structType');
      expect(r.index).toBe(i);
      expect(r.rotY).toEqual(tables.rotY);
      return { key: r.key, name: r.name, w: r.w, d: r.d, lvlMin: r.lvlMin, lvlMax: r.lvlMax, ins: r.ins, outs: r.outs, len: r.len, collider: collider(rec(r.collider, 'collider')) };
    })).toEqual(STRUCT_TYPES.slice(0, 14).map((t) => ({ key: t.key, name: t.name, w: t.w, d: t.d, lvlMin: t.lvlMin, lvlMax: t.lvlMax, ins: t.ins, outs: t.outs, len: t.len ?? 0, collider: t.collider })));
  });
  it('rotation, caps and their names', () => {
    expect([0, 1, 2, 3].map(rotYOf)).toEqual(tables.rotY);
    // E adds the `machines` cap; the rest is D's
    const { machines: _cap, ...dCaps } = ROOM_CAPS;
    const { machines: _name, ...dNames } = BUILD_LIMIT_WHAT;
    expect(tables.caps).toEqual(dCaps);
    expect(tables.capNames).toEqual(dNames);
  });
  it('constants', () => {
    const c = rec(tables.constants, 'constants');
    expect({ beltMps: c.beltMps, cargoPitchM: c.cargoPitchM, jamMs: c.jamMs, wattsPerM: c.wattsPerM, landmarkIntakePadM: c.landmarkIntakePadM, tieCadenceMs: c.tieCadenceMs })
      .toEqual({ beltMps: BELT_MPS, cargoPitchM: PITCH_M, jamMs: JAM_MS, wattsPerM: W_PER_M, landmarkIntakePadM: LANDMARK_INTAKE_PAD_M, tieCadenceMs: TIE_MS });
    expect({ gravity: c.gravity, throwStepS: c.throwStepS, throwMaxSteps: c.throwMaxSteps, dropPower: c.dropPower, throwMaxPower: c.throwMaxPower })
      .toEqual({ gravity: GRAVITY, throwStepS: THROW_STEP_S, throwMaxSteps: THROW_MAX_STEPS, dropPower: DROP_BELOW_MPS, throwMaxPower: THROW_MAX_MPS });
  });
  it('the crane', () => {
    const c = rec(tables.crane, 'crane');
    const a = rec(c.area, 'area');
    expect({ x0: a.minX, x1: a.maxX, z0: a.minZ, z1: a.maxZ }).toEqual(CRANE.area);
    expect({ legR: c.legR, legH: c.legH, hookMps: c.hookMps, liftS: Number(c.liftMs) / 1000, console: c.console, consoleReachM: c.consoleReachM, targets: c.targets, padM: c.padM })
      .toEqual({ legR: CRANE.legR, legH: CRANE.legH, hookMps: CRANE.hookMps, liftS: CRANE.liftS, console: CRANE.console, consoleReachM: CRANE.consoleReachM, targets: CRANE.targets, padM: CRANE.padM });
    expect(c.legs).toEqual(CRANE_LEGS);
  });
  it('the landmark hopper and the reserved rects match the real layout', () => {
    const { layout } = realInit();
    const h = rec(tables.landmarkHopper, 'landmarkHopper');
    expect({ x: h.x, z: h.z, w: h.w, d: h.d, rotY: h.rotY }).toEqual({ x: layout.landmarks.hopper.x, z: layout.landmarks.hopper.z, w: layout.landmarks.hopper.w, d: layout.landmarks.hopper.d, rotY: layout.landmarks.hopper.rotY });
    const out = landmarkOutPort(layout.landmarks.hopper, () => 0);
    const o = rec(h.out, 'out');
    expect(out.x).toBeCloseTo(Number(o.x), 9);
    expect(out.z).toBeCloseTo(Number(o.z), 9);
    expect(out.hx).toBeCloseTo(Number(o.hx), 9);
    expect(out.hz).toBeCloseTo(Number(o.hz), 9);
    const [pad, hopper, area] = arr(rec(tables.reserved, 'reserved').rects).map((r) => rec(r, 'rect'));
    const wb = layout.landmarks.weighbridge;
    expect(wb.rotY).toBe(0); // the pad rect below is axis-aligned
    expect(pad).toEqual({ minX: wb.x - wb.w / 2 - 1, maxX: wb.x + wb.w / 2 + 1, minZ: wb.z - wb.d / 2 - 1, maxZ: wb.z + wb.d / 2 + 1 });
    expect(hopper).toEqual({ minX: Number(h.x) - 2, maxX: Number(h.x) + 2, minZ: Number(h.z) - 2, maxZ: Number(h.z) + 2 });
    expect(area).toEqual(rec(rec(tables.crane, 'crane').area, 'area'));
    expect(rec(tables.reserved, 'reserved').console).toEqual({ ...CRANE.console, r: 1 });
  });
});

describe('Phase D backend fixture: the client D.3 copy agrees with every placement sample', () => {
  const init = realInit();
  const placement = rec(fixture.placement, 'placement');
  const samples = arr(placement.samples).map((s) => rec(s, 'sample'));
  it('has a sample per refusal', () => {
    expect(samples.length).toBeGreaterThanOrEqual(20);
  });
  for (const s of samples) {
    it(String(s.name), () => {
      const req = rec(s.request, 'request');
      const pose = rec(s.pose, 'pose');
      const col = new WorldCollision(init.layout);
      col.setUnlocked(arr(s.unlocked).filter((n): n is number => typeof n === 'number'));
      const check = checkPlacement({
        layout: init.layout,
        ground: (x, z) => col.terrain(x, z),
        isLocked: (x, z) => col.isLocked(x, z),
        structures: arr(s.structures).map((r): StructRow => must(decodeStructRow(r))),
        groundBags: arr(s.groundBags).map((r): BagRow => must(decodeBagRow(r))),
        players: arr(s.players).map((p) => ({ x: Number(arr(p)[0]) / 100, z: Number(arr(p)[1]) / 100 })),
        pose: { x: Number(pose.x), z: Number(pose.z) }
      }, { type: Number(req.type), x: Number(req.x), z: Number(req.z), rot: Number(req.rot), lvl: Number(req.lvl) });
      const ack = rec(s.ack, 'ack');
      const parsed = parsePlaceAck(ack);
      expect(parsed.ok).toBe(check.ok);
      if (check.ok || parsed.ok) return;
      if (ack.code === 'VALIDATION_ERROR') expect(check.reason).toBe('invalid');
      else expect(refusalText(check, SWEEPERS_ERRORS)).toBe(parsed.error);
    });
  }
  it('delete acks and refusals parse', () => {
    const d = rec(placement.deletes, 'deletes');
    expect(parseOkAck(d.ok)).toEqual({ ok: true });
    for (const key of ['unknownStructure', 'supportsStructures', 'tooFar'] as const) {
      expect(parseOkAck(d[key])).toEqual({ ok: false, error: SWEEPERS_ERRORS[key], code: 'SWEEPERS_REFUSED' });
    }
    expect(parseOkAck(d.validation)).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
  });
});

describe('Phase D backend fixture: init, events and the cargo trace (D.5)', () => {
  const init = rec(fixture.initState, 'initState');
  const events = rec(fixture.events, 'events');
  const trace = rec(fixture.trace, 'trace');
  it('init_state.logistics parses without dropping a row', () => {
    for (const key of ['atJoin', 'afterTrace']) {
      const raw = rec(init[key], key);
      const parsed = must(parseLogisticsInit(raw));
      expect(parsed.structures).toHaveLength(arr(raw.structures).length);
      expect(parsed.bags).toHaveLength(arr(raw.bags).length);
      expect(parsed.cargo).toHaveLength(arr(raw.cargo).length);
      expect(parsed.hook).toEqual({ x: Number(arr(rec(raw.crane, 'crane').hook)[0]) / 100, z: Number(arr(rec(raw.crane, 'crane').hook)[1]) / 100 });
    }
    expect(arr(rec(fixture.network, 'network').structures).every((r) => decodeStructRow(r) !== null)).toBe(true);
  });
  it('structure_spawned and every logistics_update (events and the 180-tick run) parse without dropping a row', () => {
    for (const s of arr(events.structureSpawned)) expect(parseStructureSpawned(s)?.by).toBe(rec(s, 'spawned').by);
    const updates = [...Object.values(rec(events.logisticsUpdate, 'logisticsUpdate')), ...arr(trace.updates)];
    expect(updates.length).toBeGreaterThan(30);
    for (const raw of updates) {
      const r = rec(raw, 'update');
      const u = must(parseLogisticsUpdate(r));
      for (const key of ['s', 'sdel', 'b', 'c', 'del', 'arcs', 'burst', 'hop', 'pk'] as const) expect(u[key]).toHaveLength(arr(r[key]).length);
      if (r.crane !== undefined) expect(u.crane === null).toBe(r.crane === null);
    }
  });
  it('the 36-tick CargoRow trace: client extrapolation stays within 1 cm of the next tick within a node', () => {
    const lens = new Map(must(parseLogisticsInit(init.afterTrace)).structures.map((r) => [r.id, pathLen(r)]));
    const ticks = arr(trace.ticks).map((tk) => {
      const r = rec(tk, 'tick');
      return { t: Number(r.t), rows: arr(r.rows).map((row) => must(decodeCargoRow(row))) };
    });
    expect(ticks).toHaveLength(36);
    let compared = 0;
    for (let k = 0; k + 1 < ticks.length; k++) {
      const [now, next] = [ticks[k], ticks[k + 1]];
      if (!now || !next) continue;
      for (const node of new Set(now.rows.map((c) => c.node))) {
        const here = now.rows.filter((c) => c.node === node);
        const after = next.rows.filter((c) => c.node === node);
        // only while the node holds the same cargo (an arrival or departure is the server row's job, D.10)
        if (here.map((c) => c.id).join() !== after.map((c) => c.id).join()) continue;
        const predicted = extrapolateNode(here.map((c) => ({ ...c, t: now.t, input: 0 })), lens.get(node) ?? 0, next.t);
        for (const c of after) {
          expect(Math.abs((predicted.get(c.id) ?? NaN) - c.s)).toBeLessThanOrEqual(0.01);
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(20);
  });
  it('a bag arc ends at the throw ack point and peaks at its apex', () => {
    const bags = rec(fixture.bags, 'bags');
    const u = must(parseLogisticsUpdate({ t: 1000, arcs: [bags.arc] }));
    const a = u.arcs[0];
    if (!a) throw new Error('arc did not decode');
    const arc = { ...a, t0: 1000 };
    expect(arcPoint(arc, 1000)).toEqual({ x: a.fx, y: a.fy, z: a.fz });
    const end = arcPoint(arc, 1000 + a.durMs);
    const ground = parseThrowAck(rec(rec(fixture.acks, 'acks').throw, 'throw').ground);
    if (!ground.ok) throw new Error('throw ack refused');
    expect(end.x).toBeCloseTo(ground.to.x, 9);
    expect(end.y).toBeCloseTo(ground.to.y, 9);
    expect(end.z).toBeCloseTo(ground.to.z, 9);
    let top = -Infinity;
    for (let t = 1000; t <= 1000 + a.durMs; t += 1) top = Math.max(top, arcPoint(arc, t).y);
    expect(top).toBeCloseTo(a.apexY, 2);
    expect(decodeBagRow(bags.tinted)).toMatchObject({ tier: 1, tint: 1 });
    expect(decodeBagRow(bags.tied)).toMatchObject({ id: 3, tier: 0, kg: 20 });
  });
  it('the 9-element tick row carries the bag; personal_update carries the stock; telemetry', () => {
    const tick = must(parseTickSync(events.tickSyncCarry));
    expect(tick.players.map((p) => p.carry)).toEqual(arr(rec(events.tickSyncCarry, 'tick').p).map((p) => arr(p)[8]));
    expect(tick.players[0]?.carry).toBeGreaterThan(0);
    const personal = must(parsePersonalState(events.personalUpdate));
    expect(personal.bags).toEqual(rec(events.personalUpdate, 'personal').bags);
    const tel = must(parseTelemetry(events.logisticsTelemetry));
    expect(tel).toEqual(events.logisticsTelemetry);
    expect(telemetryLines(tel)).toHaveLength(6);
  });
});

describe('Phase D backend fixture: acks and refusals (D.4)', () => {
  const acks = rec(fixture.acks, 'acks');
  const refusals = rec(fixture.refusals, 'refusals');
  it('every ack parses as ok', () => {
    expect(parseTieAck(acks.tie_bag)).toEqual(acks.tie_bag);
    expect(parseOkAck(acks.pickup)).toEqual({ ok: true });
    for (const [into, raw] of Object.entries(rec(acks.throw, 'throw'))) {
      expect(parseThrowAck(raw)).toMatchObject({ ok: true, into: into === 'drop' ? 'ground' : into, burst: false });
    }
    expect(parseCraneAck(acks.crane)).toEqual(acks.crane);
    expect(parseActionAck(acks.dump)).toEqual(acks.dump);
    expect(parseOkAck(acks.clearJam)).toEqual({ ok: true });
    for (const raw of Object.values(rec(acks.telemetry, 'telemetry'))) expect(parseOkAck(raw)).toEqual({ ok: true });
    expect(parseBuyAck(acks.buy_bag)).toEqual(acks.buy_bag);
  });
  it('every refusal parses and its text is the D.8 string', () => {
    let n = 0;
    for (const byKey of Object.values(refusals)) {
      for (const [key, raw] of Object.entries(rec(byKey, 'refusals'))) {
        const r = rec(raw, key);
        expect(parseOkAck(r)).toEqual({ ok: false, error: r.error, code: r.code });
        if (key in SWEEPERS_ERRORS) expect(r.error).toBe(SWEEPERS_ERRORS[key as keyof typeof SWEEPERS_ERRORS]);
        else expect(['SWEEPERS_TOO_FAST', 'VALIDATION_ERROR']).toContain(r.code);
        n++;
      }
    }
    expect(n).toBeGreaterThan(15);
  });
});
