// Mutable match store plus pure logic (snapshot/tick application, local advance, fog, picking,
// control groups). No React, no DOM and no three.js: everything here can run under node.
import { createCamera } from './empireMath.ts';
import { buildingSize, epochName } from './empireContent.ts';
import type {
  BuildingDef, BuildingRecord, ChatPayload, EmpireBuilding, EmpireEvent, EmpireNode, EmpireSnapshot, EmpireStore, EmpireTick,
  EmpireUnit, EmpirePick, NoticeKind, PickView, PlayerInfo, Projectile, ScreenPoint, SfxCue, SpyReport, StoreYou, UnitDef, UnitRecord, Vec2
} from '../types.ts';

export type TileCode = 'g' | 'd' | 'r' | 'c' | 'w' | 'x';
export const TILE_CODE: Readonly<Record<TileCode, number>> = { g: 0, d: 1, r: 2, c: 3, w: 4, x: 5 };
const TILE_LOOKUP: Readonly<Record<string, number | undefined>> = TILE_CODE;
export const GAP_TICKS = 40; // heartbeat is 1/s (10 ticks); more than this means missed data
export const NEUTRAL_COLOR = '#9a9ca3';
export const GROUP_SLOTS: readonly string[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const DEFAULT_UNIT_SIGHT = 6;
const DEFAULT_BUILDING_SIGHT = 7;
const MAX_CHAT = 60;
const COLLAPSE_DUR = 1.9;
const VOICE_UNIT = 'ciganyAsszony';

export function createStore(): EmpireStore {
  return {
    content: null,
    roomId: null,
    status: 'idle',
    tick: 0,
    lastT: 0,
    time: 0,
    you: { idx: -1, team: -1 },
    spectator: false,
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
    collapses: [],
    sfx: [],
    moveMarks: [],
    notices: [],
    chat: [],
    chatVersion: 0,
    spy: [],
    sv: null,
    svAt: 0,
    defeat: null,
    groups: {},
    selection: new Set(),
    camera: createCamera(),
    viewQuad: null,
    ui: { placing: null, muted: false },
    cameraReady: false,
    lastAlertAt: -99
  };
}

type Owner = number | null | undefined;

export function isMine(store: EmpireStore, o: Owner): boolean { return o === store.you.idx; }
export function isAllied(store: EmpireStore, o: Owner): boolean { return typeof o === 'number' && store.teamSet.has(o); }
export function isNeutral(o: Owner): boolean { return typeof o !== 'number' || o < 0; }
export function playerOf(store: EmpireStore, o: Owner): PlayerInfo | null { return store.players.find((p) => p.idx === o) || null; }

const PALETTE: readonly string[] = ['#E94B64', '#536CFF', '#28C997', '#f5b041', '#7655F5', '#5ec8ff', '#ff8fd0', '#b3b8d6'];
export function playerColor(store: EmpireStore, o: Owner): string {
  if (typeof o !== 'number' || isNeutral(o)) return NEUTRAL_COLOR;
  const c = playerOf(store, o)?.color;
  if (typeof c === 'string' && c) return c;
  if (typeof c === 'number' && Number.isInteger(c)) return PALETTE[c % PALETTE.length] ?? NEUTRAL_COLOR;
  return PALETTE[Math.abs(o) % PALETTE.length] ?? NEUTRAL_COLOR;
}

export function notify(store: EmpireStore, text: string, kind: NoticeKind = 'info'): void {
  store.notices.push({ text, kind, t0: store.time });
  if (store.notices.length > 6) store.notices.shift();
}

export function addChat(store: EmpireStore, msg: ChatPayload | null | undefined): void {
  if (!msg || typeof msg.text !== 'string') return;
  store.chat.push({ from: String(msg.from || 'Ismeretlen'), idx: msg.idx, text: msg.text, spectator: !!msg.spectator, t: msg.t || Date.now() });
  if (store.chat.length > MAX_CHAT) store.chat.splice(0, store.chat.length - MAX_CHAT);
  store.chatVersion++;
}

function entityDef(store: EmpireStore, kind: string, isBuilding: boolean): UnitDef | BuildingDef | null | undefined {
  const c = store.content;
  return c ? (isBuilding ? c.buildings[kind] : c.units[kind]) : null;
}

function decorateUnit(store: EmpireStore, e: EmpireUnit): void {
  if (e.dx === undefined) { e.dx = 0; e.dy = 0; }
  if (e.flash === undefined) e.flash = 0;
  if (e.ph === undefined) e.ph = (e.i * 2654435761 % 1000) / 1000 * 6.283;
  const def = entityDef(store, e.k, false);
  e.mhp = Math.max(e.mhp || 0, e.hp || 0, def?.hp || 0);
}

function decorateBuilding(store: EmpireStore, e: EmpireBuilding): void {
  if (e.flash === undefined) e.flash = 0;
  const def = entityDef(store, e.k, true);
  e.size = buildingSize(store.content, e.k);
  // max hp of the building's current level comes from the server (mh); the def covers records without it
  e.mhp = e.mh > 0 ? e.mh : Math.max(e.mhp || 0, e.hp || 0, def?.hp || 0);
  if (e.bp === undefined) e.bp = 100;
  if (!(e.lv >= 1)) e.lv = 1;
  if (e.up === undefined || e.up === null) e.up = -1;
}


// A new entity starts as { i } and becomes complete once the server record is merged in and decorated
// (the server only sends a new id together with its full record).
function mergeUnit(store: EmpireStore, existing: EmpireUnit | undefined, id: number, p: Partial<UnitRecord>): EmpireUnit {
  if (existing && p.x !== undefined && p.y !== undefined) {
    existing.dx += existing.x - p.x;
    existing.dy += existing.y - p.y;
    if (Math.hypot(existing.dx, existing.dy) > 3) { existing.dx = 0; existing.dy = 0; }
  }
  const e = existing || ({ i: id } as EmpireUnit);
  // a disguise flip resends the full record with a new kind: the old max hp no longer applies
  if (existing && p.k !== undefined && p.k !== existing.k) e.mhp = 0;
  Object.assign(e, p);
  if (!existing) { e.dx = 0; e.dy = 0; }
  decorateUnit(store, e);
  return e;
}

function mergeBuilding(store: EmpireStore, existing: EmpireBuilding | undefined, id: number, p: Partial<BuildingRecord>): EmpireBuilding {
  const e = existing || ({ i: id } as EmpireBuilding);
  Object.assign(e, p);
  decorateBuilding(store, e);
  return e;
}

function setYou(store: EmpireStore, you: StoreYou): void {
  store.you = { idx: you.idx, team: you.team, spectator: !!you.spectator };
  store.spectator = !!you.spectator;
  store.teamSet = new Set(store.players.filter((p) => p.team === store.you.team).map((p) => p.idx));
  store.teamSet.add(store.you.idx);
}

export function applySnapshot(store: EmpireStore, snap: EmpireSnapshot): void {
  const sameRoom = store.roomId === snap.roomId && store.map.w === snap.map?.w && store.map.h === snap.map?.h;
  store.roomId = snap.roomId;
  store.status = snap.status || 'playing';
  store.tick = snap.tick || 0;
  store.lastT = snap.tick || 0;
  store.players = snap.players || [];
  setYou(store, snap.you || store.you);
  store.paused = snap.paused || null;
  if (snap.res) store.res = { ...store.res, ...snap.res };
  store.spy = Array.isArray(snap.spy) ? snap.spy : [];
  if (snap.sv) { store.sv = snap.sv; store.svAt = store.time; }

  const w = snap.map?.w || 0;
  const h = snap.map?.h || 0;
  const tiles = snap.map?.tiles || '';
  if (!sameRoom || store.map.tiles !== tiles) {
    store.map = { w, h, tiles };
    const codes = new Uint8Array(w * h);
    for (let i = 0; i < codes.length; i++) codes[i] = TILE_LOOKUP[tiles.charAt(i)] ?? 0;
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
    store.collapses.length = 0;
    store.moveMarks.length = 0;
    store.selection.clear();
    store.groups = {};
  }

  store.nodes.clear();
  for (const n of snap.nodes || []) store.nodes.set(n.i, { ...n, max: n.a });

  // Merge instead of replace so a resync keeps unit positions smooth
  const seenU = new Set<number>();
  for (const u of snap.units || []) {
    seenU.add(u.i);
    store.units.set(u.i, mergeUnit(store, store.units.get(u.i), u.i, u));
  }
  for (const id of [...store.units.keys()]) if (!seenU.has(id)) store.units.delete(id);
  const seenB = new Set<number>();
  for (const b of snap.buildings || []) {
    seenB.add(b.i);
    store.buildings.set(b.i, mergeBuilding(store, store.buildings.get(b.i), b.i, b));
  }
  for (const id of [...store.buildings.keys()]) if (!seenB.has(id)) store.buildings.delete(id);
  pruneSelection(store);
  purgeGroups(store);
  updateFog(store);
}

export type TickResult = 'ok' | 'stale' | 'resync';

// 'resync' means the caller should request empire:get-state.
export function applyTick(store: EmpireStore, tk: EmpireTick | null | undefined): TickResult {
  if (!tk || typeof tk.t !== 'number') return 'stale';
  if (!store.map.w) return 'resync';
  if (tk.t < store.lastT) return 'stale';
  let resync = store.lastT > 0 && tk.t - store.lastT > GAP_TICKS;
  store.lastT = tk.t;
  store.tick = tk.t;

  if (tk.you) setYou(store, tk.you);
  if (tk.r) store.res = { ...store.res, ...tk.r };
  if (tk.p !== undefined) store.paused = tk.p;
  if (Array.isArray(tk.spy)) store.spy = tk.spy;
  if (tk.sv) { store.sv = tk.sv; store.svAt = store.time; }

  if (tk.u) {
    for (const p of tk.u) {
      if (!p || p.i === undefined) continue;
      const ex = store.units.get(p.i);
      if (!ex && p.k === undefined) { resync = true; continue; }
      store.units.set(p.i, mergeUnit(store, ex, p.i, p));
      // own units are never fogged, so a new own record means it was just trained
      if (!ex && p.k === VOICE_UNIT && isMine(store, p.o)) pushSfx(store, { id: 'voice_asszony_trained' });
    }
  }
  if (tk.b) {
    for (const p of tk.b) {
      if (!p || p.i === undefined) continue;
      const ex = store.buildings.get(p.i);
      if (!ex && p.k === undefined) { resync = true; continue; }
      store.buildings.set(p.i, mergeBuilding(store, ex, p.i, p));
    }
  }
  if (tk.n) {
    for (const [id, amount] of tk.n) {
      const n = store.nodes.get(id);
      if (n) n.a = amount;
    }
  }
  if (tk.ev) for (const ev of tk.ev) applyEvent(store, ev);
  if (tk.x) {
    for (const id of tk.x) {
      store.units.delete(id);
      store.buildings.delete(id);
      store.selection.delete(id);
    }
  }
  purgeGroups(store);
  return resync ? 'resync' : 'ok';
}

const PROJ_SPEED = 14; // tiles per second, visual only

function pushSfx(store: EmpireStore, s: SfxCue): void {
  store.sfx.push(s);
  if (store.sfx.length > 8) store.sfx.shift();
}

// Queue her order line when any of ids is one of our own Cigány asszonyok (selection or command).
export function cueAsszonyVoice(store: EmpireStore, ids: Iterable<number>): void {
  for (const id of ids) {
    const u = store.units.get(id);
    if (u && u.k === VOICE_UNIT && isMine(store, u.o)) { pushSfx(store, { id: 'voice_asszony_order' }); return; }
  }
}

type ProjEvent = Extract<EmpireEvent, { e: 'proj' }>;

// Clog throw/hit sounds; a ricochet (rb) starts when the parent clog lands, so its flight is deferred.
function clogProjectile(store: EmpireStore, ev: ProjEvent, pr: Projectile): void {
  if (ev.rb) {
    let parent: Projectile | undefined;
    for (let i = store.projectiles.length - 1; i >= 0 && !parent; i--) {
      const q = store.projectiles[i];
      if (q && q.a === ev.a && !q.rb && q.tx === ev.x && q.ty === ev.y) parent = q;
    }
    if (parent) pr.t0 = parent.t0 + parent.dur;
    pushSfx(store, { id: 'sfx_clog_ricochet', x: ev.tx, y: ev.ty, delay: pr.t0 - store.time + pr.dur });
    return;
  }
  pushSfx(store, { id: 'sfx_clog_throw', x: ev.x, y: ev.y });
  pushSfx(store, { id: 'sfx_clog_hit', x: ev.tx, y: ev.ty, delay: pr.dur });
  const thrower = store.units.get(ev.a);
  if (thrower && isMine(store, thrower.o)) pushSfx(store, { id: 'voice_asszony_attack', x: ev.x, y: ev.y });
}

interface CollapseSource {
  i: number;
  k: string;
  size?: number | undefined;
  /** footprint centre */
  cx: number;
  cy: number;
}

// b: the building record if still known; ev: { i, k, size } plus the footprint centre (cx, cy)
function pushCollapse(store: EmpireStore, b: EmpireBuilding | undefined, ev: CollapseSource, demolish: boolean): void {
  if (store.collapses.some((c) => c.i === ev.i)) return;
  const owner = b ? playerOf(store, b.o) : null;
  const k = b?.k || ev.k;
  const size = b?.size || ev.size || buildingSize(store.content, k);
  store.collapses.push({
    i: ev.i, k, o: b ? b.o : -1, x: b ? b.x : ev.cx - size / 2, y: b ? b.y : ev.cy - size / 2,
    size, bp: b?.bp ?? 100, epoch: owner?.epoch ?? 1, t0: store.time, dur: COLLAPSE_DUR, demolish
  });
  pushSfx(store, { id: 'sfx_building_collapse', x: ev.cx, y: ev.cy });
  if (store.collapses.length > 24) store.collapses.shift();
}

function applyEvent(store: EmpireStore, ev: EmpireEvent | null | undefined): void {
  if (!ev) return;
  switch (ev.e) {
    case 'proj': {
      const dist = Math.hypot(ev.tx - ev.x, ev.ty - ev.y);
      const pr: Projectile = { x: ev.x, y: ev.y, tx: ev.tx, ty: ev.ty, k: ev.k, t0: store.time, dur: Math.max(0.12, dist / PROJ_SPEED), a: ev.a, rb: !!ev.rb };
      if (ev.k === VOICE_UNIT) clogProjectile(store, ev, pr);
      store.projectiles.push(pr);
      if (store.projectiles.length > 200) store.projectiles.shift();
      break;
    }
    case 'hit': {
      const u = store.units.get(ev.i);
      const b = u ? undefined : store.buildings.get(ev.i);
      const e = u || b;
      if (e) {
        e.flash = store.time + 0.18;
        const fx = b && b.size !== undefined ? b.x + b.size / 2 : e.x;
        const fy = b && b.size !== undefined ? b.y + b.size / 2 : e.y;
        store.fx.push({ kind: 'hit', x: fx, y: fy, t0: store.time, dur: 0.3 });
      }
      break;
    }
    case 'attacked':
      store.pings.push({ x: ev.x, y: ev.y, t0: store.time, kind: 'alert' });
      if (store.time - store.lastAlertAt > 6) { notify(store, 'Támadás alatt állsz!', 'alert'); store.lastAlertAt = store.time; }
      break;
    case 'built':
      notify(store, 'Elkészült egy épület.', 'good');
      break;
    case 'upgraded': {
      const b = store.buildings.get(ev.i);
      if (b) { b.lv = ev.lv; b.up = -1; }
      notify(store, `Fejlesztés kész: ${ev.lv}. szint.`, 'good');
      break;
    }
    case 'epoch': {
      const p = playerOf(store, ev.o);
      if (p) p.epoch = ev.n;
      notify(store, `${p?.name || 'Valaki'} új korszakba lépett: ${epochName(store.content, ev.n)}`, 'good');
      break;
    }
    case 'msg':
      if (ev.text) notify(store, String(ev.text));
      break;
    case 'ping':
      store.pings.push({ x: ev.x, y: ev.y, t0: store.time, kind: 'ping', o: ev.o });
      break;
    case 'siphoned':
      notify(store, String(ev.text || 'Valaki dézsmálja a készleteidet!'), 'alert');
      if (ev.x !== undefined && ev.y !== undefined && Number.isFinite(ev.x)) store.pings.push({ x: ev.x, y: ev.y, t0: store.time, kind: 'alert' });
      break;
    case 'demolish':
      pushCollapse(store, store.buildings.get(ev.i), { i: ev.i, k: ev.k, size: ev.size, cx: ev.x + (ev.size || 0) / 2, cy: ev.y + (ev.size || 0) / 2 }, true);
      break;
    case 'defeat':
      store.defeat = { stats: ev.stats || {}, t0: store.time, at: Date.now() };
      store.spectator = true;
      store.you = { ...store.you, spectator: true };
      store.selection.clear();
      store.ui.placing = null;
      updateFog(store);
      break;
    case 'dead': {
      const b = store.buildings.get(ev.i);
      const u = store.units.get(ev.i);
      if (b) pushCollapse(store, b, { i: ev.i, k: b.k, size: b.size, cx: b.x + b.size / 2, cy: b.y + b.size / 2 }, false);
      store.fx.push({ kind: b ? 'building' : 'unit', k: (b || u)?.k, x: ev.x, y: ev.y, t0: store.time, dur: 0.9 });
      store.units.delete(ev.i);
      store.buildings.delete(ev.i);
      store.selection.delete(ev.i);
      break;
    }
    default:
  }
}

// Advance local simulation: units walk towards tx,ty at v; correction offsets decay smoothly.
export function advance(store: EmpireStore, dt: number): void {
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
  pruneList(store.collapses, (c) => t - c.t0 > c.dur);
  pruneList(store.pings, (p) => t - p.t0 > (p.kind === 'alert' ? 3 : 2.5));
  pruneList(store.notices, (n) => t - n.t0 > 6);
}

// In-place filter: the survivors are compacted to the front (writes never pass the read position).
function pruneList<T>(arr: T[], dead: (item: T) => boolean): void {
  let j = 0;
  for (const item of arr) if (!dead(item)) arr[j++] = item;
  arr.length = j;
}

export function pruneSelection(store: EmpireStore): void {
  for (const id of [...store.selection]) {
    if (!store.units.has(id) && !store.buildings.has(id) && !store.nodes.has(id)) store.selection.delete(id);
  }
}

// ---------------- control groups ----------------
// Groups hold own unit/building ids; dead ids are purged and an emptied group disappears.
export function purgeGroups(store: EmpireStore): void {
  for (const [k, list] of Object.entries(store.groups)) {
    const ids = list.filter((id) => store.units.has(id) || store.buildings.has(id));
    if (ids.length) store.groups[k] = ids; else delete store.groups[k];
  }
}

// Save the own part of the current selection into slot n. Returns the saved count (0 clears the slot).
export function saveGroup(store: EmpireStore, n: string): number {
  const ids = [...store.selection].filter((id) => {
    const e = store.units.get(id) || store.buildings.get(id);
    return e && isMine(store, e.o);
  });
  if (ids.length) store.groups[n] = ids; else delete store.groups[n];
  return ids.length;
}

// Replace the selection with the living members of slot n. Returns the selected count.
export function selectGroup(store: EmpireStore, n: string): number {
  const ids = store.groups[n];
  if (!ids?.length) return 0;
  store.selection.clear();
  for (const id of ids) if (store.units.has(id) || store.buildings.has(id)) store.selection.add(id);
  return store.selection.size;
}

export function groupCenter<T extends Vec2>(store: EmpireStore, n: string, out: T): T | null {
  const ids = store.groups[n];
  if (!ids?.length) return null;
  let sx = 0, sy = 0, c = 0;
  for (const id of ids) {
    const u = store.units.get(id);
    if (u) { sx += u.x; sy += u.y; c++; continue; }
    const b = store.buildings.get(id);
    if (b) { sx += b.x + b.size / 2; sy += b.y + b.size / 2; c++; }
  }
  if (!c) return null;
  out.x = sx / c; out.y = sy / c;
  return out;
}

/** [kind, count, isBuilding] */
export type GroupKind = [string, number, boolean];
export interface GroupSummary {
  count: number;
  kinds: GroupKind[];
  hp: number;
  mhp: number;
}

// { count, kinds: [[kind, n, isBuilding]], hp, mhp } for the HUD slot.
export function groupSummary(store: EmpireStore, n: string): GroupSummary | null {
  const ids = store.groups[n];
  if (!ids?.length) return null;
  const kinds = new Map<string, GroupKind>();
  let hp = 0, mhp = 0, count = 0;
  for (const id of ids) {
    const e = store.units.get(id) || store.buildings.get(id);
    if (!e) continue;
    count++;
    hp += e.hp || 0; mhp += e.mhp || e.hp || 1;
    const key = e.k;
    const cur = kinds.get(key);
    if (cur) cur[1]++; else kinds.set(key, [key, 1, store.buildings.has(id)]);
  }
  if (!count) return null;
  return { count, kinds: [...kinds.values()].sort((a, b) => b[1] - a[1]), hp, mhp };
}

// ---------------- fog of war ----------------
// Recompute the visible tile set from the sight of every unit and building of our team.
// Spectators see everything.
export function updateFog(store: EmpireStore): void {
  const { w, h } = store.map;
  const vis = store.visible;
  const exp = store.explored;
  if (!w || !vis || !exp) return;
  if (store.spectator) {
    vis.fill(1); exp.fill(1);
    store.fogVersion++;
    return;
  }
  vis.fill(0);
  const stamp = (cx: number, cy: number, r: number): void => {
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

export function isTileVisible(store: EmpireStore, x: number, y: number): boolean {
  if (store.spectator) return true;
  const { w, h } = store.map;
  const tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= w || ty >= h || !store.visible) return false;
  return store.visible[ty * w + tx] === 1;
}

export function isTileExplored(store: EmpireStore, x: number, y: number): boolean {
  if (store.spectator) return true;
  const { w, h } = store.map;
  const tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= w || ty >= h || !store.explored) return false;
  return store.explored[ty * w + tx] === 1;
}

// Units drawn and pickable: our team always, others only inside vision.
export function isUnitShown(store: EmpireStore, u: Pick<EmpireUnit, 'o' | 'x' | 'y'>): boolean {
  return store.teamSet.has(u.o) || isTileVisible(store, u.x, u.y);
}

export function isBlockedTile(store: EmpireStore, x: number, y: number): boolean {
  const { w, h } = store.map;
  if (x < 0 || y < 0 || x >= w || y >= h) return true;
  const c = store.codes?.[y * w + x];
  return c === TILE_CODE.w || c === TILE_CODE.x;
}

// Client-side placement hint only; the server stays authoritative.
// Dragging a building onto one of our own finished buildings of the same kind upgrades it instead.
// Returns that building when the ghost footprint overlaps it, else null.
export function upgradeTargetAt(store: EmpireStore, kind: string, ax: number, ay: number): EmpireBuilding | null {
  if (!store.content?.buildings?.[kind]?.upgrades?.length) return null;
  const size = buildingSize(store.content, kind);
  for (const b of store.buildings.values()) {
    if (b.k !== kind || !isMine(store, b.o) || b.bp < 100) continue;
    if (ax < b.x + b.size && ax + size > b.x && ay < b.y + b.size && ay + size > b.y) return b;
  }
  return null;
}

export function canPlace(store: EmpireStore, kind: string, ax: number, ay: number): boolean {
  const size = buildingSize(store.content, kind);
  const { w, h } = store.map;
  if (ax < 0 || ay < 0 || ax + size > w || ay + size > h) return false;
  for (let y = ay; y < ay + size; y++) {
    for (let x = ax; x < ax + size; x++) {
      if (isBlockedTile(store, x, y)) return false;
      if (!store.explored?.[y * w + x]) return false;
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

// ---------------- picking (camera-agnostic) ----------------
// `view` is supplied by the 3D canvas:
//   view.project(wx, wy, hAbove, out) -> out { x, y (CSS px), s (px per world unit), ok (in front) }
//   view.groundAt(sx, sy, h, out)     -> world tile point where the cursor ray meets height h, or null
const _p: ScreenPoint = { x: 0, y: 0, s: 1, ok: true };
const _g0: Vec2 = { x: 0, y: 0 };
const _g1: Vec2 = { x: 0, y: 0 };

export const UNIT_PICK_HEIGHT = 0.45;
const VEHICLES = new Set(['lada', 'horseWagon', 'ram']);
export function unitRadius(k: string): number { return VEHICLES.has(k) ? 0.7 : 0.42; }

// Returns { kind: 'unit'|'building'|'node', e } or null for the entity under a screen point.
export function pickAt(store: EmpireStore, view: PickView, sx: number, sy: number): EmpirePick | null {
  let best: EmpirePick | null = null;
  let bestD = Infinity;
  for (const u of store.units.values()) {
    if (!isUnitShown(store, u)) continue;
    view.project(u.x + u.dx, u.y + u.dy, UNIT_PICK_HEIGHT, _p);
    if (!_p.ok) continue;
    const r = Math.max(9, unitRadius(u.k) * _p.s);
    const d = Math.hypot(sx - _p.x, sy - _p.y);
    if (d < r && d < bestD) { best = { kind: 'unit', e: u }; bestD = d; }
  }
  if (best) return best;
  const g0 = view.groundAt(sx, sy, 0, _g0);
  const g1 = view.groundAt(sx, sy, 1.1, _g1);
  const inside = (p: Vec2 | null, b: EmpireBuilding): boolean => !!p && p.x >= b.x && p.x < b.x + b.size && p.y >= b.y && p.y < b.y + b.size;
  for (const b of store.buildings.values()) {
    if (inside(g0, b) || inside(g1, b)) return { kind: 'building', e: b };
  }
  if (g0) {
    for (const n of store.nodes.values()) {
      if (n.a <= 0 || !isTileExplored(store, n.x, n.y)) continue;
      if (Math.hypot(g0.x - n.x - 0.5, g0.y - n.y - 0.5) < 0.9) return { kind: 'node', e: n };
    }
  }
  return null;
}

// Own units (or, failing that, own buildings) whose screen position falls inside the rectangle.
export function boxSelect(store: EmpireStore, view: PickView, x0: number, y0: number, x1: number, y1: number): number[] {
  const lx = Math.min(x0, x1), hx = Math.max(x0, x1), ly = Math.min(y0, y1), hy = Math.max(y0, y1);
  const ids: number[] = [];
  for (const u of store.units.values()) {
    if (!isMine(store, u.o)) continue;
    view.project(u.x + u.dx, u.y + u.dy, UNIT_PICK_HEIGHT, _p);
    if (_p.ok && _p.x >= lx && _p.x <= hx && _p.y >= ly && _p.y <= hy) ids.push(u.i);
  }
  if (ids.length) return ids;
  for (const b of store.buildings.values()) {
    if (!isMine(store, b.o)) continue;
    view.project(b.x + b.size / 2, b.y + b.size / 2, 0.5, _p);
    if (_p.ok && _p.x >= lx && _p.x <= hx && _p.y >= ly && _p.y <= hy) ids.push(b.i);
  }
  return ids;
}

// Every own unit of a kind currently on screen (double click).
export function visibleOfKind(store: EmpireStore, view: PickView, kind: string, vw: number, vh: number): number[] {
  const ids: number[] = [];
  for (const u of store.units.values()) {
    if (u.k !== kind || !isMine(store, u.o)) continue;
    view.project(u.x, u.y, UNIT_PICK_HEIGHT, _p);
    if (_p.ok && _p.x >= 0 && _p.x <= vw && _p.y >= 0 && _p.y <= vh) ids.push(u.i);
  }
  return ids;
}

export interface SelectionInfo {
  units: EmpireUnit[];
  buildings: EmpireBuilding[];
  node: EmpireNode | null;
}

export function selectionInfo(store: EmpireStore): SelectionInfo {
  const units: EmpireUnit[] = [];
  const buildings: EmpireBuilding[] = [];
  let node: EmpireNode | null = null;
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

// Spy report for one of our infiltrators, if the server sent one.
export function spyReportFor(store: EmpireStore, unitId: number): SpyReport | null {
  return store.spy.find((r) => r.unitId === unitId) || null;
}
