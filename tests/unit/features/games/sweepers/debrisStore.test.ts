import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ChunkStore } from '../../../../../src/features/games/sweepers/lib/debris/ChunkStore';
import { DebrisPrediction, PREDICTION_TIMEOUT_MS } from '../../../../../src/features/games/sweepers/lib/debris/DebrisPrediction';
import { DebrisWorld } from '../../../../../src/features/games/sweepers/lib/debris/DebrisWorld';
import {
  arcArea,
  coneArea,
  detectorInterval,
  inArc,
  inCone,
  nearestBuriedCopper,
  predictUse,
  sweepFraction,
  sweptByte,
  toolWidth,
  type UseContext
} from '../../../../../src/features/games/sweepers/lib/debris/regions';
import { cellCentre, cellIdxAt, chunkIdAt, packCell, FLAG_BURIED, FLAG_STUCK } from '../../../../../src/features/games/sweepers/lib/debris/tables';
import { TOOLS } from '../../../../../src/features/games/sweepers/lib/tools/catalog';
import { AsphaltCleaningShader } from '../../../../../src/features/games/sweepers/lib/world/AsphaltCleaningShader';
import { WorldBuilder } from '../../../../../src/features/games/sweepers/lib/world/WorldBuilder';
import { DEFAULT_PERSONAL, parseChunkUpdate, type ChunkUpdate, type PersonalState } from '../../../../../src/features/games/sweepers/debrisTypes';
import { itemRow, loadEntry, uniformCells, type RowSpec } from './debrisHelpers';
import { realInit } from './fixtures';

/** Chunk 2080 covers x, z ∈ [0, 8). */
const CHUNK = 2080;

const update = (raw: Record<string, unknown>): ChunkUpdate => {
  const parsed = parseChunkUpdate({ t: 1, ...raw });
  if (!parsed) throw new Error('bad update');
  return parsed;
};

const storeWith = (cells: Uint8Array, items: readonly RowSpec[] = []): ChunkStore => {
  const store = new ChunkStore();
  store.apply(update({ load: [loadEntry(CHUNK, cells, items)] }));
  return store;
};

describe('debris grid (C.2)', () => {
  it('chunk and cell indices', () => {
    expect(chunkIdAt(-256, -256)).toBe(0);
    expect(chunkIdAt(255.99, 255.99)).toBe(4095);
    expect(chunkIdAt(256, 0)).toBeNull();
    expect(chunkIdAt(0.1, 0.1)).toBe(CHUNK);
    expect(cellIdxAt(0.1, 0.1)).toBe(0);
    expect(cellIdxAt(7.9, 0.1)).toBe(15);
    expect(cellIdxAt(0.1, 7.9)).toBe(240);
    expect(cellCentre(CHUNK, 17)).toEqual({ x: 0.75, z: 0.75 });
    expect(cellCentre(0, 0)).toEqual({ x: -255.75, z: -255.75 });
  });
});

describe('ChunkStore apply rules (C.5)', () => {
  it('a load sets the cells and items and paints the whole chunk', () => {
    const store = new ChunkStore();
    const res = store.apply(update({ load: [loadEntry(CHUNK, uniformCells(0x77), [{ id: 1, kind: 'can', x: 1, z: 1, massKg: 0.05 }])] }));
    expect(res.paint).toHaveLength(256);
    expect(store.chunk(CHUNK)?.[5]).toBe(0x77);
    expect(store.item(1)?.kind).toBe('can');
    expect(store.hash.near(1, 1, 0.5)).toEqual([1]);
  });
  it('`add` applies when the item is known or its chunk is loaded; else it is ignored', () => {
    const store = storeWith(uniformCells(0));
    store.apply(update({ add: [itemRow({ id: 2, kind: 'iron', x: 3, z: 3, massKg: 5 }), itemRow({ id: 3, kind: 'can', x: 100, z: 100, massKg: 0.05 })] }));
    expect(store.item(2)).toBeDefined();
    expect(store.item(3)).toBeUndefined();
    // a known item moving into an unloaded chunk is forgotten (no phantom in the mirror or the hash)
    store.apply(update({ add: [itemRow({ id: 2, kind: 'iron', x: 100, z: 100, massKg: 5 })] }));
    expect(store.item(2)).toBeUndefined();
    expect(store.itemsInChunk(CHUNK).has(2)).toBe(false);
    expect(store.hash.size).toBe(0);
  });
  it('`del` applies always; `cells` update a loaded chunk and are painted always', () => {
    const store = storeWith(uniformCells(0xff), [{ id: 4, kind: 'can', x: 2, z: 2, massKg: 0.05 }]);
    const res = store.apply(update({ del: [4, 99], cells: [CHUNK, 0, 0x12, 9, 0, 0x34] }));
    expect(store.item(4)).toBeUndefined();
    expect(res.deleted).toEqual([4]);
    expect(store.chunk(CHUNK)?.[0]).toBe(0x12);
    expect(store.chunk(9)).toBeUndefined();
    expect(res.paint).toEqual([{ ...cellCentre(CHUNK, 0), byte: 0x12 }, { ...cellCentre(9, 0), byte: 0x34 }]);
  });
  it('a reload replaces the items positioned in the chunk; a drop forgets the chunk and its items', () => {
    const store = storeWith(uniformCells(0), [{ id: 5, kind: 'can', x: 1, z: 1, massKg: 0.05 }, { id: 6, kind: 'can', x: 2, z: 1, massKg: 0.05 }]);
    store.apply(update({ load: [loadEntry(CHUNK, uniformCells(1), [{ id: 6, kind: 'can', x: 2, z: 1, massKg: 0.05 }])] }));
    expect(store.item(5)).toBeUndefined();
    expect(store.item(6)).toBeDefined();
    store.apply(update({ drop: [CHUNK] }));
    expect(store.chunkCount).toBe(0);
    expect(store.itemCount).toBe(0);
    expect(store.hash.size).toBe(0);
  });
  it('a kick moves a known can to its rest point and frees it', () => {
    const store = storeWith(uniformCells(0), [{ id: 7, kind: 'can', x: 1, z: 1, massKg: 0.05, flags: FLAG_STUCK }]);
    const res = store.apply(update({ kicks: [[7, 100, 100, 450, 120]] }));
    expect(res.kicks).toHaveLength(1);
    expect(store.item(7)).toMatchObject({ x: 4.5, z: 1.2, stuck: false });
    expect(store.hash.near(4.5, 1.2, 0.2)).toEqual([7]);
    // kicked out of the loaded chunks: forgotten
    store.apply(update({ kicks: [[7, 450, 120, 1200, 120]] }));
    expect(store.item(7)).toBeUndefined();
    expect(store.hash.size).toBe(0);
  });
  it('cells alone do not bump the version (no instance rebuild); item changes do', () => {
    const store = storeWith(uniformCells(0xff), [{ id: 9, kind: 'can', x: 1, z: 1, massKg: 0.05 }]);
    const v = store.version;
    store.apply(update({ cells: [CHUNK, 0, 0x12], hx: [[0, 500]] }));
    store.apply(update({ del: [404] }));
    expect(store.version).toBe(v);
    store.apply(update({ kicks: [[9, 100, 100, 200, 100]] }));
    expect(store.version).toBe(v + 1);
    store.apply(update({ del: [9] }));
    expect(store.version).toBe(v + 2);
  });
  it('hide / reveal bump the version (the renderer rebuilds)', () => {
    const store = storeWith(uniformCells(0), [{ id: 8, kind: 'can', x: 1, z: 1, massKg: 0.05 }]);
    const v = store.version;
    store.hide([8]);
    expect(store.isHidden(8)).toBe(true);
    expect(store.version).toBeGreaterThan(v);
    store.reveal([8]);
    expect(store.isHidden(8)).toBe(false);
  });
});

describe('region math (C.3)', () => {
  it('arc and cone membership and areas', () => {
    // rotY 0 looks down −z: the arc's middle is at (0, −reach)
    expect(inArc(0, -1.2, 0, 0, 0, 1.2, 0.9)).toBe(true);
    expect(inArc(0, -1.7, 0, 0, 0, 1.2, 0.9)).toBe(false); // |d − reach| > w/2
    const at = (deg: number) => [Math.sin((deg * Math.PI) / 180) * 1.2, -Math.cos((deg * Math.PI) / 180) * 1.2] as const;
    expect(inArc(...at(39), 0, 0, 0, 1.2, 0.9)).toBe(true);
    expect(inArc(...at(41), 0, 0, 0, 1.2, 0.9)).toBe(false);
    expect(inArc(0, 1.2, 0, 0, 0, 1.2, 0.9)).toBe(false); // behind
    expect(inCone(0, -3, 0, 0, 0, 3.5)).toBe(true);
    expect(inCone(0, -0.2, 0, 0, 0, 3.5)).toBe(false);
    expect(inCone(Math.sin(0.27) * 3, -Math.cos(0.27) * 3, 0, 0, 0, 3.5)).toBe(false); // 15.5°
    expect(arcArea(1.2, 0.9)).toBeCloseTo(1.50768, 5);
    expect(coneArea(3.5)).toBeCloseTo(0.2618 * (12.25 - 0.09), 6);
  });
  it('width upgrades apply to tools 0–3, and a worn broom sweeps at half width', () => {
    const p: PersonalState = { ...DEFAULT_PERSONAL, widthLvl: 5, dur: [1000, 150, 1000] };
    expect(toolWidth(3, p)).toBeCloseTo(1.6 * 2.1, 6);
    expect(toolWidth(2, p)).toBeCloseTo(0.9 * 2.1 * 0.5, 6);
    expect(toolWidth(6, p)).toBeCloseTo(1.2, 6);
  });
  it('f and eff against hand-computed values', () => {
    const broom = TOOLS[2];
    if (!broom) throw new Error('no tool');
    const area = arcArea(1.2, 0.9);
    // 0.85 m²/s × 0.5 s × 1.15 (dry) / 1.50768 m²
    expect(sweepFraction(broom, area, false, true)).toBeCloseTo(0.32418, 4);
    expect(sweepFraction(broom, area, true, false)).toBeCloseTo(0.14095, 4);
    // 15 → floor(15 × (1 − 0.32418)) = 10 for both classes
    expect(sweptByte(0xff, { tool: 2, f: 0.32418, hardLvl: 0, heavy: false, seed: true })).toBe(packCell(10, 10));
    // heavy slag: dust eff 0.5 → floor(15 × 0.83791) = 12; hardness 3 doubles it back to normal
    expect(sweptByte(0xff, { tool: 2, f: 0.32418, hardLvl: 0, heavy: true, seed: true })).toBe(packCell(12, 10));
    expect(sweptByte(0xff, { tool: 2, f: 0.32418, hardLvl: 3, heavy: true, seed: true })).toBe(packCell(10, 10));
    // backend reducedLevel epsilon: 15 × (1 − 0.8) is 2.999… in floats and must stay 3
    expect(sweptByte(packCell(15, 15), { tool: 2, f: 0.8, hardLvl: 0, heavy: false, seed: true })).toBe(packCell(3, 3));
    // tool 1 struggles on slag: dust eff 0.6
    expect(sweptByte(0xf0, { tool: 1, f: 0.5, hardLvl: 0, heavy: false, seed: true })).toBe(packCell(10, 0));
  });
  it('detector click interval: 1.2 s at 6 m down to 0.1 s at 0.5 m', () => {
    expect(detectorInterval(6)).toBeCloseTo(1.2, 6);
    expect(detectorInterval(0.5)).toBeCloseTo(0.1, 6);
    expect(detectorInterval(0.1)).toBeCloseTo(0.1, 6);
    expect(detectorInterval(6.01)).toBeNull();
    expect(detectorInterval(null)).toBeNull();
  });
});

const ctx = (tool: number, personal: Partial<PersonalState> = {}, extra: Partial<UseContext> = {}): UseContext => ({
  tool,
  x: 4,
  z: 4,
  rotY: 0,
  personal: { ...DEFAULT_PERSONAL, owned: 0xff, caps: { bufKg: TOOLS[tool]?.bufKg ?? 0, packKg: 10, packL: 8 }, ...personal },
  stench: false,
  drizzle: false,
  surfaceAt: () => null,
  districtAt: () => 0,
  isLocked: () => false,
  ...extra
});

describe('client prediction of one use (C.7)', () => {
  it('a sorghum broom stroke lowers the arc cells to the server formula and takes the loose can only', () => {
    const store = storeWith(uniformCells(0xff), [
      { id: 1, kind: 'can', x: 4, z: 2.8, massKg: 0.05 },
      { id: 2, kind: 'can', x: 4.2, z: 2.8, massKg: 0.05, flags: FLAG_STUCK },
      { id: 3, kind: 'iron', x: 3.9, z: 2.8, massKg: 5 },
      { id: 4, kind: 'can', x: 4, z: 6, massKg: 0.05 }
    ]);
    const p = predictUse(store, ctx(2));
    expect(p.items).toEqual([1]);
    expect(p.cells.length).toBeGreaterThan(0);
    for (const c of p.cells) {
      const { x, z } = cellCentre(c.chunk, c.idx);
      expect(inArc(x, z, 4, 4, 0, 1.2, 0.9)).toBe(true);
      expect(c.byte).toBe(packCell(10, 10));
    }
  });
  it('the WC brush from an integer origin plans exactly the cell containing the arc midpoint (no centre in the 0.25 m band)', () => {
    const store = storeWith(uniformCells(0xff));
    for (const [rotY, mx, mz] of [[0, 4, 3.4], [Math.PI, 4, 4.6], [Math.PI / 2, 3.4, 4], [-Math.PI / 2, 4.6, 4]] as const) {
      const cells = predictUse(store, ctx(0, {}, { rotY })).cells;
      expect(cells).toHaveLength(1);
      const { x, z } = cellCentre(cells[0]!.chunk, cells[0]!.idx);
      expect([Math.floor(x / 0.5), Math.floor(z / 0.5)]).toEqual([Math.floor(mx / 0.5), Math.floor(mz / 0.5)]);
    }
  });
  it('the road broom also takes stuck cans and metal; capacity is respected in order of distance', () => {
    const store = storeWith(uniformCells(0), [
      { id: 1, kind: 'can', x: 4.2, z: 2.7, massKg: 0.05, flags: FLAG_STUCK },
      { id: 2, kind: 'iron', x: 4, z: 2.75, massKg: 12 },
      { id: 3, kind: 'iron', x: 4, z: 2.6, massKg: 9 }
    ]);
    expect([...predictUse(store, ctx(3)).items].sort()).toEqual([1, 2]); // 18 kg buffer: 12 kg fits, 9 more does not
  });
  it('the hand takes the nearest item in its 80° arc; buried copper only the rake (with its magnet)', () => {
    const store = storeWith(uniformCells(0), [
      { id: 1, kind: 'iron', x: 4, z: 2.5, massKg: 3 },
      { id: 2, kind: 'can', x: 4, z: 3, massKg: 0.05 },
      { id: 3, kind: 'copper', x: 4, z: 2.8, massKg: 2, flags: FLAG_BURIED },
      { id: 4, kind: 'iron', x: 6, z: 2, massKg: 3 }
    ]);
    expect(predictUse(store, ctx(7)).items).toEqual([2]);
    // a full backpack by volume: the hand takes nothing (the server checks kg and L)
    expect(predictUse(store, ctx(7, { pack: { ...DEFAULT_PERSONAL.pack, l: 7.6 } })).items).toEqual([]);
    expect(predictUse(store, ctx(3)).items).not.toContain(3);
    // rake: buried copper in the arc + iron 1 (in the arc) + iron 4 (within 2.5 m of the arc midpoint)
    expect([...predictUse(store, ctx(6)).items].sort()).toEqual([1, 3, 4]);
    expect(nearestBuriedCopper(store, 4, 4, 6)).toBeCloseTo(1.2, 6);
  });
  it('nothing is predicted when the server would refuse (clogged, full tank, no fuel, locked)', () => {
    const store = storeWith(uniformCells(0xff), [{ id: 1, kind: 'can', x: 4, z: 2, massKg: 0.05 }]);
    expect(predictUse(store, ctx(5)).items).toEqual([1]);
    expect(predictUse(store, ctx(5, { clogged: true }))).toEqual({ cells: [], items: [] });
    expect(predictUse(store, ctx(5, { buf: { ...DEFAULT_PERSONAL.buf, kg: 45 } }))).toEqual({ cells: [], items: [] });
    expect(predictUse(store, ctx(4, { fuelMl: 0 }))).toEqual({ cells: [], items: [] });
    expect(predictUse(store, ctx(2, {}, { isLocked: () => true }))).toEqual({ cells: [], items: [] });
    // the blower moves 35 % of both levels and collects nothing
    const blow = predictUse(store, ctx(4));
    expect(blow.items).toEqual([]);
    expect(blow.cells.every((c) => c.byte === packCell(9, 9))).toBe(true);
  });
  it('the vacuum takes dust only (seed stays) and stops at the first cell that no longer fits the tank', () => {
    const store = storeWith(uniformCells(0xff));
    const full = predictUse(store, ctx(5)).cells;
    expect(full.length).toBeGreaterThan(3);
    // f = 0.6 / 3.1835 → dust 15 → 12, seed untouched (backend planCells seed: !vacuum)
    expect(full.every((c) => c.byte === packCell(12, 15))).toBe(true);
    // each cell gives 3/15 × 1.6 kg/m² × 0.8 (district 0) × 0.25 m² = 0.064 kg: 0.2 kg free holds 3 cells, nearest first
    const near = predictUse(store, ctx(5, { buf: { ...DEFAULT_PERSONAL.buf, kg: 44.8 } })).cells;
    const dist = (c: { chunk: number; idx: number }): number => {
      const { x, z } = cellCentre(c.chunk, c.idx);
      return Math.hypot(x - 4, z - 4);
    };
    expect(near.map(dist)).toEqual(full.map(dist).sort((a, b) => a - b).slice(0, 3));
  });
  it('a broom buffer filled by the cells takes no item (cells first, as the server)', () => {
    const store = storeWith(uniformCells(0xff), [{ id: 1, kind: 'can', x: 4, z: 2.8, massKg: 0.05 }]);
    expect(predictUse(store, ctx(2)).items).toEqual([1]);
    const tight = predictUse(store, ctx(2, { buf: { ...DEFAULT_PERSONAL.buf, kg: 7.94 } }));
    expect(tight.items).toEqual([]);
    expect(tight.cells.length).toBeGreaterThan(0); // the rest is pushed, the cells still change
  });
});

describe('prediction rollback (C.7)', () => {
  const setup = () => {
    const store = storeWith(uniformCells(0xff), [{ id: 1, kind: 'can', x: 4, z: 2.8, massKg: 0.05 }, { id: 2, kind: 'can', x: 4.1, z: 2.8, massKg: 0.05 }]);
    const prediction = new DebrisPrediction(store);
    const p = predictUse(store, ctx(2));
    const painted = prediction.begin(1, p.items, p.cells, 0);
    return { store, prediction, p, painted };
  };
  it('a use hides the predicted items and paints the predicted levels at once', () => {
    const { store, p, painted } = setup();
    expect([...p.items].sort()).toEqual([1, 2]);
    expect(store.isHidden(1) && store.isHidden(2)).toBe(true);
    expect(painted).toHaveLength(p.cells.length);
    expect(painted.every((c) => c.byte === packCell(10, 10))).toBe(true);
  });
  it('an ack brings back the items it did not collect; the collected stay hidden until their del', () => {
    const { store, prediction } = setup();
    expect(prediction.ack(1, [1])).toEqual([]);
    expect(store.isHidden(1)).toBe(true);
    expect(store.isHidden(2)).toBe(false);
    store.apply(update({ del: [1] }));
    expect(store.item(1)).toBeUndefined();
  });
  it('after a successful ack the next update repaints the predicted cells from the mirror (server wins)', () => {
    const { store, prediction, p } = setup();
    prediction.ack(1, [1, 2]);
    const first = p.cells[0];
    if (!first) throw new Error('no cell');
    // the server only took the dust down to 12 in that cell
    store.apply(update({ cells: [first.chunk, first.idx, packCell(12, 10)] }));
    const settled = prediction.afterUpdate();
    expect(settled).toHaveLength(p.cells.length);
    expect(settled[0]?.byte).toBe(packCell(12, 10));
    expect(settled[1]?.byte).toBe(0xff); // untouched by the server: the truth is still dirty
    expect(prediction.pendingCount).toBe(0);
  });
  it('DebrisWorld.apply settles the acked predictions: the next update repaints their cells from the mirror', () => {
    const world = new DebrisWorld(() => 0);
    world.apply(update({ load: [loadEntry(CHUNK, uniformCells(0xff))] }), 0);
    const p = predictUse(world.store, ctx(2));
    world.prediction.begin(1, p.items, p.cells, 0);
    world.prediction.ack(1, []);
    const applied = world.apply(update({ cells: [CHUNK, 255, 0x11] }), 10);
    expect(p.cells.length).toBeGreaterThan(0);
    expect(applied.paint).toHaveLength(1 + p.cells.length);
    expect(world.prediction.pendingCount).toBe(0);
    world.dispose();
  });
  it('a refusal repaints the truth and reveals everything; no ack within 1 s does the same', () => {
    const { store, prediction, p } = setup();
    const truth = prediction.ack(1, null);
    expect(truth).toHaveLength(p.cells.length);
    expect(truth.every((c) => c.byte === 0xff)).toBe(true);
    expect(store.isHidden(1) || store.isHidden(2)).toBe(false);
    const again = setup();
    expect(again.prediction.expire(PREDICTION_TIMEOUT_MS - 1)).toEqual([]);
    expect(again.prediction.expire(PREDICTION_TIMEOUT_MS)).toHaveLength(again.p.cells.length);
    expect(again.store.isHidden(1)).toBe(false);
  });
});

describe('cleanliness mask from cells (C.7, B LOW-7)', () => {
  it('a hex is repainted only when its c10 differs from the value already painted', () => {
    const mask = new AsphaltCleaningShader();
    const hexes = [{ id: 0, q: 0, r: 0, district: 0, cleanliness: 35 }, { id: 1, q: 1, r: 0, district: 1, cleanliness: 60.4 }];
    expect(mask.setHexes(hexes).map((h) => h.id)).toEqual([0, 1]);
    expect(mask.setHexes(hexes)).toEqual([]); // a reconnect with the same values repaints nothing
    expect(mask.setHexes([{ ...hexes[1], id: 1, q: 1, r: 0, district: 1, cleanliness: 60.44 }])).toEqual([]); // same c10 604
    expect(mask.setHexes([{ id: 1, q: 1, r: 0, district: 1, cleanliness: 60.5 }]).map((h) => h.id)).toEqual([1]);
    expect(mask.pendingHexes.map((h) => h.id)).toEqual([0, 1]);
    mask.dispose();
  });
  it('cells are queued as 1 − max(dust, seed)/15 and the newest value of a cell wins', () => {
    const mask = new AsphaltCleaningShader();
    mask.paintCells([{ x: 0.25, z: 0.25, byte: 0xf0 }, { x: 0.25, z: 0.25, byte: 0x30 }, { x: 0.75, z: 0.25, byte: 0 }]);
    expect(mask.pendingCells).toBe(2);
    mask.dispose();
  });
  it('WorldBuilder: init_state again with the same hexes repaints nothing; an hx change repaints that hex', () => {
    const init = realInit();
    const world = new WorldBuilder(new THREE.Scene());
    expect(world.load(init.layout, init.hexes, init.unlockedDistricts)).toHaveLength(init.hexes.length);
    expect(world.load(init.layout, init.hexes, init.unlockedDistricts)).toEqual([]);
    const hex = init.hexes[3];
    if (!hex) throw new Error('no hex');
    expect(world.setHexCleanliness(hex.id, hex.cleanliness)?.repainted).toBe(false);
    expect(world.setHexCleanliness(hex.id, hex.cleanliness + 0.1)?.repainted).toBe(true);
    world.dispose();
  });
  it('the loaded cells inside a repainted hex go back on top', () => {
    const debris = new DebrisWorld(() => 0);
    debris.apply(update({ load: [loadEntry(CHUNK, uniformCells(0x50))] }), 0);
    const all = debris.cellsInHexes(new Set([7]), () => 7);
    expect(all).toHaveLength(256);
    expect(all.every((c) => c.byte === 0x50)).toBe(true);
    expect(debris.cellsInHexes(new Set([7]), (x) => (x < 4 ? 7 : 8))).toHaveLength(128);
    expect(debris.cellsInHexes(new Set(), () => 7)).toEqual([]);
    debris.dispose();
  });
});
