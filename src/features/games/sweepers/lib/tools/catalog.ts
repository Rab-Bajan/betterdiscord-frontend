// Eszközök, fejlesztések és frissítők (C.1, spec 46–59). A szerver ugyanezt a táblát kódolja be; a kliens
// ebből jósol, rajzol eszközsort és boltot. Tiszta kód.

export type ToolRegion = 'arc' | 'cone' | 'hand';

export interface ToolSpec {
  readonly id: number;
  readonly name: string;
  /** Short hotbar label. */
  readonly short: string;
  /** Tool buffer, kg; null = no buffer (blower) or straight to the backpack (hand). */
  readonly bufKg: number | null;
  /** Head width, m (arc tools). */
  readonly width: number;
  readonly reach: number;
  readonly region: ToolRegion;
  /** Swept area per second, m²/s (0: does not sweep cells). */
  readonly speed: number;
  /** Seconds between uses of the primary action. */
  readonly cadence: number;
  /** Stamina per primary use (0..100 scale). */
  readonly stamina: number;
  /** Seconds between uses of the secondary action (RMB); null = none. */
  readonly altCadence: number | null;
  readonly altStamina: number;
  /** Price in Ft; 0 = owned from the start. */
  readonly cost: number;
}

export const TOOLS: readonly ToolSpec[] = [
  { id: 0, name: 'Elhasznált WC-kefe', short: 'WC-kefe', bufKg: 0.5, width: 0.25, reach: 0.6, region: 'arc', speed: 0.08, cadence: 0.5, stamina: 0.5, altCadence: 1, altStamina: 2, cost: 0 },
  { id: 1, name: 'Háztartási partvis és lapát', short: 'Partvis', bufKg: 3.5, width: 0.6, reach: 1.2, region: 'arc', speed: 0.35, cadence: 0.5, stamina: 0.8, altCadence: 1, altStamina: 2, cost: 1500 },
  { id: 2, name: 'Cirokseprű', short: 'Cirokseprű', bufKg: 8, width: 0.9, reach: 1.2, region: 'arc', speed: 0.85, cadence: 0.5, stamina: 1, altCadence: 1, altStamina: 2, cost: 6000 },
  { id: 3, name: 'Ipari piros utcaseprű', short: 'Utcaseprű', bufKg: 18, width: 1.6, reach: 1.3, region: 'arc', speed: 1.8, cadence: 0.5, stamina: 1.4, altCadence: 1, altStamina: 2, cost: 22000 },
  { id: 4, name: 'Kétütemű lombfúvó', short: 'Lombfúvó', bufKg: null, width: 0, reach: 7, region: 'cone', speed: 0, cadence: 0.25, stamina: 0.25, altCadence: 1, altStamina: 0.25, cost: 65000 },
  { id: 5, name: 'Miskolc-Vakuum 3000', short: 'Vakuum', bufKg: 45, width: 0, reach: 3.5, region: 'cone', speed: 2.4, cadence: 0.25, stamina: 0.25, altCadence: 1, altStamina: 0.25, cost: 140000 },
  { id: 6, name: 'Mágneses gereblye & fémkereső', short: 'Gereblye', bufKg: 25, width: 1.2, reach: 1.2, region: 'arc', speed: 0, cadence: 0.5, stamina: 0.8, altCadence: null, altStamina: 0, cost: 220000 },
  { id: 7, name: 'Kéz', short: 'Kéz', bufKg: null, width: 0, reach: 2, region: 'hand', speed: 0, cadence: 0.33, stamina: 0.3, altCadence: 1, altStamina: 0.5, cost: 0 }
];

export const HAND_TOOL = 7;
export const BROOM_TOOLS: readonly number[] = [0, 1, 2, 3];
export const isBroom = (tool: number): boolean => tool >= 0 && tool <= 3;
export const toolSpec = (tool: number): ToolSpec | null => TOOLS[tool] ?? null;

/** Tools 1..3 wear (56); `PersonalState.dur[tool − 1]` holds their permille. */
export const wears = (tool: number): boolean => tool >= 1 && tool <= 3;

/** Bit `tool` of the owned mask. */
export const ownsTool = (owned: number, tool: number): boolean => tool >= 0 && tool < TOOLS.length && ((owned >> tool) & 1) === 1;

/** Backpack levels 0–4 (54). */
export const PACK_LEVELS: readonly { readonly kg: number; readonly l: number; readonly cost: number; readonly name: string }[] = [
  { kg: 10, l: 8, cost: 0, name: 'Zsebek' },
  { kg: 25, l: 30, cost: 2500, name: 'Tesco-szatyor' },
  { kg: 50, l: 60, cost: 9000, name: 'Vászon hátizsák' },
  { kg: 100, l: 120, cost: 30000, name: 'Keretes túrahátizsák' },
  { kg: 180, l: 220, cost: 85000, name: 'Karbon ipari hulladékzsák' }
];

/** Broom head extension levels 1–5 (53): extra width of tools 0–3. Index 0 = level 0. */
export const WIDTH_LEVELS: readonly { readonly bonus: number; readonly cost: number }[] = [
  { bonus: 0, cost: 0 },
  { bonus: 0.15, cost: 3000 },
  { bonus: 0.3, cost: 8000 },
  { bonus: 0.5, cost: 20000 },
  { bonus: 0.75, cost: 45000 },
  { bonus: 1.1, cost: 90000 }
];

/** Bristle hardness levels 1–3 (55): heavy-slag efficiency and wear multipliers. */
export const HARD_LEVELS: readonly { readonly eff: number; readonly wear: number; readonly cost: number }[] = [
  { eff: 1, wear: 1, cost: 0 },
  { eff: 1.33, wear: 0.8, cost: 5000 },
  { eff: 1.67, wear: 0.6, cost: 15000 },
  { eff: 2, wear: 0.4, cost: 40000 }
];

export const GLOVES_COST = 2500;
export const FUEL_COST = 600;
export const FUEL_TANK_ML = 2000;
export const FUEL_PER_PULSE_ML = 5;
export const FUEL_PER_TURBO_ML = 50;

export type Refreshment = 'beer' | 'kofola' | 'zsiros';
export const REFRESHMENTS: readonly { readonly item: Refreshment; readonly name: string; readonly cost: number; readonly effect: string }[] = [
  { item: 'beer', name: 'Borsodi világos', cost: 450, effect: '+50 állóképesség, 15 mp szédülés' },
  { item: 'kofola', name: 'Kofola', cost: 350, effect: '+35 állóképesség, 45 mp gyorsabb sprint' },
  { item: 'zsiros', name: 'Zsíros deszka lilahagymával', cost: 900, effect: 'Teli állóképesség' }
];

/** Repair (56) of tool 1..3 costs 10 % of its price. */
export const repairCost = (tool: number): number => Math.round((toolSpec(tool)?.cost ?? 0) * 0.1);

/** Kofola sprint multiplier (both sides). */
export const KOFOLA_SPRINT = 1.15;
/** Workbench / office reach and kiosk reach for buy_upgrade (C.4). */
export const WORKBENCH_RADIUS_M = 8;
export const KIOSK_RADIUS_M = 4;
/** Below this durability (permille) the width is halved. */
export const WORN_PERMILLE = 200;

export type UpgradeItem = 'tool' | 'width' | 'pack' | 'hard' | 'gloves' | 'repair' | 'fuel' | Refreshment;
