// Normalises the server's `empire:get-content` payload. The server is the single source of
// truth for names, costs and stats; this module only reshapes it (arrays or id-keyed objects).
import { isRecord } from '../../../../shared/lib/guards.ts';
import type { BuildingDef, Cost, EmpireContent, EpochDef, RawContent, ResKey, ResourceView, UnitDef, UpgradeDef } from '../types.ts';

export const RES_KEYS: readonly ResKey[] = ['iron', 'copper', 'food', 'wood'];

export interface ResMeta {
  label: string;
  color: string;
  icon: string;
  hint: string;
}

// UI labels only (not game stats)
export const RES_META: Readonly<Record<ResKey, ResMeta>> = {
  iron: { label: 'Vas', color: '#a9b4d6', icon: '🔩', hint: 'Vas' },
  copper: { label: 'Réz', color: '#e0894a', icon: '🟧', hint: 'Réz és arany' },
  food: { label: 'Kaja', color: '#f0c05a', icon: '🍲', hint: 'Kaja' },
  wood: { label: 'Fa', color: '#8ec06c', icon: '🪵', hint: 'Fa és tégla' }
};

export const isResKey = (k: string): k is ResKey => Object.hasOwn(RES_META, k);

type DefRecord = Record<string, unknown> & { id: unknown };

function toList(x: unknown): DefRecord[] {
  if (!x) return [];
  if (Array.isArray(x)) return x.map((d: unknown, i) => (isRecord(d) ? { ...d, id: d.id ?? String(i) } : { id: String(i) }));
  if (!isRecord(x)) return [];
  return Object.entries(x).map(([id, d]) => (isRecord(d) ? { ...d, id: d.id ?? id } : { id }));
}

function indexById<T extends { id: string }>(list: readonly T[]): Record<string, T> {
  const out: Record<string, T> = Object.create(null);
  for (const d of list) out[d.id] = d;
  return out;
}

// The defs come straight from content.js (the single source of truth); like the arena catalog their
// fields are trusted once the payload is a record. Unit and building ids are always strings (object keys
// or explicit ids), so String() only makes the type true.
const asEpochDef = (d: DefRecord, n: number): EpochDef => ({ ...d, n }) as EpochDef;
const asUnitDef = (d: DefRecord): UnitDef => ({ ...d, id: String(d.id) });
const asBuildingDef = (d: DefRecord): BuildingDef => ({ ...d, id: String(d.id) });

export function normalizeContent(raw: unknown): EmpireContent {
  const src: RawContent = isRecord(raw) ? raw : {};
  const epochs = toList(src.epochs).map((e, i) => {
    const n = Number(e.n ?? e.epoch ?? (Number.isFinite(Number(e.id)) ? e.id : i + 1));
    return asEpochDef(e, n);
  }).sort((a, b) => a.n - b.n);
  const unitList = toList(src.units).map(asUnitDef);
  const buildingList = toList(src.buildings).map(asBuildingDef);
  return {
    raw: src,
    epochs,
    unitList,
    buildingList,
    units: indexById(unitList),
    buildings: indexById(buildingList)
  };
}

export function epochName(content: EmpireContent | null | undefined, n: number): string {
  const e = content?.epochs?.find((x) => x.n === n);
  return e?.name || `${n}. korszak`;
}

interface EpochRequirement {
  epoch?: unknown;
  requires?: { epoch?: unknown };
  minEpoch?: unknown;
}

// Epoch requirement of a def (1 when unspecified)
export function reqEpoch(def: EpochRequirement | null | undefined): number {
  const v = def?.epoch ?? def?.requires?.epoch ?? def?.minEpoch;
  return Number.isFinite(Number(v)) ? Number(v) : 1;
}

export function canAfford(res: Partial<ResourceView> | null | undefined, cost: Cost | null | undefined): boolean {
  if (!cost) return true;
  for (const k of RES_KEYS) if ((cost[k] || 0) > (res?.[k] || 0)) return false;
  return true;
}

export function costEntries(cost: Cost | null | undefined): Array<[ResKey, number]> {
  if (!cost) return [];
  return RES_KEYS.flatMap((k): Array<[ResKey, number]> => {
    const v = cost[k];
    return v !== undefined && v > 0 ? [[k, v]] : [];
  });
}

// Building footprint in tiles. Server def `size` wins; the fallback is purely visual.
const SIZE_FALLBACK: Readonly<Record<string, number>> = { townCenter: 4, scrapYard: 3, tavern: 3, barracks: 3, workshop: 3, tower: 2, fence: 1, wall: 1, house: 2 };
export function buildingSize(content: EmpireContent | null | undefined, kind: string | null | undefined): number {
  const d = kind ? content?.buildings?.[kind] : undefined;
  const s = Number(d?.size);
  return Number.isFinite(s) && s > 0 ? s : (kind ? SIZE_FALLBACK[kind] : undefined) || 2;
}

// Display name of the housing building depends on the owner's epoch ("Viskó" / "Lakótelepi lakás")
export function buildingLabel(content: EmpireContent | null | undefined, kind: string, ownerEpoch?: number): string {
  const d = content?.buildings?.[kind];
  if (kind === 'house' && ownerEpoch !== undefined && Number.isFinite(ownerEpoch)) return ownerEpoch >= 3 ? 'Lakótelepi lakás' : 'Viskó';
  return d?.name || kind;
}

// Building levels: upgrades[i] describes level i + 2 (popCap / hp are that level's totals)
export function buildingLevelCount(content: EmpireContent | null | undefined, kind: string): number {
  return 1 + (content?.buildings?.[kind]?.upgrades?.length || 0);
}
export function nextUpgradeDef(content: EmpireContent | null | undefined, b: { k: string; lv?: number } | null | undefined): UpgradeDef | null {
  if (!b) return null;
  return content?.buildings?.[b.k]?.upgrades?.[(b.lv || 1) - 1] || null;
}
export function levelPopCap(content: EmpireContent | null | undefined, kind: string, lv = 1): number {
  const d = content?.buildings?.[kind];
  return lv > 1 ? d?.upgrades?.[lv - 2]?.popCap || 0 : d?.popCap || 0;
}

export function unitLabel(content: EmpireContent | null | undefined, kind: string): string {
  return content?.units?.[kind]?.name || kind;
}

// Order-type helpers keyed on contract ids
export const isBuilderKind = (k: string): boolean => k === 'builder';
export const isWorkerKind = (k: string): boolean => k === 'scavenger' || k === 'builder';
