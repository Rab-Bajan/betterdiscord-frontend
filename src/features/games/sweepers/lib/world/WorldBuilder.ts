// A világ összeállítása rétegekből. Layout nélkül (régi szerver / hibás layout) a Phase A sík világ marad;
// layouttal a Phase B város épül: domborzat, utak, épületek/kellékek LOD-dal, hexhatárok, jeladók,
// kordonszalag, tisztasági maszk és éjszakai fények. Mindig a layout az egyetlen igazság (spec 16).
import * as THREE from 'three';
import { GroundLayer, HexOutlineLayer, MehYardLayer, type WorldLayer } from './layers';
import { worldToHex } from './hexGrid';
import { sampleHeight } from './heightfield';
import { InstancedWorld } from './InstancedWorld';
import { AsphaltCleaningShader } from './AsphaltCleaningShader';
import { GroundLayers, HexBeaconLayer, HexBorderLayer, LockedTapeLayer, bordersFromHexes, hexesKey, layoutKey, outskirtsBorders } from './cityLayers';
import { LightingRig, lampHeads } from './LightingRig';
import { planDraws, planInputOf, type DrawPlan } from './drawPlan';
import { WorldCollision } from '../movement/WorldCollision';
import type { HexSnapshot } from '../../types';
import type { WorldLayout } from '../../worldTypes';

class CityWorld {
  readonly root = new THREE.Group();
  readonly key: string;
  readonly hexKey: string;
  readonly plan: DrawPlan;
  readonly ground: GroundLayers;
  readonly borders: HexBorderLayer;
  readonly tape: LockedTapeLayer;
  readonly beacons: HexBeaconLayer;
  readonly instanced: InstancedWorld;
  readonly mask = new AsphaltCleaningShader();
  readonly lights: LightingRig;

  constructor(layout: WorldLayout, key: string, hexes: readonly HexSnapshot[]) {
    this.root.name = 'city';
    this.key = key;
    this.hexKey = hexesKey(hexes);
    const districts = new Map(hexes.map((h) => [`${h.q},${h.r}`, h.district]));
    const districtAt = (x: number, z: number): number | null => {
      const { q, r } = worldToHex(x, z);
      return districts.get(`${q},${r}`) ?? null;
    };
    const hf = layout.heightfield;
    const ground = (x: number, z: number): number => sampleHeight(hf, x, z);
    this.plan = planDraws(planInputOf(layout));
    this.ground = new GroundLayers(layout, key, this.hexKey, districtAt);
    this.borders = new HexBorderLayer(hexes, key, ground);
    const borders = [...(layout.borders.length > 0 ? layout.borders : bordersFromHexes(hexes)), ...outskirtsBorders()];
    this.tape = new LockedTapeLayer(`${key}.${this.hexKey}`, borders, ground);
    this.beacons = new HexBeaconLayer(layout.props.filter((p) => p.kind === 'hex_lamp'), ground);
    this.instanced = new InstancedWorld(this.plan, layout.buildings, layout.props, ground);
    this.lights = new LightingRig(lampHeads(layout.props, ground), layout.landmarks.office, ground);
    this.root.add(this.ground.root, this.borders.root, this.tape.root, this.beacons.root, this.instanced.root, this.lights.root);
  }

  dispose(): void {
    this.ground.dispose();
    this.borders.dispose();
    this.tape.dispose();
    this.beacons.dispose();
    this.instanced.dispose();
    this.lights.dispose();
    this.mask.dispose();
    this.root.removeFromParent();
  }
}

export interface WorldFrame {
  readonly camera: THREE.PerspectiveCamera;
  readonly timeSec: number;
  readonly now: number;
  readonly night: number;
  readonly lampsOn: boolean;
}

export class WorldBuilder {
  readonly root = new THREE.Group();
  readonly #layers: WorldLayer[] = [];
  #hexes = new Map<string, HexSnapshot>();
  #city: CityWorld | null = null;
  #layout: WorldLayout | null = null;
  #collision = new WorldCollision(null);
  #unlocked = new Set<number>([0]);

  constructor(scene: THREE.Scene) {
    this.root.name = 'world';
    scene.add(this.root);
    this.#addFallback();
  }

  addLayer(layer: WorldLayer): void {
    this.#layers.push(layer);
    this.root.add(layer.root);
    if (this.#hexes.size > 0) layer.applyHexes?.([...this.#hexes.values()]);
  }

  /** Movement rules for the client prediction (same layout as the server). */
  get collision(): WorldCollision {
    return this.#collision;
  }

  get layout(): WorldLayout | null {
    return this.#layout;
  }

  /** Spec 18 mask (Phase C sweeping paints into it); null in the flat fallback world. */
  get mask(): AsphaltCleaningShader | null {
    return this.#city?.mask ?? null;
  }

  /** The planned draw groups of the current city (debug / budget). */
  get plan(): DrawPlan | null {
    return this.#city?.plan ?? null;
  }

  get lodStats(): InstancedWorld['stats'] | null {
    return this.#city?.instanced.stats ?? null;
  }

  /** Every InstancedMesh of the city (tests compare them with the plan). */
  get instancedMeshes(): readonly THREE.InstancedMesh[] {
    return this.#city?.instanced.meshes ?? [];
  }

  /**
   * Full (re)build from init_state. The city is rebuilt only when the layout or the hex districts
   * changed (a reconnect with the same layout keeps the meshes); hex state and unlocks always apply.
   */
  load(layout: WorldLayout | null, hexes: readonly HexSnapshot[], unlocked: readonly number[]): HexSnapshot[] {
    if (!layout) {
      if (this.#city || this.#layers.length === 0) {
        this.#disposeCity();
        this.#addFallback();
      }
    } else {
      const key = layoutKey(layout);
      if (!this.#city || this.#city.key !== key || this.#city.hexKey !== hexesKey(hexes)) {
        this.#disposeCity();
        this.#disposeLayers();
        this.#city = new CityWorld(layout, key, hexes);
        this.root.add(this.#city.root);
      }
    }
    if (this.#layout !== layout) this.#collision = new WorldCollision(layout);
    this.#layout = layout;
    const repainted = this.applyHexes(hexes);
    this.setUnlocked(unlocked);
    return repainted;
  }

  /**
   * Hex-driven state (cleanliness colours, beacons, mask fill, lock map). Returns the hexes whose mask
   * fill changed (their loaded debris cells must be painted again on top).
   */
  applyHexes(hexes: readonly HexSnapshot[]): HexSnapshot[] {
    this.#hexes = new Map(hexes.map((h) => [`${h.q},${h.r}`, h]));
    for (const layer of this.#layers) layer.applyHexes?.(hexes);
    const city = this.#city;
    if (city) {
      city.borders.setHexes(hexes);
      for (const h of hexes) city.beacons.setCleanliness(h.q, h.r, h.cleanliness);
      return city.mask.setHexes(hexes);
    }
    return [];
  }

  setUnlocked(ids: readonly number[]): void {
    this.#unlocked = new Set([0, ...ids]);
    this.#collision.setUnlocked([...this.#unlocked]);
    const city = this.#city;
    if (!city) return;
    city.tape.update(this.#unlocked);
  }

  /** District borders currently taped, grid and outskirts (debug / tests). */
  get tapedBorders(): number {
    return this.#city?.tape.taped ?? 0;
  }

  get unlocked(): ReadonlySet<number> {
    return this.#unlocked;
  }

  /**
   * Live cleanliness of one hex (Phase C `hx`). Returns the updated hex, its previous value, and whether
   * its mask fill was repainted (the c10 changed).
   */
  setHexCleanliness(id: number, value: number): { hex: HexSnapshot; previous: number; repainted: boolean } | null {
    const entry = [...this.#hexes.values()].find((h) => h.id === id);
    if (!entry || !Number.isFinite(value)) return null;
    const cleanliness = Math.min(100, Math.max(0, value));
    const hex: HexSnapshot = { ...entry, cleanliness };
    this.#hexes.set(`${hex.q},${hex.r}`, hex);
    const all = [...this.#hexes.values()];
    for (const layer of this.#layers) layer.applyHexes?.(all);
    this.#city?.borders.setCleanliness(hex.q, hex.r, cleanliness);
    this.#city?.beacons.setCleanliness(hex.q, hex.r, cleanliness);
    const repainted = (this.#city?.mask.setHexes([hex]).length ?? 0) > 0;
    return { hex, previous: entry.cleanliness, repainted };
  }

  get hexes(): readonly HexSnapshot[] {
    return [...this.#hexes.values()];
  }

  /** LOD / culling, beacon strobes and the night light pool. */
  update(frame: WorldFrame): void {
    const city = this.#city;
    if (!city) return;
    city.instanced.update(frame.camera);
    city.beacons.update(frame.timeSec);
    city.lights.update(frame.camera.position.x, frame.camera.position.z, frame.night, frame.lampsOn, frame.now);
  }

  /** Off-screen passes that must run before the main render (cleanliness mask). */
  prepare(renderer: THREE.WebGLRenderer): void {
    this.#city?.mask.flush(renderer);
  }

  /** The hex under world point (x, z), if it is part of the grid. */
  hexAt(x: number, z: number): HexSnapshot | null {
    const { q, r } = worldToHex(x, z);
    return this.#hexes.get(`${q},${r}`) ?? null;
  }

  /** Ground height at (x, z): the layout terrain, or the flat Phase A plane. */
  groundAt(x: number, z: number): number {
    return this.#collision.terrain(x, z);
  }

  dispose(): void {
    this.#disposeLayers();
    this.#disposeCity();
    this.root.removeFromParent();
  }

  #addFallback(): void {
    this.addLayer(new GroundLayer());
    this.addLayer(new HexOutlineLayer());
    this.addLayer(new MehYardLayer());
  }

  #disposeLayers(): void {
    for (const layer of this.#layers) layer.dispose();
    this.#layers.length = 0;
  }

  #disposeCity(): void {
    this.#city?.dispose();
    this.#city = null;
  }
}
