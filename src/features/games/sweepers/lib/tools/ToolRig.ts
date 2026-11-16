// Belső nézetes eszköz-rig (spec 58): kamerához kötött procedurális hálók járás-ringással. A seprű az
// ütemben balról jobbra ível, érintéskor a sörte összenyomódik; a lombfúvó üresjáratban rezeg, jobb
// klikkre visszarúg; a vakuum gégecsöve 12 szakaszos cső egy másodfokú Bézier mentén a célpont felé.
// Legfeljebb 2 rajzolás (test + fej vagy cső), árnyék nélkül.
import * as THREE from 'three';
import { AssetCache } from '../engine/AssetCache';
import { PartsBuilder } from '../world/geometryKit';
import { litMaterial } from '../world/materials';
import { isBroom, toolSpec } from './catalog';

/** Main-pass draws of the rig: body + head, or body + hose. */
export const RIG_DRAW_CALLS = 2;
export const HOSE_SEGMENTS = 12;
const HOSE_RADIAL = 6;
const HOSE_RADIUS = 0.035;
const SWING_RAD = 0.75;

const BROOM_HEAD: Readonly<Record<number, { w: number; color: number; bristle: number }>> = {
  0: { w: 0.08, color: 0xe8e2d0, bristle: 0x8a8f99 },
  1: { w: 0.26, color: 0x2f6fd6, bristle: 0xd94f3d },
  2: { w: 0.36, color: 0xb22a2a, bristle: 0xd9b26a },
  3: { w: 0.55, color: 0xc0262d, bristle: 0x2f8a3c }
};

function bodyGeometry(tool: number): THREE.BufferGeometry {
  return AssetCache.get().geometry(`rig.body.${tool}`, () => {
    const b = new PartsBuilder();
    if (isBroom(tool)) {
      const len = tool === 0 ? 0.35 : 1.25;
      b.cyl(0.014, 0.016, len, tool === 0 ? 0xf0f0f0 : 0xa8763e, { y: -len, rx: 0 });
    } else if (tool === 4) {
      b.box(0.14, 0.16, 0.3, 0xd8541c, { y: 0, z: 0.05 })
        .cyl(0.03, 0.04, 0.55, 0x333840, { z: -0.12, rx: -Math.PI / 2 - 0.25 })
        .box(0.04, 0.1, 0.05, 0x1e2126, { y: -0.12, z: 0.1 });
    } else if (tool === 5) {
      b.cyl(0.022, 0.022, 0.7, 0x9aa3ad, { rx: -Math.PI / 2 - 0.5 })
        .cyl(0.04, 0.05, 0.08, 0x2b2f36, { y: -0.6 * Math.sin(0.5) - 0.05, z: -0.6 * Math.cos(0.5), rx: -Math.PI / 2 - 0.5 });
    } else if (tool === 6) {
      b.cyl(0.015, 0.015, 1.2, 0x6b6f75, { y: -1.2 })
        .cyl(0.08, 0.08, 0.02, 0x2d3a52, { y: -0.35, rz: Math.PI / 2 });
    } else {
      b.box(0.09, 0.05, 0.16, 0xd6a35a, { z: -0.02 }).box(0.08, 0.03, 0.07, 0xc9954f, { y: 0.02, z: -0.12 });
    }
    return b.build();
  });
}

function headGeometry(tool: number): THREE.BufferGeometry | null {
  if (tool === 4 || tool === 5 || tool === 7) return null;
  return AssetCache.get().geometry(`rig.head.${tool}`, () => {
    const b = new PartsBuilder();
    if (tool === 6) {
      b.box(0.6, 0.03, 0.05, 0x4c5158);
      for (let i = 0; i < 9; i++) b.box(0.012, 0.09, 0.012, 0x7a7f86, { x: -0.28 + i * 0.07, y: -0.05 });
      return b.build();
    }
    const h = BROOM_HEAD[tool] ?? BROOM_HEAD[1];
    if (!h) return b.box(0.2, 0.04, 0.06, 0x888888).build();
    b.box(h.w, 0.04, 0.07, h.color).box(h.w * 0.96, 0.09, 0.06, h.bristle, { y: -0.065 });
    return b.build();
  });
}

/** Quadratic Bézier point. */
export function bezier(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, t: number, out: THREE.Vector3): THREE.Vector3 {
  const u = 1 - t;
  return out.set(
    u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z
  );
}

/** A 12-segment tube whose vertices are rewritten every frame (no allocation). */
function hoseGeometry(): THREE.BufferGeometry {
  const rings = HOSE_SEGMENTS + 1;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rings * HOSE_RADIAL * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(rings * HOSE_RADIAL * 3), 3));
  const colors = new Float32Array(rings * HOSE_RADIAL * 3);
  const c = new THREE.Color(0x2a2d33);
  for (let i = 0; i < rings * HOSE_RADIAL; i++) {
    const ridge = Math.floor(i / HOSE_RADIAL) % 2 === 0 ? 1 : 0.7;
    colors[i * 3] = c.r * ridge;
    colors[i * 3 + 1] = c.g * ridge;
    colors[i * 3 + 2] = c.b * ridge;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const index: number[] = [];
  for (let s = 0; s < HOSE_SEGMENTS; s++) {
    for (let k = 0; k < HOSE_RADIAL; k++) {
      const a = s * HOSE_RADIAL + k;
      const b = s * HOSE_RADIAL + ((k + 1) % HOSE_RADIAL);
      const c2 = a + HOSE_RADIAL;
      const d = b + HOSE_RADIAL;
      index.push(a, c2, b, b, c2, d);
    }
  }
  g.setIndex(index);
  return g;
}

export interface RigFrame {
  readonly dt: number;
  /** Seconds since the game started (vibration / bob phase). */
  readonly time: number;
  readonly moving: boolean;
  readonly sprint: boolean;
  /** 0.5 under stench (swing animation at half speed), else 1. */
  readonly animSpeed: number;
}

export class ToolRig {
  readonly root = new THREE.Group();
  readonly #pivot = new THREE.Group();
  readonly #body: THREE.Mesh;
  readonly #head: THREE.Mesh;
  readonly #hose: THREE.Mesh;
  readonly #hoseGeo: THREE.BufferGeometry;
  #tool = -1;
  /** Swing progress 0..1 (1 = idle). */
  #swing = 1;
  #swingDuration = 0.5;
  #recoil = 0;
  #reach = 0;
  #bob = 0;
  readonly #p0 = new THREE.Vector3();
  readonly #p1 = new THREE.Vector3();
  readonly #p2 = new THREE.Vector3();
  readonly #a = new THREE.Vector3();
  readonly #b = new THREE.Vector3();
  readonly #t = new THREE.Vector3();
  readonly #n = new THREE.Vector3();
  readonly #bn = new THREE.Vector3();

  constructor() {
    this.root.name = 'tool-rig';
    this.root.position.set(0.3, -0.3, -0.5);
    this.#body = new THREE.Mesh(bodyGeometry(0), litMaterial());
    this.#head = new THREE.Mesh(bodyGeometry(0), litMaterial());
    this.#hoseGeo = hoseGeometry();
    this.#hose = new THREE.Mesh(this.#hoseGeo, litMaterial());
    this.#body.name = 'tool-rig.body';
    this.#head.name = 'tool-rig.head';
    this.#hose.name = 'tool-rig.hose';
    for (const m of [this.#body, this.#head, this.#hose]) {
      m.castShadow = false;
      m.frustumCulled = false;
      m.renderOrder = 10;
    }
    this.#pivot.add(this.#body, this.#head);
    this.root.add(this.#pivot, this.#hose);
    this.setTool(0);
  }

  get tool(): number {
    return this.#tool;
  }

  /** Seconds left of the current swing (0 when idle). */
  get swinging(): boolean {
    return this.#swing < 1;
  }

  setTool(tool: number): void {
    if (tool === this.#tool) return;
    this.#tool = tool;
    this.#body.geometry = bodyGeometry(tool);
    const head = headGeometry(tool);
    this.#head.visible = head !== null;
    if (head) this.#head.geometry = head;
    this.#hose.visible = tool === 5;
    this.#head.position.set(0, isBroom(tool) ? (tool === 0 ? -0.36 : -1.26) : -1.2, tool === 0 ? 0 : 0);
    this.#pivot.rotation.set(isBroom(tool) || tool === 6 ? 0.9 : 0, 0, 0);
    this.#swing = 1;
    this.#recoil = 0;
  }

  /** Starts one use animation; `alt` = RMB (scoop / recoil / reverse blow / crush). */
  use(alt: boolean): void {
    const spec = toolSpec(this.#tool);
    if (!spec) return;
    if (this.#tool === 4 || this.#tool === 5) {
      if (alt) this.#recoil = 1;
      return;
    }
    this.#swingDuration = alt ? (spec.altCadence ?? spec.cadence) : spec.cadence;
    this.#swing = 0;
    if (this.#tool === 7) this.#reach = 1;
  }

  update(frame: RigFrame): void {
    const speed = frame.sprint ? 13 : 9;
    this.#bob = frame.moving ? this.#bob + frame.dt * speed : this.#bob * 0.9;
    const bobY = frame.moving ? Math.abs(Math.sin(this.#bob)) * 0.018 : 0;
    const bobX = frame.moving ? Math.sin(this.#bob * 0.5) * 0.012 : 0;
    this.root.position.set(0.3 + bobX, -0.3 - bobY, -0.5);

    if (this.#swing < 1) this.#swing = Math.min(1, this.#swing + (frame.dt * frame.animSpeed) / Math.max(0.05, this.#swingDuration));
    const s = this.#swing;
    const arc = s < 1 ? Math.sin(s * Math.PI) : 0;
    if (isBroom(this.#tool) || this.#tool === 6) {
      // left-to-right arc across the cadence; the bristles squash at the ground contact (mid-swing)
      this.#pivot.rotation.y = s < 1 ? SWING_RAD - s * 2 * SWING_RAD : 0;
      this.#pivot.rotation.x = 0.9 + arc * 0.25;
      const squash = 1 - 0.3 * arc;
      this.#head.scale.set(1 + 0.15 * arc, squash, 1);
    } else if (this.#tool === 4) {
      // idle 2-stroke vibration, heavy recoil jolt on the trigger
      const v = 0.0035;
      this.#pivot.position.set(Math.sin(frame.time * 210) * v, Math.sin(frame.time * 173 + 1) * v, 0.09 * this.#recoil);
      this.#pivot.rotation.x = 0.25 * this.#recoil;
    } else if (this.#tool === 5) {
      this.#pivot.position.set(Math.sin(frame.time * 90) * 0.0015, 0, 0.06 * this.#recoil);
      this.#updateHose();
    } else {
      this.#reach = Math.max(0, this.#reach - frame.dt * 3);
      this.#pivot.position.set(0, -0.05 * arc, -0.25 * arc);
    }
    this.#recoil = Math.max(0, this.#recoil - frame.dt * 6);
  }

  /** Hose from the backpack (behind the right hip) along a sagging quadratic Bézier to the wand. */
  #updateHose(): void {
    this.#p0.set(0.05, -0.5, 0.45);
    this.#p2.set(this.#pivot.position.x, this.#pivot.position.y + 0.02, this.#pivot.position.z + 0.02);
    this.#p1.set((this.#p0.x + this.#p2.x) / 2 + 0.12, Math.min(this.#p0.y, this.#p2.y) - 0.3, (this.#p0.z + this.#p2.z) / 2);
    const pos = this.#hoseGeo.getAttribute('position');
    const nor = this.#hoseGeo.getAttribute('normal');
    if (!(pos instanceof THREE.BufferAttribute) || !(nor instanceof THREE.BufferAttribute)) return;
    for (let s = 0; s <= HOSE_SEGMENTS; s++) {
      const t = s / HOSE_SEGMENTS;
      const c = bezier(this.#p0, this.#p1, this.#p2, t, this.#a);
      bezier(this.#p0, this.#p1, this.#p2, Math.min(1, t + 0.01), this.#b);
      this.#t.copy(this.#b).sub(c);
      if (t >= 1) bezier(this.#p0, this.#p1, this.#p2, 0.99, this.#t).sub(c).negate();
      this.#t.normalize();
      this.#n.set(0, 1, 0).cross(this.#t).normalize();
      this.#bn.copy(this.#t).cross(this.#n).normalize();
      for (let k = 0; k < HOSE_RADIAL; k++) {
        const ang = (k / HOSE_RADIAL) * Math.PI * 2;
        const cx = Math.cos(ang);
        const sy = Math.sin(ang);
        const nx = this.#n.x * cx + this.#bn.x * sy;
        const ny = this.#n.y * cx + this.#bn.y * sy;
        const nz = this.#n.z * cx + this.#bn.z * sy;
        const i = s * HOSE_RADIAL + k;
        pos.setXYZ(i, c.x + nx * HOSE_RADIUS, c.y + ny * HOSE_RADIUS, c.z + nz * HOSE_RADIUS);
        nor.setXYZ(i, nx, ny, nz);
      }
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
    this.#hoseGeo.computeBoundingSphere();
  }

  /** Hose vertex ring centres (tests: the tube follows the Bézier). */
  hoseCentre(segment: number): THREE.Vector3 {
    return bezier(this.#p0, this.#p1, this.#p2, segment / HOSE_SEGMENTS, new THREE.Vector3());
  }

  dispose(): void {
    this.#hoseGeo.dispose();
    this.root.removeFromParent();
  }
}
