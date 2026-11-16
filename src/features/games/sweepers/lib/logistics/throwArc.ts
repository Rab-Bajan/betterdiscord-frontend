// Zsákdobás íve (D.2 "Throw and drop"): ugyanaz a 0,05 s-os lépésű menetelés, mint a szerveren; a kliens az
// előnézethez használja, a szerver válasza (`arcs`, a sor) dönt. Tiszta kód.

export const THROW_MAX_MPS = 12;
export const DROP_BELOW_MPS = 1;
export const THROW_STEP_S = 0.05;
export const THROW_MAX_STEPS = 60;
export const GRAVITY = 9.81;
/** LMB charge: 0 → 12 m/s over 1.2 s; a hold under 0.2 s is a drop (D.7). */
export const THROW_CHARGE_MS = 1200;
export const THROW_TAP_MS = 200;
export const PITCH_MIN = -0.6;
export const PITCH_MAX = 1.2;

export interface ThrowWorld {
  ground(x: number, z: number): number;
  /** Height a bag rests on: terrain, foundation tops, belt decks, bag tops. */
  support(x: number, z: number): number;
  /** Outside the grid, in a locked district, or inside a blocking collider at height y. */
  blocked(x: number, y: number, z: number): boolean;
  /** The hopper whose intake takes a bag at (x, y, z), else null. */
  hopperAt(x: number, y: number, z: number): number | null;
}

export interface ThrowResult {
  /** The marched points, release first, rest last. */
  readonly points: readonly { readonly x: number; readonly y: number; readonly z: number }[];
  readonly rest: { readonly x: number; readonly y: number; readonly z: number };
  readonly apexY: number;
  readonly into: 'ground' | 'hopper';
  readonly hopper: number | null;
}

export const chargePower = (heldMs: number): number => (heldMs < THROW_TAP_MS ? 0 : Math.min(THROW_MAX_MPS, (heldMs / THROW_CHARGE_MS) * THROW_MAX_MPS));

/** D.2: release at pose + dir·0.4, y = ground + 1.4, v = power·(cos pitch·dir, sin pitch); a power < 1 drops. */
export function simulateThrow(world: ThrowWorld, pose: { readonly x: number; readonly z: number }, rotY: number, power: number, pitch: number): ThrowResult {
  const dx = -Math.sin(rotY);
  const dz = -Math.cos(rotY);
  const p = Math.min(THROW_MAX_MPS, Math.max(0, power));
  const drop = p < DROP_BELOW_MPS;
  const a = Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitch));
  const ox = pose.x + dx * (drop ? 0.5 : 0.4);
  const oz = pose.z + dz * (drop ? 0.5 : 0.4);
  const oy = drop ? world.support(ox, oz) + 1 : world.ground(pose.x, pose.z) + 1.4;
  const vh = drop ? 0 : p * Math.cos(a);
  const vy = drop ? 0 : p * Math.sin(a);
  const points = [{ x: ox, y: oy, z: oz }];
  let apexY = oy;
  let prev = points[0] ?? { x: ox, y: oy, z: oz };
  for (let k = 1; k <= THROW_MAX_STEPS; k++) {
    const t = k * THROW_STEP_S;
    const pt = { x: ox + dx * vh * t, y: oy + vy * t - 0.5 * GRAVITY * t * t, z: oz + dz * vh * t };
    if (world.blocked(pt.x, pt.y, pt.z)) break;
    points.push(pt);
    apexY = Math.max(apexY, pt.y);
    const hopper = world.hopperAt(pt.x, pt.y, pt.z);
    if (hopper !== null) return { points, rest: pt, apexY, into: 'hopper', hopper };
    const support = world.support(pt.x, pt.z);
    if (pt.y <= support) {
      const rest = { x: pt.x, y: support, z: pt.z };
      points[points.length - 1] = rest;
      return { points, rest, apexY, into: 'ground', hopper: null };
    }
    prev = pt;
  }
  // blocked or out of steps: it falls vertically from the last free point
  const rest = { x: prev.x, y: world.support(prev.x, prev.z), z: prev.z };
  points.push(rest);
  return { points, rest, apexY, into: 'ground', hopper: null };
}
