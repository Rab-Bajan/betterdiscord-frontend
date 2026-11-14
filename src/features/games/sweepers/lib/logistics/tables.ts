// Phase D táblák (D.1): zsákok, épületelemek, portok, állandók, daru, szobakorlátok. A protokoll sorrendje
// az index; a szerver ugyanezt kódolja be, a D fixture rögzíti. Tiszta kód (three nélkül).

export interface BagTier {
  readonly key: 'kek' | 'fekete' | 'bigbag' | 'bala' | 'rez';
  readonly name: string;
  readonly l: number;
  readonly kg: number;
  readonly cost: number;
  /** Can burst (64). */
  readonly rupture: boolean;
  /** A player can pick it up and carry it. */
  readonly carry: boolean;
  /** Mesh radius (Big-Bag: half its 1.2 m box) and height, m. */
  readonly r: number;
  readonly h: number;
  readonly color: string;
  /** Stock cap in `PersonalState.bags` (processed tiers 3–4: 0, never in stock). */
  readonly cap: number;
}

export const BAG_TIERS: readonly BagTier[] = [
  { key: 'kek', name: 'Standard Kék Szemeteszsák', l: 30, kg: 20, cost: 50, rupture: true, carry: true, r: 0.28, h: 0.6, color: '#2F6FD6', cap: 99 },
  { key: 'fekete', name: 'Erősített Fekete Építési Zsák', l: 60, kg: 50, cost: 150, rupture: false, carry: true, r: 0.35, h: 0.8, color: '#1C1C1C', cap: 99 },
  { key: 'bigbag', name: 'Nagyüzemi Big-Bag Konténer', l: 1000, kg: 1000, cost: 2500, rupture: false, carry: false, r: 0.6, h: 1.2, color: '#E8E2CF', cap: 9 },
  // Phase E processed goods (E.1): machine output only; not buyable, not tie-able
  { key: 'bala', name: 'Fémbála', l: 50, kg: 50, cost: 0, rupture: false, carry: true, r: 0.3, h: 0.6, color: '#6E6A64', cap: 0 },
  { key: 'rez', name: 'Fényes vörösréz köteg', l: 8, kg: 20, cost: 0, rupture: false, carry: true, r: 0.3, h: 0.4, color: '#C8743A', cap: 0 }
];
/** Bag tiers a player can buy, stock and tie (0..2). */
export const STOCK_TIERS = 3;

/** Bag tint 1..3 (packager bags, by dominant group); 0 = the tier colour. */
export const TINT_COLORS: readonly (string | null)[] = [null, '#8A8F96', '#B5452C', '#D9822B'];
export const bagColor = (tier: number, tint: number): string => TINT_COLORS[tint] ?? BAG_TIERS[tier]?.color ?? '#2F6FD6';

/** Lot groups (69): 0 bulk, 1 ferrous, 2 copper; the lot heap is drawn in the group's tint. */
export const LOT_GROUPS = ['bulk', 'ferrous', 'copper'] as const;
export const lotColor = (group: number): string => TINT_COLORS[group + 1] ?? '#8A8F96';

/** Building families the renderer instances (D.7: 8). */
export type StructFamily = 'foundation' | 'belt' | 'bend' | 'ramp' | 'junction' | 'hopper' | 'packager' | 'fence' | 'stripper' | 'baler' | 'magnet' | 'trommel';

/** A port in the structure's local frame: point, heading (unit, local) and level offset of its deck. */
export interface Port {
  readonly x: number;
  readonly z: number;
  readonly hx: number;
  readonly hz: number;
  readonly dl: number;
}

export interface StructType {
  readonly key: string;
  readonly name: string;
  /** Size along local x / z. */
  readonly w: number;
  readonly d: number;
  /** Valid (input) levels. */
  readonly lvlMin: number;
  readonly lvlMax: number;
  readonly ins: readonly Port[];
  readonly outs: readonly Port[];
  /** Path length inside the piece (null: no path). */
  readonly len: number | null;
  readonly family: StructFamily;
  /** Collider: foundation (top − ground), deck (deck − base), a fixed height, or none. */
  readonly collider: 'found' | 'deck' | number | null;
}

const p = (x: number, z: number, hx: number, hz: number, dl = 0): Port => ({ x, z, hx, hz, dl });
const RAMP_LEN = Math.sqrt(4.81);
const BELT = { lvlMin: 0, lvlMax: 2, collider: 'deck' } as const;

export const STRUCT_TYPES: readonly StructType[] = [
  { key: 'found2', name: 'Betonalap 2×2', w: 2, d: 2, lvlMin: 0, lvlMax: 0, ins: [], outs: [], len: null, family: 'foundation', collider: 'found' },
  { key: 'found4', name: 'Betonalap 4×4', w: 4, d: 4, lvlMin: 0, lvlMax: 0, ins: [], outs: [], len: null, family: 'foundation', collider: 'found' },
  { key: 'belt1', name: 'Görgős szalag 1 m', w: 1, d: 1, ...BELT, ins: [p(0, 0.5, 0, -1)], outs: [p(0, -0.5, 0, -1)], len: 1, family: 'belt' },
  { key: 'belt2', name: 'Görgős szalag 2 m', w: 1, d: 2, ...BELT, ins: [p(0, 1, 0, -1)], outs: [p(0, -1, 0, -1)], len: 2, family: 'belt' },
  { key: 'belt5', name: 'Görgős szalag 5 m', w: 1, d: 5, ...BELT, ins: [p(0, 2.5, 0, -1)], outs: [p(0, -2.5, 0, -1)], len: 5, family: 'belt' },
  { key: 'bendL', name: 'Kanyarelem (balra)', w: 1, d: 1, ...BELT, ins: [p(0, 0.5, 0, -1)], outs: [p(-0.5, 0, -1, 0)], len: Math.PI / 4, family: 'bend' },
  { key: 'bendR', name: 'Kanyarelem (jobbra)', w: 1, d: 1, ...BELT, ins: [p(0, 0.5, 0, -1)], outs: [p(0.5, 0, 1, 0)], len: Math.PI / 4, family: 'bend' },
  { key: 'rampUp', name: 'Emelkedő rámpa', w: 1, d: 2, lvlMin: 0, lvlMax: 1, ins: [p(0, 1, 0, -1)], outs: [p(0, -1, 0, -1, 1)], len: RAMP_LEN, family: 'ramp', collider: 'deck' },
  { key: 'rampDown', name: 'Lejtő rámpa', w: 1, d: 2, lvlMin: 1, lvlMax: 2, ins: [p(0, 1, 0, -1)], outs: [p(0, -1, 0, -1, -1)], len: RAMP_LEN, family: 'ramp', collider: 'deck' },
  // outs in route order: 0 straight, 1 left, 2 right
  { key: 'splitter', name: 'Válogató elágazás', w: 1, d: 1, ...BELT, ins: [p(0, 0.5, 0, -1)], outs: [p(0, -0.5, 0, -1), p(-0.5, 0, -1, 0), p(0.5, 0, 1, 0)], len: 1, family: 'junction' },
  { key: 'merger', name: 'Összefolyó idom', w: 1, d: 1, ...BELT, ins: [p(-0.5, 0, 1, 0), p(0.5, 0, -1, 0)], outs: [p(0, -0.5, 0, -1)], len: 1, family: 'junction' },
  { key: 'hopper', name: 'Garat', w: 4, d: 4, lvlMin: 0, lvlMax: 0, ins: [], outs: [p(0, -2, 0, -1)], len: null, family: 'hopper', collider: null },
  { key: 'packager', name: 'Zsákoló automata', w: 2, d: 2, lvlMin: 0, lvlMax: 0, ins: [p(0, 1, 0, -1)], outs: [p(0, -1, 0, -1)], len: 2, family: 'packager', collider: 2.2 },
  { key: 'fence', name: 'Kerítéselem 2 m', w: 2, d: 0.2, lvlMin: 0, lvlMax: 0, ins: [], outs: [], len: null, family: 'fence', collider: 1.1 },
  // Phase E machines (E.1): lvl 0, outs in route order 0 straight, 1 side (+x)
  { key: 'stripper', name: 'Kábelnyúzó masina', w: 2, d: 2, lvlMin: 0, lvlMax: 0, ins: [p(0, 1, 0, -1)], outs: [p(0, -1, 0, -1)], len: 2, family: 'stripper', collider: 1.6 },
  { key: 'baler', name: 'Hidraulikus hulladékbálázó', w: 2, d: 2, lvlMin: 0, lvlMax: 0, ins: [p(0, 1, 0, -1)], outs: [p(0, -1, 0, -1)], len: 2, family: 'baler', collider: 2.4 },
  { key: 'magnet', name: 'Mágneses dobosztályozó', w: 2, d: 2, lvlMin: 0, lvlMax: 0, ins: [p(0, 1, 0, -1)], outs: [p(0, -1, 0, -1), p(1, 0, 1, 0)], len: 2, family: 'magnet', collider: 1.8 },
  { key: 'trommel', name: 'Forgódobos salakrostáló', w: 2, d: 4, lvlMin: 0, lvlMax: 0, ins: [p(0, 2, 0, -1)], outs: [p(0, -2, 0, -1), p(1, 0, 1, 0)], len: 4, family: 'trommel', collider: 2.2 }
];

export const T_FOUND2 = 0;
export const T_FOUND4 = 1;
export const T_SPLITTER = 9;
export const T_MERGER = 10;
export const T_HOPPER = 11;
export const T_PACKAGER = 12;
export const T_FENCE = 13;
export const T_STRIPPER = 14;
export const T_BALER = 15;
export const T_MAGNET = 16;
export const T_TROMMEL = 17;
/** Machines 14–17 (E.1): need a blueprint, share the `machines` cap. */
export const isMachine = (type: number): boolean => type >= T_STRIPPER && type <= T_TROMMEL;
/** Stripper / baler wear and smoke (89). */
export const wearsOut = (type: number): boolean => type === T_STRIPPER || type === T_BALER;
/** Sorting machines route like a splitter (route 0 straight, 1 side). */
export const isSorter = (type: number): boolean => type === T_MAGNET || type === T_TROMMEL;
export const isFoundation = (type: number): boolean => type === T_FOUND2 || type === T_FOUND4;
/** Belt-like: has a cargo path on a deck (types 2–10). */
export const isBeltLike = (type: number): boolean => type >= 2 && type <= 10;
/** Junctions jam (72); so do the machines (E.2). */
export const isJunction = (type: number): boolean => type === T_SPLITTER || type === T_MERGER || type === T_PACKAGER || isMachine(type);

// Constants (D.1).
export const BELT_MPS = 1.4;
export const PITCH_M = 0.6;
export const DECK_M = 0.35;
export const LEVEL_M = 0.9;
export const JAM_MS = 10_000;
export const W_PER_M = 12;
export const deckY = (base: number, lvl: number): number => base + DECK_M + LEVEL_M * lvl;

/** Room limits (D.1) and the `{what}` of `buildLimit` (D.8). */
export const ROOM_CAPS = { structures: 256, foundations: 96, beltM: 300, junctions: 24, hoppers: 4, packagers: 4, fences: 64, machines: 8, bags: 300, lots: 150 } as const;

/** Landmark hopper: node 0; its intake zone is the footprint expanded by 1.5 m. */
export const LANDMARK_NODE = 0;
export const LANDMARK_INTAKE_PAD_M = 1.5;

/** Gantry crane (74), fixed constants. */
export const CRANE = {
  area: { x0: -12.5, x1: -4.5, z0: -5, z1: 5 },
  legR: 0.3,
  legH: 6,
  hookMps: 1,
  liftS: 1.5,
  console: { x: -4.0, z: -5.6 },
  consoleReachM: 2.5,
  targets: [{ x: -8.5, z: 0 }, { x: -11, z: -3.5 }, { x: -11, z: 3.5 }, { x: -6, z: -3.5 }, { x: -6, z: 3.5 }],
  padM: 3
} as const;
export const CRANE_TARGET_NAMES: readonly string[] = ['Mérlegplató', '1. hely', '2. hely', '3. hely', '4. hely'];

/** Crane legs: cylinders at the area corners (structure colliders of every room). */
export const CRANE_LEGS = [
  [CRANE.area.x0, CRANE.area.z0], [CRANE.area.x1, CRANE.area.z0], [CRANE.area.x0, CRANE.area.z1], [CRANE.area.x1, CRANE.area.z1]
].map(([x, z]) => ({ shape: 'cyl' as const, x: x ?? 0, z: z ?? 0, r: CRANE.legR, h: CRANE.legH }));

// Rotation (D.1): rotY = −rot·π/2 in (−π, π]; local x → world (cos θ, −sin θ), local z → (sin θ, cos θ).

export function rotYOf(rot: number): number {
  const y = -rot * (Math.PI / 2);
  return (y <= -Math.PI ? y + 2 * Math.PI : y) + 0; // + 0 turns rot 0's −0 into +0
}

/** Local (lx, lz) of a structure with rotation `rot` → world offset (exact for the four rotations). */
export function toWorld(lx: number, lz: number, rot: number): { x: number; z: number } {
  const c = Math.round(Math.cos(rotYOf(rot)));
  const s = Math.round(Math.sin(rotYOf(rot)));
  return { x: lx * c + lz * s + 0, z: -lx * s + lz * c + 0 };
}

/** World footprint size (an odd rot swaps w and d). */
export function footprintSize(type: number, rot: number): { w: number; d: number } {
  const t = STRUCT_TYPES[type];
  if (!t) return { w: 0, d: 0 };
  return rot % 2 === 1 ? { w: t.d, d: t.w } : { w: t.w, d: t.d };
}

/** Kg per kgDg (the wire mass unit: 10 g). */
export const dgToKg = (dg: number): number => dg / 100;
