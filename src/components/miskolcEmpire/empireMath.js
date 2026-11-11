// RTS camera maths for the 3D view. Pure functions, no browser or three.js dependencies.
// World tile (x, y) maps to the three.js point (x, height, y). The camera orbits a ground target
// stored in world tile coordinates so the minimap and the store never need the 3D camera object.
export const MIN_DIST = 9;
export const MAX_DIST = 58;
export const SPECTATOR_MIN_DIST = 4;
export const SPECTATOR_MAX_DIST = 150;
export const MIN_PITCH = 0.62; // radians above the horizon
export const MAX_PITCH = 1.38;
export const DEFAULT_PITCH = 0.98;
export const DEFAULT_YAW = Math.PI / 4;

export function createCamera() {
  return { x: 0, y: 0, dist: 26, yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH, goal: null };
}

// Share of the zoom distance the ground target keeps away from the map edge, so the view stays over
// the map instead of scrolling out over the (dark) mountains around it.
export const EDGE_INSET = 0.5;

// Keep the ground target inside the map (pulled in from the edges in proportion to the zoom, never past
// the map centre) and the zoom in range. Spectators get a wider zoom range but the same bounds.
export function clampCamera(cam, mapW, mapH, free = false) {
  const lo = free ? SPECTATOR_MIN_DIST : MIN_DIST;
  const hi = free ? SPECTATOR_MAX_DIST : MAX_DIST;
  cam.dist = Math.max(lo, Math.min(hi, cam.dist));
  cam.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, cam.pitch));
  const inset = cam.dist * EDGE_INSET;
  const mx = Math.min(inset, mapW / 2), my = Math.min(inset, mapH / 2);
  cam.x = Math.max(mx, Math.min(mapW - mx, cam.x));
  cam.y = Math.max(my, Math.min(mapH - my, cam.y));
  if (cam.goal) {
    cam.goal.x = Math.max(mx, Math.min(mapW - mx, cam.goal.x));
    cam.goal.y = Math.max(my, Math.min(mapH - my, cam.goal.y));
  }
}

// Jump (or, with smooth = true, glide) the camera target to a world tile position.
export function centerOnWorld(cam, wx, wy, smooth = false) {
  if (smooth) { cam.goal = { x: wx, y: wy }; return; }
  cam.goal = null;
  cam.x = wx;
  cam.y = wy;
}

// Ease the camera towards cam.goal; returns true while moving.
export function stepCameraGoal(cam, dt) {
  if (!cam.goal) return false;
  const k = 1 - Math.exp(-7 * dt);
  cam.x += (cam.goal.x - cam.x) * k;
  cam.y += (cam.goal.y - cam.y) * k;
  if (Math.hypot(cam.goal.x - cam.x, cam.goal.y - cam.y) < 0.05) { cam.x = cam.goal.x; cam.y = cam.goal.y; cam.goal = null; }
  return true;
}

// Eye position in three.js space (x, y = up, z) for a target at ground height `h`.
export function cameraEye(cam, h, out) {
  const c = Math.cos(cam.pitch);
  out.x = cam.x + Math.sin(cam.yaw) * c * cam.dist;
  out.y = h + Math.sin(cam.pitch) * cam.dist;
  out.z = cam.y + Math.cos(cam.yaw) * c * cam.dist;
  return out;
}

// Screen-space pan input (right, down) to a world tile delta, respecting the camera yaw.
export function panDelta(cam, right, down, amount, out) {
  const s = Math.sin(cam.yaw), c = Math.cos(cam.yaw);
  // forward on screen (down = -1) moves the target away from the eye
  out.x = (right * c + down * s) * amount;
  out.y = (-right * s + down * c) * amount;
  return out;
}

// Ray (origin o, direction d; three.js axes) against the horizontal plane y = h. Returns the world
// tile point in out ({x, y}) or null when the ray points away from the plane.
export function rayPlane(o, d, h, out) {
  if (Math.abs(d.y) < 1e-6) return null;
  const t = (h - o.y) / d.y;
  if (t < 0) return null;
  out.x = o.x + d.x * t;
  out.y = o.z + d.z * t;
  return out;
}
