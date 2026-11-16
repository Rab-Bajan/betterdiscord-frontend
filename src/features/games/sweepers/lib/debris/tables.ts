// Phase C táblák (C.1/C.2): hulladéktípusok és a törmelékrács. A protokoll sorrendje az index; a szerver
// ugyanezt kódolja be, a C fixture rögzíti. Tiszta kód (three nélkül).

/** Item kinds; the index is the wire `kind` of an ItemRow. */
export const ITEM_KINDS = ['can', 'iron', 'copper', 'pile', 'cabbage', 'cauldron', 'catalyst', 'lenin'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** Jackpot kinds (42), picked by hand (7) only; index 5..7. */
export const JACKPOT_KINDS: readonly ItemKind[] = ['cauldron', 'catalyst', 'lenin'];
export const isJackpot = (kind: ItemKind): boolean => JACKPOT_KINDS.includes(kind);

/** Player-facing item names (toasts: "Kincs! {név}"). */
export const ITEM_NAMES: Readonly<Record<ItemKind, string>> = {
  can: 'Sörösdoboz',
  iron: 'Ócskavas',
  copper: 'Vörösréz',
  pile: 'Szemétkupac',
  cabbage: 'Rothadt káposzta',
  cauldron: 'Rézüst',
  catalyst: 'Katalizátor',
  lenin: 'Bronz Lenin-fej'
};

/** Volume of a carried item (C.1, 39): can 0.6 L, iron 0.5 L/kg, copper 0.3 L/kg, cabbage 6.7 L/kg, jackpots fixed. */
export function itemLitres(kind: ItemKind, massKg: number): number {
  switch (kind) {
    case 'can':
      return 0.6;
    case 'iron':
      return massKg * 0.5;
    case 'copper':
      return massKg * 0.3;
    case 'cabbage':
      return massKg * 6.7;
    case 'cauldron':
      return 80;
    case 'catalyst':
      return 6;
    case 'lenin':
      return 40;
    default:
      return 0;
  }
}

/** Item flags in `rf >> 8`: 1 stuck (cans between cobblestones, 57), 2 buried (copper, only the rake finds it). */
export const FLAG_STUCK = 1;
export const FLAG_BURIED = 2;

// Debris grid (C.2): 0.5 m cells over x, z ∈ [−256, 256); chunk = 16×16 cells (8 m), 64×64 chunks.
export const DEBRIS_ORIGIN = -256;
export const CHUNK_M = 8;
export const CELL_M = 0.5;
export const CHUNKS_PER_SIDE = 64;
export const CELLS_PER_SIDE = 16;
export const CELLS_PER_CHUNK = CELLS_PER_SIDE * CELLS_PER_SIDE;
export const CHUNK_COUNT = CHUNKS_PER_SIDE * CHUNKS_PER_SIDE;
/** Interest radius the server loads chunks within (init_state.debris.loadM). */
export const LOAD_RADIUS_M = 48;
/** Highest level of a dust / seed nibble. */
export const MAX_LEVEL = 15;

/** Chunk id of world (x, z), or null outside the grid. */
export function chunkIdAt(x: number, z: number): number | null {
  const cx = Math.floor((x - DEBRIS_ORIGIN) / CHUNK_M);
  const cz = Math.floor((z - DEBRIS_ORIGIN) / CHUNK_M);
  if (!(cx >= 0 && cx < CHUNKS_PER_SIDE && cz >= 0 && cz < CHUNKS_PER_SIDE)) return null;
  return cz * CHUNKS_PER_SIDE + cx;
}

/** Cell index (lz·16 + lx) of world (x, z) inside its chunk. */
export function cellIdxAt(x: number, z: number): number {
  const lx = Math.floor((x - DEBRIS_ORIGIN) / CELL_M) % CELLS_PER_SIDE;
  const lz = Math.floor((z - DEBRIS_ORIGIN) / CELL_M) % CELLS_PER_SIDE;
  return lz * CELLS_PER_SIDE + lx;
}

/** World centre of one cell: −256 + cx·8 + (lx + 0.5)·0.5 (z the same way). */
export function cellCentre(chunkId: number, cellIdx: number): { x: number; z: number } {
  const cx = chunkId % CHUNKS_PER_SIDE;
  const cz = Math.floor(chunkId / CHUNKS_PER_SIDE);
  const lx = cellIdx % CELLS_PER_SIDE;
  const lz = Math.floor(cellIdx / CELLS_PER_SIDE);
  return { x: DEBRIS_ORIGIN + cx * CHUNK_M + (lx + 0.5) * CELL_M, z: DEBRIS_ORIGIN + cz * CHUNK_M + (lz + 0.5) * CELL_M };
}

/** World centre of a chunk. */
export function chunkCentre(chunkId: number): { x: number; z: number } {
  const cx = chunkId % CHUNKS_PER_SIDE;
  const cz = Math.floor(chunkId / CHUNKS_PER_SIDE);
  return { x: DEBRIS_ORIGIN + (cx + 0.5) * CHUNK_M, z: DEBRIS_ORIGIN + (cz + 0.5) * CHUNK_M };
}

export const dustLevel = (byte: number): number => (byte >> 4) & 0x0f;
export const seedLevel = (byte: number): number => byte & 0x0f;
export const packCell = (dust: number, seed: number): number => ((dust & 0x0f) << 4) | (seed & 0x0f);

/** Mask value of a cell (C.7): 1 − max(dustL, seedL) / 15 (1 = clean). */
export const cellCleanliness = (byte: number): number => 1 - Math.max(dustLevel(byte), seedLevel(byte)) / MAX_LEVEL;

/** (dust, seed) multipliers per district (backend DISTRICT_PROFILES; unknown → district 0). */
const DISTRICT_DUST_SEED = [[0.8, 0.2], [0.6, 1.0], [0.5, 0.7], [1.0, 0.1], [0.4, 0.9], [0.3, 0.5]] as const;

/** Kg a cell byte holds in `district` (backend grid.ts cellKg: 1.6 kg/m² dust, 0.3 kg/m² seed at level 15). */
export function cellKg(byte: number, district: number | null): number {
  const [dust, seed] = DISTRICT_DUST_SEED[district ?? 0] ?? DISTRICT_DUST_SEED[0];
  return ((dustLevel(byte) * 1.6 * dust + seedLevel(byte) * 0.3 * seed) / MAX_LEVEL) * CELL_M * CELL_M;
}
