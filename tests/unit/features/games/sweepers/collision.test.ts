import { describe, it, expect } from 'vitest';
import { sampleHeight } from '../../../../../src/features/games/sweepers/lib/world/heightfield';
import { ABOVE_GROUND_LIMIT, OPEN_CHECK_STEP, PLAYER_RADIUS, SURFACE_RESPONSE, WorldCollision, covers, pushOut } from '../../../../../src/features/games/sweepers/lib/movement/WorldCollision';
import { WALK_SPEED, stepBody, type BodyState, type MoveIntent } from '../../../../../src/features/games/sweepers/lib/movement/MovementModel';
import { districtAt, districtOf, hexCorner, hexToWorld } from '../../../../../src/features/games/sweepers/lib/world/hexGrid';
import type { Collider, Heightfield, Surface, WorldLayout } from '../../../../../src/features/games/sweepers/worldTypes';
import { realInit } from './fixtures';

const flat = (heights: number[], size: number, origin = 0, cell = 10): Heightfield => ({ origin, cell, size, heightsCm: new Int32Array(heights) });

const layoutWith = (colliders: Collider[], surfaces: Surface[] = [], hf: Heightfield = flat(new Array(61 * 61).fill(0), 61, -300)): WorldLayout => ({
  version: 1,
  heightfield: hf,
  roads: [],
  buildings: [],
  props: [],
  colliders,
  surfaces,
  borders: [],
  landmarks: { weighbridge: { x: 0, z: 0, rotY: 0, w: 12, d: 3.5 }, hopper: { x: 0, z: 0, rotY: 0, w: 4, d: 4 }, office: { x: 0, z: 0, rotY: 0 }, generator: { x: 0, z: 0, rotY: 0 } }
});

const idle: MoveIntent = { forward: 0, strafe: 0, sprint: false, jump: false, yaw: 0 };
const body = (x = 0, z = 0): BodyState => ({ x, y: 0, z, vy: 0, grounded: true });
/** Faces +X (yaw −π/2: forward = (−sin, −cos) = (1, 0)). */
const east: MoveIntent = { ...idle, forward: 1, yaw: -Math.PI / 2 };

const all = new WorldCollision(null);
all.setUnlocked([0, 1, 2, 3, 4, 5]);

describe('heightfield sampling', () => {
  const hf = flat([0, 100, 200, 300], 2);
  it('is exact on samples and bilinear between them', () => {
    expect(sampleHeight(hf, 0, 0)).toBe(0);
    expect(sampleHeight(hf, 10, 0)).toBe(1);
    expect(sampleHeight(hf, 0, 10)).toBe(2);
    expect(sampleHeight(hf, 10, 10)).toBe(3);
    expect(sampleHeight(hf, 5, 5)).toBeCloseTo(1.5);
    expect(sampleHeight(hf, 2.5, 0)).toBeCloseTo(0.25);
  });
  it('extends the edge outside the field', () => {
    expect(sampleHeight(hf, -50, -50)).toBe(0);
    expect(sampleHeight(hf, 99, 99)).toBe(3);
    expect(sampleHeight(hf, 99, -5)).toBe(1);
  });
  it('matches the real fixture grid samples (row-major iz*size+ix)', () => {
    const f = realInit().layout.heightfield;
    for (const [ix, iz] of [[0, 0], [30, 30], [12, 47], [60, 60], [45, 3]] as const) {
      expect(sampleHeight(f, f.origin + ix * f.cell, f.origin + iz * f.cell)).toBeCloseTo((f.heightsCm[iz * f.size + ix] ?? 0) / 100, 6);
    }
  });
});

describe('collision vs. layout colliders (spec 26)', () => {
  it('pushes a circle out of cylinders and (rotated) boxes', () => {
    expect(pushOut({ shape: 'cyl', x: 0, z: 0, r: 1, h: 2 }, 1.2, 0, 0.35)?.x).toBeCloseTo(0.15);
    expect(pushOut({ shape: 'cyl', x: 0, z: 0, r: 1, h: 2 }, 2, 0, 0.35)).toBeNull();
    const box: Collider = { shape: 'box', x: 0, z: 0, w: 4, d: 2, h: 3, rotY: 0 };
    expect(pushOut(box, 2.2, 0, 0.35)?.x).toBeCloseTo(0.15);
    expect(pushOut(box, 0, 0.5, 0.35)?.z).toBeCloseTo(0.85); // inside: out through the nearest face
    // rotated 90°: local x (w = 4) runs along world (cos, −sin) = (0, −1)
    const turned: Collider = { ...box, rotY: Math.PI / 2 };
    expect(pushOut(turned, 0, 2.2, 0.35)?.z).toBeCloseTo(0.15);
    expect(pushOut(turned, 1.2, 0, 0.35)?.x).toBeCloseTo(0.15);
    expect(covers(turned, 0, 1.9)).toBe(true);
    expect(covers(turned, 1.9, 0)).toBe(false);
  });

  it('walking into a wall stops at the player radius and slides along it', () => {
    const world = new WorldCollision(layoutWith([{ shape: 'box', x: 3, z: 0, w: 2, d: 20, h: 3, rotY: 0 }]));
    world.setUnlocked([0, 1, 2, 3, 4, 5]);
    const b = body();
    for (let i = 0; i < 120; i++) stepBody(b, east, 1 / 60, world);
    expect(b.x).toBeCloseTo(2 - PLAYER_RADIUS - 0.01, 2);
    const s = body(1.6, 0);
    const diagonal: MoveIntent = { ...east, strafe: 1 };
    for (let i = 0; i < 60; i++) stepBody(s, diagonal, 1 / 60, world);
    expect(s.x).toBeLessThanOrEqual(2 - PLAYER_RADIUS);
    expect(s.z).toBeGreaterThan(1); // slid along +Z
  });

  it('never tunnels through a thin fence even at 10 fps', () => {
    const world = new WorldCollision(layoutWith([{ shape: 'box', x: 1, z: 0, w: 0.1, d: 10, h: 2, rotY: 0 }]));
    world.setUnlocked([0, 1, 2, 3, 4, 5]);
    const b = body();
    for (let i = 0; i < 30; i++) stepBody(b, { ...east, sprint: true }, 0.1, world);
    expect(b.x).toBeLessThan(1 - 0.05 - PLAYER_RADIUS + 0.02);
  });

  it('steps over curbs (h ≤ 0.35) and stands on them', () => {
    const world = new WorldCollision(layoutWith([{ shape: 'box', x: 2, z: 0, w: 2, d: 10, h: 0.15, rotY: 0 }, { shape: 'box', x: 5, z: 0, w: 2, d: 10, h: 0.36, rotY: 0 }]));
    world.setUnlocked([0, 1, 2, 3, 4, 5]);
    const b = body();
    for (let i = 0; i < 25; i++) stepBody(b, east, 1 / 60, world);
    expect(b.x).toBeGreaterThan(1.5);
    expect(b.y).toBeCloseTo(0.15);
    for (let i = 0; i < 120; i++) stepBody(b, east, 1 / 60, world);
    expect(b.x).toBeCloseTo(4 - PLAYER_RADIUS - 0.01, 2); // 0.36 m blocks
    expect(b.y).toBe(0);
  });

  it('y follows the terrain while walking (feet = ground; the camera adds the eye height)', () => {
    // ramp: 0 m at x = −300 rising 1 m per 10 m cell along +X
    const size = 61;
    const heights: number[] = [];
    for (let iz = 0; iz < size; iz++) for (let ix = 0; ix < size; ix++) heights.push(ix * 100);
    const world = new WorldCollision(layoutWith([], [], flat(heights, size, -300)));
    world.setUnlocked([0, 1, 2, 3, 4, 5]);
    const b = { ...body(0, 0), y: world.terrain(0, 0) };
    for (let i = 0; i < 60; i++) stepBody(b, east, 1 / 60, world);
    expect(b.x).toBeCloseTo(WALK_SPEED, 1);
    expect(b.y).toBeCloseTo((b.x + 300) / 10, 3);
    stepBody(b, { ...idle, jump: true }, 1 / 60, world);
    expect(b.y).toBeGreaterThan(world.terrain(b.x, b.z));
    for (let i = 0; i < 120; i++) stepBody(b, idle, 1 / 60, world);
    expect(b.grounded).toBe(true);
    expect(b.y).toBeCloseTo(world.terrain(b.x, b.z), 5);
  });

  it('keeps every resolved position clear of the real fixture colliders (server graze 0.30 m)', () => {
    const world = new WorldCollision(realInit().layout);
    world.setUnlocked([0, 1, 2, 3, 4, 5]);
    let seed = 99;
    const rand = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const b = body(-2.95, 2.7);
    let yaw = 0;
    for (let i = 0; i < 3000; i++) {
      if (i % 40 === 0) yaw = rand() * Math.PI * 2;
      stepBody(b, { ...idle, forward: 1, sprint: rand() > 0.5, yaw }, 1 / 30, world);
      for (const c of world.blockingAt(b.x, b.z)) expect(pushOut(c, b.x, b.z, PLAYER_RADIUS - 0.05)).toBeNull();
    }
  });
});

describe('server height band (backend validateMove)', () => {
  it('a sprint-jump down the steepest fixture slope never leaves terrain + 1.2', () => {
    const layout = realInit().layout;
    const world = new WorldCollision(layout);
    world.setUnlocked([0, 1, 2, 3, 4, 5]);
    // steepest sample-to-sample drop of the real heightfield (along x or z)
    const { size, cell, origin, heightsCm } = layout.heightfield;
    const h = (ix: number, iz: number): number => (heightsCm[iz * size + ix] ?? 0) / 100;
    let best = { slope: 0, x: 0, z: 0, yaw: 0 };
    for (let iz = 1; iz < size - 1; iz++) {
      for (let ix = 1; ix < size - 1; ix++) {
        const x = origin + ix * cell;
        const z = origin + iz * cell;
        // yaw of a camera looking down +X is −π/2, +Z is π, −X is π/2, −Z is 0
        const drops = [
          { slope: (h(ix, iz) - h(ix + 1, iz)) / cell, yaw: -Math.PI / 2 },
          { slope: (h(ix, iz) - h(ix - 1, iz)) / cell, yaw: Math.PI / 2 },
          { slope: (h(ix, iz) - h(ix, iz + 1)) / cell, yaw: Math.PI },
          { slope: (h(ix, iz) - h(ix, iz - 1)) / cell, yaw: 0 }
        ];
        for (const d of drops) if (d.slope > best.slope) best = { slope: d.slope, x, z, yaw: d.yaw };
      }
    }
    expect(best.slope).toBeGreaterThan(0.35);
    const b: BodyState = { x: best.x, y: world.terrain(best.x, best.z), z: best.z, vy: 0, grounded: true };
    let maxAbove = 0;
    for (let i = 0; i < 60; i++) {
      stepBody(b, { ...idle, forward: 1, sprint: true, jump: true, yaw: best.yaw }, 1 / 60, world);
      const above = b.y - world.terrain(b.x, b.z);
      maxAbove = Math.max(maxAbove, above);
      expect(above).toBeLessThanOrEqual(ABOVE_GROUND_LIMIT);
      expect(above).toBeGreaterThanOrEqual(0);
    }
    // the arc really reaches the band (unclamped it would end ~1.4 m above the falling slope)
    expect(maxAbove).toBeGreaterThan(ABOVE_GROUND_LIMIT - 0.05);
  });
});

describe('locked districts (spec 25/27)', () => {
  it('uses the backend district rule everywhere, also in the outskirts', () => {
    expect(districtOf(0, 0)).toBe(0);
    const { x, z } = hexToWorld(1, 0);
    expect(districtAt(x, z)).toBe(1); // east, angle 0 → sector 1 (Avas)
    expect(districtAt(260, 0)).toBe(1);
    expect(districtAt(-250, -10)).toBe(3);
    for (const hex of realInit().hexes) expect(districtOf(hex.q, hex.r)).toBe(hex.district);
  });

  it('blocks entering a locked district and slides along its border', () => {
    const world = new WorldCollision(layoutWith([]));
    world.setUnlocked([]);
    expect(world.isLocked(0, 0)).toBe(false);
    expect(world.isLocked(hexToWorld(1, 0).x, 0)).toBe(true);
    const b = body(30, 0);
    for (let i = 0; i < 120; i++) stepBody(b, east, 1 / 60, world);
    expect(world.isLocked(b.x, b.z)).toBe(false);
    expect(b.x).toBeLessThan(35);
    world.setUnlocked([1]);
    for (let i = 0; i < 120; i++) stepBody(b, east, 1 / 60, world);
    expect(b.x).toBeGreaterThan(40);
  });

  it('without a path origin (offline, LOW-11) a move is never checked against a stale far-away origin', () => {
    const world = new WorldCollision(layoutWith([]));
    world.setUnlocked([1]); // districts 0 and 1 open
    const stale = { x: 60, z: -20 }; // district 1 (hex 1,0), e.g. the last pose sent before going offline
    const p = { x: 0, z: -35 }; // south end of the centre hex
    const to = { x: 0.2, z: -35 };
    expect([districtAt(stale.x, stale.z), districtAt(p.x, p.z), districtAt(to.x, to.z)]).toEqual([1, 0, 0]);
    // the straight line back to the stale origin cuts the locked hex (1,-1) of district 5
    expect(world.pathOpen(stale.x, stale.z, to.x, to.z)).toBe(false);
    world.setPathOrigin(stale.x, stale.z);
    const checked = world.resolve(p.x, p.z, to.x, to.z);
    expect(Math.hypot(checked.x - to.x, checked.z - to.z)).toBeGreaterThan(0.1); // a stale origin blocks an open step
    world.setPathOrigin(NaN, NaN);
    expect(world.pathOrigin).toBeNull();
    const free = world.resolve(p.x, p.z, to.x, to.z);
    expect(Math.hypot(free.x - to.x, free.z - to.z)).toBeLessThan(1e-9); // only the frame step is checked
  });

  it('near a three-district vertex the path from the last sent pose decides, as on the server (0.25 m samples)', () => {
    const world = new WorldCollision(layoutWith([]));
    const open = new Set([0, 2]);
    world.setUnlocked([...open]);
    // independent copy of the backend pathOpen (motion.ts)
    const serverPathOpen = (f: { x: number; z: number }, t: { x: number; z: number }): boolean => {
      const steps = Math.max(1, Math.ceil(Math.hypot(t.x - f.x, t.z - f.z) / OPEN_CHECK_STEP));
      for (let i = 1; i <= steps; i++) if (!open.has(districtAt(f.x + ((t.x - f.x) * i) / steps, f.z + ((t.z - f.z) * i) / steps))) return false;
      return true;
    };
    // a centre-hex corner V where district 0, district 2 and a locked district L meet: one of its hex
    // edges separates 0 | L (u1), the radial edge separates 2 | L (u3)
    const unit = (x: number, z: number): { x: number; z: number } => ({ x: x / Math.hypot(x, z), z: z / Math.hypot(x, z) });
    const outside = (a: { x: number; z: number }, b: { x: number; z: number }): number => districtAt((a.x + b.x) * 0.51, (a.z + b.z) * 0.51);
    let found: { v: { x: number; z: number }; u1: { x: number; z: number }; u3: { x: number; z: number } } | null = null;
    for (let i = 0; i < 6 && !found; i++) {
      const v = hexCorner(0, 0, i);
      for (const j of [(i + 5) % 6, (i + 1) % 6]) {
        const n = hexCorner(0, 0, j);
        const other = hexCorner(0, 0, j === (i + 1) % 6 ? (i + 5) % 6 : (i + 1) % 6);
        if (!open.has(outside(v, n)) && outside(v, other) === 2) found = { v, u1: unit(n.x - v.x, n.z - v.z), u3: unit(v.x, v.z) };
      }
    }
    if (!found) throw new Error('no 0 | 2 | locked vertex');
    const near = (a: { x: number; z: number }, b: { x: number; z: number }): boolean => Math.hypot(a.x - b.x, a.z - b.z) < 1e-9;
    const { v, u1, u3 } = found;
    const bis = unit(u1.x + u3.x, u1.z + u3.z); // points into L
    const at = (a: number, d: { x: number; z: number }, b: number, e: { x: number; z: number }): { x: number; z: number } => ({ x: v.x + a * d.x + b * e.x, z: v.z + a * d.z + b * e.z });
    // three frames around the tip: 0 side of edge u1 → just past V on the open side → 2 side of edge u3
    const p0 = at(0.3, u1, -0.04, bis);
    const p1 = at(-0.05, bis, 0, bis);
    const p2 = at(0.3, u3, -0.04, bis);
    for (const p of [p0, p1, p2]) expect(world.isLocked(p.x, p.z)).toBe(false);
    expect(serverPathOpen(p0, p1) && serverPathOpen(p1, p2)).toBe(true); // every frame step is open…
    expect(serverPathOpen(p0, p2)).toBe(false); // …but the 50 ms chord cuts L

    // without a path origin (the old end-point rule) the client accepts the move the server refuses
    world.setPathOrigin(NaN, NaN);
    expect(near(world.resolve(p1.x, p1.z, p2.x, p2.z), p2)).toBe(true);
    // with the last sent pose as origin it slides / stays where the server path check passes
    world.setPathOrigin(p0.x, p0.z);
    expect(near(world.resolve(p0.x, p0.z, p1.x, p1.z), p1)).toBe(true);
    const r = world.resolve(p1.x, p1.z, p2.x, p2.z);
    expect(near(r, p2)).toBe(false);
    expect(serverPathOpen(p0, r)).toBe(true);
    // after the next send the origin moves and the player continues into district 2
    world.setPathOrigin(r.x, r.z);
    let pos = r;
    for (let k = 0; k < 6; k++) {
      const next = world.resolve(pos.x, pos.z, pos.x + (p2.x - p1.x) / 2, pos.z + (p2.z - p1.z) / 2);
      expect(serverPathOpen(r, next)).toBe(true);
      pos = next;
    }
    expect(districtAt(pos.x, pos.z)).toBe(2);
  });
});

describe('surface friction (spec 27)', () => {
  const surfaces: Surface[] = [
    { kind: 'mud', x: 0, z: 0, r: 50 },
    { kind: 'grease', x: 200, z: 0, r: 50 },
    { kind: 'wet', x: -200, z: 0, r: 50 },
    { kind: 'acid', x: 0, z: 200, r: 50 },
    { kind: 'wet', x: 200, z: 0, r: 60 }
  ];
  const world = new WorldCollision(layoutWith([], surfaces));
  world.setUnlocked([0, 1, 2, 3, 4, 5]);

  it('mirrors the plan table and picks the most severe overlapping patch', () => {
    expect(SURFACE_RESPONSE).toMatchObject({ dry: { mu: 1 }, wet: { mu: 0.85 }, mud: { mu: 0.6, speed: 0.75 }, grease: { mu: 0.35 } });
    expect(world.surfaceAt(200, 0)).toBe('grease'); // grease beats the larger wet patch
    expect(world.surfaceAt(100, 100)).toBeNull();
  });

  it('mud slows walking by 25 %', () => {
    const b = body(0, 0);
    for (let i = 0; i < 60; i++) stepBody(b, east, 1 / 60, world);
    expect(b.x).toBeCloseTo(WALK_SPEED * 0.75, 0);
    expect(b.x).toBeLessThan(WALK_SPEED * 0.76);
  });

  it('grease slides: slow to start and keeps going after the keys are released', () => {
    const g = body(200, 0);
    stepBody(g, east, 1 / 60, world);
    expect(g.x - 200).toBeLessThan((WALK_SPEED / 60) * 0.2);
    for (let i = 0; i < 120; i++) stepBody(g, east, 1 / 60, world);
    const before = g.x;
    stepBody(g, idle, 0.1, world);
    expect(g.x - before).toBeGreaterThan(0.2);
    const dry = body(100, 100);
    for (let i = 0; i < 60; i++) stepBody(dry, east, 1 / 60, world);
    const stop = dry.x;
    stepBody(dry, idle, 0.1, world);
    expect(dry.x).toBe(stop);
  });

  it('acid has no movement effect yet (Phase C)', () => {
    const a = body(0, 200);
    for (let i = 0; i < 60; i++) stepBody(a, east, 1 / 60, world);
    expect(a.x).toBeCloseTo(WALK_SPEED, 5);
  });

  it('wet ground keeps the speed but loses some grip', () => {
    const w = body(-200, 0);
    for (let i = 0; i < 120; i++) stepBody(w, east, 1 / 60, world);
    const before = w.x;
    stepBody(w, idle, 1 / 60, world);
    expect(w.x).toBeGreaterThan(before);
    expect(all.surfaceAt(-200, 0)).toBeNull();
  });
});
