// A világ összeállítása rétegekből; a későbbi fázisok (kerületek, törmelék) új rétegeket adnak hozzá.
import * as THREE from 'three';
import { GroundLayer, HexOutlineLayer, MehYardLayer, type WorldLayer } from './layers';
import { worldToHex } from './hexGrid';
import type { HexSnapshot } from '../../types';

export class WorldBuilder {
  readonly root = new THREE.Group();
  readonly #layers: WorldLayer[] = [];
  #hexes = new Map<string, HexSnapshot>();

  constructor(scene: THREE.Scene) {
    this.root.name = 'world';
    scene.add(this.root);
    this.addLayer(new GroundLayer());
    this.addLayer(new HexOutlineLayer());
    this.addLayer(new MehYardLayer());
  }

  addLayer(layer: WorldLayer): void {
    this.#layers.push(layer);
    this.root.add(layer.root);
    if (this.#hexes.size > 0) layer.applyHexes?.([...this.#hexes.values()]);
  }

  /** Full rebuild of hex-driven state from init_state. */
  applyHexes(hexes: readonly HexSnapshot[]): void {
    this.#hexes = new Map(hexes.map((h) => [`${h.q},${h.r}`, h]));
    for (const layer of this.#layers) layer.applyHexes?.(hexes);
  }

  /** The hex under world point (x, z), if it is part of the grid. */
  hexAt(x: number, z: number): HexSnapshot | null {
    const { q, r } = worldToHex(x, z);
    return this.#hexes.get(`${q},${r}`) ?? null;
  }

  dispose(): void {
    for (const layer of this.#layers) layer.dispose();
    this.#layers.length = 0;
    this.root.removeFromParent();
  }
}
