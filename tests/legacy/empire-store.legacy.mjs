// node test_empire_store.mjs — pure MiskolcEmpire store logic (no DOM, no three.js)
import assert from 'node:assert';
import {
  createStore, applySnapshot, applyTick, advance, saveGroup, selectGroup, groupSummary, groupCenter, purgeGroups,
  pickAt, boxSelect, isTileVisible, playerColor, NEUTRAL_COLOR, addChat, spyReportFor, cueAsszonyVoice, upgradeTargetAt
} from '../../src/features/games/empire/lib/empireStore.ts';
import { normalizeContent, nextUpgradeDef, levelPopCap } from '../../src/features/games/empire/lib/empireContent.ts';
import { clampCamera, centerOnWorld, stepCameraGoal, panDelta, createCamera, MAX_DIST, EDGE_INSET } from '../../src/features/games/empire/lib/empireMath.ts';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };

const content = normalizeContent({
  epochs: [{ id: 1, name: 'Telepi Kezdet' }, { id: 2, name: 'Vasgyári Virágkor' }],
  units: { scavenger: { hp: 40, sight: 7 }, infiltrator: { hp: 60, sight: 9 }, knife: { hp: 70, sight: 7 } },
  buildings: { townCenter: { size: 3, hp: 1500, sight: 10 }, scrapYard: { size: 2, hp: 600, sight: 6 }, house: { size: 2, hp: 300, sight: 5, popCap: 8, upgrades: [{ cost: { wood: 70 }, buildTime: 15, popCap: 12, hp: 400 }] } },
  demolish: { maxRefund: 0.5, minRefund: 0.35, holdMs: 1500 }
});

function fresh(spectator = false) {
  const s = createStore();
  s.content = content;
  applySnapshot(s, {
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
  });
  return s;
}

console.log('--- MiskolcEmpire store ---');

test('snapshot: fog hides far enemy, spectator sees all', () => {
  const s = fresh();
  assert.equal(isTileVisible(s, 3, 3), true);
  assert.equal(isTileVisible(s, 18, 18), false);
  const sp = fresh(true);
  assert.equal(sp.spectator, true);
  assert.equal(isTileVisible(sp, 18, 18), true);
  assert.ok(sp.explored.every((v) => v === 1));
});

test('tick: spy report array replaces, empty array clears', () => {
  const s = fresh();
  const rep = { unitId: 2, victim: 1, name: 'Gép 2', color: '#3498db', res: { iron: 120, copper: 30, food: 80, wood: 10 }, epoch: 2, research: { epoch: 3, pct: 40 }, military: 5 };
  assert.equal(applyTick(s, { t: 11, spy: [rep] }), 'ok');
  assert.deepEqual(spyReportFor(s, 2), rep);
  applyTick(s, { t: 12 });
  assert.ok(spyReportFor(s, 2), 'a tick without spy keeps the last report');
  applyTick(s, { t: 13, spy: [] });
  assert.equal(spyReportFor(s, 2), null);
});

test('tick: sv summary and you.spectator switch', () => {
  const s = fresh();
  const sv = { elapsed: 125, players: [{ idx: 0, name: 'Bence', alive: false, army: 0, workers: 0, buildings: 0, epoch: 1 }] };
  applyTick(s, { t: 11, sv, you: { idx: 0, team: 0, spectator: true } });
  assert.equal(s.sv.elapsed, 125);
  assert.equal(s.spectator, true);
});

test('defeat event: stats stored, spectator on, fog lifted, selection cleared', () => {
  const s = fresh();
  s.selection.add(1);
  s.ui.placing = 'scrapYard';
  const stats = { unitsLost: 7, unitsKilled: 3, buildingsDestroyed: 1, gathered: 900, damageDealt: 412 };
  applyTick(s, { t: 11, ev: [{ e: 'defeat', stats }] });
  assert.deepEqual(s.defeat.stats, stats);
  assert.equal(s.spectator, true);
  assert.equal(s.selection.size, 0);
  assert.equal(s.ui.placing, null);
  assert.equal(isTileVisible(s, 19, 19), true);
});

test('demolish event then dead: one collapse with owner and footprint, one sound', () => {
  const s = fresh();
  applyTick(s, { t: 11, ev: [{ e: 'demolish', i: 10, k: 'townCenter', x: 1, y: 1, size: 3 }, { e: 'dead', i: 10, x: 2.5, y: 2.5 }] });
  assert.equal(s.buildings.has(10), false);
  assert.equal(s.collapses.length, 1);
  const c = s.collapses[0];
  assert.equal(c.o, 0); assert.equal(c.x, 1); assert.equal(c.y, 1); assert.equal(c.size, 3); assert.equal(c.demolish, true);
  assert.equal(s.sfx.length, 1);
  assert.equal(s.sfx[0].id, 'sfx_building_collapse');
  for (let i = 0; i < 6; i++) advance(s, 0.5);
  assert.equal(s.collapses.length, 0, 'collapse expires after its duration');
});

test('destroyed building (dead only) also collapses', () => {
  const s = fresh();
  applyTick(s, { t: 11, ev: [{ e: 'dead', i: 11, x: 16, y: 16 }] });
  assert.equal(s.collapses.length, 1);
  assert.equal(s.collapses[0].demolish, false);
});

test('siphoned event raises an alert notice and ping', () => {
  const s = fresh();
  applyTick(s, { t: 11, ev: [{ e: 'siphoned', text: 'Valaki dézsmálja a készleteidet a MÉH telepnél!', x: 2, y: 2 }] });
  assert.equal(s.notices.at(-1).kind, 'alert');
  assert.match(s.notices.at(-1).text, /dézsmálja/);
  assert.equal(s.pings.length, 1);
});

test('disguise flip: unit becomes neutral civilian, grey colour', () => {
  const s = fresh();
  applyTick(s, { t: 11, u: [{ i: 50, o: -1, k: 'civilian', x: 5, y: 5, tx: 5, ty: 5, v: 0, hp: 60, st: 'idle' }] });
  assert.equal(playerColor(s, s.units.get(50).o), NEUTRAL_COLOR);
  applyTick(s, { t: 12, u: [{ i: 50, o: 1, k: 'infiltrator', x: 5, y: 5, tx: 5, ty: 5, v: 0, hp: 60, st: 'idle' }] });
  assert.equal(s.units.get(50).k, 'infiltrator');
  assert.equal(s.units.get(50).o, 1);
});

test('control groups: save own only, select living, purge dead, empty group clears', () => {
  const s = fresh();
  s.selection.add(1); s.selection.add(2); s.selection.add(3); // 3 is an enemy
  assert.equal(saveGroup(s, '1'), 2);
  assert.deepEqual(s.groups['1'], [1, 2]);
  s.selection.clear();
  assert.equal(selectGroup(s, '1'), 2);
  const g = groupSummary(s, '1');
  assert.equal(g.count, 2);
  assert.equal(g.kinds.length, 2);
  const c = groupCenter(s, '1', { x: 0, y: 0 });
  assert.equal(c.x, 3.5); assert.equal(c.y, 3);
  applyTick(s, { t: 11, ev: [{ e: 'dead', i: 1, x: 3, y: 3 }] });
  assert.deepEqual(s.groups['1'], [2]);
  applyTick(s, { t: 12, x: [2] });
  assert.equal(s.groups['1'], undefined, 'emptied group disappears');
  s.selection.clear();
  assert.equal(saveGroup(s, '2'), 0);
  assert.equal(s.groups['2'], undefined);
  s.groups['3'] = [999];
  purgeGroups(s);
  assert.equal(s.groups['3'], undefined);
});

test('picking with an injected top-down projector', () => {
  const s = fresh();
  const PX = 30; // px per tile, camera looking straight down
  const view = {
    project(wx, wy, h, out) { out.x = wx * PX; out.y = wy * PX; out.s = PX; out.ok = true; return out; },
    groundAt(sx, sy, h, out) { out.x = sx / PX; out.y = sy / PX; return out; }
  };
  assert.equal(pickAt(s, view, 3 * PX, 3 * PX).e.i, 1);
  assert.equal(pickAt(s, view, 2 * PX, 2.2 * PX).e.i, 10, 'town centre footprint');
  assert.equal(pickAt(s, view, 10.5 * PX, 10.5 * PX), null, 'node on an unexplored tile is hidden');
  s.explored[10 * 20 + 10] = 1;
  assert.equal(pickAt(s, view, 10.5 * PX, 10.5 * PX)?.kind, 'node');
  assert.equal(pickAt(s, view, 18 * PX, 18 * PX), null, 'enemy under fog is not pickable');
  assert.deepEqual(boxSelect(s, view, 0, 0, 5 * PX, 5 * PX).sort(), [1, 2]);
  assert.deepEqual(boxSelect(s, view, 0, 0, 2.5 * PX, 2.5 * PX), [10], 'falls back to own buildings');
});

test('chat buffer keeps last 60 and bumps version', () => {
  const s = fresh();
  for (let i = 0; i < 70; i++) addChat(s, { from: '[Néző] Bence', idx: 0, text: `m${i}`, spectator: true, t: i });
  assert.equal(s.chat.length, 60);
  assert.equal(s.chat[0].text, 'm10');
  assert.equal(s.chatVersion, 70);
});

test('Cigány asszony: clog sounds, deferred ricochet, voice cues only for own units', () => {
  const s = fresh();
  const ids = (q) => q.map((x) => x.id);
  applyTick(s, { t: 11, u: [{ i: 40, o: 0, k: 'ciganyAsszony', x: 5, y: 5, tx: 5, ty: 5, v: 0, hp: 150, st: 'idle' }, { i: 41, o: 1, k: 'ciganyAsszony', x: 8, y: 5, tx: 8, ty: 5, v: 0, hp: 150, st: 'idle' }] });
  assert.deepEqual(ids(s.sfx), ['voice_asszony_trained']);
  s.sfx.length = 0;
  applyTick(s, { t: 12, ev: [
    { e: 'proj', a: 40, x: 5, y: 5, tx: 12, ty: 5, k: 'ciganyAsszony' },
    { e: 'proj', a: 40, x: 12, y: 5, tx: 14, ty: 5, k: 'ciganyAsszony', rb: 1 },
    { e: 'proj', a: 41, x: 8, y: 5, tx: 3, ty: 3, k: 'ciganyAsszony' }
  ] });
  assert.deepEqual(ids(s.sfx), ['sfx_clog_throw', 'sfx_clog_hit', 'voice_asszony_attack', 'sfx_clog_ricochet', 'sfx_clog_throw', 'sfx_clog_hit']);
  const [first, bounce] = s.projectiles;
  assert.equal(first.dur, 0.5);
  assert.equal(bounce.rb, true);
  assert.equal(bounce.t0, first.t0 + first.dur);
  assert.ok(Math.abs(s.sfx[3].delay - (first.dur + bounce.dur)) < 1e-9);
  advance(s, 0.3);
  assert.equal(s.projectiles.length, 3, 'deferred ricochet is not pruned before it starts');
  s.sfx.length = 0;
  cueAsszonyVoice(s, [41, 1]);
  assert.equal(s.sfx.length, 0);
  cueAsszonyVoice(s, [1, 40]);
  assert.deepEqual(ids(s.sfx), ['voice_asszony_order']);
});

test('camera: clamp, smooth centring and yaw-relative pan', () => {
  const cam = createCamera();
  cam.dist = 999; cam.x = -50;
  clampCamera(cam, 88, 88, false);
  assert.equal(cam.dist, MAX_DIST); assert.equal(cam.x, MAX_DIST * EDGE_INSET, 'target is pulled in from the edge by the zoom');
  cam.dist = 20; cam.x = 500; cam.y = -500;
  clampCamera(cam, 88, 88, false);
  assert.equal(cam.x, 88 - 20 * EDGE_INSET); assert.equal(cam.y, 20 * EDGE_INSET);
  cam.dist = 999; cam.x = -50;
  clampCamera(cam, 88, 88, true);
  assert.ok(cam.dist > MAX_DIST, 'spectator zooms further out');
  assert.equal(cam.x, 44, 'never scrolls past the map: a zoom wider than the map pins it to the centre');
  centerOnWorld(cam, 40, 40, true);
  for (let i = 0; i < 200; i++) stepCameraGoal(cam, 1 / 60);
  assert.equal(cam.goal, null); assert.equal(cam.x, 40); assert.equal(cam.y, 40);
  cam.yaw = 0; // eye at +z looking towards -z: screen up = world -y
  const d = panDelta(cam, 0, -1, 1, { x: 0, y: 0 });
  assert.ok(Math.abs(d.x) < 1e-9 && d.y === -1);
});

test('upgrade: dropping a house onto an own finished house targets it; level, max hp and progress merge', () => {
  const s = fresh();
  applyTick(s, { t: 11, b: [
    { i: 20, o: 0, k: 'house', x: 8, y: 2, hp: 300, mh: 300, bp: 100, lv: 1, up: -1 },
    { i: 21, o: 1, k: 'house', x: 12, y: 2, hp: 300, mh: 300, bp: 100, lv: 1, up: -1 },
    { i: 22, o: 0, k: 'house', x: 8, y: 6, hp: 30, mh: 300, bp: 10, lv: 1, up: -1 }
  ] });
  assert.equal(upgradeTargetAt(s, 'house', 9, 3)?.i, 20, 'overlapping own house');
  assert.equal(upgradeTargetAt(s, 'house', 12, 2), null, 'enemy house is not a target');
  assert.equal(upgradeTargetAt(s, 'house', 8, 6), null, 'unfinished house is not a target');
  assert.equal(upgradeTargetAt(s, 'scrapYard', 8, 2), null, 'other kind / not upgradeable');
  assert.equal(nextUpgradeDef(s.content, s.buildings.get(20)).popCap, 12);
  applyTick(s, { t: 12, b: [{ i: 20, up: 40 }] });
  assert.equal(s.buildings.get(20).up, 40);
  applyTick(s, { t: 13, b: [{ i: 20, lv: 2, mh: 400, hp: 400, up: -1 }] });
  const b = s.buildings.get(20);
  assert.equal(b.lv, 2); assert.equal(b.mhp, 400); assert.equal(levelPopCap(s.content, 'house', 2), 12);
  assert.equal(nextUpgradeDef(s.content, b), null, 'top level');
});

console.log(`--- ${passed} passed ---`);
