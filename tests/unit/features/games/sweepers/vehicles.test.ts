// Phase F client: row / update / ack guards, the handling model, the dash, the E order, the receipt and the shop.
import { describe, it, expect } from 'vitest';
import { VEHICLE, VEHICLE_TYPES, bedPoint, fillerNeck, topMps, type VehicleType } from '../../../../../src/features/games/sweepers/lib/vehicles/tables';
import { decodeVehicleRow, parseBedAck, parseEnterAck, parseExitAck, parseTipAck, parseVehicleList, parseVehicleUpdate, type Vehicle } from '../../../../../src/features/games/sweepers/vehicleTypes';
import { massFactor, newVehicleBody, stepVehicle, vehicleTop, type VehicleBody } from '../../../../../src/features/games/sweepers/lib/vehicles/VehicleModel';
import { VehicleStore } from '../../../../../src/features/games/sweepers/lib/vehicles/VehicleStore';
import { REPAIR_PROMPT, dashValues, nearestBed, nearestEnterable, nearestFiller, nearestRepairable } from '../../../../../src/features/games/sweepers/lib/vehicles/dash';
import { chooseInteraction } from '../../../../../src/features/games/sweepers/lib/logistics/interact';
import { checkPlacement, type PlacementWorld } from '../../../../../src/features/games/sweepers/lib/logistics/placement';
import { WorldCollision } from '../../../../../src/features/games/sweepers/lib/movement/WorldCollision';
import { ledKgDg, receiptLines } from '../../../../../src/features/games/sweepers/lib/economy/format';
import { parseScaleWeighed } from '../../../../../src/features/games/sweepers/economyTypes';
import { DEFAULT_PERSONAL, parseActionAck, parsePersonalState } from '../../../../../src/features/games/sweepers/debrisTypes';
import { teamOffers } from '../../../../../src/features/games/sweepers/components/ShopPanel';
import { VehicleRenderer } from '../../../../../src/features/games/sweepers/lib/vehicles/VehicleRenderer';
import { PHASE_F_DRAW_CALLS } from '../../../../../src/features/games/sweepers/lib/engine/SweepersGame';
import type { StructRow } from '../../../../../src/features/games/sweepers/logisticsTypes';
import { realInit } from './fixtures';

const type = (i: number): VehicleType => {
  const t = VEHICLE_TYPES[i];
  if (!t) throw new Error('type');
  return t;
};
// [id, type, xCm, zCm, rot16, vCmS, fuelDl, flags, bedKgDg, bags, s0, s1, s2]
const wire = (over: Partial<Record<'id' | 'type' | 'x' | 'z' | 'v' | 'fuel' | 'flags' | 'bed' | 'bags' | 's0' | 's1' | 's2', number>> = {}): number[] =>
  [over.id ?? 1, over.type ?? 3, over.x ?? 400, over.z ?? -1000, 49152, over.v ?? 0, over.fuel ?? 200, over.flags ?? 0, over.bed ?? 0, over.bags ?? 0, over.s0 ?? 0, over.s1 ?? 0, over.s2 ?? 0];
const vehicle = (over: Partial<Vehicle> = {}): Vehicle => {
  const row = decodeVehicleRow(wire());
  if (!row) throw new Error('row');
  return { ...row, ...over };
};

describe('F.3 rows and F.5 updates', () => {
  it('decodes a row with its flags; seats follow the type', () => {
    const flags = 2 | 4 | 16 | 128 | (2 << 8);
    expect(decodeVehicleRow(wire({ flags, bed: 12_345, bags: 2, s0: 7, s1: 9, s2: 3 }))).toEqual({
      id: 1, type: 3, x: 4, z: -10, rotY: (3 * Math.PI) / 2, v: 0, fuelL: 20,
      lights: 2, beacon: true, tipping: false, punct: true, stalled: false, corr: false, inGarage: true, align: 2,
      bedKg: 123.45, bags: 2, seats: [7, 9]
    });
    expect(decodeVehicleRow(wire({ type: 5 }))?.seats).toEqual([0, 0, 0]);
    expect(decodeVehicleRow(wire({ type: 0 }))?.seats).toEqual([0]);
  });
  it('drops malformed rows', () => {
    expect(decodeVehicleRow(wire({ id: 0 }))).toBeNull();
    expect(decodeVehicleRow(wire({ type: 6 }))).toBeNull();
    expect(decodeVehicleRow(wire({ v: -1 }))).toBeNull();
    expect(decodeVehicleRow(wire().slice(0, 12))).toBeNull();
    expect(decodeVehicleRow([1, 3, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBeNull();
    expect(parseVehicleList([wire(), 'x', wire({ id: 300 }), wire({ id: 2, type: 4 })]).map((r) => r.id)).toEqual([1, 2]);
    expect(parseVehicleList(undefined)).toEqual([]);
  });
  it('vehicle_update: absent lists are empty, bad entries dropped', () => {
    expect(parseVehicleUpdate({ v: [] })).toBeNull();
    expect(parseVehicleUpdate({ t: 5 })).toEqual({ t: 5, rows: [], del: [], horn: [], hit: [] });
    const u = parseVehicleUpdate({ t: 9, v: [wire(), [1]], del: [2, 0, 'x'], horn: [1], hit: [[1, 0], [1, 1], [1, 2], [0, 1]] });
    expect(u?.rows).toHaveLength(1);
    expect(u?.del).toEqual([2]);
    expect(u?.horn).toEqual([1]);
    expect(u?.hit).toEqual([{ id: 1, kind: 0 }, { id: 1, kind: 1 }]);
  });
  it('acks: ok shapes, refusals with text and code, malformed = silent refusal', () => {
    expect(parseEnterAck({ ok: true, seat: 1 })).toEqual({ ok: true, seat: 1 });
    expect(parseEnterAck({ ok: false, error: 'Ez a hely foglalt.', code: 'SWEEPERS_REFUSED' })).toEqual({ ok: false, error: 'Ez a hely foglalt.', code: 'SWEEPERS_REFUSED' });
    expect(parseEnterAck({ ok: true, seat: 3 })).toMatchObject({ ok: false, code: null });
    expect(parseExitAck({ ok: true, x: 1, z: 2 })).toEqual({ ok: true, x: 1, z: 2 });
    expect(parseTipAck({ ok: true, into: 'hopper', kg: 40 })).toEqual({ ok: true, into: 'hopper', kg: 40 });
    expect(parseTipAck({ ok: true, into: 'sea', kg: 40 }).ok).toBe(false);
    expect(parseBedAck({ ok: true, bedKg: 12.5 })).toEqual({ ok: true, bedKg: 12.5 });
    expect(parseActionAck({ ok: true, bedKg: 3 })).toEqual({ ok: true, bedKg: 3 });
    expect(parsePersonalState({ cash: 1, jerry: 2 })?.jerry).toBe(2);
    expect(parsePersonalState({ cash: 1, jerry: 3 })?.jerry).toBe(0);
  });
});

describe('VehicleStore', () => {
  it('rises, horn, hits, deletes and seats', () => {
    const store = new VehicleStore();
    store.applyInit(parseVehicleList([wire({ s0: 4 }), wire({ id: 2, type: 5 })]), 0);
    expect(store.seatOf(4)).toMatchObject({ row: { id: 1 }, seat: 0 });
    expect(store.ownedTypes).toEqual([3, 5]);
    const u = parseVehicleUpdate({ t: 100, v: [wire({ flags: 32 | 8 })], horn: [2, 7], hit: [[1, 1]], del: [2] });
    if (!u) throw new Error('update');
    const ev = store.applyUpdate(u);
    expect(ev.stalled.map((r) => r.id)).toEqual([1]);
    expect(ev.tipped.map((r) => r.id)).toEqual([1]);
    expect(ev.horn).toEqual([]); // deleted in the same update
    expect(ev.hit.map((h) => [h.id, h.kind])).toEqual([[1, 1]]);
    expect(store.rows.has(2)).toBe(false);
    expect(store.seatOf(4)).toBeNull();
    const again = parseVehicleUpdate({ t: 200, v: [wire({ flags: 32 | 8 })] });
    if (!again) throw new Error('update');
    expect(store.applyUpdate(again).stalled).toEqual([]); // only a rising flag
    expect(store.pose(1, 150)).toMatchObject({ x: 4, z: -10 });
  });
});

/** Steps a body for `s` seconds at 60 Hz. */
const run = (b: VehicleBody, t: VehicleType, input: { throttle: number; steer: number }, s: number, load = { bedKg: 0, align: 0, punct: false }): void => {
  for (let i = 0; i < s * 60; i++) stepVehicle(b, t, load, input, 1 / 60, null);
};
const brakeDistance = (t: VehicleType, bedKg: number): number => {
  const b = newVehicleBody(0, 0, 0);
  b.v = 8;
  const z0 = b.z;
  for (let i = 0; i < 6000 && b.v > 0; i++) stepVehicle(b, t, { bedKg, align: 0, punct: false }, { throttle: -1, steer: 0 }, 1 / 120, null);
  return z0 - b.z;
};

describe('VehicleModel (97)', () => {
  it('reaches and holds the top speed; carts walk; a puncture caps at × 0.6', () => {
    const lada = type(3);
    const b = newVehicleBody(0, 0, 0);
    run(b, lada, { throttle: 1, steer: 0 }, 20);
    expect(b.v).toBeCloseTo(topMps(lada), 6);
    expect(b.z).toBeLessThan(0); // forward = −z
    const cart = newVehicleBody(0, 0, 0);
    run(cart, type(0), { throttle: 1, steer: 0 }, 5);
    expect(cart.v).toBeCloseTo(4.5, 6);
    const flat = newVehicleBody(0, 0, 0);
    run(flat, lada, { throttle: 1, steer: 0 }, 20, { bedKg: 0, align: 0, punct: true });
    expect(flat.v).toBeCloseTo(vehicleTop(lada, true), 6);
    expect(vehicleTop(lada, true)).toBeCloseTo(topMps(lada) * VEHICLE.punctFactor, 9);
    const back = newVehicleBody(0, 0, 0);
    run(back, lada, { throttle: -1, steer: 0 }, 10);
    expect(back.v).toBeCloseTo(-topMps(lada) * 0.3, 6);
  });
  it('the mass factor multiplies the braking distance', () => {
    const ifa = type(5);
    expect(massFactor(ifa, 5000)).toBeCloseTo(11_500 / 6500, 9);
    expect(brakeDistance(ifa, 5000) / brakeDistance(ifa, 0)).toBeCloseTo(massFactor(ifa, 5000), 1);
  });
  it('a full bed drifts in a turn; an empty one does not', () => {
    const t = type(3);
    const turn = (bedKg: number): boolean => {
      const b = newVehicleBody(0, 0, 0);
      run(b, t, { throttle: 1, steer: 0 }, 5, { bedKg, align: 0, punct: false });
      let drifted = false;
      for (let i = 0; i < 60; i++) {
        stepVehicle(b, t, { bedKg, align: 0, punct: false }, { throttle: 1, steer: 1 }, 1 / 60, null);
        drifted ||= b.drifting;
      }
      return drifted;
    };
    expect(turn(t.capKg)).toBe(true);
    expect(turn(0)).toBe(false);
  });
  it('damage pulls the steering; a stall kills the throttle; a blocked end stops the body', () => {
    const t = type(3);
    const straight = newVehicleBody(0, 0, 0);
    run(straight, t, { throttle: 1, steer: 0 }, 3);
    expect(straight.rotY).toBe(0);
    const pulled = newVehicleBody(0, 0, 0);
    run(pulled, t, { throttle: 1, steer: 0 }, 3, { bedKg: 0, align: 2, punct: true });
    expect(pulled.rotY).toBeLessThan(-0.05); // pulls right
    const stalled = newVehicleBody(0, 0, 0);
    for (let i = 0; i < 60; i++) stepVehicle(stalled, t, { bedKg: 0, align: 0, punct: false }, { throttle: 1, steer: 0 }, 1 / 60, null, true);
    expect(stalled.v).toBe(0);
    const walled = newVehicleBody(0, 0, 0);
    walled.v = 5;
    const moved = stepVehicle(walled, t, { bedKg: 0, align: 0, punct: false }, { throttle: 1, steer: 0 }, 1 / 60, { resolve: (_fx, _fz, x, z) => ({ x, z }), blocked: () => true });
    expect(moved).toBe(0);
    expect(walled.v).toBe(0);
  });
});

describe('dash and on-foot targets (98, F.7)', () => {
  it('speed, fuel, the cosmetic water temperature and the tip hint', () => {
    const row = vehicle({ fuelL: 5, bedKg: 100 });
    const d = dashValues(row, 10, 0, true);
    expect(d).toMatchObject({ kmh: 36, fuel: 0.25, tempC: 20, tipHint: null, manual: false, capKg: 800 });
    expect(dashValues(row, 0.2, 30_000, true)).toMatchObject({ tempC: 90, tipHint: 'Space: billentés' });
    expect(dashValues(row, 0.2, 30_000, false).tipHint).toBeNull();
    expect(dashValues(vehicle({ type: 0 }), 0, 60_000, true)).toMatchObject({ fuel: null, tempC: 20, manual: true });
  });
  it('enter: free seat, stopped, within r + 1.5 m; seat 0 first', () => {
    const r = vehicle(); // Lada at (4, −10), r 0.8
    expect(nearestEnterable([r], 4, -7.8)).toEqual({ id: 1, seat: 0 });
    expect(nearestEnterable([r], 4, -7.6)).toBeNull();
    expect(nearestEnterable([{ ...r, seats: [5, 0] }], 4, -8)).toEqual({ id: 1, seat: 1 });
    expect(nearestEnterable([{ ...r, seats: [5, 6] }], 4, -8)).toBeNull();
    expect(nearestEnterable([{ ...r, v: 1 }], 4, -8)).toBeNull();
  });
  it('bed point, filler neck and repair targets', () => {
    const r = vehicle();
    const t = type(3);
    const bed = bedPoint(t, r);
    expect(bed.x).toBeCloseTo(4 - 2.35, 6); // heading +x: the rear is −x
    expect(nearestBed([r], bed.x - 1.4, bed.z)).toBe(1);
    expect(nearestBed([r], bed.x - 1.6, bed.z)).toBeNull();
    const neck = fillerNeck(t, r);
    expect(nearestFiller([r], neck.x, neck.z)).toBe(1);
    expect(nearestFiller([{ ...r, type: 0 }], neck.x, neck.z)).toBeNull();
    expect(nearestRepairable([r], 4, -8)).toBeNull();
    expect(nearestRepairable([{ ...r, punct: true }], 4, -8)).toBe(1);
    expect(nearestRepairable([{ ...r, align: 1, v: 2 }], 4, -8)).toBeNull();
    expect(REPAIR_PROMPT).toBe('Kerékcsere (R) – 3 000 Ft');
  });
  it('E order: bag pickup → bed load → refuel → enter → crane console', () => {
    const base = { jam: null, broom: false, bag: null, craneD: 1, officeD: Infinity, kiosk: false };
    expect(chooseInteraction({ ...base, bag: { id: 3, d: 1 }, load: 1, enter: { id: 1, seat: 0 } })).toEqual({ kind: 'pickup', id: 3 });
    expect(chooseInteraction({ ...base, load: 1, refuel: 2, enter: { id: 1, seat: 0 } })).toEqual({ kind: 'load', id: 1 });
    expect(chooseInteraction({ ...base, refuel: 2, enter: { id: 1, seat: 0 } })).toEqual({ kind: 'refuel', id: 2 });
    expect(chooseInteraction({ ...base, enter: { id: 1, seat: 1 } })).toEqual({ kind: 'enter', id: 1, seat: 1 });
    expect(chooseInteraction(base)).toEqual({ kind: 'crane' });
    // review M2: with a jerry can in hand a nearby bag is not offered (handsFull), the filler is
    expect(chooseInteraction({ ...base, bag: { id: 3, d: 1 }, refuel: 2, can: true })).toEqual({ kind: 'refuel', id: 2 });
    expect(chooseInteraction({ ...base, bag: { id: 3, d: 1 }, can: true })).toEqual({ kind: 'crane' });
  });
});

describe('receipt, shop and garage (F.7)', () => {
  const weighed = parseScaleWeighed({ scale: 0, by: 3, kgDg: 12_000, lines: [[3, 0, 12_000, 90, 10_800]], dirtyFt: 0, total: 10_800, team: 8640, each: 2160, to: [3], epoch: 1, veh: { id: 1, type: 2, tareKg: 140 } });
  it('a vehicle weighing: gross / tare / net, the LED shows the gross', () => {
    if (!weighed) throw new Error('weighed');
    expect(weighed.veh).toEqual({ id: 1, type: 2, tareKg: 140 });
    expect(ledKgDg(weighed)).toBe(26_000);
    expect(receiptLines(weighed, null).slice(0, 5)).toEqual(['BÉLA BÁ MÉH TELEP', 'Hídmérleg', 'Bruttó: 260,00 kg', 'Tára (Simson Háromkerekű Riksa): 140,00 kg', 'Nettó: 120,00 kg']);
    const plain = parseScaleWeighed({ ...weighed, lines: [], veh: { id: 0, type: 2, tareKg: 1 } });
    expect(plain?.veh).toBeUndefined();
    expect(plain && ledKgDg(plain)).toBe(12_000);
  });
  it('the team shop: vehicles once per room, jerry cans with free hands', () => {
    const offers = teamOffers({ funds: 100_000, bp: 0, dieselL: 60, unlocked: [], vehicles: [0], jerry: 0 });
    expect(offers.find((o) => o.key === 'vehicle.0')).toMatchObject({ price: null, blocked: 'Megvan', buy: null });
    expect(offers.find((o) => o.key === 'vehicle.2')).toMatchObject({ price: 85_000, blocked: null, buy: { item: 'vehicle', tier: 2 }, toastName: 'Simson Háromkerekű Riksa' });
    expect(offers.find((o) => o.key === 'vehicle.3')?.blocked).toBe('Nincs elég pénz a csapatkasszában');
    expect(offers.find((o) => o.key === 'jerrycan.1')).toMatchObject({ price: 4000, blocked: null, buy: { item: 'jerrycan', tier: 1 } });
    expect(teamOffers({ funds: 100_000, bp: 0, dieselL: 60, unlocked: [], vehicles: [], jerry: 1 }).find((o) => o.key === 'jerrycan.0')?.blocked).toBe('Tele a kezed');
    expect(teamOffers({ funds: 0, bp: 0, dieselL: 60, unlocked: [] }).some((o) => o.key.startsWith('vehicle.'))).toBe(false);
  });
  it('the garage pad: placeable on flat ground, 6 per room', () => {
    const init = realInit();
    const col = new WorldCollision(init.layout);
    col.setUnlocked(init.unlockedDistricts);
    const world = (structures: StructRow[]): PlacementWorld => ({
      layout: init.layout, ground: (x, z) => col.terrain(x, z), isLocked: (x, z) => col.isLocked(x, z),
      structures, groundBags: [], players: [], pose: { x: 0, z: 30 }
    });
    const garage = { type: 18, x: 0, z: 30, rot: 0, lvl: 0 };
    expect(checkPlacement(world([]), garage)).toMatchObject({ ok: true });
    const six = Array.from({ length: 6 }, (_, i): StructRow => ({ id: i + 1, type: 18, x: -100 + i * 6, z: 100, baseY: 0, rot: 0, lvl: 0, jammed: false, busy: false, smoking: false, grease: 0 }));
    expect(checkPlacement(world(six), garage)).toEqual({ ok: false, reason: 'buildLimit', what: 'garázs' });
  });
  it('the vehicles add 9 main-pass draws', () => {
    expect(PHASE_F_DRAW_CALLS).toBe(9);
    expect(DEFAULT_PERSONAL.jerry).toBe(0);
  });
});

describe('VehicleRenderer geometry (review M1)', () => {
  it('beds and wheels carry white vertex colours for the vertex-coloured lit material', () => {
    const r = new VehicleRenderer();
    for (const mesh of [r.beds, r.wheels]) {
      const color = mesh.geometry.getAttribute('color');
      expect(color).toBeDefined();
      expect([color.getX(0), color.getY(0), color.getZ(0)]).toEqual([1, 1, 1]);
    }
    r.dispose();
  });
});
