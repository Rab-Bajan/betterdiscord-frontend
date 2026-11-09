// Canvas 2D renderer: cached terrain chunks, fog bitmap, depth-sorted entities, overlays, minimap.
import { HW, HH, worldToScreen } from './empireMath.js';
import { TILE_CODE, playerColor, playerOf, isMine, isAllied, isTileVisible } from './empireStore.js';
import { buildingSize } from './empireContent.js';
import { drawUnitSprite, drawBuildingSprite, drawNodeSprite, drawProjectile, shade } from './empireSprites.js';

const CH = 8; // chunk edge in tiles
const CHUNK_W = CH * 2 * HW;
const TOP_MARGIN = 44;
const CHUNK_H = CH * 2 * HH + TOP_MARGIN;

const GROUND = {
  [TILE_CODE.g]: [[63, 122, 74], [58, 114, 69], [70, 131, 80]],
  [TILE_CODE.d]: [[140, 108, 70], [132, 100, 64], [150, 118, 78]],
  [TILE_CODE.r]: [[74, 78, 96], [68, 72, 90], [80, 84, 102]],
  [TILE_CODE.c]: [[140, 145, 164], [132, 137, 156], [148, 153, 172]],
  [TILE_CODE.w]: [[43, 94, 158], [38, 86, 148], [50, 104, 168]],
  [TILE_CODE.x]: [[112, 96, 80], [104, 90, 74], [120, 104, 88]]
};

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function diamond(ctx, x, y) { // (x,y) = top vertex
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + HW, y + HH); ctx.lineTo(x, y + 2 * HH); ctx.lineTo(x - HW, y + HH); ctx.closePath();
}

function buildChunk(store, cx, cy) {
  const c = document.createElement('canvas');
  c.width = CHUNK_W; c.height = CHUNK_H;
  const ctx = c.getContext('2d');
  const { w, h } = store.map;
  const a0 = cx * CH, b0 = cy * CH;
  const ox = (a0 - b0 - CH) * HW, oy = (a0 + b0) * HH - TOP_MARGIN;
  for (let s = 0; s < CH * 2; s++) { // back-to-front so ruins overlap correctly
    for (let a = a0; a < a0 + CH; a++) {
      const b = b0 + (s - (a - a0));
      if (b < b0 || b >= b0 + CH || a >= w || b >= h) continue;
      const code = store.codes[b * w + a];
      const r = hash(a, b);
      const pal = GROUND[code] || GROUND[0];
      const col = pal[(r * 3) | 0];
      const x = (a - b) * HW - ox, y = (a + b) * HH - oy;
      ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1;
      diamond(ctx, x, y); ctx.fill(); ctx.stroke();
      if (code === TILE_CODE.g) {
        ctx.strokeStyle = 'rgba(30,80,45,0.55)'; ctx.lineWidth = 1; ctx.beginPath();
        for (let i = 0; i < 2; i++) { const px = x + (hash(a + i, b * 3) - 0.5) * 36, py = y + 8 + hash(a * 5, b + i) * 16; ctx.moveTo(px, py); ctx.lineTo(px - 1, py - 4); ctx.moveTo(px, py); ctx.lineTo(px + 2, py - 3); }
        ctx.stroke();
      } else if (code === TILE_CODE.r) {
        ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(x - 3 + (r - 0.5) * 20, y + 14 + (r - 0.5) * 6, 6, 1.6);
      } else if (code === TILE_CODE.c) {
        ctx.strokeStyle = 'rgba(70,75,95,0.55)'; diamond(ctx, x, y); ctx.stroke();
      } else if (code === TILE_CODE.w) {
        ctx.strokeStyle = 'rgba(190,225,255,0.35)'; ctx.beginPath();
        const px = x + (r - 0.5) * 24; ctx.moveTo(px - 6, y + 16); ctx.quadraticCurveTo(px, y + 12, px + 6, y + 16); ctx.stroke();
      } else if (code === TILE_CODE.x) { // collapsed panel-block rubble
        for (let i = 0; i < 3; i++) {
          const px = x + (hash(a + i * 7, b) - 0.5) * 30, py = y + 9 + hash(a, b + i * 11) * 10, hh = 6 + hash(a + i, b + i) * 10;
          ctx.fillStyle = i % 2 ? '#9a8e84' : '#82776e'; ctx.fillRect(px - 5, py - hh, 10, hh);
          ctx.fillStyle = '#b8aea4'; ctx.fillRect(px - 5, py - hh, 10, 2.4);
        }
        ctx.strokeStyle = '#5a5048'; ctx.lineWidth = 1.4; ctx.beginPath(); const px = x + (r - 0.5) * 20; ctx.moveTo(px, y + 6); ctx.lineTo(px + 3, y - 12); ctx.stroke();
      }
    }
  }
  return { canvas: c, ox, oy };
}

function terrainChunk(store, cx, cy) {
  if (store._terrainVer !== store.terrainVersion) { store._terrain = new Map(); store._terrainVer = store.terrainVersion; }
  const key = cx * 4096 + cy;
  let ch = store._terrain.get(key);
  if (!ch) { ch = buildChunk(store, cx, cy); store._terrain.set(key, ch); }
  return ch;
}

function drawTerrain(ctx, store, vw, vh) {
  const cam = store.camera;
  const z = cam.zoom;
  const { w, h } = store.map;
  const ncx = Math.ceil(w / CH), ncy = Math.ceil(h / CH);
  const order = [];
  for (let cy = 0; cy < ncy; cy++) for (let cx = 0; cx < ncx; cx++) order.push([cx + cy, cx, cy]);
  order.sort((a, b) => a[0] - b[0]);
  ctx.imageSmoothingEnabled = true;
  for (const [, cx, cy] of order) {
    const a0 = cx * CH, b0 = cy * CH;
    const ox = (a0 - b0 - CH) * HW, oy = (a0 + b0) * HH - TOP_MARGIN;
    const sx = (ox - cam.x) * z + vw / 2, sy = (oy - cam.y) * z + vh / 2;
    if (sx > vw || sy > vh || sx + CHUNK_W * z < 0 || sy + CHUNK_H * z < 0) continue; // cull
    const ch = terrainChunk(store, cx, cy);
    ctx.drawImage(ch.canvas, sx, sy, CHUNK_W * z + 0.5, CHUNK_H * z + 0.5);
  }
}

// ---- fog bitmap: one pixel per tile, drawn through the iso affine transform ----
function refreshFogCanvas(store) {
  const { w, h } = store.map;
  if (!store._fog || store._fog.width !== w || store._fog.height !== h) {
    store._fog = document.createElement('canvas'); store._fog.width = w; store._fog.height = h;
    store._fogImg = store._fog.getContext('2d').createImageData(w, h);
    store._fogVer = -1;
  }
  if (store._fogVer === store.fogVersion) return;
  const d = store._fogImg.data;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    d[o] = 6; d[o + 1] = 7; d[o + 2] = 18;
    d[o + 3] = store.visible[i] ? 0 : store.explored[i] ? 115 : 255;
  }
  store._fog.getContext('2d').putImageData(store._fogImg, 0, 0);
  store._fogVer = store.fogVersion;
}

function drawFog(ctx, store, vw, vh, dpr) {
  refreshFogCanvas(store);
  const cam = store.camera, z = cam.zoom;
  ctx.save();
  // (wx,wy) -> screen: x = ((wx-wy)*HW - cam.x)*z + vw/2 ; y = ((wx+wy)*HH - cam.y)*z + vh/2
  ctx.setTransform(HW * z * dpr, HH * z * dpr, -HW * z * dpr, HH * z * dpr, (vw / 2 - cam.x * z) * dpr, (vh / 2 - cam.y * z) * dpr);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(store._fog, 0, 0);
  ctx.restore();
}

// ---- entity pass ----
const drawList = [];
const sp = { x: 0, y: 0 };
const cmp = (a, b) => a._d - b._d;

function hpBar(ctx, x, y, frac, color, w) {
  ctx.fillStyle = 'rgba(8,9,24,0.85)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
  ctx.fillStyle = frac > 0.6 ? '#28C997' : frac > 0.3 ? '#f5b041' : '#E94B64';
  ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, frac)), 3);
  ctx.fillStyle = color; ctx.fillRect(x - w / 2 - 1, y - 2, 3, 2);
}

function ring(ctx, x, y, rx, ry, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 6.2832); ctx.stroke();
}

function footprint(ctx, bx, by, size, color, fill) {
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + size * HW, by + size * HH); ctx.lineTo(bx, by + 2 * size * HH); ctx.lineTo(bx - size * HW, by + size * HH); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (color) { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke(); }
}

function drawEntities(ctx, store, vw, vh, view) {
  const cam = store.camera, z = cam.zoom, t = store.time;
  const m = 70 * z;
  let n = 0;
  drawList.length = 0;
  for (const nd of store.nodes.values()) {
    if (nd.a <= 0) continue;
    worldToScreen(cam, vw, vh, nd.x + 0.5, nd.y + 0.5, sp);
    if (sp.x < -m || sp.x > vw + m || sp.y < -m || sp.y > vh + m * 1.5) continue;
    nd._d = nd.x + nd.y + 1; nd._t = 0; drawList[n++] = nd;
  }
  for (const b of store.buildings.values()) {
    worldToScreen(cam, vw, vh, b.x + b.size / 2, b.y + b.size / 2, sp);
    const r = (b.size * HW + 20) * z;
    if (sp.x < -r || sp.x > vw + r || sp.y < -r * 1.5 || sp.y > vh + r) continue;
    b._d = b.x + b.y + b.size; b._t = 1; drawList[n++] = b;
  }
  for (const u of store.units.values()) {
    if (!isAllied(store, u.o) && !isTileVisible(store, u.x, u.y)) continue;
    worldToScreen(cam, vw, vh, u.x + u.dx, u.y + u.dy, sp);
    if (sp.x < -m || sp.x > vw + m || sp.y < -m || sp.y > vh + m) continue;
    u._d = u.x + u.dx + u.y + u.dy; u._t = 2; drawList[n++] = u;
  }
  if (view.ghost) { view.ghost._d = view.ghost.x + view.ghost.y + view.ghost.size; view.ghost._t = 1; drawList[n++] = view.ghost; }
  drawList.sort(cmp);

  // ground layer: selection rings and footprints go under the sprites
  for (const id of store.selection) {
    const u = store.units.get(id);
    if (u) {
      worldToScreen(cam, vw, vh, u.x + u.dx, u.y + u.dy, sp);
      const big = u.k === 'lada' || u.k === 'horseWagon' || u.k === 'ram';
      ring(ctx, sp.x, sp.y, (big ? 17 : 10) * z, (big ? 7 : 4.5) * z, isMine(store, u.o) ? '#28C997' : '#E94B64');
      continue;
    }
    const b = store.buildings.get(id);
    if (b) {
      worldToScreen(cam, vw, vh, b.x, b.y, sp);
      ctx.save(); ctx.translate(sp.x, sp.y); ctx.scale(z, z);
      footprint(ctx, 0, 0, b.size, isMine(store, b.o) ? '#28C997' : '#E94B64', 'rgba(255,255,255,0.08)');
      ctx.restore();
      continue;
    }
    const nd = store.nodes.get(id);
    if (nd) { worldToScreen(cam, vw, vh, nd.x + 0.5, nd.y + 0.5, sp); ring(ctx, sp.x, sp.y, 16 * z, 7 * z, '#f5b041'); }
  }
  if (view.hoverTarget) { // hover highlight of the entity under the cursor
    const e = view.hoverTarget;
    if (e.size) { worldToScreen(cam, vw, vh, e.x, e.y, sp); ctx.save(); ctx.translate(sp.x, sp.y); ctx.scale(z, z); footprint(ctx, 0, 0, e.size, 'rgba(255,255,255,0.5)'); ctx.restore(); }
    else if (e.k && e.o !== undefined) { worldToScreen(cam, vw, vh, e.x + e.dx, e.y + e.dy, sp); ring(ctx, sp.x, sp.y, 11 * z, 5 * z, 'rgba(255,255,255,0.55)'); }
  }

  for (let i = 0; i < n; i++) {
    const e = drawList[i];
    if (e._t === 0) {
      worldToScreen(cam, vw, vh, e.x + 0.5, e.y + 0.5, sp);
      ctx.save(); ctx.translate(sp.x, sp.y + 4 * z); ctx.scale(z, z); drawNodeSprite(ctx, e, t); ctx.restore();
    } else if (e._t === 1) {
      worldToScreen(cam, vw, vh, e.x, e.y, sp);
      const owner = playerOf(store, e.o);
      const color = playerColor(store, e.o);
      ctx.save(); ctx.translate(sp.x, sp.y); ctx.scale(z, z);
      if (e === view.ghost) ctx.globalAlpha = 0.6;
      else if (e.bp < 100) ctx.globalAlpha = 0.9;
      drawBuildingSprite(ctx, e.k, e.size, color, t, e.bp, owner?.epoch ?? (isMine(store, e.o) ? store.res.epoch : 1));
      if (e.flash > t) { ctx.globalAlpha = 0.35; ctx.fillStyle = '#fff'; footprint(ctx, 0, 0, e.size, null, 'rgba(255,255,255,0.35)'); }
      ctx.restore();
    } else {
      worldToScreen(cam, vw, vh, e.x + e.dx, e.y + e.dy, sp);
      const color = playerColor(store, e.o);
      const moving = e.v > 0 && (e.x !== e.tx || e.y !== e.ty);
      ctx.save(); ctx.translate(sp.x, sp.y); ctx.scale(z * e.face, z);
      if (e.flash > t) ctx.filter = 'brightness(1.9)';
      drawUnitSprite(ctx, e, color, t, moving);
      ctx.restore();
    }
  }

  // health and progress bars over damaged / selected / hovered entities
  for (let i = 0; i < n; i++) {
    const e = drawList[i];
    if (e._t === 0 || e === view.ghost) continue;
    const sel = store.selection.has(e.i) || e === view.hoverTarget;
    if (e._t === 1) {
      const dmg = e.hp < e.mhp;
      if (!sel && !dmg && e.bp >= 100) continue;
      worldToScreen(cam, vw, vh, e.x + e.size / 2, e.y + e.size / 2, sp);
      const y = sp.y - (e.size * HH + 36) * z;
      if (e.bp < 100) hpBar(ctx, sp.x, y, e.bp / 100, '#536CFF', 36 * z + 12);
      else hpBar(ctx, sp.x, y, e.hp / e.mhp, playerColor(store, e.o), 36 * z + 12);
    } else {
      if (!sel && e.hp >= e.mhp) continue;
      worldToScreen(cam, vw, vh, e.x + e.dx, e.y + e.dy, sp);
      const big = e.k === 'lada' || e.k === 'horseWagon' || e.k === 'ram';
      hpBar(ctx, sp.x, sp.y - (big ? 26 : 30) * z, e.hp / e.mhp, playerColor(store, e.o), 24 * z + 4);
    }
  }
}

function drawFxLayer(ctx, store, vw, vh) {
  const cam = store.camera, z = cam.zoom, t = store.time;
  for (const p of store.projectiles) {
    const f = (t - p.t0) / p.dur;
    if (f < 0 || f > 1) continue;
    worldToScreen(cam, vw, vh, p.x + (p.tx - p.x) * f, p.y + (p.ty - p.y) * f, sp);
    ctx.save(); ctx.translate(sp.x, sp.y - 14 * z); ctx.scale(z, z);
    drawProjectile(ctx, p.k, 0, 0, Math.sin(f * Math.PI) * 6);
    ctx.restore();
  }
  for (const f of store.fx) { // dust puff where something fell
    const k = (t - f.t0) / f.dur;
    worldToScreen(cam, vw, vh, f.x, f.y, sp);
    ctx.fillStyle = `rgba(180,175,190,${0.55 * (1 - k)})`;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(sp.x + (i - 1.5) * 7 * z * (0.6 + k), sp.y - (6 + k * 16 + i * 2) * z, (4 + k * 6) * z, 0, 6.2832); ctx.fill(); }
  }
  for (const p of store.pings) {
    const k = (t - p.t0) / (p.kind === 'alert' ? 3 : 2.5);
    worldToScreen(cam, vw, vh, p.x, p.y, sp);
    const r = (10 + k * 34) * z;
    ctx.strokeStyle = p.kind === 'alert' ? `rgba(233,75,100,${1 - k})` : `rgba(83,108,255,${1 - k})`;
    ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(sp.x, sp.y, r, r / 2, 0, 0, 6.2832); ctx.stroke();
  }
  for (const m of store.moveMarks || []) {
    const k = (t - m.t0) / 0.8;
    if (k > 1) continue;
    worldToScreen(cam, vw, vh, m.x, m.y, sp);
    ctx.strokeStyle = `${m.color}${Math.round((1 - k) * 255).toString(16).padStart(2, '0')}`;
    ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sp.x, sp.y, (12 - k * 6) * z, (6 - k * 3) * z, 0, 0, 6.2832); ctx.stroke();
  }
}

// view: { vw, vh, dpr, ghost, hoverTarget, box: {x0,y0,x1,y1}|null }
export function renderFrame(ctx, store, view) {
  const { vw, vh, dpr } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#05060f';
  ctx.fillRect(0, 0, vw, vh);
  if (!store.map.w) return;
  drawTerrain(ctx, store, vw, vh);
  if (view.ghostFootprint) {
    const g = view.ghostFootprint;
    worldToScreen(store.camera, vw, vh, g.x, g.y, sp);
    ctx.save(); ctx.translate(sp.x, sp.y); ctx.scale(store.camera.zoom, store.camera.zoom);
    footprint(ctx, 0, 0, g.size, g.ok ? '#28C997' : '#E94B64', g.ok ? 'rgba(40,201,151,0.28)' : 'rgba(233,75,100,0.32)');
    ctx.restore();
  }
  drawEntities(ctx, store, vw, vh, view);
  drawFxLayer(ctx, store, vw, vh);
  drawFog(ctx, store, vw, vh, dpr);
  if (view.box) {
    const b = view.box;
    ctx.fillStyle = 'rgba(40,201,151,0.12)'; ctx.strokeStyle = 'rgba(40,201,151,0.85)'; ctx.lineWidth = 1;
    ctx.fillRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
    ctx.strokeRect(Math.min(b.x0, b.x1) + 0.5, Math.min(b.y0, b.y1) + 0.5, Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
  }
}

// ---------------- minimap ----------------
function terrainBitmap(store) {
  const { w, h } = store.map;
  if (store._miniTerrain && store._miniTerrainVer === store.terrainVersion) return store._miniTerrain;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const cx = c.getContext('2d'); const img = cx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const col = (GROUND[store.codes[i]] || GROUND[0])[0];
    img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  store._miniTerrain = c; store._miniTerrainVer = store.terrainVersion;
  return c;
}

// minimap iso -> pixels: returns scale and offset so world (wx,wy) maps to
// mx = ((wx-wy)*HW + mapH*HW) * s + pad, my = ((wx+wy)*HH) * s + pad
export function miniGeometry(store, cw, ch) {
  const { w, h } = store.map;
  const pad = 4;
  const iw = (w + h) * HW, ih = (w + h) * HH;
  const s = Math.min((cw - pad * 2) / iw, (ch - pad * 2) / ih);
  return { s, ox: pad + ((cw - pad * 2) - iw * s) / 2 + h * HW * s, oy: pad + ((ch - pad * 2) - ih * s) / 2 };
}

export function miniToWorld(store, cw, ch, mx, my, out) {
  const g = miniGeometry(store, cw, ch);
  const ix = (mx - g.ox) / g.s, iy = (my - g.oy) / g.s;
  out.x = iy / (2 * HH) + ix / (2 * HW);
  out.y = iy / (2 * HH) - ix / (2 * HW);
  return out;
}

export function renderMinimap(ctx, store, cw, ch, dpr, vw, vh) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#05060f'; ctx.fillRect(0, 0, cw, ch);
  const { w, h } = store.map;
  if (!w) return;
  refreshFogCanvas(store);
  const g = miniGeometry(store, cw, ch);
  const a = HW * g.s, d = HH * g.s;
  ctx.save();
  ctx.transform(a, d, -a, d, g.ox, g.oy);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(terrainBitmap(store), 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(store._fog, 0, 0);
  ctx.restore();
  const mx = (wx, wy) => g.ox + (wx - wy) * HW * g.s;
  const my = (wx, wy) => g.oy + (wx + wy) * HH * g.s;
  for (const b of store.buildings.values()) {
    ctx.fillStyle = playerColor(store, b.o);
    ctx.fillRect(mx(b.x + b.size / 2, b.y + b.size / 2) - 2.5, my(b.x + b.size / 2, b.y + b.size / 2) - 2.5, 5, 5);
  }
  for (const u of store.units.values()) {
    if (!isAllied(store, u.o) && !isTileVisible(store, u.x, u.y)) continue;
    ctx.fillStyle = playerColor(store, u.o);
    ctx.fillRect(mx(u.x, u.y) - 1, my(u.x, u.y) - 1, 2.2, 2.2);
  }
  for (const p of store.pings) {
    const k = (store.time - p.t0) / 3;
    ctx.strokeStyle = p.kind === 'alert' ? '#E94B64' : '#536CFF'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(mx(p.x, p.y), my(p.x, p.y), 3 + k * 8, 0, 6.2832); ctx.stroke();
  }
  // viewport outline (the screen rectangle mapped back to the ground plane)
  const cam = store.camera;
  const corner = (sx, sy) => {
    const ix = (sx - vw / 2) / cam.zoom + cam.x, iy = (sy - vh / 2) / cam.zoom + cam.y;
    return [g.ox + ix * g.s, g.oy + iy * g.s];
  };
  const c = [corner(0, 0), corner(vw, 0), corner(vw, vh), corner(0, vh)];
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.2; ctx.beginPath();
  ctx.moveTo(c[0][0], c[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(c[i][0], c[i][1]); ctx.closePath(); ctx.stroke();
}

export { shade, buildingSize };
