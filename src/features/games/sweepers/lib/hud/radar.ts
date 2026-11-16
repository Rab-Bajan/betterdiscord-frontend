// GPS-radar vetítés (spec 30): világ XZ -> kör alakú radar pixelei, a nézési irány mindig felfelé.
// Tiszta kód; a teljes (M) térkép a Phase I-ben ugyanezt használja `headingUp: false`-szal.

export interface RadarView {
  /** Radar centre in world metres. */
  readonly cx: number;
  readonly cz: number;
  /** Camera yaw (three.js, 0 looks down -Z). */
  readonly yaw: number;
  /** World metres from the centre to the radar edge. */
  readonly rangeM: number;
  /** Radar radius in pixels. */
  readonly radiusPx: number;
  /** Rotate so the facing direction points up (radar) or keep north (-Z) up (full map). */
  readonly headingUp: boolean;
}

/** Pixel offset from the radar centre (+x right, +y down) of world point (x, z). */
export function projectToRadar(view: RadarView, x: number, z: number): { px: number; py: number } {
  const scale = view.radiusPx / view.rangeM;
  const dx = x - view.cx;
  const dz = z - view.cz;
  if (!view.headingUp) return { px: dx * scale, py: dz * scale };
  // facing (-sinθ, -cosθ) maps to straight up (0, -1); right (cosθ, -sinθ) maps to (1, 0)
  const s = Math.sin(view.yaw);
  const c = Math.cos(view.yaw);
  const right = dx * c - dz * s;
  const forward = -dx * s - dz * c;
  return { px: right * scale, py: -forward * scale };
}

/** Clamps a projected point onto the rim (radius − margin) when it lies outside; reports clamping. */
export function clampToRim(p: { px: number; py: number }, radiusPx: number, margin = 6): { px: number; py: number; clamped: boolean } {
  const max = radiusPx - margin;
  const len = Math.hypot(p.px, p.py);
  if (len <= max) return { ...p, clamped: false };
  return { px: (p.px / len) * max, py: (p.py / len) * max, clamped: true };
}

/** Screen angle (radians, 0 = up, clockwise) of a world-space yaw on the radar. */
export function radarAngle(view: RadarView, worldYaw: number): number {
  // a heading of yaw ψ points along (-sinψ, -cosψ); on a north-up map that is angle -ψ
  return view.headingUp ? view.yaw - worldYaw : -worldYaw;
}

const COMPASS = ['É', 'ÉK', 'K', 'DK', 'D', 'DNY', 'NY', 'ÉNY'] as const;

/** Compass bearing in degrees (0 = north = -Z, 90 = east = +X) of a camera yaw. */
export function bearingDeg(yaw: number): number {
  const deg = (-yaw * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

/** Hungarian 8-wind label of a bearing. */
export function compassLabel(deg: number): string {
  return COMPASS[Math.round(deg / 45) % 8] ?? 'É';
}
