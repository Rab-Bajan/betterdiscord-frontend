// A műszerfal értékei (98), a gyalogos jármű-célpontok (E / R sorrend, F.7) és a kliens toastjai (F.8). Tiszta kód.
import { formatFt } from '../../theme';
import { VEHICLE, VEHICLE_TYPES, bedPoint, fillerNeck } from './tables';
import type { Vehicle } from '../../vehicleTypes';

export interface DashValues {
  readonly name: string;
  readonly kmh: number;
  readonly manual: boolean;
  /** 0..1, null without a tank. */
  readonly fuel: number | null;
  readonly fuelL: number;
  readonly tankL: number;
  /** Cosmetic water temperature, °C. */
  readonly tempC: number;
  readonly bedKg: number;
  readonly capKg: number;
  readonly bags: number;
  readonly lights: 0 | 1 | 2;
  readonly beacon: boolean;
  readonly punct: boolean;
  readonly align: number;
  readonly stalled: boolean;
  readonly driver: boolean;
  /** `Space: billentés` while stopped with a load (driver). */
  readonly tipHint: string | null;
}

const COLD_C = 20;
const HOT_C = 90;
const WARM_MS = 30_000;

/** Dash of the seated vehicle; `speed` m/s (the predicted one for the driver), `runningMs` since the engine started. */
export function dashValues(row: Vehicle, speed: number, runningMs: number, driver: boolean): DashValues {
  const t = VEHICLE_TYPES[row.type];
  const manual = t?.manual ?? true;
  const tankL = t?.tankL ?? 0;
  const tip = driver && Math.abs(speed) < VEHICLE.stoppedMps && !row.tipping && (row.bedKg > 0 || row.bags > 0);
  return {
    name: t?.name ?? '',
    kmh: Math.round(Math.abs(speed) * 3.6),
    manual,
    fuel: tankL > 0 ? Math.min(1, row.fuelL / tankL) : null,
    fuelL: row.fuelL,
    tankL,
    tempC: manual ? COLD_C : Math.round(COLD_C + (HOT_C - COLD_C) * Math.min(1, Math.max(0, runningMs) / WARM_MS)),
    bedKg: row.bedKg,
    capKg: t?.capKg ?? 0,
    bags: row.bags,
    lights: row.lights,
    beacon: row.beacon,
    punct: row.punct,
    align: row.align,
    stalled: row.stalled,
    driver,
    tipHint: tip ? 'Space: billentés' : null
  };
}

const stopped = (r: Vehicle): boolean => r.v < VEHICLE.stoppedMps;
const reach = (r: Vehicle): number => (VEHICLE_TYPES[r.type]?.r ?? 0) + VEHICLE.reachPadM;

/** Nearest stopped vehicle with a free seat within `r + 1.5` m; seat 0 first (98). */
export function nearestEnterable(rows: Iterable<Vehicle>, x: number, z: number): { readonly id: number; readonly seat: number } | null {
  let best: { id: number; seat: number; d: number } | null = null;
  for (const r of rows) {
    const d = Math.hypot(r.x - x, r.z - z);
    const seat = r.seats.indexOf(0);
    if (seat < 0 || !stopped(r) || d > reach(r) || (best && best.d <= d)) continue;
    best = { id: r.id, seat, d };
  }
  return best && { id: best.id, seat: best.seat };
}

/** Nearest vehicle whose bed point is within 1.5 m (load a bag, F.4). */
export function nearestBed(rows: Iterable<Vehicle>, x: number, z: number): number | null {
  return nearestPoint(rows, x, z, (r) => {
    const t = VEHICLE_TYPES[r.type];
    return t ? bedPoint(t, r) : null;
  });
}

/** Nearest motor vehicle whose filler neck is within 1.5 m (refuel with a can). */
export function nearestFiller(rows: Iterable<Vehicle>, x: number, z: number): number | null {
  return nearestPoint(rows, x, z, (r) => {
    const t = VEHICLE_TYPES[r.type];
    return t && !t.manual ? fillerNeck(t, r) : null;
  });
}

function nearestPoint(rows: Iterable<Vehicle>, x: number, z: number, point: (r: Vehicle) => { x: number; z: number } | null): number | null {
  let best: { id: number; d: number } | null = null;
  for (const r of rows) {
    const p = point(r);
    const d = p ? Math.hypot(p.x - x, p.z - z) : Infinity;
    if (d <= VEHICLE.pointReachM && (!best || d < best.d)) best = { id: r.id, d };
  }
  return best?.id ?? null;
}

/** Nearest damaged, stopped vehicle within reach (R repairs it, 103). */
export function nearestRepairable(rows: Iterable<Vehicle>, x: number, z: number): number | null {
  let best: { id: number; d: number } | null = null;
  for (const r of rows) {
    const d = Math.hypot(r.x - x, r.z - z);
    if ((r.align > 0 || r.punct) && stopped(r) && d <= reach(r) && (!best || d < best.d)) best = { id: r.id, d };
  }
  return best?.id ?? null;
}

// the F.8 text as written (hu-HU leaves 4-digit amounts ungrouped)
export const REPAIR_PROMPT = 'Kerékcsere (R) – 3 000 Ft';
export const STALL_TOAST = 'Lefulladt – kifogyott az üzemanyag!';
export const PUNCTURE_TOAST = 'Defekt! A jármű húz – cseréld a kereket (R).';
export const CURB_TOAST = 'Padkának ütköztél – elállítódott a futómű.';
const KG = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 });
export const tipToast = (into: 'hopper' | 'ground', kg: number): string => (into === 'hopper' ? `Ürítés a garatba: ${KG.format(kg)} kg` : `Ürítés a földre: ${KG.format(kg)} kg`);
export const fuelToast = (litres: number, ft: number): string => `Tankolás: ${KG.format(litres)} L (${formatFt(ft)})`;
export const hornToast = (type: number): string => `Dudál a(z) ${VEHICLE_TYPES[type]?.name ?? 'jármű'}!`;
