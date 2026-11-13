// Axiális, csúcsos tetejű hatszögrács (37 hex, sugár 3, külső sugár 40 m) matematikája.

export const HEX_SIZE = 40;
export const GRID_RADIUS = 3;
const SQRT3 = Math.sqrt(3);

export interface Axial {
  readonly q: number;
  readonly r: number;
}

/** Hex centre on the ground plane (x, z) in metres. */
export function hexToWorld(q: number, r: number, size = HEX_SIZE): { x: number; z: number } {
  return { x: size * SQRT3 * (q + r / 2), z: size * 1.5 * r };
}

function cubeRound(qf: number, rf: number): Axial {
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  // `+ 0` normalises -0
  return { q: q + 0, r: r + 0 };
}

/** The hex containing world point (x, z). */
export function worldToHex(x: number, z: number, size = HEX_SIZE): Axial {
  return cubeRound(((SQRT3 / 3) * x - z / 3) / size, ((2 / 3) * z) / size);
}

const RING_DISTRICTS = 5;
const TAU = Math.PI * 2;

/**
 * District of any axial hex, inside the 37 or in the outskirts (backend `districtOf`): 0 for the
 * centre, else 1..5 by the angle of the hex centre (five 72° sectors counter-clockwise from +x).
 */
export function districtOf(q: number, r: number): number {
  if (q === 0 && r === 0) return 0;
  const { x, z } = hexToWorld(q, r);
  // the epsilon keeps a centre exactly on a sector boundary in the sector that starts there
  const angle = (Math.atan2(z, x) + TAU + 1e-9) % TAU;
  return 1 + Math.min(RING_DISTRICTS - 1, Math.floor(angle / (TAU / RING_DISTRICTS)));
}

/** District of any world point (the hex containing it decides), as the server's lock test. */
export function districtAt(x: number, z: number): number {
  const { q, r } = worldToHex(x, z);
  return districtOf(q, r);
}

export const hexDistance = (a: Axial, b: Axial): number =>
  (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;

/** Corner i (0..5) of a pointy-top hex around (cx, cz). */
export function hexCorner(cx: number, cz: number, i: number, size = HEX_SIZE): { x: number; z: number } {
  const a = (Math.PI / 180) * (60 * i - 30);
  return { x: cx + size * Math.cos(a), z: cz + size * Math.sin(a) };
}

/** Cleanliness -> outline colour: red < 50, orange 50–89, green ≥ 90. */
export function cleanlinessColor(cleanliness: number): number {
  if (cleanliness >= 90) return 0x28c997;
  if (cleanliness >= 50) return 0xf5a623;
  return 0xe94b64;
}
