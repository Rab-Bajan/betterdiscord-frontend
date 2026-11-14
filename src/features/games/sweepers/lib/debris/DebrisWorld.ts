// A törmelékrendszer kliensoldala egyben: tükör, előrejelzés, példányosított rajzolás, részecskék.
// Minden művelet a maszkba festendő cellákat adja vissza; a festést a játék végzi (WorldBuilder.mask).
import * as THREE from 'three';
import { ChunkStore, type CellPaint } from './ChunkStore';
import { DebrisPrediction } from './DebrisPrediction';
import { DebrisRenderer } from './DebrisRenderer';
import { DebrisParticles } from './DebrisParticles';
import { CELLS_PER_CHUNK, cellCentre } from './tables';
import type { ChunkUpdate, HexC10, KickDelta } from '../../debrisTypes';

export interface AppliedUpdate {
  readonly paint: readonly CellPaint[];
  readonly hx: readonly HexC10[];
  readonly kicks: readonly KickDelta[];
}

export class DebrisWorld {
  readonly root = new THREE.Group();
  readonly store = new ChunkStore();
  readonly prediction: DebrisPrediction;
  readonly renderer: DebrisRenderer;
  readonly particles = new DebrisParticles();

  constructor(ground: (x: number, z: number) => number) {
    this.root.name = 'debris-world';
    this.prediction = new DebrisPrediction(this.store);
    this.renderer = new DebrisRenderer(this.store, ground);
    this.root.add(this.renderer.root, this.particles.points);
  }

  /** A (re)join: the server streams the interest disc afresh; the mask keeps what it shows. */
  reset(): void {
    this.store.clear();
    this.prediction.clear();
  }

  apply(update: ChunkUpdate, now: number): AppliedUpdate {
    const result = this.store.apply(update);
    for (const kick of result.kicks) if (this.store.item(kick.id)) this.renderer.kick(kick, now);
    return { paint: [...result.paint, ...this.prediction.afterUpdate()], hx: result.hx, kicks: result.kicks };
  }

  /** Per frame: rolls back stale predictions, rebuilds instances when needed, moves particles. */
  update(camera: THREE.Camera, now: number, dt: number): CellPaint[] {
    const rollback = this.prediction.expire(now);
    this.renderer.update(camera, now);
    this.particles.update(dt);
    return rollback;
  }

  /** The loaded cells inside the given hexes (painted again after their hex fill changed). */
  cellsInHexes(hexIds: ReadonlySet<number>, hexIdAt: (x: number, z: number) => number | null): CellPaint[] {
    if (hexIds.size === 0) return [];
    const out: CellPaint[] = [];
    for (const chunk of this.store.loadedChunks()) {
      const bytes = this.store.chunk(chunk);
      if (!bytes) continue;
      for (let idx = 0; idx < CELLS_PER_CHUNK; idx++) {
        const { x, z } = cellCentre(chunk, idx);
        const hex = hexIdAt(x, z);
        if (hex !== null && hexIds.has(hex)) out.push({ x, z, byte: bytes[idx] ?? 0 });
      }
    }
    return out;
  }

  dispose(): void {
    this.renderer.dispose();
    this.particles.dispose();
    this.root.removeFromParent();
  }
}
