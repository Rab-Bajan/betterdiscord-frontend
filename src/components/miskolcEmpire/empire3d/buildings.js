// Buildings of the telep. Origin = footprint centre on the ground, the front faces +z.
// Every building is assembled from small reusable pieces (framed windows, panelled doors, pitched roofs,
// yard clutter) so each one reads as a lived-in place rather than a box.
import { COL, HALF, PI, place } from './modelKit.js';
import { spokedWheel } from './humans.js';

export function defineBuildings(kit, def) {
  const { G, P, finalize } = kit;

  // ---------------- construction pieces (all centred on their own origin, facing +z) ----------------
  // framed window: recessed pane, frame, glazing bars, sill, optional shutters / security bars
  function windowUnit(w, h, o = {}) {
    const fc = o.frame ?? COL.offWhite, t = 0.022;
    const out = [
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
  function doorUnit(w, h, o = {}) {
    const c = o.c ?? COL.brown, mat = o.mat || 'planks', team = !!o.team;
    const out = [
      P(G.rbox(w, h, 0.022, 0.004), mat, [0, h / 2, 0.006], { c, team }),
      P(G.box(0.03, h + 0.03, 0.04), 'matte', [-w / 2 - 0.015, h / 2 + 0.015, 0.012], { c: o.frame ?? COL.offWhite }),
      P(G.box(0.03, h + 0.03, 0.04), 'matte', [w / 2 + 0.015, h / 2 + 0.015, 0.012], { c: o.frame ?? COL.offWhite }),
      P(G.box(w + 0.06, 0.03, 0.04), 'matte', [0, h + 0.015, 0.012], { c: o.frame ?? COL.offWhite }),
      P(G.rbox(w + 0.14, 0.035, 0.12, 0.006), 'concrete', [0, 0.012, 0.06]),
      P(G.sph(0.012, 6, 4), o.handle || 'chrome', [w / 2 - 0.045, h * 0.47, 0.03]),
      P(G.box(0.014, 0.05, 0.004), o.handle || 'chrome', [w / 2 - 0.045, h * 0.47, 0.019])
    ];
    for (const [y, ph] of [[0.27, 0.3], [0.7, 0.34]]) out.push(P(G.rbox(w - 0.09, h * ph, 0.008, 0.003), mat, [0, h * y, 0.02], { c, team, shade: 0.8 }));
    if (o.glass) out.push(P(G.box(w - 0.12, h * 0.2, 0.01), o.lit ? 'glassLit' : 'glass', [0, h * 0.78, 0.022]));
    return out;
  }
  // pitched roof with the ridge along x: cover sheets, gable infill, barge boards, ridge cap, gutter
  function gableRoof(w, d, rise, o = {}) {
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
  function shedRoof(w, d, rise, o = {}) {
    const L = Math.hypot(d, rise), pitch = Math.atan2(rise, d);
    const out = [
      P(G.corr(w * 0.56, L, 0.07, 0.012), 'sheet', [-w * 0.23, rise / 2, 0], { r: [pitch - HALF, 0, 0], keepUV: true }),
      P(G.corr(w * 0.56, L * 0.98, 0.07, 0.012), 'sheet', [w * 0.23, rise / 2 + 0.012, 0.01], { r: [pitch - HALF, 0, 0.012], keepUV: true, c: o.c2 ?? COL.lightGrey })
    ];
    for (const x of [-w / 2 + 0.03, 0, w / 2 - 0.03]) out.push(P(G.box(0.035, 0.05, L), 'wood', [x, rise / 2 - 0.04, 0], { r: [pitch, 0, 0], c: COL.brown }));
    return out;
  }
  function chimney(h, o = {}) {
    return [
      P(G.box(0.2, h, 0.2), 'brick', [0, h / 2, 0]),
      P(G.rbox(0.26, 0.04, 0.26, 0.008), 'concrete', [0, h + 0.02, 0]),
      P(G.cyl(0.05, 0.1, 8, 0.045), 'roofTile', [0, h + 0.09, 0], { c: o.c ?? COL.white, shade: 0.7 }),
      P(G.cyl(0.042, 0.012, 8), 'matte', [0, h + 0.135, 0], { c: COL.soot })
    ];
  }
  const stovePipe = (h) => [
    P(G.cyl(0.035, h, 8), 'sheet', [0, h / 2, 0]),
    P(G.cyl(0.04, 0.02, 8), 'metal', [0, h * 0.5, 0], { c: COL.char }),
    P(G.cone(0.07, 0.05, 8), 'sheet', [0, h + 0.05, 0]),
    ...[0, 1, 2].map((i) => P(G.cyl(0.004, 0.05, 4), 'metal', [Math.cos(i * 2.1) * 0.03, h + 0.01, Math.sin(i * 2.1) * 0.03], { c: COL.char }))
  ];

  // ---------------- yard clutter ----------------
  const tyre = (r = 0.14) => [P(G.lathe([[r * 0.55, -r * 0.3], [r * 0.9, -r * 0.36], [r, -r * 0.24], [r, r * 0.24], [r * 0.9, r * 0.36], [r * 0.55, r * 0.3]], 14), 'matte', [0, r * 0.36, 0], { c: COL.tyre })];
  const tyreStack = (n, r = 0.14) => Array.from({ length: n }, (_, i) => place(tyre(r), [(i % 2) * 0.012, i * r * 0.7, (i % 3) * 0.008], [0, i * 0.7, 0])).flat();
  function drum(mat = 'rust', o = {}) {
    return [
      P(G.cyl(0.1, 0.3, 14), mat, [0, 0.15, 0], { c: o.c, team: o.team }),
      ...[0.01, 0.1, 0.2, 0.29].map((y) => P(G.torus(0.1, 0.007, 4, 14), mat, [0, y, 0], { r: [HALF, 0, 0], c: o.c, team: o.team, shade: 0.85 })),
      P(G.cyl(0.092, 0.004, 12), 'metal', [0, 0.296, 0], { c: COL.char }),
      P(G.cyl(0.014, 0.012, 6), 'metal', [0.05, 0.302, 0.02], { c: COL.lightGrey })
    ];
  }
  function barrel() {
    return [
      P(G.lathe([[0.085, 0], [0.108, 0.08], [0.115, 0.15], [0.108, 0.22], [0.085, 0.3]], 12), 'wood', [0, 0, 0], { c: COL.tan }),
      ...[0.03, 0.1, 0.2, 0.27].map((y) => P(G.torus(0.092 + (0.15 - Math.abs(y - 0.15)) * 0.16, 0.005, 4, 14), 'metal', [0, y, 0], { r: [HALF, 0, 0], c: COL.char })),
      P(G.cyl(0.083, 0.006, 12), 'wood', [0, 0.292, 0], { c: COL.brown })
    ];
  }
  function crate(w = 0.24, h = 0.2, d = 0.24, c = COL.tan) {
    const out = [P(G.box(w - 0.02, h - 0.02, d - 0.02), 'planks', [0, h / 2, 0], { c, shade: 0.7 })];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(P(G.box(0.025, h, 0.025), 'wood', [sx * (w / 2 - 0.012), h / 2, sz * (d / 2 - 0.012)], { c }));
    for (const y of [0.2, 0.8]) for (const sz of [-1, 1]) out.push(P(G.box(w, h * 0.22, 0.012), 'wood', [0, h * y, sz * d / 2], { c }));
    for (const y of [0.2, 0.8]) for (const sx of [-1, 1]) out.push(P(G.box(0.012, h * 0.22, d), 'wood', [sx * w / 2, h * y, 0], { c }));
    return out;
  }
  function pallet() {
    const out = [];
    for (const z of [-0.17, 0, 0.17]) out.push(P(G.box(0.5, 0.045, 0.045), 'wood', [0, 0.022, z], { c: COL.tan }));
    for (let i = 0; i < 6; i++) out.push(P(G.box(0.07, 0.014, 0.4), 'wood', [-0.215 + i * 0.086, 0.052, 0], { c: COL.tan, r: [0, (i % 3 - 1) * 0.02, 0] }));
    return out;
  }
  const sandbag = (c = COL.sand) => [P(G.capsule(0.07, 0.17, 6), 'burlap', [0, 0.05, 0], { r: [0, 0, HALF], s: [1, 1, 1.25], c }), P(G.box(0.012, 0.11, 0.004), 'burlap', [0.15, 0.05, 0], { c, shade: 0.7 })];
  function sandbagWall(n, rows) {
    const out = [];
    for (let r = 0; r < rows; r++) for (let i = 0; i < n - (r % 2); i++) out.push(...place(sandbag(r % 2 ? COL.sand : COL.khaki), [(i - (n - 1 - (r % 2)) / 2) * 0.3, r * 0.105, (r % 2) * 0.012], [0, (i * 7 + r) % 3 * 0.05 - 0.05, 0]));
    return out;
  }
  function powerPole(h = 2.0, o = {}) {
    const out = [
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
  const wire = (a, b, sag = 0.2) => P(G.tube([a, b], 0.006, 4, sag), 'matte', [0, 0, 0], { c: COL.black });
  function satDish(r = 0.14) {
    return [
      P(G.lathe([[0.001, 0], [r * 0.5, r * 0.06], [r, r * 0.26], [r * 1.02, r * 0.27]], 12), 'metal', [0, 0, 0], { r: [HALF, 0, 0], c: COL.lightGrey }),
      P(G.cyl(0.004, r * 1.1, 4), 'metal', [0, -r * 0.3, r * 0.5], { r: [HALF + 0.55, 0, 0], c: COL.grey }),
      P(G.cyl(0.014, 0.04, 6), 'matte', [0, 0, r * 0.95], { r: [HALF, 0, 0], c: COL.char }),
      P(G.cyl(0.008, r * 1.3, 5), 'metal', [0, -r * 0.6, -0.03], { c: COL.grey })
    ];
  }
  function tvAerial(h = 0.5) {
    const out = [P(G.cyl(0.006, h, 4), 'metal', [0, h / 2, 0], { c: COL.lightGrey }), P(G.cyl(0.004, 0.34, 4), 'metal', [0, h - 0.04, 0], { r: [HALF, 0, 0], c: COL.lightGrey })];
    for (let i = 0; i < 6; i++) out.push(P(G.cyl(0.003, 0.22 - i * 0.02, 4), 'metal', [0, h - 0.04, -0.15 + i * 0.06], { r: [0, 0, HALF], c: COL.lightGrey }));
    return out;
  }
  function woodPile(rows = 3, n = 5) {
    const out = [];
    for (let r = 0; r < rows; r++) for (let i = 0; i < n - r; i++) {
      const x = (i - (n - 1 - r) / 2) * 0.085;
      out.push(P(G.cyl(0.04, 0.32, 7, 0.037), 'wood', [x, 0.04 + r * 0.072, 0], { r: [HALF, (i * 5 + r * 3) % 7 * 0.2, 0], c: COL.brown }));
      out.push(P(G.cyl(0.035, 0.004, 7), 'matte', [x, 0.04 + r * 0.072, 0.161], { r: [HALF, 0, 0], c: COL.straw }));
    }
    return out;
  }
  function gasBottle(c) {
    return [P(G.capsule(0.05, 0.22, 8), 'satin', [0, 0.16, 0], { c }), P(G.cyl(0.03, 0.05, 8, 0.03, true), 'metal', [0, 0.335, 0], { c: COL.char }), P(G.cyl(0.012, 0.03, 6), 'gold', [0, 0.325, 0]), P(G.torus(0.05, 0.006, 4, 10), 'metal', [0, 0.012, 0], { r: [HALF, 0, 0], c: COL.char })];
  }
  function ladder(h, w = 0.16) {
    const out = [P(G.box(0.022, h, 0.03), 'wood', [-w / 2, h / 2, 0], { c: COL.tan }), P(G.box(0.022, h, 0.03), 'wood', [w / 2, h / 2, 0], { c: COL.tan })];
    for (let y = 0.12; y < h - 0.05; y += 0.13) out.push(P(G.cyl(0.009, w, 5), 'wood', [0, y, 0], { r: [0, 0, HALF], c: COL.tan }));
    return out;
  }
  function bicycle() {
    const fr = (a, b) => P(G.tube([a, b], 0.007, 5), 'paint', [0, 0, 0], { c: COL.blue, team: false });
    return [
      ...place(spokedWheel(kit, 0.13, undefined, { spokes: 12, width: 0.012 }), [0, 0.13, -0.19]),
      ...place(spokedWheel(kit, 0.13, undefined, { spokes: 12, width: 0.012 }), [0, 0.13, 0.19]),
      fr([0, 0.13, -0.19], [0, 0.3, -0.06]), fr([0, 0.3, -0.06], [0, 0.14, 0.0]), fr([0, 0.14, 0.0], [0, 0.13, -0.19]), fr([0, 0.3, -0.06], [0, 0.31, 0.13]),
      fr([0, 0.14, 0.0], [0, 0.31, 0.13]), fr([0, 0.34, 0.12], [0, 0.13, 0.19]), fr([0, 0.3, -0.06], [0, 0.36, -0.07]),
      P(G.rbox(0.035, 0.014, 0.07, 0.006), 'matte', [0, 0.365, -0.075], { c: COL.black }),
      P(G.cyl(0.006, 0.16, 5), 'chrome', [0, 0.35, 0.12], { r: [0, 0, HALF] })
    ];
  }
  function bench(w = 0.5) {
    return [
      ...[-0.06, 0, 0.06].map((z) => P(G.rbox(w, 0.016, 0.05, 0.004), 'wood', [0, 0.16, z], { c: COL.tan })),
      ...[-1, 1].flatMap((sd) => [P(G.box(0.03, 0.16, 0.16), 'concrete', [sd * (w / 2 - 0.05), 0.08, 0])])
    ];
  }
  // sagging cable with a row of glowing bulbs
  function fairyLights(a, b, n, sag) {
    const out = [wire(a, b, sag)];
    for (let i = 1; i < n; i++) {
      const t = i / n;
      out.push(P(G.sph(0.013, 6, 4), 'lamp', [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * PI) * sag - 0.014, a[2] + (b[2] - a[2]) * t]));
    }
    return out;
  }
  const flagPole = (h, fw = 0.5, fh = 0.3) => [
    P(G.cyl(0.018, h, 7, 0.012), 'metal', [0, h / 2, 0], { c: COL.lightGrey }),
    P(G.sph(0.024, 8, 6), 'gold', [0, h + 0.015, 0]),
    P(G.cyl(0.04, 0.03, 8), 'concrete', [0, 0.015, 0]),
    P(G.cloth(fw, fh), 'flag', [0.012, h - fh / 2 - 0.03, 0], { team: true })
  ];
  const decal = (w, h, k, pos, r) => P(G.card(w, h, k, 2, 2), 'decal', pos, { r });
  // painted board on a timber backing; k picks the cell of the sign atlas
  const sign = (w, h, k, pos, r) => place([P(G.card(w, h, k, 2, 4), 'sign', [0, 0, 0.001]), P(G.box(w + 0.03, h + 0.03, 0.016), 'planks', [0, 0, -0.008], { c: COL.brown })], pos, r);
  const at = (parts, p, r, s) => place(parts, p, r, s);

  // construction scaffolding shown while a building goes up
  function scaffold(size, height) {
    const out = [];
    const S = (g, m, pos, x = {}) => out.push(P(g, m, pos, { ...x, scaffold: true }));
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
  const B = (size, top, parts, emitters = []) => finalize([...parts.flat(Infinity), ...scaffold(size, top * 0.85)], null, { top, radius: size * 0.72, emitters, size, grime: 0.32 });

  // ---------------- Vajda Háza (town centre, 3x3) ----------------
  def('townCenter', () => {
    const HX = -0.3, HZ = -0.35, WALL = COL.plasterYellow;
    const front = HZ + 0.8;
    const p = [
      // paved yard and plinth
      P(G.rbox(2.9, 0.1, 2.9, 0.02), 'concrete', [0, 0.03, 0]),
      P(G.box(2.06, 0.16, 1.66), 'brick', [HX, 0.16, HZ]),
      // two storeys of rendered wall with a string course between them
      P(G.box(2.0, 1.36, 1.6), 'plaster', [HX, 0.9, HZ], { c: WALL }),
      P(G.box(2.04, 0.05, 1.64), 'plaster', [HX, 0.92, HZ], { c: COL.offWhite }),
      P(G.box(2.06, 0.06, 1.66), 'plaster', [HX, 1.56, HZ], { c: COL.offWhite }),
      ...[-1, 1].map((sd) => P(G.box(0.07, 1.36, 0.07), 'plaster', [HX + sd * 0.985, 0.9, front - 0.02], { c: COL.offWhite })),
      at(gableRoof(2.0, 1.6, 0.62, { overhang: 0.13, gableC: WALL }), [HX, 1.59, HZ]),
      at(chimney(0.62), [0.3, 1.72, -0.72]),
      at(chimney(0.4, { c: COL.grey }), [-0.95, 1.86, -0.3], [0, 0, 0], 0.8),
      // dormer on the front slope
      P(G.box(0.36, 0.26, 0.3), 'plaster', [HX, 1.9, HZ + 0.52], { c: WALL }),
      at(windowUnit(0.2, 0.16, { lit: true }), [HX, 1.9, HZ + 0.672]),
      P(G.prism(0.44, 0.14, 0.4), 'roofTile', [HX, 2.03, HZ + 0.5]),
      // ground floor front: double door under the porch, tall windows with shutters
      at(doorUnit(0.4, 0.62, { c: COL.horseDark, handle: 'gold', glass: true, lit: true }), [HX, 0.24, front]),
      at(windowUnit(0.26, 0.36, { lit: true, shutters: COL.white, shutterTeam: true }), [HX - 0.66, 0.6, front]),
      at(windowUnit(0.26, 0.36, { shutters: COL.white, shutterTeam: true, box: true }), [HX + 0.66, 0.6, front]),
      // upper floor: french window onto the balcony, flanking windows
      at(windowUnit(0.3, 0.42, { lit: true }), [HX, 1.2, front]),
      at(windowUnit(0.24, 0.32, {}), [HX - 0.68, 1.24, front]),
      at(windowUnit(0.24, 0.32, { lit: true }), [HX + 0.68, 1.24, front]),
      // porch: four columns carrying a balcony with a balustrade and the house banner
      ...[-0.6, -0.22, 0.22, 0.6].flatMap((x) => [
        P(G.lathe([[0.05, 0], [0.05, 0.03], [0.034, 0.05], [0.03, 0.6], [0.045, 0.63], [0.05, 0.66]], 10), 'plaster', [HX + x, 0.24, front + 0.4], { c: COL.offWhite })
      ]),
      P(G.rbox(1.46, 0.07, 0.56, 0.01), 'concrete', [HX, 0.94, front + 0.24], { c: COL.offWhite }),
      P(G.rbox(1.5, 0.05, 0.6, 0.01), 'concrete', [HX, 0.2, front + 0.26]),
      P(G.rbox(1.2, 0.05, 0.16, 0.01), 'concrete', [HX, 0.13, front + 0.6]),
      ...Array.from({ length: 13 }, (_, i) => P(G.lathe([[0.012, 0], [0.02, 0.05], [0.01, 0.11], [0.016, 0.16]], 6), 'plaster', [HX - 0.66 + i * 0.11, 0.975, front + 0.49], { c: COL.offWhite })),
      ...[-1, 1].flatMap((sd) => Array.from({ length: 4 }, (_, i) => P(G.lathe([[0.012, 0], [0.02, 0.05], [0.01, 0.11], [0.016, 0.16]], 6), 'plaster', [HX + sd * 0.7, 0.975, front + 0.08 + i * 0.11], { c: COL.offWhite }))),
      P(G.rbox(1.46, 0.03, 0.05, 0.008), 'plaster', [HX, 1.15, front + 0.49], { c: COL.offWhite }),
      ...[-1, 1].map((sd) => P(G.rbox(0.05, 0.03, 0.5, 0.008), 'plaster', [HX + sd * 0.7, 1.15, front + 0.25], { c: COL.offWhite })),
      P(G.cloth(0.34, 0.5, 4, 6), 'flag', [HX, 1.13, front + 0.522], { r: [0, 0, -HALF], team: true }),
      sign(0.56, 0.2, 6, [HX, 0.99, front + 0.022]),
      // lean-to garage on the right with a roller door
      P(G.box(0.9, 0.84, 1.3), 'crumble', [1.05, 0.5, -0.25]),
      at(shedRoof(1.04, 1.5, 0.2), [1.05, 0.94, -0.25], [0, PI, 0]),
      P(G.corr(0.6, 0.62, 0.05, 0.008), 'sheet', [1.05, 0.4, 0.405], { keepUV: true, r: [0, 0, HALF], c: COL.lightGrey }),
      P(G.box(0.68, 0.05, 0.04), 'metal', [1.05, 0.73, 0.41], { c: COL.char }),
      decal(0.8, 0.4, 0, [1.503, 0.5, -0.25], [0, HALF, 0]),
      // yard: bogrács over the fire, bench, flagpole, power pole feeding the house, dish, aerial
      ...[0, 2.1, 4.2].map((a) => P(G.cyl(0.012, 0.66, 5), 'metal', [1.0 + Math.cos(a) * 0.13, 0.39, 1.0 + Math.sin(a) * 0.13], { r: [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4], c: COL.char })),
      P(G.cyl(0.003, 0.26, 4), 'metal', [1.0, 0.56, 1.0], { c: COL.char }),
      P(G.lathe([[0.001, 0], [0.09, 0.02], [0.13, 0.09], [0.135, 0.16], [0.13, 0.165]], 12), 'metal', [1.0, 0.27, 1.0], { c: COL.soot }),
      P(G.cyl(0.125, 0.006, 12), 'cloth', [1.0, 0.415, 1.0], { c: COL.rustTint }),
      ...[0, 1, 2, 3, 4].map((i) => P(G.cyl(0.022, 0.24, 6), 'wood', [1.0 + Math.cos(i * 1.26) * 0.07, 0.12, 1.0 + Math.sin(i * 1.26) * 0.07], { r: [HALF - 0.35, i * 1.26, 0], c: COL.horseDark })),
      ...[0, 1, 2, 3, 4, 5, 6].map((i) => P(G.rock(0.045, i + 1, 0, 0.3), 'concrete', [1.0 + Math.cos(i * 0.9) * 0.2, 0.1, 1.0 + Math.sin(i * 0.9) * 0.2])),
      P(G.cone(0.07, 0.16, 6), 'fire', [1.0, 0.18, 1.0]),
      at(bench(0.5), [0.5, 0.08, 1.2], [0, 0.3, 0]),
      at(flagPole(2.4, 0.6, 0.36), [1.3, 0.06, 1.25]),
      at(powerPole(2.1, { transformer: true, lamp: true }), [-1.3, 0.05, 1.3], [0, 0.4, 0]),
      wire([-1.52, 2.03, 1.21], [-1.2, 1.5, front + 0.01], 0.18), wire([-1.08, 2.03, 1.39], [-0.7, 1.5, front + 0.01], 0.16),
      wire([-1.3, 2.0, 1.3], [1.3, 2.3, 1.25], 0.4),
      at(satDish(0.17), [-1.28, 1.42, 0.1], [-0.5, -HALF - 0.4, 0]),
      at(tvAerial(0.5), [-0.9, 2.18, -0.5]),
      at(woodPile(3, 6), [-1.2, 0.08, -0.9], [0, HALF, 0]),
      at(drum('rust'), [1.25, 0.08, 0.62]),
      at(windowUnit(0.24, 0.32, {}), [HX - 1.0, 1.24, HZ + 0.3], [0, -HALF, 0]),
      at(windowUnit(0.24, 0.32, { lit: true, grille: true }), [HX - 1.0, 0.62, HZ - 0.3], [0, -HALF, 0])
    ];
    return B(3, 2.5, p, [
      { type: 'smoke', p: [0.3, 2.5, -0.72], rate: 2.2, dark: false },
      { type: 'fire', p: [1.0, 0.24, 1.0], rate: 6, scale: 0.5 }
    ]);
  });

  // ---------------- MÉH Telep (scrap yard, 2x2) ----------------
  def('scrapYard', () => {
    const junk = [
      P(G.rock(0.42, 11, 2, 0.3), 'sheet', [-0.5, 0.1, -0.5], { s: [1.1, 0.7, 1] }),
      P(G.rock(0.26, 12, 1, 0.35), 'steel', [-0.28, 0.2, -0.72], { s: [1, 0.8, 1] }),
      // crushed car cubes, a door, a bonnet
      P(G.rbox(0.36, 0.22, 0.3, 0.03), 'paint', [-0.66, 0.44, -0.3], { r: [0.3, 1.1, 0.2], c: COL.blue, team: false }),
      P(G.rbox(0.3, 0.2, 0.3, 0.03), 'paint', [-0.3, 0.5, -0.5], { r: [0.5, 0.2, 0.4], c: COL.red, team: false }),
      P(G.rbox(0.44, 0.3, 0.03, 0.01), 'paint', [-0.76, 0.3, -0.72], { r: [0.3, 0.7, 0.8] }),
      P(G.cyl(0.11, 0.62, 10), 'steel', [-0.16, 0.13, -0.66], { r: [0, 0.3, HALF] }),
      P(G.cyl(0.03, 0.9, 7), 'rust', [-0.5, 0.46, -0.6], { r: [0.9, 0.5, 0.3] }),
      P(G.cyl(0.025, 0.8, 7), 'copper', [-0.62, 0.38, -0.5], { r: [1.2, -0.4, 0.2] }),
      // radiator, washing machine drum, bicycle wheel
      ...Array.from({ length: 7 }, (_, i) => P(G.rbox(0.03, 0.26, 0.07, 0.01), 'matte', [-0.9 + i * 0.036, 0.16, -0.18], { r: [0.35, 0.5, 0], c: COL.offWhite })),
      P(G.cyl(0.13, 0.16, 12, 0.13, true), 'metal', [-0.38, 0.16, -0.18], { r: [0.9, 0.3, 0], c: COL.lightGrey }),
      ...place(spokedWheel(kit, 0.13, undefined, { spokes: 10, width: 0.012 }), [-0.2, 0.42, -0.4], [0.5, 0.4, 1.0])
    ];
    const p = [
      P(G.rbox(1.96, 0.07, 1.96, 0.015), 'concrete', [0, 0.02, 0]),
      junk,
      at(tyreStack(3), [-0.16, 0.05, -0.28]),
      // site office in a shipping container painted in the owner's colour
      P(G.rbox(0.66, 0.6, 0.52, 0.012), 'paint', [0.55, 0.37, -0.57]),
      ...Array.from({ length: 9 }, (_, i) => P(G.box(0.022, 0.52, 0.01), 'paint', [0.27 + i * 0.07, 0.37, -0.306], { shade: 0.8 })),
      ...Array.from({ length: 7 }, (_, i) => P(G.box(0.01, 0.52, 0.022), 'paint', [0.884, 0.37, -0.78 + i * 0.07], { shade: 0.8 })),
      P(G.box(0.7, 0.03, 0.56), 'metal', [0.55, 0.675, -0.57], { c: COL.char }),
      at(windowUnit(0.2, 0.16, { lit: true, sill: false, grille: true, frame: COL.char }), [0.42, 0.44, -0.304]),
      at(doorUnit(0.2, 0.44, { mat: 'metal', c: COL.grey, frame: COL.char }), [0.72, 0.07, -0.304]),
      sign(0.6, 0.2, 1, [0.55, 0.82, -0.32]),
      ...[0.3, 0.8].map((x) => P(G.cyl(0.012, 0.14, 5), 'metal', [x, 0.75, -0.34], { c: COL.char })),
      at(satDish(0.09), [0.82, 0.76, -0.7], [-0.5, 0.8, 0]),
      // weighbridge: checker plate deck, ramped ends, dial on a post
      P(G.rbox(0.86, 0.045, 0.52, 0.008), 'steel', [0.32, 0.075, 0.42]),
      ...[-1, 1].map((sd) => P(G.box(0.86, 0.01, 0.1), 'steel', [0.32, 0.066, 0.42 + sd * 0.3], { r: [sd * 0.3, 0, 0] })),
      P(G.cyl(0.02, 0.5, 6), 'metal', [-0.18, 0.3, 0.72], { c: COL.char }),
      P(G.cyl(0.09, 0.03, 16), 'matte', [-0.18, 0.58, 0.72], { r: [HALF, 0, 0], c: COL.bone }),
      P(G.torus(0.09, 0.008, 4, 16), 'metal', [-0.18, 0.58, 0.735], { c: COL.char }),
      P(G.box(0.006, 0.07, 0.004), 'matte', [-0.165, 0.6, 0.737], { r: [0, 0, -0.6], c: COL.red }),
      sign(0.3, 0.11, 7, [-0.18, 0.4, 0.745]),
      // crane mast
      P(G.cyl(0.06, 0.1, 10, 0.05), 'concrete', [0.78, 0.09, 0.78]),
      P(G.cyl(0.04, 1.4, 8), 'paint', [0.78, 0.76, 0.78], { c: COL.yellow, team: false }),
      ...[0.3, 0.7, 1.1].map((y) => P(G.torus(0.042, 0.006, 4, 8), 'metal', [0.78, y, 0.78], { r: [HALF, 0, 0], c: COL.char })),
      at(ladder(1.2, 0.1), [0.78, 0.1, 0.84]),
      // chain-link fence on two sides
      ...[-0.95, -0.47, 0, 0.47, 0.95].flatMap((t) => [P(G.cyl(0.016, 0.56, 5), 'metal', [t, 0.3, 0.95], { c: COL.grey }), P(G.cyl(0.016, 0.56, 5), 'metal', [-0.95, 0.3, t], { c: COL.grey })]),
      ...[0.16, 0.36, 0.56].flatMap((y) => [P(G.cyl(0.006, 1.9, 4), 'metal', [0, y, 0.95], { r: [0, 0, HALF], c: COL.grey }), P(G.cyl(0.006, 1.9, 4), 'metal', [-0.95, y, 0], { r: [HALF, 0, 0], c: COL.grey })]),
      ...Array.from({ length: 16 }, (_, i) => P(G.cyl(0.003, 0.56, 3), 'metal', [-0.9 + i * 0.12, 0.34, 0.95], { r: [0, 0, i % 2 ? 0.75 : -0.75], c: COL.lightGrey })),
      ...Array.from({ length: 16 }, (_, i) => P(G.cyl(0.003, 0.56, 3), 'metal', [-0.95, 0.34, -0.9 + i * 0.12], { r: [i % 2 ? 0.75 : -0.75, 0, 0], c: COL.lightGrey })),
      // burning oil drum, cable reel, pallet of copper offcuts
      at(drum('rust'), [0.1, 0.05, -0.05]),
      P(G.cyl(0.085, 0.01, 10), 'fire', [0.1, 0.34, -0.05]),
      at(pallet(), [-0.55, 0.05, 0.45], [0, 0.2, 0]),
      ...[0, 1, 2].map((i) => P(G.torus(0.1, 0.03, 6, 14), 'copper', [-0.55 + (i - 1) * 0.02, 0.14 + i * 0.055, 0.45], { r: [HALF, 0, i] })),
      decal(0.42, 0.22, 1, [0.886, 0.3, -0.57], [0, HALF, 0])
    ];
    const jib = [
      P(G.box(1.25, 0.07, 0.07), 'paint', [-0.42, 0.04, 0], { j: 'crane', c: COL.yellow, team: false }),
      ...Array.from({ length: 6 }, (_, i) => P(G.cyl(0.008, 0.22, 4), 'metal', [-0.95 + i * 0.18, 0.13, 0], { j: 'crane', r: [0, 0, i % 2 ? 0.7 : -0.7], c: COL.char })),
      P(G.cyl(0.01, 1.1, 4), 'metal', [-0.45, 0.22, 0], { j: 'crane', r: [0, 0, HALF], c: COL.char }),
      P(G.rbox(0.2, 0.18, 0.2, 0.02), 'paint', [0.24, 0.02, 0], { j: 'crane', team: true }),
      P(G.box(0.16, 0.1, 0.01), 'glass', [0.2, 0.05, 0.101], { j: 'crane' }),
      P(G.rbox(0.16, 0.12, 0.16, 0.02), 'concrete', [0.36, -0.06, 0], { j: 'crane' }),
      P(G.cyl(0.004, 0.52, 4), 'matte', [-0.95, -0.25, 0], { j: 'crane', c: COL.black }),
      P(G.cyl(0.11, 0.05, 14), 'metal', [-0.95, -0.53, 0], { j: 'crane', c: COL.iron }),
      P(G.cyl(0.03, 0.05, 8), 'metal', [-0.95, -0.49, 0], { j: 'crane', c: COL.char }),
      P(G.rock(0.07, 21, 0, 0.4), 'rust', [-0.92, -0.6, 0.02], { j: 'crane' }),
      P(G.rock(0.05, 22, 0, 0.4), 'steel', [-1.0, -0.59, -0.04], { j: 'crane' })
    ];
    return finalize([...p.flat(Infinity), ...jib, ...scaffold(2, 1.4)], { crane: { p: [0.78, 1.46, 0.78], src: 'crane', axis: 'y' } }, {
      top: 1.7, radius: 1.44, size: 2, grime: 0.32,
      emitters: [{ type: 'fire', p: [0.1, 0.38, -0.05], rate: 9, scale: 0.6 }, { type: 'smoke', p: [0.1, 0.5, -0.05], rate: 1.6, dark: true }]
    });
  });

  // ---------------- Viskó (shack, 2x2) ----------------
  def('house', () => B(2, 1.3, [
    P(G.rbox(1.5, 0.06, 1.3, 0.012), 'concrete', [0, 0.02, -0.08]),
    // patchwork walls: planks, with tin sheets nailed over the worst gaps
    P(G.box(1.3, 0.78, 1.1), 'planks', [0, 0.43, -0.1], { c: COL.cream }),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => P(G.box(0.05, 0.82, 0.05), 'wood', [a * 0.65, 0.45, -0.1 + b * 0.55], { c: COL.brown })),
    P(G.corr(0.5, 0.6, 0.05, 0.008), 'sheet', [0.652, 0.42, -0.3], { r: [0, HALF, 0], keepUV: true }),
    P(G.corr(0.44, 0.44, 0.05, 0.008), 'sheet', [-0.652, 0.5, 0.1], { r: [0, -HALF, 0.05], keepUV: true, c: COL.teal }),
    P(G.corr(0.6, 0.5, 0.05, 0.008), 'sheet', [-0.3, 0.4, -0.652], { r: [0, PI, 0], keepUV: true }),
    P(G.box(0.34, 0.3, 0.012), 'planks', [0.32, 0.26, 0.456], { c: COL.plasterBlue }),
    at(shedRoof(1.56, 1.36, 0.22), [0, 0.84, -0.1], [0, PI, 0]),
    // door painted in the owner's colour, window with one shutter left, step
    at(doorUnit(0.28, 0.56, { c: COL.white, team: true, frame: COL.brown }), [-0.3, 0.05, 0.452]),
    at(windowUnit(0.26, 0.22, { lit: true, frame: COL.brown, shutters: COL.teal }), [0.3, 0.52, 0.452]),
    at(windowUnit(0.2, 0.18, { frame: COL.brown, sill: false }), [0.652, 0.56, 0.22], [0, HALF, 0]),
    // roof weights and stove pipe
    at(tyre(0.13), [-0.35, 1.02, -0.3], [0.16, 0, 0]),
    P(G.box(0.16, 0.06, 0.08), 'brick', [0.25, 1.01, -0.4], { r: [0.16, 0.4, 0] }),
    P(G.box(0.16, 0.06, 0.08), 'brick', [0.1, 0.9, 0.3], { r: [0.16, -0.2, 0] }),
    at(stovePipe(0.5), [0.45, 0.86, -0.4]),
    at(satDish(0.11), [-0.62, 0.98, 0.42], [-0.45, -0.7, 0]),
    // washing line with the family's laundry
    P(G.cyl(0.016, 0.72, 5), 'wood', [-0.82, 0.36, 0.82], { c: COL.brown, r: [0, 0, 0.05] }),
    P(G.cyl(0.016, 0.72, 5), 'wood', [0.82, 0.36, 0.82], { c: COL.brown, r: [0, 0, -0.05] }),
    wire([-0.84, 0.7, 0.82], [0.84, 0.7, 0.82], 0.07),
    P(G.cloth(0.2, 0.26, 3, 5), 'flag', [-0.42, 0.65, 0.82], { r: [0, 0, -HALF], team: true }),
    P(G.cloth(0.26, 0.2, 3, 5), 'flag', [-0.08, 0.63, 0.82], { r: [0, 0, -HALF], c: COL.offWhite }),
    P(G.cloth(0.16, 0.3, 3, 5), 'flag', [0.3, 0.64, 0.82], { r: [0, 0, -HALF], team: true, shade: 0.75 }),
    P(G.cloth(0.14, 0.12, 3, 3), 'flag', [0.56, 0.67, 0.82], { r: [0, 0, -HALF], c: COL.pink }),
    // yard: rain barrel under the eave, firewood, bucket, old tyre, bench
    at(drum('rust', { c: COL.plasterBlue }), [0.78, 0.04, -0.72]),
    P(G.cyl(0.092, 0.004, 12), 'glass', [0.78, 0.33, -0.72]),
    at(woodPile(3, 5), [-0.86, 0.04, -0.4], [0, HALF, 0]),
    at(tyre(0.13), [0.74, 0.02, 0.3], [0, 0.4, 0]),
    P(G.lathe([[0.04, 0], [0.055, 0.09], [0.058, 0.1]], 8), 'metal', [-0.62, 0.05, 0.62], { c: COL.lightGrey }),
    P(G.torus(0.05, 0.003, 3, 8, PI), 'metal', [-0.62, 0.15, 0.62], { c: COL.char }),
    at(bench(0.4), [0.34, 0.03, 0.62]),
    decal(0.7, 0.35, 2, [-0.653, 0.3, -0.38], [0, -HALF, 0])
  ], [{ type: 'smoke', p: [0.45, 1.46, -0.4], rate: 1.0, dark: false }]));

  // ---------------- Lakótelepi lakás (panel block, the house from epoch 3) ----------------
  def('house_panel', () => {
    const W = 1.65, D = 1.1, FL = 0.55, N = 4, Z = D / 2, tint = COL.offWhite;
    const p = [
      P(G.rbox(1.9, 0.05, 1.5, 0.01), 'concrete', [0, 0.02, 0.05]),
      P(G.box(W, N * FL + 0.3, D), 'panel', [0, (N * FL + 0.3) / 2, 0], { c: tint, uvo: [0.25, 0.25] }),
      P(G.box(W + 0.02, 0.26, D + 0.02), 'concrete', [0, 0.13, 0], { c: COL.grey }),
      // flat roof: parapet, felt, lift house, hatch, aerials
      P(G.box(W + 0.06, 0.1, D + 0.06), 'concrete', [0, N * FL + 0.34, 0]),
      P(G.box(W - 0.06, 0.02, D - 0.06), 'bitumen', [0, N * FL + 0.395, 0]),
      P(G.box(0.4, 0.26, 0.36), 'panel', [0.45, N * FL + 0.52, -0.2], { c: tint }),
      P(G.box(0.44, 0.03, 0.4), 'bitumen', [0.45, N * FL + 0.66, -0.2]),
      at(doorUnit(0.12, 0.2, { mat: 'metal', c: COL.grey, frame: COL.char }), [0.45, N * FL + 0.4, -0.018]),
      at(tvAerial(0.5), [-0.5, N * FL + 0.39, -0.25]),
      at(tvAerial(0.38), [-0.2, N * FL + 0.39, 0.3], [0, 1, 0]),
      at(tvAerial(0.44), [0.5, N * FL + 0.67, -0.25], [0, 2, 0]),
      at(satDish(0.12), [-0.62, N * FL + 0.56, 0.2], [-0.5, -0.6, 0]),
      P(G.rbox(0.2, 0.12, 0.16, 0.01), 'metal', [0.0, N * FL + 0.46, -0.3], { c: COL.lightGrey }),
      // entrance: canopy on two posts, glazed door, house number, bin
      P(G.rbox(0.6, 0.05, 0.36, 0.008), 'concrete', [-0.55, 0.64, Z + 0.16]),
      ...[-0.8, -0.3].map((x) => P(G.cyl(0.014, 0.6, 6), 'metal', [x, 0.32, Z + 0.3], { c: COL.char })),
      at(doorUnit(0.3, 0.5, { mat: 'metal', c: COL.grey, glass: true, lit: true, frame: COL.char }), [-0.55, 0.05, Z + 0.004]),
      sign(0.22, 0.09, 5, [-0.2, 0.52, Z + 0.016]),
      P(G.rbox(0.14, 0.24, 0.16, 0.02), 'paint', [-0.98, 0.14, Z + 0.14], { c: COL.green, team: false }),
      P(G.rbox(0.15, 0.03, 0.17, 0.01), 'paint', [-0.98, 0.27, Z + 0.14], { c: COL.green, team: false, r: [0.1, 0, 0] }),
      decal(0.7, 0.35, 3, [0.3, 0.3, Z + 0.006]),
      wire([-0.82, 2.3, Z + 0.02], [0.82, 2.0, Z + 0.02], 0.12)
    ];
    for (let f = 0; f < N; f++) {
      const y = 0.58 + f * FL;
      for (const [i, x] of [-0.55, 0, 0.55].entries()) {
        const lit = (f * 3 + i) % 3 === 0;
        if (!(f === 0 && i === 0)) p.push(at(windowUnit(0.3, 0.26, { lit, frame: COL.offWhite }), [x, y, Z + 0.002]));
        p.push(at(windowUnit(0.26, 0.24, { lit: (f + i) % 4 === 1, frame: COL.offWhite }), [x, y, -Z - 0.002], [0, PI, 0]));
        // strip of coloured cladding under every window, in the owner's colour
        if (!(f === 0 && i === 0)) p.push(P(G.box(0.34, 0.13, 0.008), 'paint', [x, y - 0.24, Z + 0.006]));
      }
      // loggia on the right-hand bay from the first floor up
      if (f > 0) {
        p.push(P(G.rbox(0.5, 0.04, 0.2, 0.006), 'concrete', [0.55, y - 0.17, Z + 0.1]));
        p.push(P(G.box(0.5, 0.17, 0.014), 'paint', [0.55, y - 0.07, Z + 0.195]));
        for (const sd of [-1, 1]) p.push(P(G.box(0.014, 0.17, 0.2), 'panel', [0.55 + sd * 0.25, y - 0.07, Z + 0.1], { c: tint }));
        p.push(P(G.cyl(0.008, 0.5, 5), 'metal', [0.55, y + 0.03, Z + 0.195], { r: [0, 0, HALF], c: COL.char }));
        if (f === 2) p.push(P(G.cloth(0.14, 0.16, 2, 3), 'flag', [0.42, y + 0.02, Z + 0.2], { r: [0, 0, -HALF], c: COL.offWhite }), P(G.cloth(0.1, 0.2, 2, 3), 'flag', [0.6, y + 0.02, Z + 0.2], { r: [0, 0, -HALF], c: COL.pink }));
        if (f === 3) p.push(at(satDish(0.07), [0.7, y + 0.02, Z + 0.22], [-0.4, 0.5, 0]));
        if (f === 1) p.push(P(G.rbox(0.16, 0.1, 0.07, 0.01), 'metal', [0.4, y + 0.0, Z + 0.24], { c: COL.lightGrey }));
      }
      for (const sd of [-1, 1]) p.push(at(windowUnit(0.2, 0.22, { lit: (f + sd) % 3 === 0, frame: COL.offWhite }), [sd * (W / 2 + 0.002), y, 0.1], [0, sd * HALF, 0]));
    }
    return B(2, 2.95, p);
  });

  // ---------------- Kocsma (tavern, 2x2) ----------------
  def('tavern', () => {
    const BZ = -0.15, front = BZ + 0.65;
    return B(2, 1.6, [
      P(G.rbox(1.96, 0.05, 1.96, 0.012), 'concrete', [0, 0.015, 0]),
      P(G.box(1.64, 0.2, 1.34), 'brick', [0, 0.14, BZ]),
      P(G.box(1.6, 0.86, 1.3), 'plaster', [0, 0.63, BZ], { c: COL.plasterGreen }),
      at(gableRoof(1.6, 1.3, 0.48, { overhang: 0.12, gableC: COL.plasterGreen }), [0, 1.07, BZ]),
      at(chimney(0.5), [-0.55, 1.12, BZ - 0.35]),
      // front: door, two lit windows with flower boxes, striped awning, the sign
      at(doorUnit(0.3, 0.56, { c: COL.horseDark, glass: true, lit: true }), [0, 0.04, front + 0.002]),
      at(windowUnit(0.38, 0.3, { lit: true, box: true }), [-0.5, 0.6, front + 0.002]),
      at(windowUnit(0.38, 0.3, { lit: true, box: true }), [0.5, 0.6, front + 0.002]),
      ...Array.from({ length: 8 }, (_, i) => P(G.box(0.19, 0.012, 0.42), 'cloth', [-0.665 + i * 0.19, 0.92, front + 0.2], { r: [0.38, 0, 0], team: i % 2 === 0, c: i % 2 ? COL.offWhite : COL.white })),
      ...Array.from({ length: 8 }, (_, i) => P(G.box(0.19, 0.06, 0.008), 'cloth', [-0.665 + i * 0.19, 0.815, front + 0.4], { team: i % 2 === 0, c: i % 2 ? COL.offWhite : COL.white })),
      ...[-0.76, 0.76].map((x) => P(G.cyl(0.008, 0.46, 4), 'metal', [x, 0.9, front + 0.2], { r: [HALF + 0.38, 0, 0], c: COL.char })),
      sign(0.84, 0.28, 0, [0, 1.3, front + 0.05]),
      ...[-0.36, 0.36].map((x) => P(G.cyl(0.008, 0.2, 4), 'metal', [x, 1.2, front + 0.02], { c: COL.char })),
      P(G.sph(0.03, 8, 6), 'lamp', [0.62, 1.0, front + 0.06]),
      P(G.cyl(0.004, 0.08, 4), 'metal', [0.62, 1.0, front + 0.03], { r: [HALF, 0, 0], c: COL.char }),
      // side and back windows
      at(windowUnit(0.3, 0.28, { lit: true }), [0.802, 0.62, BZ], [0, HALF, 0]),
      at(windowUnit(0.3, 0.28, {}), [-0.802, 0.62, BZ + 0.2], [0, -HALF, 0]),
      // beer garden: table under a parasol, benches, barrels, crates, a bike against the wall, string lights
      P(G.cyl(0.17, 0.02, 12), 'wood', [-0.55, 0.3, 0.78], { c: COL.tan }),
      P(G.cyl(0.018, 0.3, 6), 'metal', [-0.55, 0.15, 0.78], { c: COL.char }),
      P(G.cyl(0.07, 0.012, 8), 'metal', [-0.55, 0.035, 0.78], { c: COL.char }),
      P(G.cyl(0.008, 0.7, 5), 'wood', [-0.55, 0.65, 0.78], { c: COL.bone }),
      P(G.cone(0.36, 0.14, 10), 'cloth', [-0.55, 0.95, 0.78], { team: true }),
      P(G.cyl(0.36, 0.03, 10, 0.36, true), 'cloth', [-0.55, 0.868, 0.78], { team: true, shade: 0.8 }),
      ...[0, 1, 2].map((i) => P(G.cyl(0.018, 0.045, 7, 0.022), 'glassLit', [-0.55 + Math.cos(i * 2.1) * 0.09, 0.332, 0.78 + Math.sin(i * 2.1) * 0.09])),
      at(bench(0.36), [-0.55, 0.03, 0.52]),
      at(bench(0.36), [-0.86, 0.03, 0.8], [0, HALF, 0]),
      at(barrel(), [0.66, 0.03, 0.8]),
      at(barrel(), [0.9, 0.03, 0.56]),
      at(barrel(), [0.6, 0.14, 0.5], [HALF, 0.6, 0]),
      at(crate(0.2, 0.13, 0.15, COL.red), [0.3, 0.03, 0.62]),
      at(crate(0.2, 0.13, 0.15, COL.blue), [0.31, 0.16, 0.62], [0, 0.2, 0]),
      at(bicycle(), [-0.86, 0.03, -0.2], [0, 0, -0.16]),
      fairyLights([-0.8, 1.02, front + 0.02], [-0.92, 0.72, 0.95], 5, 0.06),
      fairyLights([-0.92, 0.72, 0.95], [0.1, 0.72, 0.95], 8, 0.08),
      ...[-0.92, 0.1].map((x) => P(G.cyl(0.012, 0.72, 5), 'wood', [x, 0.36, 0.95], { c: COL.brown })),
      decal(0.8, 0.4, 0, [0.803, 0.3, BZ - 0.3], [0, HALF, 0])
    ], [{ type: 'smoke', p: [-0.55, 1.78, BZ - 0.35], rate: 1.0, dark: false }]);
  });

  // ---------------- Bódé (shooters' booth, 2x2) ----------------
  def('barracks', () => {
    const target = (r) => [
      P(G.cyl(r, 0.03, 16), 'planks', [0, 0, 0], { r: [HALF, 0, 0], c: COL.tan }),
      ...[[1, COL.offWhite], [0.76, COL.black], [0.52, COL.blue], [0.3, COL.red], [0.1, COL.yellow]].map(([k, c], i) => P(G.cyl(r * k * 0.94, 0.004, 16), 'matte', [0, 0, 0.016 + i * 0.002], { r: [HALF, 0, 0], c }))
    ];
    return B(2, 1.6, [
      P(G.rbox(1.9, 0.04, 1.9, 0.01), 'planks', [0, 0.015, 0], { c: COL.tan }),
      // booth: plank walls, open serving hatch with a counter, shelves of prizes inside
      P(G.box(1.2, 0.34, 0.9), 'planks', [-0.2, 0.2, -0.3], { c: COL.cream }),
      P(G.box(1.2, 0.5, 0.04), 'planks', [-0.2, 0.62, -0.73], { c: COL.cream }),
      ...[-1, 1].map((sd) => P(G.box(0.04, 0.5, 0.9), 'planks', [-0.2 + sd * 0.58, 0.62, -0.3], { c: COL.cream })),
      P(G.box(1.12, 0.48, 0.02), 'matte', [-0.2, 0.62, -0.69], { c: COL.soot }),
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => P(G.box(0.05, 0.88, 0.05), 'wood', [-0.2 + a * 0.6, 0.46, -0.3 + b * 0.45], { c: COL.brown })),
      P(G.rbox(1.3, 0.035, 0.2, 0.006), 'wood', [-0.2, 0.385, 0.2], { c: COL.tan }),
      ...[0.5, 0.68].map((y) => P(G.box(1.1, 0.014, 0.1), 'wood', [-0.2, y, -0.62], { c: COL.tan })),
      ...Array.from({ length: 7 }, (_, i) => P(G.cyl(0.024, 0.07, 7), 'satin', [-0.62 + i * 0.14, 0.55, -0.62], { c: [COL.red, COL.yellow, COL.blue, COL.offWhite][i % 4] })),
      ...Array.from({ length: 5 }, (_, i) => P(G.sph(0.035, 8, 6), 'cloth', [-0.5 + i * 0.16, 0.72, -0.62], { c: [COL.pink, COL.tan, COL.teal][i % 3] })),
      // rifles and slingshots chained to the counter
      ...[-0.5, -0.2, 0.1].map((x, i) => P(G.cyl(0.008, 0.36, 6), 'metal', [x, 0.42, 0.2], { r: [HALF, 0.3 - i * 0.3, 0], c: COL.char })),
      ...[-0.5, -0.2, 0.1].map((x, i) => P(G.rbox(0.025, 0.04, 0.14, 0.006), 'wood', [x - Math.sin(0.3 - i * 0.3) * 0.2, 0.42, 0.2 - Math.cos(0.3 - i * 0.3) * 0.2], { r: [0, 0.3 - i * 0.3, 0], c: COL.tan })),
      at(shedRoof(1.5, 1.2, 0.18), [-0.2, 0.92, -0.26], [0, PI, 0]),
      // striped awning over the hatch and the painted sign above it
      ...Array.from({ length: 7 }, (_, i) => P(G.box(0.19, 0.012, 0.36), 'cloth', [-0.77 + i * 0.19, 0.86, 0.3], { r: [0.3, 0, 0], team: i % 2 === 0, c: i % 2 ? COL.offWhite : COL.white })),
      ...Array.from({ length: 7 }, (_, i) => P(G.cyl(0.095, 0.008, 8), 'cloth', [-0.77 + i * 0.19, 0.795, 0.47], { r: [HALF, 0, 0], team: i % 2 === 0, c: i % 2 ? COL.offWhite : COL.white, s: [1, 1, 0.5] })),
      sign(0.9, 0.3, 3, [-0.2, 1.2, 0.16]),
      ...[-0.6, 0.2].map((x) => P(G.cyl(0.012, 0.34, 5), 'wood', [x, 1.08, 0.14], { c: COL.brown })),
      // practice range: straw-backed targets, sandbag firing point, ammo crates, flag
      at(target(0.26), [0.68, 0.56, 0.22], [-0.12, -0.5, 0]),
      ...[-1, 1].map((sd) => P(G.cyl(0.018, 0.62, 5), 'wood', [0.68 + sd * 0.12, 0.28, 0.14 - sd * 0.07], { r: [0.2, 0, sd * 0.2], c: COL.brown })),
      P(G.rbox(0.44, 0.4, 0.2, 0.04), 'burlap', [0.74, 0.5, 0.06], { r: [-0.12, -0.5, 0], c: COL.straw }),
      at(target(0.15), [0.8, 0.3, -0.5], [0, -0.9, 0]),
      P(G.cyl(0.014, 0.3, 5), 'wood', [0.8, 0.15, -0.52], { c: COL.brown }),
      at(sandbagWall(4, 3), [-0.25, 0.03, 0.8]),
      at(crate(0.26, 0.16, 0.2, COL.olive), [0.5, 0.03, 0.74], [0, 0.3, 0]),
      at(crate(0.2, 0.14, 0.18, COL.olive), [0.52, 0.19, 0.74], [0, -0.2, 0]),
      at(flagPole(1.6, 0.45, 0.28), [0.78, 0.03, -0.78]),
      decal(0.6, 0.3, 1, [-0.823, 0.25, -0.3], [0, -HALF, 0])
    ]);
  });

  // ---------------- Sufni (workshop, 2x2) ----------------
  def('workshop', () => {
    const BZ = -0.1, front = BZ + 0.7;
    return B(2, 2.0, [
      P(G.rbox(1.96, 0.05, 1.96, 0.012), 'concrete', [0, 0.015, 0]),
      // block walls with a wide doorway cut into the front
      P(G.box(1.6, 0.95, 0.06), 'crumble', [0, 0.5, BZ - 0.67]),
      ...[-1, 1].map((sd) => P(G.box(0.06, 0.95, 1.4), 'crumble', [sd * 0.77, 0.5, BZ])),
      P(G.box(0.3, 0.95, 0.06), 'crumble', [-0.65, 0.5, front - 0.03]),
      P(G.box(0.5, 0.95, 0.06), 'crumble', [0.55, 0.5, front - 0.03]),
      P(G.box(1.6, 0.2, 0.06), 'crumble', [0, 0.88, front - 0.03]),
      P(G.box(1.5, 0.02, 1.3), 'concrete', [0, 0.05, BZ], { shade: 0.5 }),
      P(G.box(1.5, 0.9, 1.28), 'matte', [0, 0.5, BZ - 0.02], { c: COL.soot, s: [0.98, 1, 0.96] }),
      P(G.box(0.86, 0.05, 0.08), 'steel', [-0.07, 0.78, front]),
      // steel doors: one swung open, one ajar
      P(G.rbox(0.42, 0.72, 0.02, 0.004), 'steel', [-0.62, 0.4, front + 0.2], { r: [0, -1.25, 0] }),
      P(G.rbox(0.42, 0.72, 0.02, 0.004), 'paint', [0.24, 0.4, front + 0.08], { r: [0, 0.4, 0] }),
      ...[0.2, 0.6].map((y) => P(G.box(0.4, 0.03, 0.03), 'steel', [0.24, y, front + 0.095], { r: [0, 0.4, 0] })),
      // inside the doorway: a car on axle stands and the glow of the work lamp
      P(G.rbox(0.5, 0.16, 0.5, 0.03), 'paint', [-0.1, 0.34, BZ + 0.3], { shade: 0.6 }),
      P(G.box(0.44, 0.1, 0.3), 'glass', [-0.1, 0.46, BZ + 0.2]),
      ...[-1, 1].map((sd) => P(G.cyl(0.03, 0.2, 6, 0.05), 'metal', [-0.1 + sd * 0.2, 0.15, BZ + 0.48], { c: COL.red })),
      P(G.sph(0.025, 8, 6), 'lamp', [-0.3, 0.7, BZ + 0.5]),
      at(shedRoof(1.76, 1.56, 0.2), [0, 1.0, BZ]),
      // exhaust stack, sign, lamp over the door
      P(G.cyl(0.07, 0.92, 10), 'steel', [0.55, 1.5, BZ - 0.4]),
      P(G.cyl(0.085, 0.03, 10), 'metal', [0.55, 1.3, BZ - 0.4], { c: COL.char }),
      P(G.cone(0.12, 0.07, 10), 'rust', [0.55, 2.02, BZ - 0.4]),
      ...[0, 1, 2].map((i) => P(G.cyl(0.006, 0.08, 4), 'metal', [0.55 + Math.cos(i * 2.1) * 0.06, 1.97, BZ - 0.4 + Math.sin(i * 2.1) * 0.06], { c: COL.char })),
      sign(0.5, 0.17, 2, [-0.07, 0.89, front + 0.045]),
      at(windowUnit(0.26, 0.2, { lit: true, grille: true, frame: COL.char }), [0.52, 0.42, front + 0.002]),
      P(G.cone(0.06, 0.05, 8), 'metal', [0.52, 0.76, front + 0.07], { c: COL.char }),
      P(G.sph(0.022, 6, 4), 'lamp', [0.52, 0.73, front + 0.07]),
      at(windowUnit(0.3, 0.22, { frame: COL.char, grille: true }), [0.802, 0.55, BZ], [0, HALF, 0]),
      // yard: oil drums in the owner's colour, tyres, gas bottles on a trolley, workbench with a vice, engine on a pallet
      at(drum('paint'), [0.62, 0.03, 0.82]),
      at(drum('paint'), [0.86, 0.03, 0.66]),
      at(drum('rust'), [0.84, 0.03, 0.9], [0, 1, 0]),
      at(tyreStack(4), [-0.82, 0.03, 0.84]),
      at(tyre(0.14), [-0.6, 0.17, 0.9], [HALF - 0.25, 0.3, 0]),
      at(gasBottle(COL.blue), [-0.9, 0.03, 0.3]),
      at(gasBottle(COL.red), [-0.9, 0.03, 0.18], [0, 0, 0], 0.85),
      P(G.rbox(0.56, 0.035, 0.24, 0.006), 'wood', [0.3, 0.36, 0.84], { c: COL.tan }),
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => P(G.box(0.03, 0.34, 0.03), 'steel', [0.3 + a * 0.25, 0.19, 0.84 + b * 0.09])),
      P(G.rbox(0.07, 0.07, 0.1, 0.01), 'metal', [0.14, 0.41, 0.84], { c: COL.blue }),
      P(G.cyl(0.006, 0.12, 4), 'chrome', [0.14, 0.41, 0.9], { r: [0, 0, HALF] }),
      P(G.rbox(0.14, 0.05, 0.08, 0.01), 'satin', [0.42, 0.4, 0.84], { c: COL.red }),
      at(pallet(), [-0.3, 0.03, 0.86], [0, 0.1, 0], 0.8),
      P(G.rbox(0.24, 0.16, 0.18, 0.02), 'metal', [-0.3, 0.17, 0.86], { c: COL.iron }),
      ...[-0.06, 0, 0.06].map((x) => P(G.cyl(0.02, 0.05, 6), 'metal', [-0.3 + x, 0.27, 0.86], { c: COL.char })),
      P(G.cyl(0.05, 0.03, 10), 'metal', [-0.3, 0.17, 0.96], { r: [HALF, 0, 0], c: COL.lightGrey }),
      decal(0.9, 0.42, 2, [0.803, 0.3, BZ - 0.3], [0, HALF, 0])
    ], [
      { type: 'smoke', p: [0.55, 2.08, BZ - 0.4], rate: 3.2, dark: true },
      { type: 'weld', p: [-0.2, 0.25, 0.72], rate: 1.2 }
    ]);
  });

  // ---------------- Őrtorony (watch tower, 1x1) ----------------
  def('tower', () => {
    const p = [P(G.rbox(0.9, 0.05, 0.9, 0.01), 'concrete', [0, 0.015, 0])];
    const LEG = 1.9, e0 = 0.36, e1 = 0.27;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      p.push(P(G.box(0.045, LEG, 0.045), 'steel', [sx * (e0 + e1) / 2, LEG / 2 + 0.03, sz * (e0 + e1) / 2], { r: [-sz * 0.047, 0, sx * 0.047] }));
      p.push(P(G.rbox(0.12, 0.05, 0.12, 0.01), 'concrete', [sx * e0, 0.05, sz * e0]));
    }
    // lattice: horizontal rings and crossed diagonals on all four faces
    const levels = [0.08, 0.68, 1.28, 1.86];
    const half = (y) => e0 + (e1 - e0) * (y / LEG);
    levels.forEach((y, li) => {
      const e = half(y);
      for (const s of [-1, 1]) {
        p.push(P(G.box(e * 2, 0.03, 0.03), 'steel', [0, y, s * e]), P(G.box(0.03, 0.03, e * 2), 'steel', [s * e, y, 0]));
        if (li < levels.length - 1) {
          const y2 = levels[li + 1], em = half((y + y2) / 2), len = Math.hypot(em * 2, y2 - y), ang = Math.atan2(y2 - y, em * 2);
          for (const d of [-1, 1]) {
            p.push(P(G.box(len, 0.018, 0.018), 'steel', [0, (y + y2) / 2, s * em], { r: [0, 0, d * ang] }));
            p.push(P(G.box(0.018, 0.018, len), 'steel', [s * em, (y + y2) / 2, 0], { r: [d * ang, 0, 0] }));
          }
        }
      }
    });
    p.push(
      at(ladder(1.92, 0.14), [0, 0.03, e0 + 0.03], [-0.05, 0, 0]),
      // platform with a toe board and handrail, cabin of tin sheets under a small roof
      P(G.rbox(0.86, 0.04, 0.86, 0.008), 'planks', [0, 1.94, 0]),
      ...[-1, 1].flatMap((s) => [
        P(G.box(0.86, 0.02, 0.02), 'steel', [0, 2.22, s * 0.42]), P(G.box(0.02, 0.02, 0.86), 'steel', [s * 0.42, 2.22, 0]),
        P(G.box(0.86, 0.06, 0.012), 'planks', [0, 1.99, s * 0.425]), P(G.box(0.012, 0.06, 0.86), 'planks', [s * 0.425, 1.99, 0])
      ]),
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => P(G.box(0.022, 0.72, 0.022), 'steel', [a * 0.42, 2.3, b * 0.42])),
      ...[-1, 1].map((s) => P(G.corr(0.84, 0.26, 0.05, 0.008), 'sheet', [0, 2.09, s * 0.415], { keepUV: true, r: [0, 0, HALF] })),
      P(G.corr(0.84, 0.26, 0.05, 0.008), 'sheet', [-0.415, 2.09, 0], { keepUV: true, r: [0, HALF, HALF] }),
      P(G.box(0.012, 0.24, 0.5), 'paint', [0.42, 2.1, -0.1]),
      at(shedRoof(1.0, 1.0, 0.1), [0, 2.64, 0]),
      at(sandbagWall(2, 2), [0, 1.96, 0.3], [0, 0, 0], 0.8),
      // siren and the flag
      P(G.cone(0.05, 0.1, 8), 'metal', [-0.3, 2.56, 0.3], { r: [HALF, 0, 0], c: COL.red }),
      P(G.cyl(0.006, 0.5, 4), 'metal', [0.38, 2.9, 0.38], { c: COL.lightGrey }),
      P(G.cloth(0.3, 0.18, 6, 2), 'flag', [0.39, 3.04, 0.38], { team: true })
    );
    const light = [
      P(G.cyl(0.02, 0.1, 6), 'metal', [0, 0.05, 0], { j: 'search', c: COL.char }),
      P(G.cyl(0.07, 0.12, 12, 0.06), 'metal', [0, 0.14, 0.03], { j: 'search', r: [HALF, 0, 0], c: COL.char }),
      P(G.cyl(0.062, 0.01, 12), 'lamp', [0, 0.14, 0.092], { j: 'search', r: [HALF, 0, 0] }),
      P(G.torus(0.066, 0.008, 4, 12), 'chrome', [0, 0.14, 0.094], { j: 'search' })
    ];
    return finalize([...p.flat(Infinity), ...light, ...scaffold(1, 2.4)], { search: { p: [0, 1.96, -0.12], src: 'search', axis: 'y' } }, { top: 2.95, radius: 0.72, size: 1, grime: 0.3 });
  });

  // ---------------- Kerítés (plank fence segment along x, 1x1) ----------------
  def('fence', () => {
    const p = [];
    for (const x of [-0.5, 0, 0.5]) p.push(P(G.box(0.07, 0.6, 0.07), 'wood', [x * 0.92, 0.3, -0.02], { c: COL.brown }), P(G.cone(0.05, 0.04, 4), 'wood', [x * 0.92, 0.62, -0.02], { r: [0, PI / 4, 0], c: COL.brown }));
    for (const y of [0.17, 0.43]) p.push(P(G.box(1.0, 0.07, 0.03), 'wood', [0, y, 0.03], { c: COL.tan }));
    const heights = [0.5, 0.56, 0.47, 0.58, 0.52, 0.3, 0.55, 0.49, 0.57, 0.51];
    heights.forEach((h, i) => {
      const x = -0.45 + i * 0.1;
      const c = i % 3 === 1 ? COL.cream : i % 3 === 2 ? COL.tan : COL.sand;
      p.push(P(G.box(0.08, h, 0.016), 'wood', [x, h / 2 + 0.03, 0.054], { r: [0, 0, (i * 37 % 7 - 3) * 0.012], c, uvo: [i * 0.13, 0] }));
      if (h > 0.4) p.push(P(G.cone(0.046, 0.04, 4), 'wood', [x, h + 0.048, 0.054], { r: [0, PI / 4, 0], s: [1, 1, 0.25], c }));
    });
    p.push(P(G.cloth(0.12, 0.16, 2, 3), 'flag', [-0.02, 0.5, 0.068], { r: [0, 0, -HALF], team: true }));
    return B(1, 0.7, p);
  });

  // ---------------- Betonfal (precast panel wall along x, 1x1) ----------------
  def('wall', () => {
    const p = [
      P(G.box(1.0, 0.82, 0.14), 'panel', [0, 0.43, 0], { c: COL.plasterGrey }),
      ...[-0.5, 0.5].map((x) => P(G.box(0.14, 0.92, 0.26), 'concrete', [x * 0.93, 0.46, 0])),
      P(G.box(1.02, 0.07, 0.3), 'concrete', [0, 0.05, 0]),
      P(G.rbox(1.02, 0.05, 0.2, 0.008), 'concrete', [0, 0.865, 0]),
      P(G.box(1.004, 0.1, 0.146), 'paint', [0, 0.64, 0]),
      ...[-0.3, 0.12, 0.36].map((x) => P(G.cyl(0.008, 0.2, 4), 'rust', [x, 0.97, 0], { r: [0.25, 0, x] })),
      decal(0.8, 0.4, 3, [0, 0.36, 0.073])
    ];
    // coil of barbed wire along the top
    for (let i = 0; i < 9; i++) p.push(P(G.torus(0.07, 0.004, 3, 12), 'metal', [-0.44 + i * 0.11, 0.96, 0], { r: [0, HALF + 0.35, 0], c: COL.lightGrey }));
    return B(1, 1.05, p);
  });

  const genericBuilding = (size) => B(size, 1.4, [
    P(G.box(size * 0.8, 0.9, size * 0.8), 'plaster', [0, 0.47, 0], { c: COL.plasterGrey }),
    P(G.box(size * 0.82, 0.08, size * 0.82), 'paint', [0, 0.8, 0]),
    at(gableRoof(size * 0.8, size * 0.8, 0.4, { overhang: 0.08 }), [0, 0.92, 0]),
    at(doorUnit(0.26, 0.5), [0, 0.03, size * 0.4 + 0.002]),
    at(windowUnit(0.24, 0.22, { lit: true }), [size * 0.24, 0.52, size * 0.4 + 0.002])
  ]);

  // ---------------- resource nodes (origin = tile centre) ----------------
  // Vas: a heap of household and factory scrap
  def('node_iron', () => finalize([
    P(G.rock(0.34, 31, 2, 0.3), 'sheet', [0, 0.04, 0], { s: [1.15, 0.5, 1] }),
    // washing machine on its side, radiator, engine block, girder, pipes, sheet, wheel
    P(G.rbox(0.26, 0.26, 0.3, 0.02), 'matte', [0.14, 0.2, -0.1], { r: [0.3, 0.4, 0.5], c: COL.offWhite }),
    P(G.torus(0.07, 0.014, 5, 12), 'metal', [0.2, 0.26, 0.04], { r: [0.3, 0.4, 0.5], c: COL.lightGrey }),
    P(G.cyl(0.062, 0.01, 12), 'glass', [0.2, 0.26, 0.04], { r: [HALF + 0.3, 0.4, 0.5] }),
    ...Array.from({ length: 6 }, (_, i) => P(G.rbox(0.028, 0.22, 0.06, 0.008), 'matte', [-0.28 + i * 0.034, 0.15, 0.16], { r: [0.5, -0.4, 0.1], c: COL.offWhite, shade: 0.9 })),
    P(G.rbox(0.2, 0.14, 0.14, 0.02), 'metal', [-0.1, 0.24, -0.16], { r: [0.2, 1, 0.3], c: COL.iron }),
    P(G.extrude([[-0.03, -0.04], [0.03, -0.04], [0.03, -0.03], [0.006, -0.03], [0.006, 0.03], [0.03, 0.03], [0.03, 0.04], [-0.03, 0.04], [-0.03, 0.03], [-0.006, 0.03], [-0.006, -0.03], [-0.03, -0.03]], 0.7, 0, 'ibeam'), 'rust', [-0.02, 0.3, 0.02], { r: [0.3, 0.9, 0.2] }),
    P(G.cyl(0.04, 0.6, 8, 0.04, true), 'steel', [-0.14, 0.14, 0.22], { r: [0.2, 0.7, HALF] }),
    P(G.cyl(0.025, 0.5, 6), 'rust', [0.1, 0.36, 0.1], { r: [1.0, 0.3, 0.3] }),
    P(G.corr(0.36, 0.3, 0.05, 0.008), 'sheet', [0.24, 0.1, 0.24], { r: [-1.1, 0.5, 0.2], keepUV: true }),
    ...place(spokedWheel(kit, 0.12, undefined, { spokes: 10, width: 0.012 }), [-0.3, 0.14, -0.12], [0.3, 0.3, 0.9]),
    P(G.lathe([[0.07, -0.04], [0.12, -0.045], [0.13, -0.03], [0.13, 0.03], [0.12, 0.045], [0.07, 0.04]], 12), 'matte', [0.3, 0.05, -0.28], { c: COL.tyre }),
    P(G.rock(0.07, 33, 0, 0.4), 'steel', [0.02, 0.38, -0.02]),
    P(G.rock(0.06, 34, 0, 0.4), 'rust', [-0.22, 0.3, 0.02])
  ], null, { top: 0.6, radius: 0.5 }));

  // Réz & Arany: a wooden cable reel, coils of stripped wire, pipes and an old boiler
  def('node_copper', () => finalize([
    ...[-0.13, 0.13].flatMap((z) => [
      P(G.cyl(0.24, 0.03, 16), 'wood', [-0.1, 0.24, z], { r: [HALF, 0, 0], c: COL.tan }),
      ...[0, 1, 2, 3].map((i) => P(G.box(0.44, 0.03, 0.012), 'wood', [-0.1, 0.24, z + Math.sign(z) * 0.018], { r: [0, 0, i * PI / 4], c: COL.brown }))
    ]),
    P(G.cyl(0.15, 0.24, 14), 'copper', [-0.1, 0.24, 0], { r: [HALF, 0, 0] }),
    ...Array.from({ length: 7 }, (_, i) => P(G.torus(0.152, 0.012, 4, 16), 'copper', [-0.1, 0.24, -0.09 + i * 0.03], {})),
    P(G.cyl(0.03, 0.34, 8), 'metal', [-0.1, 0.24, 0], { r: [HALF, 0, 0], c: COL.char }),
    P(G.tube([[-0.1, 0.09, 0.09], [0.02, 0.03, 0.14], [0.14, 0.02, 0.3], [0.05, 0.02, 0.38]], 0.012, 5), 'copper', [0, 0, 0]),
    ...[0, 1, 2, 3, 4].map((i) => P(G.cyl(0.022, 0.72, 8, 0.022, true), 'copper', [0.2 + (i % 3) * 0.045, 0.03 + Math.floor(i / 3) * 0.04, -0.1 + (i % 2) * 0.02], { r: [0, 0.35, HALF] })),
    ...[0, 1, 2].map((i) => P(G.torus(0.1, 0.022, 6, 14), 'copper', [0.22, 0.025 + i * 0.042, 0.26], { r: [HALF, 0, i * 0.8], s: [1, 1 - i * 0.06, 1] })),
    P(G.lathe([[0.001, 0], [0.07, 0.01], [0.085, 0.05], [0.085, 0.2], [0.06, 0.25], [0.02, 0.265]], 12), 'copper', [-0.3, 0.085, -0.3], { r: [HALF, 0.5, 0] }),
    P(G.rbox(0.16, 0.012, 0.22, 0.004), 'copper', [0.04, 0.02, -0.3], { r: [0.1, 0.7, 0] }),
    P(G.sph(0.03, 8, 6), 'gold', [0.1, 0.035, -0.26]),
    P(G.torus(0.025, 0.006, 4, 10), 'gold', [0.0, 0.035, -0.34], { r: [HALF, 0, 0] })
  ], null, { top: 0.6, radius: 0.5 }));

  // Kaja: crates of produce, sacks of potatoes, pumpkins and a churn
  def('node_food', () => {
    const produce = (c, n, y) => Array.from({ length: n }, (_, i) => P(G.sph(0.045, 7, 5), 'cloth', [(i % 3 - 1) * 0.07, y, (Math.floor(i / 3) - 0.5) * 0.08], { c, s: [1, 0.85, 1], shade: 0.85 + (i % 3) * 0.08 }));
    const pumpkin = (r) => [P(G.sph(1, 10, 6), 'cloth', [0, r * 0.75, 0], { c: COL.hivis, s: [r, r * 0.75, r] }), P(G.cyl(0.012, 0.04, 5), 'cloth', [0, r * 1.5, 0], { c: COL.olive })];
    return finalize([
      ...place(crate(0.28, 0.2, 0.26), [-0.18, 0, -0.14]), ...place(produce(COL.leaf, 6, 0.2), [-0.18, 0, -0.14]),
      ...place(crate(0.28, 0.2, 0.26), [0.16, 0, -0.18], [0, 0.4, 0]), ...place(produce(COL.red, 6, 0.2), [0.16, 0, -0.18], [0, 0.4, 0]),
      ...place(crate(0.26, 0.18, 0.24), [-0.03, 0.2, -0.16], [0, 0.9, 0]), ...place(produce(COL.yellow, 6, 0.18), [-0.03, 0.2, -0.16], [0, 0.9, 0]),
      P(G.capsule(0.1, 0.14, 8), 'burlap', [0.28, 0.14, 0.22], { c: COL.sand, s: [1, 1.1, 0.85] }),
      P(G.cyl(0.03, 0.05, 6, 0.05), 'burlap', [0.28, 0.3, 0.22], { c: COL.sand }),
      P(G.capsule(0.09, 0.16, 8), 'burlap', [0.1, 0.09, 0.3], { r: [0, 0.5, HALF], c: COL.khaki }),
      ...place(pumpkin(0.11), [-0.26, 0, 0.24]), ...place(pumpkin(0.08), [-0.1, 0, 0.32]), ...place(pumpkin(0.06), [-0.36, 0, 0.08]),
      ...[[-0.02, 0.12], [0.06, 0.2], [0.0, 0.24]].map(([x, z]) => P(G.sph(0.05, 8, 6), 'cloth', [x, 0.04, z], { c: COL.leaf, s: [1, 0.85, 1] })),
      P(G.lathe([[0.06, 0], [0.065, 0.16], [0.04, 0.21], [0.04, 0.24], [0.048, 0.245]], 10), 'metal', [0.34, 0, -0.02], { c: COL.lightGrey })
    ], null, { top: 0.6, radius: 0.5 });
  });

  // Fa & Tégla: stickered timber stack, logs, a pallet of bricks and the chopping block
  def('node_wood', () => {
    const p = [];
    for (let r = 0; r < 4; r++) {
      for (let i = 0; i < 4; i++) p.push(P(G.box(0.62, 0.035, 0.1), 'wood', [-0.05, 0.05 + r * 0.06, -0.3 + i * 0.11], { r: [0, (i * 3 + r) % 3 * 0.02 - 0.02, 0], c: (i + r) % 2 ? COL.tan : COL.sand }));
      if (r < 3) for (const x of [-0.28, 0.18]) p.push(P(G.box(0.03, 0.022, 0.46), 'wood', [x, 0.08 + r * 0.06, -0.135], { c: COL.brown }));
    }
    for (const [x, y, z, a] of [[-0.2, 0.06, 0.26, 0.1], [-0.06, 0.06, 0.3, -0.05], [0.08, 0.06, 0.27, 0.12], [-0.13, 0.16, 0.28, 0], [0.01, 0.16, 0.29, 0.06]]) {
      p.push(P(G.cyl(0.06, 0.6, 9, 0.055), 'wood', [x, y, z], { r: [0, a, HALF], c: COL.brown }));
      for (const sd of [-1, 1]) p.push(P(G.cyl(0.052, 0.004, 9), 'matte', [x + sd * 0.301 * Math.cos(a), y, z - sd * 0.301 * Math.sin(a)], { r: [0, a, HALF], c: COL.straw }));
    }
    p.push(...place(pallet(), [0.32, 0, -0.1], [0, HALF + 0.1, 0], 0.62));
    p.push(P(G.box(0.26, 0.16, 0.22), 'brick', [0.32, 0.12, -0.1], { r: [0, 0.1, 0] }), P(G.box(0.12, 0.05, 0.22), 'brick', [0.28, 0.225, -0.1], { r: [0, 0.1, 0] }));
    p.push(P(G.cyl(0.09, 0.14, 10), 'wood', [0.3, 0.07, 0.3], { c: COL.brown }), P(G.cyl(0.082, 0.004, 10), 'matte', [0.3, 0.142, 0.3], { c: COL.straw }));
    p.push(P(G.cyl(0.01, 0.3, 5), 'wood', [0.33, 0.25, 0.27], { r: [0.2, 0, -0.75], c: COL.tan }), P(G.extrude([[-0.03, -0.025], [0.045, -0.04], [0.045, 0.04], [-0.03, 0.02]], 0.014, 0, 'axe'), 'metal', [0.25, 0.165, 0.29], { r: [0.2, HALF, -0.75], c: COL.iron }));
    return finalize(p, null, { top: 0.5, radius: 0.5 });
  });

  return { genericBuilding };
}
