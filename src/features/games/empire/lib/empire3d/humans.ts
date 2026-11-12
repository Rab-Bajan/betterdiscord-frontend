// People of the telep. One parametric body (lathed limbs, shaped torso, face, hair) dressed and equipped
// per unit kind. Feet at y = 0, facing +z, about 0.82 units tall at scale 1.
// Skeleton: hip -> knee and shoulder -> elbow on each side; things held in a hand ride on the forearm.
import { COL, HALF, PI, place } from './modelKit.ts';
import type { JointDef, JointDefs, Kit, MatKey, Model, ModelMeta, PartOptions, RawPart, Vec3T } from './modelKit.ts';
import type { DefineModel } from './models.ts';
import type * as THREE from 'three';

type Side = 'L' | 'R';
export type Pose = Record<string, Partial<JointDef>>;

export interface HumanOptions {
  scale?: number;
  /** trunk width factor */
  tw?: number;
  belly?: number;
  arm?: number;
  leg?: number;
  headScale?: number;
  /** joint name prefix, for a second figure in the same model */
  prefix?: string;
  skin?: number;
  top?: number;
  topTeam?: boolean;
  legs?: number;
  shoes?: number;
  soles?: number;
  hairC?: number;
  beardC?: number;
  hands?: number;
  sleeves?: 'long' | 'short' | 'none';
  shorts?: boolean;
  skirt?: boolean;
  boots?: boolean;
  feet?: boolean;
  stripe?: number;
  belt?: number | false;
  collar?: boolean;
  hair?: 'bald';
  stubble?: boolean;
  moustache?: boolean;
  glasses?: boolean;
  pose?: Pose;
  at?: Vec3T;
}

export type HeadOptions = PartOptions & { mat?: MatKey };

export interface Human {
  parts: RawPart[];
  joints: JointDefs;
  finish(): { parts: RawPart[]; joints: JointDefs };
  head(g: THREE.BufferGeometry, pos: Vec3T, x?: HeadOptions): number;
  body(g: THREE.BufferGeometry, pos: Vec3T, x?: PartOptions): RawPart;
  bw: number;
  bd: number;
  hold(side: Side, g: THREE.BufferGeometry, mat: MatKey, pos: Vec3T, x?: PartOptions): RawPart;
  add(g: THREE.BufferGeometry, mat: MatKey, pos: Vec3T, x?: PartOptions): RawPart;
  joint(name: string, def: JointDef): void;
}

const HIP_Y = 0.425, THIGH = 0.205, SHOULDER_Y = 0.648, UPPER_ARM = 0.15, GRIP = 0.158, HEAD_Y = 0.757;

export function human(kit: Kit, o: HumanOptions = {}): Human {
  const { G, P } = kit;
  const s = o.scale || 1;
  const tw = o.tw || 1;
  const belly = o.belly || 0;
  const arm = o.arm || 1;
  const pre = o.prefix || '';
  const skin = o.skin ?? COL.skin;
  const top = o.top ?? COL.white;
  const topTeam = o.topTeam ?? true;
  const legs = o.legs ?? COL.denim;
  const shoes = o.shoes ?? COL.char;
  const hairC = o.hairC ?? COL.hair;
  const sleeves = o.sleeves || 'long';
  const hands = o.hands ?? skin;
  const parts: RawPart[] = [];
  const C = (g: THREE.BufferGeometry, pos: Vec3T, x?: PartOptions): RawPart => { const p = P(g, 'cloth', pos, x); parts.push(p); return p; };
  const J = (n: string): string => pre + n;

  const pose = o.pose || {};
  const joints: JointDefs = {};
  const joint = (name: string, def: JointDef): void => { joints[J(name)] = { ...def, parent: def.parent ? J(def.parent) : undefined, ...(pose[name] || {}) }; };
  // trunk half-width / depth factors: the lathed trunk is squashed front to back into a ribcage
  const bw = tw * 0.885, bd = 0.72;
  const leg = o.leg || 1;
  const hx = 0.052 * (0.6 + tw * 0.4), sx = 0.099 * tw + 0.012 * arm;
  joint('hipL', { p: [-hx, HIP_Y, 0], src: 'legL' });
  joint('hipR', { p: [hx, HIP_Y, 0], src: 'legR' });
  joint('kneeL', { parent: 'hipL', p: [0, -THIGH, 0], src: 'kneeL' });
  joint('kneeR', { parent: 'hipR', p: [0, -THIGH, 0], src: 'kneeR' });
  joint('shL', { p: [-sx, SHOULDER_Y, 0], rest: [0, 0, -0.1], src: 'armL', actBase: -0.3 });
  joint('shR', { p: [sx, SHOULDER_Y, 0], rest: [0, 0, 0.1], src: 'armR', actBase: -0.75, actAmp: 0.8 });
  joint('elL', { parent: 'shL', p: [0, -UPPER_ARM, 0], src: 'elbowL', hold: -0.14 });
  joint('elR', { parent: 'shR', p: [0, -UPPER_ARM, 0], src: 'elbowR', hold: -0.14, actBase: -0.5, actAmp: 0.4, actPh: 1.2 });

  // ---- legs ----
  const shin = o.shorts ? skin : legs;
  for (const side of ['L', 'R'] as const) {
    const hip = J(`hip${side}`), knee = J(`knee${side}`);
    const LS: Vec3T = [leg, 1, leg];
    // under a long skirt only the shins and feet ever show
    if (!o.skirt) {
      C(G.lathe([[0.036, -THIGH], [0.045, -0.15], [0.056, -0.07], [0.058, -0.02], [0.045, 0.02]], 9), [0, 0, 0], { j: hip, c: legs, s: LS });
      C(G.sph(0.038, 9, 6), [0, 0, 0.002], { j: knee, c: o.shorts ? skin : legs, s: LS });
    }
    C(G.lathe([[0.026, -0.178], [0.03, -0.13], [0.041, -0.06], [0.038, -0.005]], 9), [0, 0, 0], { j: knee, c: shin, s: LS });
    if (o.shorts) C(G.cyl(0.054, 0.025, 9, 0.05, true), [0, -THIGH + 0.02, 0], { j: hip, c: legs, shade: 0.85 });
    else if (!o.boots && !o.skirt) C(G.cyl(0.033, 0.022, 9, 0.029, true), [0, -0.168, 0], { j: knee, c: legs, shade: 0.8, s: LS });
    if (o.boots) C(G.lathe([[0.032, -0.19], [0.034, -0.13], [0.044, -0.07], [0.046, -0.06]], 9), [0, 0, 0], { j: knee, c: shoes, s: LS });
    if (o.stripe) C(G.box(0.006, 0.19, 0.012), [(side === 'L' ? -0.055 : 0.055) * leg, -0.1, 0], { j: hip, c: o.stripe }), C(G.box(0.005, 0.16, 0.01), [(side === 'L' ? -0.039 : 0.039) * leg, -0.09, 0], { j: knee, c: o.stripe });
    if (o.feet !== false) {
      C(G.sph(1, 10, 6), [0, -0.19, 0.022], { j: knee, c: shoes, s: [0.034, 0.03, 0.06] });
      C(G.rbox(0.064, 0.014, 0.12, 0.006), [0, -0.212, 0.021], { j: knee, c: o.soles ?? COL.black });
    }
  }

  // ---- trunk ----
  C(G.lathe([[0.001, 0.384], [0.06, 0.388], [0.098, 0.415], [0.104, 0.472]], 12), [0, 0, 0], { c: legs, s: [bw, 1, bd] });
  if (o.belt !== false) {
    C(G.cyl(0.1055, 0.022, 12), [0, 0.474, belly * 0.012], { c: o.belt ?? COL.leather, s: [bw, 1, bd + 0.01 + belly * 0.2] });
    C(G.rbox(0.022, 0.02, 0.008, 0.003), [0, 0.474, 0.078 + belly * 0.034], { c: COL.lightGrey });
  }
  C(G.lathe([[0.103, 0.47], [0.097 + belly * 0.03, 0.51], [0.101 + belly * 0.022, 0.56], [0.117, 0.625], [0.111, 0.655], [0.07, 0.679], [0.03, 0.692]], 12), [0, 0, belly * 0.022], { c: top, team: topTeam, s: [bw, 1, bd - 0.02 + belly * 0.26] });
  // collar and a button placket give the shirt some tailoring
  if (o.collar !== false) C(G.torus(0.034, 0.009, 5, 12), [0, 0.69, 0.004], { r: [HALF + 0.25, 0, 0], c: top, team: topTeam, shade: 0.88 });
  C(G.cyl(0.027, 0.05, 8), [0, 0.708, 0], { c: skin });

  // ---- head ----
  const hs = o.headScale || 1;
  const head = (g: THREE.BufferGeometry, pos: Vec3T, x: HeadOptions = {}): RawPart => {
    const sc: Vec3T = x.s ? (typeof x.s === 'number' ? [x.s, x.s, x.s] : x.s) : [1, 1, 1];
    return P(g, x.mat || 'cloth', [pos[0] * hs, HEAD_Y + (pos[1] - HEAD_Y) * hs, pos[2] * hs], { ...x, s: [sc[0] * hs, sc[1] * hs, sc[2] * hs] });
  };
  const H = (g: THREE.BufferGeometry, pos: Vec3T, x?: HeadOptions): number => parts.push(head(g, pos, x));
  H(G.sph(1, 14, 10), [0, HEAD_Y, 0.004], { c: skin, s: [0.055, 0.067, 0.061] });
  H(G.sph(1, 8, 6), [0, 0.715, 0.022], { c: skin, s: [0.04, 0.03, 0.04] });
  H(G.sph(1, 6, 5), [0, 0.75, 0.062], { c: skin, s: [0.011, 0.016, 0.014], shade: 0.94 });
  for (const sd of [-1, 1]) {
    H(G.sph(1, 6, 5), [sd * 0.055, 0.755, 0], { c: skin, s: [0.007, 0.016, 0.011], shade: 0.9 });
    H(G.sph(1, 6, 4), [sd * 0.021, 0.766, 0.053], { c: COL.black, s: 0.0062 });
    H(G.rbox(0.024, 0.005, 0.007, 0.002), [sd * 0.021, 0.781, 0.055], { c: hairC, r: [0, 0, sd * -0.12] });
  }
  H(G.rbox(0.026, 0.004, 0.004, 0.0015), [0, 0.728, 0.058], { c: COL.skinDark, shade: 0.75 });
  if (o.hair !== 'bald') {
    H(G.dome(1, 12, 6, 1.9), [0, 0.762, -0.005], { c: hairC, s: [0.058, 0.068, 0.064], r: [-0.42, 0, 0] });
  } else if (o.stubble !== false) {
    H(G.dome(1, 12, 6, 1.75), [0, 0.759, -0.003], { c: skin, s: [0.0558, 0.0678, 0.0618], r: [-0.42, 0, 0], shade: 0.8 });
  }
  if (o.moustache) {
    H(G.rbox(0.056, 0.014, 0.016, 0.006), [0, 0.737, 0.06], { c: o.beardC ?? hairC });
    for (const sd of [-1, 1]) H(G.sph(1, 6, 4), [sd * 0.03, 0.73, 0.055], { c: o.beardC ?? hairC, s: [0.01, 0.014, 0.01] });
  }
  if (o.glasses) {
    H(G.rbox(0.092, 0.018, 0.008, 0.004), [0, 0.767, 0.058], { mat: 'satin', c: COL.black });
    for (const sd of [-1, 1]) H(G.box(0.004, 0.006, 0.06), [sd * 0.052, 0.767, 0.028], { mat: 'satin', c: COL.black });
  }

  // ---- arms ----
  const sleeveC = sleeves === 'none' ? skin : top, sleeveTeam = sleeves !== 'none' && topTeam;
  const foreC = sleeves === 'long' ? top : skin, foreTeam = sleeves === 'long' && topTeam;
  for (const side of ['L', 'R'] as const) {
    const sh = J(`sh${side}`), el = J(`el${side}`);
    const A: Vec3T = [arm, 1, arm];
    C(G.sph(0.038, 9, 6), [0, -0.006, 0], { j: sh, c: sleeveC, team: sleeveTeam, s: A });
    C(G.lathe([[0.026, -UPPER_ARM], [0.031, -0.1], [0.038, -0.035], [0.035, 0.004]], 8), [0, 0, 0], { j: sh, c: sleeveC, team: sleeveTeam, s: A });
    if (sleeves === 'short') C(G.cyl(0.037, 0.02, 8, 0.036, true), [0, -0.075, 0], { j: sh, c: top, team: topTeam, s: A, shade: 0.85 }), C(G.lathe([[0.026, -UPPER_ARM], [0.03, -0.1], [0.034, -0.07]], 8), [0, 0, 0], { j: sh, c: skin, s: [arm * 1.01, 1, arm * 1.01] });
    C(G.sph(0.0275, 8, 6), [0, 0, 0], { j: el, c: foreC, team: foreTeam, s: A });
    C(G.lathe([[0.019, -0.138], [0.023, -0.1], [0.029, -0.035], [0.027, 0]], 8), [0, 0, 0], { j: el, c: foreC, team: foreTeam, s: A });
    if (sleeves === 'long') C(G.cyl(0.0215, 0.018, 8, 0.0215, true), [0, -0.13, 0], { j: el, c: top, team: topTeam, s: A, shade: 0.8 });
    C(G.sph(1, 8, 6), [0, -GRIP, 0.002], { j: el, c: hands, s: [0.019 * arm, 0.03, 0.024 * arm] });
    C(G.sph(1, 6, 4), [side === 'L' ? 0.012 : -0.012, -0.15, 0.017], { j: el, c: hands, s: [0.008, 0.015, 0.009] });
  }

  // ---- finishing: scale the figure and move it to its spot ----
  const origin: Vec3T = o.at || [0, 0, 0];
  const finish = (): { parts: RawPart[]; joints: JointDefs } => {
    for (const p of parts) {
      const e = p.m.elements;
      for (let i = 0; i < 15; i++) if (i % 4 !== 3) e[i] = (e[i] ?? 0) * s;
      if (!p.j) { e[12] += origin[0]; e[13] += origin[1]; e[14] += origin[2]; }
    }
    for (const j of Object.values(joints)) {
      j.p = [j.p[0] * s, j.p[1] * s, j.p[2] * s];
      if (!j.parent) j.p = [j.p[0] + origin[0], j.p[1] + origin[1], j.p[2] + origin[2]];
    }
    return { parts, joints };
  };
  return {
    parts, joints, finish, head: H, body: C, bw, bd,
    // put something in a hand: coordinates are forearm-local with the grip at the origin, -y pointing past the knuckles
    hold: (side, g, mat, pos, x = {}) => { const p = P(g, mat, [pos[0], pos[1] - GRIP, pos[2]], { ...x, j: x.j ? J(x.j) : J(`el${side}`) }); parts.push(p); return p; },
    add: (g, mat, pos, x = {}) => { const p = P(g, mat, pos, { ...x, j: x.j ? J(x.j) : null }); parts.push(p); return p; },
    joint: (name, def) => { joints[J(name)] = { ...def, parent: def.parent ? J(def.parent) : undefined }; }
  };
}

// ---------------- headgear ----------------
function flatCap(h: Human, G: Kit['G'], c: number, team = false): void {
  h.head(G.sph(1, 12, 6), [0, 0.812, 0.006], { c, team, s: [0.063, 0.024, 0.072] });
  h.head(G.rbox(0.072, 0.008, 0.045, 0.003), [0, 0.803, 0.068], { c, team, r: [0.3, 0, 0], shade: 0.85 });
}
function ballCap(h: Human, G: Kit['G'], c: number, team: boolean, backwards = false): void {
  const d = backwards ? -1 : 1;
  h.head(G.dome(1, 12, 5), [0, 0.782, 0], { c, team, s: [0.0595, 0.05, 0.065] });
  h.head(G.cyl(0.05, 0.006, 10), [0, 0.788, d * 0.07], { c, team, s: [1, 1, 0.95], r: [d * 0.12, 0, 0], shade: 0.85 });
  h.head(G.sph(0.006, 6, 4), [0, 0.833, 0], { c, team });
}
function hardHat(h: Human, G: Kit['G'], c: number): void {
  h.head(G.dome(1, 14, 6), [0, 0.782, 0.002], { mat: 'satin', c, s: [0.066, 0.056, 0.07] });
  h.head(G.rbox(0.016, 0.012, 0.125, 0.005), [0, 0.834, 0.002], { mat: 'satin', c });
  h.head(G.cyl(0.076, 0.007, 14), [0, 0.785, 0.01], { mat: 'satin', c, s: [1, 1, 1.12] });
}
interface BrimHatOptions {
  brim?: number;
  crown?: number;
  band?: number;
  bandMat?: MatKey;
  bandTeam?: boolean;
  tilt?: number;
}
function brimHat(h: Human, G: Kit['G'], c: number, { brim = 0.098, crown = 0.064, band = COL.black, bandMat = 'cloth', bandTeam = false, tilt = 0 }: BrimHatOptions = {}): void {
  h.head(G.lathe([[0.0625, 0], [0.061, crown * 0.5], [0.052, crown * 0.92], [0.03, crown], [0.001, crown * 0.94]], 14), [0, 0.8, 0], { c, s: [1, 1, 1.1], r: [tilt, 0, 0] });
  h.head(G.lathe([[0.001, 0.004], [0.06, 0.004], [brim * 0.8, 0], [brim, 0.008], [brim * 0.8, -0.004], [0.06, -0.002], [0.001, -0.002]], 16), [0, 0.801, 0], { c, s: [1, 1, 1.1], r: [tilt, 0, 0] });
  h.head(G.cyl(0.0632, 0.014, 14, 0.0625, true), [0, 0.811, 0], { mat: bandMat, c: band, team: bandTeam, s: [1, 1, 1.1], r: [tilt, 0, 0] });
}

// ---------------- props ----------------
// spoked wheel in the YZ plane (axle along x), radius r
export interface SpokedWheelOptions {
  tyre?: number;
  rim?: number;
  spokes?: number;
  wood?: boolean;
  width?: number;
}
export function spokedWheel(kit: Kit, r: number, j: string | undefined, { tyre = COL.tyre, rim = COL.iron, spokes = 8, wood = false, width = 0.02 }: SpokedWheelOptions = {}): RawPart[] {
  const { G, P } = kit;
  const out: RawPart[] = [];
  const m: MatKey = wood ? 'wood' : 'metal';
  out.push(P(G.torus(r - width * 0.6, width * 0.6, 6, 18), wood ? 'metal' : 'matte', [0, 0, 0], { r: [0, HALF, 0], j, c: wood ? COL.iron : tyre }));
  out.push(P(G.torus(r - width * 1.5, width * 0.45, 5, 18), m, [0, 0, 0], { r: [0, HALF, 0], j, c: wood ? COL.brown : rim }));
  for (let i = 0; i < spokes; i++) out.push(P(G.cyl(wood ? width * 0.35 : 0.0035, (r - width * 1.5) * 2 / 2, 4), m, [0, Math.cos(i / spokes * PI * 2) * (r - width * 1.5) / 2, Math.sin(i / spokes * PI * 2) * (r - width * 1.5) / 2], { r: [i / spokes * PI * 2, 0, 0], j, c: wood ? COL.brown : COL.lightGrey }));
  out.push(P(G.cyl(width * 0.9, width * 2.4, 8), 'metal', [0, 0, 0], { r: [0, 0, HALF], j, c: COL.iron }));
  return out;
}

// radius of a lathe profile ([radius, y] pairs, bottom to top) at height y
type Profile = ReadonlyArray<readonly [number, number]>;
const along = (profile: Profile, y: number): number => {
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1], b = profile[i];
    if (!a || !b) break;
    const [r0, y0] = a, [r1, y1] = b;
    if (y <= y1 || i === profile.length - 1) return r0 + (r1 - r0) * Math.max(0, Math.min(1, (y - y0) / (y1 - y0)));
  }
  return profile[0]?.[0] ?? 0;
};

// Gathered cloth: pushes a lathe in and out around its axis, one fold per two segments, deepening from yTop
// down to yHem. Lathes with the same segment count fold in step, so bands and flounces follow the skirt.
function pleat(g: THREE.LatheGeometry, yTop: number, yHem: number, depth: number): THREE.LatheGeometry {
  const out = g.clone();
  const pos = out.getAttribute('position'), n = g.parameters.segments / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = 1 + depth * Math.max(0, Math.min(1, (yTop - y) / (yTop - yHem))) * Math.cos(Math.atan2(x, z) * n);
    pos.setXYZ(i, x * k, y, z * k);
  }
  out.computeVertexNormals();
  return out;
}

// the front of a lathe: only the faces within `half` radians either side of +z
function front(g: THREE.BufferGeometry, half: number): THREE.BufferGeometry {
  const out = g.clone(), pos = out.getAttribute('position'), index = out.getIndex(), keep: number[] = [];
  if (!index) throw new Error('front() needs an indexed geometry');
  const idx = index.array;
  for (let i = 0; i < idx.length; i += 3) {
    let x = 0, z = 0;
    for (let c = 0; c < 3; c++) { x += pos.getX(idx[i + c] ?? 0); z += pos.getZ(idx[i + c] ?? 0); }
    if (Math.abs(Math.atan2(x, z)) < half) keep.push(idx[i] ?? 0, idx[i + 1] ?? 0, idx[i + 2] ?? 0);
  }
  out.setIndex(keep);
  return out;
}

// Fapapucs: carved wooden sole with a heel block and a red painted leather upper. Model space parts,
// toe towards +z, sole on y = 0, about 0.15 long.
const CLOG_SOLE: Profile = [[-0.064, 0], [-0.034, 0], [-0.026, 0.008], [0.018, 0.008], [0.028, 0], [0.05, 0], [0.064, 0.012], [0.068, 0.028], [0.056, 0.026], [-0.06, 0.026], [-0.068, 0.014]];
function clog(kit: Kit): RawPart[] {
  const { G, P } = kit;
  const parts = [
    P(G.extrude(CLOG_SOLE, 0.048, 0.006, 'clog'), 'wood', [0, 0.006, 0], { c: COL.tan }),
    P(G.dome(1, 14, 7), 'satin', [0, 0.03, -0.014], { c: COL.red, r: [HALF, 0, 0], s: [0.029, 0.072, 0.034] }),
    P(G.cyl(1, 0.002, 12), 'cloth', [0, 0.03, -0.014], { c: COL.leather, shade: 0.45, r: [HALF, 0, 0], s: [0.027, 1, 0.032] })
  ];
  // painted flowers on the upper and a row of brass tacks where it meets the sole
  for (const [x, a, c] of [[0, 0.62, COL.offWhite], [-0.017, 0.95, COL.yellow], [0.017, 0.95, COL.yellow]] as const) {
    const y = 0.03 + Math.cos(a) * 0.034 * Math.cos(x / 0.029 * HALF), z = -0.014 + Math.sin(a) * 0.072;
    parts.push(P(G.sph(1, 7, 4), 'satin', [x, y, z], { c, r: [a - HALF + 1.2, 0, x * 12], s: [0.01, 0.0035, 0.01] }));
    parts.push(P(G.sph(0.0032, 5, 4), 'satin', [x, y + 0.002, z], { c: c === COL.yellow ? COL.red : COL.yellow }));
  }
  for (let i = 0; i < 3; i++) {
    const a = -1.1 + i * 1.1;
    parts.push(P(G.sph(0.003, 5, 4), 'gold', [Math.sin(a) * 0.03, 0.04, -0.014 + Math.max(0, Math.cos(a)) * 0.07]));
  }
  return parts;
}

export function defineUnits(kit: Kit, def: DefineModel): void {
  const { G, P, finalize } = kit;
  const done = (h: Human, meta: ModelMeta, extra: RawPart[] = []): Model => { const f = h.finish(); return finalize([...f.parts, ...extra], { ...f.joints, ...(meta.joints || {}) }, meta); };

  // Vasgyűjtő: pushes a two-wheeled handcart, arms locked on the handles
  def('scavenger', () => {
    const push = { hold: -0.82, swing: 0, actBase: 0 }, pushEl = { hold: -0.52, swing: 0, actBase: 0, actAmp: 0 };
    const h = human(kit, { sleeves: 'short', legs: COL.coat, hands: COL.tan, hairC: COL.hairBrown, pose: { shL: push, shR: { ...push, actAmp: 0.06 }, elL: pushEl, elR: pushEl } });
    flatCap(h, G, COL.dark);
    for (const sd of [-1, 1]) {
      h.body(G.rbox(0.016, 0.2, 0.006, 0.002), [sd * 0.055, 0.585, 0.071], { c: COL.dark, r: [0.1, 0, 0] });
      h.body(G.rbox(0.016, 0.2, 0.006, 0.002), [sd * 0.055, 0.585, -0.073], { c: COL.dark, r: [-0.1, 0, 0] });
    }
    const cz = 0.72, cy = 0.33;
    const cart = [
      P(G.rbox(0.42, 0.02, 0.56, 0.006), 'planks', [0, cy - 0.085, cz]),
      ...[-1, 1].map((sd) => P(G.corr(0.56, 0.17, 0.045, 0.006), 'sheet', [sd * 0.205, cy, cz], { r: [0, HALF, 0], keepUV: true })),
      P(G.corr(0.4, 0.17, 0.045, 0.006), 'sheet', [0, cy, cz + 0.275], { keepUV: true }),
      P(G.corr(0.4, 0.15, 0.045, 0.006), 'sheet', [0, cy - 0.01, cz - 0.275], { keepUV: true }),
      ...([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([a, b]) => P(G.box(0.018, 0.19, 0.018), 'metal', [a * 0.205, cy, cz + b * 0.275], { c: COL.iron })),
      ...[-1, 1].map((sd) => P(G.tube([[sd * 0.2, cy + 0.05, cz - 0.27], [sd * 0.17, 0.46, 0.42], [sd * 0.135, 0.515, 0.28], [sd * 0.133, 0.52, 0.22]], 0.009, 5), 'metal', [0, 0, 0], { c: COL.iron })),
      ...[-1, 1].map((sd) => P(G.cyl(0.013, 0.07, 6), 'matte', [sd * 0.133, 0.52, 0.245], { r: [HALF - 0.08, 0, 0], c: COL.rubber })),
      P(G.cyl(0.008, 0.48, 6), 'metal', [0, 0.14, cz], { r: [0, 0, HALF], c: COL.iron }),
      ...[-1, 1].map((sd) => P(G.tube([[sd * 0.15, cy - 0.09, cz + 0.2], [sd * 0.15, 0.1, cz + 0.27], [sd * 0.15, 0.012, cz + 0.27]], 0.008, 5), 'metal', [0, 0, 0], { c: COL.iron })),
      // a few things that never leave the cart
      P(G.cyl(0.02, 0.5, 7), 'rust', [-0.1, cy - 0.04, cz], { r: [HALF - 0.12, 0.2, 0] }),
      P(G.rbox(0.14, 0.05, 0.2, 0.01), 'burlap', [0.1, cy - 0.05, cz - 0.12], { c: COL.sand, r: [0, 0.3, 0] }),
      // the load: tinted by what is being carried
      P(G.rock(0.1, 3, 1, 0.4), 'cargo', [0.02, cy + 0.05, cz + 0.04], { s: [1.3, 0.7, 1.7], cargo: true }),
      P(G.rock(0.06, 5, 1, 0.45), 'cargo', [-0.08, cy + 0.1, cz - 0.1], { cargo: true }),
      P(G.rock(0.055, 7, 1, 0.45), 'cargo', [0.1, cy + 0.1, cz + 0.16], { cargo: true })
    ];
    const joints: JointDefs = {};
    for (const sd of [-1, 1]) {
      const j = `wheel${sd}`;
      joints[j] = { p: [sd * 0.25, 0.14, cz], src: 'wheel', swing: 0.11 / 0.14, share: 'cartWheel' };
      cart.push(...spokedWheel(kit, 0.14, j, { spokes: 10 }));
    }
    return done(h, { top: 0.95, radius: 0.45, joints }, cart);
  });

  // Építő Mester: hi-vis vest, hard hat, tool belt, hammer and toolbox
  def('builder', () => {
    const h = human(kit, { legs: COL.denimDark, shoes: COL.brown, hands: COL.tan, hairC: COL.hairBrown, moustache: true, pose: { elL: { hold: -0.2 } } });
    hardHat(h, G, COL.yellow);
    h.body(G.lathe([[0.108, 0.478], [0.103, 0.51], [0.106, 0.56], [0.121, 0.625], [0.115, 0.658], [0.08, 0.676]], 12), [0, 0, 0], { c: COL.hivis, s: [h.bw, 1, h.bd + 0.03] });
    for (const y of [0.52, 0.585]) h.body(G.cyl(0.1085 + (y - 0.52) * 0.14, 0.018, 12, 0.1095 + (y - 0.52) * 0.14, true), [0, y, 0], { c: COL.offWhite, s: [h.bw, 1, h.bd + 0.035] });
    h.body(G.rbox(0.05, 0.06, 0.03, 0.008), [-0.09, 0.44, 0.02], { c: COL.leather });
    h.body(G.rbox(0.045, 0.07, 0.03, 0.008), [0.09, 0.435, -0.01], { c: COL.leather });
    h.add(G.cyl(0.006, 0.09, 5), 'metal', [0.095, 0.47, 0.012], { c: COL.lightGrey });
    h.add(G.rbox(0.012, 0.11, 0.03, 0.003), 'satin', [-0.08, 0.5, -0.07], { c: COL.yellow, r: [0, 0, 0.2] });
    h.hold('R', G.cyl(0.009, 0.2, 6), 'wood', [0, -0.005, 0.08], { r: [HALF, 0, 0] });
    h.hold('R', G.rbox(0.03, 0.034, 0.075, 0.006), 'metal', [0, -0.005, 0.175], { c: COL.iron, r: [0, HALF, 0] });
    h.hold('L', G.rbox(0.07, 0.085, 0.2, 0.012), 'satin', [0, -0.085, 0.01], { c: COL.red });
    h.hold('L', G.rbox(0.074, 0.012, 0.204, 0.004), 'metal', [0, -0.06, 0.01], { c: COL.iron });
    h.hold('L', G.torus(0.03, 0.005, 4, 10, PI), 'metal', [0, -0.034, 0.01], { c: COL.iron, r: [0, HALF, 0] });
    return done(h, { top: 0.98, radius: 0.42 });
  });

  // Bicskás legény: hooded sweatshirt in the team colour, striped track pants, switchblade
  def('knife', () => {
    const h = human(kit, { tw: 0.94, legs: COL.navy, stripe: COL.offWhite, shoes: COL.offWhite, soles: COL.lightGrey, belt: false, collar: false, hair: 'bald', stubble: false, pose: { shR: { actBase: -0.9, actAmp: 0.7 }, elR: { hold: -0.45 } } });
    h.head(G.sph(1, 12, 8), [0, 0.762, -0.016], { c: COL.white, team: true, s: [0.064, 0.074, 0.068] });
    h.head(G.torus(0.052, 0.012, 5, 14), [0, 0.76, 0.026], { c: COL.white, team: true, s: [1, 1.22, 1], shade: 0.82 });
    h.body(G.sph(1, 10, 6), [0, 0.69, -0.045], { c: COL.white, team: true, s: [0.07, 0.04, 0.045] });
    h.body(G.rbox(0.13, 0.06, 0.02, 0.008), [0, 0.52, 0.066], { c: COL.white, team: true, shade: 0.86 });
    for (const sd of [-1, 1]) h.body(G.cyl(0.003, 0.07, 4), [sd * 0.02, 0.655, 0.072], { c: COL.offWhite });
    h.hold('R', G.rbox(0.016, 0.022, 0.07, 0.004), 'satin', [0, 0, 0.03], { c: COL.black });
    h.hold('R', G.extrude([[0, -0.009], [0.085, -0.003], [0.1, 0.004], [0, 0.009]], 0.003, 0, 'blade'), 'chrome', [0, 0, 0.065]);
    return done(h, { top: 0.92, radius: 0.42 });
  });

  // Boxerös Nehézfiú: heavy build, vest in the team colour, boxing gloves
  def('brawler', () => {
    const jab = { hold: -0.55, swing: 0.5 };
    const h = human(kit, { scale: 1.12, tw: 1.26, arm: 1.3, leg: 1.22, sleeves: 'none', legs: COL.char, stripe: COL.red, shoes: COL.black, skin: COL.skinDark, hair: 'bald', collar: false, belt: COL.black,
      pose: { shL: { ...jab, actBase: -0.5, actAmp: 0.55, actPh: PI }, shR: { ...jab, actBase: -0.5, actAmp: 0.55 }, elL: { hold: -1.5, swing: 0.2, actBase: 0.5, actAmp: 0.6, actPh: PI }, elR: { hold: -1.5, swing: 0.2, actBase: 0.5, actAmp: 0.6 } } });
    h.body(G.torus(0.05, 0.005, 4, 16), [0, 0.672, 0.02], { r: [HALF + 0.5, 0, 0], c: COL.yellow }).mat = 'gold';
    for (const side of ['L', 'R'] as const) {
      h.hold(side, G.sph(1, 10, 8), 'satin', [0, -0.012, 0.004], { c: COL.red, s: [0.042, 0.05, 0.046] });
      h.hold(side, G.sph(1, 6, 5), 'satin', [side === 'L' ? 0.03 : -0.03, 0, 0.02], { c: COL.red, s: [0.018, 0.026, 0.02] });
      h.hold(side, G.cyl(0.031, 0.03, 10), 'satin', [0, 0.04, 0], { c: COL.offWhite });
    }
    return done(h, { top: 1.02, radius: 0.46 });
  });

  // Csúzlis kölyök: small, cap turned backwards, shorts, backpack, slingshot
  def('slingshot', () => {
    const h = human(kit, { scale: 0.8, headScale: 1.1, tw: 0.92, sleeves: 'short', shorts: true, legs: COL.khaki, shoes: COL.red, soles: COL.offWhite, hairC: COL.hairBrown, belt: false, skin: COL.skinPale,
      pose: { shR: { actBase: -1.35, actAmp: 0.12 }, elR: { actBase: -0.2, actAmp: 0.1 }, shL: { actBase: -1.2 }, elL: { actBase: -1.2, actAmp: 0.3, actPh: 0.5 } } });
    ballCap(h, G, COL.white, true, true);
    h.body(G.rbox(0.15, 0.17, 0.065, 0.02), [0, 0.57, -0.1], { c: COL.blue });
    h.body(G.rbox(0.1, 0.07, 0.03, 0.012), [0, 0.54, -0.14], { c: COL.blue, shade: 0.8 });
    for (const sd of [-1, 1]) h.body(G.rbox(0.02, 0.2, 0.012, 0.004), [sd * 0.065, 0.6, 0.066], { c: COL.blue, shade: 0.8, r: [0.08, 0, 0] });
    h.hold('R', G.cyl(0.008, 0.07, 6), 'wood', [0, -0.01, 0.015]);
    for (const sd of [-1, 1]) {
      h.hold('R', G.cyl(0.006, 0.06, 5), 'wood', [sd * 0.02, -0.065, 0.015], { r: [0, 0, sd * 0.42] });
      h.hold('R', G.tube([[sd * 0.032, -0.09, 0.015], [sd * 0.012, -0.085, -0.05]], 0.0025, 4), 'matte', [0, 0, 0], { c: COL.red });
    }
    h.hold('R', G.rbox(0.03, 0.02, 0.006, 0.002), 'cloth', [0, -0.085, -0.052], { c: COL.leather });
    return done(h, { top: 0.78, radius: 0.38 });
  });

  // Légpuskás: quilted jacket, flat cap, break-barrel air rifle carried across the body
  def('airgunner', () => {
    const h = human(kit, { legs: COL.olive, shoes: COL.brown, boots: true, hairC: COL.hairGrey, moustache: true,
      pose: { shR: { hold: -0.3, swing: 0.2, actBase: -0.95, actAmp: 0.03 }, elR: { hold: -1.2, swing: 0, actBase: 0.55, actAmp: 0.04 }, shL: { hold: -0.75, swing: 0.2, rest: [0, 0, 0.42], actBase: -0.5 }, elL: { hold: -0.75, swing: 0, actBase: 0.1 } } });
    flatCap(h, G, COL.khaki);
    h.body(G.cyl(0.107, 0.05, 12, 0.105, true), [0, 0.45, 0], { c: COL.white, team: true, s: [h.bw, 1, h.bd + 0.03], shade: 0.9 });
    for (const y of [0.52, 0.57, 0.62]) h.body(G.torus(0.103 + (y - 0.52) * 0.13, 0.003, 3, 14), [0, y, 0], { r: [HALF, 0, 0], c: COL.white, team: true, s: [h.bw, h.bd - 0.02, 1], shade: 0.7 });
    h.body(G.rbox(0.03, 0.2, 0.012, 0.004), [0.02, 0.58, -0.078], { c: COL.leather, r: [0, 0, -0.5] });
    // rifle lies along the right forearm: stock behind the hand, barrel far out front
    h.hold('R', G.rbox(0.03, 0.2, 0.05, 0.01), 'wood', [0, 0.1, -0.012], { c: COL.tan, r: [0.1, 0, 0] });
    h.hold('R', G.rbox(0.026, 0.14, 0.036, 0.008), 'wood', [0, -0.05, 0.002], { c: COL.tan });
    h.hold('R', G.cyl(0.011, 0.2, 8), 'metal', [0, -0.07, 0.03], { c: COL.char });
    h.hold('R', G.cyl(0.007, 0.34, 8), 'metal', [0, -0.3, 0.03], { c: COL.char });
    h.hold('R', G.cyl(0.011, 0.11, 8), 'metal', [0, -0.03, 0.058], { c: COL.black });
    h.hold('R', G.torus(0.014, 0.003, 4, 8, PI), 'metal', [0, 0.0, -0.022], { c: COL.char, r: [0, HALF, PI] });
    h.hold('R', G.box(0.003, 0.012, 0.01), 'metal', [0, -0.465, 0.04], { c: COL.char });
    return done(h, { top: 0.96, radius: 0.42 });
  });

  // Flexes Kommandó: welding mask, leather apron, angle grinder throwing sparks
  def('grinder', () => {
    const h = human(kit, { legs: COL.coat, shoes: COL.black, boots: true, hands: COL.tan, hairC: COL.hair,
      pose: { shR: { hold: -0.5, swing: 0.15, actBase: -0.25, actAmp: 0.1 }, elR: { hold: -0.8, swing: 0, actBase: 0, actAmp: 0.08 }, shL: { hold: -0.62, swing: 0.15, rest: [0, 0, 0.34], actBase: -0.25, actAmp: 0.1 }, elL: { hold: -0.72, swing: 0, actBase: 0 } } });
    h.head(G.rbox(0.105, 0.105, 0.03, 0.012), [0, 0.752, 0.062], { mat: 'satin', c: COL.char, r: [-0.08, 0, 0] });
    h.head(G.rbox(0.062, 0.022, 0.006, 0.002), [0, 0.768, 0.079], { mat: 'glass', r: [-0.08, 0, 0] });
    h.head(G.torus(0.06, 0.006, 4, 14), [0, 0.79, 0.004], { r: [HALF, 0, 0], c: COL.char });
    for (const sd of [-1, 1]) h.head(G.sph(1, 8, 6), [sd * 0.06, 0.757, 0], { mat: 'satin', c: COL.yellow, s: [0.014, 0.024, 0.022] });
    h.body(G.rbox(0.19, 0.3, 0.014, 0.006), [0, 0.5, 0.076], { c: COL.leather, r: [0.04, 0, 0] });
    h.body(G.rbox(0.2, 0.015, 0.15, 0.004), [0, 0.6, 0.0], { c: COL.leather, shade: 0.8 });
    h.body(G.rbox(0.19, 0.14, 0.012, 0.005), [0, 0.3, 0.068], { c: COL.leather, r: [-0.1, 0, 0] });
    h.hold('R', G.cyl(0.02, 0.17, 8), 'satin', [-0.035, -0.02, 0.08], { c: COL.teal, r: [HALF, 0, 0] });
    h.hold('R', G.rbox(0.05, 0.045, 0.055, 0.01), 'metal', [-0.035, -0.022, 0.185], { c: COL.iron });
    h.hold('R', G.cyl(0.011, 0.09, 6), 'matte', [-0.085, -0.02, 0.17], { c: COL.rubber, r: [0, 0, HALF] });
    h.hold('R', G.cyl(0.068, 0.014, 14, 0.068, true), 'metal', [-0.035, -0.05, 0.19], { c: COL.char, s: [1, 1, 1] });
    h.joint('disk', { parent: 'elR', p: [-0.035, -0.052 - 0.158, 0.19], src: 'disk', axis: 'y' });
    h.add(G.cyl(0.062, 0.003, 18), 'chrome', [0, 0, 0], { j: 'disk' });
    h.add(G.cyl(0.018, 0.006, 8), 'metal', [0, 0, 0], { j: 'disk', c: COL.char });
    return done(h, { top: 0.96, radius: 0.42 });
  });

  // A Vajda: big man in a long coat, wide-brimmed hat with a gold band, cane with a gold knob
  def('elder', () => {
    const h = human(kit, { scale: 1.1, tw: 1.2, belly: 0.9, arm: 1.12, leg: 1.15, legs: COL.black, shoes: COL.black, boots: true, hairC: COL.hair, moustache: true, beardC: COL.hair, skin: COL.skinDark,
      pose: { shR: { swing: 0.45, actBase: -0.9, actAmp: 0.25 }, elR: { hold: -0.3 } } });
    brimHat(h, G, COL.black, { brim: 0.122, crown: 0.07, band: COL.yellow, bandMat: 'gold' });
    h.body(G.lathe([[0.128, 0.23], [0.118, 0.33], [0.108, 0.47]], 12), [0, 0, 0.012], { c: COL.white, team: true, s: [h.bw, 1, 0.86] });
    h.body(G.rbox(0.05, 0.2, 0.008, 0.003), [0, 0.57, 0.102], { c: COL.offWhite });
    for (const sd of [-1, 1]) h.body(G.rbox(0.04, 0.2, 0.012, 0.004), [sd * 0.05, 0.585, 0.1], { c: COL.white, team: true, r: [0, 0, sd * 0.16], shade: 0.8 });
    for (let i = 0; i < 4; i++) h.add(G.sph(0.008, 6, 4), 'gold', [0.012, 0.3 + i * 0.055, 0.118 - i * 0.004]);
    h.add(G.torus(0.055, 0.006, 4, 16), 'gold', [0, 0.668, 0.03], { r: [HALF + 0.55, 0, 0] });
    h.add(G.cyl(0.012, 0.012, 8), 'gold', [0, 0.622, 0.1], { r: [HALF, 0, 0] });
    h.hold('R', G.cyl(0.008, 0.36, 6, 0.01), 'wood', [0, -0.175, 0.012], { c: COL.horseDark });
    h.hold('R', G.sph(0.019, 8, 6), 'gold', [0, 0.012, 0.012]);
    h.hold('R', G.cyl(0.011, 0.02, 6), 'gold', [0, -0.352, 0.012]);
    h.hold('L', G.torus(0.013, 0.004, 4, 8), 'gold', [0, -0.008, 0], { r: [HALF, 0, 0] });
    return done(h, { top: 1.12, radius: 0.5 });
  });

  // Vándor Kém: trench coat, fedora, dark glasses, briefcase; only the scarf gives the owner away
  def('infiltrator', () => {
    const h = human(kit, { top: COL.sand, topTeam: false, legs: COL.char, shoes: COL.brown, hairC: COL.hair, glasses: true, belt: COL.sand, pose: { elR: { hold: -0.06 } } });
    brimHat(h, G, COL.coat, { band: COL.black, tilt: 0.08 });
    h.body(G.lathe([[0.118, 0.26], [0.11, 0.36], [0.107, 0.47]], 12), [0, 0, 0.004], { c: COL.sand, s: [h.bw, 1, 0.8] });
    h.body(G.box(0.004, 0.42, 0.004), [0.012, 0.47, 0.079], { c: COL.sand, shade: 0.6 });
    for (const sd of [-1, 1]) {
      h.body(G.rbox(0.05, 0.085, 0.01, 0.004), [sd * 0.038, 0.63, 0.064], { c: COL.sand, r: [0.1, 0, sd * 0.5], shade: 0.85 });
      h.body(G.rbox(0.04, 0.01, 0.02, 0.003), [sd * 0.1, 0.668, 0], { c: COL.sand, shade: 0.8 });
    }
    h.body(G.torus(0.04, 0.016, 6, 14), [0, 0.692, 0.004], { r: [HALF, 0, 0], c: COL.white, team: true });
    h.body(G.rbox(0.04, 0.13, 0.014, 0.005), [0.03, 0.63, 0.074], { c: COL.white, team: true, r: [0.08, 0, -0.1] });
    h.hold('R', G.rbox(0.045, 0.12, 0.18, 0.01), 'cloth', [0, -0.085, 0.01], { c: COL.leather });
    h.hold('R', G.torus(0.024, 0.004, 4, 10, PI), 'cloth', [0, -0.024, 0.01], { c: COL.leather, r: [0, HALF, 0] });
    for (const z of [-0.04, 0.06]) h.hold('R', G.box(0.047, 0.012, 0.014), 'chrome', [0, -0.034, z]);
    return done(h, { top: 0.98, radius: 0.42 });
  });

  // Cigány asszony: the matriarch. Many-layered pleated skirt in the team colour, polka-dot headscarf, black
  // rose shawl with fringes, gold coins and hoops; one clog still on her foot, the other in her fist, ready to fly
  def('ciganyAsszony', () => {
    const step = { swing: 0.5 };
    const h = human(kit, { scale: 1.12, headScale: 1.06, tw: 1.25, belly: 0.8, arm: 1.15, top: COL.offWhite, topTeam: false, legs: COL.dark, hairC: COL.dark, belt: false, collar: false, skirt: true, feet: false,
      pose: { hipL: step, hipR: step, kneeL: step, kneeR: step,
        // left fist planted on the hip, right arm winds the clog up behind the head and lets fly
        shL: { rest: [0.996, 0.487, -0.955], swing: 0, actBase: 0 }, elL: { hold: -1.75, swing: 0 },
        shR: { rest: [0, 0, 0.24], swing: 0.6, actBase: -2.4, actAmp: 0.85 }, elR: { hold: -0.2, actBase: -1, actAmp: 0.8, actPh: 0 } } });
    const { bw } = h;
    const W = COL.white;

    // ---- skirt: pleated lathes stacked into flounces, every one folding in step ----
    const SK: Profile = [[0.2, 0.03], [0.232, 0.038], [0.236, 0.06], [0.225, 0.12], [0.205, 0.2], [0.18, 0.28], [0.155, 0.35], [0.132, 0.42], [0.112, 0.47], [0.104, 0.5]];
    const FOLD_TOP = 0.5, FOLD_HEM = 0.04, FOLD = 0.045;
    const skirtS: Vec3T = [bw, 1, 0.92];
    const sk = (profile: Profile, c: number, x: PartOptions = {}): RawPart => h.body(pleat(G.lathe(profile, 48), FOLD_TOP, FOLD_HEM, FOLD), [0, 0, 0.012], { c, s: skirtS, ...x });
    const band = (base: Profile, y0: number, y1: number, d: number): Profile => [y0, (y0 + y1) / 2, y1].map((y): [number, number] => [along(base, y) + d, y]);
    sk(SK, W, { team: true });
    sk([[0.212, 0.014], [0.224, 0.02], [0.228, 0.036]], COL.offWhite);
    sk(band(SK, 0.036, 0.085, 0.003), COL.black);
    sk(band(SK, 0.092, 0.102, 0.003), COL.yellow);
    for (const [yb, yt, shade] of [[0.3, 0.44, 0.9], [0.165, 0.3, 0.8]] as const) {
      const tier: Profile = [[along(SK, yb) + 0.003, yb - 0.004], [along(SK, yb) + 0.012, yb + 0.006], [along(SK, yt) + 0.003, yt]];
      sk(tier, W, { team: true, shade });
      sk(band(tier, yb + 0.012, yb + 0.022, 0.002), COL.offWhite);
    }
    // printed roses along the hem, one on every other fold
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * PI * 2, y = 0.06, r = (along(SK, y) + 0.005) * (1 + FOLD * Math.min(1, (FOLD_TOP - y) / (FOLD_TOP - FOLD_HEM)));
      h.body(G.sph(1, 6, 3), [Math.sin(a) * r * bw, y, Math.cos(a) * r * 0.92 + 0.012], { c: i % 2 ? COL.yellow : COL.red, r: [0, a, 0], s: [0.012, 0.012, 0.004] });
    }

    // ---- apron: the front of a gently gathered lathe hanging clear of the flounces, lace hem, roses ----
    const outer = (y: number): number => along(SK, y) * (1 + FOLD * Math.min(1, (FOLD_TOP - y) / (FOLD_TOP - FOLD_HEM)));
    const AP = [0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.44, 0.476].map((y): [number, number] => [outer(y) + (y > 0.45 ? 0.008 : 0.019), y]);
    const ap0 = AP[0]?.[0] ?? 0;
    const apron = (profile: Profile, c: number): RawPart => h.body(front(pleat(G.lathe(profile, 48), 0.48, 0.15, 0.02), 0.62), [0, 0, 0.012], { c, s: skirtS });
    apron(AP, COL.navy);
    apron([[ap0 + 0.001, 0.132], [ap0 + 0.002, 0.158]], COL.offWhite);
    for (const a of [-0.32, 0, 0.32]) {
      const y = a ? 0.2 : 0.21, r = along(AP, y) + 0.004;
      h.body(G.sph(1, 6, 3), [Math.sin(a) * r * bw, y, Math.cos(a) * r * 0.92 + 0.012], { c: a ? COL.red : COL.yellow, r: [-0.4, a, 0], s: [0.013, 0.013, 0.004] });
    }
    h.body(G.cyl(0.118, 0.02, 14, 0.114, true), [0, 0.466, 0.012], { c: COL.navy, s: [bw, 1, 0.94] });

    // ---- shawl: shoulder cape with roses, a point hanging down the back, knotted in front, fringed ----
    const CP: Profile = [[0.126, 0.475], [0.132, 0.53], [0.136, 0.57], [0.133, 0.615], [0.12, 0.65], [0.088, 0.68], [0.05, 0.698]];
    h.body(G.lathe(CP, 18), [0, 0, 0.012], { c: COL.black, s: [bw, 1, 1] });
    const onCape = (a: number, y: number, d = 0): Vec3T => { const r = along(CP, y) + d; return [Math.sin(a) * r * bw, y, Math.cos(a) * r + 0.012]; };
    for (let i = 0; i < 28; i++) h.body(G.cyl(0.0018, 0.024, 3, 0.0018, true), onCape(i / 28 * PI * 2, 0.463, -0.001), { c: COL.char });
    for (let i = 0; i < 10; i++) {
      const a = 0.9 + i / 9 * (PI * 2 - 1.8), y = i % 2 ? 0.6 : 0.565;
      h.body(G.sph(1, 6, 3), onCape(a, y, 0.002), { c: i % 3 ? COL.red : COL.yellow, r: [0, a, 0], s: [0.016, 0.016, 0.005] });
      h.body(G.sph(1, 5, 3), onCape(a + 0.12, y - 0.012, 0.001), { c: COL.green, r: [0, a, 0.6], s: [0.01, 0.005, 0.003] });
    }
    h.body(G.cone(1, 1, 4), [0, 0.42, -0.138], { c: COL.black, r: [PI, 0, 0], s: [0.115, 0.15, 0.022] });
    for (const sd of [-1, 1]) for (let i = 0; i < 7; i++) {
      const f = i / 7;
      h.body(G.cyl(0.0018, 0.024, 3, 0.0018, true), [sd * 0.115 * (1 - f), 0.483 - f * 0.15, -0.14], { c: COL.char });
    }
    h.body(G.sph(1, 8, 6), [0, 0.565, 0.152], { c: COL.black, s: [0.022, 0.018, 0.016] });

    // ---- blouse sleeves: puffed at the shoulder, frilled at the wrist, gold bangles ----
    for (const side of ['L', 'R'] as const) {
      h.body(G.sph(1, 10, 8), [0, -0.04, 0], { j: `sh${side}`, c: COL.offWhite, s: [0.046, 0.056, 0.046] });
      h.body(G.torus(0.024, 0.008, 4, 10), [0, -0.126, 0], { j: `el${side}`, c: COL.offWhite, r: [HALF, 0, 0] });
      h.hold(side, G.torus(0.013, 0.004, 4, 8), 'gold', [0, -0.008, 0], { r: [HALF, 0, 0] });
    }
    for (const y of [0.042, 0.05]) h.hold('R', G.torus(0.022, 0.0028, 4, 12), 'gold', [0, y, 0], { r: [HALF, 0, 0] });

    // ---- headscarf in the team colour with white dots, knotted at the nape; braid down the back ----
    const SC: Vec3T = [0.066, 0.075, 0.071], tilt = -0.62, cy = 0.763, cz = -0.008;
    h.head(G.dome(1, 14, 7, 1.85), [0, cy, cz], { c: W, team: true, s: SC, r: [tilt, 0, 0] });
    h.head(G.torus(1, 0.075, 4, 20), [0, cy - 0.0168, cz + 0.012], { c: W, team: true, shade: 0.85, s: [SC[0] * Math.sin(1.85), SC[2] * Math.sin(1.85), 0.066], r: [HALF + tilt, 0, 0] });
    for (const [th, n, ph] of [[0.45, 4, 0.3], [0.95, 7, 0], [1.45, 8, 0.4]] as const) for (let i = 0; i < n; i++) {
      const p = ph + i / n * PI * 2, lx = Math.sin(th) * Math.cos(p) * SC[0], ly = Math.cos(th) * SC[1], lz = Math.sin(th) * Math.sin(p) * SC[2];
      h.head(G.sph(0.0065, 4, 3), [lx, cy + ly * Math.cos(tilt) - lz * Math.sin(tilt), cz + ly * Math.sin(tilt) + lz * Math.cos(tilt)], { c: COL.offWhite });
    }
    h.head(G.sph(1, 8, 6), [0, 0.714, -0.058], { c: W, team: true, s: [0.02, 0.016, 0.016] });
    for (const sd of [-1, 1]) h.head(G.cloth(0.1, 0.026, 4, 1), [sd * 0.008, 0.71, -0.066], { mat: 'flag', c: W, team: true, r: [0.75, 0, -HALF + sd * 0.22] });
    const braidZ = (y: number): number => 0.012 - along(CP, y) - 0.012;
    for (let i = 0; i < 7; i++) {
      const y = 0.69 - i * 0.019, sd = i % 2 ? 1 : -1;
      h.body(G.sph(1, 7, 5), [sd * 0.003, y, braidZ(y)], { c: COL.dark, r: [0, 0, sd * 0.35], s: [0.014, 0.015, 0.012] });
    }
    h.body(G.cyl(0.011, 0.01, 8), [0, 0.566, braidZ(0.566)], { c: COL.red });
    h.body(G.cone(0.012, 0.028, 8), [0, 0.55, braidZ(0.55) - 0.01], { c: COL.dark, r: [PI - 0.3, 0, 0] });

    // ---- gold: hoop earrings, a necklace of coins across the shawl ----
    for (const sd of [-1, 1]) h.head(G.torus(0.014, 0.003, 4, 12), [sd * 0.059, 0.722, 0.004], { mat: 'gold', r: [0, HALF, 0] });
    const chain: Vec3T[] = [];
    for (let i = -6; i <= 6; i++) {
      const a = i / 6 * 1.25, y = 0.69 - 0.05 * (1 - (i / 6) ** 2);
      const p = onCape(a, y, 0.004);
      if (i % 2 === 0) chain.push(p);
      if (Math.abs(i) <= 4) h.add(G.sph(1, 8, 3), 'gold', [p[0], p[1] - 0.009, p[2] + 0.003], { r: [-0.5, a, 0], s: [0.0095, 0.0095, 0.0022] });
    }
    h.add(G.tube(chain, 0.0018, 3), 'gold', [0, 0, 0]);

    // ---- feet: a thick wool sock on the right, the clog's twin still on the left ----
    h.body(G.sph(1, 8, 6), [0, -0.19, 0.02], { j: 'kneeR', c: COL.offWhite, s: [0.037, 0.029, 0.064] });
    h.body(G.cyl(0.031, 0.05, 8, 0.029), [0, -0.162, 0.002], { j: 'kneeR', c: COL.offWhite });
    h.body(G.sph(1, 8, 6), [0, -0.19, 0.012], { j: 'kneeL', c: COL.offWhite, s: [0.03, 0.022, 0.05] });
    for (const p of place(clog(kit), [0, -0.219, 0.02], [0, 0, 0], 0.85)) { p.j = 'kneeL'; h.parts.push(p); }
    // the throwing clog, held by the heel with the toe past the knuckles
    for (const p of place(clog(kit), [0, -GRIP - 0.066, -0.033], [HALF, 0, 0], 1.25)) { p.j = 'elR'; h.parts.push(p); }
    return done(h, { top: 1.06, radius: 0.5 });
  });

  // the clog in flight, centred so it tumbles about its middle
  def('proj_ciganyAsszony', () => finalize(place(clog(kit), [0, -0.04, 0], [0, 0, 0], 1.3), {}, { top: 0.1, radius: 0.1 }));

  def('civilian', () => {
    const h = human(kit, { top: COL.grey, topTeam: false, legs: COL.denim, shoes: COL.brown, hairC: COL.hairGrey, pose: { shR: { swing: 0.5 } } });
    flatCap(h, G, COL.coat);
    h.body(G.cyl(0.107, 0.04, 12, 0.105, true), [0, 0.455, 0], { c: COL.grey, s: [h.bw, 1, h.bd + 0.03], shade: 0.85 });
    h.hold('R', G.lathe([[0.02, -0.14], [0.058, -0.13], [0.062, -0.06], [0.03, 0]], 8), 'cloth', [0, -0.02, 0], { c: COL.offWhite, s: [0.55, 1, 1.1] });
    h.hold('R', G.rbox(0.03, 0.05, 0.1, 0.01), 'cloth', [0, -0.12, 0], { c: COL.green });
    return done(h, { top: 0.92, radius: 0.42 });
  });

  def('unit_generic', () => done(human(kit, {}), { top: 0.9, radius: 0.42 }));
}
