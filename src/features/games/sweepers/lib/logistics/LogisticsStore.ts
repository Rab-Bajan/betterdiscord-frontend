// A logisztikai hálózat kliensoldali tükre (D.5): épületelemek, földi / vitt / darus zsákok, szalagrakomány,
// garat- és zsákolótöltöttség, darumunka és ívanimációk. A szerver sorai mindig felülírnak. Tiszta kód.
import { computeLinks, extrapolateNode, intakeZones, pathLen, type CargoEntry, type IntakeZone, type LinkTarget } from './network';
import { BELT_MPS } from './tables';
import type { ArcRow, BagRow, CraneJob, LogisticsInit, LogisticsUpdate, StructRow } from '../../logisticsTypes';
import type { Placement } from '../../worldTypes';

export interface ActiveArc extends ArcRow {
  /** Server time the arc starts (the update's `t`). */
  readonly t0: number;
}

export interface UpdateEvents {
  readonly bursts: readonly { readonly id: number; readonly x: number; readonly z: number }[];
  /** Junctions that became jammed with this update. */
  readonly jammed: readonly StructRow[];
  /** Packagers that started a cycle (busy flag on). */
  readonly packing: readonly StructRow[];
}

type Landmark = Placement & { readonly w: number; readonly d: number };

export class LogisticsStore {
  readonly structures = new Map<number, StructRow>();
  readonly bags = new Map<number, BagRow>();
  readonly cargo = new Map<number, CargoEntry>();
  readonly hoppers = new Map<number, number>();
  readonly packagers = new Map<number, number>();
  readonly arcs = new Map<number, ActiveArc>();
  hook = { x: -8.5, z: 0 };
  job: CraneJob | null = null;
  speed = BELT_MPS;
  /** Grid power factor (E.2): the server ticks the belts × pf, so the extrapolation does too. */
  pf = 1;
  #landmark: Landmark | null = null;
  #links = new Map<string, LinkTarget>();
  #zones: IntakeZone[] = [];
  /** Bumps when the structure set changes (renderer rebuild, collider rebuild, links). */
  #version = 0;

  get version(): number {
    return this.#version;
  }

  get links(): ReadonlyMap<string, LinkTarget> {
    return this.#links;
  }

  get zones(): readonly IntakeZone[] {
    return this.#zones;
  }

  /** A (re)join: everything is replaced by init_state. */
  applyInit(init: LogisticsInit | null, landmark: Landmark | null, serverTime: number): void {
    this.structures.clear();
    this.bags.clear();
    this.cargo.clear();
    this.hoppers.clear();
    this.packagers.clear();
    this.arcs.clear();
    this.#landmark = landmark;
    this.speed = init?.beltMps ?? BELT_MPS;
    this.hook = init?.hook ?? { x: -8.5, z: 0 };
    this.job = init?.job ?? null;
    for (const r of init?.structures ?? []) this.structures.set(r.id, r);
    for (const b of init?.bags ?? []) this.bags.set(b.id, b);
    for (const c of init?.cargo ?? []) this.cargo.set(c.id, { ...c, t: serverTime, input: 0 });
    for (const f of init?.hoppers ?? []) this.hoppers.set(f.node, f.kg);
    for (const f of init?.packagers ?? []) this.packagers.set(f.node, f.kg);
    this.#relink();
  }

  /** `structure_spawned` (room-wide, on a place). */
  applySpawned(row: StructRow): void {
    this.structures.set(row.id, row);
    this.#relink();
  }

  applyUpdate(u: LogisticsUpdate): UpdateEvents {
    const jammed: StructRow[] = [];
    const packing: StructRow[] = [];
    let relink = false;
    for (const r of u.s) {
      const before = this.structures.get(r.id);
      if (r.jammed && !before?.jammed) jammed.push(r);
      if (r.busy && before && !before.busy) packing.push(r);
      if (!before || before.x !== r.x || before.z !== r.z || before.rot !== r.rot || before.lvl !== r.lvl || before.type !== r.type || before.baseY !== r.baseY) relink = true;
      this.structures.set(r.id, r);
    }
    for (const id of u.sdel) relink = this.structures.delete(id) || relink;
    if (relink) this.#relink();
    // b / c move an id into that map and out of the other; del destroys it (D.5)
    for (const b of u.b) {
      this.cargo.delete(b.id);
      this.bags.set(b.id, b);
    }
    for (const c of u.c) {
      const prev = this.cargo.get(c.id);
      this.bags.delete(c.id);
      this.cargo.set(c.id, { ...c, t: u.t, input: prev && prev.node === c.node ? prev.input : this.#inputFrom(prev?.node, c.node) });
    }
    for (const id of u.del) {
      this.bags.delete(id);
      this.cargo.delete(id);
      this.arcs.delete(id);
    }
    for (const a of u.arcs) this.arcs.set(a.id, { ...a, t0: u.t });
    if (u.crane !== undefined) {
      if (u.crane === null && this.job) this.hook = { x: this.job.tx, z: this.job.tz };
      this.job = u.crane;
    }
    for (const f of u.hop) this.hoppers.set(f.node, f.kg);
    for (const f of u.pk) this.packagers.set(f.node, f.kg);
    return { bursts: u.burst, jammed, packing };
  }

  /** Extrapolated s of every cargo at `serverNow` (D.5). */
  cargoS(serverNow: number): Map<number, number> {
    const byNode = new Map<number, CargoEntry[]>();
    for (const c of this.cargo.values()) {
      const list = byNode.get(c.node);
      if (list) list.push(c);
      else byNode.set(c.node, [c]);
    }
    const out = new Map<number, number>();
    for (const [node, list] of byNode) {
      const row = this.structures.get(node);
      const len = row ? pathLen(row) : 0;
      for (const [id, s] of extrapolateNode(list, len, serverNow, this.speed * this.pf)) out.set(id, s);
    }
    return out;
  }

  /** The arc of `id` while it runs at `serverNow`, else null (finished arcs are dropped). */
  arcAt(id: number, serverNow: number): ActiveArc | null {
    const arc = this.arcs.get(id);
    if (!arc) return null;
    if (serverNow >= arc.t0 + arc.durMs) {
      this.arcs.delete(id);
      return null;
    }
    return arc;
  }

  /** Crane hook (x, z) and the hoisted bag's lift (0..1) at `serverNow` (D.2 timing: travel, lift 1.5 s, travel, lower 1.5 s). */
  hookAt(serverNow: number, liftS: number): { x: number; z: number; lift: number; carrying: boolean } {
    const job = this.job;
    if (!job) return { ...this.hook, lift: 0, carrying: false };
    const d1 = Math.hypot(job.fx - this.hook.x, job.fz - this.hook.z);
    const d2 = Math.hypot(job.tx - job.fx, job.tz - job.fz);
    const travel = Math.max(1e-6, job.durMs / 1000 - 2 * liftS);
    const speed = (d1 + d2) / travel;
    const t = Math.max(0, (serverNow - job.t0) / 1000);
    const t1 = d1 / Math.max(1e-6, speed);
    const lerp = (ax: number, az: number, bx: number, bz: number, u: number) => ({ x: ax + (bx - ax) * u, z: az + (bz - az) * u });
    if (t < t1) return { ...lerp(this.hook.x, this.hook.z, job.fx, job.fz, t / t1), lift: 0, carrying: false };
    if (t < t1 + liftS) return { x: job.fx, z: job.fz, lift: (t - t1) / liftS, carrying: true };
    const t2 = t1 + liftS + d2 / Math.max(1e-6, speed);
    if (t < t2) return { ...lerp(job.fx, job.fz, job.tx, job.tz, (t - t1 - liftS) / Math.max(1e-6, t2 - t1 - liftS)), lift: 1, carrying: true };
    return { x: job.tx, z: job.tz, lift: Math.max(0, 1 - (t - t2) / liftS), carrying: true };
  }

  #relink(): void {
    this.#version += 1;
    this.#zones = intakeZones(this.structures.values(), this.#landmark);
    this.#links = computeLinks(this.structures, this.#zones);
  }

  /** The merger input the cargo entered by (0 left, 1 right): which input the previous node links into. */
  #inputFrom(prevNode: number | undefined, node: number): number {
    if (prevNode === undefined) return 0;
    for (let out = 0; out < 3; out++) {
      const link = this.#links.get(`${prevNode}:${out}`);
      if (link && link.kind === 'node' && link.node === node) return link.input;
    }
    return 0;
  }
}
