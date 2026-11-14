// A járművek rajzolása (F.7): típusonként egy összefésült test, a platók, a kerekek és a lámpa/villogó
// izzások egy-egy példányosított rétegben (6 + 3 = 9 rajzolás). Valódi fény csak kettő: a saját fényszóró
// és a legközelebbi villogó (40 m); mindkettő mindig a jelenetben van (0 intenzitással), hogy a fények
// száma – és vele a shaderek – ne változzon. Semmi sem vet árnyékot.
import * as THREE from 'three';
import { AssetCache } from '../engine/AssetCache';
import { PartsBuilder, uploadInstances } from '../world/geometryKit';
import { litMaterial } from '../world/materials';
import { BEACON_RANGE_M, VEHICLE, VEHICLE_TYPES, type VehicleType } from './tables';
import type { Vehicle } from '../../vehicleTypes';

export const VEHICLE_DRAW_CALLS = VEHICLE_TYPES.length + 3;
const MAX_WHEELS = VEHICLE.cap * 6;
const MAX_GLOWS = VEHICLE.cap * 3;
const TIP_RAD = Math.PI / 4;

/** One vehicle to draw this frame (predicted for the own one, interpolated otherwise). */
export interface VehiclePose {
  readonly row: Vehicle;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotY: number;
  readonly pitch: number;
  readonly roll: number;
  /** Metres rolled (wheel spin). */
  readonly odo: number;
  /** 0..1 of the 3 s tip animation, null when not tipping. */
  readonly tip: number | null;
}

interface Wheel {
  readonly x: number;
  readonly z: number;
  readonly r: number;
  readonly w: number;
}

/** Bed tray in the local frame: size, base height and the z of its hinge (the end that stays down). */
interface Bed {
  readonly w: number;
  readonly l: number;
  readonly h: number;
  readonly y: number;
  readonly hingeZ: number;
  /** Tips over the nose (wheelbarrow, 92). */
  readonly front: boolean;
  readonly color: string;
}

const BEDS: readonly Bed[] = [
  { w: 0.7, l: 0.8, h: 0.9, y: 0.25, hingeZ: 0.4, front: false, color: '#2E7D32' },
  { w: 0.65, l: 0.8, h: 0.35, y: 0.35, hingeZ: -0.75, front: true, color: '#A7ADB4' },
  { w: 1.1, l: 1.3, h: 0.45, y: 0.55, hingeZ: 1.3, front: false, color: '#3A6EA5' },
  { w: 1.55, l: 2.0, h: 0.4, y: 0.75, hingeZ: 2.05, front: false, color: '#D9D2C3' },
  { w: 1.5, l: 1.8, h: 0.7, y: 0.85, hingeZ: 1.75, front: false, color: '#E07A1F' },
  { w: 2.4, l: 4.0, h: 1.5, y: 1.1, hingeZ: 3.5, front: false, color: '#E8E2CF' }
];

function wheelsOf(t: VehicleType, type: number): Wheel[] {
  const xs = t.w / 2 - 0.08;
  switch (type) {
    case 0: return [{ x: -xs, z: 0.4, r: 0.25, w: 0.08 }, { x: xs, z: 0.4, r: 0.25, w: 0.08 }];
    case 1: return [{ x: 0, z: -0.65, r: 0.2, w: 0.08 }];
    case 2: return [{ x: 0, z: -1.0, r: 0.25, w: 0.1 }, { x: -xs, z: 0.8, r: 0.25, w: 0.1 }, { x: xs, z: 0.8, r: 0.25, w: 0.1 }];
    default: {
      const r = type === 5 ? 0.55 : 0.33;
      const a = t.l / 2 - r - 0.2;
      return [-a, a].flatMap((z) => [{ x: -xs, z, r, w: 0.22 }, { x: xs, z, r, w: 0.22 }]);
    }
  }
}

/** Lamp spots in the local frame (headlights at the nose) and the beacon on the cab roof. */
function lampsOf(t: VehicleType, type: number): { readonly heads: readonly THREE.Vector3[]; readonly beacon: THREE.Vector3 | null } {
  const roof = [0, 0, 1.6, 1.75, 2.1, 2.8][type] ?? 2;
  const cabZ = [0, 0, -0.8, -0.6, -1.1, -2.6][type] ?? 0;
  return {
    heads: type === 2 ? [new THREE.Vector3(0, 1.05, -1.3)] : [-1, 1].map((sx) => new THREE.Vector3(sx * (t.w / 2 - 0.25), 0.75, -t.l / 2)),
    beacon: t.beacon ? new THREE.Vector3(0, roof + 0.12, cabZ) : null
  };
}

function bodyGeometry(type: number): THREE.BufferGeometry {
  return AssetCache.get().geometry(`vehicle.body.${type}`, () => {
    const t = VEHICLE_TYPES[type];
    const b = new PartsBuilder();
    if (!t) return b.box(0.1, 0.1, 0.1, 0x000000).build();
    const half = t.l / 2;
    switch (type) {
      case 0: // handles and axle of the bin cart
        b.box(0.6, 0.04, 0.04, 0x3a3e45, { y: 1.05, z: half + 0.1 }).box(0.04, 0.04, 0.7, 0x3a3e45, { x: -0.3, y: 0.95, z: half - 0.2, rx: -0.3 }).box(0.04, 0.04, 0.7, 0x3a3e45, { x: 0.3, y: 0.95, z: half - 0.2, rx: -0.3 })
          .box(t.w, 0.05, 0.05, 0x3a3e45, { y: 0.25, z: 0.4 });
        break;
      case 1: // galvanised frame and long handles
        b.box(0.05, 0.05, t.l, 0x6b7078, { x: -0.25, y: 0.45, z: 0.1, rx: -0.12 }).box(0.05, 0.05, t.l, 0x6b7078, { x: 0.25, y: 0.45, z: 0.1, rx: -0.12 })
          .box(0.05, 0.35, 0.05, 0x6b7078, { x: -0.25, y: 0.17, z: 0.35 }).box(0.05, 0.35, 0.05, 0x6b7078, { x: 0.25, y: 0.17, z: 0.35 });
        break;
      case 2: // three-wheeler: small front cab, frame, saddle
        b.box(1.0, 1.1, 0.9, 0x2f6fd6, { y: 1.05, z: -0.85 }).box(0.9, 0.5, 0.05, 0x9fc5e8, { y: 1.35, z: -1.31 })
          .box(0.2, 0.08, 2.2, 0x3a3e45, { y: 0.5, z: 0.1 }).box(0.35, 0.1, 0.4, 0x1c1c1c, { y: 0.95, z: -0.4 });
        break;
      case 3: // Lada 1200: white cab, orange stripe, bonnet
        b.box(1.55, 0.9, 1.5, 0xf2efe6, { y: 1.3, z: -0.55 }).box(1.6, 0.55, 1.1, 0xf2efe6, { y: 0.8, z: -1.5 }).box(1.62, 0.12, 2.65, 0xe07a1f, { y: 0.95, z: -0.75 })
          .box(1.4, 0.5, 0.05, 0x9fc5e8, { y: 1.45, z: -1.31 }).box(1.6, 0.25, t.l, 0x3a3e45, { y: 0.45 });
        break;
      case 4: // Multicar: tall orange cab, front brush pair
        b.box(1.5, 1.5, 1.3, 0xe07a1f, { y: 1.35, z: -1.05 }).box(1.35, 0.6, 0.05, 0x9fc5e8, { y: 1.75, z: -1.71 }).box(1.55, 0.25, t.l, 0x3a3e45, { y: 0.5 })
          .cyl(0.32, 0.32, 0.15, 0x1c1c1c, { x: -0.7, y: 0.02, z: -half - 0.1 }, 12).cyl(0.32, 0.32, 0.15, 0x1c1c1c, { x: 0.7, y: 0.02, z: -half - 0.1 }, 12);
        break;
      default: // IFA W50: big blue cab, suction mouth, running boards
        b.box(2.4, 1.9, 1.9, 0x2a5aa8, { y: 1.85, z: -2.5 }).box(2.2, 0.7, 0.05, 0x9fc5e8, { y: 2.3, z: -3.46 }).box(2.45, 0.35, t.l, 0x3a3e45, { y: 0.75 })
          .box(3.5, 0.25, 0.5, 0x1c1c1c, { y: 0.15, z: -half + 0.1 }).box(0.4, 0.06, 1.0, 0x8a8f96, { x: -1.4, y: 0.55, z: 2.8 }).box(0.4, 0.06, 1.0, 0x8a8f96, { x: 1.4, y: 0.55, z: 2.8 });
        break;
    }
    return b.build();
  });
}

const glowMaterial = (): THREE.Material =>
  AssetCache.get().material('vehicle.glow', () => new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));

function instanced(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, max: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, max);
  mesh.name = name;
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  return mesh;
}

export class VehicleRenderer {
  readonly root = new THREE.Group();
  readonly bodies: readonly THREE.Mesh[];
  readonly beds: THREE.InstancedMesh;
  readonly wheels: THREE.InstancedMesh;
  readonly glows: THREE.InstancedMesh;
  readonly headlight = new THREE.SpotLight(0xfff2d0, 0, 30, 0.5, 0.5, 1.2);
  readonly beacon = new THREE.SpotLight(0xffa21a, 0, 22, 0.35, 0.4, 1.4);
  readonly #m = new THREE.Matrix4();
  readonly #local = new THREE.Matrix4();
  readonly #q = new THREE.Quaternion();
  readonly #e = new THREE.Euler(0, 0, 0, 'YXZ');
  readonly #v = new THREE.Vector3();
  readonly #s = new THREE.Vector3();
  readonly #c = new THREE.Color();

  constructor() {
    this.root.name = 'vehicles';
    this.bodies = VEHICLE_TYPES.map((_, type) => {
      const mesh = new THREE.Mesh(bodyGeometry(type), litMaterial());
      mesh.name = `vehicle.body.${type}`;
      mesh.visible = false;
      mesh.matrixAutoUpdate = false;
      this.root.add(mesh);
      return mesh;
    });
    const cache = AssetCache.get();
    // white vertex colours: litMaterial multiplies them by the instance colour (a raw geometry would draw black)
    this.beds = instanced('vehicle.beds', cache.geometry('vehicle.bed', () => new PartsBuilder().box(1, 1, 1, 0xffffff, { y: 0.5, z: -0.5 }).build()), litMaterial(), VEHICLE.cap);
    this.wheels = instanced('vehicle.wheels', cache.geometry('vehicle.wheel', () => new PartsBuilder().add(new THREE.CylinderGeometry(1, 1, 1, 12).rotateZ(Math.PI / 2), 0xffffff).build()), litMaterial(), MAX_WHEELS);
    this.glows = instanced('vehicle.glows', cache.geometry('vehicle.glowBall', () => new THREE.SphereGeometry(0.09, 8, 6)), glowMaterial(), MAX_GLOWS);
    for (const light of [this.headlight, this.beacon]) {
      light.castShadow = false;
      this.root.add(light, light.target);
    }
    this.root.add(this.beds, this.wheels, this.glows);
  }

  /**
   * Places every vehicle; `own` gets the headlight (its lights mode), the nearest beacon within 40 m of
   * (lx, lz) the rotating beacon light. `timeSec` drives the beacon blink.
   */
  update(poses: readonly VehiclePose[], own: number | null, lx: number, lz: number, timeSec: number): void {
    for (const body of this.bodies) body.visible = false;
    let wheels = 0;
    let glows = 0;
    let beds = 0;
    let nearest: { p: VehiclePose; d: number; at: THREE.Vector3 } | null = null;
    this.headlight.intensity = 0;
    const blink = Math.sin(timeSec * Math.PI * 4) > 0;
    for (const p of poses) {
      const type = p.row.type;
      const t = VEHICLE_TYPES[type];
      const body = this.bodies[type];
      const bed = BEDS[type];
      if (!t || !body || !bed) continue;
      this.#e.set(p.pitch, p.rotY, p.roll, 'YXZ');
      this.#m.compose(this.#v.set(p.x, p.y, p.z), this.#q.setFromEuler(this.#e), this.#s.set(1, 1, 1));
      body.matrix.copy(this.#m);
      body.matrixWorldNeedsUpdate = true;
      body.visible = true;
      // the bed tips about its hinge: 0 → 45° → 0 over the 3 s (F.7)
      const tip = p.tip === null ? 0 : Math.sin(Math.min(1, Math.max(0, p.tip)) * Math.PI) * TIP_RAD;
      this.#e.set(tip, bed.front ? Math.PI : 0, 0, 'YXZ');
      this.#local.compose(this.#v.set(0, bed.y, bed.hingeZ), this.#q.setFromEuler(this.#e), this.#s.set(bed.w, bed.h, bed.l));
      this.beds.setMatrixAt(beds, this.#local.premultiply(this.#m));
      this.beds.setColorAt(beds, this.#c.set(bed.color));
      beds += 1;
      for (const w of wheelsOf(t, type)) {
        if (wheels >= MAX_WHEELS) break;
        this.#e.set(-p.odo / w.r, 0, 0, 'YXZ');
        this.#local.compose(this.#v.set(w.x, w.r, w.z), this.#q.setFromEuler(this.#e), this.#s.set(w.w, w.r, w.r));
        this.wheels.setMatrixAt(wheels, this.#local.premultiply(this.#m));
        this.wheels.setColorAt(wheels, this.#c.set('#1c1c1c'));
        wheels += 1;
      }
      const lamps = lampsOf(t, type);
      const glow = (at: THREE.Vector3, color: string): void => {
        if (glows >= MAX_GLOWS) return;
        this.#local.makeTranslation(at.x, at.y, at.z);
        this.glows.setMatrixAt(glows, this.#local.premultiply(this.#m));
        this.glows.setColorAt(glows, this.#c.set(color));
        glows += 1;
      };
      if (p.row.lights > 0) for (const h of lamps.heads) glow(h, p.row.lights === 2 ? '#FFFFFF' : '#FFF2C0');
      if (p.row.beacon && lamps.beacon) {
        if (blink) glow(lamps.beacon, '#FFA21A');
        const d = Math.hypot(p.x - lx, p.z - lz);
        if (d <= BEACON_RANGE_M && (!nearest || d < nearest.d)) nearest = { p, d, at: lamps.beacon };
      }
      if (p.row.id === own && p.row.lights > 0) {
        const head = this.#v.set(0, 0.8, -t.l / 2).applyMatrix4(this.#m);
        this.headlight.position.copy(head);
        this.headlight.target.position.set(0, 0, -t.l / 2 - 12).applyMatrix4(this.#m);
        this.headlight.target.updateMatrixWorld();
        this.headlight.distance = p.row.lights === 2 ? 70 : 30;
        this.headlight.intensity = p.row.lights === 2 ? 90 : 45;
      }
    }
    const n = nearest;
    if (n) {
      this.#e.set(n.p.pitch, n.p.rotY, n.p.roll, 'YXZ');
      this.#m.compose(this.#v.set(n.p.x, n.p.y, n.p.z), this.#q.setFromEuler(this.#e), this.#s.set(1, 1, 1));
      this.beacon.position.copy(n.at).applyMatrix4(this.#m);
      const a = timeSec * Math.PI * 3;
      this.beacon.target.position.set(this.beacon.position.x + Math.cos(a) * 6, this.beacon.position.y - 2, this.beacon.position.z + Math.sin(a) * 6);
      this.beacon.target.updateMatrixWorld();
      this.beacon.intensity = 40;
    } else this.beacon.intensity = 0;
    for (const [mesh, count] of [[this.beds, beds], [this.wheels, wheels], [this.glows, glows]] as const) {
      mesh.count = count;
      uploadInstances(mesh, count);
    }
  }

  dispose(): void {
    // geometries and materials belong to the AssetCache
    for (const mesh of [this.beds, this.wheels, this.glows]) mesh.dispose();
    this.headlight.dispose();
    this.beacon.dispose();
    this.root.removeFromParent();
  }
}
