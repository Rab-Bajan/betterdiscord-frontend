// Reusable pieces for buildings.ts: framed windows, panelled doors, roofs, yard clutter and the construction
// scaffolding. Every piece is centred on its own origin, faces +z and returns model-space parts.
import { COL, HALF, PI, place } from './modelKit.ts';
import { spokedWheel } from './humans.ts';
import type { Kit, MatKey, PartOptions, RawPart, Vec3T } from './modelKit.ts';
import type * as THREE from 'three';

export interface WindowOptions {
  frame?: number;
  lit?: boolean;
  bars?: boolean;
  sill?: boolean;
  /** shutter colour; no shutters when unset */
  shutters?: number;
  shutterTeam?: boolean;
  grille?: boolean;
  /** flower box under the sill */
  box?: boolean;
}

export interface DoorOptions {
  c?: number;
  mat?: MatKey;
  team?: boolean;
  frame?: number;
  handle?: MatKey;
  glass?: boolean;
  lit?: boolean;
}

export interface GableRoofOptions {
  overhang?: number;
  mat?: MatKey;
  c?: number;
  gable?: MatKey;
  gableC?: number;
}

export interface PoleOptions {
  transformer?: boolean;
  lamp?: boolean;
}

export function createBuildingParts(kit: Kit) {
  const { G, P } = kit;
  // framed window: recessed pane, frame, glazing bars, sill, optional shutters / security bars
  function windowUnit(w: number, h: number, o: WindowOptions = {}): RawPart[] {
    const fc = o.frame ?? COL.offWhite, t = 0.022;
    const out: RawPart[] = [
      P(G.box(w, h, 0.012), o.lit ? 'glassLit' : 'glass', [0, 0, 0.004]),
      P(G.box(w + t * 2, t, 0.035), 'matte', [0, h / 2 + t / 2, 0.012], { c: fc }),
      P(G.box(w + t * 2, t, 0.035), 'matte', [0, -h / 2 - t / 2, 0.012], { c: fc }),
      P(G.box(t, h, 0.035), 'matte', [-w / 2 - t / 2, 0, 0.012], { c: fc }),
      P(G.box(t, h, 0.035), 'matte', [w / 2 + t / 2, 0, 0.012], { c: fc })
    ];
    if (o.bars !== false) {
      out.push(P(G.box(0.012, h, 0.02), 'matte', [0, 0, 0.012], { c: fc }));
      if (h > 0.22) out.push(P(G.box(w, 0.012, 0.02), 'matte', [0, h * 0.16, 0.012], { c: fc }));
    }
    if (o.sill !== false) out.push(P(G.rbox(w + 0.09, 0.02, 0.06, 0.006), 'concrete', [0, -h / 2 - t - 0.008, 0.03]));
    if (o.shutters) for (const sd of [-1, 1]) {
      out.push(P(G.rbox(w / 2, h + 0.02, 0.014, 0.004), 'planks', [sd * (w / 2 + t + w / 4 + 0.004), 0, 0.012], { c: o.shutters, team: o.shutterTeam }));
      for (const y of [-0.3, 0.3]) out.push(P(G.box(w / 2 - 0.02, 0.012, 0.006), 'planks', [sd * (w / 2 + t + w / 4 + 0.004), y * h, 0.022], { c: o.shutters, team: o.shutterTeam, shade: 0.75 }));
    }
    if (o.grille) for (let i = -2; i <= 2; i++) out.push(P(G.cyl(0.004, h + 0.02, 4), 'metal', [i * w / 5, 0, 0.034], { c: COL.char }));
    if (o.box) {
      out.push(P(G.rbox(w + 0.04, 0.035, 0.05, 0.006), 'planks', [0, -h / 2 - 0.05, 0.06], { c: COL.brown }));
      for (let i = 0; i < 5; i++) out.push(P(G.sph(0.022, 6, 4), 'cloth', [(i - 2) * w / 5, -h / 2 - 0.022, 0.06], { c: i % 2 ? COL.red : COL.leaf, s: [1, 0.8, 1] }));
    }
    return out;
  }
  // panelled door in its frame with handle and step
  function doorUnit(w: number, h: number, o: DoorOptions = {}): RawPart[] {
    const c = o.c ?? COL.brown, mat = o.mat || 'planks', team = !!o.team;
    const out: RawPart[] = [
      P(G.rbox(w, h, 0.022, 0.004), mat, [0, h / 2, 0.006], { c, team }),
      P(G.box(0.03, h + 0.03, 0.04), 'matte', [-w / 2 - 0.015, h / 2 + 0.015, 0.012], { c: o.frame ?? COL.offWhite }),
      P(G.box(0.03, h + 0.03, 0.04), 'matte', [w / 2 + 0.015, h / 2 + 0.015, 0.012], { c: o.frame ?? COL.offWhite }),
      P(G.box(w + 0.06, 0.03, 0.04), 'matte', [0, h + 0.015, 0.012], { c: o.frame ?? COL.offWhite }),
      P(G.rbox(w + 0.14, 0.035, 0.12, 0.006), 'concrete', [0, 0.012, 0.06]),
      P(G.sph(0.012, 6, 4), o.handle || 'chrome', [w / 2 - 0.045, h * 0.47, 0.03]),
      P(G.box(0.014, 0.05, 0.004), o.handle || 'chrome', [w / 2 - 0.045, h * 0.47, 0.019])
    ];
    for (const [y, ph] of [[0.27, 0.3], [0.7, 0.34]] as const) out.push(P(G.rbox(w - 0.09, h * ph, 0.008, 0.003), mat, [0, h * y, 0.02], { c, team, shade: 0.8 }));
    if (o.glass) out.push(P(G.box(w - 0.12, h * 0.2, 0.01), o.lit ? 'glassLit' : 'glass', [0, h * 0.78, 0.022]));
    return out;
  }
  // pitched roof with the ridge along x: cover sheets, gable infill, barge boards, ridge cap, gutter
  function gableRoof(w: number, d: number, rise: number, o: GableRoofOptions = {}): RawPart[] {
    const ov = o.overhang ?? 0.1, mat = o.mat || 'roofTile';
    const D = d / 2 + ov, L = Math.hypot(D, rise), pitch = Math.atan2(rise, D);
    const W = w + ov * 2;
    const cover = mat === 'sheet' ? G.corr(W, L + 0.02, 0.07, 0.012) : G.slab(W, L + 0.02);
    const out = [
      P(cover, mat, [0, rise / 2, D / 2], { r: [pitch - HALF, 0, 0], keepUV: true, c: o.c }),
      P(cover, mat, [0, rise / 2, -D / 2], { r: [HALF - pitch, PI, 0], keepUV: true, c: o.c }),
      P(G.prism(d, rise * (d / 2) / D, w - 0.02), o.gable || 'plaster', [0, 0, 0], { r: [0, HALF, 0], c: o.gableC })
    ];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(P(G.box(0.022, 0.06, L + 0.02), 'wood', [sx * (W / 2 - 0.006), rise / 2 - 0.022, sz * D / 2], { r: [sz * pitch, 0, 0], c: COL.brown }));
    for (const sz of [-1, 1]) {
      out.push(P(G.box(W, 0.045, 0.02), 'wood', [0, -0.012, sz * D], { c: COL.brown }));
      out.push(P(G.cyl(0.022, W, 6, 0.022, true), 'metal', [0, -0.03, sz * (D + 0.02)], { r: [0, 0, HALF], c: COL.grey }));
    }
    out.push(P(G.cyl(0.03, W + 0.01, 7), mat === 'sheet' ? 'metal' : 'roofTile', [0, rise + 0.004, 0], { r: [0, 0, HALF], c: mat === 'sheet' ? COL.grey : o.c, s: [1, 1, 0.6] }));
    return out;
  }
  // single slope of corrugated sheets, high edge at -z, laid as two lapped sheets weighed down against the wind
  function shedRoof(w: number, d: number, rise: number, o: { c2?: number } = {}): RawPart[] {
    const L = Math.hypot(d, rise), pitch = Math.atan2(rise, d);
    const out = [
      P(G.corr(w * 0.56, L, 0.07, 0.012), 'sheet', [-w * 0.23, rise / 2, 0], { r: [pitch - HALF, 0, 0], keepUV: true }),
      P(G.corr(w * 0.56, L * 0.98, 0.07, 0.012), 'sheet', [w * 0.23, rise / 2 + 0.012, 0.01], { r: [pitch - HALF, 0, 0.012], keepUV: true, c: o.c2 ?? COL.lightGrey })
    ];
    for (const x of [-w / 2 + 0.03, 0, w / 2 - 0.03]) out.push(P(G.box(0.035, 0.05, L), 'wood', [x, rise / 2 - 0.04, 0], { r: [pitch, 0, 0], c: COL.brown }));
    return out;
  }
  function chimney(h: number, o: { c?: number } = {}): RawPart[] {
    return [
      P(G.box(0.2, h, 0.2), 'brick', [0, h / 2, 0]),
      P(G.rbox(0.26, 0.04, 0.26, 0.008), 'concrete', [0, h + 0.02, 0]),
      P(G.cyl(0.05, 0.1, 8, 0.045), 'roofTile', [0, h + 0.09, 0], { c: o.c ?? COL.white, shade: 0.7 }),
      P(G.cyl(0.042, 0.012, 8), 'matte', [0, h + 0.135, 0], { c: COL.soot })
    ];
  }
  const stovePipe = (h: number): RawPart[] => [
    P(G.cyl(0.035, h, 8), 'sheet', [0, h / 2, 0]),
    P(G.cyl(0.04, 0.02, 8), 'metal', [0, h * 0.5, 0], { c: COL.char }),
    P(G.cone(0.07, 0.05, 8), 'sheet', [0, h + 0.05, 0]),
    ...[0, 1, 2].map((i) => P(G.cyl(0.004, 0.05, 4), 'metal', [Math.cos(i * 2.1) * 0.03, h + 0.01, Math.sin(i * 2.1) * 0.03], { c: COL.char }))
  ];

  // ---------------- yard clutter ----------------
  const tyre = (r = 0.14): RawPart[] => [P(G.lathe([[r * 0.55, -r * 0.3], [r * 0.9, -r * 0.36], [r, -r * 0.24], [r, r * 0.24], [r * 0.9, r * 0.36], [r * 0.55, r * 0.3]], 14), 'matte', [0, r * 0.36, 0], { c: COL.tyre })];
  const tyreStack = (n: number, r = 0.14): RawPart[] => Array.from({ length: n }, (_, i) => place(tyre(r), [(i % 2) * 0.012, i * r * 0.7, (i % 3) * 0.008], [0, i * 0.7, 0])).flat();
  function drum(mat: MatKey = 'rust', o: { c?: number; team?: boolean } = {}): RawPart[] {
    return [
      P(G.cyl(0.1, 0.3, 14), mat, [0, 0.15, 0], { c: o.c, team: o.team }),
      ...[0.01, 0.1, 0.2, 0.29].map((y) => P(G.torus(0.1, 0.007, 4, 14), mat, [0, y, 0], { r: [HALF, 0, 0], c: o.c, team: o.team, shade: 0.85 })),
      P(G.cyl(0.092, 0.004, 12), 'metal', [0, 0.296, 0], { c: COL.char }),
      P(G.cyl(0.014, 0.012, 6), 'metal', [0.05, 0.302, 0.02], { c: COL.lightGrey })
    ];
  }
  function barrel(): RawPart[] {
    return [
      P(G.lathe([[0.085, 0], [0.108, 0.08], [0.115, 0.15], [0.108, 0.22], [0.085, 0.3]], 12), 'wood', [0, 0, 0], { c: COL.tan }),
      ...[0.03, 0.1, 0.2, 0.27].map((y) => P(G.torus(0.092 + (0.15 - Math.abs(y - 0.15)) * 0.16, 0.005, 4, 14), 'metal', [0, y, 0], { r: [HALF, 0, 0], c: COL.char })),
      P(G.cyl(0.083, 0.006, 12), 'wood', [0, 0.292, 0], { c: COL.brown })
    ];
  }
  function crate(w = 0.24, h = 0.2, d = 0.24, c: number = COL.tan): RawPart[] {
    const out: RawPart[] = [P(G.box(w - 0.02, h - 0.02, d - 0.02), 'planks', [0, h / 2, 0], { c, shade: 0.7 })];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(P(G.box(0.025, h, 0.025), 'wood', [sx * (w / 2 - 0.012), h / 2, sz * (d / 2 - 0.012)], { c }));
    for (const y of [0.2, 0.8]) for (const sz of [-1, 1]) out.push(P(G.box(w, h * 0.22, 0.012), 'wood', [0, h * y, sz * d / 2], { c }));
    for (const y of [0.2, 0.8]) for (const sx of [-1, 1]) out.push(P(G.box(0.012, h * 0.22, d), 'wood', [sx * w / 2, h * y, 0], { c }));
    return out;
  }
  function pallet(): RawPart[] {
    const out: RawPart[] = [];
    for (const z of [-0.17, 0, 0.17]) out.push(P(G.box(0.5, 0.045, 0.045), 'wood', [0, 0.022, z], { c: COL.tan }));
    for (let i = 0; i < 6; i++) out.push(P(G.box(0.07, 0.014, 0.4), 'wood', [-0.215 + i * 0.086, 0.052, 0], { c: COL.tan, r: [0, (i % 3 - 1) * 0.02, 0] }));
    return out;
  }
  const sandbag = (c: number = COL.sand): RawPart[] => [P(G.capsule(0.07, 0.17, 6), 'burlap', [0, 0.05, 0], { r: [0, 0, HALF], s: [1, 1, 1.25], c }), P(G.box(0.012, 0.11, 0.004), 'burlap', [0.15, 0.05, 0], { c, shade: 0.7 })];
  function sandbagWall(n: number, rows: number): RawPart[] {
    const out: RawPart[] = [];
    for (let r = 0; r < rows; r++) for (let i = 0; i < n - (r % 2); i++) out.push(...place(sandbag(r % 2 ? COL.sand : COL.khaki), [(i - (n - 1 - (r % 2)) / 2) * 0.3, r * 0.105, (r % 2) * 0.012], [0, (i * 7 + r) % 3 * 0.05 - 0.05, 0]));
    return out;
  }
  function powerPole(h = 2.0, o: PoleOptions = {}): RawPart[] {
    const out: RawPart[] = [
      P(G.cyl(0.045, h, 8, 0.034), 'wood', [0, h / 2, 0], { c: COL.brown }),
      P(G.box(0.62, 0.045, 0.045), 'wood', [0, h - 0.12, 0], { c: COL.brown }),
      P(G.box(0.4, 0.035, 0.035), 'wood', [0, h - 0.32, 0], { c: COL.brown }),
      ...[-0.27, -0.1, 0.1, 0.27].map((x) => P(G.lathe([[0.012, 0], [0.018, 0.015], [0.01, 0.03], [0.016, 0.045], [0.006, 0.06]], 6), 'satin', [x, h - 0.097, 0], { c: COL.bone })),
      P(G.box(0.02, 0.3, 0.004), 'metal', [0.0, h - 0.22, 0.03], { c: COL.char, r: [0, 0, 0.9] })
    ];
    if (o.transformer) out.push(P(G.cyl(0.07, 0.18, 10), 'metal', [0.1, h - 0.52, 0], { c: COL.grey }), P(G.cyl(0.074, 0.012, 10), 'metal', [0.1, h - 0.43, 0], { c: COL.char }), ...[0.07, 0.13].map((x) => P(G.cyl(0.008, 0.05, 5), 'satin', [x, h - 0.4, 0], { c: COL.bone })));
    if (o.lamp) out.push(P(G.tube([[0, h - 0.5, 0], [0, h - 0.42, 0.14], [0, h - 0.46, 0.26]], 0.01, 5), 'metal', [0, 0, 0], { c: COL.grey }), P(G.rbox(0.07, 0.03, 0.12, 0.01), 'metal', [0, h - 0.46, 0.3], { c: COL.grey }), P(G.box(0.05, 0.008, 0.09), 'lamp', [0, h - 0.478, 0.3]));
    return out;
  }
  const wire = (a: Vec3T, b: Vec3T, sag = 0.2): RawPart => P(G.tube([a, b], 0.006, 4, sag), 'matte', [0, 0, 0], { c: COL.black });
  function satDish(r = 0.14): RawPart[] {
    return [
      P(G.lathe([[0.001, 0], [r * 0.5, r * 0.06], [r, r * 0.26], [r * 1.02, r * 0.27]], 12), 'metal', [0, 0, 0], { r: [HALF, 0, 0], c: COL.lightGrey }),
      P(G.cyl(0.004, r * 1.1, 4), 'metal', [0, -r * 0.3, r * 0.5], { r: [HALF + 0.55, 0, 0], c: COL.grey }),
      P(G.cyl(0.014, 0.04, 6), 'matte', [0, 0, r * 0.95], { r: [HALF, 0, 0], c: COL.char }),
      P(G.cyl(0.008, r * 1.3, 5), 'metal', [0, -r * 0.6, -0.03], { c: COL.grey })
    ];
  }
  function tvAerial(h = 0.5): RawPart[] {
    const out: RawPart[] = [P(G.cyl(0.006, h, 4), 'metal', [0, h / 2, 0], { c: COL.lightGrey }), P(G.cyl(0.004, 0.34, 4), 'metal', [0, h - 0.04, 0], { r: [HALF, 0, 0], c: COL.lightGrey })];
    for (let i = 0; i < 6; i++) out.push(P(G.cyl(0.003, 0.22 - i * 0.02, 4), 'metal', [0, h - 0.04, -0.15 + i * 0.06], { r: [0, 0, HALF], c: COL.lightGrey }));
    return out;
  }
  function woodPile(rows = 3, n = 5): RawPart[] {
    const out: RawPart[] = [];
    for (let r = 0; r < rows; r++) for (let i = 0; i < n - r; i++) {
      const x = (i - (n - 1 - r) / 2) * 0.085;
      out.push(P(G.cyl(0.04, 0.32, 7, 0.037), 'wood', [x, 0.04 + r * 0.072, 0], { r: [HALF, (i * 5 + r * 3) % 7 * 0.2, 0], c: COL.brown }));
      out.push(P(G.cyl(0.035, 0.004, 7), 'matte', [x, 0.04 + r * 0.072, 0.161], { r: [HALF, 0, 0], c: COL.straw }));
    }
    return out;
  }
  function gasBottle(c: number): RawPart[] {
    return [P(G.capsule(0.05, 0.22, 8), 'satin', [0, 0.16, 0], { c }), P(G.cyl(0.03, 0.05, 8, 0.03, true), 'metal', [0, 0.335, 0], { c: COL.char }), P(G.cyl(0.012, 0.03, 6), 'gold', [0, 0.325, 0]), P(G.torus(0.05, 0.006, 4, 10), 'metal', [0, 0.012, 0], { r: [HALF, 0, 0], c: COL.char })];
  }
  function ladder(h: number, w = 0.16): RawPart[] {
    const out: RawPart[] = [P(G.box(0.022, h, 0.03), 'wood', [-w / 2, h / 2, 0], { c: COL.tan }), P(G.box(0.022, h, 0.03), 'wood', [w / 2, h / 2, 0], { c: COL.tan })];
    for (let y = 0.12; y < h - 0.05; y += 0.13) out.push(P(G.cyl(0.009, w, 5), 'wood', [0, y, 0], { r: [0, 0, HALF], c: COL.tan }));
    return out;
  }
  function bicycle(): RawPart[] {
    const fr = (a: Vec3T, b: Vec3T): RawPart => P(G.tube([a, b], 0.007, 5), 'paint', [0, 0, 0], { c: COL.blue, team: false });
    return [
      ...place(spokedWheel(kit, 0.13, undefined, { spokes: 12, width: 0.012 }), [0, 0.13, -0.19]),
      ...place(spokedWheel(kit, 0.13, undefined, { spokes: 12, width: 0.012 }), [0, 0.13, 0.19]),
      fr([0, 0.13, -0.19], [0, 0.3, -0.06]), fr([0, 0.3, -0.06], [0, 0.14, 0.0]), fr([0, 0.14, 0.0], [0, 0.13, -0.19]), fr([0, 0.3, -0.06], [0, 0.31, 0.13]),
      fr([0, 0.14, 0.0], [0, 0.31, 0.13]), fr([0, 0.34, 0.12], [0, 0.13, 0.19]), fr([0, 0.3, -0.06], [0, 0.36, -0.07]),
      P(G.rbox(0.035, 0.014, 0.07, 0.006), 'matte', [0, 0.365, -0.075], { c: COL.black }),
      P(G.cyl(0.006, 0.16, 5), 'chrome', [0, 0.35, 0.12], { r: [0, 0, HALF] })
    ];
  }
  function bench(w = 0.5): RawPart[] {
    return [
      ...[-0.06, 0, 0.06].map((z) => P(G.rbox(w, 0.016, 0.05, 0.004), 'wood', [0, 0.16, z], { c: COL.tan })),
      ...[-1, 1].flatMap((sd) => [P(G.box(0.03, 0.16, 0.16), 'concrete', [sd * (w / 2 - 0.05), 0.08, 0])])
    ];
  }
  // sagging cable with a row of glowing bulbs
  function fairyLights(a: Vec3T, b: Vec3T, n: number, sag: number): RawPart[] {
    const out: RawPart[] = [wire(a, b, sag)];
    for (let i = 1; i < n; i++) {
      const t = i / n;
      out.push(P(G.sph(0.013, 6, 4), 'lamp', [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * PI) * sag - 0.014, a[2] + (b[2] - a[2]) * t]));
    }
    return out;
  }
  const flagPole = (h: number, fw = 0.5, fh = 0.3): RawPart[] => [
    P(G.cyl(0.018, h, 7, 0.012), 'metal', [0, h / 2, 0], { c: COL.lightGrey }),
    P(G.sph(0.024, 8, 6), 'gold', [0, h + 0.015, 0]),
    P(G.cyl(0.04, 0.03, 8), 'concrete', [0, 0.015, 0]),
    P(G.cloth(fw, fh), 'flag', [0.012, h - fh / 2 - 0.03, 0], { team: true })
  ];
  const decal = (w: number, h: number, k: number, pos: Vec3T, r?: Vec3T): RawPart => P(G.card(w, h, k, 2, 2), 'decal', pos, { r });
  // painted board on a timber backing; k picks the cell of the sign atlas
  const sign = (w: number, h: number, k: number, pos: Vec3T, r?: Vec3T): RawPart[] => place([P(G.card(w, h, k, 2, 4), 'sign', [0, 0, 0.001]), P(G.box(w + 0.03, h + 0.03, 0.016), 'planks', [0, 0, -0.008], { c: COL.brown })], pos, r);
  const at = (parts: RawPart[], p: Vec3T, r?: Vec3T, s?: number | Vec3T): RawPart[] => place(parts, p, r, s);

  // construction scaffolding shown while a building goes up
  function scaffold(size: number, height: number): RawPart[] {
    const out: RawPart[] = [];
    const S = (g: THREE.BufferGeometry, m: MatKey, pos: Vec3T, x: PartOptions = {}): number => out.push(P(g, m, pos, { ...x, scaffold: true }));
    const e = size * 0.47;
    for (const x of [-e, 0, e]) for (const z of [-e, e]) S(G.cyl(0.02, height, 6), 'wood', [x, height / 2, z], { c: COL.tan });
    for (const z of [-e * 0.33, e * 0.33]) for (const x of [-e, e]) S(G.cyl(0.02, height, 6), 'wood', [x, height / 2, z], { c: COL.tan });
    for (const y of [height * 0.36, height * 0.74]) {
      for (const sz of [-1, 1]) {
        S(G.cyl(0.016, size * 0.96, 5), 'wood', [0, y, sz * e], { r: [0, 0, HALF], c: COL.tan });
        S(G.box(size * 0.92, 0.018, 0.2), 'planks', [0, y + 0.02, sz * (e - 0.11)]);
      }
      for (const sx of [-1, 1]) S(G.cyl(0.016, size * 0.96, 5), 'wood', [sx * e, y, 0], { r: [HALF, 0, 0], c: COL.tan });
    }
    S(G.cyl(0.012, Math.hypot(e, height * 0.38), 5), 'wood', [e / 2, height * 0.55, e], { r: [0, 0, Math.atan2(e, height * 0.38)], c: COL.tan });
    S(G.cyl(0.012, Math.hypot(e, height * 0.38), 5), 'wood', [-e / 2, height * 0.18, -e], { r: [0, 0, -Math.atan2(e, height * 0.38)], c: COL.tan });
    for (const p of place(ladder(height * 0.78), [e * 0.5, 0, e + 0.07], [-0.16, 0, 0])) { p.scaffold = true; out.push(p); }
    return out;
  }
  return { windowUnit, doorUnit, gableRoof, shedRoof, chimney, stovePipe, tyre, tyreStack, drum, barrel, crate, pallet, sandbagWall, powerPole, wire, satDish, tvAerial, woodPile, gasBottle, ladder, bicycle, bench, fairyLights, flagPole, decal, sign, at, scaffold };
}
