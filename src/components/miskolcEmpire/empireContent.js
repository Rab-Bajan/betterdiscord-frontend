// Normalises the server's `empire:get-content` payload. The server is the single source of
// truth for names, costs and stats; this module only reshapes it (arrays or id-keyed objects).
export const RES_KEYS = ['iron', 'copper', 'food', 'wood'];

// UI labels only (not game stats)
export const RES_META = {
  iron: { label: 'Vas', color: '#a9b4d6', icon: '🔩', hint: 'Vas' },
  copper: { label: 'Réz', color: '#e0894a', icon: '🟧', hint: 'Réz és arany' },
  food: { label: 'Kaja', color: '#f0c05a', icon: '🍲', hint: 'Kaja' },
  wood: { label: 'Fa', color: '#8ec06c', icon: '🪵', hint: 'Fa és tégla' }
};

function toList(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x.map((d, i) => ({ ...d, id: d.id ?? String(i) }));
  return Object.entries(x).map(([id, d]) => ({ ...d, id: d.id ?? id }));
}

function indexById(list) {
  const out = Object.create(null);
  for (const d of list) out[d.id] = d;
  return out;
}

export function normalizeContent(raw) {
  const src = raw || {};
  const epochs = toList(src.epochs).map((e, i) => {
    const n = Number(e.n ?? e.epoch ?? (Number.isFinite(Number(e.id)) ? e.id : i + 1));
    return { ...e, n };
  }).sort((a, b) => a.n - b.n);
  const unitList = toList(src.units);
  const buildingList = toList(src.buildings);
  return {
    raw: src,
    epochs,
    unitList,
    buildingList,
    units: indexById(unitList),
    buildings: indexById(buildingList)
  };
}

export function epochName(content, n) {
  const e = content?.epochs?.find((x) => x.n === n);
  return e?.name || `${n}. korszak`;
}

// Epoch requirement of a def (1 when unspecified)
export function reqEpoch(def) {
  const v = def?.epoch ?? def?.requires?.epoch ?? def?.minEpoch;
  return Number.isFinite(Number(v)) ? Number(v) : 1;
}

export function canAfford(res, cost) {
  if (!cost) return true;
  for (const k of RES_KEYS) if ((cost[k] || 0) > (res?.[k] || 0)) return false;
  return true;
}

export function costEntries(cost) {
  if (!cost) return [];
  return RES_KEYS.filter((k) => cost[k] > 0).map((k) => [k, cost[k]]);
}

// Building footprint in tiles. Server def `size` wins; the fallback is purely visual.
const SIZE_FALLBACK = { townCenter: 4, scrapYard: 3, tavern: 3, barracks: 3, workshop: 3, tower: 2, fence: 1, wall: 1, house: 2 };
export function buildingSize(content, kind) {
  const d = content?.buildings?.[kind];
  const s = Number(d?.size);
  return Number.isFinite(s) && s > 0 ? s : SIZE_FALLBACK[kind] || 2;
}

// Display name of the housing building depends on the owner's epoch ("Viskó" / "Lakótelepi lakás")
export function buildingLabel(content, kind, ownerEpoch) {
  const d = content?.buildings?.[kind];
  if (kind === 'house' && Number.isFinite(ownerEpoch)) return ownerEpoch >= 3 ? 'Lakótelepi lakás' : 'Viskó';
  return d?.name || kind;
}

export function unitLabel(content, kind) {
  return content?.units?.[kind]?.name || kind;
}

// Order-type helpers keyed on contract ids
export const isBuilderKind = (k) => k === 'builder';
export const isWorkerKind = (k) => k === 'scavenger' || k === 'builder';
