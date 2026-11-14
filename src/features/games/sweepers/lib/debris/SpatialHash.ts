// 2D térbeli hash (spec 44): 4 m-es cellák -> tárgyazonosítók, a szerver tükre. Tiszta kód.

export const HASH_CELL_M = 4;
const SPAN = 1 << 12;
const OFFSET = SPAN >> 1;

const cellOf = (v: number): number => Math.floor(v / HASH_CELL_M);
const keyOf = (ix: number, iz: number): number => (ix + OFFSET) * SPAN + (iz + OFFSET);

export class SpatialHash {
  readonly #cells = new Map<number, Set<number>>();
  readonly #where = new Map<number, number>();

  get size(): number {
    return this.#where.size;
  }

  /** Inserts or moves `id` to (x, z). */
  set(id: number, x: number, z: number): void {
    const key = keyOf(cellOf(x), cellOf(z));
    const old = this.#where.get(id);
    if (old === key) return;
    if (old !== undefined) this.#detach(id, old);
    let set = this.#cells.get(key);
    if (!set) {
      set = new Set();
      this.#cells.set(key, set);
    }
    set.add(id);
    this.#where.set(id, key);
  }

  delete(id: number): void {
    const old = this.#where.get(id);
    if (old === undefined) return;
    this.#detach(id, old);
    this.#where.delete(id);
  }

  clear(): void {
    this.#cells.clear();
    this.#where.clear();
  }

  /** Every id in the hash cells touched by the disc (callers test the exact distance). */
  near(x: number, z: number, radius: number): number[] {
    const out: number[] = [];
    const x0 = cellOf(x - radius);
    const x1 = cellOf(x + radius);
    const z0 = cellOf(z - radius);
    const z1 = cellOf(z + radius);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const set = this.#cells.get(keyOf(ix, iz));
        if (set) for (const id of set) out.push(id);
      }
    }
    return out;
  }

  #detach(id: number, key: number): void {
    const set = this.#cells.get(key);
    if (!set) return;
    set.delete(id);
    if (set.size === 0) this.#cells.delete(key);
  }
}
