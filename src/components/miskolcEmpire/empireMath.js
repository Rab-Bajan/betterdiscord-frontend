// Isometric projection and camera maths. Pure functions, no browser dependencies.
export const TILE_W = 64;
export const TILE_H = 32;
export const HW = TILE_W / 2;
export const HH = TILE_H / 2;
export const MIN_ZOOM = 0.45;
export const MAX_ZOOM = 1.9;

// screenX = (wx - wy) * (tileW / 2), screenY = (wx + wy) * (tileH / 2)
export function worldToIso(wx, wy, out) {
  out.x = (wx - wy) * HW;
  out.y = (wx + wy) * HH;
  return out;
}

export function isoToWorld(ix, iy, out) {
  out.y = iy / TILE_H - ix / TILE_W;
  out.x = iy / TILE_H + ix / TILE_W;
  return out;
}

// cam.x / cam.y are the iso-space coordinates shown at the centre of the viewport.
export function worldToScreen(cam, vw, vh, wx, wy, out) {
  out.x = ((wx - wy) * HW - cam.x) * cam.zoom + vw / 2;
  out.y = ((wx + wy) * HH - cam.y) * cam.zoom + vh / 2;
  return out;
}

export function screenToWorld(cam, vw, vh, sx, sy, out) {
  const ix = (sx - vw / 2) / cam.zoom + cam.x;
  const iy = (sy - vh / 2) / cam.zoom + cam.y;
  return isoToWorld(ix, iy, out);
}

export function clampCamera(cam, mapW, mapH) {
  const minX = -mapH * HW;
  const maxX = mapW * HW;
  const maxY = (mapW + mapH) * HH;
  cam.x = Math.max(minX, Math.min(maxX, cam.x));
  cam.y = Math.max(0, Math.min(maxY, cam.y));
  cam.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cam.zoom));
}

// Zoom keeping the world point under (sx, sy) fixed.
export function zoomAbout(cam, vw, vh, sx, sy, factor) {
  const z2 = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cam.zoom * factor));
  const ix = (sx - vw / 2) / cam.zoom + cam.x;
  const iy = (sy - vh / 2) / cam.zoom + cam.y;
  cam.zoom = z2;
  cam.x = ix - (sx - vw / 2) / z2;
  cam.y = iy - (sy - vh / 2) / z2;
}

export function centerOnWorld(cam, wx, wy) {
  cam.x = (wx - wy) * HW;
  cam.y = (wx + wy) * HH;
}
