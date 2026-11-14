// A logisztika rajzolása (D.7), fizikai motor nélkül: 8 példányosított épületcsalád, 3 zsákréteg, 1 rakomány-
// kupac, a daru (statikus váz + horog/kötél), a vészvillogó, a szellem, a rács és a dobási ív: 18 rajzolás.
// Az alátámasztás a szalagok geometriájában van (2 m-re lenyúló lábak, 0. szinten a terep takarja).
// Semmi sem vet árnyékot; a GPU-ra csak a használt példánytartomány megy fel.
import * as THREE from 'three';
import { AssetCache } from '../engine/AssetCache';
import { PartsBuilder, uploadInstances } from '../world/geometryKit';
import { litMaterial } from '../world/materials';
import { BAG_TIERS, BELT_MPS, CRANE, STRUCT_TYPES, T_BALER, T_HOPPER, T_MAGNET, T_STRIPPER, T_TROMMEL, bagColor, deckY, footprintSize, isBeltLike, isMachine, lotColor, rotYOf, type StructFamily } from './tables';
import { pathPoint } from './network';
import type { LogisticsStore } from './LogisticsStore';
import type { ActiveArc } from './LogisticsStore';
import type { StructRow } from '../../logisticsTypes';

export const STRUCT_FAMILIES: readonly StructFamily[] = ['foundation', 'belt', 'bend', 'ramp', 'junction', 'hopper', 'packager', 'fence', 'stripper', 'baler', 'magnet', 'trommel'];
/**
 * Main-pass draws: structures 12 (D 8 + E machines 4), bags 5 (D 3 + E bala / köteg 2), lots 1, crane 2,
 * strobe 1, ghost 1, grid 1, arc 1.
 */
export const LOGISTICS_DRAW_CALLS = STRUCT_FAMILIES.length + BAG_TIERS.length + 1 + 2 + 1 + 1 + 1 + 1;
export const MAX_STRUCT_INSTANCES = 256;
export const MAX_BAG_INSTANCES = 512;
export const MAX_LOT_INSTANCES = 256;
export const MAX_STROBES = 32;
export const GRID_RADIUS_M = 12;
export const ARC_POINTS = 64;
/** Belt legs reach this far below the deck (lvl 2 deck is 2.15 m above its base). */
const LEG_M = 2.2;

/** Metres the belts have rolled: integrated on the CPU at 1.4 m/s × the grid's pf (E.2), so a brownout slows the stripes. */
const BELT_RUN = { value: 0 };

const ROLL_GLSL_V = /* glsl */ `
uniform float uBeltRun;
attribute float aRun;
varying float vRoll;
`;
const ROLL_GLSL_F = /* glsl */ `
varying float vRoll;
`;

/** Belt-like material: one shared scrolling roller stripe at 1.4 m/s; `aRun` 0 stops a jammed node (D.7). */
function rollerMaterial(): THREE.Material {
  return AssetCache.get().material('logistics.rollers', () => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uBeltRun = BELT_RUN;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${ROLL_GLSL_V}`)
        // local z of the deck (metres along the piece; instances scale z by the length)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoll = position.z * length(instanceMatrix[2].xyz) * 4.0 + uBeltRun * 4.0 * aRun;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${ROLL_GLSL_F}`)
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 0.75 + 0.25 * step(0.5, fract(vRoll));');
    };
    m.customProgramCacheKey = () => 'sweepers:logistics.rollers';
    return m;
  });
}

function familyGeometry(family: StructFamily): THREE.BufferGeometry {
  return AssetCache.get().geometry(`logistics.${family}`, () => {
    const b = new PartsBuilder();
    const legs = (zs: readonly number[]): void => {
      for (const z of zs) for (const x of [-0.42, 0.42]) b.box(0.06, LEG_M, 0.06, 0x4a4f57, { x, y: -LEG_M / 2 - 0.08, z });
    };
    switch (family) {
      case 'foundation': // unit slab, top at y = 0 (scaled to w × depth × d)
        b.box(1, 1, 1, 0x9c9a94, { y: -0.5 });
        break;
      case 'belt': // unit length along z, deck top at y = 0
        b.box(0.8, 0.06, 1, 0x2e3136, { y: -0.03 }).box(0.08, 0.14, 1, 0xd6a21e, { x: -0.44, y: -0.02 }).box(0.08, 0.14, 1, 0xd6a21e, { x: 0.44, y: -0.02 });
        legs([0]);
        break;
      case 'bend': {
        const ring = new THREE.RingGeometry(0.1, 0.9, 10, 1, 0, Math.PI / 2).rotateX(-Math.PI / 2);
        b.add(ring, 0x2e3136, { x: -0.5, y: 0.001, z: 0.5, ry: -Math.PI / 2 }).box(1, 0.06, 1, 0x3a3e45, { y: -0.04 });
        legs([0]);
        break;
      }
      case 'ramp': // rises 0.9 m from local +z (in) to −z (out), deck at the low end y = 0
        b.box(0.8, 0.06, Math.sqrt(4.81), 0x2e3136, { y: 0.45, rx: Math.atan2(0.9, 2) }).box(0.08, 0.16, Math.sqrt(4.81), 0xd6a21e, { x: -0.44, y: 0.47, rx: Math.atan2(0.9, 2) })
          .box(0.08, 0.16, Math.sqrt(4.81), 0xd6a21e, { x: 0.44, y: 0.47, rx: Math.atan2(0.9, 2) });
        legs([0.8, -0.8]);
        break;
      case 'junction':
        b.box(1, 0.08, 1, 0x3a3e45, { y: -0.04 }).box(0.3, 0.3, 0.3, 0xf5a623, { y: 0.15 });
        legs([0]);
        break;
      case 'hopper':
        b.add(new THREE.CylinderGeometry(2, 0.6, 1.6, 4, 1, true).rotateY(Math.PI / 4), 0x6b7078, { y: 1.6 }).box(0.8, 0.8, 0.8, 0x50555d, { y: 0.4 });
        break;
      case 'packager':
        b.box(2, 2.2, 2, 0x2f6fd6, { y: 1.1 }).box(1.2, 0.5, 2.05, 0x1c1c1c, { y: 0.55 });
        break;
      case 'fence':
        b.box(2, 1.1, 0.06, 0x8a8f96, { y: 0.55 }).box(0.08, 1.15, 0.12, 0x5a5f66, { x: -0.96, y: 0.575 }).box(0.08, 1.15, 0.12, 0x5a5f66, { x: 0.96, y: 0.575 });
        break;
      // Phase E machines, base at y = 0 (the trommel is only its drum: it spins about local z, centred on the axis)
      case 'stripper':
        b.box(2, 1.2, 2, 0x8a2c2c, { y: 0.6 }).box(1.4, 0.4, 1.4, 0xd9822b, { y: 1.4 }).box(0.4, 0.4, 2.05, 0x1c1c1c, { y: 0.5 });
        break;
      case 'baler':
        b.box(2, 1.4, 2, 0x2f6e4a, { y: 0.7 }).box(1.6, 1, 1.6, 0x9c9a94, { y: 1.9 });
        break;
      case 'magnet':
        b.box(2, 0.9, 2, 0x3a3e45, { y: 0.45 }).add(new THREE.CylinderGeometry(0.6, 0.6, 1.8, 16).rotateZ(Math.PI / 2), 0xb5452c, { y: 1.3 });
        break;
      case 'trommel':
        b.add(new THREE.CylinderGeometry(0.8, 0.8, 4, 12, 1).rotateX(Math.PI / 2), 0x6b7078).box(0.12, 1.62, 3.9, 0xd6a21e);
        break;
    }
    return b.build();
  });
}

function bagGeometry(tier: number): THREE.BufferGeometry {
  return AssetCache.get().geometry(`logistics.bag.${tier}`, () => {
    const spec = BAG_TIERS[tier] ?? BAG_TIERS[0];
    const r = spec?.r ?? 0.28;
    const h = spec?.h ?? 0.6;
    if (tier === 2) return new THREE.BoxGeometry(1.2, 1.2, 1.2).translate(0, 0.6, 0);
    if (tier === 3) return new THREE.BoxGeometry(0.6, 0.6, 0.6).translate(0, 0.3, 0); // bála (E.1)
    if (tier === 4) return new THREE.TorusGeometry(0.22, 0.08, 6, 14).rotateX(Math.PI / 2).scale(1, 2.5, 1).translate(0, 0.2, 0); // köteg
    // lathe: a rounded sack with a tied neck
    const pts = [[0, 0], [r * 0.8, 0.02], [r, h * 0.2], [r, h * 0.6], [r * 0.7, h * 0.85], [r * 0.15, h * 0.93], [r * 0.2, h], [0, h]].map(([x = 0, y = 0]) => new THREE.Vector2(x, y));
    return new THREE.LatheGeometry(pts, 10);
  });
}

function bagMaterial(): THREE.Material {
  return AssetCache.get().material('logistics.bag', () => new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 }));
}

function plainColorMaterial(key: string, color: number, opts: THREE.MeshBasicMaterialParameters = {}): THREE.Material {
  return AssetCache.get().material(key, () => new THREE.MeshBasicMaterial({ color, ...opts }));
}

/** 0.5 m holographic grid in a disc (D.7). */
function gridMaterial(): THREE.Material {
  return AssetCache.get().material('logistics.grid', () => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uRadius: { value: GRID_RADIUS_M } },
    vertexShader: 'varying vec3 vW; varying vec2 vL; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vL = position.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */ `
uniform float uRadius;
varying vec3 vW;
varying vec2 vL;
void main() {
  vec2 g = abs(fract(vW.xz * 2.0 - 0.5) - 0.5) / fwidth(vW.xz * 2.0);
  float line = 1.0 - min(min(g.x, g.y), 1.0);
  float fade = 1.0 - smoothstep(uRadius * 0.7, uRadius, length(vL));
  gl_FragColor = vec4(0.35, 0.85, 1.0, line * fade * 0.6);
}`
  }));
}

function instanced(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number, colors: boolean): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = name;
  mesh.count = 0;
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  if (colors) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  return mesh;
}

export interface CarriedBag {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotY: number;
}

export interface LogisticsFrame {
  readonly serverNow: number;
  readonly ground: (x: number, z: number) => number;
  /** Bags in someone's hands, already placed at the hand. */
  readonly carried: readonly CarriedBag[];
  /** Grid power factor (E.2): belt stripes and machine animation run × pf; default 1. */
  readonly pf?: number;
}

export interface LogisticsRenderStats {
  readonly structures: number;
  /** Conveyor pieces instantiated (belt-like + packager), F3 (spec 14). */
  readonly conveyors: number;
  readonly bags: number;
  readonly lots: number;
  readonly strobes: number;
}

/** Point on a server arc (D.7): linear in x/z, a parabola through the apex in y, exactly the end at 1. */
export function arcPoint(arc: ActiveArc, serverNow: number): { x: number; y: number; z: number } {
  const u = arc.durMs <= 0 ? 1 : Math.min(1, Math.max(0, (serverNow - arc.t0) / arc.durMs));
  const r1 = Math.sqrt(Math.max(0, arc.apexY - arc.fy));
  const r2 = Math.sqrt(Math.max(0, arc.apexY - arc.ty));
  const sum = r1 + r2;
  // y = fy + B·u + A·u² with y(1) = ty and max = apexY (a drop has r1 = 0: free fall)
  const y = sum > 0 ? arc.fy + 2 * r1 * sum * u - sum * sum * u * u : arc.fy + (arc.ty - arc.fy) * u;
  return { x: arc.fx + (arc.tx - arc.fx) * u, y, z: arc.fz + (arc.tz - arc.fz) * u };
}

export class LogisticsRenderer {
  readonly root = new THREE.Group();
  readonly structures: ReadonlyMap<StructFamily, THREE.InstancedMesh>;
  readonly bags: readonly THREE.InstancedMesh[];
  readonly lots: THREE.InstancedMesh;
  readonly craneRig: THREE.Mesh;
  /** Hook block and cable: two instances of one box. */
  readonly hook: THREE.InstancedMesh;
  readonly strobe: THREE.InstancedMesh;
  readonly ghost: THREE.Mesh;
  readonly grid: THREE.Mesh;
  readonly arc: THREE.Line;
  readonly #store: LogisticsStore;
  readonly #m = new THREE.Matrix4();
  readonly #q = new THREE.Quaternion();
  readonly #p = new THREE.Vector3();
  readonly #s = new THREE.Vector3();
  readonly #c = new THREE.Color();
  readonly #up = new THREE.Vector3(0, 1, 0);
  readonly #zAxis = new THREE.Vector3(0, 0, 1);
  readonly #roll = new THREE.Quaternion();
  readonly #arcPositions = new Float32Array(ARC_POINTS * 3);
  #builtVersion = -1;
  #builtJams = '';
  #lastTime: number | null = null;
  #jammed: StructRow[] = [];
  /** Busy machine instances, re-posed per frame (drum spin / press stroke). */
  #animated: { readonly row: StructRow; readonly mesh: THREE.InstancedMesh; readonly i: number }[] = [];
  #stats: LogisticsRenderStats = { structures: 0, conveyors: 0, bags: 0, lots: 0, strobes: 0 };

  constructor(store: LogisticsStore) {
    this.#store = store;
    this.root.name = 'logistics';
    const families = new Map<StructFamily, THREE.InstancedMesh>();
    for (const f of STRUCT_FAMILIES) {
      const rolls = f === 'belt' || f === 'bend' || f === 'ramp' || f === 'junction';
      const mesh = instanced(`logistics.${f}`, familyGeometry(f), rolls ? rollerMaterial() : litMaterial(), MAX_STRUCT_INSTANCES, f === 'junction');
      if (rolls) mesh.geometry = mesh.geometry.clone();
      if (rolls) mesh.geometry.setAttribute('aRun', new THREE.InstancedBufferAttribute(new Float32Array(MAX_STRUCT_INSTANCES).fill(1), 1));
      families.set(f, mesh);
      this.root.add(mesh);
    }
    this.structures = families;
    this.bags = BAG_TIERS.map((_, tier) => instanced(`logistics.bag.${tier}`, bagGeometry(tier), bagMaterial(), MAX_BAG_INSTANCES, true));
    this.lots = instanced('logistics.lots', AssetCache.get().geometry('logistics.lot', () => new THREE.SphereGeometry(0.3, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1)), bagMaterial(), MAX_LOT_INSTANCES, true);
    this.craneRig = new THREE.Mesh(AssetCache.get().geometry('logistics.crane', craneRigGeometry), litMaterial());
    this.craneRig.name = 'logistics.crane';
    this.hook = instanced('logistics.hook', AssetCache.get().geometry('logistics.hookbox', () => new THREE.BoxGeometry(1, 1, 1)), plainColorMaterial('logistics.hook', 0xd6a21e), 2, false);
    this.hook.visible = true;
    this.hook.count = 2;
    this.strobe = instanced('logistics.strobe', AssetCache.get().geometry('logistics.strobeQuad', () => new THREE.PlaneGeometry(0.5, 0.5)), plainColorMaterial('logistics.strobe', 0xffa21a, { side: THREE.DoubleSide, transparent: true, opacity: 0.9, forceSinglePass: true }), MAX_STROBES, false);
    this.ghost = new THREE.Mesh(AssetCache.get().geometry('logistics.ghostBox', () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)), new THREE.MeshBasicMaterial({ color: 0x28c997, transparent: true, opacity: 0.35, depthWrite: false }));
    this.ghost.name = 'logistics.ghost';
    this.ghost.visible = false;
    this.grid = new THREE.Mesh(AssetCache.get().geometry('logistics.gridDisc', () => new THREE.CircleGeometry(GRID_RADIUS_M, 48).rotateX(-Math.PI / 2)), gridMaterial());
    this.grid.name = 'logistics.grid';
    this.grid.visible = false;
    const arcGeometry = new THREE.BufferGeometry();
    arcGeometry.setAttribute('position', new THREE.BufferAttribute(this.#arcPositions, 3));
    this.arc = new THREE.Line(arcGeometry, plainColorMaterial('logistics.arc', 0xffffff, { transparent: true, opacity: 0.8, depthWrite: false }));
    this.arc.name = 'logistics.arc';
    this.arc.visible = false;
    this.arc.frustumCulled = false;
    for (const o of [this.craneRig, this.ghost, this.grid, this.arc]) o.castShadow = false;
    this.root.add(...this.bags, this.lots, this.craneRig, this.hook, this.strobe, this.ghost, this.grid, this.arc);
  }

  get stats(): LogisticsRenderStats {
    return this.#stats;
  }

  get jammed(): readonly StructRow[] {
    return this.#jammed;
  }

  /** Per frame: structures when the set or a jam flag changed; bags, cargo, crane and the strobe always. */
  update(frame: LogisticsFrame, timeSec: number): void {
    const jams = [...this.#store.structures.values()].filter((r) => r.jammed).map((r) => r.id).join(',');
    if (this.#builtVersion !== this.#store.version || jams !== this.#builtJams) {
      this.#builtVersion = this.#store.version;
      this.#builtJams = jams;
      this.#rebuildStructures(frame.ground);
    }
    const dt = this.#lastTime === null ? 0 : Math.max(0, timeSec - this.#lastTime);
    this.#lastTime = timeSec;
    BELT_RUN.value += BELT_MPS * (frame.pf ?? 1) * dt;
    this.#animateMachines();
    const bags = this.#drawBags(frame);
    const lots = this.#drawLots(frame);
    this.#drawCrane(frame);
    // jam strobe: 2 Hz
    this.strobe.visible = this.strobe.count > 0 && (timeSec * 2) % 1 < 0.5;
    this.#stats = { ...this.#stats, bags, lots };
  }

  /** Build-mode ghost (null hides it and the grid). */
  setGhost(ghost: { readonly type: number; readonly x: number; readonly z: number; readonly rot: number; readonly y: number; readonly ok: boolean } | null, gridAt: { x: number; y: number; z: number } | null): void {
    this.ghost.visible = ghost !== null;
    this.grid.visible = gridAt !== null;
    if (gridAt) this.grid.position.set(gridAt.x, gridAt.y + 0.03, gridAt.z);
    if (!ghost) return;
    const size = footprintSize(ghost.type, ghost.rot);
    const t = STRUCT_TYPES[ghost.type];
    const h = typeof t?.collider === 'number' ? t.collider : t?.family === 'hopper' ? 2 : 0.5;
    this.ghost.position.set(ghost.x, ghost.y, ghost.z);
    this.ghost.scale.set(size.w, h, size.d);
    const material = this.ghost.material;
    if (material instanceof THREE.MeshBasicMaterial) material.color.setHex(ghost.ok ? 0x28c997 : 0xe94b64);
  }

  /** Throw preview (null hides it). */
  setArc(points: readonly { readonly x: number; readonly y: number; readonly z: number }[] | null): void {
    this.arc.visible = points !== null && points.length > 1;
    if (!points) return;
    const n = Math.min(ARC_POINTS, points.length);
    for (let i = 0; i < n; i++) {
      const p = points[i];
      if (!p) continue;
      this.#arcPositions.set([p.x, p.y, p.z], i * 3);
    }
    const attr = this.arc.geometry.getAttribute('position');
    attr.needsUpdate = true;
    this.arc.geometry.setDrawRange(0, n);
  }

  #compose(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, rotY: number, sx: number, sy: number, sz: number): void {
    this.#q.setFromAxisAngle(this.#up, rotY);
    this.#m.compose(this.#p.set(x, y, z), this.#q, this.#s.set(sx, sy, sz));
    mesh.setMatrixAt(i, this.#m);
  }

  /** Busy flags arrive without a relink, so the busy machines are posed every frame. */
  #animateMachines(): void {
    const run = BELT_RUN.value / BELT_MPS;
    const touched = new Set<THREE.InstancedMesh>();
    for (const a of this.#animated) {
      const row = this.#store.structures.get(a.row.id);
      if (!row) continue;
      this.#poseMachine(a.mesh, a.i, row, row.busy && !row.jammed ? run : 0);
      touched.add(a.mesh);
    }
    for (const mesh of touched) uploadInstances(mesh, mesh.count);
  }

  #poseMachine(mesh: THREE.InstancedMesh, i: number, r: StructRow, run: number): void {
    const rotY = rotYOf(r.rot);
    if (r.type === T_TROMMEL) {
      // drum about its own (local z) axis
      this.#q.setFromAxisAngle(this.#up, rotY).multiply(this.#roll.setFromAxisAngle(this.#zAxis, run * 2));
      this.#m.compose(this.#p.set(r.x, r.baseY + 1.1, r.z), this.#q, this.#s.set(1, 1, 1));
      mesh.setMatrixAt(i, this.#m);
    } else if (r.type === T_BALER) this.#compose(mesh, i, r.x, r.baseY, r.z, rotY, 1, 1 - 0.12 * (0.5 - 0.5 * Math.cos(run * 2.5)), 1);
    else if (r.type === T_STRIPPER) this.#compose(mesh, i, r.x + Math.sin(run * 40) * 0.01 * Math.sign(run), r.baseY, r.z, rotY, 1, 1, 1);
    else this.#compose(mesh, i, r.x, r.baseY, r.z, rotY, 1, 1, 1);
  }

  #rebuildStructures(ground: (x: number, z: number) => number): void {
    const counts = new Map<StructFamily, number>();
    this.#jammed = [];
    this.#animated = [];
    let conveyors = 0;
    let total = 0;
    for (const r of this.#store.structures.values()) {
      const t = STRUCT_TYPES[r.type];
      const mesh = t && this.structures.get(t.family);
      if (!t || !mesh) continue;
      const i = counts.get(t.family) ?? 0;
      if (i >= MAX_STRUCT_INSTANCES) continue;
      const rotY = rotYOf(r.rot);
      const deck = deckY(r.baseY, r.lvl);
      if (t.family === 'foundation') this.#compose(mesh, i, r.x, r.baseY, r.z, 0, t.w, Math.max(0.2, r.baseY - ground(r.x, r.z) + 0.5), t.d);
      else if (t.family === 'belt') this.#compose(mesh, i, r.x, deck, r.z, rotY, 1, 1, t.d);
      else if (t.family === 'ramp') {
        // rampDown is the rampUp mesh turned around, placed at its lower deck
        const down = r.type === 8;
        this.#compose(mesh, i, r.x, down ? deckY(r.baseY, r.lvl - 1) : deck, r.z, down ? rotY + Math.PI : rotY, 1, 1, 1);
      } else if (isMachine(r.type)) {
        this.#poseMachine(mesh, i, r, 0);
        if (r.type !== T_MAGNET) this.#animated.push({ row: r, mesh, i });
      } else this.#compose(mesh, i, r.x, t.family === 'hopper' || t.family === 'packager' || t.family === 'fence' ? r.baseY : deck, r.z, rotY, 1, 1, 1);
      if (t.family === 'junction') mesh.setColorAt(i, this.#c.set(r.type === 9 ? '#F5A623' : '#28C997'));
      const run = mesh.geometry.getAttribute('aRun');
      if (run instanceof THREE.InstancedBufferAttribute) run.setX(i, r.jammed ? 0 : 1);
      if (r.jammed) this.#jammed.push(r);
      if (isBeltLike(r.type) || r.type === 12) conveyors += 1;
      counts.set(t.family, i + 1);
      total += 1;
    }
    for (const [family, mesh] of this.structures) {
      mesh.count = counts.get(family) ?? 0;
      mesh.visible = mesh.count > 0;
      uploadInstances(mesh, mesh.count);
      const run = mesh.geometry.getAttribute('aRun');
      if (run instanceof THREE.InstancedBufferAttribute && mesh.count > 0) {
        run.clearUpdateRanges();
        run.addUpdateRange(0, mesh.count);
        run.needsUpdate = true;
      }
    }
    // one amber quad above each jammed junction
    const strobes = Math.min(MAX_STROBES, this.#jammed.length);
    for (let i = 0; i < strobes; i++) {
      const r = this.#jammed[i];
      if (r) this.#compose(this.strobe, i, r.x, deckY(r.baseY, r.lvl) + (r.type === 12 ? 2.5 : 0.8), r.z, rotYOf(r.rot), 1, 1, 1);
    }
    this.strobe.count = strobes;
    uploadInstances(this.strobe, strobes);
    this.#stats = { ...this.#stats, structures: total, conveyors, strobes };
  }

  #drawBags(frame: LogisticsFrame): number {
    const counts = BAG_TIERS.map(() => 0);
    const put = (tier: number, tint: number, x: number, y: number, z: number, rot: number): void => {
      const mesh = this.bags[tier];
      const n = counts[tier] ?? 0;
      if (!mesh || n >= MAX_BAG_INSTANCES) return;
      this.#compose(mesh, n, x, y, z, rot, 1, 1, 1);
      mesh.setColorAt(n, this.#c.set(bagColor(tier, tint)));
      counts[tier] = n + 1;
    };
    const carried = new Map(frame.carried.map((c) => [c.id, c]));
    const job = this.#store.job;
    const hook = this.#store.hookAt(frame.serverNow, CRANE.liftS);
    for (const b of this.#store.bags.values()) {
      const arc = this.#store.arcAt(b.id, frame.serverNow);
      if (arc) {
        const p = arcPoint(arc, frame.serverNow);
        put(b.tier, b.tint, p.x, p.y, p.z, b.rot);
      } else if (b.st === 1) {
        const c = carried.get(b.id);
        if (c) put(b.tier, b.tint, c.x, c.y, c.z, c.rotY);
      } else if (b.st === 2 && hook.carrying) {
        put(b.tier, b.tint, hook.x, frame.ground(hook.x, hook.z) + hook.lift * 2.5, hook.z, b.rot);
      } else if (b.st === 2 && job?.bag === b.id) {
        put(b.tier, b.tint, job.fx, frame.ground(job.fx, job.fz), job.fz, b.rot); // still at its source until the hook takes it
      } else put(b.tier, b.tint, b.x, b.y, b.z, b.rot);
    }
    const s = this.#store.cargoS(frame.serverNow);
    for (const c of this.#store.cargo.values()) {
      if (c.kind !== 1) continue;
      const row = this.#store.structures.get(c.node);
      const arc = this.#store.arcAt(c.id, frame.serverNow);
      if (!arc && (!row || row.type === T_HOPPER)) continue; // queued inside a hopper (the landmark has no row)
      const p = arc ? arcPoint(arc, frame.serverNow) : row ? pathPoint(row, s.get(c.id) ?? c.s, c.route, c.input) : null;
      if (p) put(c.sub, c.tint, p.x, p.y, p.z, row ? rotYOf(row.rot) : 0);
    }
    let total = 0;
    this.bags.forEach((mesh, tier) => {
      mesh.count = counts[tier] ?? 0;
      mesh.visible = mesh.count > 0;
      uploadInstances(mesh, mesh.count);
      total += mesh.count;
    });
    return total;
  }

  #drawLots(frame: LogisticsFrame): number {
    const s = this.#store.cargoS(frame.serverNow);
    let n = 0;
    for (const c of this.#store.cargo.values()) {
      if (c.kind !== 0 || n >= MAX_LOT_INSTANCES) continue;
      const row = this.#store.structures.get(c.node);
      if (!row || row.type === T_HOPPER) continue;
      const p = pathPoint(row, s.get(c.id) ?? c.s, c.route, c.input);
      const k = Math.cbrt(Math.max(0.5, c.kg) / 20);
      this.#compose(this.lots, n, p.x, p.y, p.z, 0, k, k, k);
      this.lots.setColorAt(n, this.#c.set(lotColor(c.sub)));
      n += 1;
    }
    this.lots.count = n;
    this.lots.visible = n > 0;
    uploadInstances(this.lots, n);
    return n;
  }

  #drawCrane(frame: LogisticsFrame): void {
    const hook = this.#store.hookAt(frame.serverNow, CRANE.liftS);
    const ground = frame.ground(hook.x, hook.z);
    const hookY = ground + 1.6 + hook.lift * 2.5;
    const top = ground + CRANE.legH - 0.3;
    this.craneRig.position.y = frame.ground((CRANE.area.x0 + CRANE.area.x1) / 2, (CRANE.area.z0 + CRANE.area.z1) / 2);
    this.#compose(this.hook, 0, hook.x, hookY, hook.z, 0, 0.4, 0.3, 0.4);
    this.#compose(this.hook, 1, hook.x, (hookY + top) / 2, hook.z, 0, 0.04, Math.max(0.05, top - hookY), 0.04);
    uploadInstances(this.hook, 2);
  }

  dispose(): void {
    for (const mesh of this.structures.values()) {
      if (mesh.geometry.getAttribute('aRun')) mesh.geometry.dispose(); // only the clones with aRun; AssetCache owns the originals
      mesh.dispose();
    }
    for (const mesh of [...this.bags, this.lots, this.hook, this.strobe]) mesh.dispose();
    this.arc.geometry.dispose();
    const ghostMaterial = this.ghost.material;
    if (ghostMaterial instanceof THREE.Material) ghostMaterial.dispose();
    this.root.removeFromParent();
  }
}

/** The fixed gantry rig (74): four legs at the area corners, two girders and the console. */
function craneRigGeometry(): THREE.BufferGeometry {
  const b = new PartsBuilder();
  const { x0, x1, z0, z1 } = CRANE.area;
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) b.cyl(CRANE.legR, CRANE.legR, CRANE.legH, 0xd6a21e, { x, z }, 8);
  b.box(x1 - x0 + 0.6, 0.5, 0.5, 0xd6a21e, { x: (x0 + x1) / 2, y: CRANE.legH, z: z0 }).box(x1 - x0 + 0.6, 0.5, 0.5, 0xd6a21e, { x: (x0 + x1) / 2, y: CRANE.legH, z: z1 });
  b.box(0.6, 1.1, 0.4, 0x4a4f57, { x: CRANE.console.x, y: 0.55, z: CRANE.console.z });
  return b.build();
}
