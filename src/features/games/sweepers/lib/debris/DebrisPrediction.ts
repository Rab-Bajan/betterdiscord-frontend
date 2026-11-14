// Előrejelzés és visszagörgetés (C.7 "Prediction"): egy használat azonnal elrejti a várt tárgyakat és
// lefesti a várt cellaszinteket. Az ack a nem gyűjtött tárgyakat visszahozza; elutasításkor, 1 s ack
// nélkül, vagy a siker utáni első delta után a cellák a tükörből (szerverigazság) festődnek újra.
import type { ChunkStore, CellPaint } from './ChunkStore';
import type { CellDelta } from '../../debrisTypes';

/** Hidden items reappear when no ack came within this time. */
export const PREDICTION_TIMEOUT_MS = 1000;

interface Pending {
  readonly at: number;
  readonly items: readonly number[];
  readonly cells: readonly CellDelta[];
  /** Acked ok: the cells settle on the next applied update (which carries the server's deltas). */
  settling: boolean;
}

export class DebrisPrediction {
  readonly #store: ChunkStore;
  readonly #pending = new Map<number, Pending>();

  constructor(store: ChunkStore) {
    this.#store = store;
  }

  get pendingCount(): number {
    return this.#pending.size;
  }

  /** Records use `seq`: hides `items`; returns the predicted cells to paint. */
  begin(seq: number, items: readonly number[], cells: readonly CellDelta[], now: number): CellPaint[] {
    this.#pending.set(seq, { at: now, items, cells, settling: false });
    this.#store.hide(items);
    const out: CellPaint[] = [];
    for (const cell of cells) {
      const truth = this.#store.paintFromStore(cell.chunk, cell.idx);
      if (truth) out.push({ x: truth.x, z: truth.z, byte: cell.byte });
    }
    return out;
  }

  /**
   * The ack of use `seq`. `collected` = the ack's item ids, null when the use was refused.
   * Returns the cells to repaint from the mirror now (refusal); on success they settle later.
   */
  ack(seq: number, collected: readonly number[] | null): CellPaint[] {
    const entry = this.#pending.get(seq);
    if (!entry) return [];
    const keep = new Set(collected ?? []);
    // collected items stay hidden until their `del` delta arrives
    this.#store.reveal(entry.items.filter((id) => !keep.has(id)));
    if (collected === null) {
      this.#pending.delete(seq);
      return this.#truth(entry.cells);
    }
    if (entry.cells.length === 0) this.#pending.delete(seq);
    else entry.settling = true;
    return [];
  }

  /** After an update was applied: settled uses repaint their predicted cells from the mirror. */
  afterUpdate(): CellPaint[] {
    const out: CellPaint[] = [];
    for (const [seq, entry] of this.#pending) {
      if (!entry.settling) continue;
      out.push(...this.#truth(entry.cells));
      this.#pending.delete(seq);
    }
    return out;
  }

  /** Uses without an ack (or delta) for 1 s roll back: items reappear, cells repaint from the mirror. */
  expire(now: number): CellPaint[] {
    const out: CellPaint[] = [];
    for (const [seq, entry] of this.#pending) {
      if (now - entry.at < PREDICTION_TIMEOUT_MS) continue;
      if (!entry.settling) this.#store.reveal(entry.items);
      out.push(...this.#truth(entry.cells));
      this.#pending.delete(seq);
    }
    return out;
  }

  clear(): void {
    this.#pending.clear();
  }

  #truth(cells: readonly CellDelta[]): CellPaint[] {
    const out: CellPaint[] = [];
    for (const cell of cells) {
      const paint = this.#store.paintFromStore(cell.chunk, cell.idx);
      if (paint) out.push(paint);
    }
    return out;
  }
}
