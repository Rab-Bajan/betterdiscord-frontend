// Wheeled units: the horse trader's wagon, the Lada brigade's saloon and the piston battering ram.
// Origin on the ground under the middle of the vehicle, facing +z.
import { COL, HALF, PI } from './modelKit.ts';
import { human, spokedWheel } from './humans.ts';
import type { JointDefs, Kit, MatKey, PartOptions, RawPart, Vec3T } from './modelKit.ts';
import type { Pose } from './humans.ts';
import type { DefineModel } from './models.ts';
import type * as THREE from 'three';

// pneumatic tyre on a steel rim, axle along x; identical on both faces so every wheel shares one geometry
interface TyreWheelOptions {
  hub?: MatKey;
  hubC?: number;
  tread?: number;
}
function tyreWheel(kit: Kit, r: number, w: number, j: string, { hub = 'chrome', hubC = COL.white, tread = 0 }: TyreWheelOptions = {}): RawPart[] {
  const { G, P } = kit;
  const side = (g: THREE.BufferGeometry, m: MatKey, x: PartOptions): RawPart => P(g, m, [0, 0, 0], { r: [0, 0, HALF], j, ...x });
  const out = [
    side(G.lathe([[r * 0.58, -w * 0.44], [r * 0.9, -w * 0.5], [r, -w * 0.36], [r, w * 0.36], [r * 0.9, w * 0.5], [r * 0.58, w * 0.44]], 18), 'matte', { c: COL.tyre }),
    side(G.lathe([[0.001, -w * 0.42], [r * 0.3, -w * 0.47], [r * 0.56, -w * 0.4], [r * 0.6, -w * 0.3], [r * 0.6, w * 0.3], [r * 0.56, w * 0.4], [r * 0.3, w * 0.47], [0.001, w * 0.42]], 14), hub, { c: hubC })
  ];
  for (let i = 0; i < tread; i++) {
    const a = i / tread * PI * 2;
    out.push(P(G.box(w * 0.9, r * 0.07, r * 0.16), 'matte', [0, Math.cos(a) * r, Math.sin(a) * r], { r: [a, 0, 0], j, c: COL.rubber }));
  }
  return out;
}

export function defineVehicles(kit: Kit, def: DefineModel): void {
  const { G, P, finalize } = kit;

  // Ladás Brigád: boxy three-box saloon with chrome bumpers, round headlights and a loaded roof rack
  def('lada', () => {
    const WR = 0.105, WZ = 0.33, W = 0.5;
    const arch = (cz: number, from: number, to: number): Array<[number, number]> => { const pts: Array<[number, number]> = []; for (let i = 0; i <= 7; i++) { const a = from + (to - from) * i / 7; pts.push([cz + Math.cos(a) * (WR + 0.022), 0.105 + Math.sin(a) * (WR + 0.022)]); } return pts; };
    const profile: Array<readonly [number, number]> = [
      [-0.525, 0.15], [-0.535, 0.21], [-0.528, 0.3], [-0.5, 0.316], [-0.29, 0.322], [0.17, 0.322], [0.47, 0.3], [0.52, 0.282], [0.532, 0.2], [0.522, 0.15],
      ...arch(WZ, 0.36, PI - 0.36), [0.1, 0.132], [-0.1, 0.132], ...arch(-WZ, 0.36, PI - 0.36)
    ];
    const cabin: Array<readonly [number, number]> = [[-0.3, 0.31], [-0.235, 0.452], [0.055, 0.458], [0.175, 0.31]];
    const p = [
      P(G.extrude(profile, W, 0.018, 'ladaBody'), 'paint', [0, 0, 0]),
      P(G.extrude(cabin, W - 0.07, 0.012, 'ladaCabin'), 'glass', [0, 0, 0]),
      P(G.rbox(W - 0.06, 0.022, 0.31, 0.01), 'paint', [0, 0.466, -0.09]),
      P(G.box(W - 0.08, 0.05, 0.92), 'matte', [0, 0.11, 0], { c: COL.black }),
      // window pillars and frames
      ...[-1, 1].flatMap((sd) => [
        P(G.rbox(0.022, 0.185, 0.024, 0.006), 'paint', [sd * 0.212, 0.386, 0.116], { r: [-0.68, 0, sd * -0.06] }),
        P(G.rbox(0.022, 0.15, 0.026, 0.006), 'paint', [sd * 0.214, 0.386, -0.09], { r: [0, 0, sd * -0.06] }),
        P(G.rbox(0.022, 0.155, 0.05, 0.006), 'paint', [sd * 0.212, 0.386, -0.268], { r: [0.43, 0, sd * -0.06] }),
        P(G.rbox(0.012, 0.012, 0.3, 0.004), 'paint', [sd * 0.207, 0.456, -0.09]),
        // doors: shut lines, handles, chrome waist trim, sill
        ...[0.15, -0.09, -0.295].map((z) => P(G.box(0.004, 0.16, 0.004), 'matte', [sd * 0.2515, 0.235, z], { c: COL.black })),
        ...[0.06, -0.17].map((z) => P(G.rbox(0.008, 0.01, 0.034, 0.003), 'chrome', [sd * 0.254, 0.29, z])),
        P(G.box(0.005, 0.007, 0.98), 'chrome', [sd * 0.2525, 0.262, 0]),
        P(G.box(0.006, 0.02, 0.42), 'matte', [sd * 0.25, 0.15, 0], { c: COL.char }),
        P(G.rbox(0.03, 0.022, 0.014, 0.005), 'chrome', [sd * 0.268, 0.34, 0.15]),
        P(G.cyl(0.004, 0.03, 4), 'chrome', [sd * 0.256, 0.33, 0.15], { r: [0, 0, HALF] })
      ]),
      P(G.rbox(W - 0.1, 0.012, 0.012, 0.004), 'paint', [0, 0.452, 0.058]),
      P(G.rbox(W - 0.1, 0.012, 0.012, 0.004), 'paint', [0, 0.447, -0.238]),
      // wipers
      ...[-0.1, 0.08].map((x) => P(G.box(0.14, 0.003, 0.004), 'matte', [x, 0.336, 0.166], { c: COL.black, r: [0, 0, 0.12] })),
      // front: grille, twin round lamps, indicators, bumper with overriders, plate
      P(G.rbox(0.25, 0.062, 0.012, 0.004), 'matte', [0, 0.248, 0.548], { c: COL.black }),
      ...[-0.05, -0.025, 0, 0.025, 0.05].map((y) => P(G.box(0.25, 0.004, 0.004), 'chrome', [0, 0.248 + y * 0.5, 0.556])),
      P(G.rbox(0.44, 0.078, 0.008, 0.003), 'chrome', [0, 0.248, 0.544]),
      ...[-1, 1].flatMap((sd) => [
        P(G.cyl(0.036, 0.016, 14), 'chrome', [sd * 0.172, 0.25, 0.55], { r: [HALF, 0, 0] }),
        P(G.dome(0.03, 12, 4), 'headlight', [sd * 0.172, 0.25, 0.554], { r: [HALF, 0, 0], s: [1, 0.4, 1] }),
        P(G.rbox(0.04, 0.014, 0.008, 0.003), 'satin', [sd * 0.19, 0.2, 0.552], { c: COL.hivis }),
        P(G.rbox(0.03, 0.055, 0.04, 0.008), 'chrome', [sd * 0.14, 0.178, 0.575]),
        P(G.rbox(0.03, 0.055, 0.04, 0.008), 'chrome', [sd * 0.14, 0.178, -0.575]),
        // tail lamps with a chrome surround
        P(G.rbox(0.075, 0.05, 0.008, 0.003), 'chrome', [sd * 0.185, 0.262, -0.546]),
        P(G.rbox(0.066, 0.02, 0.012, 0.003), 'taillight', [sd * 0.185, 0.272, -0.548]),
        P(G.rbox(0.066, 0.016, 0.012, 0.003), 'satin', [sd * 0.185, 0.25, -0.548], { c: COL.hivis })
      ]),
      P(G.rbox(0.54, 0.036, 0.036, 0.014), 'chrome', [0, 0.172, 0.562]),
      P(G.rbox(0.54, 0.036, 0.036, 0.014), 'chrome', [0, 0.172, -0.562]),
      P(G.card(0.13, 0.045, 4, 2, 4), 'sign', [0, 0.172, 0.5815]),
      P(G.card(0.13, 0.045, 4, 2, 4), 'sign', [0, 0.212, -0.553], { r: [0, PI, 0] }),
      P(G.box(0.12, 0.01, 0.004), 'chrome', [0, 0.305, -0.541]),
      P(G.cyl(0.014, 0.08, 7), 'metal', [-0.15, 0.115, -0.55], { r: [HALF, 0, 0], c: COL.iron }),
      P(G.cyl(0.0025, 0.26, 4), 'chrome', [0.21, 0.44, 0.2], { r: [-0.35, 0, 0] }),
      // roof rack: rails, crossbars and the brigade's luggage
      ...[-1, 1].map((sd) => P(G.cyl(0.006, 0.3, 5), 'metal', [sd * 0.19, 0.5, -0.09], { r: [HALF, 0, 0], c: COL.lightGrey })),
      ...[-0.22, -0.09, 0.04].map((z) => P(G.cyl(0.006, 0.4, 5), 'metal', [0, 0.5, z], { r: [0, 0, HALF], c: COL.lightGrey })),
      ...[-1, 1].flatMap((sd) => [-0.22, 0.04].map((z) => P(G.cyl(0.005, 0.03, 4), 'metal', [sd * 0.19, 0.486, z], { c: COL.lightGrey }))),
      P(G.rbox(0.2, 0.08, 0.26, 0.012), 'cloth', [-0.08, 0.546, -0.1], { c: COL.leather }),
      ...[-0.18, -0.02].map((z) => P(G.box(0.204, 0.084, 0.014), 'cloth', [-0.08, 0.546, z], { c: COL.tan })),
      P(G.capsule(0.045, 0.22, 8), 'burlap', [0.12, 0.552, -0.08], { r: [HALF, 0, 0], c: COL.sand }),
      P(G.cyl(0.04, 0.3, 10), 'cloth', [0.02, 0.63, -0.09], { r: [HALF, 0.2, 0], c: COL.red }),
      P(G.tube([[-0.19, 0.5, -0.16], [-0.08, 0.6, -0.16], [0.05, 0.66, -0.15], [0.19, 0.5, -0.15]], 0.004, 4), 'matte', [0, 0, 0], { c: COL.yellow })
    ];
    const joints: JointDefs = {};
    for (const sd of [-1, 1]) for (const z of [WZ, -WZ]) {
      const j = `w${sd}${z > 0 ? 'f' : 'r'}`;
      joints[j] = { p: [sd * 0.228, WR, z], src: 'wheel', swing: 0.11 / WR, share: 'ladaWheel' };
      p.push(...tyreWheel(kit, WR, 0.075, j));
    }
    return finalize(p, joints, { top: 0.78, radius: 0.72, vehicle: true });
  });

  // Lókupec: a bay horse in harness pulling a plank wagon with the trader on the seat
  def('horseWagon', () => {
    const p: RawPart[] = [];
    const hide = (g: THREE.BufferGeometry, pos: Vec3T, x: PartOptions = {}): number => p.push(P(g, 'cloth', pos, { c: COL.horse, ...x }));
    const HZ = 0.66; // middle of the horse along z
    hide(G.lathe([[0.001, -0.3], [0.085, -0.285], [0.125, -0.19], [0.118, 0], [0.128, 0.14], [0.112, 0.25], [0.07, 0.3], [0.001, 0.31]], 12), [0, 0.6, HZ], { r: [HALF, 0, 0], s: [0.84, 1, 1] });
    hide(G.lathe([[0.085, -0.02], [0.066, 0.1], [0.05, 0.22], [0.046, 0.27]], 10), [0, 0.63, HZ + 0.24], { r: [0.72, 0, 0], s: [0.66, 1, 1] });
    hide(G.lathe([[0.001, -0.03], [0.044, -0.01], [0.05, 0.05], [0.038, 0.15], [0.03, 0.2], [0.001, 0.215]], 10), [0, 0.84, HZ + 0.4], { r: [2.05, 0, 0], s: [0.72, 1, 1] });
    hide(G.sph(1, 8, 6), [0, 0.855, HZ + 0.43], { s: [0.034, 0.03, 0.04] });
    for (const sd of [-1, 1]) {
      hide(G.cone(0.014, 0.045, 5), [sd * 0.024, 0.905, HZ + 0.4], { r: [-0.25, 0, sd * -0.2] });
      hide(G.sph(0.008, 6, 4), [sd * 0.03, 0.845, HZ + 0.47], { c: COL.black });
      hide(G.sph(0.006, 5, 4), [sd * 0.014, 0.76, HZ + 0.585], { c: COL.black });
    }
    hide(G.rbox(0.018, 0.07, 0.3, 0.008), [0, 0.795, HZ + 0.305], { r: [-0.85, 0, 0], c: COL.horseDark });
    hide(G.rbox(0.03, 0.03, 0.07, 0.01), [0, 0.89, HZ + 0.44], { r: [0.5, 0, 0], c: COL.horseDark });
    hide(G.lathe([[0.01, -0.36], [0.034, -0.25], [0.03, -0.1], [0.014, 0]], 8), [0, 0.67, HZ - 0.3], { r: [-0.3, 0, 0], c: COL.horseDark });
    // harness: collar, girth in the team colour, bridle, traces to the wagon
    hide(G.torus(0.075, 0.02, 6, 14), [0, 0.67, HZ + 0.25], { r: [-0.85, 0, 0], c: COL.leather, s: [0.74, 1.15, 1] });
    p.push(P(G.cyl(0.127, 0.11, 14, 0.123, true), 'cloth', [0, 0.6, HZ + 0.03], { r: [HALF, 0, 0], s: [0.85, 1, 1], team: true }));
    hide(G.torus(0.04, 0.005, 4, 10), [0, 0.8, HZ + 0.5], { r: [0.5, 0, 0], c: COL.leather, s: [0.75, 1, 1] });
    for (const sd of [-1, 1]) {
      p.push(P(G.cyl(0.011, 0.86, 6), 'wood', [sd * 0.135, 0.5, 0.46], { r: [HALF - 0.1, 0, 0] }));
      p.push(P(G.tube([[sd * 0.03, 0.79, HZ + 0.5], [sd * 0.09, 0.72, HZ + 0.1], [sd * 0.1, 0.73, 0.3], [sd * 0.08, 0.76, 0.1]], 0.003, 4), 'matte', [0, 0, 0], { c: COL.leather }));
    }
    const joints: JointDefs = {};
    const leg = (name: string, x: number, z: number, src: string, knee: string): void => {
      joints[name] = { p: [x, 0.52, z], src };
      joints[`${name}k`] = { parent: name, p: [0, -0.24, 0], src: knee };
      hide(G.lathe([[0.027, -0.24], [0.033, -0.15], [0.05, -0.03], [0.05, 0.05]], 8), [0, 0, 0], { j: name });
      hide(G.sph(0.03, 7, 5), [0, 0, 0], { j: `${name}k` });
      hide(G.lathe([[0.023, -0.225], [0.02, -0.12], [0.027, -0.01]], 8), [0, 0, 0], { j: `${name}k`, c: COL.horseDark });
      hide(G.cyl(0.032, 0.045, 8, 0.026), [0, -0.2575, 0.004], { j: `${name}k`, c: COL.black });
    };
    leg('fl', -0.062, HZ + 0.19, 'legL', 'kneeL'); leg('fr', 0.062, HZ + 0.19, 'legR', 'kneeR');
    leg('rl', -0.066, HZ - 0.22, 'legR', 'kneeR'); leg('rr', 0.066, HZ - 0.22, 'legL', 'kneeL');

    // wagon
    const BZ = -0.3;
    p.push(P(G.rbox(0.5, 0.03, 0.8, 0.006), 'planks', [0, 0.37, BZ], { r: [0, HALF, 0] }));
    for (const sd of [-1, 1]) {
      for (const [y, lean] of [[0.425, 0.012], [0.505, 0.03]] as const) p.push(P(G.rbox(0.018, 0.07, 0.8, 0.004), 'wood', [sd * (0.25 + lean), y, BZ], { r: [0, 0, sd * -0.2] }));
      for (const z of [-0.3, 0, 0.3]) p.push(P(G.rbox(0.022, 0.2, 0.03, 0.004), 'wood', [sd * 0.275, 0.46, BZ + z], { r: [0, 0, sd * -0.2], c: COL.tan }));
    }
    for (const z of [0.395, -0.395]) p.push(P(G.rbox(0.52, 0.15, 0.018, 0.004), 'planks', [0, 0.455, BZ + z]));
    p.push(P(G.rbox(0.46, 0.022, 0.15, 0.006), 'wood', [0, 0.585, 0.03]));
    for (const sd of [-1, 1]) p.push(P(G.rbox(0.02, 0.2, 0.02, 0.004), 'wood', [sd * 0.2, 0.48, 0.03]));
    p.push(P(G.rbox(0.4, 0.02, 0.12, 0.005), 'wood', [0, 0.39, 0.2], { r: [-0.5, 0, 0] }));
    for (const z of [0.0, -0.56]) p.push(P(G.cyl(0.013, 0.62, 6), 'metal', [0, z === 0 ? 0.165 : 0.2, z], { r: [0, 0, HALF], c: COL.iron }));
    p.push(P(G.rbox(0.07, 0.035, 0.6, 0.006), 'wood', [0, 0.335, -0.28]));
    // load: hay bales with twine, a milk churn, sacks and a blanket in the team colour
    p.push(P(G.rbox(0.3, 0.17, 0.2, 0.025), 'burlap', [0.08, 0.475, -0.5], { c: COL.hay }));
    p.push(P(G.rbox(0.2, 0.16, 0.3, 0.025), 'burlap', [-0.12, 0.47, -0.22], { c: COL.straw, r: [0, 0.15, 0] }));
    for (const x of [0.0, 0.16]) p.push(P(G.box(0.006, 0.174, 0.204), 'matte', [x, 0.475, -0.5], { c: COL.tan }));
    p.push(P(G.capsule(0.07, 0.14, 8), 'burlap', [0.13, 0.46, -0.2], { r: [HALF, 0.4, 0], c: COL.sand }));
    p.push(P(G.lathe([[0.05, 0], [0.052, 0.13], [0.03, 0.17], [0.03, 0.2], [0.036, 0.205]], 10), 'metal', [-0.14, 0.385, -0.52], { c: COL.lightGrey }));
    p.push(P(G.rbox(0.3, 0.02, 0.24, 0.008), 'cloth', [0.08, 0.57, -0.5], { team: true, r: [0.03, 0.1, 0] }));
    for (const sd of [-1, 1]) {
      const jf = `wf${sd}`, jr = `wr${sd}`;
      joints[jf] = { p: [sd * 0.31, 0.165, 0.0], src: 'wheel', swing: 0.11 / 0.165, share: 'wagonFront' };
      joints[jr] = { p: [sd * 0.31, 0.2, -0.56], src: 'wheel', swing: 0.11 / 0.2, share: 'wagonRear' };
      p.push(...spokedWheel(kit, 0.165, jf, { wood: true, spokes: 10, width: 0.022 }), ...spokedWheel(kit, 0.2, jr, { wood: true, spokes: 12, width: 0.024 }));
    }
    // the trader, seated with the reins in his hands
    const fixed = (rest: Vec3T): Pose[string] => ({ src: null, rest });
    const d = human(kit, {
      prefix: 'd_', at: [0, 0.23, 0.0], scale: 0.94, legs: COL.coat, shoes: COL.brown, boots: true, hairC: COL.hair, moustache: true, skin: COL.skinDark, top: COL.offWhite, topTeam: false,
      pose: { hipL: fixed([-1.45, 0, -0.12]), hipR: fixed([-1.45, 0, 0.12]), kneeL: fixed([1.35, 0, 0]), kneeR: fixed([1.35, 0, 0]), shL: fixed([-0.55, 0, -0.12]), shR: fixed([-0.55, 0, 0.12]), elL: fixed([-0.95, 0, 0]), elR: fixed([-0.95, 0, 0]) }
    });
    d.body(G.lathe([[0.106, 0.476], [0.1, 0.51], [0.104, 0.56], [0.12, 0.625], [0.114, 0.655]], 12), [0, 0, -0.006], { c: COL.white, team: true, s: [d.bw, 1, d.bd] });
    d.head(G.lathe([[0.0625, 0], [0.058, 0.04], [0.04, 0.062], [0.001, 0.06]], 12), [0, 0.8, 0], { c: COL.brown, s: [1, 1, 1.1] });
    d.head(G.cyl(0.1, 0.006, 14), [0, 0.802, 0], { c: COL.brown, s: [1, 1, 1.1] });
    const f = d.finish();
    p.push(...f.parts);
    return finalize(p, { ...joints, ...f.joints }, { top: 1.08, radius: 0.72, vehicle: true });
  });

  // Dugattyús Faltörő: welded scrap chassis with a hydraulic ram punching out of the front
  def('ram', () => {
    const WR = 0.15;
    const p = [
      P(G.rbox(0.5, 0.07, 1.02, 0.012), 'steel', [0, 0.27, 0]),
      ...[-1, 1].map((sd) => P(G.rbox(0.05, 0.1, 1.06, 0.01), 'steel', [sd * 0.22, 0.25, 0])),
      // armour plates in the team colour, studded with rivets
      ...[-1, 1].flatMap((sd) => [
        P(G.rbox(0.022, 0.3, 0.86, 0.006), 'paint', [sd * 0.3, 0.5, -0.02], { r: [0, 0, sd * 0.14] }),
        ...[-0.36, -0.12, 0.12, 0.36].flatMap((z) => [0.4, 0.6].map((y) => P(G.sph(0.012, 6, 4), 'metal', [sd * (0.315 - (y - 0.5) * 0.14), y, z - 0.02], { c: COL.iron }))),
        P(G.rbox(0.03, 0.56, 0.04, 0.006), 'steel', [sd * 0.27, 0.56, 0.36]),
        P(G.rbox(0.03, 0.56, 0.04, 0.006), 'steel', [sd * 0.27, 0.56, -0.4]),
        P(G.dome(0.03, 10, 4), 'headlight', [sd * 0.2, 0.36, 0.515], { r: [HALF, 0, 0], s: [1, 0.5, 1] }),
        P(G.cyl(0.036, 0.03, 10), 'metal', [sd * 0.2, 0.36, 0.505], { r: [HALF, 0, 0], c: COL.char })
      ]),
      // corrugated roof on a welded frame
      P(G.corr(0.72, 1.02, 0.06, 0.012), 'sheet', [0, 0.855, -0.02], { r: [-HALF, 0, 0], keepUV: true }),
      P(G.rbox(0.6, 0.03, 0.03, 0.006), 'steel', [0, 0.83, 0.36]),
      P(G.rbox(0.6, 0.03, 0.03, 0.006), 'steel', [0, 0.83, -0.4]),
      P(G.cloth(0.5, 0.2, 6, 2), 'flag', [-0.25, 0.72, 0.5], { team: true }),
      // hydraulic cylinder, pump and hoses
      P(G.cyl(0.1, 0.56, 14), 'metal', [0, 0.47, -0.08], { r: [HALF, 0, 0], c: COL.iron }),
      ...[-0.36, 0.2].map((z) => P(G.cyl(0.122, 0.035, 14), 'metal', [0, 0.47, z], { r: [HALF, 0, 0], c: COL.char })),
      ...[0, 1, 2, 3, 4, 5].map((i) => P(G.cyl(0.011, 0.6, 5), 'metal', [Math.cos(i / 6 * PI * 2) * 0.108, 0.47 + Math.sin(i / 6 * PI * 2) * 0.108, -0.08], { r: [HALF, 0, 0], c: COL.lightGrey })),
      P(G.rbox(0.26, 0.2, 0.2, 0.02), 'metal', [0, 0.4, -0.42], { c: COL.char }),
      P(G.cyl(0.05, 0.14, 10), 'rust', [0.07, 0.56, -0.44]),
      P(G.tube([[0.08, 0.5, -0.36], [0.16, 0.6, -0.2], [0.1, 0.57, 0.14]], 0.012, 5), 'matte', [0, 0, 0], { c: COL.rubber }),
      P(G.tube([[-0.08, 0.5, -0.36], [-0.17, 0.56, -0.25], [-0.11, 0.52, -0.3]], 0.012, 5), 'matte', [0, 0, 0], { c: COL.rubber }),
      P(G.cyl(0.022, 0.5, 8), 'rust', [-0.16, 0.72, -0.46]),
      P(G.cyl(0.03, 0.05, 8, 0.022), 'rust', [-0.16, 0.98, -0.46]),
      P(G.tube([[-0.24, 0.3, 0.52], [0.24, 0.3, 0.52]], 0.01, 5, 0.07), 'metal', [0, 0, 0], { c: COL.iron })
    ];
    const joints: JointDefs = { piston: { p: [0, 0.47, 0.2], src: 'piston', axis: 'z' } };
    p.push(
      P(G.cyl(0.05, 0.52, 12), 'chrome', [0, 0, 0.1], { r: [HALF, 0, 0], j: 'piston' }),
      P(G.rbox(0.36, 0.36, 0.09, 0.015), 'steel', [0, 0, 0.4], { j: 'piston' }),
      P(G.rbox(0.3, 0.3, 0.05, 0.01), 'rust', [0, 0, 0.46], { j: 'piston' }),
      ...([[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]] as const).map(([a, b]) => P(G.cone(0.045, 0.12, 4), 'metal', [a * 0.095, b * 0.095, 0.53], { r: [HALF, 0, 0], j: 'piston', c: COL.iron })),
      ...[-1, 1].map((sd) => P(G.rbox(0.04, 0.04, 0.3, 0.008), 'steel', [sd * 0.12, -0.1, 0.24], { j: 'piston' }))
    );
    for (const sd of [-1, 1]) for (const z of [0.33, -0.33]) {
      const j = `w${sd}${z > 0 ? 'f' : 'r'}`;
      joints[j] = { p: [sd * 0.33, WR, z], src: 'wheel', swing: 0.11 / WR, share: 'ramWheel' };
      p.push(...tyreWheel(kit, WR, 0.12, j, { hub: 'rust', tread: 14 }));
    }
    return finalize(p, joints, { top: 1.0, radius: 0.72, vehicle: true });
  });
}
