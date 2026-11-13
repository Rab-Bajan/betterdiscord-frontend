// Épület- és kelléktípusonkénti procedurális modellek (Miskolc-karikatúrák): alkatrészlisták, amelyekből
// típus × alkatrész × LOD-szint szerint egy-egy InstancedMesh lesz. A "scaled" alkatrész egységkockában
// (x, z ∈ [-0,5; 0,5], y ∈ [0; 1]) épül és a példány w × h × d méretére nyúlik; a fix alkatrész méterben
// épül és a `places` szerinti helyekre kerül (a kellékeknél egyenletes `s` méretaránnyal).
import * as THREE from 'three';
import { PartsBuilder, rng } from './geometryKit';
import type { BuildingKind, PropKind } from '../../worldTypes';

export type MaterialId = 'lit' | 'rust' | 'panel' | 'glow' | 'led';

export interface Dims {
  readonly w: number;
  readonly d: number;
  readonly h: number;
}

export interface LocalPlace {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotY: number;
  readonly s: number;
}

export interface PartSpec {
  readonly id: string;
  readonly material: MaterialId;
  readonly scaled: boolean;
  readonly castShadow: boolean;
  /** Built once and cached under `arch.<kind>.<id>`. */
  readonly geometry: () => THREE.BufferGeometry;
  /** Fixed parts only: where to put copies on one instance (seed is stable per instance). */
  readonly places?: (dims: Dims, seed: number) => readonly LocalPlace[];
}

export interface Archetype {
  readonly parts: readonly PartSpec[];
  /** Part ids that are also drawn in the mid tier (25–70 m). */
  readonly mid: readonly string[];
  /** Drawn as a coloured impostor box beyond 70 m. */
  readonly far: boolean;
  readonly farColor: number;
  /** Size at scale 1 (props) used for the impostor and the culling sphere. */
  readonly nominal: Dims;
}

const C = {
  concrete: 0xb9b2a6,
  darkConcrete: 0x8c867c,
  rust: 0x8a4b2a,
  steel: 0x6f747a,
  darkSteel: 0x3b3f44,
  yellow: 0xf4c20d,
  blue: 0x2b62c9,
  wood: 0x7a5230,
  darkWood: 0x4e3420,
  green: 0x2f7a3a,
  darkGreen: 0x245a2b,
  red: 0xc23b2b,
  white: 0xeeeeea,
  black: 0x18181a,
  brick: 0x9c4a32,
  glass: 0x24323c,
  sodium: 0xff9900,
  sand: 0xd8c27a
} as const;

const one: LocalPlace = { x: 0, y: 0, z: 0, rotY: 0, s: 1 };
const origin = (): readonly LocalPlace[] => [one];

const scaled = (id: string, material: MaterialId, build: (b: PartsBuilder) => PartsBuilder, castShadow = true): PartSpec => ({
  id,
  material,
  scaled: true,
  castShadow,
  geometry: () => build(new PartsBuilder()).build()
});

const fixed = (
  id: string,
  material: MaterialId,
  build: (b: PartsBuilder) => PartsBuilder,
  places: (dims: Dims, seed: number) => readonly LocalPlace[] = origin,
  castShadow = true
): PartSpec => ({ id, material, scaled: false, castShadow, places, geometry: () => build(new PartsBuilder()).build() });

// ---------------------------------------------------------------- buildings

const panel10: Archetype = {
  nominal: { w: 36, d: 12, h: 28 },
  far: true,
  farColor: 0xa8a196,
  mid: ['shell', 'trim'],
  parts: [
    scaled('shell', 'panel', (b) => b.box(1, 1, 1, C.concrete, { y: 0.5 })),
    scaled('trim', 'lit', (b) => {
      b.box(1.015, 0.012, 1.03, C.darkConcrete, { y: 0.994 });
      b.box(0.1, 0.05, 0.4, C.darkConcrete, { y: 1.02, x: -0.2 });
      b.box(0.1, 0.05, 0.4, C.darkConcrete, { y: 1.02, x: 0.25 });
      for (const x of [-0.33, 0, 0.33]) {
        b.box(0.07, 0.008, 0.12, C.darkConcrete, { x, y: 0.1, z: 0.55 }); // entrance canopy
        b.box(0.035, 0.1, 0.01, 0x5a3b22, { x, y: 0.05, z: 0.502 }); // door
        b.box(0.03, 0.86, 0.012, 0x9d968a, { x: x + 0.06, y: 0.55, z: 0.503 }); // stair-tower glass strip
      }
      for (let floor = 1; floor < 10; floor++) {
        for (const x of [-0.2, 0.17]) {
          b.box(0.09, 0.006, 0.1, C.darkConcrete, { x, y: floor / 10, z: 0.55 }); // balcony slab
          b.box(0.09, 0.035, 0.006, 0x8f9a8a, { x, y: floor / 10 + 0.018, z: 0.6 }); // parapet
        }
      }
      return b;
    }),
    fixed('dishes', 'lit', (b) =>
      b.add(new THREE.SphereGeometry(0.45, 10, 6, 0, Math.PI * 2, 0, 0.85), 0xd9d9d4, { rx: Math.PI / 2, z: 0.25 })
        .box(0.05, 0.05, 0.5, C.darkSteel, { z: 0.0 })
        .box(0.06, 0.06, 0.06, C.darkSteel, { z: 0.6 }),
    (dims, seed) => {
      const r = rng(seed);
      const floors = Math.max(1, Math.floor(dims.h / 2.8) - 1);
      return Array.from({ length: 4 + Math.floor(r() * 4) }, () => {
        const front = r() > 0.4;
        return { x: (r() - 0.5) * (dims.w - 4), y: 2.8 * (1 + Math.floor(r() * floors)) + 1.6, z: front ? dims.d / 2 + 0.05 : -dims.d / 2 - 0.05, rotY: front ? 0 : Math.PI, s: 1 };
      });
    }),
    fixed('laundry', 'lit', (b) => {
      b.box(1.6, 0.02, 0.02, 0xdddddd, { y: 0.55 });
      const colors = [0xe94b64, 0xf2f2f2, 0x536cff, 0xf5a623, 0x28c997];
      for (let i = 0; i < 5; i++) b.box(0.26, 0.45 + (i % 2) * 0.15, 0.02, colors[i] ?? C.white, { x: -0.6 + i * 0.3, y: 0.3 - (i % 2) * 0.07 });
      return b;
    }, (dims, seed) => {
      const r = rng(seed + 0.5);
      return Array.from({ length: 3 + Math.floor(r() * 4) }, () => {
        const col = r() > 0.5 ? 0.17 : -0.2;
        const floor = 1 + Math.floor(r() * 8);
        return { x: col * dims.w, y: (floor / 10) * dims.h + 1.1, z: dims.d * 0.6 - 0.15, rotY: 0, s: 1 };
      });
    }, false)
  ]
};

const kukatarolo: Archetype = {
  nominal: { w: 4, d: 2, h: 2 },
  far: false,
  farColor: 0x8c867c,
  mid: ['shell'],
  parts: [scaled('shell', 'lit', (b) => {
    b.box(1, 0.85, 0.08, C.darkConcrete, { y: 0.425, z: -0.46 });
    b.box(0.06, 0.85, 1, C.darkConcrete, { y: 0.425, x: -0.47 });
    b.box(0.06, 0.85, 1, C.darkConcrete, { y: 0.425, x: 0.47 });
    b.box(1.06, 0.07, 1.08, 0x6d6a64, { y: 0.9 });
    for (const x of [-0.28, 0, 0.28]) b.box(0.22, 0.6, 0.55, x === 0 ? 0x3f5d4a : 0x2c6b3d, { x, y: 0.3, z: 0.05 });
    return b;
  })]
};

const playground: Archetype = {
  nominal: { w: 12, d: 12, h: 3 },
  far: false,
  farColor: 0xd8c27a,
  mid: ['shell'],
  parts: [scaled('shell', 'lit', (b) => {
    b.box(1, 0.02, 1, C.sand, { y: 0.01 });
    b.box(0.14, 0.45, 0.14, C.red, { x: -0.25, y: 0.225 });
    b.box(0.09, 0.02, 0.42, C.yellow, { x: -0.25, y: 0.22, z: 0.24, rx: 0.55 });
    for (const z of [-0.32, -0.08]) {
      b.box(0.015, 0.8, 0.015, C.blue, { x: 0.12, y: 0.4, z, rz: 0.12 });
      b.box(0.015, 0.8, 0.015, C.blue, { x: 0.38, y: 0.4, z, rz: -0.12 });
    }
    b.box(0.3, 0.02, 0.27, C.blue, { x: 0.25, y: 0.8, z: -0.2 }); // swing top bar
    for (const x of [0.18, 0.32]) b.box(0.06, 0.02, 0.04, C.red, { x, y: 0.2, z: -0.2 });
    b.box(0.3, 0.1, 0.3, C.wood, { x: 0.2, y: 0.05, z: 0.28 }); // sandbox frame
    return b;
  })]
};

const awningStrips = (b: PartsBuilder, n: number, a: number, c: number, y: number): PartsBuilder => {
  for (let i = 0; i < n; i++) b.box(1 / n, 0.012, 0.75, i % 2 === 0 ? a : c, { x: -0.5 + (i + 0.5) / n, y, z: 0.12, rx: 0.2 });
  return b;
};

const marketShell = (b: PartsBuilder, posts: number): PartsBuilder => {
  b.box(1, 0.3, 0.38, 0x8b6a45, { y: 0.15, z: 0.1 });
  b.box(1, 0.82, 0.03, 0x7f858c, { y: 0.41, z: -0.48 });
  for (let i = 0; i <= posts; i++) {
    const x = -0.5 + i / posts;
    b.box(0.012, 0.86, 0.012, C.steel, { x, y: 0.43, z: 0.45 });
  }
  b.box(1, 0.08, 0.3, 0xa0784e, { y: 0.34, z: 0.1 }); // produce crates
  return b;
};

const marketRow: Archetype = {
  nominal: { w: 20, d: 4, h: 3.2 },
  far: true,
  farColor: 0xb0473a,
  mid: ['shell', 'awning'],
  parts: [
    scaled('shell', 'lit', (b) => marketShell(b, 6)),
    scaled('awning', 'lit', (b) => awningStrips(b, 14, 0xd2352b, 0xf1efe8, 0.86), false)
  ]
};

const marketStall: Archetype = {
  nominal: { w: 3, d: 2.5, h: 2.6 },
  far: false,
  farColor: 0x2f7a3a,
  mid: ['shell', 'awning'],
  parts: [
    scaled('shell', 'lit', (b) => marketShell(b, 1)),
    scaled('awning', 'lit', (b) => awningStrips(b, 6, 0x2f8a46, 0xf1efe8, 0.86), false)
  ]
};

const factoryHall: Archetype = {
  nominal: { w: 40, d: 24, h: 14 },
  far: true,
  farColor: 0x7b5a46,
  mid: ['shell'],
  parts: [
    scaled('shell', 'rust', (b) => {
      b.box(1, 0.72, 1, 0x7b6a58, { y: 0.36 });
      for (let i = 0; i < 5; i++) {
        b.box(0.2, 0.3, 1, 0x6a5446, { x: -0.4 + i * 0.2, y: 0.78, rz: 0.55 });
        b.box(0.012, 0.2, 1, 0x2a3a44, { x: -0.33 + i * 0.2, y: 0.82 }); // north-light glazing
      }
      return b;
    }),
    scaled('trim', 'lit', (b) => {
      b.box(1.004, 0.07, 1.004, C.glass, { y: 0.55 });
      b.box(0.18, 0.42, 0.01, 0x56664a, { x: -0.2, y: 0.21, z: 0.502 });
      b.box(0.18, 0.42, 0.01, 0x56664a, { x: 0.2, y: 0.21, z: 0.502 });
      b.box(0.012, 0.06, 1.01, C.yellow, { x: -0.505, y: 0.05 });
      return b;
    })
  ]
};

const chimney: Archetype = {
  nominal: { w: 3, d: 3, h: 45 },
  far: true,
  farColor: 0x9c4a32,
  mid: ['shell'],
  parts: [scaled('shell', 'lit', (b) => {
    const bands = 10;
    for (let i = 0; i < bands; i++) {
      const y0 = i / bands;
      const r0 = 0.5 - 0.14 * y0;
      const r1 = 0.5 - 0.14 * (y0 + 1 / bands);
      const color = i >= 7 ? (i % 2 === 0 ? C.red : C.white) : C.brick;
      b.cyl(r1, r0, 1 / bands, color, { y: y0 }, 14);
    }
    b.cyl(0.4, 0.4, 0.02, C.black, { y: 1 }, 14);
    return b;
  })]
};

const gantryCrane: Archetype = {
  nominal: { w: 30, d: 10, h: 18 },
  far: true,
  farColor: 0xc9a227,
  mid: ['shell'],
  parts: [scaled('shell', 'rust', (b) => {
    for (const x of [-0.47, 0.47]) for (const z of [-0.4, 0.4]) b.box(0.035, 1, 0.06, 0xd2a21a, { x, y: 0.5, z });
    for (const z of [-0.4, 0.4]) b.box(1, 0.06, 0.07, 0xd2a21a, { y: 0.96, z });
    for (const x of [-0.47, 0.47]) b.box(0.04, 0.06, 0.86, 0xd2a21a, { x, y: 0.96 });
    b.box(0.08, 0.08, 0.92, 0x8a7a40, { x: 0.12, y: 0.9 });
    b.box(0.006, 0.42, 0.012, C.darkSteel, { x: 0.12, y: 0.66 });
    b.box(0.04, 0.03, 0.08, C.darkSteel, { x: 0.12, y: 0.45 });
    for (const x of [-0.47, 0.47]) b.box(0.06, 0.03, 0.9, C.darkSteel, { x, y: 0.015 }); // rail bogies
    return b;
  })]
};

const oreWagon: Archetype = {
  nominal: { w: 10, d: 3, h: 3 },
  far: true,
  farColor: 0x5a3a2a,
  mid: ['shell'],
  parts: [scaled('shell', 'rust', (b) => {
    b.box(1, 0.5, 0.95, 0x5a3a2a, { y: 0.62 });
    b.box(0.9, 0.2, 0.7, 0x4a3022, { y: 0.32 });
    b.box(1.04, 0.07, 0.6, C.darkSteel, { y: 0.24 });
    for (const x of [-0.36, -0.24, 0.24, 0.36]) for (const z of [-0.3, 0.3]) b.cyl(0.12, 0.12, 0.05, C.black, { x, y: 0.12, z: z - 0.025, rx: Math.PI / 2 }, 10);
    b.add(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x3b3530, { y: 0.84, sx: 0.95, sy: 0.25, sz: 0.85 });
    return b;
  })]
};

const busShelter: Archetype = {
  nominal: { w: 4, d: 1.6, h: 2.6 },
  far: false,
  farColor: 0xf4c20d,
  mid: ['shell'],
  parts: [scaled('shell', 'lit', (b) => {
    for (const x of [-0.48, 0.48]) for (const z of [-0.45, 0.45]) b.box(0.025, 0.95, 0.05, C.yellow, { x, y: 0.475, z });
    b.box(1.06, 0.06, 1.12, C.yellow, { y: 0.97 });
    b.box(0.96, 0.7, 0.02, 0x5d7a8c, { y: 0.5, z: -0.47 });
    b.box(0.02, 0.7, 0.85, 0x5d7a8c, { x: -0.48, y: 0.5 });
    b.box(0.78, 0.04, 0.28, C.blue, { y: 0.18, z: -0.25 });
    for (const x of [-0.3, 0.3]) b.box(0.03, 0.17, 0.2, C.darkSteel, { x, y: 0.085, z: -0.25 });
    b.box(0.16, 0.26, 0.02, C.white, { x: 0.44, y: 0.6, z: 0.42 }); // timetable
    b.box(0.3, 0.1, 0.03, 0x1d4fa0, { x: 0.25, y: 1.06, z: 0.5 }); // stop sign "MVK"
    return b;
  })]
};

const busPlatform: Archetype = {
  nominal: { w: 14, d: 3, h: 0.2 },
  far: false,
  farColor: 0xa8a49b,
  mid: ['shell'],
  parts: [scaled('shell', 'lit', (b) => b.box(1, 1, 1, 0xa8a49b, { y: 0.5 }).box(1, 1.02, 0.05, C.yellow, { y: 0.51, z: 0.48 }), false)]
};

const ticketKiosk: Archetype = {
  nominal: { w: 2.5, d: 2.5, h: 2.8 },
  far: false,
  farColor: 0x2c5aa0,
  mid: ['shell'],
  parts: [scaled('shell', 'lit', (b) =>
    b.box(1, 0.85, 1, 0x2c5aa0, { y: 0.425 })
      .box(1.12, 0.07, 1.12, C.white, { y: 0.885 })
      .box(0.72, 0.3, 1.01, C.glass, { y: 0.55 })
      .box(0.6, 0.08, 1.02, C.yellow, { y: 0.97 })
      .box(0.3, 0.04, 0.2, 0x8b6a45, { y: 0.42, z: 0.58 }))]
};

const subwayStairs: Archetype = {
  nominal: { w: 4, d: 8, h: 1.2 },
  far: false,
  farColor: 0x8c867c,
  mid: ['shell'],
  parts: [scaled('shell', 'lit', (b) => {
    for (const x of [-0.46, 0.46]) {
      b.box(0.08, 0.85, 1, C.darkConcrete, { x, y: 0.425 });
      for (let i = 0; i < 8; i++) b.box(0.085, 0.14, 0.125, i % 2 === 0 ? C.yellow : C.black, { x, y: 0.9, z: -0.4375 + i * 0.125 });
    }
    b.box(1, 0.85, 0.06, C.darkConcrete, { y: 0.425, z: -0.47 });
    b.box(0.84, 0.01, 0.94, 0x0c0c10, { y: 0.01 }); // the descent
    for (let i = 0; i < 6; i++) b.box(0.84, 0.03, 0.08, 0x77736b, { y: 0.015, z: 0.42 - i * 0.12 });
    b.box(0.02, 1.6, 0.02, C.darkSteel, { x: 0.5, y: 0.8, z: 0.5 });
    b.box(0.22, 0.3, 0.05, 0x1d4fa0, { x: 0.5, y: 1.75, z: 0.5 }); // blue "M" sign
    return b;
  })]
};

const wineCellar: Archetype = {
  nominal: { w: 6, d: 8, h: 4 },
  far: true,
  farColor: 0x5d6b35,
  mid: ['shell'],
  parts: [scaled('shell', 'lit', (b) =>
    b.add(new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x5d6b35, { sx: 1.15, sy: 2, sz: 1.05, z: -0.05 })
      .box(0.8, 0.72, 0.08, 0xcfc4a8, { y: 0.36, z: 0.48 })
      .cyl(0.2, 0.2, 0.06, 0x4a2e1a, { y: 0.36, z: 0.52, rx: Math.PI / 2 }, 12)
      .box(0.4, 0.36, 0.06, 0x4a2e1a, { y: 0.18, z: 0.49 })
      .box(0.9, 0.06, 0.12, 0xa89a7a, { y: 0.74, z: 0.48 })
      .cyl(0.04, 0.04, 0.3, C.brick, { x: 0.3, y: 0.75, z: 0.1 }, 6))]
};

const tvTower: Archetype = {
  nominal: { w: 6, d: 6, h: 70 },
  far: true,
  farColor: 0xd9d6cf,
  mid: ['shell'],
  parts: [
    scaled('shell', 'lit', (b) => {
      b.cyl(0.18, 0.32, 0.6, 0xd9d6cf, {}, 12);
      b.cyl(0.5, 0.35, 0.05, C.white, { y: 0.6 }, 16);
      b.cyl(0.5, 0.5, 0.03, C.glass, { y: 0.65 }, 16);
      b.cyl(0.35, 0.5, 0.03, C.white, { y: 0.68 }, 16);
      b.cyl(0.14, 0.18, 0.1, 0xd9d6cf, { y: 0.71 }, 10);
      for (let i = 0; i < 5; i++) b.cyl(0.05, 0.06, 0.04, i % 2 === 0 ? C.red : C.white, { y: 0.81 + i * 0.038 }, 6);
      return b;
    }),
    fixed('beacon', 'glow', (b) => b.sphere(0.5, 0xff2a2a), (dims) => [{ x: 0, y: dims.h, z: 0, rotY: 0, s: 1 }], false)
  ]
};

const lookout: Archetype = {
  nominal: { w: 5, d: 5, h: 12 },
  far: true,
  farColor: 0x7a5230,
  mid: ['shell'],
  parts: [scaled('shell', 'lit', (b) => {
    for (const x of [-0.4, 0.4]) for (const z of [-0.4, 0.4]) b.box(0.06, 0.8, 0.06, C.wood, { x: x * 0.85, y: 0.4, z: z * 0.85, rx: z * 0.08, rz: -x * 0.08 });
    for (const y of [0.25, 0.5]) b.box(0.75, 0.02, 0.75, C.darkWood, { y });
    b.box(1, 0.03, 1, C.wood, { y: 0.8 });
    for (const [x, z, w, d] of [[0, 0.5, 1, 0.02], [0, -0.5, 1, 0.02], [0.5, 0, 0.02, 1], [-0.5, 0, 0.02, 1]] as const) b.box(w, 0.08, d, C.darkWood, { x, y: 0.86, z });
    b.add(new THREE.ConeGeometry(0.75, 0.14, 4), 0x5a3b22, { y: 0.98, ry: Math.PI / 4 });
    for (const x of [-0.45, 0.45]) for (const z of [-0.45, 0.45]) b.box(0.03, 0.12, 0.03, C.darkWood, { x, y: 0.88, z });
    return b;
  })]
};

const scrapFence: Archetype = {
  nominal: { w: 20, d: 0.2, h: 2.2 },
  far: true,
  farColor: 0x7a4a2c,
  mid: ['shell'],
  parts: [scaled('shell', 'rust', (b) => {
    const panels = 8;
    const shades = [0x8a4b2a, 0x6d5a48, 0x7f6b55, 0x93593a];
    for (let i = 0; i < panels; i++) {
      b.box(1 / panels + 0.01, 0.92 + (i % 3) * 0.04, 0.4, shades[i % shades.length] ?? C.rust, { x: -0.5 + (i + 0.5) / panels, y: 0.46 + (i % 3) * 0.02, z: (i % 2) * 0.3 - 0.15, ry: (i % 2 === 0 ? 1 : -1) * 0.01 });
    }
    for (let i = 0; i <= panels; i += 2) b.box(0.01, 1, 0.8, C.darkSteel, { x: -0.5 + i / panels, y: 0.5 });
    return b;
  })]
};

const officeContainer: Archetype = {
  nominal: { w: 6, d: 2.5, h: 2.6 },
  far: true,
  farColor: 0x2f6e4a,
  mid: ['shell', 'roof'],
  parts: [
    scaled('shell', 'rust', (b) => b.box(1, 0.9, 1, 0x2f6e4a, { y: 0.45 })),
    scaled('roof', 'lit', (b) =>
      b.box(1.1, 0.04, 1.2, 0x9aa3ab, { y: 0.93, rx: 0.06 })
        .box(0.15, 0.75, 0.01, 0x3a3f42, { x: 0.3, y: 0.375, z: 0.502 })
        .box(0.25, 0.28, 0.01, C.glass, { x: -0.2, y: 0.55, z: 0.502 })
        .box(0.46, 0.14, 0.02, 0x1f6f4a, { x: -0.2, y: 0.82, z: 0.515 })
        .box(0.4, 0.06, 0.025, C.white, { x: -0.2, y: 0.82, z: 0.52 }) // "MÉH" lettering band
        .box(0.012, 0.25, 0.012, C.darkSteel, { x: -0.45, y: 1.05, z: 0.45 })
        .box(0.012, 0.25, 0.012, C.darkSteel, { x: 0.45, y: 1.05, z: 0.45 })),
    fixed('floods', 'glow', (b) => b.box(0.5, 0.3, 0.28, C.sodium, { rx: -0.4 }), (dims) => [
      { x: -0.45 * dims.w, y: dims.h * 1.18 + 0.2, z: dims.d * 0.45, rotY: 0, s: 1 },
      { x: 0.45 * dims.w, y: dims.h * 1.18 + 0.2, z: dims.d * 0.45, rotY: 0, s: 1 }
    ], false)
  ]
};

const weighbridge: Archetype = {
  nominal: { w: 12, d: 3.5, h: 0.4 },
  far: false,
  farColor: 0x5e6368,
  mid: ['shell'],
  parts: [scaled('shell', 'lit', (b) => {
    b.box(1, 0.6, 1, 0x5e6368, { y: 0.3 });
    for (let i = 0; i < 12; i++) b.box(0.002, 0.61, 0.98, 0x4a4e52, { x: -0.46 + i * 0.084, y: 0.3 });
    for (const z of [-0.5, 0.5]) {
      b.box(0.96, 1.6, 0.03, C.yellow, { y: 1.4, z });
      for (const x of [-0.46, 0.46]) b.box(0.012, 2.4, 0.04, C.black, { x, y: 1.2, z });
    }
    for (const s of [-1, 1]) b.box(0.08, 0.5, 1, C.darkConcrete, { x: s * 0.54, y: 0.12, rz: s * 0.35 });
    return b;
  }, false)]
};

const hopper: Archetype = {
  nominal: { w: 4, d: 4, h: 5 },
  far: true,
  farColor: 0x6b5a4a,
  mid: ['shell'],
  parts: [scaled('shell', 'rust', (b) => {
    b.cyl(0.7, 0.18, 0.5, 0x6b5a4a, { y: 0.45, ry: Math.PI / 4 }, 4);
    b.box(1, 0.06, 1, C.darkSteel, { y: 0.97 });
    for (const x of [-0.42, 0.42]) for (const z of [-0.42, 0.42]) b.box(0.05, 0.5, 0.05, C.darkSteel, { x, y: 0.25, z });
    b.box(0.2, 0.18, 0.2, 0x5a4a3a, { y: 0.36 });
    b.box(0.9, 0.012, 0.012, C.yellow, { y: 0.98, z: 0.5 });
    return b;
  })]
};

const ledDisplay: Archetype = {
  nominal: { w: 3, d: 0.3, h: 3 },
  far: false,
  farColor: 0x222222,
  mid: ['frame', 'face'],
  parts: [
    scaled('frame', 'lit', (b) => b.box(0.08, 0.62, 0.6, C.darkSteel, { y: 0.31 }).box(1, 0.4, 1, 0x1e1f22, { y: 0.8 })),
    scaled('face', 'led', (b) => b.add(new THREE.PlaneGeometry(0.92, 0.32), 0xffffff, { y: 0.8, z: 0.505 }), false)
  ]
};

const generator: Archetype = {
  nominal: { w: 3, d: 1.5, h: 2 },
  far: false,
  farColor: 0x3d6b3a,
  mid: ['shell'],
  parts: [scaled('shell', 'lit', (b) => {
    b.box(1.04, 0.08, 1.06, C.darkSteel, { y: 0.04 });
    b.box(1, 0.75, 1, 0x3d6b3a, { y: 0.45 });
    for (let i = 0; i < 6; i++) b.box(0.04, 0.4, 1.01, 0x24402a, { x: -0.35 + i * 0.07, y: 0.5 });
    b.cyl(0.05, 0.05, 0.35, C.darkSteel, { x: 0.35, y: 0.82 }, 8);
    b.box(0.2, 0.12, 0.01, C.yellow, { x: 0.25, y: 0.6, z: 0.505 });
    return b;
  })]
};

const sortingShed: Archetype = {
  nominal: { w: 12, d: 8, h: 5 },
  far: true,
  farColor: 0x7e8790,
  mid: ['shell'],
  parts: [scaled('shell', 'rust', (b) => {
    for (const x of [-0.48, 0, 0.48]) for (const z of [-0.46, 0.46]) b.box(0.025, 0.95, 0.035, C.darkSteel, { x, y: 0.475, z });
    b.box(1.06, 0.04, 1.1, 0x7e8790, { y: 0.97, rx: 0.05 });
    b.box(0.8, 0.18, 0.22, 0x2f5a3a, { y: 0.17 });
    for (const x of [-0.3, 0, 0.3]) b.box(0.12, 0.16, 0.12, [0x2b62c9, C.yellow, C.red][Math.round(x / 0.3) + 1] ?? C.red, { x, y: 0.08, z: 0.3 });
    return b;
  })]
};

const scrapPile: Archetype = {
  nominal: { w: 6, d: 6, h: 2.5 },
  far: true,
  farColor: 0x6a4a36,
  mid: ['shell'],
  parts: [scaled('shell', 'rust', (b) => {
    const r = rng(0.4242);
    const shades = [0x8a4b2a, 0x5e6368, 0x6d5a48, 0x3b3f44, 0x93593a];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const rad = i === 0 ? 0 : 0.18 + r() * 0.12;
      b.add(new THREE.IcosahedronGeometry(0.32 - rad * 0.4, 0), shades[i % shades.length] ?? C.rust, {
        x: Math.cos(a) * rad, z: Math.sin(a) * rad, y: 0.25 - rad * 0.5, sy: 1.5 - rad * 2, rx: r() * 3, ry: r() * 3
      });
    }
    for (let i = 0; i < 3; i++) b.box(0.7, 0.03, 0.04, C.darkSteel, { y: 0.4 + i * 0.1, ry: i * 1.1, rz: 0.3 - i * 0.2 });
    return b;
  })]
};

// ---------------------------------------------------------------- props (metres, scale 1)

const lampPole = (b: PartsBuilder, h: number, color: number): PartsBuilder =>
  b.cyl(0.07, 0.12, h, color, {}, 8).box(0.06, 0.06, 1.4, color, { y: h, z: 0.65 });

const hexLamp: Archetype = {
  nominal: { w: 0.6, d: 0.6, h: 8 },
  far: true,
  farColor: 0x4b5a4f,
  mid: ['pole', 'head'],
  parts: [
    fixed('pole', 'lit', (b) => lampPole(b, 7, 0x4b5a4f).box(0.5, 0.3, 0.5, C.darkSteel, { y: 7.25 }).cyl(0.04, 0.04, 0.35, C.darkSteel, { y: 7.4 }, 6)),
    fixed('head', 'glow', (b) => b.box(0.32, 0.12, 0.6, C.sodium, { y: 6.92, z: 1.25 }), origin, false)
  ]
};

const streetLamp: Archetype = {
  nominal: { w: 0.4, d: 1.6, h: 6.2 },
  far: false,
  farColor: 0x4b5a4f,
  mid: ['pole', 'head'],
  parts: [
    fixed('pole', 'lit', (b) => lampPole(b, 6, 0x56635a)),
    fixed('head', 'glow', (b) => b.box(0.3, 0.12, 0.55, C.sodium, { y: 5.92, z: 1.25 }), origin, false)
  ]
};

const bench: Archetype = {
  nominal: { w: 1.9, d: 0.6, h: 0.9 },
  far: false,
  farColor: C.blue,
  mid: ['body'],
  parts: [fixed('body', 'lit', (b) => {
    for (const z of [-0.1, 0.05, 0.2]) b.box(1.8, 0.05, 0.12, C.blue, { y: 0.45, z });
    for (const y of [0.65, 0.82]) b.box(1.8, 0.1, 0.04, C.blue, { y, z: -0.22, rx: -0.15 });
    for (const x of [-0.75, 0.75]) b.box(0.12, 0.45, 0.5, 0x8f8a82, { x, y: 0.225 });
    return b;
  })]
};

const tree: Archetype = {
  nominal: { w: 3, d: 3, h: 5.4 },
  far: true,
  farColor: 0x2f5a2b,
  mid: ['body'],
  parts: [fixed('body', 'lit', (b) =>
    b.cyl(0.14, 0.22, 2.4, 0x5a4030, {}, 7)
      .add(new THREE.IcosahedronGeometry(1.4, 1), 0x356b2e, { y: 3.1, sy: 0.9 })
      .add(new THREE.IcosahedronGeometry(1.1, 1), 0x2c5a26, { y: 4.1, x: 0.3, sy: 0.85 })
      .add(new THREE.IcosahedronGeometry(0.9, 1), 0x417a34, { y: 3.4, x: -0.7, z: 0.4 }))]
};

const bin: Archetype = {
  nominal: { w: 0.6, d: 0.6, h: 1 },
  far: false,
  farColor: 0x3f5d4a,
  mid: ['body'],
  parts: [fixed('body', 'lit', (b) => b.cyl(0.3, 0.27, 0.9, 0x3f5d4a, {}, 10).cyl(0.32, 0.32, 0.06, 0x24302a, { y: 0.9 }, 10).box(0.06, 1, 0.06, C.darkSteel, { y: 0.5, z: -0.33 }))]
};

const fence: Archetype = {
  nominal: { w: 2.5, d: 0.1, h: 1.6 },
  far: false,
  farColor: C.rust,
  mid: ['body'],
  parts: [fixed('body', 'rust', (b) => b.box(2.4, 1.5, 0.05, 0x7f5a3e, { y: 0.8 }).box(0.08, 1.7, 0.08, C.darkSteel, { x: -1.2, y: 0.85 }).box(0.08, 1.7, 0.08, C.darkSteel, { x: 1.2, y: 0.85 }))]
};

const curbRamp: Archetype = {
  nominal: { w: 1.5, d: 1.2, h: 0.15 },
  far: false,
  farColor: C.darkConcrete,
  mid: ['body'],
  parts: [fixed('body', 'lit', (b) => b.box(1.5, 0.08, 1.2, 0x9a978f, { y: 0.06, rx: 0.1 }), origin, false)]
};

const crate: Archetype = {
  nominal: { w: 0.9, d: 0.9, h: 0.7 },
  far: false,
  farColor: C.wood,
  mid: ['body'],
  parts: [fixed('body', 'lit', (b) => {
    b.box(0.9, 0.7, 0.9, 0x9a7448, { y: 0.35 });
    for (const y of [0.12, 0.58]) b.box(0.92, 0.08, 0.92, 0x6e5232, { y });
    return b;
  })]
};

const cardboard: Archetype = {
  nominal: { w: 1.2, d: 0.6, h: 0.5 },
  far: false,
  farColor: 0xb08850,
  mid: ['body'],
  parts: [fixed('body', 'lit', (b) => b.box(0.6, 0.45, 0.5, 0xb08850, { y: 0.225 }).box(0.8, 0.02, 0.6, 0xa07a46, { x: 0.65, y: 0.01, ry: 0.3 }).box(0.6, 0.02, 0.06, 0xc8b49a, { y: 0.45 }))]
};

const awning: Archetype = {
  nominal: { w: 2.4, d: 1.6, h: 2.6 },
  far: false,
  farColor: C.red,
  mid: ['body'],
  parts: [fixed('body', 'lit', (b) => {
    for (let i = 0; i < 6; i++) b.box(0.4, 0.03, 1.5, i % 2 === 0 ? 0xd2352b : 0xf1efe8, { x: -1 + i * 0.4, y: 2.4, rx: 0.2 });
    for (const x of [-1.15, 1.15]) b.box(0.05, 2.45, 0.05, C.steel, { x, y: 1.22, z: 0.7 });
    return b;
  })]
};

const railSegment: Archetype = {
  nominal: { w: 2.4, d: 4, h: 0.25 },
  far: false,
  farColor: C.darkSteel,
  mid: ['body'],
  parts: [fixed('body', 'lit', (b) => {
    for (let i = 0; i < 7; i++) b.box(2.4, 0.12, 0.24, 0x4e3a2a, { y: 0.06, z: -1.8 + i * 0.6 });
    for (const x of [-0.72, 0.72]) b.box(0.07, 0.13, 4, 0x8a8e94, { x, y: 0.18 });
    return b;
  }, origin, false)]
};

const ironBeam: Archetype = {
  nominal: { w: 0.3, d: 6, h: 0.3 },
  far: false,
  farColor: C.rust,
  mid: ['body'],
  parts: [fixed('body', 'rust', (b) => b.box(0.3, 0.03, 6, 0x6d4a35, { y: 0.015 }).box(0.3, 0.03, 6, 0x6d4a35, { y: 0.285 }).box(0.03, 0.24, 6, 0x6d4a35, { y: 0.15 }), origin, false)]
};

const satelliteDish: Archetype = {
  nominal: { w: 1, d: 1, h: 1.2 },
  far: false,
  farColor: 0xd9d9d4,
  mid: ['body'],
  parts: [fixed('body', 'lit', (b) =>
    b.add(new THREE.SphereGeometry(0.45, 10, 6, 0, Math.PI * 2, 0, 0.85), 0xd9d9d4, { y: 0.9, rx: Math.PI / 2 - 0.5 })
      .cyl(0.03, 0.03, 0.75, C.darkSteel, {}, 6))]
};

const laundry: Archetype = {
  nominal: { w: 2.4, d: 0.3, h: 1.9 },
  far: false,
  farColor: C.white,
  mid: ['body'],
  parts: [fixed('body', 'lit', (b) => {
    for (const x of [-1.15, 1.15]) b.box(0.05, 1.9, 0.05, C.steel, { x, y: 0.95 });
    b.box(2.3, 0.015, 0.015, 0xdddddd, { y: 1.8 });
    const colors = [0xe94b64, 0xf2f2f2, 0x536cff, 0xf5a623, 0x28c997, 0xf2f2f2];
    colors.forEach((c, i) => b.box(0.3, 0.5 + (i % 2) * 0.2, 0.02, c, { x: -0.85 + i * 0.34, y: 1.5 - (i % 2) * 0.1 }));
    return b;
  }, origin, false)]
};

const hazardTape: Archetype = {
  nominal: { w: 2.2, d: 0.1, h: 1.1 },
  far: false,
  farColor: C.yellow,
  mid: ['body'],
  parts: [fixed('body', 'lit', (b) => {
    for (const x of [-1.05, 1.05]) {
      for (let i = 0; i < 4; i++) b.cyl(0.04, 0.04, 0.25, i % 2 === 0 ? C.red : C.white, { x, y: i * 0.25 }, 6);
    }
    for (let i = 0; i < 9; i++) b.box(0.233, 0.08, 0.01, i % 2 === 0 ? C.yellow : C.black, { x: -0.933 + i * 0.233, y: 0.9 });
    return b;
  }, origin, false)]
};

const stairFlight: Archetype = {
  nominal: { w: 1.8, d: 1.8, h: 0.9 },
  far: false,
  farColor: 0x9a978f,
  mid: ['body'],
  parts: [fixed('body', 'lit', (b) => {
    for (let i = 0; i < 6; i++) b.box(1.8, 0.15 * (i + 1), 0.3, 0x9a978f, { y: 0.075 * (i + 1), z: -0.75 + i * 0.3 });
    b.box(0.04, 0.9, 1.8, C.darkSteel, { x: 0.9, y: 0.9, rx: -0.45 });
    return b;
  })]
};

export const BUILDING_ARCHETYPES: Readonly<Record<BuildingKind, Archetype>> = {
  panel10,
  kukatarolo,
  playground,
  market_row: marketRow,
  market_stall: marketStall,
  factory_hall: factoryHall,
  chimney,
  gantry_crane: gantryCrane,
  ore_wagon: oreWagon,
  bus_shelter: busShelter,
  bus_platform: busPlatform,
  ticket_kiosk: ticketKiosk,
  subway_stairs: subwayStairs,
  wine_cellar: wineCellar,
  tv_tower: tvTower,
  lookout,
  scrap_fence: scrapFence,
  office_container: officeContainer,
  weighbridge,
  hopper,
  led_display: ledDisplay,
  generator,
  sorting_shed: sortingShed,
  scrap_pile: scrapPile
};

export const PROP_ARCHETYPES: Readonly<Record<PropKind, Archetype>> = {
  hex_lamp: hexLamp,
  street_lamp: streetLamp,
  bench,
  tree,
  bin,
  fence,
  curb_ramp: curbRamp,
  crate,
  cardboard,
  awning,
  rail_segment: railSegment,
  iron_beam: ironBeam,
  satellite_dish: satelliteDish,
  laundry,
  hazard_tape: hazardTape,
  stair_flight: stairFlight
};
