/**
 * YardProps.ts
 *
 * Detailed procedural scrap-yard props. Every builder returns plain geometry parts merged per material
 * (so a prop costs 1-3 draw calls) or an InstancedMesh set for repeated props (cars, drums).
 *
 * Coordinates and footprints match the old primitive props, so the colliders in ScrapYardMap still match
 * what is seen. Materials are passed in by the map (`mats`), geometry is created here.
 */

import * as THREE from 'three';
import { roundedBox, lathe, mergeParts, corrugatedPanel } from './GeometryKit.ts';
import type { MergePart } from './GeometryKit.ts';

type Point3 = readonly [number, number, number];
type LatheProfile = ReadonlyArray<readonly [number, number]>;

export interface CarGeometries {
  paint: THREE.BufferGeometry;
  trim: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  tyre: THREE.BufferGeometry;
  lamp: THREE.BufferGeometry;
}

/** The shared yard materials a car is drawn with. */
export interface CarMaterials {
  carPaint: THREE.MeshStandardMaterial;
  rust: THREE.Material;
  carGlass: THREE.Material;
  tyre: THREE.Material;
  lamp: THREE.Material;
}

/** One car instance: position, optional Euler rotation and scale, paint colour (0xRRGGBB). */
export interface CarPlacement {
  x: number;
  y: number;
  z: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  color: number;
}

export interface FenceRun {
  sx: number;
  sz: number;
  ex: number;
  ez: number;
}

/* ------------------------------ part helpers ------------------------------ */

export const P = {
  box: (w: number, h: number, d: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): MergePart => ({ geometry: new THREE.BoxGeometry(w, h, d), position: [x, y, z], rotation: [rx, ry, rz] }),
  rbox: (w: number, h: number, d: number, r: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 1): MergePart => ({ geometry: roundedBox(w, h, d, r, seg), position: [x, y, z], rotation: [rx, ry, rz] }),
  cyl: (rt: number, rb: number, h: number, seg: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): MergePart => ({ geometry: new THREE.CylinderGeometry(rt, rb, h, seg), position: [x, y, z], rotation: [rx, ry, rz] }),
  lathe: (profile: LatheProfile, seg: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): MergePart => ({ geometry: lathe(profile, seg), position: [x, y, z], rotation: [rx, ry, rz] }),
  torus: (R: number, r: number, rs: number, ts: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): MergePart => ({ geometry: new THREE.TorusGeometry(R, r, rs, ts), position: [x, y, z], rotation: [rx, ry, rz] }),
  sphere: (r: number, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0, seg = 10): MergePart => {
    const g = new THREE.SphereGeometry(r, seg, Math.max(5, seg - 3));
    g.scale(sx, sy, sz);
    return { geometry: g, position: [x, y, z], rotation: [0, 0, 0] };
  }
};

/** Cylinder between two points (tube/pipe helper). */
export function tube(a: Point3, b: Point3, r: number, seg = 6): MergePart {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const mid = va.clone().add(vb).multiplyScalar(0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  return { geometry: new THREE.CylinderGeometry(r, r, len, seg), position: [mid.x, mid.y, mid.z], rotation: [e.x, e.y, e.z] };
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Facet the surface and push vertices around: crushed sheet metal. */
function crumple(geo: THREE.BufferGeometry, amp: number, seed: number, minY = -1): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const rnd = mulberry(seed);
  const off: Point3 = [rnd() * 10, rnd() * 10, rnd() * 10];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (y < minY) continue;
    const n = Math.sin(x * 3.1 + off[0]) * Math.cos(z * 2.7 + off[1]) + Math.sin((x + z) * 4.3 + off[2]) * 0.5;
    pos.setY(i, y + n * amp * (y > 0.3 ? 1 : 0.3));
    pos.setX(i, x + Math.cos(z * 3.7 + off[1]) * amp * 0.3);
  }
  geo.computeVertexNormals();
  return geo;
}

/* --------------------------------- cars ---------------------------------- */

/**
 * Geometry kit for a crushed 1970s-80s eastern block car. Origin: body mid height; ground contact at
 * y = -0.45 (wheels), front toward +Z. variant 'sedan' (Trabant/Lada) or 'wagon' (Wartburg estate).
 * Returns { paint, trim, glass, tyre, lamp } geometries (one per material).
 */
export function createCarGeometries(variant: 'sedan' | 'wagon' = 'sedan', seed = 1): CarGeometries {
  const wagon = variant === 'wagon';
  const cabLen = wagon ? 2.3 : 1.75;
  const cabZ = wagon ? -0.55 : -0.1;
  const rnd = mulberry(seed * 977);

  const paint: MergePart[] = [
    P.rbox(1.96, 0.5, 3.7, 0.1, 0, 0.13, 0, 0, 0, 0, 1),
    P.rbox(1.88, 0.12, wagon ? 0.9 : 1.05, 0.04, 0, 0.4, 1.42, 0.1 + rnd() * 0.1, 0, 0), // hood
    ...(wagon ? [] : [P.rbox(1.88, 0.12, 0.85, 0.04, 0, 0.4, -1.45, -0.06 - rnd() * 0.12, 0, 0)]), // boot lid
    P.rbox(1.72, 0.5, cabLen, 0.12, 0, 0.62, cabZ, 0, 0, (rnd() - 0.5) * 0.12, 1), // cabin (tilted: crushed)
    P.rbox(1.58, 0.07, cabLen - 0.2, 0.03, 0, 0.9 - rnd() * 0.08, cabZ, (rnd() - 0.5) * 0.1, 0, (rnd() - 0.5) * 0.1), // roof dent
    P.box(0.05, 0.45, 0.06, 0.8, 0.64, cabZ + cabLen / 2 - 0.05, -0.5, 0, 0), // A pillars
    P.box(0.05, 0.45, 0.06, -0.8, 0.64, cabZ + cabLen / 2 - 0.05, -0.5, 0, 0),
    P.box(0.05, 0.45, 0.06, 0.8, 0.62, cabZ - cabLen / 2 + 0.05, 0.45, 0, 0), // C pillars
    P.box(0.05, 0.45, 0.06, -0.8, 0.62, cabZ - cabLen / 2 + 0.05, 0.45, 0, 0)
  ];
  const trim: MergePart[] = [
    P.rbox(2.12, 0.14, 0.16, 0.04, 0, -0.05, 1.88), // bumpers
    P.rbox(2.12, 0.14, 0.16, 0.04, 0, -0.05, -1.88),
    P.box(0.8, 0.14, 0.04, 0, 0.2, 1.86), // grille
    P.box(1.84, 0.1, 3.4, 0, -0.17, 0), // underside plate
    P.box(0.012, 0.42, 0.01, 0.985, 0.14, 0.15), // door shut lines
    P.box(0.012, 0.42, 0.01, -0.985, 0.14, 0.15),
    P.box(0.012, 0.42, 0.01, 0.985, 0.14, -0.75),
    P.box(0.012, 0.42, 0.01, -0.985, 0.14, -0.75),
    P.box(0.06, 0.03, 0.18, 1.0, 0.28, 0.0), // door handles
    P.box(0.06, 0.03, 0.18, -1.0, 0.28, 0.0),
    P.box(0.06, 0.03, 0.18, 1.0, 0.28, -0.9),
    P.box(0.06, 0.03, 0.18, -1.0, 0.28, -0.9),
    P.box(0.14, 0.1, 0.16, 1.05, 0.5, 0.6), // mirrors
    P.box(0.14, 0.1, 0.16, -1.05, 0.5, 0.6),
    P.cyl(0.03, 0.03, 0.9, 6, 0.5, -0.28, -1.5, Math.PI / 2, 0, 0), // exhaust
    P.box(0.3, 0.1, 0.03, 0, 0.12, -1.96), // number plate
    P.box(0.1, 0.1, 0.03, 0.78, 0.25, -1.87), // tail lights
    P.box(0.1, 0.1, 0.03, -0.78, 0.25, -1.87)
  ];
  // rims (trim material), wheel arches carved dark
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    trim.push(P.cyl(0.15, 0.15, 0.14, 10, sx * 0.97, -0.15, sz * 1.15, 0, 0, Math.PI / 2));
    trim.push(P.cyl(0.05, 0.05, 0.17, 6, sx * 0.97, -0.15, sz * 1.15, 0, 0, Math.PI / 2));
  }
  const tyre: MergePart[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    tyre.push(P.torus(0.2, 0.1, 5, 10, sx * 0.97, -0.15, sz * 1.15, 0, Math.PI / 2, 0));
    tyre.push(P.cyl(0.36, 0.36, 0.06, 12, sx * 0.9, -0.05, sz * 1.15, 0, 0, Math.PI / 2)); // dark wheel arch
  }
  const glass = [
    P.box(1.52, 0.4, 0.03, 0, 0.68, cabZ + cabLen / 2 + 0.07, -0.55, 0, 0), // windscreen
    P.box(1.52, 0.38, 0.03, 0, 0.68, cabZ - cabLen / 2 - 0.05, 0.5, 0, 0), // rear window
    P.box(0.03, 0.34, cabLen * 0.42, 0.875, 0.66, cabZ + cabLen * 0.22),
    P.box(0.03, 0.34, cabLen * 0.42, -0.875, 0.66, cabZ + cabLen * 0.22),
    P.box(0.03, 0.34, cabLen * 0.36, 0.875, 0.66, cabZ - cabLen * 0.24),
    P.box(0.03, 0.34, cabLen * 0.36, -0.875, 0.66, cabZ - cabLen * 0.24)
  ];
  const lamp = [
    P.cyl(0.1, 0.1, 0.06, 10, 0.65, 0.24, 1.86, Math.PI / 2, 0, 0),
    P.cyl(0.1, 0.1, 0.06, 10, -0.65, 0.24, 1.86, Math.PI / 2, 0, 0)
  ];

  const paintGeo = mergeParts(paint, { tile: 1.5 });
  crumple(paintGeo, 0.05, seed * 31, 0.28);
  return {
    paint: paintGeo,
    trim: mergeParts(trim, { tile: 1.2 }),
    glass: mergeParts(glass, { tile: 1.0 }),
    tyre: mergeParts(tyre, { tile: 1.0 }),
    lamp: mergeParts(lamp, { tile: 1.0 })
  };
}

/** One draw call per material for ALL cars of this variant: InstancedMesh with per-instance paint colour. */
export function createCarInstances(kit: CarGeometries, mats: CarMaterials, placements: readonly CarPlacement[], name = 'Cars'): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  if (!placements.length) return group;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  const keys: ReadonlyArray<readonly [keyof CarGeometries, THREE.Material, boolean]> = [['paint', mats.carPaint, true], ['trim', mats.rust, false], ['glass', mats.carGlass, false], ['tyre', mats.tyre, false], ['lamp', mats.lamp, false]];
  for (const [key, mat, colored] of keys) {
    const mesh = new THREE.InstancedMesh(kit[key], mat, placements.length);
    mesh.castShadow = key !== 'lamp' && key !== 'glass';
    mesh.receiveShadow = true;
    placements.forEach((pl, i) => {
      p.set(pl.x, pl.y, pl.z);
      e.set(pl.rx || 0, pl.ry || 0, pl.rz || 0);
      q.setFromEuler(e);
      s.set(pl.sx || 1, pl.sy || 1, pl.sz || 1);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      if (colored) mesh.setColorAt(i, c.setHex(pl.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (colored && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }
  return group;
}

/** Stand-alone car (used for the alarm car). */
export function createCarGroup(kit: CarGeometries, mats: CarMaterials, colorHex: number): THREE.Group {
  const g = new THREE.Group();
  const paint = mats.carPaint.clone();
  paint.color.setHex(colorHex);
  const list: ReadonlyArray<readonly [keyof CarGeometries, THREE.Material]> = [['paint', paint], ['trim', mats.rust], ['glass', mats.carGlass], ['tyre', mats.tyre], ['lamp', mats.lamp]];
  for (const [k, mat] of list) {
    const mesh = new THREE.Mesh(kit[k], mat);
    mesh.castShadow = k !== 'lamp' && k !== 'glass';
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}

/** Rear half of a car used as an openable trunk hiding spot. Local frame of the old 1.6 x 0.7 x 1.2 frame box. */
export function createTrunkRearGeometries(): Omit<CarGeometries, 'lamp'> {
  const paint = [
    P.rbox(1.6, 0.7, 1.2, 0.06, 0, 0, 0, 0, 0, 0, 1),
    P.rbox(1.6, 0.62, 0.14, 0.05, 0, 0.62, -0.58), // cabin back wall
    P.box(0.07, 0.62, 0.09, 0.78, 0.62, -0.5),
    P.box(0.07, 0.62, 0.09, -0.78, 0.62, -0.5)
  ];
  const trim = [
    P.rbox(1.72, 0.14, 0.14, 0.04, 0, -0.2, 0.68), // rear bumper
    P.box(0.34, 0.1, 0.03, 0, -0.02, 0.61), // plate
    P.box(0.12, 0.14, 0.04, 0.68, 0.18, 0.61), // tail lights
    P.box(0.12, 0.14, 0.04, -0.68, 0.18, 0.61),
    P.box(1.36, 0.04, 0.9, 0, 0.32, -0.05) // trunk cavity floor (dark, seen when open)
  ];
  const glass = [P.box(1.34, 0.36, 0.03, 0, 0.7, -0.505, 0.45, 0, 0)];
  const tyre = [
    P.cyl(0.3, 0.3, 0.06, 10, 0.8, -0.1, 0.1, 0, 0, Math.PI / 2),
    P.cyl(0.3, 0.3, 0.06, 10, -0.8, -0.1, 0.1, 0, 0, Math.PI / 2)
  ];
  return {
    paint: crumple(mergeParts(paint, { tile: 1.5 }), 0.012, 5, 0.3),
    trim: mergeParts(trim, { tile: 1.2 }),
    glass: mergeParts(glass, { tile: 1.0 }),
    tyre: mergeParts(tyre, { tile: 1.0 })
  };
}

export function createTrunkLidGeometries(): { paint: THREE.BufferGeometry; trim: THREE.BufferGeometry } {
  const paint = [P.rbox(1.5, 0.06, 0.95, 0.025, 0, 0, 0.45, 0, 0, 0), P.box(1.3, 0.025, 0.08, 0, 0.04, 0.45), P.box(1.3, 0.025, 0.08, 0, 0.04, 0.8)];
  const trim = [P.box(0.18, 0.04, 0.05, 0, 0.04, 0.9), P.box(0.05, 0.04, 0.12, 0.6, -0.04, 0.05), P.box(0.05, 0.04, 0.12, -0.6, -0.04, 0.05)];
  return { paint: mergeParts(paint, { tile: 1.5 }), trim: mergeParts(trim, { tile: 1 }) };
}

/* -------------------------------- lockers --------------------------------- */

export function createLockerGeometries(lW = 0.7, lH = 2.1, lL = 0.65): { body: THREE.BufferGeometry; doorPaint: THREE.BufferGeometry; doorTrim: THREE.BufferGeometry } {
  const body = [
    P.rbox(lW, lH - 0.1, lL, 0.012, 0, lH / 2 + 0.03, 0),
    ...([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([sx, sz]) => P.box(0.05, 0.06, 0.05, sx * (lW / 2 - 0.05), 0.03, sz * (lL / 2 - 0.05))),
    P.box(lW + 0.02, 0.03, lL + 0.02, 0, lH - 0.03, 0) // top cap
  ];
  const doorPaint = [P.rbox(lW, lH - 0.1, 0.04, 0.012, lW / 2, lH / 2 + 0.03, 0)];
  const doorTrim: MergePart[] = [];
  // louvre vents top and bottom
  for (let i = 0; i < 6; i++) {
    doorTrim.push(P.box(lW * 0.6, 0.012, 0.03, lW / 2, lH - 0.32 - i * 0.045, 0.012, 0.6));
    doorTrim.push(P.box(lW * 0.6, 0.012, 0.03, lW / 2, 0.14 + i * 0.045, 0.012, 0.6));
  }
  doorTrim.push(P.box(0.045, 0.16, 0.035, lW - 0.1, lH * 0.52, 0.035)); // handle plate
  doorTrim.push(P.cyl(0.012, 0.012, 0.1, 6, lW - 0.1, lH * 0.52, 0.065, Math.PI / 2, 0, 0));
  doorTrim.push(P.box(0.12, 0.07, 0.01, lW / 2, lH - 0.14, 0.022)); // number plate
  for (let i = 0; i < 3; i++) doorTrim.push(P.cyl(0.012, 0.012, 0.12, 6, 0.0, 0.3 + i * 0.75, 0.0)); // hinge knuckles
  return {
    body: mergeParts(body, { tile: 1.0 }),
    doorPaint: mergeParts(doorPaint, { tile: 1.0 }),
    doorTrim: mergeParts(doorTrim, { tile: 1.0 })
  };
}

/* --------------------------------- drums ---------------------------------- */

/** 200 L steel drum with rolling hoops, chimes and bungs. Origin at centre, 0.6 x 0.9. */
export function createDrumGeometry(): THREE.BufferGeometry {
  const profile: LatheProfile = [
    [0.0001, -0.45],
    [0.27, -0.45],
    [0.295, -0.435],
    [0.298, -0.4],
    [0.3, -0.3],
    [0.31, -0.28],
    [0.3, -0.26],
    [0.3, -0.04],
    [0.312, -0.02],
    [0.312, 0.02],
    [0.3, 0.04],
    [0.3, 0.26],
    [0.31, 0.28],
    [0.3, 0.3],
    [0.298, 0.4],
    [0.295, 0.435],
    [0.27, 0.45],
    [0.255, 0.43],
    [0.0001, 0.43]
  ];
  const parts = [
    P.lathe(profile, 20),
    P.cyl(0.035, 0.035, 0.025, 8, 0.12, 0.44, 0.08),
    P.cyl(0.02, 0.02, 0.02, 8, -0.1, 0.44, -0.12)
  ];
  return mergeParts(parts, { tile: 1.0 });
}

/* -------------------------------- fencing --------------------------------- */

/** Posts, bracket arms and barbed wire for a fence run: returns { steel, wire } geometries. */
export function createFenceHardware(runs: readonly FenceRun[], fenceH: number): { steel: THREE.BufferGeometry; wire: THREE.BufferGeometry } {
  const steel: MergePart[] = [];
  const wire: MergePart[] = [];
  for (const { sx, sz, ex, ez } of runs) {
    const len = Math.hypot(ex - sx, ez - sz);
    const ang = Math.atan2(ex - sx, ez - sz); // heading about Y
    const count = Math.max(2, Math.floor(len / 3.5));
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const x = sx + (ex - sx) * t;
      const z = sz + (ez - sz) * t;
      steel.push(P.box(0.1, fenceH + 0.5, 0.1, x, (fenceH + 0.5) / 2, z, 0, ang, 0)); // H post
      steel.push(P.box(0.05, 0.05, 0.45, x, fenceH + 0.3, z, 0.7, ang, 0)); // outward bracket arm
      steel.push(P.cyl(0.03, 0.03, 0.12, 6, x, 0.06, z)); // footing
    }
    // horizontal rails
    steel.push(tube([sx, fenceH - 0.12, sz], [ex, fenceH - 0.12, ez], 0.03));
    steel.push(tube([sx, 0.35, sz], [ex, 0.35, ez], 0.03));
    // two strands of barbed wire with barbs
    for (const h of [fenceH + 0.34, fenceH + 0.5]) {
      wire.push(tube([sx, h, sz], [ex, h, ez], 0.008, 4));
      const barbs = Math.floor(len / 0.9);
      for (let b = 0; b < barbs; b++) {
        const t = (b + 0.5) / barbs;
        const x = sx + (ex - sx) * t;
        const z = sz + (ez - sz) * t;
        wire.push(P.box(0.02, 0.07, 0.008, x, h, z, 0, ang, (b % 2) * 0.8));
        wire.push(P.box(0.07, 0.02, 0.008, x, h, z, 0, ang, 0.4 + (b % 3) * 0.3));
      }
    }
  }
  return { steel: mergeParts(steel, { tile: 1.5 }), wire: mergeParts(wire, { tile: 1.0 }) };
}

/** Gate wing in local space (hinge at origin, extends +X for `dir` = 1, -X for -1). */
export function createGateWingGeometries(wingW: number, gateH: number, dir = 1): THREE.BufferGeometry {
  const frame: MergePart[] = [
    P.box(wingW, 0.1, 0.08, dir * wingW / 2, gateH - 0.05, 0), // top rail
    P.box(wingW, 0.1, 0.08, dir * wingW / 2, 0.15, 0), // bottom rail
    P.box(wingW, 0.08, 0.08, dir * wingW / 2, gateH * 0.55, 0), // mid rail
    P.box(0.1, gateH, 0.08, dir * 0.05, gateH / 2, 0), // hinge stile
    P.box(0.1, gateH, 0.08, dir * (wingW - 0.05), gateH / 2, 0), // latch stile
    tube([dir * 0.1, 0.2, 0], [dir * (wingW - 0.1), gateH * 0.55, 0], 0.025), // diagonal brace
    P.box(0.12, 0.2, 0.12, dir * (wingW - 0.15), gateH * 0.5 - 0.1, 0.05) // latch box
  ];
  for (let x = 0.3; x < wingW - 0.15; x += 0.28) {
    frame.push(P.cyl(0.014, 0.014, gateH - 0.3, 6, dir * x, gateH / 2, 0));
    frame.push(P.cyl(0.02, 0.0, 0.1, 5, dir * x, gateH - 0.05 + 0.1, 0)); // spear tips
  }
  return mergeParts(frame, { tile: 1.5 });
}

/* ---------------------------------- misc ---------------------------------- */

export function createSteelBeam(len: number, h = 0.5, w = 0.25, tw = 0.03, tf = 0.04): MergePart[] {
  return [
    P.box(tw, h - 2 * tf, len, 0, 0, 0),
    P.box(w, tf, len, 0, h / 2 - tf / 2, 0),
    P.box(w, tf, len, 0, -h / 2 + tf / 2, 0)
  ];
}

export function createCorrugatedWall(width: number, height: number, ridgeW = 0.22): THREE.PlaneGeometry {
  return corrugatedPanel(width, height, ridgeW, 0.04);
}
