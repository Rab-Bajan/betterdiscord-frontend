// Procedural sprites. All drawing is in local pixel space at zoom 1 with the origin at the
// entity's ground point; callers translate/scale. People are neutral geometric figures whose only
// identity is clothing in the owner's colour.
import { HW, HH } from './empireMath.js';

const shadeCache = new Map();
// Lighten (f>0) or darken (f<0) a #rrggbb colour; memoised so per-frame calls do not allocate strings.
export function shade(hex, f) {
  const key = hex + f;
  let v = shadeCache.get(key);
  if (v) return v;
  let h = typeof hex === 'string' && hex[0] === '#' ? hex.slice(1) : '888888';
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16) || 0;
  const ch = (s) => {
    const c = (n >> s) & 255;
    return Math.max(0, Math.min(255, Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f))));
  };
  v = `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  shadeCache.set(key, v);
  return v;
}

const HEAD = '#d9d5ee';
const DARK = '#1c2038';
const STEEL = '#b9c0d8';
const WOOD = '#8a5a34';

export const RES_PILE_COLORS = { iron: '#9aa3bd', copper: '#d98746', food: '#e0b04a', wood: '#8a5a34' };

function ell(ctx, x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 6.2832); ctx.fill(); }
function rect(ctx, x, y, w, h) { ctx.fillRect(x, y, w, h); }
function line(ctx, x0, y0, x1, y1, w, c) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
function wheel(ctx, x, y, r) {
  ctx.fillStyle = DARK; ell(ctx, x, y, r, r);
  ctx.fillStyle = '#7f86a6'; ell(ctx, x, y, r * 0.45, r * 0.45);
}

function figure(ctx, color, s, bob, legPhase) {
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ell(ctx, 0, 1, 6 * s, 2.6 * s);
  const sw = Math.sin(legPhase) * 2 * s;
  line(ctx, -2 * s, -6 * s + bob, -2 * s + sw, 0, 2.2 * s, DARK);
  line(ctx, 2 * s, -6 * s + bob, 2 * s - sw, 0, 2.2 * s, DARK);
  ctx.fillStyle = color; ctx.beginPath();
  ctx.roundRect(-4 * s, -16 * s + bob, 8 * s, 11 * s, 2.5 * s); ctx.fill();
  ctx.fillStyle = shade(color, -0.3); rect(ctx, -4 * s, -8 * s + bob, 8 * s, 1.6 * s);
  ctx.fillStyle = HEAD; ell(ctx, 0, -19.5 * s + bob, 3.4 * s, 3.4 * s);
}

// kind-specific accessory drawers; (ctx, u, color, bob, t)
const UNIT_DRAW = {
  scavenger(ctx, u, color, bob, t) {
    figure(ctx, color, 1, bob, t * 9 + u.ph);
    // wheelbarrow in front: tray, handles, one wheel
    ctx.fillStyle = '#5d6283'; ctx.beginPath(); ctx.moveTo(4, -9 + bob); ctx.lineTo(15, -9 + bob); ctx.lineTo(12, -3); ctx.lineTo(6, -3); ctx.fill();
    if (u.c > 0) { ctx.fillStyle = RES_PILE_COLORS[u.ct] || '#aaa'; ell(ctx, 9.5, -10 + bob, 4.8, 2.4); }
    line(ctx, 4, -9 + bob, -2, -9 + bob, 1.4, WOOD);
    wheel(ctx, 14, -2.5, 3);
  },
  builder(ctx, u, color, bob, t) {
    figure(ctx, color, 1, bob, t * 9 + u.ph);
    ctx.fillStyle = '#f5c542'; ctx.beginPath(); ctx.ellipse(0, -22 + bob, 4.3, 2.6, 0, Math.PI, 0); ctx.fill(); rect(ctx, -5, -22.2 + bob, 10, 1.4);
    const sw = u.st === 'build' || u.st === 'repair' ? Math.sin(t * 12 + u.ph) * 4 : 0;
    line(ctx, 4, -11 + bob, 9 + sw, -16 + bob, 1.6, WOOD);
    ctx.fillStyle = STEEL; rect(ctx, 7 + sw, -19 + bob, 5, 3);
  },
  knife(ctx, u, color, bob, t) {
    figure(ctx, color, 1, bob, t * 11 + u.ph);
    const sw = u.st === 'attack' ? Math.sin(t * 14 + u.ph) * 3 : 0;
    line(ctx, 4, -10 + bob, 9 + sw, -15 + bob, 1.6, STEEL);
    line(ctx, 3, -10 + bob, 5, -9 + bob, 2, WOOD);
  },
  brawler(ctx, u, color, bob, t) {
    figure(ctx, color, 1.3, bob, t * 8 + u.ph);
    ctx.fillStyle = shade(color, -0.35); rect(ctx, -7, -17 + bob, 14, 3.5); // broad shoulders
    ctx.fillStyle = '#d23a50';
    const sw = u.st === 'attack' ? Math.sin(t * 12 + u.ph) * 3 : 0;
    ell(ctx, 8 + sw, -12 + bob, 3.6, 3.6); ell(ctx, -8, -12 + bob, 3.6, 3.6); // gloves
  },
  slingshot(ctx, u, color, bob, t) {
    figure(ctx, color, 0.85, bob, t * 12 + u.ph);
    line(ctx, 4, -10 + bob, 8, -17 + bob, 1.4, WOOD);
    line(ctx, 8, -17 + bob, 6, -20 + bob, 1.4, WOOD); line(ctx, 8, -17 + bob, 11, -20 + bob, 1.4, WOOD);
    line(ctx, 6, -20 + bob, 11, -20 + bob, 0.8, '#d9d5ee');
  },
  airgunner(ctx, u, color, bob, t) {
    figure(ctx, color, 1, bob, t * 9 + u.ph);
    line(ctx, -3, -10 + bob, 15, -13 + bob, 2, '#3a3f5c');
    line(ctx, 9, -12.4 + bob, 15, -13 + bob, 1, STEEL);
    ctx.fillStyle = shade(color, 0.25); rect(ctx, -4, -22 + bob, 8, 2); // cap
  },
  horseWagon(ctx, u, color, bob, t) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ell(ctx, 4, 1, 17, 4);
    const gait = Math.sin(t * 10 + u.ph);
    // horse
    ctx.fillStyle = '#7a5538'; ell(ctx, 14, -9 + bob, 7, 4); // body
    ctx.beginPath(); ctx.moveTo(18, -11 + bob); ctx.lineTo(23, -18 + bob); ctx.lineTo(25, -16 + bob); ctx.lineTo(21, -8 + bob); ctx.fill(); // neck+head
    line(ctx, 11, -6 + bob, 11 + gait * 2, 0, 1.6, '#5a3d28'); line(ctx, 17, -6 + bob, 17 - gait * 2, 0, 1.6, '#5a3d28');
    line(ctx, 8, -9 + bob, 4, -6 + bob, 1.4, '#3a2a1c');
    // wagon: painted box, canvas roof, two wheels
    ctx.fillStyle = color; rect(ctx, -12, -13 + bob, 18, 8);
    ctx.fillStyle = shade(color, -0.35); rect(ctx, -12, -8 + bob, 18, 2);
    ctx.fillStyle = '#d8d2bd'; ctx.beginPath(); ctx.ellipse(-3, -13 + bob, 9, 4, 0, Math.PI, 0); ctx.fill();
    wheel(ctx, -8, -2, 3.6); wheel(ctx, 3, -2, 3.6);
  },
  lada(ctx, u, color, bob) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ell(ctx, 0, 1, 17, 4.5);
    ctx.fillStyle = color; // boxy hatchback body
    ctx.beginPath(); ctx.moveTo(-15, -4 + bob); ctx.lineTo(-15, -11 + bob); ctx.lineTo(-8, -12 + bob); ctx.lineTo(-5, -18 + bob);
    ctx.lineTo(7, -18 + bob); ctx.lineTo(11, -12 + bob); ctx.lineTo(16, -11 + bob); ctx.lineTo(16, -4 + bob); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#bfe3ff'; ctx.beginPath(); ctx.moveTo(-6, -12.5 + bob); ctx.lineTo(-4, -17 + bob); ctx.lineTo(1, -17 + bob); ctx.lineTo(1, -12.5 + bob); ctx.fill();
    ctx.beginPath(); ctx.moveTo(3, -12.5 + bob); ctx.lineTo(3, -17 + bob); ctx.lineTo(7, -17 + bob); ctx.lineTo(9.5, -12.5 + bob); ctx.fill();
    ctx.fillStyle = shade(color, -0.35); rect(ctx, -15, -6.5 + bob, 31, 1.6);
    ctx.fillStyle = '#ffe9a0'; rect(ctx, 14, -10 + bob, 2.4, 2.4);
    wheel(ctx, -9, -3, 3.8); wheel(ctx, 9, -3, 3.8);
  },
  grinder(ctx, u, color, bob, t) {
    figure(ctx, color, 1, bob, t * 10 + u.ph);
    ctx.fillStyle = '#ff9d2e'; rect(ctx, 3, -13 + bob, 7, 4); // angle grinder body
    ctx.fillStyle = STEEL; ell(ctx, 12, -11 + bob, 3.8, 3.8);
    if (u.st === 'attack') {
      ctx.fillStyle = '#ffd35a';
      for (let i = 0; i < 4; i++) { const a = t * 30 + i * 1.7; ell(ctx, 14 + Math.cos(a) * 4, -11 + bob + Math.sin(a) * 4, 0.9, 0.9); }
    }
    ctx.fillStyle = '#30345a'; rect(ctx, -4, -23 + bob, 8, 2.4); // visor
  },
  ram(ctx, u, color, bob) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ell(ctx, 2, 1, 19, 4.5);
    ctx.fillStyle = '#4b5072'; rect(ctx, -14, -9 + bob, 28, 5); // chassis
    ctx.fillStyle = color; rect(ctx, -14, -14 + bob, 12, 5); // cab painted in owner colour
    ctx.fillStyle = STEEL; rect(ctx, -2, -13 + bob, 24, 4.4); // piston cylinder
    ctx.fillStyle = '#6c7396'; rect(ctx, 20, -14 + bob, 5, 6.4);
    ctx.fillStyle = '#ffcf5c'; rect(ctx, 4, -13 + bob, 1.4, 4.4); rect(ctx, 11, -13 + bob, 1.4, 4.4);
    wheel(ctx, -9, -3, 3.6); wheel(ctx, 2, -3, 3.6); wheel(ctx, 12, -3, 3.6);
  },
  elder(ctx, u, color, bob, t) {
    ctx.strokeStyle = 'rgba(245,200,90,0.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, 1, 11, 4.4, 0, 0, 6.2832); ctx.stroke();
    figure(ctx, color, 1.2, bob, t * 8 + u.ph);
    ctx.fillStyle = shade(color, -0.4); ctx.beginPath(); ctx.moveTo(-4, -17 + bob); ctx.lineTo(-9, -3); ctx.lineTo(0, -4); ctx.fill(); // cape
    ctx.fillStyle = '#f5c85a'; ctx.beginPath(); ctx.moveTo(-4, -26 + bob); ctx.lineTo(-3, -30 + bob); ctx.lineTo(0, -27 + bob); ctx.lineTo(3, -30 + bob); ctx.lineTo(4, -26 + bob); ctx.fill(); // crown
    line(ctx, 6, -2, 6, -22 + bob, 1.6, '#f5c85a'); // staff
  }
};

export function drawUnitSprite(ctx, u, color, t, moving) {
  const fn = UNIT_DRAW[u.k] || UNIT_DRAW.knife;
  const bob = moving ? -Math.abs(Math.sin(t * 10 + u.ph)) * 1.4 : 0;
  fn(ctx, u, color, bob, t);
}

// ---------- buildings ----------
// Isometric box: footprint [a0,a1]x[b0,b1] in tile units relative to the anchor, raised from z0 by h px.
export function box(ctx, a0, b0, a1, b1, z0, h, top, left, right) {
  const x00 = (a0 - b0) * HW, y00 = (a0 + b0) * HH;
  const x10 = (a1 - b0) * HW, y10 = (a1 + b0) * HH;
  const x11 = (a1 - b1) * HW, y11 = (a1 + b1) * HH;
  const x01 = (a0 - b1) * HW, y01 = (a0 + b1) * HH;
  const zb = -z0, zt = -z0 - h;
  ctx.fillStyle = left; ctx.beginPath(); ctx.moveTo(x01, y01 + zt); ctx.lineTo(x11, y11 + zt); ctx.lineTo(x11, y11 + zb); ctx.lineTo(x01, y01 + zb); ctx.closePath(); ctx.fill();
  ctx.fillStyle = right; ctx.beginPath(); ctx.moveTo(x10, y10 + zt); ctx.lineTo(x11, y11 + zt); ctx.lineTo(x11, y11 + zb); ctx.lineTo(x10, y10 + zb); ctx.closePath(); ctx.fill();
  ctx.fillStyle = top; ctx.beginPath(); ctx.moveTo(x00, y00 + zt); ctx.lineTo(x10, y10 + zt); ctx.lineTo(x11, y11 + zt); ctx.lineTo(x01, y01 + zt); ctx.closePath(); ctx.fill();
}

// pyramid/hip roof over a footprint
function roof(ctx, a0, b0, a1, b1, z, h, c) {
  const cx = ((a0 + a1) / 2 - (b0 + b1) / 2) * HW, cy = ((a0 + a1) / 2 + (b0 + b1) / 2) * HH - z - h;
  const p = [[(a0 - b0) * HW, (a0 + b0) * HH - z], [(a1 - b0) * HW, (a1 + b0) * HH - z], [(a1 - b1) * HW, (a1 + b1) * HH - z], [(a0 - b1) * HW, (a0 + b1) * HH - z]];
  const cols = [shade(c, 0.12), shade(c, -0.12), shade(c, -0.32), shade(c, -0.18)];
  for (let i = 0; i < 4; i++) {
    const q = p[(i + 1) % 4];
    ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.moveTo(p[i][0], p[i][1]); ctx.lineTo(q[0], q[1]); ctx.lineTo(cx, cy); ctx.closePath(); ctx.fill();
  }
}

function pt(a, b, z) { return [(a - b) * HW, (a + b) * HH - z]; }
function flag(ctx, a, b, z, color) {
  const [x, y] = pt(a, b, z);
  line(ctx, x, y, x, y - 26, 1.6, '#cfd3e8');
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x, y - 26); ctx.lineTo(x + 14, y - 22); ctx.lineTo(x, y - 17); ctx.fill();
}
function windowsOn(ctx, aFix, b0, b1, z0, rows, cols, rightFace, c) {
  // windows on the right face (x = aFix) or left face (y = aFix)
  ctx.fillStyle = c;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const u = (k + 0.5) / cols * (b1 - b0) + b0;
      const [x, y] = rightFace ? pt(aFix, u, z0 + 10 + r * 16) : pt(u, aFix, z0 + 10 + r * 16);
      ctx.beginPath();
      if (rightFace) { ctx.moveTo(x - 3, y - 1.5); ctx.lineTo(x + 3, y + 1.5); ctx.lineTo(x + 3, y - 6.5); ctx.lineTo(x - 3, y - 9.5); }
      else { ctx.moveTo(x - 3, y + 1.5); ctx.lineTo(x + 3, y - 1.5); ctx.lineTo(x + 3, y - 9.5); ctx.lineTo(x - 3, y - 6.5); }
      ctx.fill();
    }
  }
}

const BUILDING_DRAW = {
  townCenter(ctx, s, color, t, f) { // "Vajda Háza": big stone house, hip roof, flag
    box(ctx, 0.2, 0.2, s - 0.2, s - 0.2, 0, 34 * f, '#b8a68c', '#8e7d68', '#a69277');
    windowsOn(ctx, s - 0.2, 0.6, s - 0.6, 0, 1, 3, true, '#2a2f55');
    windowsOn(ctx, s - 0.2, 0.6, s - 0.6, 0, 1, 3, false, '#2a2f55');
    if (f < 1) return;
    roof(ctx, 0.0, 0.0, s, s, 34, 26, color);
    flag(ctx, s / 2, s / 2, 60, color);
    box(ctx, s / 2 - 0.35, s - 0.25, s / 2 + 0.35, s + 0.15, 0, 14, '#5b4330', '#4a3626', '#3e2e20');
  },
  scrapYard(ctx, s, color, t, f) { // MÉH Telep: fenced yard, scrap heaps, crane
    box(ctx, 0.1, 0.1, s - 0.1, s - 0.1, 0, 3, '#6e6a62', '#55524b', '#4a4741');
    ctx.fillStyle = '#9aa3bd';
    for (let i = 0; i < 5; i++) { const [x, y] = pt(0.6 + (i % 3) * 0.8, 0.6 + (i / 3 | 0) * 1.0, 3); ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x - 3, y - 9 * f); ctx.lineTo(x + 4, y - 6 * f); ctx.lineTo(x + 8, y); ctx.fill(); }
    ctx.fillStyle = '#c77a45'; const [cx, cy] = pt(1.8, 1.9, 3); ctx.beginPath(); ctx.moveTo(cx - 6, cy); ctx.lineTo(cx, cy - 8 * f); ctx.lineTo(cx + 7, cy); ctx.fill();
    const [bx, by] = pt(s - 0.5, 0.5, 3);
    line(ctx, bx, by, bx, by - 34 * f, 2.4, color); line(ctx, bx, by - 34 * f, bx - 26, by - 26 * f, 2, color); line(ctx, bx - 26, by - 26 * f, bx - 26, by - 14 * f, 1, '#cfd3e8');
    ctx.fillStyle = '#cfd3e8'; rect(ctx, bx - 29, by - 14 * f, 6, 4);
    // fence along the two front sides
    for (let i = 0; i <= s * 2; i++) {
      const k = i / 2 * (1);
      for (const [a, b] of [[k, s - 0.1], [s - 0.1, k]]) { const [x, y] = pt(a, b, 3); line(ctx, x, y, x, y - 7 * f, 1.4, '#8d9ab8'); }
    }
  },
  tavern(ctx, s, color, t, f) { // Kocsma: timber house, chimney, hanging sign
    box(ctx, 0.2, 0.2, s - 0.2, s - 0.2, 0, 22 * f, '#c9a171', '#9d7a52', '#b38a5c');
    windowsOn(ctx, s - 0.2, 0.5, s - 0.5, 0, 1, 2, true, '#ffd88a');
    windowsOn(ctx, s - 0.2, 0.5, s - 0.5, 0, 1, 2, false, '#ffd88a');
    if (f < 1) return;
    roof(ctx, 0.05, 0.05, s - 0.05, s - 0.05, 22, 14, '#a4452f');
    box(ctx, s - 0.9, 0.5, s - 0.55, 0.85, 28, 12, '#7a4a3a', '#5e382c', '#4f2f25');
    const [x, y] = pt(s - 0.2, s / 2, 16);
    line(ctx, x, y, x + 9, y + 2, 1.2, '#3a2a1c');
    ctx.fillStyle = color; rect(ctx, x + 3, y + 2, 10, 8); ctx.fillStyle = '#fff6d8'; ell(ctx, x + 8, y + 6, 2, 2);
    ctx.fillStyle = 'rgba(220,225,245,0.4)'; const sp = (t * 10) % 12; ell(ctx, pt(s - 0.7, 0.7, 40)[0] + sp * 0.4, pt(s - 0.7, 0.7, 40)[1] - sp, 3 + sp * 0.2, 2.4 + sp * 0.15);
  },
  barracks(ctx, s, color, t, f) { // Bódé: low barrack shed with stripes and a lean-to roof
    box(ctx, 0.2, 0.2, s - 0.2, s - 0.2, 0, 16 * f, '#7e86a6', '#5f6685', '#6c7394');
    box(ctx, 0.2, s - 0.25, s - 0.2, s - 0.2, 8, 3, color, color, color);
    if (f < 1) return;
    box(ctx, 0.05, 0.05, s - 0.05, s - 0.05, 16, 3, '#454b6e', '#3a3f5c', '#30344f');
    box(ctx, s / 2 - 0.3, s - 0.22, s / 2 + 0.3, s - 0.15, 0, 11, '#2c2f48', '#2c2f48', '#2c2f48');
    const [x, y] = pt(s - 0.2, s * 0.35, 12);
    line(ctx, x, y, x - 8, y - 12, 1.6, STEEL); line(ctx, x - 2, y - 14, x - 10, y - 2, 1.6, STEEL); // crossed blades
  },
  workshop(ctx, s, color, t, f) { // Sufni: garage with big door, gear on the roof
    box(ctx, 0.2, 0.2, s - 0.2, s - 0.2, 0, 20 * f, '#a9adc0', '#7f849d', '#9096ae');
    if (f < 1) return;
    box(ctx, 0.9, s - 0.22, s - 0.9, s - 0.15, 0, 13, '#4a4f72', '#4a4f72', '#4a4f72');
    for (let i = 1; i < 4; i++) { const [x, y] = pt(0.9 + (s - 1.8) * i / 4, s - 0.2, 0); line(ctx, x, y - 12, x, y - 1, 0.8, '#2b2f4d'); }
    const [gx, gy] = pt(s / 2, s / 2, 24);
    ctx.save(); ctx.translate(gx, gy); ctx.rotate(t * 0.6); ctx.fillStyle = color;
    ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 4); ctx.lineTo(Math.cos(a + 0.4) * 6, Math.sin(a + 0.4) * 3); } ctx.fill(); ctx.restore();
    box(ctx, s - 0.7, 0.3, s - 0.35, 0.65, 20, 8, '#5a5f80', '#454a68', '#3c405a');
  },
  tower(ctx, s, color, t, f) { // Őrtorony: slim tower, battlements, banner
    box(ctx, 0.3, 0.3, s - 0.3, s - 0.3, 0, 46 * f, '#9ba0b6', '#767b94', '#868ba3');
    if (f < 1) return;
    box(ctx, 0.15, 0.15, s - 0.15, s - 0.15, 46, 6, '#8c91a9', '#6a6f88', '#7a7f98');
    for (let i = 0; i < 3; i++) { const a = 0.35 + i * (s - 0.9) / 2; box(ctx, a, 0.15, a + 0.25, 0.4, 52, 5, '#a9aec3', '#7d829a', '#8e93ab'); }
    const [x, y] = pt(s - 0.3, s - 0.3, 0);
    ctx.fillStyle = '#20243f'; rect(ctx, x - 5, y - 34, 5, 7);
    flag(ctx, s / 2, s / 2, 58, color);
  },
  fence(ctx, s, color, t, f) { // Kerítés: wooden palisade
    for (let i = 0; i < 4; i++) {
      const [x, y] = pt(0.15 + i * 0.23, 0.15 + i * 0.23, 0);
      ctx.fillStyle = i % 2 ? '#8a5a34' : '#9c6a3e'; ctx.beginPath(); ctx.moveTo(x - 3.4, y + 4); ctx.lineTo(x - 3.4, y - 12 * f); ctx.lineTo(x, y - 15 * f); ctx.lineTo(x + 3.4, y - 12 * f); ctx.lineTo(x + 3.4, y + 4); ctx.fill();
    }
    const [x0, y0] = pt(0.1, 0.1, 6), [x1, y1] = pt(0.9, 0.9, 6);
    line(ctx, x0, y0 + 2, x1, y1 + 2, 1.6, '#5d3d22');
  },
  wall(ctx, s, color, t, f) { // Betonfal: concrete slab with panel seams
    box(ctx, 0.05, 0.05, 0.95, 0.95, 0, 22 * f, '#b4b8c6', '#8b90a3', '#9ca1b4');
    const [x, y] = pt(0.95, 0.5, 11 * f);
    line(ctx, x, y - 4, x, y + 6, 0.8, '#6e7388');
    ctx.fillStyle = color; const [bx, by] = pt(0.95, 0.5, 3); rect(ctx, bx - 4, by - 4, 8, 2.4);
  },
  houseHut(ctx, s, color, t, f) { // Viskó: corrugated lean-to shack
    box(ctx, 0.25, 0.25, s - 0.25, s - 0.25, 0, 11 * f, '#a38a69', '#7d6850', '#8d7458');
    if (f < 1) return;
    box(ctx, 0.1, 0.1, s - 0.1, s - 0.1, 11, 3, '#7e93a6', '#62788b', '#50657a');
    box(ctx, s / 2 - 0.2, s - 0.28, s / 2 + 0.2, s - 0.22, 0, 7, '#46342a', '#46342a', '#46342a');
    ctx.fillStyle = color; const [x, y] = pt(0.3, s - 0.25, 5); rect(ctx, x - 1, y - 6, 8, 5); // washing on the line, owner colour
  },
  housePanel(ctx, s, color, t, f) { // Lakótelepi lakás: panel block
    box(ctx, 0.15, 0.15, s - 0.15, s - 0.15, 0, 44 * f, '#c6c9d6', '#9a9eb2', '#adb1c4');
    windowsOn(ctx, s - 0.15, 0.4, s - 0.4, 0, 3 * f > 2 ? 3 : 1, 3, true, '#394070');
    windowsOn(ctx, s - 0.15, 0.4, s - 0.4, 0, 3 * f > 2 ? 3 : 1, 3, false, '#394070');
    if (f < 1) return;
    box(ctx, 0.15, 0.15, s - 0.15, s - 0.15, 44, 2, color, shade(color, -0.25), shade(color, -0.4));
  }
};

export function drawBuildingSprite(ctx, kind, size, color, t, progress, epoch) {
  const f = progress >= 100 ? 1 : 0.3 + 0.7 * progress / 100;
  let fn = BUILDING_DRAW[kind];
  if (kind === 'house') fn = epoch >= 3 ? BUILDING_DRAW.housePanel : BUILDING_DRAW.houseHut;
  (fn || BUILDING_DRAW.workshop)(ctx, size, color, t, f);
  if (progress < 100) { // scaffolding poles
    ctx.strokeStyle = 'rgba(240,200,120,0.8)'; ctx.lineWidth = 1.2;
    for (const [a, b] of [[0, 0], [size, 0], [size, size], [0, size]]) { const [x, y] = pt(a, b, 0); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 26); ctx.stroke(); }
  }
}

// ---------- resource nodes ----------
export function drawNodeSprite(ctx, n, t) {
  const frac = Math.max(0.25, Math.min(1, n.a / (n.max || n.a || 1)));
  const s = 0.6 + frac * 0.6;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ell(ctx, 0, 1, 14 * s, 5 * s);
  if (n.k === 'iron') { // heap of rusty scrap
    const cols = ['#8e97b3', '#a9b2cc', '#7a6657', '#c07a4a'];
    for (let i = 0; i < 6; i++) {
      const x = (i - 2.5) * 4.2 * s, h = (6 + ((i * 5) % 7)) * s;
      ctx.fillStyle = cols[i % 4]; ctx.beginPath(); ctx.moveTo(x - 4 * s, 0); ctx.lineTo(x - 1 * s, -h); ctx.lineTo(x + 4 * s, -h * 0.6); ctx.lineTo(x + 5 * s, 0); ctx.fill();
    }
  } else if (n.k === 'copper') { // copper pipes and a green-patina chunk
    for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#d98746' : '#b86b34'; ctx.beginPath(); ctx.moveTo((-9 + i * 5) * s, 0); ctx.lineTo((-6 + i * 4) * s, -(9 + i * 2) * s); ctx.lineTo((-2 + i * 5) * s, -(8 + i) * s); ctx.lineTo((-1 + i * 5) * s, 0); ctx.fill(); }
    ctx.fillStyle = '#4fae93'; ell(ctx, 4 * s, -3 * s, 4 * s, 2.5 * s);
  } else if (n.k === 'food') { // pot of stew on a tripod
    line(ctx, -8 * s, 0, 0, -14 * s, 1.4, WOOD); line(ctx, 8 * s, 0, 0, -14 * s, 1.4, WOOD); line(ctx, 0, 0, 0, -14 * s, 1.4, WOOD);
    ctx.fillStyle = '#2d3149'; ell(ctx, 0, -8 * s, 7 * s, 6 * s); ctx.fillStyle = '#d9792f'; ell(ctx, 0, -12 * s, 6 * s, 2.4 * s);
    ctx.fillStyle = '#ffb84a'; const fl = Math.sin(t * 9 + n.x) * 1.5; ell(ctx, 0, -1, 3 * s, 3 * s + fl);
  } else { // wood: stacked logs
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3 - r; c++) {
      const x = (c - (2 - r) / 2) * 7 * s, y = -r * 5 * s - 2;
      ctx.fillStyle = '#7a4d2c'; ell(ctx, x, y, 3.8 * s, 3 * s); ctx.fillStyle = '#d2a06a'; ell(ctx, x + 1.4 * s, y, 1.4 * s, 2.2 * s);
    }
  }
}

export function drawProjectile(ctx, k, fx, fy, arc) {
  ctx.fillStyle = k === 'bolt' ? '#ffe28a' : k === 'sling' ? '#cfd3e8' : '#ffd35a';
  ell(ctx, fx, fy - arc, 2.2, 2.2);
}
