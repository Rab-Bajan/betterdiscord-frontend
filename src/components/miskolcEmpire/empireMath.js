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

// Keep the ground target on the map (or loosely around it in spectator mode) and the zoom in range.
export function clampCamera(cam, mapW, mapH, free = false) {
  const m = free ? 30 : 0;
  cam.x = Math.max(-m, Math.min(mapW + m, cam.x));
  cam.y = Math.max(-m, Math.min(mapH + m, cam.y));
  const lo = free ? SPECTATOR_MIN_DIST : MIN_DIST;
  const hi = free ? SPECTATOR_MAX_DIST : MAX_DIST;
  cam.dist = Math.max(lo, Math.min(hi, cam.dist));
  cam.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, cam.pitch));
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
