// Phase F táblák (F.1): járműtípusok, ülések, plató- és tanksapka-pont, kezdőhelyek, szabályállandók.
// A protokoll sorrendje az index; a szerver ugyanezt kódolja be, az F fixture rögzíti. Tiszta kód (three nélkül).

export interface Seat {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface VehicleType {
  readonly key: 'handcart' | 'wheelbarrow' | 'simson' | 'lada' | 'multicar' | 'ifa';
  readonly name: string;
  readonly capKg: number;
  readonly topKmh: number;
  /** Pushed (manual) or driven (motor). */
  readonly manual: boolean;
  /** 0 benzin, 1 dízel; null: no tank. */
  readonly fuel: 0 | 1 | null;
  readonly tankL: number;
  readonly lPerKm: number;
  readonly seats: readonly Seat[];
  /** Length × width, body radius (half width), tare. */
  readonly l: number;
  readonly w: number;
  readonly r: number;
  readonly tareKg: number;
  readonly cost: number;
  readonly lights: boolean;
  readonly beacon: boolean;
  readonly horn: boolean;
  /** Brush (rect sweep) width and efficiency; null without brushes. */
  readonly brushW: number | null;
  readonly brushEff: number;
}

const s = (x: number, y: number, z: number): Seat => ({ x, y, z });
const behindHandles = (l: number): Seat => s(0, 0, l / 2 + 0.5);

export const VEHICLE_TYPES: readonly VehicleType[] = [
  { key: 'handcart', name: 'Kétkerekű Kukás Kézikocsi', capKg: 120, topKmh: 16.2, manual: true, fuel: null, tankL: 0, lPerKm: 0, seats: [behindHandles(1.4)], l: 1.4, w: 0.8, r: 0.4, tareKg: 45, cost: 8000, lights: false, beacon: false, horn: false, brushW: null, brushEff: 0 },
  { key: 'wheelbarrow', name: 'Közműves Horganyzott Talicska', capKg: 220, topKmh: 16.2, manual: true, fuel: null, tankL: 0, lPerKm: 0, seats: [behindHandles(1.5)], l: 1.5, w: 0.7, r: 0.35, tareKg: 30, cost: 14_000, lights: false, beacon: false, horn: false, brushW: null, brushEff: 0 },
  { key: 'simson', name: 'Simson Háromkerekű Riksa', capKg: 450, topKmh: 38, manual: false, fuel: 0, tankL: 5, lPerKm: 0.5, seats: [s(0, 0.9, -0.4)], l: 2.6, w: 1.2, r: 0.6, tareKg: 140, cost: 85_000, lights: true, beacon: false, horn: false, brushW: null, brushEff: 0 },
  { key: 'lada', name: 'Platós Lada 1200 Utcaseprő', capKg: 800, topKmh: 65, manual: false, fuel: 0, tankL: 20, lPerKm: 2, seats: [s(-0.35, 0.8, -0.3), s(0.35, 0.8, -0.3)], l: 4.1, w: 1.6, r: 0.8, tareKg: 950, cost: 240_000, lights: true, beacon: true, horn: false, brushW: null, brushEff: 0 },
  { key: 'multicar', name: 'Multicar M25 Kommunális Seprő', capKg: 1800, topKmh: 40, manual: false, fuel: 1, tankL: 30, lPerKm: 3, seats: [s(-0.35, 1.2, -1.1), s(0.35, 1.2, -1.1)], l: 3.5, w: 1.6, r: 0.8, tareKg: 1900, cost: 550_000, lights: true, beacon: true, horn: false, brushW: 2.4, brushEff: 0.8 },
  { key: 'ifa', name: 'IFA W50 Szippantós Seprőgép', capKg: 5000, topKmh: 55, manual: false, fuel: 1, tankL: 60, lPerKm: 6, seats: [s(-0.5, 1.6, -2.6), s(-1.45, 0.6, 2.8), s(1.45, 0.6, 2.8)], l: 7, w: 2.5, r: 1.25, tareKg: 6500, cost: 1_200_000, lights: true, beacon: true, horn: true, brushW: 3.5, brushEff: 1 }
];

export const FUEL_NAMES: readonly string[] = ['benzin', 'dízel'];
export const topMps = (type: VehicleType): number => type.topKmh / 3.6;

/** Local (lx, lz) of a vehicle at heading rotY → world offset (forward = local −z). */
export function vehicleToWorld(lx: number, lz: number, rotY: number): { x: number; z: number } {
  const c = Math.cos(rotY);
  const sn = Math.sin(rotY);
  return { x: lx * c + lz * sn, z: -lx * sn + lz * c };
}

const at = (v: { readonly x: number; readonly z: number; readonly rotY: number }, lx: number, lz: number): { x: number; z: number } => {
  const o = vehicleToWorld(lx, lz, v.rotY);
  return { x: v.x + o.x, z: v.z + o.z };
};

/** Bed point (load / dump / tip / hopper test): rear, the wheelbarrow's at the front (92). */
export const bedPoint = (t: VehicleType, v: { readonly x: number; readonly z: number; readonly rotY: number }): { x: number; z: number } =>
  at(v, 0, t.key === 'wheelbarrow' ? -t.l / 2 - 0.3 : t.l / 2 + 0.3);
/** Filler neck (left side, rear quarter). */
export const fillerNeck = (t: VehicleType, v: { readonly x: number; readonly z: number; readonly rotY: number }): { x: number; z: number } =>
  at(v, -t.w / 2 - 0.3, t.l / 4);
/** The two end circles (same r) at local (0, ±(L/2 − r)). */
export const endCircles = (t: VehicleType, v: { readonly x: number; readonly z: number; readonly rotY: number }): { x: number; z: number }[] =>
  [at(v, 0, -(t.l / 2 - t.r)), at(v, 0, t.l / 2 - t.r)];
/** Exit point: driver side (local −W/2 − 0.6, 0). */
export const exitPoint = (t: VehicleType, v: { readonly x: number; readonly z: number; readonly rotY: number }): { x: number; z: number } => at(v, -t.w / 2 - 0.6, 0);

/** Spawn slot per type, heading +x (rotY = −π/2). */
export const spawnSlot = (type: number): { readonly x: number; readonly z: number; readonly rotY: number } => ({ x: -8 + 4 * type, z: -10, rotY: -Math.PI / 2 });

/** Rules constants (F.1). */
export const VEHICLE = {
  cap: 6,
  /** Enter / repair / jerry-can reach beyond the body radius. */
  reachPadM: 1.5,
  /** Load / dump / refuel reach from the bed point / filler neck. */
  pointReachM: 1.5,
  stoppedMps: 0.5,
  tipMs: 3000,
  maxBags: 12,
  curbMps: 9.72,
  punctureChance: 0.35,
  alignMax: 4,
  curbCooldownMs: 1000,
  punctFactor: 0.6,
  hornCooldownMs: 1500,
  idleMs: 500,
  repairFt: 3000
} as const;

/** Jerry can (shop, teamFunds): tier 0 benzin, 1 dízel; pours 10 L. */
export const JERRYCAN = { cost: 4000, litres: 10, name: 'Benzineskanna 10 L' } as const;

/** Garage pad (structure type 18): refuel 2 L/s at 400 Ft/L from the team funds. */
export const GARAGE = { lps: 2, ftPerL: 400 } as const;

/** Beacon light radius (101) and the horn's toast radius (104). */
export const BEACON_RANGE_M = 40;
export const HORN_RANGE_M = 40;
