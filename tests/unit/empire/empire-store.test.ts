/**
 * Port of tests/legacy/empire-store.legacy.mjs (14 test() cases).
 * Same 14 test names; assertions mapped 1:1 (node:assert equal/deepEqual/ok -> expect).
 */
import { describe, it, expect } from 'vitest';
import {
  createStore, applySnapshot, applyTick, advance, saveGroup, selectGroup, groupSummary, groupCenter, purgeGroups,
  pickAt, boxSelect, isTileVisible, playerColor, NEUTRAL_COLOR, addChat, spyReportFor, cueAsszonyVoice, upgradeTargetAt
} from '../../../src/features/games/empire/lib/empireStore';
import { normalizeContent, nextUpgradeDef, levelPopCap } from '../../../src/features/games/empire/lib/empireContent';
import { clampCamera, centerOnWorld, stepCameraGoal, panDelta, createCamera, MAX_DIST, EDGE_INSET } from '../../../src/features/games/empire/lib/empireMath';
import { isEmpireSnapshot } from '../../../src/features/games/empire/types';
import type { PickView, SfxCue } from '../../../src/features/games/empire/types';

/** The value, or a thrown error naming what was missing. */
function must<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) throw new Error(`missing ${what}`);
  return value;
}

describe('MiskolcEmpire store, camera and upgrade logic', () => {
  const content = normalizeContent({
    epochs: [{ id: 1, name: 'Telepi Kezdet' }, { id: 2, name: 'Vasgyári Virágkor' }],
    units: { scavenger: { hp: 40, sight: 7 }, infiltrator: { hp: 60, sight: 9 }, knife: { hp: 70, sight: 7 } },
    buildings: { townCenter: { size: 3, hp: 1500, sight: 10 }, scrapYard: { size: 2, hp: 600, sight: 6 }, house: { size: 2, hp: 300, sight: 5, popCap: 8, upgrades: [{ cost: { wood: 70 }, buildTime: 15, popCap: 12, hp: 400 }] } },
    demolish: { maxRefund: 0.5, minRefund: 0.35, holdMs: 1500 }
  });

  function fresh(spectator = false) {
    const s = createStore();
    s.content = content;
    // like the socket handler, the raw payload goes through the snapshot guard first
    const snap: unknown = {
      roomId: 'r1', status: 'playing', tick: 10, you: { idx: 0, team: 0, spectator },
      players: [{ idx: 0, name: 'Bence', team: 0, color: '#e74c3c', epoch: 1 }, { idx: 1, name: 'Gép 2', team: 1, color: '#3498db', epoch: 2, isAi: true }],
      map: { w: 20, h: 20, tiles: 'g'.repeat(400) },
      nodes: [{ i: 900, k: 'iron', x: 10, y: 10, a: 2000 }],
      units: [
        { i: 1, o: 0, k: 'scavenger', x: 3, y: 3, tx: 3, ty: 3, v: 0, hp: 40, st: 'idle' },
        { i: 2, o: 0, k: 'infiltrator', x: 4, y: 3, tx: 4, ty: 3, v: 0, hp: 60, st: 'idle' },
        { i: 3, o: 1, k: 'knife', x: 18, y: 18, tx: 18, ty: 18, v: 0, hp: 70, st: 'idle' }
      ],
      buildings: [
        { i: 10, o: 0, k: 'townCenter', x: 1, y: 1, hp: 1500, bp: 100 },
        { i: 11, o: 1, k: 'scrapYard', x: 15, y: 15, hp: 600, bp: 100 }
      ],
      res: { iron: 100, copper: 0, food: 50, wood: 0, pop: 2, popCap: 15, epoch: 1, research: null },
      spy: []
    };
    if (!isEmpireSnapshot(snap)) throw new Error('fixture is not a snapshot');
    applySnapshot(s, snap);
    return s;
  }


  it('snapshot: fog hides far enemy, spectator sees all', () => {
    const s = fresh();
    expect(isTileVisible(s, 3, 3)).toBe(true);
    expect(isTileVisible(s, 18, 18)).toBe(false);
    const sp = fresh(true);
    expect(sp.spectator).toBe(true);
    expect(isTileVisible(sp, 18, 18)).toBe(true);
    expect(must(sp.explored).every((v) => v === 1)).toBeTruthy();
  });

  it('tick: spy report array replaces, empty array clears', () => {
    const s = fresh();
    const rep = { unitId: 2, victim: 1, name: 'Gép 2', color: '#3498db', res: { iron: 120, copper: 30, food: 80, wood: 10 }, epoch: 2, research: { epoch: 3, pct: 40 }, military: 5 };
    expect(applyTick(s, { t: 11, spy: [rep] })).toBe('ok');
    expect(spyReportFor(s, 2)).toEqual(rep);
    applyTick(s, { t: 12 });
    expect(spyReportFor(s, 2), 'a tick without spy keeps the last report').toBeTruthy();
    applyTick(s, { t: 13, spy: [] });
    expect(spyReportFor(s, 2)).toBe(null);
  });

  it('tick: sv summary and you.spectator switch', () => {
    const s = fresh();
    const sv = { elapsed: 125, players: [{ idx: 0, name: 'Bence', alive: false, army: 0, workers: 0, buildings: 0, epoch: 1 }] };
    applyTick(s, { t: 11, sv, you: { idx: 0, team: 0, spectator: true } });
    expect(s.sv?.elapsed).toBe(125);
    expect(s.spectator).toBe(true);
  });

  it('defeat event: stats stored, spectator on, fog lifted, selection cleared', () => {
    const s = fresh();
    s.selection.add(1);
    s.ui.placing = 'scrapYard';
    const stats = { unitsLost: 7, unitsKilled: 3, buildingsDestroyed: 1, gathered: 900, damageDealt: 412 };
    applyTick(s, { t: 11, ev: [{ e: 'defeat', stats }] });
    expect(s.defeat?.stats).toEqual(stats);
    expect(s.spectator).toBe(true);
    expect(s.selection.size).toBe(0);
    expect(s.ui.placing).toBe(null);
    expect(isTileVisible(s, 19, 19)).toBe(true);
  });

  it('demolish event then dead: one collapse with owner and footprint, one sound', () => {
    const s = fresh();
    applyTick(s, { t: 11, ev: [{ e: 'demolish', i: 10, k: 'townCenter', x: 1, y: 1, size: 3 }, { e: 'dead', i: 10, x: 2.5, y: 2.5 }] });
    expect(s.buildings.has(10)).toBe(false);
    expect(s.collapses.length).toBe(1);
    const c = must(s.collapses[0], 'collapse');
    expect(c.o).toBe(0);
      expect(c.x).toBe(1);
      expect(c.y).toBe(1);
      expect(c.size).toBe(3);
      expect(c.demolish).toBe(true);
    expect(s.sfx.length).toBe(1);
    expect(s.sfx[0]?.id).toBe('sfx_building_collapse');
    for (let i = 0; i < 6; i++) advance(s, 0.5);
    expect(s.collapses.length, 'collapse expires after its duration').toBe(0);
  });

  it('destroyed building (dead only) also collapses', () => {
    const s = fresh();
    applyTick(s, { t: 11, ev: [{ e: 'dead', i: 11, x: 16, y: 16 }] });
    expect(s.collapses.length).toBe(1);
    expect(s.collapses[0]?.demolish).toBe(false);
  });

  it('siphoned event raises an alert notice and ping', () => {
    const s = fresh();
    applyTick(s, { t: 11, ev: [{ e: 'siphoned', text: 'Valaki dézsmálja a készleteidet a MÉH telepnél!', x: 2, y: 2 }] });
    expect(s.notices.at(-1)?.kind).toBe('alert');
    expect(s.notices.at(-1)?.text).toMatch(/dézsmálja/);
    expect(s.pings.length).toBe(1);
  });

  it('disguise flip: unit becomes neutral civilian, grey colour', () => {
    const s = fresh();
    applyTick(s, { t: 11, u: [{ i: 50, o: -1, k: 'civilian', x: 5, y: 5, tx: 5, ty: 5, v: 0, hp: 60, st: 'idle' }] });
    expect(playerColor(s, must(s.units.get(50)).o)).toBe(NEUTRAL_COLOR);
    applyTick(s, { t: 12, u: [{ i: 50, o: 1, k: 'infiltrator', x: 5, y: 5, tx: 5, ty: 5, v: 0, hp: 60, st: 'idle' }] });
    expect(s.units.get(50)?.k).toBe('infiltrator');
    expect(s.units.get(50)?.o).toBe(1);
  });

  it('control groups: save own only, select living, purge dead, empty group clears', () => {
    const s = fresh();
    s.selection.add(1); s.selection.add(2); s.selection.add(3); // 3 is an enemy
    expect(saveGroup(s, '1')).toBe(2);
    expect(s.groups['1']).toEqual([1, 2]);
    s.selection.clear();
    expect(selectGroup(s, '1')).toBe(2);
    const g = must(groupSummary(s, '1'), 'group summary');
    expect(g.count).toBe(2);
    expect(g.kinds.length).toBe(2);
    const c = must(groupCenter(s, '1', { x: 0, y: 0 }), 'group centre');
    expect(c.x).toBe(3.5);
      expect(c.y).toBe(3);
    applyTick(s, { t: 11, ev: [{ e: 'dead', i: 1, x: 3, y: 3 }] });
    expect(s.groups['1']).toEqual([2]);
    applyTick(s, { t: 12, x: [2] });
    expect(s.groups['1'], 'emptied group disappears').toBe(undefined);
    s.selection.clear();
    expect(saveGroup(s, '2')).toBe(0);
    expect(s.groups['2']).toBe(undefined);
    s.groups['3'] = [999];
    purgeGroups(s);
    expect(s.groups['3']).toBe(undefined);
  });

  it('picking with an injected top-down projector', () => {
    const s = fresh();
    const PX = 30; // px per tile, camera looking straight down
    const view: PickView = {
      project(wx, wy, h, out) { out.x = wx * PX; out.y = wy * PX; out.s = PX; out.ok = true; return out; },
      groundAt(sx, sy, h, out) { out.x = sx / PX; out.y = sy / PX; return out; }
    };
    expect(pickAt(s, view, 3 * PX, 3 * PX)?.e.i).toBe(1);
    expect(pickAt(s, view, 2 * PX, 2.2 * PX)?.e.i, 'town centre footprint').toBe(10);
    expect(pickAt(s, view, 10.5 * PX, 10.5 * PX), 'node on an unexplored tile is hidden').toBe(null);
    must(s.explored)[10 * 20 + 10] = 1;
    expect(pickAt(s, view, 10.5 * PX, 10.5 * PX)?.kind).toBe('node');
    expect(pickAt(s, view, 18 * PX, 18 * PX), 'enemy under fog is not pickable').toBe(null);
    expect(boxSelect(s, view, 0, 0, 5 * PX, 5 * PX).sort()).toEqual([1, 2]);
    expect(boxSelect(s, view, 0, 0, 2.5 * PX, 2.5 * PX), 'falls back to own buildings').toEqual([10]);
  });

  it('chat buffer keeps last 60 and bumps version', () => {
    const s = fresh();
    for (let i = 0; i < 70; i++) addChat(s, { from: '[Néző] Bence', idx: 0, text: `m${i}`, spectator: true, t: i });
    expect(s.chat.length).toBe(60);
    expect(s.chat[0]?.text).toBe('m10');
    expect(s.chatVersion).toBe(70);
  });

  it('Cigány asszony: clog sounds, deferred ricochet, voice cues only for own units', () => {
    const s = fresh();
    const ids = (q: readonly SfxCue[]): string[] => q.map((x) => x.id);
    applyTick(s, { t: 11, u: [{ i: 40, o: 0, k: 'ciganyAsszony', x: 5, y: 5, tx: 5, ty: 5, v: 0, hp: 150, st: 'idle' }, { i: 41, o: 1, k: 'ciganyAsszony', x: 8, y: 5, tx: 8, ty: 5, v: 0, hp: 150, st: 'idle' }] });
    expect(ids(s.sfx)).toEqual(['voice_asszony_trained']);
    s.sfx.length = 0;
    applyTick(s, { t: 12, ev: [
      { e: 'proj', a: 40, x: 5, y: 5, tx: 12, ty: 5, k: 'ciganyAsszony' },
      { e: 'proj', a: 40, x: 12, y: 5, tx: 14, ty: 5, k: 'ciganyAsszony', rb: 1 },
      { e: 'proj', a: 41, x: 8, y: 5, tx: 3, ty: 3, k: 'ciganyAsszony' }
    ] });
    expect(ids(s.sfx)).toEqual(['sfx_clog_throw', 'sfx_clog_hit', 'voice_asszony_attack', 'sfx_clog_ricochet', 'sfx_clog_throw', 'sfx_clog_hit']);
    const first = must(s.projectiles[0], 'clog'), bounce = must(s.projectiles[1], 'ricochet');
    expect(first.dur).toBe(0.5);
    expect(bounce.rb).toBe(true);
    expect(bounce.t0).toBe(first.t0 + first.dur);
    expect(Math.abs(must(s.sfx[3]?.delay, 'ricochet delay') - (first.dur + bounce.dur))).toBeLessThan(1e-9);
    advance(s, 0.3);
    expect(s.projectiles.length, 'deferred ricochet is not pruned before it starts').toBe(3);
    s.sfx.length = 0;
    cueAsszonyVoice(s, [41, 1]);
    expect(s.sfx.length).toBe(0);
    cueAsszonyVoice(s, [1, 40]);
    expect(ids(s.sfx)).toEqual(['voice_asszony_order']);
  });

  it('camera: clamp, smooth centring and yaw-relative pan', () => {
    const cam = createCamera();
    cam.dist = 999; cam.x = -50;
    clampCamera(cam, 88, 88, false);
    expect(cam.dist).toBe(MAX_DIST);
      expect(cam.x, 'target is pulled in from the edge by the zoom').toBe(MAX_DIST * EDGE_INSET);
    cam.dist = 20; cam.x = 500; cam.y = -500;
    clampCamera(cam, 88, 88, false);
    expect(cam.x).toBe(88 - 20 * EDGE_INSET);
      expect(cam.y).toBe(20 * EDGE_INSET);
    cam.dist = 999; cam.x = -50;
    clampCamera(cam, 88, 88, true);
    expect(cam.dist, 'spectator zooms further out').toBeGreaterThan(MAX_DIST);
    expect(cam.x, 'never scrolls past the map: a zoom wider than the map pins it to the centre').toBe(44);
    centerOnWorld(cam, 40, 40, true);
    for (let i = 0; i < 200; i++) stepCameraGoal(cam, 1 / 60);
    expect(cam.goal).toBe(null);
      expect(cam.x).toBe(40);
      expect(cam.y).toBe(40);
    cam.yaw = 0; // eye at +z looking towards -z: screen up = world -y
    const d = panDelta(cam, 0, -1, 1, { x: 0, y: 0 });
    expect(Math.abs(d.x) < 1e-9 && d.y === -1).toBeTruthy();
  });

  it('upgrade: dropping a house onto an own finished house targets it; level, max hp and progress merge', () => {
    const s = fresh();
    applyTick(s, { t: 11, b: [
      { i: 20, o: 0, k: 'house', x: 8, y: 2, hp: 300, mh: 300, bp: 100, lv: 1, up: -1 },
      { i: 21, o: 1, k: 'house', x: 12, y: 2, hp: 300, mh: 300, bp: 100, lv: 1, up: -1 },
      { i: 22, o: 0, k: 'house', x: 8, y: 6, hp: 30, mh: 300, bp: 10, lv: 1, up: -1 }
    ] });
    expect(upgradeTargetAt(s, 'house', 9, 3)?.i, 'overlapping own house').toBe(20);
    expect(upgradeTargetAt(s, 'house', 12, 2), 'enemy house is not a target').toBe(null);
    expect(upgradeTargetAt(s, 'house', 8, 6), 'unfinished house is not a target').toBe(null);
    expect(upgradeTargetAt(s, 'scrapYard', 8, 2), 'other kind / not upgradeable').toBe(null);
    expect(nextUpgradeDef(s.content, s.buildings.get(20))?.popCap).toBe(12);
    applyTick(s, { t: 12, b: [{ i: 20, up: 40 }] });
    expect(s.buildings.get(20)?.up).toBe(40);
    applyTick(s, { t: 13, b: [{ i: 20, lv: 2, mh: 400, hp: 400, up: -1 }] });
    const b = must(s.buildings.get(20), 'house');
    expect(b.lv).toBe(2);
      expect(b.mhp).toBe(400);
      expect(levelPopCap(s.content, 'house', 2)).toBe(12);
    expect(nextUpgradeDef(s.content, b), 'top level').toBe(null);
  });
});
