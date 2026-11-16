// A kliens törmelék-tükre (C.5): betöltött chunkok cellái, ismert tárgyak, térbeli hash, rejtett
// (előrejelzett) tárgyak. Az alkalmazási szabályok a protokollé; a szerver deltái mindig nyernek.
import { SpatialHash } from './SpatialHash';
import { CELLS_PER_CHUNK, cellCentre, cellIdxAt, chunkIdAt } from './tables';
import type { CellDelta, ChunkUpdate, DebrisItem, HexC10, KickDelta } from '../../debrisTypes';

/** A cell whose mask value must be (re)painted: world centre and its byte. */
export interface CellPaint {
  readonly x: number;
  readonly z: number;
  readonly byte: number;
}

export interface ApplyResult {
  /** Every cell to paint into the mask: full loads and every `cells` delta (loaded or not). */
  readonly paint: readonly CellPaint[];
  readonly kicks: readonly KickDelta[];
  readonly hx: readonly HexC10[];
  /** Items removed by `del` (prediction: settled). */
  readonly deleted: readonly number[];
}

export class ChunkStore {
  readonly #chunks = new Map<number, Uint8Array>();
  readonly #items = new Map<number, DebrisItem>();
  readonly #byChunk = new Map<number, Set<number>>();
  readonly #itemChunk = new Map<number, number>();
  readonly #hidden = new Set<number>();
  readonly hash = new SpatialHash();
  /** Bumped when the drawn items may have changed (the renderer rebuilds its instances). */
  #version = 0;

  get version(): number {
    return this.#version;
  }

  get chunkCount(): number {
    return this.#chunks.size;
  }

  get itemCount(): number {
    return this.#items.size;
  }

  chunk(id: number): Uint8Array | undefined {
    return this.#chunks.get(id);
  }

  loadedChunks(): IterableIterator<number> {
    return this.#chunks.keys();
  }

  item(id: number): DebrisItem | undefined {
    return this.#items.get(id);
  }

  items(): IterableIterator<DebrisItem> {
    return this.#items.values();
  }

  /** Ids of the items positioned in chunk `id`. */
  itemsInChunk(id: number): ReadonlySet<number> {
    return this.#byChunk.get(id) ?? EMPTY;
  }

  /** The byte of the cell at world (x, z), or null when its chunk is not loaded. */
  cellAt(x: number, z: number): { chunk: number; idx: number; byte: number } | null {
    const chunk = chunkIdAt(x, z);
    if (chunk === null) return null;
    const bytes = this.#chunks.get(chunk);
    if (!bytes) return null;
    const idx = cellIdxAt(x, z);
    return { chunk, idx, byte: bytes[idx] ?? 0 };
  }

  isHidden(id: number): boolean {
    return this.#hidden.has(id);
  }

  hide(ids: readonly number[]): void {
    for (const id of ids) if (this.#items.has(id)) this.#hidden.add(id);
    if (ids.length > 0) this.#version += 1;
  }

  reveal(ids: readonly number[]): void {
    let changed = false;
    for (const id of ids) changed = this.#hidden.delete(id) || changed;
    if (changed) this.#version += 1;
  }

  /** Everything forgotten (a (re)join: the server streams the interest disc afresh). */
  clear(): void {
    this.#chunks.clear();
    this.#items.clear();
    this.#byChunk.clear();
    this.#itemChunk.clear();
    this.#hidden.clear();
    this.hash.clear();
    this.#version += 1;
  }

  /**
   * Applies one update, in the order load → drop → cells → add → del → kicks:
   * - `load` replaces the chunk and the items positioned in it;
   * - `drop` forgets the chunk and its items;
   * - `cells` update a loaded chunk and are painted into the mask always;
   * - `add` applies when the item is known or its position's chunk is loaded;
   * - `del` applies always;
   * - `kicks` move a known item to its rest point (the renderer animates the roll);
   * - a known item that `add` or a kick moves into an unloaded chunk is forgotten.
   * The version (renderer rebuild) is bumped only when items or chunks changed, not for cells alone.
   */
  apply(update: ChunkUpdate): ApplyResult {
    const paint: CellPaint[] = [];
    // cells alone draw no instance: only item / chunk changes make the renderer rebuild
    let changed = update.load.length > 0 || update.drop.length > 0;
    for (const load of update.load) {
      for (const id of [...this.itemsInChunk(load.id)]) this.#remove(id);
      this.#chunks.set(load.id, load.cells);
      for (let idx = 0; idx < CELLS_PER_CHUNK; idx++) paint.push(this.#paintOf(load.id, idx, load.cells[idx] ?? 0));
      for (const item of load.items) this.#put(item);
    }
    for (const id of update.drop) {
      this.#chunks.delete(id);
      for (const item of [...this.itemsInChunk(id)]) this.#remove(item);
    }
    for (const cell of update.cells) {
      this.#setCell(cell);
      paint.push(this.#paintOf(cell.chunk, cell.idx, cell.byte));
    }
    for (const item of update.add) {
      if (!this.#items.has(item.id) && !this.#isLoadedAt(item.x, item.z)) continue;
      this.#move(item);
      changed = true;
    }
    const deleted: number[] = [];
    for (const id of update.del) {
      if (this.#remove(id)) deleted.push(id);
      this.#hidden.delete(id);
    }
    for (const kick of update.kicks) {
      const item = this.#items.get(kick.id);
      if (!item) continue;
      this.#move({ ...item, x: kick.toX, z: kick.toZ, stuck: false });
      changed = true;
    }
    if (changed || deleted.length > 0) this.#version += 1;
    return { paint, kicks: update.kicks, hx: update.hx, deleted };
  }

  /** The mask value of a cell from the mirror (prediction rollback), or null when not loaded. */
  paintFromStore(chunk: number, idx: number): CellPaint | null {
    const bytes = this.#chunks.get(chunk);
    return bytes ? this.#paintOf(chunk, idx, bytes[idx] ?? 0) : null;
  }

  #paintOf(chunk: number, idx: number, byte: number): CellPaint {
    const { x, z } = cellCentre(chunk, idx);
    return { x, z, byte };
  }

  #setCell(cell: CellDelta): void {
    const bytes = this.#chunks.get(cell.chunk);
    if (bytes) bytes[cell.idx] = cell.byte;
  }

  #isLoadedAt(x: number, z: number): boolean {
    const chunk = chunkIdAt(x, z);
    return chunk !== null && this.#chunks.has(chunk);
  }

  /** `add` / kick: a known item that leaves the loaded chunks is forgotten (no phantoms in the hash). */
  #move(item: DebrisItem): void {
    if (this.#isLoadedAt(item.x, item.z)) this.#put(item);
    else this.#remove(item.id);
  }

  #put(item: DebrisItem): void {
    const chunk = chunkIdAt(item.x, item.z);
    const old = this.#itemChunk.get(item.id);
    if (old !== undefined && old !== chunk) this.#byChunk.get(old)?.delete(item.id);
    this.#items.set(item.id, item);
    if (chunk === null) {
      this.#itemChunk.delete(item.id);
    } else {
      let set = this.#byChunk.get(chunk);
      if (!set) {
        set = new Set();
        this.#byChunk.set(chunk, set);
      }
      set.add(item.id);
      this.#itemChunk.set(item.id, chunk);
    }
    this.hash.set(item.id, item.x, item.z);
  }

  #remove(id: number): boolean {
    if (!this.#items.delete(id)) return false;
    const chunk = this.#itemChunk.get(id);
    if (chunk !== undefined) {
      const set = this.#byChunk.get(chunk);
      set?.delete(id);
      if (set && set.size === 0) this.#byChunk.delete(chunk);
    }
    this.#itemChunk.delete(id);
    this.hash.delete(id);
    return true;
  }
}

const EMPTY: ReadonlySet<number> = new Set();
