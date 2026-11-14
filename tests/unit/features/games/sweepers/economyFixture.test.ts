// The E tables, encodings and guards against the real backend output of Phase E (a byte-identical copy of
// .omc/handoffs/sweepers-e-economy-fixture.json; regenerate there with scripts/buildSweepersEconomyFixture.mjs).
import { describe, it, expect } from 'vitest';
import rawText from '../../../../fixtures/sweepers-e-economy-fixture.json?raw';
import { isRecord } from '../../../../../src/shared/lib/guards';
import { BAG_TIERS, ROOM_CAPS, STOCK_TIERS, STRUCT_TYPES, T_STRIPPER, isMachine, wearsOut } from '../../../../../src/features/games/sweepers/lib/logistics/tables';
import {
  BLUEPRINT_COST,
  DIESEL_CAN,
  FINE_FT,
  GREASE_GUN_COST,
  INSPECTOR_MS,
  LICENSE_COST,
  LME_EPOCH_MS,
  LME_HEADLINE_PCT,
  LME_SERIES,
  LME_STEPS,
  MAINT_KG,
  MATERIALS,
  POWER,
  PROC_NAMES,
  QUOTA_KG,
  SERVICE_REACH_M,
  WAGE_SHARE,
  WEIGH_STILL_M,
  WEIGH_STILL_MS,
  effectiveQuota
} from '../../../../../src/features/games/sweepers/lib/economy/tables';
import { GENERATOR_REACH_M } from '../../../../../src/features/games/sweepers/lib/logistics/interact';
import { scaleZones, servicePoints } from '../../../../../src/features/games/sweepers/lib/economy/world';
import { BUILD_LIMIT_WHAT } from '../../../../../src/features/games/sweepers/errors';
import { SWEEPERS_ERRORS } from '../../../../../src/features/games/sweepers/errors';
import { decodeCargoRow, decodeStructRow, parseLogisticsUpdate, parseStructureSpawned, type StructRow } from '../../../../../src/features/games/sweepers/logisticsTypes';
import {
  parseEconomyInit,
  parseEconomyUpdate,
  parseGeneratorAck,
  parseGreaseAck,
  parseGridRow,
  parseInspection,
  parseLmeRow,
  parseScaleWeighed,
  type ScaleWeighed
} from '../../../../../src/features/games/sweepers/economyTypes';
import { parseBuyAck, parsePersonalState } from '../../../../../src/features/games/sweepers/debrisTypes';
import { parseDistrictUnlocked } from '../../../../../src/features/games/sweepers/worldTypes';
import { gridVisual, inspectionToast, receiptLines } from '../../../../../src/features/games/sweepers/lib/economy/format';
import { nearestGreasePoint } from '../../../../../src/features/games/sweepers/lib/economy/world';
import { LogisticsStore } from '../../../../../src/features/games/sweepers/lib/logistics/LogisticsStore';
import { pathPoint } from '../../../../../src/features/games/sweepers/lib/logistics/network';
import { realInit } from './fixtures';

const RAW: unknown = JSON.parse(rawText);
const rec = (value: unknown, name: string): Readonly<Record<string, unknown>> => {
  if (!isRecord(value)) throw new Error(`fixture has no ${name}`);
  return value;
};
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const fixture = rec(RAW, 'root');
const tables = rec(fixture.tables, 'tables');

describe('Phase E backend fixture: tables (E.1)', () => {
  it('materials, proc codes, the wage share', () => {
    expect(arr(tables.materials).map((m, i) => {
      const r = rec(m, 'material');
      expect(r.mat).toBe(i);
      return { key: r.key, name: r.name, ftPerKg: r.ftPerKg, worth: r.worth, lme: r.lme };
    })).toEqual(MATERIALS);
    expect(tables.proc).toEqual(Object.fromEntries(['raw', 'bala', 'rez'].map((k, i) => [k, i])));
    expect(PROC_NAMES).toHaveLength(3);
    expect(tables.wageShare).toBe(WAGE_SHARE);
  });
  it('bag tiers 0–4 and the stock tiers', () => {
    expect(arr(tables.bagTiers).map((t, i) => {
      const r = rec(t, 'bagTier');
      expect(r.tier).toBe(i);
      return { key: r.key, name: r.name, l: r.l, kg: r.kg, cost: r.cost, rupture: r.rupture, carry: r.carry, r: r.r, h: r.h, color: r.colour, cap: r.stockCap };
    })).toEqual(BAG_TIERS);
    expect(tables.stockTiers).toBe(STOCK_TIERS);
  });
  it('machine types 14–17: size, ports, length, collider; blueprints, service points, wear', () => {
    const collider = (c: Readonly<Record<string, unknown>>): unknown => (c.kind === 'fixed' ? c.h : c.kind === 'none' ? null : c.kind);
    expect(arr(tables.machineTypes).map((t) => {
      const r = rec(t, 'machineType');
      return { index: r.index, key: r.key, name: r.name, family: r.family, w: r.w, d: r.d, lvlMin: r.lvlMin, lvlMax: r.lvlMax, ins: r.ins, outs: r.outs, len: r.len, collider: collider(rec(r.collider, 'collider')) };
    })).toEqual(STRUCT_TYPES.flatMap((t, index) => (isMachine(index) ? [{ index, key: t.key, name: t.name, family: t.family, w: t.w, d: t.d, lvlMin: t.lvlMin, lvlMax: t.lvlMax, ins: t.ins, outs: t.outs, len: t.len, collider: t.collider }] : [])));
    for (const m of arr(tables.machines)) {
      const r = rec(m, 'machine');
      const type = Number(r.type);
      expect(r.blueprintBit).toBe(type - T_STRIPPER);
      expect(r.blueprintFt).toBe(BLUEPRINT_COST[type - T_STRIPPER]);
      const pts = servicePoints({ id: 1, type, x: 0, z: 0, baseY: 0, rot: 0, lvl: 0, jammed: false, busy: false, smoking: false, grease: 0 });
      expect(pts.map((p) => [p.x, p.z])).toEqual(r.servicePoints);
    }
    expect(arr(tables.machines)).toHaveLength(4);
    expect(arr(tables.processors).flatMap((p) => {
      const r = rec(p, 'processor');
      return r.wears === true ? [r.type] : [];
    })).toEqual(STRUCT_TYPES.flatMap((_, i) => (wearsOut(i) ? [i] : [])));
    const maint = rec(tables.maintenance, 'maintenance');
    expect([maint.maintKg, maint.serviceReachM]).toEqual([MAINT_KG, SERVICE_REACH_M]);
  });
  it('flags, the machine cap and its name', () => {
    const flags = rec(tables.flags, 'flags');
    const bits = Number(flags.jam) | Number(flags.busy) | Number(flags.smoke) | (0b1001 << Number(flags.greaseShift));
    expect(decodeStructRow([1, 15, 0, 0, 0, 0, 0, bits])).toMatchObject({ jammed: true, busy: true, smoking: true, grease: 0b1001 });
    expect(tables.caps).toEqual({ machines: ROOM_CAPS.machines, name: BUILD_LIMIT_WHAT.machines });
  });
  it('power, generator, shop, inspector', () => {
    const power = rec(tables.power, 'power');
    expect({ solarPeakW: power.solarPeakW, generatorW: power.generatorW, dieselLph: power.dieselLPerHour, tankL: power.tankL, batteryWh: power.batteryWh, batteryMaxW: power.batteryMaxW, brownoutPf: power.brownoutPf }).toEqual(POWER);
    expect(rec(tables.generator, 'generator').reachM).toBe(GENERATOR_REACH_M);
    const lm = realInit().layout.landmarks.generator;
    expect({ x: lm.x, z: lm.z }).toEqual({ x: rec(tables.generator, 'generator').x, z: rec(tables.generator, 'generator').z });
    const shop = rec(tables.shop, 'shop');
    expect([shop.greaseGunFt, shop.dieselCanFt, shop.dieselCanL, shop.dieselFullL]).toEqual([GREASE_GUN_COST, DIESEL_CAN.cost, DIESEL_CAN.litres, DIESEL_CAN.fullL]);
    expect(arr(shop.license).map((l) => rec(l, 'license').ft)).toEqual(LICENSE_COST.slice(1));
    const insp = rec(tables.inspector, 'inspector');
    expect([insp.intervalMs, insp.quotaBaseKg, insp.fineFt]).toEqual([INSPECTOR_MS, QUOTA_KG, FINE_FT]);
    expect(effectiveQuota(1, Number(insp.fullPlayers))).toBe(QUOTA_KG[1]);
    expect(effectiveQuota(1, Number(insp.fullPlayers) - 1)).toBeLessThan(QUOTA_KG[1] ?? 0);
  });
  it('LME and the scales', () => {
    const lme = rec(tables.lme, 'lme');
    expect([lme.epochMs, lme.steps, lme.series, lme.headlinePct]).toEqual([LME_EPOCH_MS, LME_STEPS, LME_SERIES, LME_HEADLINE_PCT]);
    const scales = rec(tables.scales, 'scales');
    expect([scales.stillMs, scales.anchorM]).toEqual([WEIGH_STILL_MS, WEIGH_STILL_M]);
    const zones = scaleZones(realInit().layout.landmarks.weighbridge);
    expect(arr(scales.zones).map((z) => {
      const { scale: _scale, ...zone } = rec(z, 'zone');
      return zone;
    })).toEqual(zones.map((z) => ({ x: z.x, z: z.z, w: z.w, d: z.d, rotY: z.rotY })));
  });
});

const must = <T>(value: T | null): T => {
  if (value === null) throw new Error('fixture sample did not decode');
  return value;
};
const economy = rec(fixture.economy, 'economy');
const structures = rec(fixture.structures, 'structures');
const trace = rec(fixture.trace, 'trace');

describe('Phase E backend fixture: samples parse with nothing dropped (E.5)', () => {
  it('init_state.economy, the three grid states and their visuals', () => {
    const init = must(parseEconomyInit(rec(fixture.initState, 'initState').economy));
    expect(init).toMatchObject({ funds: 0, bp: 0, grid: { st: 0, dieselL: 20, battWh: 150_000 }, insp: { quota: [0, 500, 375, 625, 300, 250] } });
    const grid = rec(economy.grid, 'grid');
    expect(['ok', 'brownout', 'blackout'].map((k) => gridVisual(must(parseGridRow(grid[k]))).state)).toEqual(['ok', 'brownout', 'blackout']);
    expect(must(parseGridRow(grid.brownout)).pf).toBe(0.4);
  });
  it('LME rows: each headline kind, the 10-epoch series in order', () => {
    const lme = rec(economy.lme, 'lme');
    expect(must(parseLmeRow(lme.up)).msg).toMatch(/^LME TŐZSDEREPÜLÉS/);
    expect(must(parseLmeRow(lme.down)).msg).toMatch(/^LME ZUHANÁS/);
    expect(must(parseLmeRow(lme.calm)).msg).toBe('LME: nyugodt piac.');
    const series = arr(economy.lmeSeries).map((r) => must(parseLmeRow(r)));
    expect(series.map((r) => r.epoch)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const r of series) {
      expect(r.pct.every((p) => LME_STEPS.includes(p))).toBe(true);
      expect(r.until).toBe((r.epoch + 1) * LME_EPOCH_MS);
    }
  });
  it('every miskolc:economy update keeps each field it carries', () => {
    const updates = Object.values(rec(economy.updates, 'updates'));
    expect(updates.length).toBeGreaterThan(4);
    for (const raw of [...updates, ...arr(trace.economy)]) {
      const r = rec(raw, 'update');
      const u = must(parseEconomyUpdate(r));
      for (const key of ['funds', 'life', 'bp', 'grid', 'lme', 'insp'] as const) expect(u[key] !== undefined).toBe(r[key] !== undefined);
      expect(u.coins).toHaveLength(arr(r.coins).length);
    }
    expect(must(parseEconomyUpdate(rec(economy.updates, 'updates').coins)).coins).toEqual([{ node: 4, ft: 50 }]);
  });
  it('both scale_weighed samples: lines sum to the total; the receipts print', () => {
    const sw = rec(fixture.scaleWeighed, 'scaleWeighed');
    for (const key of ['pack', 'pad']) {
      const raw = rec(sw[key], key);
      const w: ScaleWeighed = must(parseScaleWeighed(raw));
      expect(w.lines).toHaveLength(arr(raw.lines).length);
      expect(w.lines.reduce((sum, l) => sum + l.ft, 0) + w.dirtyFt).toBe(w.total);
      expect(w.team + w.each * w.to.length).toBe(w.total);
      const lines = receiptLines(w, null);
      expect(lines).toHaveLength(3 + w.lines.length + (w.dirtyFt < 0 ? 1 : 0) + 3);
    }
    const pad = must(parseScaleWeighed(sw.pad));
    expect(pad.dirtyFt).toBeLessThan(0);
    expect(receiptLines(pad, null)).toContain('Vörösréz (köteg) · 20,00 kg × 3875 Ft = 77\u00a0500 Ft');
    expect(receiptLines(pad, null)).toContain('Szennyezettség −15 % · −515 Ft');
    expect(must(parseLogisticsUpdate(sw.padLogisticsUpdate)).del).toEqual([9003, 9001, 9002]);
    expect(parsePersonalState(sw.personalAfterPack)?.greaseGun).toBe(true);
  });
  it('inspection with fines', () => {
    const ev = must(parseInspection(fixture.inspection));
    expect(ev.results).toHaveLength(5);
    expect(ev.results.reduce((sum, r) => sum + r.fineFt, 0)).toBe(ev.fine);
    expect(inspectionToast(ev.fine)).toBe('Városházi ellenőr: 100\u00a0000 Ft bírság!');
  });
  it('machine StructRows: smoke and grease bits; the next grease point; pk fills', () => {
    const smoking = must(decodeStructRow(structures.smoking));
    expect(smoking).toMatchObject({ type: 14, busy: true, smoking: true, grease: 0 });
    const greased = must(decodeStructRow(structures.greased));
    expect(greased).toMatchObject({ smoking: true, grease: 0b11 });
    expect(must(decodeStructRow(structures.reset))).toMatchObject({ smoking: false, grease: 0, busy: true });
    // points 0 and 1 are done; standing at local (−1, +1) offers point 2
    expect(nearestGreasePoint([greased], greased.x - 1, greased.z + 1)).toMatchObject({ id: greased.id, point: 2 });
    expect(must(parseLogisticsUpdate(rec(structures, 'structures').greaseUpdate)).s).toEqual([greased]);
    expect(must(parseLogisticsUpdate({ t: 0, pk: structures.pk })).pk).toEqual([{ node: 3, kg: 50 }, { node: 3, kg: 60 }, { node: 3, kg: 10 }]);
  });
  it('the 48-tick machine trace: the client links the network the same way and mirrors every update', () => {
    const store = new LogisticsStore();
    store.applyInit(null, null, 0);
    const rows: StructRow[] = arr(structures.spawned).map((sp) => must(parseStructureSpawned(sp)).row);
    for (const r of rows) store.applySpawned(r);
    const ids = rec(structures.network, 'network');
    const link = (node: unknown, out: number): unknown => store.links.get(`${String(node)}:${out}`);
    expect(link(ids.feed, 0)).toEqual({ kind: 'node', node: ids.magnet, input: 0 });
    expect(link(ids.magnet, 1)).toEqual({ kind: 'node', node: ids.baler, input: 0 });
    expect(link(ids.magnet, 0)).toEqual({ kind: 'node', node: ids.trommel, input: 0 });
    expect(link(ids.trommel, 0)).toEqual({ kind: 'node', node: ids.stripper, input: 0 });
    expect(link(ids.trommel, 1)).toBeNull();
    expect(link(ids.stripper, 0)).toBeNull();
    // the side route ends at the side port
    const magnet = must(rows.find((r) => r.type === 16) ?? null);
    expect(pathPoint(magnet, 2, 1)).toMatchObject({ x: magnet.x + 1, z: magnet.z });
    const ticks = arr(trace.ticks);
    expect(ticks).toHaveLength(48);
    for (const t of ticks) for (const raw of arr(rec(t, 'tick').rows)) expect(decodeCargoRow(raw)).not.toBeNull();
    const routes = rec(trace.routes, 'routes');
    for (const t of ticks) for (const raw of arr(rec(t, 'tick').rows)) {
      const c = must(decodeCargoRow(raw));
      const r = routes[`${c.id}@${c.node}`];
      if (typeof r === 'number' && c.kind === 0) expect(c.route).toBe(r);
    }
    const tiers = new Set<number>();
    for (const raw of arr(trace.updates)) {
      const r = rec(raw, 'update');
      const u = must(parseLogisticsUpdate(r));
      expect(u.c).toHaveLength(arr(r.c).length);
      expect(u.b).toHaveLength(arr(r.b).length);
      expect(u.s).toHaveLength(arr(r.s).length);
      store.applyUpdate(u);
      for (const b of u.b) tiers.add(b.tier);
    }
    expect([...tiers].sort()).toEqual([3, 4]); // bála from the baler, köteg from the stripper
    expect([...store.bags.values()].map((b) => b.tint).sort()).toEqual([2, 2, 3]);
  });
  it('personal_update with the grease gun; the licence unlock event', () => {
    const events = rec(fixture.events, 'events');
    expect(parsePersonalState(events.personalUpdate)?.greaseGun).toBe(true);
    expect(arr(events.districtUnlockedByLicense).map((e) => parseDistrictUnlocked(e))).toEqual([{ district: 1, unlockedDistricts: [0, 1] }]);
  });
});

describe('Phase E backend fixture: acks and refusals (E.4)', () => {
  const acks = rec(fixture.acks, 'acks');
  const refusals = rec(fixture.refusals, 'refusals');
  it('buy, generator and grease acks', () => {
    for (const raw of Object.values(rec(acks.buy_upgrade, 'buy'))) {
      const r = rec(raw, 'ack');
      expect(parseBuyAck(r)).toEqual({ ok: true, cash: r.cash, teamFunds: r.teamFunds });
    }
    const gen = rec(acks.generator, 'generator');
    expect([parseGeneratorAck(gen.on), parseGeneratorAck(gen.off)]).toEqual([{ ok: true, on: true }, { ok: true, on: false }]);
    expect(arr(acks.grease).map(parseGreaseAck)).toEqual([1, 3, 7, 15].map((mask) => ({ ok: true, mask, done: mask === 15 })));
  });
  it('every refusal parses; texts with an E.8 / D.8 / C.8 key equal the client copy', () => {
    const byText = new Map<string, string>(Object.entries(SWEEPERS_ERRORS).map(([k, v]) => [k, v]));
    for (const [event, group] of Object.entries(refusals)) {
      for (const [key, raw] of Object.entries(rec(group, event))) {
        const r = rec(raw, key);
        const parsed = parseGeneratorAck(r);
        expect(parsed).toEqual({ ok: false, error: r.error, code: r.code });
        expect(['SWEEPERS_REFUSED', 'VALIDATION_ERROR']).toContain(r.code);
        const text = byText.get(key);
        if (text === undefined) continue;
        const pattern = new RegExp(`^${text.replace(/[.*+?^()|[\]\\]/g, '\\$&').replace(/\{(price|what)\}/g, '.+')}$`);
        expect(String(r.error)).toMatch(pattern);
      }
    }
    expect(rec(rec(refusals.place_structure, 'place').buildLimit, 'buildLimit').error).toBe(SWEEPERS_ERRORS.buildLimit.replace('{what}', BUILD_LIMIT_WHAT.machines));
  });
});
