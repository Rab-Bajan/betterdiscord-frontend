// Mutable match store plus pure logic (snapshot/tick application, local advance, fog, picking).
// No React and no DOM: everything here can run under node.
import { HW, HH, worldToScreen, screenToWorld } from './empireMath.js';
import { buildingSize, epochName } from './empireContent.js';

export const TILE_CODE = { g: 0, d: 1, r: 2, c: 3, w: 4, x: 5 };
export const GAP_TICKS = 40; // heartbeat is 1/s (10 ticks); more than this means missed data
const DEFAULT_UNIT_SIGHT = 6;
const DEFAULT_BUILDING_SIGHT = 7;

export function createStore() {
  return {
    content: null,
    roomId: null,
    status: 'idle',
    tick: 0,
    lastT: 0,
    time: 0,
    you: { idx: -1, team: -1 },
    players: [],
    teamSet: new Set(),
    map: { w: 0, h: 0, tiles: '' },
    codes: null,
    nodes: new Map(),
    units: new Map(),
    buildings: new Map(),
    res: { iron: 0, copper: 0, food: 0, wood: 0, pop: 0, popCap: 0, epoch: 1, research: null },
    paused: null,
    explored: null,
    visible: null,
    fogVersion: 0,
    terrainVersion: 0,
    projectiles: [],
    pings: [],
    fx: [],
    moveMarks: [],
    notices: [],
    selection: new Set(),
    camera: { x: 0, y: 0, zoom: 1 },
    ui: { placing: null },
    cameraReady: false,
    lastAlertAt: -99
  };
}

export function isMine(store, o) { return o === store.you.idx; }
export function isAllied(store, o) { return store.teamSet.has(o); }
export function playerOf(store, o) { return store.players.find((p) => p.idx === o) || null; }

const PALETTE = ['#E94B64', '#536CFF', '#28C997', '#f5b041', '#7655F5', '#5ec8ff', '#ff8fd0', '#b3b8d6'];
export function playerColor(store, o) {
  const c = playerOf(store, o)?.color;
  if (typeof c === 'string' && c) return c;
  if (Number.isInteger(c)) return PALETTE[c % PALETTE.length];
  return PALETTE[Math.abs(o) % PALETTE.length];
}

export function notify(store, text, kind = 'info') {
  store.notices.push({ text, kind, t0: store.time });
  if (store.notices.length > 6) store.notices.shift();
}

function entityDef(store, kind, isBuilding) {
  const c = store.content;
  return c ? (isBuilding ? c.buildings[kind] : c.units[kind]) : null;
}

function decorateUnit(store, e) {
  if (e.dx === undefined) { e.dx = 0; e.dy = 0; }
  if (e.face === undefined) e.face = 1;
  if (e.flash === undefined) e.flash = 0;
  if (e.ph === undefined) e.ph = (e.i * 2654435761 % 1000) / 1000 * 6.283;
  const def = entityDef(store, e.k, false);
  e.mhp = Math.max(e.mhp || 0, e.hp || 0, def?.hp || 0);
}

function decorateBuilding(store, e) {
  if (e.flash === undefined) e.flash = 0;
  const def = entityDef(store, e.k, true);
  e.size = buildingSize(store.content, e.k);
  e.mhp = Math.max(e.mhp || 0, e.hp || 0, def?.hp || 0);
  if (e.bp === undefined) e.bp = 100;
}

function updateFace(e) {
  const d = (e.tx - e.x) - (e.ty - e.y);
  if (d > 0.05) e.face = 1;
  else if (d < -0.05) e.face = -1;
}

function mergeUnit(store, existing, p) {
  if (existing && p.x !== undefined && p.y !== undefined) {
    existing.dx += existing.x - p.x;
    existing.dy += existing.y - p.y;
    if (Math.hypot(existing.dx, existing.dy) > 3) { existing.dx = 0; existing.dy = 0; }
  }
  const e = existing || { i: p.i };
  Object.assign(e, p);
  if (!existing) { e.dx = 0; e.dy = 0; }
  decorateUnit(store, e);
  if (p.tx !== undefined || p.x !== undefined) updateFace(e);
  return e;
}

function mergeBuilding(store, existing, p) {
  const e = existing || { i: p.i };
  Object.assign(e, p);
  decorateBuilding(store, e);
  return e;
}

export function applySnapshot(store, snap) {
  const sameRoom = store.roomId === snap.roomId && store.map.w === snap.map?.w && store.map.h === snap.map?.h;
  store.roomId = snap.roomId;
  store.status = snap.status || 'playing';
  store.tick = snap.tick || 0;
  store.lastT = snap.tick || 0;
  store.you = snap.you || store.you;
  store.players = snap.players || [];
  store.teamSet = new Set(store.players.filter((p) => p.team === store.you.team).map((p) => p.idx));
  store.teamSet.add(store.you.idx);
  store.paused = snap.paused || null;
  if (snap.res) store.res = { ...store.res, ...snap.res };

  const w = snap.map?.w || 0;
  const h = snap.map?.h || 0;
  const tiles = snap.map?.tiles || '';
  if (!sameRoom || store.map.tiles !== tiles) {
    store.map = { w, h, tiles };
    const codes = new Uint8Array(w * h);
    for (let i = 0; i < codes.length; i++) codes[i] = TILE_CODE[tiles[i]] ?? 0;
    store.codes = codes;
    store.terrainVersion++;
  }
  if (!sameRoom || !store.explored || store.explored.length !== w * h) {
    store.explored = new Uint8Array(w * h);
    store.visible = new Uint8Array(w * h);
    store.cameraReady = false;
    store.projectiles.length = 0;
    store.pings.length = 0;
    store.fx.length = 0;
    store.moveMarks.length = 0;
    store.selection.clear();
  }

  store.nodes.clear();
  for (const n of snap.nodes || []) store.nodes.set(n.i, { ...n, max: n.a });

  // Merge instead of replace so a resync keeps unit positions smooth
  const seenU = new Set();
  for (const u of snap.units || []) {
    seenU.add(u.i);
    store.units.set(u.i, mergeUnit(store, store.units.get(u.i), u));
  }
  for (const id of [...store.units.keys()]) if (!seenU.has(id)) store.units.delete(id);
  const seenB = new Set();
  for (const b of snap.buildings || []) {
    seenB.add(b.i);
    store.buildings.set(b.i, mergeBuilding(store, store.buildings.get(b.i), b));
  }
  for (const id of [...store.buildings.keys()]) if (!seenB.has(id)) store.buildings.delete(id);
  pruneSelection(store);
  updateFog(store);
}

// Returns 'ok' | 'stale' | 'resync'. 'resync' means the caller should request empire:get-state.
export function applyTick(store, tk) {
  if (!tk || typeof tk.t !== 'number') return 'stale';
  if (!store.map.w) return 'resync';
  if (tk.t < store.lastT) return 'stale';
  let resync = store.lastT > 0 && tk.t - store.lastT > GAP_TICKS;
  store.lastT = tk.t;
  store.tick = tk.t;

  if (tk.r) store.res = { ...store.res, ...tk.r };
  if (tk.p !== undefined) store.paused = tk.p;

  if (tk.u) {
    for (const p of tk.u) {
      if (!p || p.i === undefined) continue;
      const ex = store.units.get(p.i);
      if (!ex && p.k === undefined) { resync = true; continue; }
      store.units.set(p.i, mergeUnit(store, ex, p));
    }
  }
  if (tk.b) {
    for (const p of tk.b) {
      if (!p || p.i === undefined) continue;
      const ex = store.buildings.get(p.i);
      if (!ex && p.k === undefined) { resync = true; continue; }
      store.buildings.set(p.i, mergeBuilding(store, ex, p));
    }
  }
  if (tk.n) {
    for (const [id, amount] of tk.n) {
      const n = store.nodes.get(id);
      if (n) n.a = amount;
    }
  }
  if (tk.x) {
    for (const id of tk.x) {
      store.units.delete(id);
      store.buildings.delete(id);
      store.selection.delete(id);
    }
  }
  if (tk.ev) for (const ev of tk.ev) applyEvent(store, ev);
  return resync ? 'resync' : 'ok';
}

const PROJ_SPEED = 14; // tiles per second, visual only

function applyEvent(store, ev) {
  switch (ev?.e) {
    case 'proj': {
      const dist = Math.hypot(ev.tx - ev.x, ev.ty - ev.y);
      store.projectiles.push({ x: ev.x, y: ev.y, tx: ev.tx, ty: ev.ty, k: ev.k, t0: store.time, dur: Math.max(0.12, dist / PROJ_SPEED), a: ev.a });
      if (store.projectiles.length > 200) store.projectiles.shift();
      break;
    }
    case 'hit': {
      const e = store.units.get(ev.i) || store.buildings.get(ev.i);
      if (e) e.flash = store.time + 0.18;
      break;
    }
    case 'attacked':
      store.pings.push({ x: ev.x, y: ev.y, t0: store.time, kind: 'alert' });
      if (store.time - store.lastAlertAt > 6) { notify(store, 'Támadás alatt állsz!', 'alert'); store.lastAlertAt = store.time; }
      break;
    case 'built':
      notify(store, 'Elkészült egy épület.', 'good');
      break;
    case 'epoch': {
      const p = playerOf(store, ev.o);
      notify(store, `${p?.name || 'Valaki'} új korszakba lépett: ${epochName(store.content, ev.n)}`, 'good');
      break;
    }
    case 'msg':
      if (ev.text) notify(store, String(ev.text));
      break;
    case 'ping':
      store.pings.push({ x: ev.x, y: ev.y, t0: store.time, kind: 'ping', o: ev.o });
      break;
    case 'dead':
      store.fx.push({ x: ev.x, y: ev.y, t0: store.time, dur: 0.7 });
      store.units.delete(ev.i);
      store.buildings.delete(ev.i);
      store.selection.delete(ev.i);
      break;
    default:
  }
}

// Advance local simulation: units walk towards tx,ty at v; correction offsets decay smoothly.
export function advance(store, dt) {
  dt = Math.min(dt, 0.5);
  store.time += dt;
  const decay = Math.exp(-8 * dt);
  const running = !store.paused;
  for (const u of store.units.values()) {
    if (running && u.v > 0) {
      const ddx = u.tx - u.x;
      const ddy = u.ty - u.y;
      const dist = Math.hypot(ddx, ddy);
      if (dist > 1e-4) {
        const step = u.v * dt;
        if (step >= dist) { u.x = u.tx; u.y = u.ty; } else { u.x += ddx / dist * step; u.y += ddy / dist * step; }
      }
    }
    if (u.dx !== 0 || u.dy !== 0) {
      u.dx *= decay; u.dy *= decay;
      if (Math.abs(u.dx) < 0.002 && Math.abs(u.dy) < 0.002) { u.dx = 0; u.dy = 0; }
    }
  }
  const t = store.time;
  pruneList(store.projectiles, (p) => t - p.t0 > p.dur);
  pruneList(store.moveMarks, (m) => t - m.t0 > 0.8);
  pruneList(store.fx, (f) => t - f.t0 > f.dur);
  pruneList(store.pings, (p) => t - p.t0 > (p.kind === 'alert' ? 3 : 2.5));
  pruneList(store.notices, (n) => t - n.t0 > 6);
}

function pruneList(arr, dead) {
  let j = 0;
  for (let i = 0; i < arr.length; i++) if (!dead(arr[i])) arr[j++] = arr[i];
  arr.length = j;
}

export function pruneSelection(store) {
  for (const id of [...store.selection]) {
    if (!store.units.has(id) && !store.buildings.has(id) && !store.nodes.has(id)) store.selection.delete(id);
  }
}

// Recompute the visible tile set from the sight of every unit and building of our team.
export function updateFog(store) {
  const { w, h } = store.map;
  if (!w || !store.visible) return;
  const vis = store.visible;
  const exp = store.explored;
  vis.fill(0);
  const stamp = (cx, cy, r) => {
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r));
    const r2 = r * r;
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        if (dx * dx + dy * dy <= r2) { vis[y * w + x] = 1; exp[y * w + x] = 1; }
      }
    }
  };
  for (const u of store.units.values()) {
    if (!store.teamSet.has(u.o)) continue;
    stamp(u.x, u.y, entityDef(store, u.k, false)?.sight || DEFAULT_UNIT_SIGHT);
  }
  for (const b of store.buildings.values()) {
    if (!store.teamSet.has(b.o) || b.bp < 100) continue;
    stamp(b.x + b.size / 2, b.y + b.size / 2, entityDef(store, b.k, true)?.sight || DEFAULT_BUILDING_SIGHT);
  }
  store.fogVersion++;
}

export function isTileVisible(store, x, y) {
  const { w, h } = store.map;
  const tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= w || ty >= h || !store.visible) return false;
  return store.visible[ty * w + tx] === 1;
}

export function isBlockedTile(store, x, y) {
  const { w, h } = store.map;
  if (x < 0 || y < 0 || x >= w || y >= h) return true;
  const c = store.codes[y * w + x];
  return c === TILE_CODE.w || c === TILE_CODE.x;
}

// Client-side placement hint only; the server stays authoritative.
export function canPlace(store, kind, ax, ay) {
  const size = buildingSize(store.content, kind);
  const { w, h } = store.map;
  if (ax < 0 || ay < 0 || ax + size > w || ay + size > h) return false;
  for (let y = ay; y < ay + size; y++) {
    for (let x = ax; x < ax + size; x++) {
      if (isBlockedTile(store, x, y)) return false;
      if (!store.explored[y * w + x]) return false;
    }
  }
  for (const b of store.buildings.values()) {
    if (ax < b.x + b.size && ax + size > b.x && ay < b.y + b.size && ay + size > b.y) return false;
  }
  for (const n of store.nodes.values()) {
    if (n.a > 0 && n.x >= ax && n.x < ax + size && n.y >= ay && n.y < ay + size) return false;
  }
  return true;
}

const _s = { x: 0, y: 0 };
const _w = { x: 0, y: 0 };
const _w2 = { x: 0, y: 0 };

function unitPickRadius(k) { return k === 'lada' || k === 'horseWagon' || k === 'ram' ? 17 : 12; }

// Returns { kind: 'unit'|'building'|'node', e } or null for the entity under a screen point.
export function pickAt(store, vw, vh, sx, sy) {
  const cam = store.camera;
  let best = null;
  let bestD = Infinity;
  for (const u of store.units.values()) {
    if (!store.teamSet.has(u.o) && !isTileVisible(store, u.x, u.y)) continue;
    worldToScreen(cam, vw, vh, u.x + u.dx, u.y + u.dy, _s);
    const r = unitPickRadius(u.k) * cam.zoom;
    const d = Math.hypot(sx - _s.x, sy - (_s.y - 9 * cam.zoom));
    if (d < r && d < bestD) { best = { kind: 'unit', e: u }; bestD = d; }
  }
  if (best) return best;
  screenToWorld(cam, vw, vh, sx, sy, _w);
  screenToWorld(cam, vw, vh, sx, sy + 20 * cam.zoom, _w2);
  for (const b of store.buildings.values()) {
    const inside = (p) => p.x >= b.x && p.x < b.x + b.size && p.y >= b.y && p.y < b.y + b.size;
    if (inside(_w) || inside(_w2)) return { kind: 'building', e: b };
  }
  for (const n of store.nodes.values()) {
    if (n.a <= 0) continue;
    if (Math.hypot(_w.x - n.x - 0.5, _w.y - n.y - 0.5) < 0.9 || Math.hypot(_w2.x - n.x - 0.5, _w2.y - n.y - 0.5) < 0.9) return { kind: 'node', e: n };
  }
  return null;
}

// Own units (or, failing that, own buildings) whose screen position falls inside the rectangle.
export function boxSelect(store, vw, vh, x0, y0, x1, y1) {
  const cam = store.camera;
  const lx = Math.min(x0, x1), hx = Math.max(x0, x1), ly = Math.min(y0, y1), hy = Math.max(y0, y1);
  const ids = [];
  for (const u of store.units.values()) {
    if (!isMine(store, u.o)) continue;
    worldToScreen(cam, vw, vh, u.x + u.dx, u.y + u.dy, _s);
    const sy = _s.y - 9 * cam.zoom;
    if (_s.x >= lx && _s.x <= hx && sy >= ly && sy <= hy) ids.push(u.i);
  }
  if (ids.length) return ids;
  for (const b of store.buildings.values()) {
    if (!isMine(store, b.o)) continue;
    worldToScreen(cam, vw, vh, b.x + b.size / 2, b.y + b.size / 2, _s);
    if (_s.x >= lx && _s.x <= hx && _s.y >= ly && _s.y <= hy) ids.push(b.i);
  }
  return ids;
}

export function selectionInfo(store) {
  const units = [];
  const buildings = [];
  let node = null;
  for (const id of store.selection) {
    const u = store.units.get(id);
    if (u) { units.push(u); continue; }
    const b = store.buildings.get(id);
    if (b) { buildings.push(b); continue; }
    const n = store.nodes.get(id);
    if (n) node = n;
  }
  return { units, buildings, node };
}

export { HW, HH };
