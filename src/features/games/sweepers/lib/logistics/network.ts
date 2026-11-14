// Szalaghálózat geometriája (D.1/D.2/D.5): világ-portok, pályapontok, összeköttetések a port-szabállyal, és a
// rakomány mozgásának kliensoldali becslése két szerversor között. Tiszta kód (three nélkül).
import { BELT_MPS, LANDMARK_INTAKE_PAD_M, LANDMARK_NODE, PITCH_M, STRUCT_TYPES, T_HOPPER, T_MERGER, T_SPLITTER, deckY, isSorter, toWorld, type Port } from './tables';
import type { CargoRow, StructRow } from '../../logisticsTypes';
import type { Placement } from '../../worldTypes';

export interface WorldPort {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  /** World heading (unit). */
  readonly hx: number;
  readonly hz: number;
}

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function worldPort(row: StructRow, port: Port): WorldPort {
  const o = toWorld(port.x, port.z, row.rot);
  const h = toWorld(port.hx, port.hz, row.rot);
  return { x: row.x + o.x, z: row.z + o.z, y: deckY(row.baseY, row.lvl + port.dl), hx: h.x, hz: h.z };
}

export function inPorts(row: StructRow): WorldPort[] {
  return (STRUCT_TYPES[row.type]?.ins ?? []).map((port) => worldPort(row, port));
}

export function outPorts(row: StructRow): WorldPort[] {
  return (STRUCT_TYPES[row.type]?.outs ?? []).map((port) => worldPort(row, port));
}

/** Path length of a node (0 without a path). */
export const pathLen = (row: StructRow): number => STRUCT_TYPES[row.type]?.len ?? 0;

/** The landmark hopper (node 0): its out port at local (0, −w/2) heading −z, deck = ground(port) + 0.35. */
export function landmarkOutPort(hopper: Placement & { readonly w: number }, ground: (x: number, z: number) => number): WorldPort {
  const c = Math.cos(hopper.rotY);
  const s = Math.sin(hopper.rotY);
  // local (0, lz) → world (lz·sin θ, lz·cos θ)
  const lz = -hopper.w / 2;
  const x = hopper.x + lz * s;
  const z = hopper.z + lz * c;
  return { x, z, y: ground(x, z) + 0.35, hx: -s, hz: -c };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * World point at `s` metres along a node's path. `route` picks the splitter output (0 straight, 1 left,
 * 2 right), `input` the merger input (0 left, 1 right).
 */
export function pathPoint(row: StructRow, s: number, route = 0, input = 0): Point3 {
  const t = STRUCT_TYPES[row.type];
  const len = t?.len ?? 0;
  const at = (lx: number, lz: number, y: number): Point3 => {
    const o = toWorld(lx, lz, row.rot);
    return { x: row.x + o.x, y, z: row.z + o.z };
  };
  const deck = deckY(row.baseY, row.lvl);
  if (!t || len <= 0) return at(0, 0, deck);
  const u = Math.min(1, Math.max(0, s / len));
  const outs = t.outs;
  const ins = t.ins;
  if (t.family === 'bend') {
    // arc of r 0.5 around (∓0.5, +0.5): starts at the in port, a quarter turn to the out port
    const sx = t.outs[0] && t.outs[0].x < 0 ? 1 : -1;
    const a = u * (Math.PI / 2);
    return at(-sx * 0.5 + sx * 0.5 * Math.cos(a), 0.5 - 0.5 * Math.sin(a), deck);
  }
  if (row.type === T_SPLITTER || row.type === T_MERGER || isSorter(row.type)) {
    const from = row.type === T_MERGER ? ins[input] ?? ins[0] : ins[0];
    const to = row.type === T_MERGER ? outs[0] : outs[route] ?? outs[0];
    if (!from || !to) return at(0, 0, deck);
    return u <= 0.5 ? at(lerp(from.x, 0, u * 2), lerp(from.z, 0, u * 2), deck) : at(lerp(0, to.x, u * 2 - 1), lerp(0, to.z, u * 2 - 1), deck);
  }
  const a = ins[0];
  const b = outs[0];
  if (!a || !b) return at(0, 0, deck);
  return at(lerp(a.x, b.x, u), lerp(a.z, b.z, u), lerp(deckY(row.baseY, row.lvl + a.dl), deckY(row.baseY, row.lvl + b.dl), u));
}

/** Where an out port delivers: another node's in port, a hopper (its intake), or nothing (an open end). */
export type LinkTarget = { readonly kind: 'node'; readonly node: number; readonly input: number } | { readonly kind: 'hopper'; readonly node: number } | null;

const portKey = (x: number, z: number): string => `${Math.round(x * 1000)},${Math.round(z * 1000)}`;

/** Axis-aligned intake zone of a hopper. */
export interface IntakeZone {
  readonly node: number;
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

/** Buildable hopper: its footprint; the landmark hopper: its footprint expanded by 1.5 m (D.1). */
export function intakeZones(rows: Iterable<StructRow>, landmark: (Placement & { readonly w: number; readonly d: number }) | null): IntakeZone[] {
  const out: IntakeZone[] = [];
  if (landmark) {
    const odd = Math.abs(Math.sin(landmark.rotY)) > 0.5;
    const hw = (odd ? landmark.d : landmark.w) / 2 + LANDMARK_INTAKE_PAD_M;
    const hd = (odd ? landmark.w : landmark.d) / 2 + LANDMARK_INTAKE_PAD_M;
    out.push({ node: LANDMARK_NODE, x0: landmark.x - hw, x1: landmark.x + hw, z0: landmark.z - hd, z1: landmark.z + hd });
  }
  for (const r of rows) if (r.type === T_HOPPER) out.push({ node: r.id, x0: r.x - 2, x1: r.x + 2, z0: r.z - 2, z1: r.z + 2 });
  return out;
}

export const inZone = (zone: IntakeZone, x: number, z: number): boolean => x >= zone.x0 && x <= zone.x1 && z >= zone.z0 && z <= zone.z1;

/**
 * Links of every out port (D.2): it links to an in port iff x and z match within 1 mm, the deck within
 * 0.05 m and the headings are equal; else it feeds a hopper whose intake zone holds it; else it is open.
 * Key: `${node}:${outIdx}`.
 */
export function computeLinks(rows: ReadonlyMap<number, StructRow>, zones: readonly IntakeZone[]): Map<string, LinkTarget> {
  const ins = new Map<string, { node: number; input: number; port: WorldPort }[]>();
  for (const r of rows.values()) {
    inPorts(r).forEach((port, input) => {
      const k = portKey(port.x, port.z);
      const list = ins.get(k);
      if (list) list.push({ node: r.id, input, port });
      else ins.set(k, [{ node: r.id, input, port }]);
    });
  }
  const links = new Map<string, LinkTarget>();
  for (const r of rows.values()) {
    outPorts(r).forEach((port, outIdx) => {
      const match = (ins.get(portKey(port.x, port.z)) ?? []).find((c) => c.node !== r.id && Math.abs(c.port.y - port.y) <= 0.05
        && Math.abs(c.port.hx - port.hx) < 1e-6 && Math.abs(c.port.hz - port.hz) < 1e-6);
      const zone = match ? undefined : zones.find((zn) => zn.node !== r.id && inZone(zn, port.x, port.z));
      links.set(`${r.id}:${outIdx}`, match ? { kind: 'node', node: match.node, input: match.input } : zone ? { kind: 'hopper', node: zone.node } : null);
    });
  }
  return links;
}

/** A cargo row as the client keeps it: the server time of the row and the merger input it entered by. */
export interface CargoEntry extends CargoRow {
  readonly t: number;
  readonly input: number;
}

/**
 * Client motion between rows (D.5): `s + 1.4·(serverNow − t)` while `mv`, limited by `len` and by the
 * 0.6 m pitch behind the cargo ahead on the same node. A transfer waits for the server row (it snaps).
 * Returns id → s for every cargo of one node.
 */
export function extrapolateNode(cargo: readonly CargoEntry[], len: number, serverNow: number, speed = BELT_MPS): Map<number, number> {
  const sorted = [...cargo].sort((a, b) => b.s - a.s || a.id - b.id);
  const out = new Map<number, number>();
  let ahead = Infinity;
  for (const c of sorted) {
    const raw = c.mv ? c.s + speed * Math.max(0, serverNow - c.t) / 1000 : c.s;
    const s = Math.max(c.s, Math.min(raw, len, ahead - PITCH_M));
    out.set(c.id, s);
    ahead = s;
  }
  return out;
}
