// Kliensoldali előrejelzés + egyeztetés: a protokoll pózt küld, így a nyugtázatlan
// elmozdulásokat (delta) tartjuk meg, és szerverkorrekciókor ezeket játsszuk vissza.

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface PendingInput {
  readonly seq: number;
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
}

const MAX_PENDING = 120;

export class PredictionBuffer {
  #seq = 0;
  #pending: PendingInput[] = [];
  #lastSent: Vec3 | null = null;

  /** Next outgoing seq for pose `pose`; remembers the displacement since the previous send. */
  record(pose: Vec3): number {
    this.#seq += 1;
    const prev = this.#lastSent ?? pose;
    this.#pending.push({ seq: this.#seq, dx: pose.x - prev.x, dy: pose.y - prev.y, dz: pose.z - prev.z });
    if (this.#pending.length > MAX_PENDING) {
      // fold the oldest displacement into its successor so the replay sum stays exact
      const dropped = this.#pending.shift();
      const next = this.#pending[0];
      if (dropped && next) this.#pending[0] = { seq: next.seq, dx: next.dx + dropped.dx, dy: next.dy + dropped.dy, dz: next.dz + dropped.dz };
    }
    this.#lastSent = { x: pose.x, y: pose.y, z: pose.z };
    return this.#seq;
  }

  /** Server processed everything up to `seq`. */
  acknowledge(seq: number): void {
    this.#pending = this.#pending.filter((p) => p.seq > seq);
  }

  /**
   * Authoritative pose `server` after processing `ackSeq`: returns the reconciled local pose =
   * server pose + the sent-but-unacknowledged displacements + the movement since the last send
   * (`current` - last sent pose).
   */
  reconcile(server: Vec3, ackSeq: number | null, current: Vec3): Vec3 {
    if (ackSeq !== null) this.acknowledge(ackSeq);
    const sent = this.#lastSent ?? current;
    let { x, y, z } = server;
    for (const p of this.#pending) {
      x += p.dx;
      y += p.dy;
      z += p.dz;
    }
    // the next record() measures from where the last send now maps to
    this.#lastSent = { x, y, z };
    return { x: x + current.x - sent.x, y: Math.max(0, y + current.y - sent.y), z: z + current.z - sent.z };
  }

  /** New world / rejoin: forget the history but keep seq monotonic. */
  reset(pose: Vec3): void {
    this.#pending = [];
    this.#lastSent = { x: pose.x, y: pose.y, z: pose.z };
  }

  get pendingCount(): number {
    return this.#pending.length;
  }

  get lastSeq(): number {
    return this.#seq;
  }
}

/** Fixed-rate send gate (≤ 20 Hz). */
export class SendRateLimiter {
  #last = -Infinity;
  constructor(readonly intervalMs = 50) {}

  ready(now: number): boolean {
    if (now - this.#last < this.intervalMs) return false;
    this.#last = now;
    return true;
  }
}
