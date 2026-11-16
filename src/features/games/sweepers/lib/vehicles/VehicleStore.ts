// A járművek tükre (F.5): sorok id szerint, a távoli járművek interpolációs puffere és a frissítések
// eseményei (új / törölt sor, dudálás, padka, defekt, lefulladás, billentés). Tiszta kód.
import { InterpolationBuffer, type Pose } from '../net/interpolation';
import type { Vehicle, VehicleHit, VehicleUpdate } from '../../vehicleTypes';

export interface VehicleEvents {
  readonly horn: readonly Vehicle[];
  readonly hit: readonly (VehicleHit & { readonly row: Vehicle })[];
  /** Rows whose stalled / tipping flag just rose. */
  readonly stalled: readonly Vehicle[];
  readonly tipped: readonly Vehicle[];
}

export class VehicleStore {
  readonly rows = new Map<number, Vehicle>();
  readonly #buffers = new Map<number, InterpolationBuffer>();

  applyInit(rows: readonly Vehicle[], serverTime: number): void {
    this.rows.clear();
    this.#buffers.clear();
    for (const r of rows) this.#set(r, serverTime);
  }

  applyUpdate(u: VehicleUpdate): VehicleEvents {
    const stalled: Vehicle[] = [];
    const tipped: Vehicle[] = [];
    for (const r of u.rows) {
      const prev = this.rows.get(r.id);
      if (r.stalled && !prev?.stalled) stalled.push(r);
      if (r.tipping && !prev?.tipping) tipped.push(r);
      this.#set(r, u.t);
    }
    for (const id of u.del) {
      this.rows.delete(id);
      this.#buffers.delete(id);
    }
    const horn = u.horn.flatMap((id) => this.rows.get(id) ?? []);
    const hit = u.hit.flatMap((h) => {
      const row = this.rows.get(h.id);
      return row ? [{ ...h, row }] : [];
    });
    return { horn, hit, stalled, tipped };
  }

  #set(r: Vehicle, t: number): void {
    this.rows.set(r.id, r);
    let buf = this.#buffers.get(r.id);
    if (!buf) {
      buf = new InterpolationBuffer();
      this.#buffers.set(r.id, buf);
    }
    buf.push({ t, x: r.x, y: 0, z: r.z, rotY: r.rotY });
  }

  /** Interpolated pose (remote vehicles), the last row's pose before two samples exist. */
  pose(id: number, serverNow: number): Pose | null {
    const row = this.rows.get(id);
    if (!row) return null;
    return this.#buffers.get(id)?.sample(serverNow) ?? { x: row.x, y: 0, z: row.z, rotY: row.rotY };
  }

  /** The vehicle and seat of a player (short id), or null on foot. */
  seatOf(playerId: number): { readonly row: Vehicle; readonly seat: number } | null {
    for (const row of this.rows.values()) {
      const seat = row.seats.indexOf(playerId);
      if (seat >= 0) return { row, seat };
    }
    return null;
  }

  /** Vehicle types the room owns (one per type, F.1). */
  get ownedTypes(): number[] {
    return [...new Set([...this.rows.values()].map((r) => r.type))].sort((a, b) => a - b);
  }
}
