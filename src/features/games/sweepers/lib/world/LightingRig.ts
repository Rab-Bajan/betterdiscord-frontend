// Éjszakai fények (spec 28): az összes lámpa feje izzik (nightGlowMaterial), valódi fényt csak a
// legközelebbiek kapnak. Keret: 1 árnyékvető spotlámpa a legközelebbi utcai/hex-lámpán, 1 árnyékvető
// telepi reflektor a MÉH irodánál (árnyéktérképe 1 s-onként frissül), 6 árnyék nélküli pontfény a
// következő legközelebbi lámpákon. A fények száma állandó (nappal 0 erősség), így nincs shader-újrafordítás.
import * as THREE from 'three';
import { SODIUM } from './dayNight';
import type { LayoutProp, Placement } from '../../worldTypes';

export const POINT_LIGHT_POOL = 6;
export const LAMP_SHADOW_MAP = 512;
const FLOOD_SHADOW_MAP = 1024;
const FLOOD_REFRESH_MS = 1000;
const REASSIGN_MS = 250;

export interface LampHead {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** World positions of the street / hex lamp heads (archetype head: 5.92 / 6.92 m up, 1.25 m out). */
export function lampHeads(props: readonly LayoutProp[], ground: (x: number, z: number) => number): LampHead[] {
  const out: LampHead[] = [];
  for (const p of props) {
    if (p.kind !== 'street_lamp' && p.kind !== 'hex_lamp') continue;
    const up = (p.kind === 'hex_lamp' ? 6.92 : 5.92) * p.s;
    const out1 = 1.25 * p.s;
    // local +Z rotated by rotY (three.js rotation.y): (sin, cos)
    out.push({ x: p.x + Math.sin(p.rotY) * out1, y: ground(p.x, p.z) + up, z: p.z + Math.cos(p.rotY) * out1 });
  }
  return out;
}

/** Indices of the `count` heads nearest to (x, z), nearest first. */
export function nearestLamps(heads: readonly LampHead[], x: number, z: number, count: number): number[] {
  return heads
    .map((h, i) => ({ i, d: (h.x - x) ** 2 + (h.z - z) ** 2 }))
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map((e) => e.i);
}

export class LightingRig {
  readonly root = new THREE.Group();
  readonly #heads: readonly LampHead[];
  readonly #spot: THREE.SpotLight;
  readonly #flood: THREE.SpotLight;
  readonly #points: THREE.PointLight[] = [];
  #lastAssign = -Infinity;
  #lastFlood = -Infinity;
  #on = false;

  constructor(heads: readonly LampHead[], office: Placement | null, ground: (x: number, z: number) => number) {
    this.root.name = 'lighting-rig';
    this.#heads = heads;
    this.#spot = new THREE.SpotLight(SODIUM, 0, 26, Math.PI / 3.2, 0.55, 1.6);
    this.#spot.castShadow = true;
    this.#spot.shadow.mapSize.set(LAMP_SHADOW_MAP, LAMP_SHADOW_MAP);
    this.#spot.shadow.camera.near = 0.5;
    this.#spot.shadow.camera.far = 28;
    this.#spot.shadow.autoUpdate = false;
    this.#spot.shadow.bias = -0.0006;
    this.root.add(this.#spot, this.#spot.target);

    this.#flood = new THREE.SpotLight(SODIUM, 0, 55, Math.PI / 4, 0.4, 1.4);
    this.#flood.castShadow = true;
    this.#flood.shadow.mapSize.set(FLOOD_SHADOW_MAP, FLOOD_SHADOW_MAP);
    this.#flood.shadow.camera.near = 1;
    this.#flood.shadow.camera.far = 60;
    this.#flood.shadow.autoUpdate = false;
    if (office) {
      const gy = ground(office.x, office.z);
      // mounted on the container roof, aimed into the yard (towards the centre of the hex)
      this.#flood.position.set(office.x, gy + 3.6, office.z);
      this.#flood.target.position.set(office.x * 0.4, gy, office.z * 0.4);
    } else {
      this.#flood.visible = false;
    }
    this.root.add(this.#flood, this.#flood.target);

    for (let i = 0; i < POINT_LIGHT_POOL; i++) {
      const light = new THREE.PointLight(SODIUM, 0, 16, 1.8);
      this.#points.push(light);
      this.root.add(light);
    }
  }

  /** `night` 0..1 scales the lamps; `now` in ms; `flood` 0..1 scales the office floodlight (E grid). */
  update(px: number, pz: number, night: number, lampsOn: boolean, now: number, flood = 1): void {
    const k = lampsOn ? Math.max(0.35, night) : 0;
    if (lampsOn !== this.#on) {
      this.#on = lampsOn;
      this.#lastAssign = -Infinity;
    }
    if (lampsOn && now - this.#lastAssign >= REASSIGN_MS) {
      this.#lastAssign = now;
      const nearest = nearestLamps(this.#heads, px, pz, POINT_LIGHT_POOL + 1);
      const first = nearest[0];
      const head = first === undefined ? undefined : this.#heads[first];
      if (head) {
        this.#spot.position.set(head.x, head.y, head.z);
        this.#spot.target.position.set(head.x, head.y - 6, head.z);
      }
      this.#points.forEach((light, i) => {
        const idx = nearest[i + 1];
        const h = idx === undefined ? undefined : this.#heads[idx];
        if (h) light.position.set(h.x, h.y - 0.3, h.z);
        light.visible = h !== undefined;
      });
    }
    // the nearest lamp's shadow follows moving players every frame; at day neither map renders
    if (lampsOn) this.#spot.shadow.needsUpdate = true;
    if (lampsOn && now - this.#lastFlood >= FLOOD_REFRESH_MS) {
      this.#lastFlood = now;
      this.#flood.shadow.needsUpdate = true;
    }
    this.#spot.intensity = this.#heads.length > 0 ? 38 * k : 0;
    this.#flood.intensity = 120 * k * flood;
    for (const light of this.#points) light.intensity = 22 * k;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.#spot.shadow.dispose();
    this.#flood.shadow.dispose();
    this.#spot.dispose();
    this.#flood.dispose();
    for (const light of this.#points) light.dispose();
  }
}
