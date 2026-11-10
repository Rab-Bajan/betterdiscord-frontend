// Composed low/mid-poly models for units, buildings and resource nodes. Each model is a list of
// parts (shared geometry + shared PBR material). Static parts of a model are merged per material into
// one geometry; animated parts (wheels, limbs, flags, cranes) stay separate and get a per-instance
// local matrix every frame. The renderer draws every (geometry, material) pair as one InstancedMesh.
import * as THREE from 'three';
import { mergeParts } from '../../phobia/visual/GeometryKit.js';

const PI = Math.PI;
const HALF = PI / 2;
// Materials whose base colour is white so the per-instance colour paints them in the team colour
const TEAM_MATS = new Set(['cloth', 'paint']);

export function createModelKit(lib) {
  const geos = new Map();
  const owned = [];
  const cache = (key, make) => {
    let g = geos.get(key);
    if (!g) { g = make(); geos.set(key, g); }
    return g;
  };
  const box = (w, h, d, pivot) => cache(`box:${w}:${h}:${d}:${pivot || ''}`, () => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (pivot === 'top') g.translate(0, -h / 2, 0);
    return g;
  });
  const cyl = (r, h, seg = 12, rt = r, pivot) => cache(`cyl:${r}:${h}:${seg}:${rt}:${pivot || ''}`, () => {
    const g = new THREE.CylinderGeometry(rt, r, h, seg);
    if (pivot === 'top') g.translate(0, -h / 2, 0);
    return g;
  });
  const sph = (r, ws = 10, hs = 8, half = false) => cache(`sph:${r}:${ws}:${hs}:${half}`, () => new THREE.SphereGeometry(r, ws, hs, 0, PI * 2, 0, half ? HALF : PI));
  const cone = (r, h, seg = 8) => cache(`cone:${r}:${h}:${seg}`, () => new THREE.ConeGeometry(r, h, seg));
  const pyramid = () => cache('pyramid', () => { const g = new THREE.ConeGeometry(1, 1, 4); g.rotateY(PI / 4); return g; });
  const torus = (r, t, rs = 6, ts = 14) => cache(`torus:${r}:${t}:${rs}:${ts}`, () => new THREE.TorusGeometry(r, t, rs, ts));
  const dodeca = (r) => cache(`dod:${r}`, () => new THREE.DodecahedronGeometry(r, 0));
  // graffiti decal: plane with UVs remapped to one cell of the 2x2 atlas
  const decal = (w, h, k) => cache(`decal:${w}:${h}:${k}`, () => {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    const u0 = (k % 2) * 0.5, v0 = 1 - (Math.floor(k / 2) + 1) * 0.5;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5);
    return g;
  });
  // hanging cable between two points with a catenary-like sag
  const cable = (a, b, sag) => cache(`cable:${a}:${b}:${sag}`, () => {
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * PI) * sag, a[2] + (b[2] - a[2]) * t));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.012, 4, false);
  });

  // ---------------- materials ----------------
  const std = (o) => { const m = new THREE.MeshStandardMaterial(o); owned.push(m); return m; };
  const phys = (o) => { const m = new THREE.MeshPhysicalMaterial(o); owned.push(m); return m; };
  const textured = (kind, extra = {}) => {
    const s = lib.set(kind);
    return std({ map: s.map, normalMap: s.normalMap, roughnessMap: s.ormMap, metalnessMap: s.ormMap, roughness: 1, metalness: 1, ...extra });
  };
  const mats = {
    rust: textured('rust'),
    copper: textured('copper'),
    steel: textured('steel'),
    crumble: textured('crumble'),
    concrete: textured('concrete'),
    brick: textured('brick'),
    wood: textured('wood'),
    glass: phys({ color: 0x0d1418, roughness: 0.03, metalness: 0.2, envMapIntensity: 2.4, clearcoat: 1, clearcoatRoughness: 0.02 }),
    glassLit: std({ color: 0x3a2a12, emissive: 0xffa040, emissiveIntensity: 1.7, roughness: 0.25 }),
    paint: phys({ color: 0xffffff, roughness: 0.36, metalness: 0.3, clearcoat: 0.85, clearcoatRoughness: 0.18 }),
    cloth: std({ color: 0xffffff, roughness: 0.86, metalness: 0 }),
    dark: std({ color: 0x2c2b29, roughness: 0.9, metalness: 0.05 }),
    coat: std({ color: 0x47443e, roughness: 0.92, metalness: 0 }),
    grey: std({ color: 0x8b8c8f, roughness: 0.9, metalness: 0 }),
    denim: std({ color: 0x34405a, roughness: 0.9, metalness: 0 }),
    skin: std({ color: 0xc89878, roughness: 0.62, metalness: 0 }),
    hair: std({ color: 0x241a12, roughness: 0.8, metalness: 0 }),
    leather: std({ color: 0x4a2c1a, roughness: 0.6, metalness: 0 }),
    glove: std({ color: 0xa3201c, roughness: 0.5, metalness: 0 }),
    rubber: std({ color: 0x141414, roughness: 0.88, metalness: 0 }),
    chrome: std({ color: 0xd8dce0, roughness: 0.16, metalness: 1 }),
    gold: std({ color: 0xd9ab4a, roughness: 0.3, metalness: 1 }),
    hardhat: std({ color: 0xf0b020, roughness: 0.4, metalness: 0 }),
    hivis: std({ color: 0xff7a1a, roughness: 0.7, metalness: 0, emissive: 0x401800, emissiveIntensity: 0.4 }),
    horse: std({ color: 0x6a4a30, roughness: 0.8, metalness: 0 }),
    hay: std({ color: 0xc8a85a, roughness: 0.95, metalness: 0 }),
    bag: std({ color: 0xd8d2c0, roughness: 0.9, metalness: 0 }),
    sandbag: std({ color: 0xa8956c, roughness: 0.95, metalness: 0 }),
    cabbage: std({ color: 0x6a8a3a, roughness: 0.7, metalness: 0 }),
    headlight: std({ color: 0xfff6d8, emissive: 0xfff0c8, emissiveIntensity: 4, roughness: 0.2 }),
    taillight: std({ color: 0x400000, emissive: 0xff2010, emissiveIntensity: 2.5, roughness: 0.3 }),
    lamp: std({ color: 0xffffff, emissive: 0xfff2c0, emissiveIntensity: 3, roughness: 0.3 }),
    fire: std({ color: 0x000000, emissive: 0xff7a20, emissiveIntensity: 3.5, roughness: 1 }),
    cargo: std({ color: 0xffffff, roughness: 0.7, metalness: 0.35 }),
    decal: std({ map: lib.graffiti(), transparent: true, alphaTest: 0.04, depthWrite: false, roughness: 0.75, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4 })
  };
  // Remember the material key on the material for batching options
  for (const [k, m] of Object.entries(mats)) m.userData.key = k;

  // ---------------- model assembly ----------------
  const _m = new THREE.Matrix4();
  // P(geometry, materialKey, position, { r, s, o, anim, team, cargo, scaffold })
  const P = (g, m, p, x = {}) => ({ g, m, p, r: x.r || [0, 0, 0], s: x.s || [1, 1, 1], o: x.o || null, anim: x.anim || null, team: x.team ?? TEAM_MATS.has(m), cargo: !!x.cargo, scaffold: !!x.scaffold });

  function finalize(raw, meta) {
    const groups = new Map();
    const parts = [];
    for (const p of raw) {
      if (p.anim) {
        parts.push({
          geo: p.g, mat: mats[p.m], team: p.team, cargo: p.cargo, scaffold: p.scaffold, anim: p.anim,
          p: new THREE.Vector3(...p.p), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.r)), s: new THREE.Vector3(...p.s),
          o: p.o ? new THREE.Vector3(...p.o) : null
        });
        continue;
      }
      const key = `${p.m}|${p.team ? 1 : 0}|${p.cargo ? 1 : 0}|${p.scaffold ? 1 : 0}`;
      let g = groups.get(key);
      if (!g) { g = { m: p.m, team: p.team, cargo: p.cargo, scaffold: p.scaffold, list: [] }; groups.set(key, g); }
      g.list.push({ geometry: p.g, position: p.p, rotation: p.r, scale: p.s });
    }
    for (const g of groups.values()) {
      const merged = mergeParts(g.list, g.m === 'decal' ? {} : { tile: 1 });
      owned.push(merged);
      parts.push({ geo: merged, mat: mats[g.m], team: g.team, cargo: g.cargo, scaffold: g.scaffold, anim: null, local: _m.identity().clone() });
    }
    return { parts, top: meta.top, radius: meta.radius, emitters: meta.emitters || [], size: meta.size || 1, vehicle: !!meta.vehicle };
  }

  // ---------------- humans ----------------
  // Feet at y = 0, facing +z. Limbs pivot at hip / shoulder (geometry hangs below the pivot).
  function human(o = {}) {
    const s = o.scale || 1;
    const S = [s, s, s];
    const at = (x, y, z) => [x * s, y * s, z * s];
    const tw = o.torsoW || 0.24;
    const torso = o.torso || 'cloth';
    const out = [
      P(box(0.085, 0.32, 0.1, 'top'), o.legs || 'denim', at(-0.055, 0.32, 0), { s: S, anim: { src: 'legL' } }),
      P(box(0.085, 0.32, 0.1, 'top'), o.legs || 'denim', at(0.055, 0.32, 0), { s: S, anim: { src: 'legR' } }),
      P(box(tw, o.torsoH || 0.27, 0.14), torso, at(0, 0.32 + (o.torsoH || 0.27) / 2, 0), { s: S, team: o.torsoTeam ?? TEAM_MATS.has(torso) }),
      P(sph(0.075), 'skin', at(0, 0.665, 0), { s: S })
    ];
    const armMat = o.arms || torso;
    const armTeam = o.torsoTeam ?? TEAM_MATS.has(armMat);
    if (o.push) {
      // both arms forward holding cart handles
      out.push(P(box(0.07, 0.27, 0.08, 'top'), armMat, at(-tw / 2 - 0.035, 0.575, 0), { s: S, r: [-1.15, 0, 0], team: armTeam }));
      out.push(P(box(0.07, 0.27, 0.08, 'top'), armMat, at(tw / 2 + 0.035, 0.575, 0), { s: S, r: [-1.15, 0, 0], team: armTeam }));
    } else {
      out.push(P(box(0.07, 0.27, 0.08, 'top'), armMat, at(-tw / 2 - 0.035, 0.575, 0), { s: S, anim: { src: 'armL' }, team: armTeam }));
      out.push(P(box(0.07, 0.27, 0.08, 'top'), armMat, at(tw / 2 + 0.035, 0.575, 0), { s: S, anim: { src: 'armR' }, team: armTeam }));
    }
    // something held in the right hand (moves with the arm)
    const hand = (g, m, offset, r = [0, 0, 0], extra = {}) => P(g, m, at(tw / 2 + 0.035, 0.575, 0), { s: S, anim: { src: 'armR' }, o: [offset[0] * s, offset[1] * s, offset[2] * s], r, ...extra });
    return { parts: out, hand, at, S, s };
  }

  const models = new Map();
  const def = (key, build) => { models.set(key, { build, built: null }); };

  // ---- units ----
  def('scavenger', () => {
    const h = human({ push: true });
    const p = h.parts;
    p.push(P(cyl(0.09, 0.07, 10), 'cloth', [0, 0.765, 0], { team: true })); // cap
    p.push(P(box(0.13, 0.015, 0.08), 'cloth', [0, 0.735, 0.08], { team: true }));
    // pushcart ahead of the worker
    p.push(P(box(0.38, 0.12, 0.42), 'rust', [0, 0.27, 0.5]));
    p.push(P(box(0.4, 0.03, 0.44), 'steel', [0, 0.335, 0.5]));
    p.push(P(cyl(0.012, 0.4, 5), 'steel', [-0.15, 0.37, 0.18], { r: [1.3, 0, 0] }));
    p.push(P(cyl(0.012, 0.4, 5), 'steel', [0.15, 0.37, 0.18], { r: [1.3, 0, 0] }));
    p.push(P(cyl(0.012, 0.18, 5), 'steel', [0, 0.17, 0.62]));
    for (const x of [-0.22, 0.22]) p.push(P(cyl(0.11, 0.04, 12), 'rubber', [x, 0.11, 0.5], { r: [0, 0, HALF], anim: { src: 'wheel' } }));
    p.push(P(dodeca(0.15), 'cargo', [0, 0.38, 0.5], { s: [1.2, 0.7, 1.1], cargo: true }));
    p.push(P(dodeca(0.09), 'cargo', [0.08, 0.45, 0.42], { cargo: true }));
    return finalize(p, { top: 0.95, radius: 0.42 });
  });
  def('builder', () => {
    const h = human({ torso: 'hivis', torsoTeam: false, arms: 'cloth' });
    const p = h.parts;
    p.push(P(sph(0.09, 10, 6, true), 'hardhat', [0, 0.69, 0], { s: [1, 0.85, 1.05] }));
    p.push(P(cyl(0.11, 0.015, 12), 'hardhat', [0, 0.69, 0.01]));
    p.push(P(box(0.25, 0.04, 0.15), 'leather', [0, 0.34, 0]));
    p.push(P(box(0.07, 0.04, 0.6), 'wood', [-0.07, 0.62, -0.05], { r: [0, 0.2, 0] }));
    p.push(h.hand(cyl(0.012, 0.22, 5), 'wood', [0, -0.27, 0.05], [HALF, 0, 0]));
    p.push(h.hand(box(0.05, 0.05, 0.1), 'steel', [0, -0.27, 0.16]));
    return finalize(p, { top: 0.95, radius: 0.42 });
  });
  def('knife', () => {
    const h = human({ torsoW: 0.22 });
    const p = h.parts;
    p.push(P(sph(0.085, 10, 6, true), 'cloth', [0, 0.68, -0.015], { s: [1, 1.05, 1.1] })); // hood
    p.push(h.hand(box(0.012, 0.03, 0.14), 'chrome', [0, -0.28, 0.08]));
    p.push(h.hand(box(0.02, 0.035, 0.05), 'dark', [0, -0.28, 0.0]));
    return finalize(p, { top: 0.9, radius: 0.42 });
  });
  def('brawler', () => {
    const h = human({ scale: 1.15, torsoW: 0.32, torso: 'cloth', arms: 'skin', torsoTeam: true });
    const p = h.parts;
    p.push(P(sph(0.06), 'glove', h.at(-0.195, 0.575, 0), { s: h.S, anim: { src: 'armL' }, o: [0, -0.28 * h.s, 0.02] }));
    p.push(h.hand(sph(0.06), 'glove', [0, -0.28, 0.02]));
    p.push(P(box(0.2, 0.05, 0.12), 'dark', h.at(0, 0.34, 0), { s: h.S }));
    return finalize(p, { top: 1.0, radius: 0.45 });
  });
  def('slingshot', () => {
    const h = human({ scale: 0.8, legs: 'dark' });
    const p = h.parts;
    p.push(P(cyl(0.08, 0.06, 10), 'cloth', h.at(0, 0.75, 0), { s: h.S, team: true }));
    p.push(P(box(0.13, 0.012, 0.09), 'cloth', h.at(0, 0.725, 0.08), { s: h.S, team: true }));
    p.push(h.hand(box(0.015, 0.12, 0.015), 'wood', [0, -0.3, 0.06]));
    p.push(h.hand(box(0.08, 0.015, 0.015), 'wood', [0, -0.24, 0.06]));
    return finalize(p, { top: 0.75, radius: 0.38 });
  });
  def('airgunner', () => {
    const h = human({ torso: 'cloth', legs: 'coat' });
    const p = h.parts;
    p.push(P(cyl(0.1, 0.06, 10, 0.075), 'coat', [0, 0.745, 0]));
    p.push(P(cyl(0.13, 0.012, 12), 'coat', [0, 0.715, 0]));
    p.push(h.hand(cyl(0.012, 0.55, 6), 'steel', [0, -0.22, 0.18], [1.35, 0, 0]));
    p.push(h.hand(box(0.035, 0.07, 0.2), 'wood', [0, -0.26, -0.02], [0.2, 0, 0]));
    return finalize(p, { top: 0.95, radius: 0.42 });
  });
  def('grinder', () => {
    const h = human({ torso: 'cloth', legs: 'coat' });
    const p = h.parts;
    p.push(P(box(0.17, 0.13, 0.015), 'glass', [0, 0.67, 0.08])); // face shield
    p.push(P(box(0.18, 0.02, 0.12), 'hardhat', [0, 0.74, 0.02]));
    p.push(h.hand(cyl(0.025, 0.18, 8), 'steel', [-0.06, -0.27, 0.08], [0, 0, HALF]));
    p.push(h.hand(cyl(0.09, 0.008, 16), 'chrome', [-0.12, -0.27, 0.16], [0, 0, HALF], { anim: { src: 'armR', spin: 'disk' } }));
    return finalize(p, { top: 0.95, radius: 0.42 });
  });
  def('elder', () => {
    const h = human({ scale: 1.1, torso: 'cloth', torsoH: 0.4, legs: 'dark' });
    const p = h.parts;
    p.push(P(box(0.26, 0.2, 0.15), 'cloth', h.at(0, 0.3, 0), { s: h.S })); // coat tails
    p.push(P(cyl(0.07, 0.12, 12), 'dark', h.at(0, 0.79, 0), { s: h.S })); // hat crown
    p.push(P(cyl(0.14, 0.014, 14), 'dark', h.at(0, 0.735, 0), { s: h.S })); // brim
    p.push(P(torus(0.08, 0.008, 4, 14), 'gold', h.at(0, 0.6, 0.05), { s: h.S, r: [1.2, 0, 0] }));
    p.push(P(box(0.12, 0.07, 0.04), 'hair', h.at(0, 0.62, 0.065), { s: h.S })); // moustache & beard
    p.push(h.hand(cyl(0.012, 0.6, 6), 'wood', [0, -0.27, 0.06]));
    p.push(h.hand(sph(0.025), 'gold', [0, 0.03, 0.06]));
    return finalize(p, { top: 1.1, radius: 0.5 });
  });
  def('infiltrator', () => {
    const h = human({ torso: 'coat', torsoH: 0.34, legs: 'dark', torsoTeam: false });
    const p = h.parts;
    p.push(P(box(0.26, 0.16, 0.16), 'coat', [0, 0.3, 0]));
    p.push(P(cyl(0.07, 0.09, 12, 0.06), 'dark', [0, 0.77, 0])); // fedora
    p.push(P(cyl(0.12, 0.012, 14), 'dark', [0, 0.73, 0]));
    p.push(P(box(0.2, 0.05, 0.17), 'cloth', [0, 0.6, 0.0], { team: true })); // scarf in team colour
    p.push(h.hand(box(0.05, 0.12, 0.16), 'leather', [0, -0.3, 0.02])); // briefcase
    return finalize(p, { top: 0.95, radius: 0.42 });
  });
  def('civilian', () => {
    const h = human({ torso: 'grey', torsoTeam: false, legs: 'denim' });
    const p = h.parts;
    p.push(P(cyl(0.085, 0.04, 10), 'coat', [0, 0.745, 0.01], { s: [1, 1, 1.15] }));
    p.push(h.hand(box(0.11, 0.13, 0.06), 'bag', [0, -0.33, 0]));
    return finalize(p, { top: 0.9, radius: 0.42 });
  });
  def('horseWagon', () => {
    const p = [];
    // horse
    p.push(P(box(0.2, 0.22, 0.55), 'horse', [0, 0.5, 0.42]));
    p.push(P(box(0.11, 0.28, 0.13), 'horse', [0, 0.66, 0.72], { r: [-0.6, 0, 0] }));
    p.push(P(box(0.1, 0.1, 0.24), 'horse', [0, 0.8, 0.86], { r: [0.3, 0, 0] }));
    p.push(P(box(0.03, 0.18, 0.3), 'hair', [0, 0.72, 0.66], { r: [-0.6, 0, 0] }));
    p.push(P(box(0.03, 0.22, 0.04), 'hair', [0, 0.5, 0.15], { r: [0.4, 0, 0] }));
    const legs = [[-0.07, 0.62, 'legL'], [0.07, 0.62, 'legR'], [-0.07, 0.22, 'legR'], [0.07, 0.22, 'legL']];
    for (const [x, z, src] of legs) p.push(P(box(0.05, 0.4, 0.06, 'top'), 'horse', [x, 0.42, z], { anim: { src } }));
    p.push(P(box(0.24, 0.04, 0.05), 'cloth', [0, 0.6, 0.62], { team: true })); // harness
    // wagon
    p.push(P(box(0.5, 0.08, 0.7), 'wood', [0, 0.34, -0.28]));
    p.push(P(box(0.52, 0.14, 0.03), 'wood', [0, 0.44, 0.06]));
    p.push(P(box(0.52, 0.14, 0.03), 'wood', [0, 0.44, -0.62]));
    p.push(P(box(0.03, 0.14, 0.7), 'wood', [-0.25, 0.44, -0.28]));
    p.push(P(box(0.03, 0.14, 0.7), 'wood', [0.25, 0.44, -0.28]));
    p.push(P(box(0.02, 0.02, 0.5), 'wood', [-0.1, 0.38, 0.28]));
    p.push(P(box(0.02, 0.02, 0.5), 'wood', [0.1, 0.38, 0.28]));
    p.push(P(box(0.4, 0.12, 0.45), 'hay', [0, 0.44, -0.35]));
    p.push(P(box(0.44, 0.03, 0.3), 'cloth', [0, 0.52, -0.5], { team: true }));
    for (const [x, z] of [[-0.29, -0.05], [0.29, -0.05], [-0.29, -0.52], [0.29, -0.52]]) p.push(P(cyl(0.16, 0.035, 12), 'wood', [x, 0.16, z], { r: [0, 0, HALF], anim: { src: 'wheel' } }));
    // driver
    p.push(P(box(0.18, 0.2, 0.12), 'cloth', [0, 0.56, -0.02], { team: true }));
    p.push(P(sph(0.065), 'skin', [0, 0.73, -0.02]));
    p.push(P(cyl(0.08, 0.05, 10), 'dark', [0, 0.8, -0.02]));
    return finalize(p, { top: 1.0, radius: 0.7, vehicle: true });
  });
  def('lada', () => {
    const p = [];
    p.push(P(box(0.52, 0.19, 1.08), 'paint', [0, 0.23, 0], { team: true }));
    p.push(P(box(0.46, 0.15, 0.5), 'glass', [0, 0.395, -0.05]));
    p.push(P(box(0.48, 0.035, 0.46), 'paint', [0, 0.485, -0.06], { team: true }));
    for (const x of [-0.225, 0.225]) for (const z of [0.18, -0.29]) p.push(P(box(0.03, 0.15, 0.03), 'paint', [x, 0.395, z], { team: true }));
    p.push(P(box(0.44, 0.012, 0.16), 'glass', [0, 0.33, 0.3], { r: [-0.2, 0, 0] })); // hood reflection strip
    p.push(P(box(0.54, 0.06, 0.04), 'chrome', [0, 0.17, 0.555]));
    p.push(P(box(0.54, 0.06, 0.04), 'chrome', [0, 0.17, -0.555]));
    p.push(P(box(0.3, 0.07, 0.015), 'dark', [0, 0.25, 0.545]));
    for (const x of [-0.18, 0.18]) {
      p.push(P(cyl(0.04, 0.02, 12), 'headlight', [x, 0.26, 0.548], { r: [HALF, 0, 0] }));
      p.push(P(box(0.08, 0.04, 0.012), 'taillight', [x, 0.27, -0.545]));
    }
    for (const x of [-0.26, 0.26]) for (const z of [0.34, -0.34]) {
      p.push(P(cyl(0.11, 0.08, 14), 'rubber', [x, 0.11, z], { r: [0, 0, HALF], anim: { src: 'wheel' } }));
      p.push(P(cyl(0.06, 0.085, 8), 'chrome', [x, 0.11, z], { r: [0, 0, HALF], anim: { src: 'wheel' } }));
    }
    p.push(P(box(0.4, 0.02, 0.36), 'steel', [0, 0.515, -0.06]));
    p.push(P(box(0.3, 0.1, 0.22), 'leather', [0, 0.575, -0.1]));
    p.push(P(box(0.008, 0.02, 0.2), 'chrome', [0.24, 0.52, 0.3], { r: [0.4, 0, 0] })); // antenna
    return finalize(p, { top: 0.85, radius: 0.72, vehicle: true });
  });
  def('ram', () => {
    const p = [];
    p.push(P(box(0.5, 0.08, 0.95), 'steel', [0, 0.25, 0]));
    p.push(P(box(0.06, 0.3, 0.06), 'steel', [-0.2, 0.42, 0.3]));
    p.push(P(box(0.06, 0.3, 0.06), 'steel', [0.2, 0.42, 0.3]));
    p.push(P(box(0.06, 0.3, 0.06), 'steel', [-0.2, 0.42, -0.3]));
    p.push(P(box(0.06, 0.3, 0.06), 'steel', [0.2, 0.42, -0.3]));
    p.push(P(box(0.58, 0.04, 1.0), 'rust', [0, 0.75, 0], { r: [0, 0, 0] }));
    p.push(P(box(0.6, 0.18, 0.03), 'cloth', [0, 0.66, 0.49], { team: true }));
    p.push(P(cyl(0.11, 0.9, 12), 'steel', [0, 0.45, 0.05], { r: [HALF, 0, 0], anim: { src: 'piston' } }));
    p.push(P(box(0.3, 0.3, 0.12), 'rust', [0, 0.45, 0.55], { anim: { src: 'piston' } }));
    p.push(P(cyl(0.05, 0.4, 8), 'chrome', [0, 0.45, -0.45], { r: [HALF, 0, 0] }));
    for (const x of [-0.29, 0.29]) for (const z of [0.32, -0.32]) p.push(P(cyl(0.14, 0.06, 12), 'rubber', [x, 0.14, z], { r: [0, 0, HALF], anim: { src: 'wheel' } }));
    return finalize(p, { top: 1.0, radius: 0.7, vehicle: true });
  });
  def('unit_generic', () => {
    const h = human({});
    return finalize(h.parts, { top: 0.9, radius: 0.42 });
  });

  // ---- buildings (origin = footprint centre on the ground) ----
  const flag = (x, y, z, w = 0.6, hgt = 0.36) => P(box(w, hgt, 0.02), 'cloth', [x, y, z], { o: [w / 2, 0, 0], anim: { src: 'flag' }, team: true });
  function scaffold(size, height) {
    const out = [];
    const e = size * 0.47;
    for (const x of [-e, 0, e]) for (const z of [-e, e]) out.push(P(box(0.04, height, 0.04), 'wood', [x, height / 2, z], { scaffold: true }));
    for (const z of [-e, 0]) for (const x of [-e, e]) out.push(P(box(0.04, height, 0.04), 'wood', [x, height / 2, z], { scaffold: true }));
    for (const y of [height * 0.35, height * 0.75]) {
      out.push(P(box(size * 0.94, 0.03, 0.03), 'wood', [0, y, e], { scaffold: true }));
      out.push(P(box(size * 0.94, 0.03, 0.03), 'wood', [0, y, -e], { scaffold: true }));
      out.push(P(box(0.03, 0.03, size * 0.94), 'wood', [e, y, 0], { scaffold: true }));
      out.push(P(box(0.03, 0.03, size * 0.94), 'wood', [-e, y, 0], { scaffold: true }));
      out.push(P(box(size * 0.9, 0.02, 0.18), 'wood', [0, y, e - 0.1], { scaffold: true }));
    }
    return out;
  }
  const B = (size, top, parts, emitters = []) => finalize([...parts, ...scaffold(size, top * 0.85)], { top, radius: size * 0.72, emitters, size });

  def('townCenter', () => B(3, 2.5, [
    P(box(2.9, 0.12, 2.9), 'concrete', [0, 0.04, 0]),
    P(box(2.0, 1.3, 1.6), 'crumble', [-0.3, 0.75, -0.35]),
    P(pyramid(), 'copper', [-0.3, 1.775, -0.35], { s: [1.58, 0.75, 1.3] }),
    P(box(0.24, 0.9, 0.24), 'brick', [0.25, 1.75, -0.75]),
    P(box(0.3, 0.05, 0.3), 'steel', [0.25, 2.22, -0.75]),
    P(box(0.85, 0.8, 1.3), 'rust', [1.05, 0.5, -0.25]),
    P(box(1.0, 0.05, 1.45), 'rust', [1.05, 0.95, -0.25], { r: [0, 0, -0.18] }),
    P(box(1.6, 0.04, 0.6), 'rust', [-0.3, 1.05, 0.72], { r: [0.25, 0, 0] }),
    P(cyl(0.025, 0.95, 6), 'steel', [-1.0, 0.55, 0.98]),
    P(cyl(0.025, 0.95, 6), 'steel', [0.4, 0.55, 0.98]),
    P(box(0.36, 0.62, 0.04), 'wood', [-0.3, 0.41, 0.46]),
    ...[[-0.95, 0.75], [0.35, 0.75], [-0.95, 1.15], [-0.3, 1.15], [0.35, 1.15]].map(([x, y]) => P(box(0.32, 0.3, 0.03), 'glass', [x, y, 0.455])),
    P(cyl(0.03, 2.4, 6), 'steel', [1.3, 1.25, 1.25]),
    flag(1.3, 2.25, 1.25),
    P(sph(0.18, 10, 6, true), 'steel', [-1.1, 1.55, 0.25], { r: [-1.1, 0.6, 0] }),
    P(cyl(0.045, 2.0, 7), 'wood', [-1.3, 1.0, 1.3]),
    P(box(0.6, 0.04, 0.04), 'wood', [-1.3, 1.9, 1.3]),
    P(cable([-1.55, 1.9, 1.3], [-1.2, 1.3, 0.46], 0.2), 'rubber', [0, 0, 0]),
    P(cable([-1.05, 1.9, 1.3], [-0.65, 1.32, 0.46], 0.18), 'rubber', [0, 0, 0]),
    P(cable([-1.3, 1.9, 1.3], [1.3, 1.6, 1.25], 0.35), 'rubber', [0, 0, 0]),
    ...[[0, 0], [2.1, 0], [4.2, 0]].map(([a]) => P(cyl(0.015, 0.6, 4), 'wood', [1.0 + Math.cos(a) * 0.12, 0.28, 1.0 + Math.sin(a) * 0.12], { r: [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25] })),
    P(sph(0.13, 10, 6, true), 'steel', [1.0, 0.33, 1.0], { r: [PI, 0, 0] }),
    P(cone(0.1, 0.18, 6), 'fire', [1.0, 0.12, 1.0]),
    P(decal(0.9, 0.45, 0), 'decal', [1.482, 0.5, -0.25], { r: [0, HALF, 0], team: false })
  ], [
    { type: 'smoke', p: [0.25, 2.3, -0.75], rate: 2.2, dark: false },
    { type: 'fire', p: [1.0, 0.2, 1.0], rate: 6, scale: 0.5 }
  ]));
  def('scrapYard', () => B(2, 1.6, [
    P(box(1.95, 0.06, 1.95), 'concrete', [0, 0.02, 0]),
    P(cone(0.45, 0.5, 7), 'rust', [-0.5, 0.25, -0.5]),
    P(box(0.5, 0.3, 0.4), 'rust', [-0.45, 0.2, -0.45], { r: [0.2, 0.5, 0.1] }),
    P(cyl(0.12, 0.6, 10), 'steel', [-0.2, 0.15, -0.65], { r: [0, 0.3, HALF] }),
    P(box(0.35, 0.25, 0.5), 'rust', [-0.62, 0.42, -0.3], { r: [0.4, 1.1, 0.3] }),
    P(box(0.3, 0.2, 0.3), 'steel', [-0.35, 0.5, -0.55], { r: [0.6, 0.2, 0.5] }),
    P(box(0.45, 0.3, 0.04), 'paint', [-0.72, 0.25, -0.7], { r: [0.3, 0.7, 0.8], team: true }),
    P(torus(0.14, 0.05, 6, 12), 'rubber', [-0.15, 0.06, -0.3], { r: [HALF, 0, 0] }),
    P(box(0.6, 0.6, 0.5), 'rust', [0.55, 0.33, -0.55]),
    P(box(0.7, 0.04, 0.62), 'rust', [0.55, 0.66, -0.55], { r: [0.15, 0, 0] }),
    P(box(0.3, 0.2, 0.02), 'glass', [0.55, 0.42, -0.295]),
    P(box(0.6, 0.16, 0.03), 'cloth', [0.55, 0.8, -0.3]),
    P(box(0.8, 0.05, 0.5), 'steel', [0.35, 0.045, 0.4]),
    P(cyl(0.05, 1.5, 8), 'steel', [0.78, 0.75, 0.78]),
    P(box(1.2, 0.06, 0.06), 'steel', [0.78, 1.45, 0.78], { o: [-0.45, 0, 0], anim: { src: 'crane' } }),
    P(cyl(0.008, 0.5, 4), 'dark', [0.78, 1.45, 0.78], { o: [-0.95, -0.25, 0], anim: { src: 'crane' } }),
    P(cyl(0.1, 0.05, 12), 'steel', [0.78, 1.45, 0.78], { o: [-0.95, -0.52, 0], anim: { src: 'crane' } }),
    ...[-0.95, -0.32, 0.32, 0.95].flatMap((t) => [
      P(cyl(0.02, 0.5, 5), 'steel', [t, 0.25, 0.95]), P(cyl(0.02, 0.5, 5), 'steel', [-0.95, 0.25, t])
    ]),
    P(box(1.9, 0.02, 0.02), 'steel', [0, 0.48, 0.95]),
    P(box(0.02, 0.02, 1.9), 'steel', [-0.95, 0.48, 0]),
    P(cyl(0.11, 0.3, 10), 'rust', [0.1, 0.16, -0.05]),
    P(decal(0.42, 0.22, 1), 'decal', [0.852, 0.35, -0.55], { r: [0, HALF, 0], team: false })
  ], [
    { type: 'fire', p: [0.1, 0.33, -0.05], rate: 9, scale: 0.6 },
    { type: 'smoke', p: [0.1, 0.45, -0.05], rate: 1.6, dark: true }
  ]));
  def('house', () => B(2, 1.3, [
    P(box(1.3, 0.75, 1.1), 'rust', [0, 0.4, -0.1]),
    P(box(1.5, 0.04, 1.35), 'rust', [0, 0.86, -0.1], { r: [0.22, 0, 0] }),
    P(box(0.3, 0.55, 0.03), 'wood', [-0.3, 0.31, 0.46]),
    P(box(0.28, 0.22, 0.02), 'glass', [0.3, 0.5, 0.455]),
    P(cyl(0.04, 0.55, 8), 'steel', [0.45, 1.1, -0.4]),
    P(cyl(0.02, 0.6, 5), 'wood', [-0.75, 0.3, 0.8]),
    P(cyl(0.02, 0.6, 5), 'wood', [0.75, 0.3, 0.8]),
    P(box(1.5, 0.008, 0.008), 'dark', [0, 0.58, 0.8]),
    ...[-0.4, 0.05, 0.45].map((x) => P(box(0.16, 0.2, 0.01), 'cloth', [x, 0.47, 0.8])),
    P(torus(0.14, 0.05, 6, 12), 'rubber', [0.72, 0.06, -0.72], { r: [HALF, 0, 0] }),
    P(decal(0.7, 0.35, 2), 'decal', [-0.652, 0.45, -0.1], { r: [0, -HALF, 0], team: false })
  ], [{ type: 'smoke', p: [0.45, 1.4, -0.4], rate: 1.0, dark: false }]));
  def('house_panel', () => {
    const parts = [P(box(1.7, 2.5, 1.2), 'crumble', [0, 1.3, 0])];
    for (let f = 0; f < 4; f++) {
      const y = 0.45 + f * 0.55;
      for (const x of [-0.55, 0, 0.55]) {
        if (!(f === 0 && x === -0.55)) parts.push(P(box(0.3, 0.28, 0.02), (f + x * 3) % 2 === 0 ? 'glassLit' : 'glass', [x, y, 0.605]));
        parts.push(P(box(0.3, 0.28, 0.02), 'glass', [x, y, -0.605]));
      }
      if (f > 0) parts.push(P(box(0.45, 0.05, 0.18), 'concrete', [0.55, y - 0.17, 0.69]), P(box(0.45, 0.12, 0.02), 'steel', [0.55, y - 0.1, 0.78]));
    }
    parts.push(
      P(box(1.74, 0.08, 1.24), 'cloth', [0, 2.42, 0]),
      P(box(1.75, 0.08, 1.25), 'concrete', [0, 2.58, 0]),
      P(cyl(0.015, 0.6, 4), 'steel', [0.5, 2.9, 0.2]),
      P(box(0.3, 0.015, 0.015), 'steel', [0.5, 3.05, 0.2]),
      P(sph(0.12, 10, 6, true), 'steel', [-0.5, 2.7, -0.3], { r: [-1.2, 0.4, 0] }),
      P(box(0.5, 0.04, 0.3), 'concrete', [-0.55, 0.62, 0.75]),
      P(box(0.3, 0.45, 0.02), 'glass', [-0.55, 0.32, 0.605]),
      P(decal(0.7, 0.35, 3), 'decal', [0.25, 0.25, 0.612], { team: false }),
      P(cable([-0.85, 2.3, 0.6], [0.85, 2.0, 0.6], 0.2), 'rubber', [0, 0, 0])
    );
    return B(2, 2.9, parts);
  });
  def('tavern', () => B(2, 1.6, [
    P(box(1.6, 1.0, 1.3), 'brick', [0, 0.55, -0.15]),
    P(box(1.66, 0.1, 1.36), 'concrete', [0, 1.1, -0.15]),
    P(box(1.5, 0.04, 0.45), 'cloth', [0, 0.82, 0.68], { r: [0.35, 0, 0] }),
    P(box(0.9, 0.25, 0.05), 'wood', [0, 1.28, 0.47]),
    P(box(0.95, 0.04, 0.06), 'cloth', [0, 1.14, 0.47]),
    P(box(0.42, 0.3, 0.03), 'glassLit', [-0.45, 0.55, 0.51]),
    P(box(0.42, 0.3, 0.03), 'glassLit', [0.45, 0.55, 0.51]),
    P(box(0.3, 0.55, 0.03), 'wood', [0, 0.33, 0.51]),
    P(cyl(0.13, 0.3, 10), 'wood', [0.65, 0.15, 0.78]),
    P(cyl(0.13, 0.3, 10), 'wood', [0.88, 0.15, 0.52]),
    P(cyl(0.13, 0.3, 10), 'wood', [0.62, 0.15, 0.48], { r: [HALF, 0.6, 0] }),
    P(box(0.2, 0.4, 0.2), 'brick', [-0.55, 1.3, -0.5]),
    P(sph(0.05), 'lamp', [0.62, 0.98, 0.54]),
    P(decal(0.8, 0.4, 0), 'decal', [0.802, 0.5, -0.15], { r: [0, HALF, 0], team: false })
  ], [{ type: 'smoke', p: [-0.55, 1.55, -0.5], rate: 1.0, dark: false }]));
  def('barracks', () => B(2, 1.6, [
    P(box(1.2, 0.85, 0.9), 'wood', [-0.2, 0.45, -0.3]),
    P(box(1.4, 0.05, 1.1), 'rust', [-0.2, 0.92, -0.3], { r: [0.12, 0, 0] }),
    P(box(0.6, 0.25, 0.02), 'dark', [-0.2, 0.58, 0.152]),
    P(box(0.7, 0.04, 0.15), 'wood', [-0.2, 0.43, 0.22]),
    ...[-0.75, -0.42, -0.09, 0.24].flatMap((x) => [P(box(0.3, 0.14, 0.18), 'sandbag', [x, 0.07, 0.78]), P(box(0.3, 0.14, 0.18), 'sandbag', [x + 0.15, 0.2, 0.78])]),
    P(cyl(0.28, 0.04, 16), 'wood', [0.68, 0.5, 0.25], { r: [HALF, 0, 0] }),
    P(torus(0.17, 0.03, 4, 18), 'cloth', [0.68, 0.5, 0.275]),
    P(sph(0.05), 'cloth', [0.68, 0.5, 0.275]),
    P(box(0.05, 0.5, 0.05), 'wood', [0.68, 0.2, 0.22]),
    P(cyl(0.025, 1.6, 6), 'steel', [0.75, 0.8, -0.75]),
    flag(0.75, 1.48, -0.75, 0.45, 0.28),
    P(decal(0.6, 0.3, 1), 'decal', [-0.802, 0.45, -0.3], { r: [0, -HALF, 0], team: false })
  ]));
  def('workshop', () => B(2, 2.0, [
    P(box(1.6, 0.95, 1.4), 'crumble', [0, 0.5, -0.1]),
    P(box(1.75, 0.05, 1.55), 'rust', [0, 1.02, -0.1], { r: [-0.1, 0, 0] }),
    P(box(0.9, 0.75, 0.03), 'steel', [-0.2, 0.42, 0.61]),
    P(box(1.0, 0.06, 0.05), 'dark', [-0.2, 0.82, 0.62]),
    P(cyl(0.07, 1.0, 10), 'steel', [0.55, 1.45, -0.5]),
    P(cyl(0.1, 0.05, 10), 'steel', [0.55, 1.97, -0.5]),
    P(cyl(0.1, 0.28, 10), 'paint', [0.62, 0.15, 0.78], { team: true }),
    P(cyl(0.1, 0.28, 10), 'paint', [0.86, 0.15, 0.6], { team: true }),
    P(torus(0.14, 0.055, 6, 12), 'rubber', [-0.8, 0.06, 0.78], { r: [HALF, 0, 0] }),
    P(torus(0.14, 0.055, 6, 12), 'rubber', [-0.8, 0.17, 0.78], { r: [HALF, 0, 0] }),
    P(torus(0.14, 0.055, 6, 12), 'rubber', [-0.8, 0.28, 0.78], { r: [HALF, 0, 0] }),
    P(box(0.5, 0.05, 0.25), 'wood', [0.42, 0.35, 0.78]),
    P(box(0.3, 0.2, 0.02), 'glass', [0.5, 0.6, 0.605]),
    P(box(0.5, 0.12, 0.03), 'cloth', [-0.2, 0.92, 0.63]),
    P(decal(0.9, 0.42, 2), 'decal', [0.802, 0.5, -0.1], { r: [0, HALF, 0], team: false })
  ], [
    { type: 'smoke', p: [0.55, 2.02, -0.5], rate: 3.2, dark: true },
    { type: 'weld', p: [-0.2, 0.25, 0.72], rate: 1.2 }
  ]));
  def('tower', () => B(1, 2.9, [
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => P(box(0.05, 1.85, 0.05), 'steel', [sx * 0.3, 0.92, sz * 0.3], { r: [sz * 0.06, 0, -sx * 0.06] })),
    ...[0.5, 1.2].flatMap((y) => [
      P(box(0.6, 0.03, 0.03), 'steel', [0, y, 0.28]), P(box(0.6, 0.03, 0.03), 'steel', [0, y, -0.28]),
      P(box(0.03, 0.03, 0.6), 'steel', [0.28, y, 0]), P(box(0.03, 0.03, 0.6), 'steel', [-0.28, y, 0])
    ]),
    P(box(0.8, 0.03, 0.03), 'steel', [0, 0.85, 0.29], { r: [0, 0, 0.9] }),
    P(box(0.03, 0.03, 0.8), 'steel', [0.29, 0.85, 0], { r: [0.9, 0, 0] }),
    P(box(0.8, 0.06, 0.8), 'steel', [0, 1.82, 0]),
    P(box(0.6, 0.45, 0.6), 'rust', [0, 2.07, 0]),
    P(box(0.75, 0.04, 0.75), 'rust', [0, 2.32, 0]),
    P(box(0.4, 0.08, 0.62), 'dark', [0, 2.14, 0]),
    P(cyl(0.06, 0.12, 10), 'lamp', [0, 2.42, 0], { r: [HALF, 0, 0], o: [0, 0, 0.08], anim: { src: 'search' } }),
    P(cyl(0.015, 0.5, 4), 'steel', [0.3, 2.55, 0.3]),
    flag(0.3, 2.72, 0.3, 0.3, 0.18)
  ]));
  def('fence', () => B(1, 0.7, [
    P(box(0.07, 0.55, 0.07), 'wood', [-0.45, 0.27, 0]),
    P(box(0.07, 0.55, 0.07), 'wood', [0, 0.27, 0]),
    P(box(0.07, 0.55, 0.07), 'wood', [0.45, 0.27, 0]),
    P(box(1.0, 0.08, 0.03), 'wood', [0, 0.18, 0.04]),
    P(box(1.0, 0.08, 0.03), 'wood', [0, 0.4, 0.04]),
    ...[-0.32, -0.16, 0.16, 0.32].map((x) => P(box(0.07, 0.42, 0.02), 'wood', [x, 0.25, 0.065])),
    P(box(0.1, 0.06, 0.035), 'cloth', [0, 0.48, 0.06])
  ]));
  def('wall', () => B(1, 1.0, [
    P(box(1.0, 0.85, 0.32), 'crumble', [0, 0.43, 0]),
    P(box(1.04, 0.06, 0.36), 'concrete', [0, 0.88, 0]),
    P(box(1.01, 0.05, 0.33), 'cloth', [0, 0.1, 0]),
    ...[-0.3, 0.1, 0.35].map((x) => P(cyl(0.012, 0.25, 4), 'rust', [x, 1.0, 0], { r: [0.2, 0, x] })),
    P(decal(0.8, 0.4, 3), 'decal', [0, 0.45, 0.162], { team: false })
  ]));
  const genericBuilding = (size) => B(size, 1.4, [
    P(box(size * 0.8, 1.0, size * 0.8), 'crumble', [0, 0.5, 0]),
    P(box(size * 0.9, 0.05, size * 0.9), 'rust', [0, 1.04, 0], { r: [0.1, 0, 0] }),
    P(box(size * 0.82, 0.08, size * 0.82), 'cloth', [0, 0.9, 0])
  ]);

  // ---- resource nodes (origin = tile centre) ----
  def('node_iron', () => finalize([
    P(cone(0.42, 0.35, 7), 'rust', [0, 0.17, 0]),
    P(box(0.3, 0.12, 0.2), 'rust', [0.15, 0.25, -0.05], { r: [0.5, 0.3, 0.2] }),
    P(cyl(0.05, 0.5, 8), 'steel', [-0.12, 0.18, 0.15], { r: [0.2, 0.7, HALF] }),
    P(box(0.22, 0.04, 0.3), 'steel', [-0.2, 0.3, -0.1], { r: [0.7, 0.2, 0.4] }),
    P(torus(0.1, 0.035, 5, 10), 'rubber', [0.28, 0.04, 0.25], { r: [HALF, 0, 0] })
  ], { top: 0.6, radius: 0.5 }));
  def('node_copper', () => finalize([
    P(cyl(0.22, 0.05, 14), 'wood', [-0.1, 0.22, 0.0], { r: [HALF, 0, 0], s: [1, 1, 1] }),
    P(cyl(0.22, 0.05, 14), 'wood', [-0.1, 0.22, 0.28], { r: [HALF, 0, 0] }),
    P(cyl(0.13, 0.26, 12), 'copper', [-0.1, 0.22, 0.14], { r: [HALF, 0, 0] }),
    ...[0, 1, 2, 3].map((i) => P(cyl(0.03, 0.75, 8), 'copper', [0.18 + i * 0.02, 0.04 + (i % 2) * 0.05, -0.15 + i * 0.07], { r: [0, 0.4 + i * 0.1, HALF] })),
    P(torus(0.12, 0.025, 5, 12), 'copper', [0.2, 0.03, 0.25], { r: [HALF, 0, 0] })
  ], { top: 0.6, radius: 0.5 }));
  def('node_food', () => finalize([
    P(box(0.3, 0.25, 0.3), 'wood', [-0.18, 0.125, -0.12]),
    P(box(0.3, 0.25, 0.3), 'wood', [0.16, 0.125, -0.16], { r: [0, 0.4, 0] }),
    P(box(0.28, 0.22, 0.28), 'wood', [-0.02, 0.36, -0.14], { r: [0, 0.9, 0] }),
    ...[[-0.25, 0.22], [-0.05, 0.28], [0.15, 0.22], [0.3, 0.05], [0.05, 0.1]].map(([x, z]) => P(sph(0.075, 8, 6), 'cabbage', [x, 0.06, z])),
    P(sph(0.13, 8, 6), 'bag', [0.3, 0.1, 0.25], { s: [1, 0.8, 0.8] })
  ], { top: 0.6, radius: 0.5 }));
  def('node_wood', () => finalize([
    P(box(0.6, 0.08, 0.45), 'wood', [0, 0.04, -0.1]),
    P(box(0.6, 0.08, 0.45), 'wood', [0.02, 0.12, -0.1], { r: [0, 0.08, 0] }),
    P(box(0.6, 0.08, 0.45), 'wood', [-0.02, 0.2, -0.1], { r: [0, -0.06, 0] }),
    ...[[-0.15, 0.25], [0.0, 0.3], [0.15, 0.25]].map(([x, z], i) => P(cyl(0.07, 0.7, 8), 'wood', [x, 0.07 + (i === 1 ? 0.1 : 0), z], { r: [0, 0, HALF] })),
    P(box(0.2, 0.08, 0.1), 'brick', [0.3, 0.04, 0.35], { r: [0, 0.5, 0] })
  ], { top: 0.5, radius: 0.5 }));

  const generic = new Map();
  return {
    mats,
    // Model for a unit kind, building kind ('house' switches to the panel block from epoch 3) or node kind
    unit(kind) {
      const m = models.get(kind) || models.get('unit_generic');
      if (!m.built) m.built = m.build();
      return m.built;
    },
    building(kind, epoch = 1, size = 2) {
      const key = kind === 'house' && epoch >= 3 ? 'house_panel' : kind;
      const m = models.get(key);
      if (m && !key.startsWith('node_')) {
        if (!m.built) m.built = m.build();
        return m.built;
      }
      let g = generic.get(size);
      if (!g) { g = genericBuilding(size); generic.set(size, g); }
      return g;
    },
    node(kind) {
      const m = models.get(`node_${kind}`) || models.get('node_iron');
      if (!m.built) m.built = m.build();
      return m.built;
    },
    dispose() {
      for (const g of geos.values()) g.dispose();
      geos.clear();
      for (const o of owned) o.dispose();
      owned.length = 0;
    }
  };
}
