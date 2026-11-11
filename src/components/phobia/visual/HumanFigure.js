/**
 * HumanFigure.js
 *
 * Articulated, human-proportioned procedural figure (about 1.75 m tall, facing +Z) used for remote
 * player avatars and for the ghost entity.
 *
 * Skeleton (all THREE.Group pivots, rotation about X is the swing axis):
 *   root
 *    +- hips (y = standing hip height; carries legs)          -> leftLeg / rightLeg (hip joint) -> knee -> foot
 *    +- torso (spine pivot, moves with crouch)                 -> chest meshes, neck, headPivot
 *         +- leftArm / rightArm (shoulder joint) -> elbow -> hand
 *         +- headPivot (pitch)
 *
 * Meshes of one bone are merged per material, so a figure costs roughly 20 draw calls with ~4k triangles.
 * animate() drives walk / sprint / crouch / light-holding pose.
 */

import * as THREE from 'three';
import { mergeParts, lathe } from './GeometryKit.js';

export const FIGURE = {
  hipHeight: 0.92,
  crouchHipHeight: 0.67,
  thigh: 0.44,
  shin: 0.42,
  upperArm: 0.29,
  foreArm: 0.26,
  shoulderY: 0.56, // above torso pivot
  shoulderX: 0.2,
  headY: 0.66
};

/** Tapered limb hanging down (-Y) from the joint at the origin. */
function limbGeometry(rTop, rBottom, len) {
  return lathe(
    [
      [0.0001, -len],
      [rBottom * 0.75, -len + rBottom * 0.25],
      [rBottom, -len + rBottom * 0.9],
      [(rTop + rBottom) * 0.5 * 1.04, -len * 0.5],
      [rTop, -rTop * 0.4],
      [rTop * 0.6, rTop * 0.15],
      [0.0001, rTop * 0.2]
    ],
    10
  );
}

function sphere(r, sx = 1, sy = 1, sz = 1, seg = 12) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4));
  g.scale(sx, sy, sz);
  return g;
}

/** Merge parts grouped by material key into meshes under `parent`. */
function addBone(parent, partsByMaterial, materials, castShadow = true) {
  for (const [key, parts] of Object.entries(partsByMaterial)) {
    if (!parts.length) continue;
    const geo = mergeParts(parts);
    const mesh = new THREE.Mesh(geo, materials[key]);
    mesh.castShadow = castShadow;
    parent.add(mesh);
  }
}

/** Default living-player palette. `vestColor` is the hi-vis colour. */
export function createPlayerMaterials(vestColor = 0xff6600) {
  return {
    skin: new THREE.MeshStandardMaterial({ color: 0xdfb498, roughness: 0.62 }),
    shirt: new THREE.MeshStandardMaterial({ color: 0x1c1e24, roughness: 0.8 }),
    vest: new THREE.MeshStandardMaterial({ color: vestColor, roughness: 0.55, metalness: 0.05 }),
    stripe: new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.15, metalness: 0.95, emissive: 0x222222 }),
    trousers: new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.85 }),
    boots: new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.85, metalness: 0.1 }),
    sole: new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.95 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x2b2a28, roughness: 0.9 }),
    hair: new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.9 }),
    cap: new THREE.MeshStandardMaterial({ color: 0x1b1c20, roughness: 0.95 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 }),
    lampCase: new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.4 }),
    lampLens: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.5 })
  };
}

/**
 * Build the skeleton. `materials` must provide the keys of createPlayerMaterials() (or a Proxy that
 * returns one single material for every key, which is how the ghost uses it).
 * opts.ghost: tattered dress + long hair instead of vest/cap.
 */
export function createHumanFigure(materials, opts = {}) {
  const F = FIGURE;
  const root = new THREE.Group();
  root.name = 'HumanFigure';

  // ---------------------------------------------------------------- legs
  const hips = new THREE.Group();
  hips.name = 'Hips';
  hips.position.y = F.hipHeight;
  root.add(hips);

  const makeLeg = (side) => {
    const hip = new THREE.Group();
    hip.name = side < 0 ? 'LeftHip' : 'RightHip';
    hip.position.set(side * 0.1, 0, 0);
    addBone(hip, { trousers: [{ geometry: limbGeometry(0.085, 0.058, F.thigh) }] }, materials);

    const knee = new THREE.Group();
    knee.name = 'Knee';
    knee.position.y = -F.thigh;
    addBone(knee, { trousers: [{ geometry: limbGeometry(0.058, 0.045, F.shin) }] }, materials);
    hip.add(knee);

    const foot = new THREE.Group();
    foot.name = 'Foot';
    foot.position.y = -F.shin;
    const boot = new THREE.BoxGeometry(0.1, 0.09, 0.26, 2, 1, 3);
    const sole = new THREE.BoxGeometry(0.108, 0.03, 0.28);
    addBone(
      foot,
      {
        boots: [
          { geometry: boot, position: [0, 0.0, 0.05] },
          { geometry: sphere(0.05, 1, 0.85, 1.05, 8), position: [0, -0.005, 0.15] },
          { geometry: limbGeometry(0.052, 0.05, 0.1), position: [0, 0.1, 0] }
        ],
        sole: [{ geometry: sole, position: [0, -0.05, 0.06] }]
      },
      materials
    );
    knee.add(foot);
    hips.add(hip);
    return { hip, knee, foot };
  };
  const left = makeLeg(-1);
  const right = makeLeg(1);

  // pelvis block (belongs to hips so it follows crouch)
  addBone(hips, { trousers: [{ geometry: sphere(0.17, 1.0, 0.6, 0.72, 14), position: [0, 0.04, 0] }] }, materials);

  // ---------------------------------------------------------------- torso
  const torso = new THREE.Group();
  torso.name = 'Torso';
  torso.position.y = F.hipHeight;
  root.add(torso);

  const chestGeo = lathe(
    [
      [0.0001, 0.0],
      [0.15, 0.02],
      [0.152, 0.12],
      [0.168, 0.3],
      [0.19, 0.44],
      [0.185, 0.53],
      [0.1, 0.6],
      [0.05, 0.62],
      [0.0001, 0.62]
    ],
    18
  );
  chestGeo.scale(1.0, 1.0, 0.62);
  const parts = { shirt: [{ geometry: chestGeo }] };

  if (opts.ghost) {
    // tattered shroud dress reaching almost to the ground, shoulders slightly hunched
    const dress = lathe(
      [
        [0.0001, 0.02],
        [0.2, 0.0],
        [0.26, -0.3],
        [0.32, -0.62],
        [0.38, -0.82],
        [0.34, -0.9],
        [0.4, -0.92],
        [0.0001, -0.92]
      ],
      16
    );
    dress.scale(1, 1, 0.9);
    parts.shirt.push({ geometry: dress });
  } else {
    // hi-vis vest: slightly larger shell over the chest + two retro-reflective bands
    const vestGeo = lathe(
      [
        [0.0001, 0.1],
        [0.158, 0.12],
        [0.176, 0.3],
        [0.198, 0.44],
        [0.19, 0.5],
        [0.0001, 0.5]
      ],
      18
    );
    vestGeo.scale(1.0, 1.0, 0.66);
    parts.vest = [{ geometry: vestGeo }];
    const band = (y, r) => {
      const g = lathe([[r, y], [r, y + 0.04]], 18);
      g.scale(1.0, 1.0, 0.665);
      return { geometry: g };
    };
    parts.stripe = [band(0.205, 0.172), band(0.34, 0.186), { geometry: new THREE.BoxGeometry(0.03, 0.28, 0.01), position: [-0.075, 0.38, 0.131] }, { geometry: new THREE.BoxGeometry(0.03, 0.28, 0.01), position: [0.075, 0.38, 0.131] }];
  }
  addBone(torso, parts, materials);

  // neck
  addBone(torso, { skin: [{ geometry: limbGeometry(0.045, 0.04, 0.1), position: [0, 0.66, 0] }] }, materials);

  // ---------------------------------------------------------------- arms
  const makeArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.name = side < 0 ? 'LeftShoulder' : 'RightShoulder';
    shoulder.position.set(side * F.shoulderX, F.shoulderY, 0);
    const armParts = { shirt: [{ geometry: limbGeometry(0.052, 0.042, F.upperArm) }], vest: [] };
    const pad = { geometry: sphere(0.062, 1, 0.9, 1, 10), position: [0, -0.01, 0] };
    (opts.ghost ? armParts.shirt : armParts.vest).push(pad);
    addBone(shoulder, armParts, materials);
    const elbow = new THREE.Group();
    elbow.name = 'Elbow';
    elbow.position.y = -F.upperArm;
    addBone(elbow, { shirt: [{ geometry: limbGeometry(0.042, 0.034, F.foreArm) }] }, materials);
    const hand = new THREE.Group();
    hand.name = 'Hand';
    hand.position.y = -F.foreArm;
    addBone(
      hand,
      {
        [opts.ghost ? 'skin' : 'glove']: [
          { geometry: sphere(0.04, 0.9, 1.25, 0.6, 8), position: [0, -0.04, 0] },
          { geometry: new THREE.BoxGeometry(0.02, 0.05, 0.03), position: [side * -0.035, -0.03, 0.02], rotation: [0, 0, side * 0.3] }
        ]
      },
      materials
    );
    elbow.add(hand);
    shoulder.add(elbow);
    torso.add(shoulder);
    return { shoulder, elbow, hand };
  };
  const leftA = makeArm(-1);
  const rightA = makeArm(1);

  // ---------------------------------------------------------------- head
  const headPivot = new THREE.Group();
  headPivot.name = 'HeadPivot';
  headPivot.position.set(0, F.headY, 0);
  torso.add(headPivot);

  const headParts = {
    skin: [
      { geometry: sphere(0.092, 0.95, 1.12, 1.02, 16), position: [0, 0.11, 0] },
      { geometry: sphere(0.05, 0.9, 0.7, 0.8, 8), position: [0, 0.035, 0.035] }, // jaw
      { geometry: new THREE.ConeGeometry(0.014, 0.04, 6), position: [0, 0.1, 0.098], rotation: [Math.PI / 2, 0, 0] }, // nose
      { geometry: sphere(0.02, 0.5, 1.0, 0.8, 6), position: [-0.09, 0.11, 0] }, // ears
      { geometry: sphere(0.02, 0.5, 1.0, 0.8, 6), position: [0.09, 0.11, 0] }
    ],
    eye: [
      { geometry: sphere(0.011, 1, 1, 0.6, 6), position: [-0.035, 0.13, 0.083] },
      { geometry: sphere(0.011, 1, 1, 0.6, 6), position: [0.035, 0.13, 0.083] }
    ]
  };
  if (opts.ghost) {
    // long, lank hair falling past the shoulders
    const hairGeo = lathe(
      [
        [0.0001, 0.27],
        [0.075, 0.26],
        [0.11, 0.2],
        [0.125, 0.1],
        [0.13, -0.05],
        [0.12, -0.28],
        [0.095, -0.3],
        [0.0001, -0.3]
      ],
      14
    );
    hairGeo.scale(1.0, 1.0, 0.85);
    headParts.hair = [{ geometry: hairGeo, position: [0, 0.07, -0.015] }];
  } else {
    // knitted cap, headband and headlamp
    const capGeo = new THREE.SphereGeometry(0.1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
    capGeo.scale(1.0, 1.1, 1.08);
    headParts.cap = [
      { geometry: capGeo, position: [0, 0.125, -0.005] },
      { geometry: new THREE.TorusGeometry(0.098, 0.012, 6, 16), position: [0, 0.158, -0.004], rotation: [Math.PI / 2, 0, 0] }
    ];
    headParts.lampCase = [
      { geometry: new THREE.BoxGeometry(0.07, 0.04, 0.035), position: [0, 0.17, 0.1] },
      { geometry: new THREE.TorusGeometry(0.099, 0.006, 5, 18), position: [0, 0.17, -0.003], rotation: [Math.PI / 2, 0, 0] }
    ];
    headParts.lampLens = [{ geometry: new THREE.CylinderGeometry(0.016, 0.016, 0.012, 10), position: [0, 0.17, 0.12], rotation: [Math.PI / 2, 0, 0] }];
  }
  addBone(headPivot, headParts, materials);

  // ---------------------------------------------------------------- pose / animation
  const state = { phase: 0, walk: 0, crouch: 0, light: 0, sway: 0 };

  /**
   * opts: { moving, sprinting, crouched, holdLight, alive }. dt in seconds.
   * Frequencies follow stride length so feet do not skate badly.
   */
  function animate(dt, o = {}) {
    const k = Math.min(1, dt * 10);
    const sprint = o.sprinting ? 1 : 0;
    state.walk += ((o.moving ? 1 : 0) - state.walk) * k;
    state.crouch += ((o.crouched ? 1 : 0) - state.crouch) * Math.min(1, dt * 8);
    state.light += ((o.holdLight ? 1 : 0) - state.light) * Math.min(1, dt * 6);
    if (o.moving) state.phase += dt * (sprint ? 12.5 : o.crouched ? 5.5 : 8.2);
    state.sway += dt;

    const w = state.walk;
    const c = state.crouch;
    const p = state.phase;
    const amp = (sprint ? 0.85 : 0.5) * (1 - c * 0.4) * w;
    const s = Math.sin(p);
    const co = Math.cos(p);

    // legs: +x rotation swings the foot backwards (figure faces +Z)
    const lh = s * amp;
    const rh = -s * amp;
    left.hip.rotation.x = lh - c * 0.95;
    right.hip.rotation.x = rh - c * 0.95;
    left.knee.rotation.x = Math.max(0, -co) * 1.0 * w * (sprint ? 1.2 : 0.8) + c * 1.6;
    right.knee.rotation.x = Math.max(0, co) * 1.0 * w * (sprint ? 1.2 : 0.8) + c * 1.6;
    left.foot.rotation.x = -(left.hip.rotation.x + left.knee.rotation.x) * 0.5 * (1 - c) - c * 0.45;
    right.foot.rotation.x = -(right.hip.rotation.x + right.knee.rotation.x) * 0.5 * (1 - c) - c * 0.45;

    // body bob + crouch height + lean
    const hipY = FIGURE.hipHeight + (FIGURE.crouchHipHeight - FIGURE.hipHeight) * c;
    const bob = Math.abs(Math.cos(p)) * 0.035 * w * (1 - c);
    hips.position.y = hipY + bob - 0.0;
    torso.position.y = hipY + bob;
    torso.rotation.x = c * 0.28 + w * (sprint ? 0.16 : 0.04);
    torso.rotation.y = Math.sin(p) * 0.12 * w;
    hips.rotation.y = -Math.sin(p) * 0.08 * w;
    const breathe = Math.sin(state.sway * 1.6) * 0.008;
    torso.scale.y = 1 + breathe;

    // arms swing opposite the legs; right arm raises while holding a light
    const aw = amp * 0.75;
    leftA.shoulder.rotation.x = -s * aw * 1.0;
    leftA.elbow.rotation.x = -(0.2 + Math.abs(s) * 0.25 * w + (sprint ? 0.9 * w : 0));
    leftA.shoulder.rotation.z = 0.06;
    const raise = state.light;
    rightA.shoulder.rotation.x = s * aw * (1 - raise) - 1.15 * raise;
    rightA.elbow.rotation.x = -(0.2 + Math.abs(s) * 0.25 * w) * (1 - raise) - 0.55 * raise;
    rightA.shoulder.rotation.z = -0.06;
  }

  function dispose() {
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }

  animate(0, {});

  return {
    root,
    hips,
    torso,
    headPivot,
    leftLeg: left.hip,
    rightLeg: right.hip,
    leftKnee: left.knee,
    rightKnee: right.knee,
    leftArm: leftA.shoulder,
    rightArm: rightA.shoulder,
    leftElbow: leftA.elbow,
    rightElbow: rightA.elbow,
    rightHand: rightA.hand,
    animate,
    dispose
  };
}

/**
 * Ghost figure: same skeleton with the dissolve material on every part, a hunched floating pose,
 * dangling arms and swaying hair/dress. `material` is typically engine.createGhostMaterial().
 * Returns { group, figure, update(delta, { moving, hunting }) }; add `group` where the old capsule was
 * (feet at y = 0, faces +Z). Disposes only geometry; the caller owns `material`.
 */
export function createGhostFigure(material) {
  const mats = new Proxy({}, { get: () => material });
  const figure = createHumanFigure(mats, { ghost: true });
  const group = new THREE.Group();
  group.name = 'GhostFigure';
  group.add(figure.root);
  figure.root.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });
  let t = Math.random() * 10;
  function update(delta, { moving = false, hunting = false } = {}) {
    t += delta;
    figure.animate(delta, { moving, sprinting: hunting, crouched: false, holdLight: false });
    // floating, drifting sway; arms hang forward and limp
    group.position.y = 0.08 + Math.sin(t * 1.3) * 0.05;
    figure.torso.rotation.z = Math.sin(t * 0.9) * 0.05;
    figure.torso.rotation.x += 0.12;
    figure.headPivot.rotation.z = Math.sin(t * 0.7 + 1) * 0.12;
    figure.headPivot.rotation.x = 0.18 + Math.sin(t * 0.5) * 0.05;
    figure.leftArm.rotation.x = -0.35 + Math.sin(t * 1.1) * 0.08;
    figure.rightArm.rotation.x = -0.35 + Math.sin(t * 1.1 + 1.2) * 0.08;
    figure.leftArm.rotation.z = 0.12 + Math.sin(t * 0.8) * 0.05;
    figure.rightArm.rotation.z = -0.12 - Math.sin(t * 0.8) * 0.05;
  }
  return { group, figure, update, dispose: () => figure.dispose() };
}
