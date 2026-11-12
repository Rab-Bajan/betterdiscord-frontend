// Top-down minimap (Canvas 2D): terrain bitmap, fog, entities, pings and the 3D camera footprint.
import { TILE_CODE, playerColor, isAllied, isUnitShown } from './empireStore.ts';
import type { EmpireStore, Vec2 } from '../types.ts';

type Rgb = readonly [number, number, number];

const GROUND: Readonly<Record<number, Rgb>> = {
  [TILE_CODE.g]: [88, 94, 62],
  [TILE_CODE.d]: [92, 72, 52],
  [TILE_CODE.r]: [104, 100, 94],
  [TILE_CODE.c]: [128, 128, 124],
  [TILE_CODE.w]: [44, 66, 78],
  [TILE_CODE.x]: [78, 70, 64]
};

const GROUND_DEFAULT: Rgb = [88, 94, 62];

function terrainBitmap(store: EmpireStore, codes: Uint8Array): HTMLCanvasElement {
  const { w, h } = store.map;
  if (store._miniTerrain && store._miniTerrainVer === store.terrainVersion) return store._miniTerrain;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const cx = c.getContext('2d');
  if (!cx) return c;
  const img = cx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const col = GROUND[codes[i] ?? 0] || GROUND_DEFAULT;
    const n = ((i * 2654435761) >>> 0) % 13 - 6;
    img.data[i * 4] = col[0] + n; img.data[i * 4 + 1] = col[1] + n; img.data[i * 4 + 2] = col[2] + n; img.data[i * 4 + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  store._miniTerrain = c; store._miniTerrainVer = store.terrainVersion;
  return c;
}

function fogBitmap(store: EmpireStore, visible: Uint8Array, explored: Uint8Array): HTMLCanvasElement | null {
  const { w, h } = store.map;
  if (!store._fog || !store._fogImg || store._fog.width !== w || store._fog.height !== h) {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const fctx = canvas.getContext('2d');
    if (!fctx) return null;
    store._fog = canvas;
    store._fogImg = fctx.createImageData(w, h);
    store._fogVer = -1;
  }
  if (store._fogVer !== store.fogVersion) {
    const d = store._fogImg.data;
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      d[o] = 6; d[o + 1] = 7; d[o + 2] = 18;
      d[o + 3] = visible[i] ? 0 : explored[i] ? 115 : 255;
    }
    store._fog.getContext('2d')?.putImageData(store._fogImg, 0, 0);
    store._fogVer = store.fogVersion;
  }
  return store._fog;
}

// world (wx, wy) -> minimap px: mx = ox + wx * s, my = oy + wy * s
export interface MiniGeometry {
  s: number;
  ox: number;
  oy: number;
}

export function miniGeometry(store: EmpireStore, cw: number, ch: number): MiniGeometry {
  const { w, h } = store.map;
  const pad = 3;
  const s = Math.min((cw - pad * 2) / Math.max(1, w), (ch - pad * 2) / Math.max(1, h));
  return { s, ox: (cw - w * s) / 2, oy: (ch - h * s) / 2 };
}

export function miniToWorld<T extends Vec2>(store: EmpireStore, cw: number, ch: number, mx: number, my: number, out: T): T {
  const g = miniGeometry(store, cw, ch);
  out.x = Math.max(0, Math.min(store.map.w, (mx - g.ox) / g.s));
  out.y = Math.max(0, Math.min(store.map.h, (my - g.oy) / g.s));
  return out;
}

export function renderMinimap(ctx: CanvasRenderingContext2D, store: EmpireStore, cw: number, ch: number, dpr: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#05060f'; ctx.fillRect(0, 0, cw, ch);
  const { w, h } = store.map;
  const { codes, visible, explored } = store;
  if (!w || !codes || !visible || !explored) return;
  const g = miniGeometry(store, cw, ch);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(terrainBitmap(store, codes), g.ox, g.oy, w * g.s, h * g.s);
  ctx.imageSmoothingEnabled = true;
  const fog = fogBitmap(store, visible, explored);
  if (fog) ctx.drawImage(fog, g.ox, g.oy, w * g.s, h * g.s);
  const mx = (wx: number): number => g.ox + wx * g.s;
  const my = (wy: number): number => g.oy + wy * g.s;
  for (const n of store.nodes.values()) {
    if (n.a <= 0 || !explored[Math.floor(n.y) * w + Math.floor(n.x)]) continue;
    ctx.fillStyle = n.k === 'iron' ? '#9aa3bd' : n.k === 'copper' ? '#d98746' : n.k === 'food' ? '#e0b04a' : '#7d9a52';
    ctx.fillRect(mx(n.x + 0.5) - 1, my(n.y + 0.5) - 1, 2, 2);
  }
  for (const b of store.buildings.values()) {
    ctx.fillStyle = playerColor(store, b.o);
    const sz = Math.max(3, b.size * g.s);
    ctx.fillRect(mx(b.x + b.size / 2) - sz / 2, my(b.y + b.size / 2) - sz / 2, sz, sz);
  }
  for (const u of store.units.values()) {
    if (!isAllied(store, u.o) && !isUnitShown(store, u)) continue;
    ctx.fillStyle = playerColor(store, u.o);
    ctx.fillRect(mx(u.x) - 1.1, my(u.y) - 1.1, 2.2, 2.2);
  }
  for (const p of store.pings) {
    const k = (store.time - p.t0) / 3;
    ctx.strokeStyle = p.kind === 'alert' ? '#E94B64' : '#536CFF'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(mx(p.x), my(p.y), 3 + k * 8, 0, 6.2832); ctx.stroke();
  }
  // camera footprint: the four screen corners projected onto the ground by the 3D view
  const q = store.viewQuad;
  if (q) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.2; ctx.beginPath();
    ctx.moveTo(mx(q[0] ?? 0), my(q[1] ?? 0));
    for (let i = 1; i < 4; i++) ctx.lineTo(mx(q[i * 2] ?? 0), my(q[i * 2 + 1] ?? 0));
    ctx.closePath(); ctx.stroke();
  }
}
