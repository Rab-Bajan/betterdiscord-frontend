// The F tables and flag bits against the real backend output of Phase F (a byte-identical copy of
// .omc/handoffs/sweepers-f-vehicle-fixture.json; regenerate there with scripts/buildSweepersVehicleFixture.mjs).
import { describe, it, expect } from 'vitest';
import rawText from '../../../../fixtures/sweepers-f-vehicle-fixture.json?raw';
import { isRecord } from '../../../../../src/shared/lib/guards';
import { FUEL_NAMES, GARAGE, JERRYCAN, VEHICLE, VEHICLE_TYPES, bedPoint, endCircles, fillerNeck, spawnSlot, topMps } from '../../../../../src/features/games/sweepers/lib/vehicles/tables';
import { ROOM_CAPS, STRUCT_TYPES, T_GARAGE } from '../../../../../src/features/games/sweepers/lib/logistics/tables';
import { BUILD_LIMIT_WHAT } from '../../../../../src/features/games/sweepers/errors';
import { decodeVehicleFlags, decodeVehicleRow, parseBedAck, parseEnterAck, parseExitAck, parseRefuelAck, parseRepairAck, parseTipAck, parseVehicleList, parseVehicleUpdate, type VehicleUpdate } from '../../../../../src/features/games/sweepers/vehicleTypes';
import { VehicleStore } from '../../../../../src/features/games/sweepers/lib/vehicles/VehicleStore';
import { parseScaleWeighed } from '../../../../../src/features/games/sweepers/economyTypes';
import { ledKgDg, receiptLines } from '../../../../../src/features/games/sweepers/lib/economy/format';
import { isToastable, parseActionAck, parseBuyAck, parsePersonalState } from '../../../../../src/features/games/sweepers/debrisTypes';
import { parseOkAck, parsePlaceAck, parseStructureSpawned } from '../../../../../src/features/games/sweepers/logisticsTypes';
import { SWEEPERS_ERRORS } from '../../../../../src/features/games/sweepers/errors';

const RAW: unknown = JSON.parse(rawText);
const rec = (value: unknown, name: string): Readonly<Record<string, unknown>> => {
  if (!isRecord(value)) throw new Error(`fixture has no ${name}`);
  return value;
};
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const root = rec(RAW, 'root');
const tables = rec(root.tables, 'tables');
/** Local point of a vehicle at the origin heading rotY 0 (= the local frame). */
const local = (p: { x: number; z: number }): number[] => [p.x, p.z].map((v) => Math.round(v * 1e6) / 1e6);
const round = (values: unknown): number[] => arr(values).map((v) => Math.round(Number(v) * 1e6) / 1e6);
const ORIGIN = { x: 0, z: 0, rotY: 0 };

describe('Phase F backend fixture: tables (F.1)', () => {
  it('vehicle types: every column', () => {
    expect(arr(tables.vehicleTypes).map((v, i) => {
      const r = rec(v, 'vehicleType');
      expect(r.type).toBe(i);
      const brush = isRecord(r.brush) ? r.brush : null;
      return {
        key: r.key, name: r.name, capKg: r.capKg, topKmh: r.topKmh, manual: r.manual, fuel: r.fuel, tankL: r.tankL, lPerKm: r.lPerKm,
        seats: arr(r.seats).map((s) => {
          const [x, y, z] = arr(s);
          return { x, y, z };
        }),
        l: r.len, w: r.wid, r: r.r, tareKg: r.tareKg, cost: r.priceFt, lights: r.lights, beacon: r.beacon, horn: r.horn,
        brushW: brush ? brush.widthM : null, brushEff: brush ? brush.eff : 0
      };
    })).toEqual(VEHICLE_TYPES);
  });
  it('top speed, bed / filler / end points and spawn slots', () => {
    arr(tables.vehicleTypes).forEach((v, i) => {
      const r = rec(v, 'vehicleType');
      const t = VEHICLE_TYPES[i];
      if (!t) throw new Error('type');
      expect(topMps(t)).toBeCloseTo(Number(r.topMps), 9);
      expect(r.bedFront).toBe(t.key === 'wheelbarrow');
      expect(local(bedPoint(t, ORIGIN))).toEqual(round(r.bed));
      expect(local(fillerNeck(t, ORIGIN))).toEqual(round(r.filler));
      expect(endCircles(t, ORIGIN).map((p) => Math.round(p.z * 1e6) / 1e6)).toEqual(round(r.ends));
      expect(spawnSlot(i)).toEqual(r.slot);
    });
  });
  it('fuels, shop items and the garage', () => {
    expect(tables.fuels).toEqual(FUEL_NAMES);
    const shop = rec(tables.shop, 'shop');
    expect(arr(shop.vehicle).map((s) => {
      const r = rec(s, 'vehicleOffer');
      return [r.item, r.tier, r.ft, r.name];
    })).toEqual(VEHICLE_TYPES.map((t, i) => ['vehicle', i, t.cost, t.name]));
    expect(arr(shop.jerrycan).map((s) => {
      const r = rec(s, 'jerrycan');
      return [r.item, r.tier, r.fuel, r.ft, r.l, r.name];
    })).toEqual(FUEL_NAMES.map((f, i) => ['jerrycan', i, f, JERRYCAN.cost, JERRYCAN.litres, JERRYCAN.name]));
    const g = rec(tables.garage, 'garage');
    const t = STRUCT_TYPES[T_GARAGE];
    expect({ type: g.type, key: g.key, name: g.name, family: g.family, w: g.w, d: g.d, lvlMin: g.lvlMin, lvlMax: g.lvlMax, ins: g.ins, outs: g.outs, len: g.len, collider: rec(g.collider, 'collider').kind })
      .toEqual({ type: T_GARAGE, key: t?.key, name: t?.name, family: t?.family, w: t?.w, d: t?.d, lvlMin: t?.lvlMin, lvlMax: t?.lvlMax, ins: t?.ins, outs: t?.outs, len: t?.len ?? 0, collider: 'none' });
    expect(t?.collider).toBeNull();
    expect([g.cap, g.capName, g.lPerS, g.ftPerL]).toEqual([ROOM_CAPS.garages, BUILD_LIMIT_WHAT.garages, GARAGE.lps, GARAGE.ftPerL]);
  });
  it('rules constants', () => {
    const c = rec(tables.constants, 'constants');
    expect(c).toEqual({
      vehicleCap: VEHICLE.cap, enterReachExtraM: VEHICLE.reachPadM, bedReachM: VEHICLE.pointReachM, stoppedMps: VEHICLE.stoppedMps, tipMs: VEHICLE.tipMs,
      bedBags: VEHICLE.maxBags, curbMps: VEHICLE.curbMps, punctureChance: VEHICLE.punctureChance, alignMax: VEHICLE.alignMax, curbCooldownMs: VEHICLE.curbCooldownMs,
      punctSpeed: VEHICLE.punctFactor, hornCooldownMs: VEHICLE.hornCooldownMs, idleStopMs: VEHICLE.idleMs, exitSideM: 0.6, repairFt: VEHICLE.repairFt
    });
  });
  it('flag bits decode as the backend packs them', () => {
    const f = rec(tables.flags, 'flags');
    expect(decodeVehicleFlags(Number(f.lightsMask))).toMatchObject({ lights: 0 }); // 3 is not a mode: off
    expect(decodeVehicleFlags(Number(f.beacon)).beacon).toBe(true);
    expect(decodeVehicleFlags(Number(f.tipping)).tipping).toBe(true);
    expect(decodeVehicleFlags(Number(f.punct)).punct).toBe(true);
    expect(decodeVehicleFlags(Number(f.stalled)).stalled).toBe(true);
    expect(decodeVehicleFlags(Number(f.corr)).corr).toBe(true);
    expect(decodeVehicleFlags(Number(f.garage)).inGarage).toBe(true);
    expect(decodeVehicleFlags(3 << Number(f.alignShift)).align).toBe(3);
  });
});

const update = (value: unknown): VehicleUpdate => {
  const u = parseVehicleUpdate(value);
  if (!u) throw new Error('vehicle_update did not parse');
  return u;
};

describe('Phase F backend fixture: events (F.4/F.5)', () => {
  it('init_state.vehicles and the vehicle_update samples parse with nothing dropped', () => {
    const init = arr(rec(root.initState, 'initState').vehicles);
    expect(parseVehicleList(init).map((r) => [r.id, r.type])).toEqual([[1, 2], [2, 0], [3, 3], [4, 4], [5, 5]]);
    const vu = rec(root.vehicleUpdate, 'vehicleUpdate');
    expect(update(vu.bought).rows).toHaveLength(1);
    expect(update(vu.lights).rows[0]).toMatchObject({ lights: 2, seats: [1] });
    const horn = update(vu.horn);
    expect(horn.horn).toEqual([5]);
    expect(horn.rows.find((r) => r.id === 5)).toMatchObject({ beacon: true, seats: [1, 0, 0] });
    const hit = update(vu.hit);
    expect(hit.hit).toEqual([{ id: 1, kind: 1 }]);
    expect(hit.rows[0]).toMatchObject({ punct: true, align: 1, v: 10, bedKg: 13, bags: 1 });
    expect(update(vu.delShape).del).toEqual([1]);
    expect(parsePersonalState(rec(root.personalUpdate, 'personalUpdate').jerry)?.jerry).toBe(1);
  });
  it('the 24-tick drive trace: every row decodes; corr, hit and the stall replay through the store', () => {
    const ticks = arr(rec(root.trace, 'trace').ticks).map((t) => rec(t, 'tick'));
    expect(ticks).toHaveLength(24);
    const store = new VehicleStore();
    store.applyInit(parseVehicleList(arr(rec(root.initState, 'initState').vehicles)), 0);
    const seen: string[] = [];
    for (const t of ticks) {
      if (t.row !== null) expect(decodeVehicleRow(t.row)).not.toBeNull();
      if (t.update === null || t.update === undefined) continue;
      const u = update(t.update);
      expect(u.rows).toHaveLength(arr(rec(t.update, 'update').v).length);
      const ev = store.applyUpdate(u);
      const row = store.rows.get(1);
      if (row?.corr) seen.push(`corr:${String(t.phase)}`);
      for (const h of ev.hit) seen.push(`hit:${h.kind}:${String(t.phase)}`);
      for (const r of ev.stalled) seen.push(`stall:${r.id}:${String(t.phase)}`);
    }
    expect(seen).toContain('corr:overSpeed');
    expect(seen).toContain('corr:wallSlide');
    expect(seen).toContain('hit:1:curbHit');
    expect(seen.filter((e) => e.startsWith('stall:'))).toEqual(['stall:1:stalled']);
    expect(store.rows.get(1)).toMatchObject({ stalled: true, fuelL: 0, punct: true, align: 1 });
  });
  it('tips, the vehicle weighing and the garage refuel', () => {
    const tip = rec(root.tip, 'tip');
    expect(parseTipAck(rec(tip.hopper, 'hopper').ack)).toEqual({ ok: true, into: 'hopper', kg: 43 });
    expect(update(rec(tip.hopper, 'hopper').vehicleUpdate).rows[0]).toMatchObject({ tipping: true, bedKg: 1 });
    expect(parseTipAck(rec(tip.ground, 'ground').ack)).toEqual({ ok: true, into: 'ground', kg: 33 });
    const sw = rec(root.scaleWeighed, 'scaleWeighed');
    const w = parseScaleWeighed(sw.payload);
    if (!w) throw new Error('scale_weighed');
    expect(w.veh).toEqual({ id: 1, type: 2, tareKg: 140 });
    expect(w.lines).toHaveLength(3);
    expect(ledKgDg(w)).toBe(5700 + 14_000);
    expect(receiptLines(w, null).slice(2, 5)).toEqual(['Bruttó: 197,00 kg', 'Tára (Simson Háromkerekű Riksa): 140,00 kg', 'Nettó: 57,00 kg']);
    expect(update(sw.vehicleUpdate).rows[0]?.bedKg).toBe(0);
    const g = rec(root.garage, 'garage');
    const spawned = parseStructureSpawned(g.spawned);
    expect(spawned?.row).toMatchObject({ type: 18 });
    const steps = arr(g.steps).map((s) => rec(s, 'step'));
    expect(steps.map((s) => decodeVehicleRow(s.row)).map((r) => [r?.fuelL, r?.inGarage])).toEqual([[17, true], [19, true], [20, true], [20, true]]);
    expect(steps.map((s) => s.teamFunds)).toEqual([1200, 400, 0, 0]);
    expect(steps.at(-1)?.vehicleUpdate).toBeNull();
  });
  it('every ack parses with its guard', () => {
    const a = rec(root.acks, 'acks');
    const buy = rec(a.buy_upgrade, 'buy');
    expect(parseBuyAck(buy.vehicle)).toEqual({ ok: true, cash: 2000, teamFunds: 4_915_000 });
    expect(parseBuyAck(buy.jerrycan).ok).toBe(true);
    const enter = rec(a.vehicle_enter, 'enter');
    expect([parseEnterAck(enter.driver), parseEnterAck(enter.passenger)]).toEqual([{ ok: true, seat: 0 }, { ok: true, seat: 1 }]);
    const va = rec(a.vehicle_action, 'vehicle_action');
    expect(parseExitAck(va.exit)).toEqual({ ok: true, x: 12, z: -11.85 });
    expect(parseExitAck(va.exitPassenger)).toEqual({ ok: true, x: 4, z: -11.4 });
    for (const k of ['lights', 'beacon', 'horn']) expect(parseOkAck(va[k])).toEqual({ ok: true });
    expect(parseBedAck(va.load)).toEqual({ ok: true, bedKg: 13 });
    expect(parseRefuelAck(va.refuel)).toEqual({ ok: true, fuelL: 5 });
    expect(parseRepairAck(va.repair)).toEqual({ ok: true, teamFunds: 4_997_000 });
    expect(parseTipAck(va.tipHopper).ok).toBe(true);
    expect(parseTipAck(va.tipGround).ok).toBe(true);
    expect(parseActionAck(rec(a.player_action, 'player_action').dumpIntoBed)).toEqual({ ok: true, bedKg: 3 });
    expect(parsePlaceAck(rec(a.place_structure, 'place').garage).ok).toBe(true);
    expect(parseOkAck(a.vehicle_drive)).toEqual({ ok: true });
  });
  it('every refusal: the server text (F.8 where the key is ours), cadence codes stay silent', () => {
    const texts: Readonly<Record<string, string>> = SWEEPERS_ERRORS;
    let n = 0;
    for (const [event, byReason] of Object.entries(rec(root.refusals, 'refusals'))) {
      for (const [reason, raw] of Object.entries(rec(byReason, event))) {
        const ack = parseOkAck(raw);
        if (ack.ok) throw new Error(`${event}.${reason} is not a refusal`);
        n += 1;
        const own = texts[reason];
        if (own !== undefined && !own.includes('{')) expect(ack.error).toBe(own);
        expect(isToastable(ack, false)).toBe(!reason.startsWith('tooFast'));
        if (reason === 'validationSeat') expect(ack.code).toBe('VALIDATION_ERROR');
      }
    }
    expect(n).toBeGreaterThan(30);
    const refusals = rec(root.refusals, 'refusals');
    expect(parseOkAck(rec(refusals.vehicle_action, 'va').exitBlocked)).toMatchObject({ ok: false, error: SWEEPERS_ERRORS.exitBlocked, code: 'SWEEPERS_REFUSED' });
    expect(parseOkAck(rec(refusals.buy_upgrade, 'buy').slotBlocked)).toMatchObject({ ok: false, error: SWEEPERS_ERRORS.slotBlocked, code: 'SWEEPERS_REFUSED' });
  });
});
