// Phase E táblák (E.1): anyagok, LME, áram, bolt, ellenőr. A protokoll sorrendje az index; a szerver ugyanezt
// kódolja be, az E fixture rögzíti. Tiszta kód (three nélkül).

/** Receipt `mat` index (77): base Ft/kg, a jackpot's fixed worth per piece, and the LME series (null: none). */
export interface Material {
  readonly key: string;
  readonly name: string;
  readonly ftPerKg: number;
  readonly worth: number;
  readonly lme: number | null;
}

export const MATERIALS: readonly Material[] = [
  { key: 'dust', name: 'Por', ftPerKg: 2, worth: 0, lme: null },
  { key: 'seed', name: 'Napraforgóhéj', ftPerKg: 5, worth: 0, lme: null },
  { key: 'can', name: 'Alumínium doboz', ftPerKg: 35, worth: 0, lme: 0 },
  { key: 'iron', name: 'Ócskavas', ftPerKg: 90, worth: 0, lme: 1 },
  { key: 'copper', name: 'Vörösréz', ftPerKg: 2200, worth: 0, lme: 2 },
  { key: 'cauldron', name: 'Rézüst', ftPerKg: 0, worth: 120_000, lme: null },
  { key: 'catalyst', name: 'Katalizátor', ftPerKg: 0, worth: 85_000, lme: null },
  { key: 'lenin', name: 'Bronz Lenin-fej', ftPerKg: 0, worth: 150_000, lme: null }
];
export const isJackpotMat = (mat: number): boolean => mat >= 5;

/** Receipt `proc` (E.3): 0 raw, 1 bala (×1.45), 2 rez (copper at 3 100 Ft/kg). */
export const PROC_NAMES: readonly string[] = ['', 'bála', 'köteg'];

/** LME (87): 15-min epochs, three series. */
export const LME_EPOCH_MS = 900_000;
export const LME_STEPS: readonly number[] = [-25, -15, -10, -5, 0, 0, 5, 10, 15, 25];
/** |pct| at which the headline is a rally / crash. */
export const LME_HEADLINE_PCT = 15;
export const LME_SERIES: readonly { readonly key: string; readonly name: string }[] = [
  { key: 'alu', name: 'az alumínium' },
  { key: 'iron', name: 'az ócskavas' },
  { key: 'copper', name: 'a vörösréz' }
];

/** Power grid (82–84). */
export const POWER = {
  solarPeakW: 18_000,
  generatorW: 25_000,
  dieselLph: 3.5,
  tankL: 60,
  batteryWh: 150_000,
  batteryMaxW: 15_000,
  brownoutPf: 0.4
} as const;
/** `GridRow.st`. */
export const GRID_STATES = ['ok', 'brownout', 'blackout'] as const;
export type GridState = (typeof GRID_STATES)[number];

/** Machine wear (89): smoking at `wearKg ≥ MAINT_KG`; 4 service points at the footprint corners. */
export const MAINT_KG = 1500;
export const SERVICE_REACH_M = 1.5;

/** Shop additions (85). */
export const GREASE_GUN_COST = 3500;
/** Blueprint price of machine 14 + tier (E.1). */
export const BLUEPRINT_COST: readonly number[] = [40_000, 60_000, 25_000, 30_000];
export const DIESEL_CAN = { cost: 5000, litres: 20, fullL: 59.5 } as const;
/** Licence price per district 1..5 (index 0 unused). */
export const LICENSE_COST: readonly number[] = [0, 15_000, 45_000, 108_000, 210_000, 210_000];

/** Inspector (86): every 30 min; base quota kg per district; fine per failing district. */
export const INSPECTOR_MS = 1_800_000;
export const QUOTA_KG: readonly number[] = [0, 2000, 1500, 2500, 1200, 1000];
export const FINE_FT = 25_000;
export const effectiveQuota = (district: number, connected: number): number =>
  Math.round((QUOTA_KG[district] ?? 0) * Math.min(1, connected / 4));

/** Scales (76): stand still 2 s; the LED shows the weight 10 s. */
export const WEIGH_STILL_MS = 2000;
export const WEIGH_STILL_M = 0.15;
export const LED_SHOW_MS = 10_000;

/** Split (90): 80 % team, 20 % wage pool. */
export const WAGE_SHARE = 0.2;
