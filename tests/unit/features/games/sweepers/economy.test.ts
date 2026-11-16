// Phase E client logic (E.7): guards, LED encoding, receipt text, grid visuals, the E order, the scale ring,
// service points, blueprint lock (placement 5b + palette) and the machine cap.
import { describe, it, expect } from 'vitest';
import { STRUCT_TYPES, isJunction, isMachine } from '../../../../../src/features/games/sweepers/lib/logistics/tables';
import { pathPoint } from '../../../../../src/features/games/sweepers/lib/logistics/network';
import { checkPlacement, hasBlueprint, refusalText, type PlacementWorld } from '../../../../../src/features/games/sweepers/lib/logistics/placement';
import { chooseInteraction } from '../../../../../src/features/games/sweepers/lib/logistics/interact';
import { SWEEPERS_ERRORS } from '../../../../../src/features/games/sweepers/errors';
import { WorldCollision } from '../../../../../src/features/games/sweepers/lib/movement/WorldCollision';
import { LED_CELLS, SEVEN_SEG, coinToast, copperChip, gridLines, gridToast, gridVisual, inspectionToast, inspectorChip, ledCells, receiptLines, tickerText, weighedToast } from '../../../../../src/features/games/sweepers/lib/economy/format';
import { ScaleWatch, inZone, nearestGreasePoint, scaleAt, scaleZones, servicePoints } from '../../../../../src/features/games/sweepers/lib/economy/world';
import { effectiveQuota } from '../../../../../src/features/games/sweepers/lib/economy/tables';
import { paletteEntries } from '../../../../../src/features/games/sweepers/components/BuildPalette';
import { shopOffers, teamOffers } from '../../../../../src/features/games/sweepers/components/ShopPanel';
import { telemetryLines } from '../../../../../src/features/games/sweepers/components/LogisticsPanel';
import { DEFAULT_PERSONAL, parseBuyAck, parsePersonalState } from '../../../../../src/features/games/sweepers/debrisTypes';
import {
  parseEconomyInit,
  parseEconomyUpdate,
  parseGeneratorAck,
  parseGreaseAck,
  parseInspection,
  parseScaleWeighed,
  type GridRow,
  type LmeRow,
  type ScaleWeighed
} from '../../../../../src/features/games/sweepers/economyTypes';
import type { StructRow } from '../../../../../src/features/games/sweepers/logisticsTypes';
import { realInit } from './fixtures';

const NB = '\u00a0'; // hu-HU groups 5+ digit numbers with a no-break space (4 digits stay ungrouped)
const row = (id: number, type: number, x: number, z: number, rot = 0, flags: Partial<StructRow> = {}): StructRow =>
  ({ id, type, x, z, baseY: 0, rot, lvl: 0, jammed: false, busy: false, smoking: false, grease: 0, ...flags });
const grid = (st: 0 | 1 | 2, over: Partial<GridRow> = {}): GridRow =>
  ({ st, pf: [1, 0.4, 0][st] ?? 1, solarW: 12_000, genW: 0, demandW: 3_000, battWh: 75_000, dieselL: 20, genOn: false, ...over });
const lme: LmeRow = { epoch: 7, pct: [5, -10, 15], until: 0, msg: 'LME TŐZSDEREPÜLÉS: Megugrott a vörösréz iránti kereslet! Ár: +15%!' };

describe('E guards', () => {
  const wireGrid = { st: 1, pf: 0.4, solarW: 0, genW: 25_000, demandW: 40_000, battWh: 1000, dieselDl: 195, genOn: true };
  const wireLme = { epoch: 3, pct: [0, -25, 25], until: 2_700_000, msg: 'LME: nyugodt piac.' };
  const wireInsp = { at: 1_800_000, kg: [0, 10, 0, 0, 0, 0], quota: [0, 500, 375, 625, 300, 250] };
  it('init_state.economy and miskolc:economy (absent = unchanged; coins)', () => {
    expect(parseEconomyInit({ funds: -500, bp: 5, grid: wireGrid, lme: wireLme, insp: wireInsp })).toEqual({
      funds: -500, bp: 5, grid: { ...wireGrid, dieselL: 19.5, dieselDl: undefined }, lme: wireLme, insp: wireInsp
    });
    expect(parseEconomyInit({ funds: 0, bp: 16, grid: wireGrid, lme: wireLme, insp: wireInsp })).toBeNull();
    expect(parseEconomyInit(undefined)).toBeNull();
    expect(parseEconomyUpdate({ t: 5, funds: 10, coins: [[4, 50], [4, 'x'], [-1, 100]] })).toEqual({ t: 5, funds: 10, coins: [{ node: 4, ft: 50 }] });
    expect(parseEconomyUpdate({ t: 5, grid: { ...wireGrid, st: 3 } })).toEqual({ t: 5, coins: [] });
    expect(parseEconomyUpdate({ funds: 1 })).toBeNull();
  });
  it('scale_weighed, inspection and the E.4 acks', () => {
    const w = { scale: 1, by: 2, kgDg: 7000, lines: [[4, 2, 2000, 3100, 62000], [9, 0, 1, 1, 1]], dirtyFt: -15, total: 61985, team: 49589, each: 12396, to: [2], epoch: 4 };
    expect(parseScaleWeighed(w)).toMatchObject({ scale: 1, by: 2, lines: [{ mat: 4, proc: 2, kgDg: 2000, ftPerKg: 3100, ft: 62000 }], dirtyFt: -15, to: [2] });
    expect(parseScaleWeighed({ ...w, scale: 2 })).toBeNull();
    expect(parseScaleWeighed({ ...w, dirtyFt: 5 })).toBeNull();
    expect(parseInspection({ results: [[1, 2000, 340, 25000], [7, 0, 0, 0]], fine: 25000, funds: -1000 })).toEqual({ results: [{ district: 1, quotaKg: 2000, kg: 340, fineFt: 25000 }], fine: 25000, funds: -1000 });
    expect(parseGreaseAck({ ok: true, mask: 7, done: false })).toEqual({ ok: true, mask: 7, done: false });
    expect(parseGreaseAck({ ok: true, mask: 16, done: false })).toMatchObject({ ok: false });
    expect(parseGeneratorAck({ ok: false, error: 'x', code: 'SWEEPERS_REFUSED' })).toEqual({ ok: false, error: 'x', code: 'SWEEPERS_REFUSED' });
    expect(parseBuyAck({ ok: true, cash: 1, teamFunds: 2 })).toEqual({ ok: true, cash: 1, teamFunds: 2 });
    expect(parseBuyAck({ ok: true, cash: 1 })).toEqual({ ok: true, cash: 1 });
    expect(parsePersonalState({ cash: 1, greaseGun: true })?.greaseGun).toBe(true);
    expect(parsePersonalState({ cash: 1 })?.greaseGun).toBe(false);
  });
});

describe('E.7 displays', () => {
  it('LED: kg with one decimal in 6 seven-segment cells, blanks in front, capped', () => {
    const cells = ledCells(123_456); // 1 234,56 kg → 1234.6
    expect(cells).toHaveLength(LED_CELLS);
    expect(cells.map((c) => c.mask)).toEqual([0, SEVEN_SEG[1], SEVEN_SEG[2], SEVEN_SEG[3], SEVEN_SEG[4], SEVEN_SEG[6]]);
    expect(cells.map((c) => c.dp)).toEqual([false, false, false, false, true, false]);
    expect(ledCells(0).map((c) => c.mask)).toEqual([0, 0, 0, 0, SEVEN_SEG[0], SEVEN_SEG[0]]);
    expect(ledCells(1e12).map((c) => c.mask)).toEqual(Array(6).fill(SEVEN_SEG[9]));
    expect(SEVEN_SEG[8]).toBe(0x7f);
  });
  it('receipt: lines, contamination, LME of the sale epoch, Hungarian grouping', () => {
    const w: ScaleWeighed = {
      scale: 1, by: 1, kgDg: 7550, epoch: 7, to: [1, 2],
      lines: [{ mat: 3, proc: 1, kgDg: 5000, ftPerKg: 117, ft: 5850 }, { mat: 4, proc: 2, kgDg: 2000, ftPerKg: 3565, ft: 71300 }, { mat: 7, proc: 0, kgDg: 4000, ftPerKg: 150_000, ft: 150_000 }],
      dirtyFt: -1234, total: 225_916, team: 180_734, each: 22_591
    };
    expect(receiptLines(w, lme)).toEqual([
      'BÉLA BÁ MÉH TELEP',
      'Darus mérlegplató',
      'Nettó: 75,50 kg',
      `Ócskavas (bála) · 50,00 kg × 117 Ft = 5850 Ft`,
      `Vörösréz (köteg) · 20,00 kg × 3565 Ft = 71${NB}300 Ft`,
      `Bronz Lenin-fej · 1 db × 150${NB}000 Ft = 150${NB}000 Ft`,
      `Szennyezettség −15 % · −1234 Ft`,
      'LME: alumínium +5 % · ócskavas −10 % · vörösréz +15 %',
      `Összesen: 225${NB}916 Ft`,
      `Csapatkassza 80 %: 180${NB}734 Ft`,
      `Bér fejenként: 22${NB}591 Ft (2 fő)`
    ]);
    expect(receiptLines({ ...w, epoch: 8, dirtyFt: 0 }, lme)).not.toContain('LME: alumínium +5 % · ócskavas −10 % · vörösréz +15 %');
    expect(weighedToast(w)).toBe(`Mérlegelve: 75,50 kg – 225${NB}916 Ft (csapat 180${NB}734 Ft, fejenként 22${NB}591 Ft)`);
  });
  it('grid: belt speed, flicker and floodlights per state; transition toasts; panel lines', () => {
    expect(gridVisual(grid(0))).toEqual({ state: 'ok', beltSpeed: 1, flicker: false, floodlights: true });
    expect(gridVisual(grid(1))).toEqual({ state: 'brownout', beltSpeed: 0.4, flicker: true, floodlights: true });
    expect(gridVisual(grid(2))).toEqual({ state: 'blackout', beltSpeed: 0, flicker: false, floodlights: false });
    expect(gridToast(grid(0), grid(2))).toBe('Áramszünet!');
    expect(gridToast(grid(0), grid(1))).toBe('Feszültségesés – lassulnak a gépek.');
    expect(gridToast(grid(1), grid(1))).toBeNull();
    expect(gridToast(grid(2), grid(0))).toBeNull();
    expect(gridLines(grid(1, { genOn: true, genW: 25_000, dieselL: 19.5 }))).toEqual([
      'Állapot: Feszültségesés', 'Napelem: 12 kW', 'Generátor: jár, 25 kW · gázolaj 19,5 / 60 L', 'Akkumulátor: 75 / 150 kWh', 'Fogyasztás: 3 kW'
    ]);
    expect(telemetryLines({ kgMin: 1, loadPct: 2, kW: 3, ftHour: 4, beltM: 5, jams: 0 }, true)[2]).toBe('Fogyasztás: 3 kW');
  });
  it('LME ticker / chip, inspector chip, toasts', () => {
    expect(copperChip(lme)).toBe('Réz +15 %');
    expect(tickerText(lme)).toContain('VÖRÖSRÉZ +15 %');
    expect(tickerText(lme)).toContain('ALUMÍNIUM +5 %');
    const insp = { at: 125_000, kg: [0, 340, 900, 0, 0, 0], quota: [0, 2000, 1500, 2500, 0, 0] };
    const all = new Set([0, 1, 2, 3, 4, 5]);
    expect(inspectorChip(insp, 0, all)).toBe(`Ellenőr: 2:05 · Vasgyár 0/2500 kg`);
    expect(inspectorChip(insp, 0, new Set([0, 1, 2]))).toBe(`Ellenőr: 2:05 · Avas 340/2000 kg`);
    expect(inspectorChip(insp, 0, new Set([0]))).toBe('Ellenőr: 2:05');
    expect(inspectorChip({ ...insp, quota: [0, 0, 0, 0, 0, 0] }, 200_000, all)).toBe('Ellenőr: 0:00');
    expect(effectiveQuota(1, 2)).toBe(1000);
    expect(effectiveQuota(3, 9)).toBe(2500);
    expect(inspectionToast(50_000)).toBe(`Városházi ellenőr: 50${NB}000 Ft bírság!`);
    expect(inspectionToast(0)).toBe('Az ellenőr elégedett.');
    expect(coinToast(200)).toBe('Pénzérme a rostából: 200 Ft');
  });
});

describe('E.2 client copies', () => {
  it('scales: the weighbridge OBB and the crane pad; the 2 s ring re-arms only after moving or leaving', () => {
    const zones = scaleZones({ x: 15, z: 0, w: 12, d: 3.5, rotY: Math.PI / 2 });
    expect(inZone(zones[0], 15, 5.9)).toBe(true); // rotated: 12 m along z
    expect(inZone(zones[0], 17, 0)).toBe(false);
    expect(scaleAt(zones, -8.5 + 1.4, 1.4)).toBe(1);
    expect(scaleAt(zones, 0, 0)).toBeNull();
    const w = new ScaleWatch();
    expect(w.update(0, 15, 0, 0, true)).toBe(0);
    expect(w.update(0, 15.1, 0, 1000, true)).toBe(0.5);
    expect(w.update(0, 15.1, 0, 2500, true)).toBe(1);
    w.weighed();
    expect(w.update(0, 15.1, 0, 5000, true)).toBeNull();
    expect(w.update(0, 15.5, 0, 5100, true)).toBe(0); // moved > 0.15 m: re-armed
    expect(w.update(0, 15.5, 0, 6100, false)).toBeNull(); // nothing to weigh
    expect(w.update(null, 0, 0, 7000, true)).toBeNull();
  });
  it('service points are the footprint corners; only ungreased points of smoking stripper/baler count', () => {
    expect(servicePoints(row(1, 17, 10, 10, 1))).toEqual([{ x: 12, z: 9 }, { x: 12, z: 11 }, { x: 8, z: 9 }, { x: 8, z: 11 }]);
    const smoking = row(1, 15, 0, 0, 0, { smoking: true, grease: 0b0001 });
    expect(nearestGreasePoint([smoking], -1, -1)).toBeNull(); // point 0 already greased
    expect(nearestGreasePoint([smoking], 1.5, -1)).toEqual({ id: 1, point: 1, d: 0.5 });
    expect(nearestGreasePoint([{ ...smoking, smoking: false }], 1.5, -1)).toBeNull();
    expect(nearestGreasePoint([row(2, 16, 0, 0, 0, { smoking: true })], 1, 1)).toBeNull(); // magnet does not wear
  });
  it('E order: jam → grease → bag → crane → generator → office → kiosk', () => {
    const base = { jam: null, broom: true, bag: null, craneD: Infinity, officeD: Infinity, kiosk: false, grease: null, generatorD: Infinity };
    const all = { ...base, jam: { id: 1, d: 1 }, grease: { id: 2, point: 3 }, bag: { id: 3, d: 1 }, craneD: 1, generatorD: 1, officeD: 1, kiosk: true };
    expect(chooseInteraction(all)).toEqual({ kind: 'clearJam', id: 1 });
    expect(chooseInteraction({ ...all, jam: null })).toEqual({ kind: 'grease', id: 2, point: 3 });
    expect(chooseInteraction({ ...all, jam: null, grease: null })).toEqual({ kind: 'pickup', id: 3 });
    expect(chooseInteraction({ ...all, jam: null, grease: null, bag: null })).toEqual({ kind: 'crane' });
    expect(chooseInteraction({ ...all, jam: null, grease: null, bag: null, craneD: 9 })).toEqual({ kind: 'generator' });
    expect(chooseInteraction({ ...all, jam: null, grease: null, bag: null, craneD: 9, generatorD: 3.1 })).toEqual({ kind: 'office' });
    expect(chooseInteraction({ ...base, kiosk: true })).toEqual({ kind: 'kiosk' });
  });
  it('machines: jammable, sorters route straight / side through the centre', () => {
    expect(STRUCT_TYPES.filter((_, i) => isMachine(i)).map((t) => t.key)).toEqual(['stripper', 'baler', 'magnet', 'trommel']);
    expect([14, 15, 16, 17].every(isJunction)).toBe(true);
    const trommel = row(1, 17, 0, 0);
    expect(pathPoint(trommel, 0)).toMatchObject({ x: 0, z: 2 });
    expect(pathPoint(trommel, 4, 0)).toMatchObject({ x: 0, z: -2 });
    expect(pathPoint(trommel, 4, 1)).toMatchObject({ x: 1, z: 0 });
    expect(pathPoint(trommel, 2, 1)).toMatchObject({ x: 0, z: 0 });
  });
});

describe('blueprints and the machine cap (E.2 rule 5b)', () => {
  const init = realInit();
  const col = new WorldCollision(init.layout);
  col.setUnlocked(init.unlockedDistricts);
  const world = (over: Partial<PlacementWorld> = {}): PlacementWorld => ({
    layout: init.layout, ground: (x, z) => col.terrain(x, z), isLocked: (x, z) => col.isLocked(x, z),
    structures: [], groundBags: [], players: [], pose: { x: 0, z: 30 }, ...over
  });
  const stripper = { type: 14, x: 0, z: 30, rot: 0, lvl: 0 };
  it('a machine needs its bit; the cap of 8 is checked first', () => {
    expect(hasBlueprint(0, 4)).toBe(true);
    expect(hasBlueprint(0b0100, 16)).toBe(true);
    expect(hasBlueprint(0b0100, 17)).toBe(false);
    const refused = checkPlacement(world(), stripper);
    expect(refused).toEqual({ ok: false, reason: 'noBlueprint' });
    expect(refusalText(refused, SWEEPERS_ERRORS)).toBe('Ehhez a géphez előbb meg kell venni a tervrajzot.');
    expect(checkPlacement(world({ bp: 1 }), stripper)).toEqual({ ok: true, baseY: 0 });
    const eight = Array.from({ length: 8 }, (_, i) => row(i + 1, 16, -100 + i * 3, 100));
    expect(checkPlacement(world({ structures: eight }), stripper)).toEqual({ ok: false, reason: 'buildLimit', what: 'gép' });
  });
  it('the palette greys locked machines with the blueprint price', () => {
    const entries = paletteEntries(0b0010);
    expect(entries.filter((e) => e.locked).map((e) => e.key)).toEqual(['stripper', 'magnet', 'trommel']);
    expect(entries[14]?.label).toBe(`Kábelnyúzó masina · tervrajz 40${NB}000 Ft`);
    expect(entries[15]).toEqual({ key: 'baler', label: 'Hidraulikus hulladékbálázó', locked: false });
  });
  it('shop: grease gun at the workbench, team items from the team funds', () => {
    expect(shopOffers(DEFAULT_PERSONAL).some((o) => o.key === 'grease')).toBe(false);
    expect(shopOffers({ ...DEFAULT_PERSONAL, cash: 4000 }, true).find((o) => o.key === 'grease')).toMatchObject({ price: 3500, blocked: null, buy: { item: 'grease' } });
    expect(shopOffers({ ...DEFAULT_PERSONAL, greaseGun: true }, true).find((o) => o.key === 'grease')).toMatchObject({ blocked: 'Megvan', buy: null });
    expect(shopOffers(DEFAULT_PERSONAL, true).filter((o) => o.section === 'bags')).toHaveLength(9); // tiers 0–2 only
    const team = teamOffers({ funds: 50_000, bp: 0b0001, dieselL: 59.5, unlocked: [0, 1] });
    expect(team.map((o) => [o.key, o.price, o.blocked])).toEqual([
      ['blueprint.0', null, 'Megvan'], ['blueprint.1', 60_000, 'Nincs elég pénz a csapatkasszában'], ['blueprint.2', 25_000, null], ['blueprint.3', 30_000, null],
      ['diesel', null, 'Tele'],
      ['license.1', null, 'Nyitva'], ['license.2', 45_000, null], ['license.3', 108_000, 'Nincs elég pénz a csapatkasszában'], ['license.4', 210_000, 'Nincs elég pénz a csapatkasszában'], ['license.5', 210_000, 'Nincs elég pénz a csapatkasszában']
    ]);
    expect(team[2]).toMatchObject({ buy: { item: 'blueprint', tier: 2 }, toast: 'Megvetted a tervrajzot: Mágneses dobosztályozó' });
    expect(team[6]?.buy).toEqual({ item: 'license', tier: 2 });
  });
});
