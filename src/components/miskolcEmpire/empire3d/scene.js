// Three.js world for MiskolcEmpire: renderer setup, RTS camera, terrain, fog of war, instanced
// entities, overlays (rings, HP bars, markers, rally flags, projectiles, placement ghost) and VFX.
// It reads the mutable store every frame and never touches React.
import * as THREE from 'three';
import { cameraEye, rayPlane } from '../empireMath.js';
import { isMine, isAllied, isNeutral, isUnitShown, isTileVisible, isTileExplored, playerColor, playerOf } from '../empireStore.js';
import { createTextureLib, hash2 } from './textures.js';
import { buildTerrain } from './terrain.js';
import { createFog } from './fog.js';
import { createModelKit } from './models.js';
import { createFx } from './fx.js';
import { Batcher } from './batcher.js';

const FOG_COLOR = 0x8b9096;
const SUN_OFFSET = new THREE.Vector3(34, 52, -12);
const CARGO_COLORS = { iron: 0x8f96a8, copper: 0xd2753a, food: 0xd8b04a, wood: 0x8a5a34 };
const RING = { mine: '#28C997', ally: '#5ec8ff', enemy: '#E94B64', neutral: '#b9bcc4', node: '#f5b041' };
const MELEE_SPARK = new Set(['grinder', 'ram', 'knife', 'brawler']);

function makeEnvironment(renderer) {
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(50, 32, 16);
  const pos = geo.attributes.position;
  const cols = [];
  const zen = new THREE.Color(0x8795a8), hor = new THREE.Color(0xd8cfbf), gnd = new THREE.Color(0x3a3229), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 50;
    if (y > 0) c.copy(hor).lerp(zen, Math.pow(y, 0.6)); else c.copy(hor).lerp(gnd, Math.min(1, -y * 4));
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
  scene.add(sky);
  const panel = (w, h, color, k, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); scene.add(m);
  };
  panel(9, 9, 0xfff1d6, 9, 30, 38, -12); // hazy sun
  panel(30, 4, 0xc8ccd2, 1.6, -20, 16, 30); // bright overcast band
  panel(18, 3, 0xb0b6be, 1.3, 10, 12, -40);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.035);
  pmrem.dispose();
  scene.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return rt;
}

export function createEmpireScene(canvas, store) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0085);
  const envRT = makeEnvironment(renderer);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.6;

  const hemi = new THREE.HemisphereLight(0xc4cad2, 0x4a3f33, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe2b8, 2.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 180;
  scene.add(sun);
  scene.add(sun.target);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.3, 500);
  const lib = createTextureLib();
  const kit = createModelKit(lib);
  const entityRoot = new THREE.Group();
  const overlayRoot = new THREE.Group();
  scene.add(entityRoot, overlayRoot);
  const batcher = new Batcher(entityRoot);
  const ob = new Batcher(overlayRoot);
  const fx = createFx(scene, lib, kit.mats.crumble);

  // ---- overlay materials and geometry ----
  const owned = [];
  const basic = (o) => { const m = new THREE.MeshBasicMaterial({ fog: false, ...o }); owned.push(m); return m; };
  const ringGeo = new THREE.RingGeometry(0.84, 1, 40); ringGeo.rotateX(-Math.PI / 2);
  const discGeo = new THREE.CircleGeometry(1, 24); discGeo.rotateX(-Math.PI / 2);
  const planeGeo = new THREE.PlaneGeometry(1, 1);
  const flatGeo = new THREE.PlaneGeometry(1, 1); flatGeo.rotateX(-Math.PI / 2);
  const beamGeo = new THREE.CylinderGeometry(0.06, 0.18, 1, 10, 1, true); beamGeo.translate(0, 0.5, 0);
  const projGeo = new THREE.SphereGeometry(0.06, 8, 6);
  owned.push(ringGeo, discGeo, planeGeo, flatGeo, beamGeo, projGeo);
  const ringMat = basic({ transparent: true, depthWrite: false, opacity: 0.95 });
  const blobMat = basic({ map: lib.blob(), transparent: true, depthWrite: false, color: 0xffffff });
  const barBackMat = basic({ color: 0x0a0b14, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false });
  const barFillMat = basic({ transparent: true, depthTest: false, depthWrite: false });
  const beamMat = basic({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0.55 });
  const projMat = basic({ color: 0xffffff });
  const footMat = basic({ transparent: true, opacity: 0.35, depthWrite: false });
  const ghostOk = basic({ color: 0x40ff9a, transparent: true, opacity: 0.42, depthWrite: false });
  const ghostBad = basic({ color: 0xff4060, transparent: true, opacity: 0.42, depthWrite: false });

  const B = {
    ring: ob.get(ringGeo, ringMat, { castShadow: false, receiveShadow: false, renderOrder: 3 }),
    blob: ob.get(flatGeo, blobMat, { castShadow: false, receiveShadow: false, renderOrder: 1 }),
    barBack: ob.get(planeGeo, barBackMat, { castShadow: false, receiveShadow: false, renderOrder: 10 }),
    barFill: ob.get(planeGeo, barFillMat, { castShadow: false, receiveShadow: false, renderOrder: 11 }),
    beam: ob.get(beamGeo, beamMat, { castShadow: false, receiveShadow: false, renderOrder: 7 }),
    proj: ob.get(projGeo, projMat, { castShadow: false, receiveShadow: false }),
    disc: ob.get(discGeo, footMat, { castShadow: false, receiveShadow: false, renderOrder: 3 })
  };

  // rally path: dotted line segments
  const RALLY_MAX = 400;
  const rallyGeo = new THREE.BufferGeometry();
  const rallyPos = new THREE.BufferAttribute(new Float32Array(RALLY_MAX * 6), 3).setUsage(THREE.DynamicDrawUsage);
  rallyGeo.setAttribute('position', rallyPos);
  const rallyMat = new THREE.LineBasicMaterial({ color: 0x9fb0ff, transparent: true, opacity: 0.8, depthWrite: false, fog: false });
  const rallyLines = new THREE.LineSegments(rallyGeo, rallyMat);
  rallyLines.frustumCulled = false;
  rallyLines.renderOrder = 4;
  overlayRoot.add(rallyLines);
  owned.push(rallyGeo, rallyMat);

  // ---- per-map world ----
  let world = null; // { terrain, fog, ver }
  const flat = (x, y) => 0;
  const heightAt = (x, y) => (world ? world.terrain.heightAt(x, y) : flat(x, y));
  function ensureWorld() {
    if (!store.map.w) return false;
    if (world && world.ver === store.terrainVersion) return true;
    if (world) { world.terrain.dispose(); world.fog.dispose(); }
    const terrain = buildTerrain(store, lib);
    scene.add(terrain.group);
    const fog = createFog(store, terrain.geometry);
    scene.add(fog.mesh);
    world = { terrain, fog, ver: store.terrainVersion };
    unitState.clear();
    emitAcc.clear();
    return true;
  }

  // ---- temporaries ----
  const M = new THREE.Matrix4(), base = new THREE.Matrix4(), base2 = new THREE.Matrix4(), loc = new THREE.Matrix4();
  const Q = new THREE.Quaternion(), QA = new THREE.Quaternion(), QS = new THREE.Quaternion(), QT = new THREE.Quaternion();
  const V = new THREE.Vector3(), V2 = new THREE.Vector3(), S = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);
  const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0);
  const E = new THREE.Euler();
  const col = new THREE.Color();
  const colorCache = new Map();
  const tc = (hex) => { let c = colorCache.get(hex); if (!c) { c = new THREE.Color(hex); colorCache.set(hex, c); } return c; };
  const unitState = new Map();
  const emitAcc = new Map();
  const acc = (key, rate, dt) => { const a = (emitAcc.get(key) || Math.random()) + rate * dt; const n = Math.floor(a); emitAcc.set(key, a - n); return n; };

  const pushParts = (model, baseM, teamC, flash, opts) => {
    for (const part of model.parts) {
      if (part.scaffold) {
        if (!opts.scaffoldM) continue;
      } else if (opts.onlyScaffold) continue;
      if (part.cargo && !opts.cargo) continue;
      let r = 1, g = 1, b = 1;
      if (part.team) { r = teamC.r; g = teamC.g; b = teamC.b; } else if (part.cargo) { r = opts.cargo.r; g = opts.cargo.g; b = opts.cargo.b; }
      const k = flash * (opts.dim ?? 1);
      const bm = part.scaffold ? opts.scaffoldM : baseM;
      if (!part.anim) {
        batcher.push(batcher.get(part.geo, part.mat), bm, r * k, g * k, b * k);
        continue;
      }
      animLocal(part, opts.st, opts.t, opts.phase || 0);
      M.multiplyMatrices(bm, loc);
      batcher.push(batcher.get(part.geo, part.mat), M, r * k, g * k, b * k);
    }
  };

  // local = T(p + Ra*o + slide) * Ra * Rspin * Rq * S
  function animLocal(part, st, t, phase) {
    const a = part.anim;
    let ang = 0, axis = AX, slide = 0;
    switch (a.src) {
      case 'legL': ang = st ? Math.sin(st.walk) * 0.6 * st.mv : 0; break;
      case 'legR': ang = st ? -Math.sin(st.walk) * 0.6 * st.mv : 0; break;
      case 'armL': ang = st ? (st.mv > 0.1 ? -Math.sin(st.walk) * 0.45 * st.mv : st.acting ? -0.35 : 0) : 0; break;
      case 'armR': ang = st ? (st.mv > 0.1 ? Math.sin(st.walk) * 0.45 * st.mv : st.acting ? -0.75 + Math.sin(st.act) * 0.8 : 0) : 0; break;
      case 'wheel': ang = st ? st.wheel : 0; break;
      case 'piston': slide = st && st.acting ? Math.max(0, Math.sin(st.act * 0.7)) * 0.2 : 0; break;
      case 'flag': axis = AY; ang = Math.sin(t * 3 + phase) * 0.35; break;
      case 'crane': axis = AY; ang = t * 0.35 + phase; break;
      case 'search': axis = AY; ang = t * 0.9 + phase; break;
      default:
    }
    QA.setFromAxisAngle(axis, ang);
    if (a.spin === 'disk') { QS.setFromAxisAngle(AX, t * (st && st.acting ? 45 : 5)); QT.multiplyQuaternions(QA, QS).multiply(part.q); } else QT.multiplyQuaternions(QA, part.q);
    V.copy(part.p);
    if (part.o) { V2.copy(part.o).applyQuaternion(QA); V.add(V2); }
    if (slide) V.z += slide;
    loc.compose(V, QT, part.s);
  }

  function relationColor(o) {
    if (isNeutral(o)) return RING.neutral;
    if (isMine(store, o)) return RING.mine;
    if (isAllied(store, o)) return RING.ally;
    return RING.enemy;
  }

  function pushRing(x, y, r, hex, k = 1) {
    const c = tc(hex);
    M.compose(V.set(x, heightAt(x, y) + 0.06, y), Q.identity(), S.set(r, 1, r));
    ob.push(B.ring, M, c.r * k, c.g * k, c.b * k);
  }

  function pushBar(x, y, z, frac, w, hex) {
    // billboard facing the camera; fill anchored to the left edge
    const c = tc(hex);
    const hgt = 0.075;
    M.compose(V.set(x, y, z), camera.quaternion, S.set(w + 0.04, hgt + 0.035, 1));
    ob.push(B.barBack, M, 1, 1, 1);
    V2.set(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(-(1 - frac) * w / 2);
    M.compose(V.set(x, y, z).add(V2), camera.quaternion, S.set(Math.max(0.001, w * frac), hgt, 1));
    ob.push(B.barFill, M, c.r, c.g, c.b);
  }
  const hpColor = (f) => (f > 0.5 ? '#3ad08f' : f > 0.25 ? '#f5b041' : '#E94B64');

  // ---- ghost ----
  const ghosts = new Map();
  const ghostFoot = new THREE.Mesh(flatGeo, footMat.clone());
  owned.push(ghostFoot.material);
  ghostFoot.visible = false;
  ghostFoot.renderOrder = 3;
  scene.add(ghostFoot);
  function ghostFor(kind, epoch, size) {
    const key = `${kind}:${epoch >= 3 ? 3 : 1}:${size}`;
    let g = ghosts.get(key);
    if (g) return g;
    const model = kit.building(kind, epoch, size);
    g = new THREE.Group();
    for (const part of model.parts) {
      if (part.scaffold || part.mat === kit.mats.decal) continue;
      const mesh = new THREE.Mesh(part.geo, ghostOk);
      if (part.anim) { animLocal(part, null, 0, 0); mesh.matrixAutoUpdate = false; mesh.matrix.copy(loc); }
      mesh.renderOrder = 4;
      g.add(mesh);
    }
    g.userData.size = model.size;
    g.visible = false;
    scene.add(g);
    ghosts.set(key, g);
    return g;
  }
  let shownGhost = null;
  function updateGhost(info) {
    if (shownGhost && (!info || shownGhost !== info.group)) { shownGhost.visible = false; shownGhost = null; }
    if (!info) { ghostFoot.visible = false; return; }
    const me = playerOf(store, store.you.idx);
    const g = ghostFor(info.kind, me?.epoch ?? store.res.epoch ?? 1, info.size);
    info.group = g;
    shownGhost = g;
    const cx = info.x + info.size / 2, cy = info.y + info.size / 2;
    const sf = info.size / g.userData.size;
    g.position.set(cx, heightAt(cx, cy), cy);
    g.scale.setScalar(sf);
    const mat = info.ok ? ghostOk : ghostBad;
    for (const m of g.children) m.material = mat;
    g.visible = true;
    ghostFoot.visible = true;
    ghostFoot.position.set(cx, heightAt(cx, cy) + 0.07, cy);
    ghostFoot.scale.set(info.size, 1, info.size);
    ghostFoot.material.color.set(info.ok ? 0x40ff9a : 0xff4060);
  }

  // ---- view helpers for picking (CSS pixel space) ----
  const vp = { w: 1, h: 1 };
  const rc = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const fwd = new THREE.Vector3();
  const view = {
    project(wx, wy, hAbove, out) {
      V.set(wx, heightAt(wx, wy) + hAbove, wy);
      camera.getWorldDirection(fwd);
      const depth = V2.copy(V).sub(camera.position).dot(fwd);
      V.project(camera);
      out.x = (V.x + 1) / 2 * vp.w;
      out.y = (1 - V.y) / 2 * vp.h;
      out.ok = depth > 0.1;
      out.s = vp.h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * Math.max(0.1, depth));
      return out;
    },
    groundAt(sx, sy, h, out) {
      ndc.set(sx / vp.w * 2 - 1, -(sy / vp.h) * 2 + 1);
      rc.setFromCamera(ndc, camera);
      // two refinement steps against the undulating terrain
      let hit = rayPlane(rc.ray.origin, rc.ray.direction, h, out);
      if (!hit) return null;
      for (let i = 0; i < 2; i++) {
        const gh = heightAt(out.x, out.y) + h;
        hit = rayPlane(rc.ray.origin, rc.ray.direction, gh, out);
        if (!hit) return null;
      }
      return out;
    },
    heightAt
  };

  function updateCamera() {
    const cam = store.camera;
    const gh = Math.max(0, heightAt(cam.x, cam.y));
    cameraEye(cam, gh, V);
    camera.position.copy(V);
    camera.lookAt(cam.x, gh, cam.y);
    camera.updateMatrixWorld();
    // sun and its shadow frustum follow the camera target
    const half = Math.max(16, Math.min(70, cam.dist * 1.05));
    const sc = sun.shadow.camera;
    if (sc.right !== half) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.updateProjectionMatrix(); }
    sun.target.position.set(cam.x, 0, cam.y);
    sun.position.copy(sun.target.position).add(SUN_OFFSET);
    sun.target.updateMatrixWorld();
    // ground footprint of the screen for the minimap
    const q = store.viewQuad || (store.viewQuad = new Array(8).fill(0));
    const corners = [[0, 0], [vp.w, 0], [vp.w, vp.h], [0, vp.h]];
    const tmp = { x: 0, y: 0 };
    corners.forEach(([sx, sy], i) => {
      const p = view.groundAt(sx, sy, 0, tmp) || { x: cam.x, y: cam.y };
      // clamp very distant horizon hits so the outline stays readable
      const dx = p.x - cam.x, dy = p.y - cam.y, d = Math.hypot(dx, dy), lim = cam.dist * 3;
      q[i * 2] = d > lim ? cam.x + dx / d * lim : p.x;
      q[i * 2 + 1] = d > lim ? cam.y + dy / d * lim : p.y;
    });
  }

  function emitBuildingFx(b, model, cx, gy, cy, sf, dt) {
    if (b.bp < 100) {
      if (acc(`c${b.i}`, 2.5, dt)) fx.dust(cx + (Math.random() - 0.5) * b.size, gy + 0.05, cy + (Math.random() - 0.5) * b.size, 1, 0.8);
      return;
    }
    for (let k = 0; k < model.emitters.length; k++) {
      const em = model.emitters[k];
      const n = acc(`e${b.i}:${k}`, em.rate, dt);
      if (!n) continue;
      V.set(em.p[0] * sf, em.p[1] * sf, em.p[2] * sf);
      const x = cx + V.x, y = gy + V.y, z = cy + V.z;
      for (let j = 0; j < n; j++) {
        if (em.type === 'smoke') fx.smoke(x, y, z, em.dark, 0.8);
        else if (em.type === 'fire') fx.fire(x, y, z, em.scale || 1);
        else if (em.type === 'weld' && Math.random() < 0.5) { fx.sparks(x, y, z, 10, 0.8); fx.flash(x, y, z, 0.35, 0.7, 0.85, 1); }
      }
    }
    const f = b.hp / (b.mhp || 1);
    if (f < 0.5) {
      const n = acc(`d${b.i}`, f < 0.25 ? 7 : 3.5, dt);
      for (let j = 0; j < n; j++) fx.smoke(cx + (Math.random() - 0.5) * b.size * 0.6, gy + model.top * sf * 0.7, cy + (Math.random() - 0.5) * b.size * 0.6, true, 1.1);
    }
    if (f < 0.25) {
      const n = acc(`f${b.i}`, 14 * b.size, dt);
      for (let j = 0; j < n; j++) fx.fire(cx + (Math.random() - 0.5) * b.size * 0.7, gy + model.top * sf * (0.3 + Math.random() * 0.4), cy + (Math.random() - 0.5) * b.size * 0.7, 1.1);
    }
  }

  const fenceSet = new Set();
  const rallyCount = { n: 0 };
  function pushRally(b) {
    const [rx, ry] = b.ra;
    const tc0 = tc(playerColor(store, b.o));
    const gy = heightAt(rx, ry);
    const pole = kit.mats.steel, cloth = kit.mats.cloth;
    M.compose(V.set(rx, gy + 0.45, ry), Q.identity(), S.set(0.03, 0.9, 0.03));
    batcher.push(batcher.get(B.boxGeo || (B.boxGeo = new THREE.BoxGeometry(1, 1, 1)), pole), M, 1, 1, 1);
    QA.setFromAxisAngle(AY, Math.sin(store.time * 3) * 0.3);
    V2.set(0.17, 0, 0).applyQuaternion(QA);
    M.compose(V.set(rx, gy + 0.78, ry).add(V2), QA, S.set(0.34, 0.2, 0.015));
    batcher.push(batcher.get(B.boxGeo, cloth), M, tc0.r, tc0.g, tc0.b);
    // dotted path from the building centre
    const sx = b.x + b.size / 2, sy = b.y + b.size / 2;
    const len = Math.hypot(rx - sx, ry - sy);
    const steps = Math.min(60, Math.floor(len / 0.5));
    const arr = rallyPos.array;
    for (let i = 0; i < steps && rallyCount.n < RALLY_MAX; i++) {
      const t0 = i / steps, t1 = (i + 0.5) / steps;
      const x0 = sx + (rx - sx) * t0, y0 = sy + (ry - sy) * t0, x1 = sx + (rx - sx) * t1, y1 = sy + (ry - sy) * t1;
      const o = rallyCount.n * 6;
      arr[o] = x0; arr[o + 1] = heightAt(x0, y0) + 0.08; arr[o + 2] = y0;
      arr[o + 3] = x1; arr[o + 4] = heightAt(x1, y1) + 0.08; arr[o + 5] = y1;
      rallyCount.n++;
    }
  }

  // ---------------- frame ----------------
  function frame(dt, info) {
    if (!ensureWorld()) { renderer.render(scene, camera); return; }
    const t = store.time;
    updateCamera();
    world.terrain.update(t);
    world.fog.update(t);
    batcher.begin();
    ob.begin();
    rallyCount.n = 0;
    const sel = store.selection;
    const hover = info.hoverId;

    // ---- units ----
    for (const u of store.units.values()) {
      if (!isUnitShown(store, u)) continue;
      const model = kit.unit(u.k);
      const x = u.x + u.dx, y = u.y + u.dy;
      let st = unitState.get(u.i);
      if (!st) { st = { px: x, py: y, yaw: hash2(u.i, 1, 3) * 6.28, tyaw: 0, wheel: 0, walk: 0, act: 0, mv: 0, spd: 0, acting: false, seen: 0 }; st.tyaw = st.yaw; unitState.set(u.i, st); }
      const mx = x - st.px, my = y - st.py;
      const moved = Math.hypot(mx, my);
      st.px = x; st.py = y;
      st.seen = t;
      st.spd += ((dt > 0 ? moved / dt : 0) - st.spd) * Math.min(1, dt * 10);
      const moving = st.spd > 0.25;
      st.mv += ((moving ? 1 : 0) - st.mv) * Math.min(1, dt * 8);
      if (moved > 0.004) st.tyaw = Math.atan2(mx, my);
      const busy = u.st === 'attack' || u.st === 'gather' || u.st === 'build' || u.st === 'repair' || u.st === 'siphon';
      let target = null;
      if (busy && u.tg != null) {
        const tb = store.buildings.get(u.tg); const tu = !tb && store.units.get(u.tg); const tn = !tb && !tu && store.nodes.get(u.tg);
        if (tb) target = [tb.x + tb.size / 2, tb.y + tb.size / 2, 'b', tb];
        else if (tu) target = [tu.x, tu.y, 'u', tu];
        else if (tn) target = [tn.x + 0.5, tn.y + 0.5, 'n', tn];
      }
      st.acting = busy && !moving && (!target || Math.hypot(target[0] - x, target[1] - y) < (target[2] === 'b' ? target[3].size * 0.75 + 1.6 : 2.2) || u.k === 'slingshot' || u.k === 'airgunner');
      if (st.acting && target) st.tyaw = Math.atan2(target[0] - x, target[1] - y);
      let dy = st.tyaw - st.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      st.yaw += dy * Math.min(1, dt * 10);
      st.wheel += moved / 0.11;
      st.walk += moved * 10;
      if (st.acting) st.act += dt * 9;
      const gy = heightAt(x, y);
      const bob = model.vehicle ? 0 : Math.abs(Math.sin(st.walk)) * 0.025 * st.mv;
      Q.setFromAxisAngle(AY, st.yaw);
      base.compose(V.set(x, gy + bob, y), Q, ONE);
      const teamC = tc(playerColor(store, u.o));
      const flash = u.flash > t ? 2.4 : 1;
      const cargo = u.c > 0 ? tc(CARGO_COLORS[u.ct] ?? 0x999999) : null;
      pushParts(model, base, teamC, flash, { st, t, cargo });
      // contact shadow
      M.compose(V.set(x, gy + 0.02, y), Q.identity(), S.set(model.radius * 1.6, 1, model.radius * (model.vehicle ? 2.2 : 1.6)));
      ob.push(B.blob, M, 1, 1, 1);

      // VFX
      if (model.vehicle && st.spd > 1.2) {
        const n = acc(`v${u.i}`, 16, dt);
        for (let j = 0; j < n; j++) fx.dust(x - Math.sin(st.yaw) * 0.45, gy, y - Math.cos(st.yaw) * 0.45, 1, 1.3);
      } else if (moving) {
        const n = acc(`w${u.i}`, 2.2, dt);
        for (let j = 0; j < n; j++) fx.dust(x, gy, y, 1, 0.55);
      }
      if (st.acting) {
        const fxX = x + Math.sin(st.yaw) * 0.32, fxZ = y + Math.cos(st.yaw) * 0.32;
        if (u.k === 'grinder' && u.st === 'attack') {
          const n = acc(`g${u.i}`, 30, dt);
          if (n) fx.sparks(fxX, gy + 0.35, fxZ, n * 2, 1.2, [Math.sin(st.yaw + 1.6) * 2, 0, Math.cos(st.yaw + 1.6) * 2]);
        } else if (u.st === 'gather' && target && target[2] === 'n') {
          const nk = target[3].k;
          if (nk === 'iron' || nk === 'copper') { const n = acc(`s${u.i}`, 5, dt); if (n) fx.sparks(fxX, gy + 0.2, fxZ, 5, 0.7); }
          else { const n = acc(`s${u.i}`, 1.5, dt); if (n) fx.dust(fxX, gy, fxZ, 1, 0.6, nk === 'wood' ? 0.5 : 0.45, 0.42, 0.3); }
        } else if (u.st === 'build' || u.st === 'repair') {
          const n = acc(`s${u.i}`, 2.2, dt);
          if (n) { fx.dust(fxX, gy, fxZ, 1, 0.6); if (Math.random() < 0.5) fx.sparks(fxX, gy + 0.3, fxZ, 3, 0.5); }
        } else if (u.st === 'attack' && MELEE_SPARK.has(u.k)) {
          const n = acc(`s${u.i}`, 1.4, dt);
          if (n) fx.sparks(fxX, gy + 0.4, fxZ, 4, 0.7);
        }
      }
      // selection / hover / hp
      const selected = sel.has(u.i);
      if (selected) pushRing(x, y, model.radius * 1.15, relationColor(u.o));
      else if (hover === u.i) pushRing(x, y, model.radius * 1.15, '#ffffff', 0.55);
      if (selected || hover === u.i || u.hp < u.mhp - 0.5) {
        const f = Math.max(0, Math.min(1, u.hp / (u.mhp || 1)));
        pushBar(x, gy + model.top + 0.18, y, f, model.vehicle ? 0.8 : 0.6, hpColor(f));
      }
    }
    // forget animation state of units that vanished
    if (unitState.size > store.units.size + 64) for (const [id, s] of unitState) if (t - s.seen > 2) unitState.delete(id);

    // ---- buildings ----
    fenceSet.clear();
    for (const b of store.buildings.values()) if (b.k === 'fence' || b.k === 'wall') fenceSet.add(b.x * 4096 + b.y);
    for (const b of store.buildings.values()) {
      const owner = playerOf(store, b.o);
      const model = kit.building(b.k, owner?.epoch ?? 1, b.size);
      const sf = b.size / model.size;
      const cx = b.x + b.size / 2, cy = b.y + b.size / 2;
      const gy = heightAt(cx, cy) - 0.02;
      const p = Math.max(0, Math.min(1, b.bp / 100));
      let yaw = 0;
      if (b.size === 1 && (b.k === 'fence' || b.k === 'wall')) {
        const alongY = fenceSet.has(b.x * 4096 + b.y - 1) || fenceSet.has(b.x * 4096 + b.y + 1);
        const alongX = fenceSet.has((b.x - 1) * 4096 + b.y) || fenceSet.has((b.x + 1) * 4096 + b.y);
        if (alongY && !alongX) yaw = Math.PI / 2;
      }
      Q.setFromAxisAngle(AY, yaw);
      const rise = p < 1 ? 0.12 + 0.88 * p : 1;
      base.compose(V.set(cx, gy, cy), Q, S.set(sf, sf * rise, sf));
      if (p < 1) base2.compose(V.set(cx, gy, cy), Q, S.set(sf, sf, sf));
      const teamC = tc(playerColor(store, b.o));
      const flash = b.flash > t ? 1.8 : 1;
      pushParts(model, base, teamC, flash, { st: null, t, phase: b.i * 1.7, scaffoldM: p < 1 ? base2 : null });
      emitBuildingFx(b, model, cx, gy, cy, sf, dt);
      const selected = sel.has(b.i);
      if (selected) pushRing(cx, cy, model.radius * sf * 1.05, relationColor(b.o));
      else if (hover === b.i) pushRing(cx, cy, model.radius * sf * 1.05, '#ffffff', 0.5);
      if (p < 1) pushBar(cx, gy + model.top * sf * rise + 0.35, cy, p, Math.min(1.6, 0.5 + b.size * 0.35), '#536CFF');
      else if (selected || hover === b.i || b.hp < b.mhp - 0.5) {
        const f = Math.max(0, Math.min(1, b.hp / (b.mhp || 1)));
        pushBar(cx, gy + model.top * sf + 0.3, cy, f, Math.min(1.6, 0.5 + b.size * 0.35), hpColor(f));
      }
      if (selected && isMine(store, b.o) && Array.isArray(b.ra)) pushRally(b);
    }

    // ---- collapsing buildings (demolished or destroyed) ----
    for (const c of store.collapses) {
      const model = kit.building(c.k, c.epoch, c.size);
      const sf = c.size / model.size;
      const cx = c.x + c.size / 2, cy = c.y + c.size / 2;
      const gy = heightAt(cx, cy) - 0.02;
      const tt = Math.max(0, Math.min(1, (t - c.t0) / c.dur));
      if (!c.fxDone) { c.fxDone = true; fx.collapse(cx, gy, cy, c.size); }
      if (tt < 0.75) { const n = acc(`k${c.i}`, 18 * c.size, dt); for (let j = 0; j < n; j++) fx.dust(cx + (Math.random() - 0.5) * c.size, gy + Math.random() * 0.5, cy + (Math.random() - 0.5) * c.size, 1, c.size * 0.9); }
      const e = tt * tt;
      Q.setFromEuler(E.set(e * 0.45 * (c.i % 2 ? 1 : -1), 0, e * 0.28 * (c.i % 3 ? 1 : -1)));
      const rise = Math.max(0.12, c.bp / 100);
      base.compose(V.set(cx, gy - e * model.top * sf * 0.95, cy), Q, S.set(sf * (1 + e * 0.12), sf * rise * (1 - e * 0.35), sf * (1 + e * 0.12)));
      pushParts(model, base, tc(playerColor(store, c.o)), 1, { st: null, t, dim: 1 - e * 0.55 });
    }

    // ---- resource nodes ----
    for (const n of store.nodes.values()) {
      if (n.a <= 0 || !isTileExplored(store, n.x, n.y)) continue;
      const model = kit.node(n.k);
      const s = 0.5 + 0.5 * Math.max(0, Math.min(1, n.a / (n.max || n.a || 1)));
      const x = n.x + 0.5, y = n.y + 0.5;
      Q.setFromAxisAngle(AY, hash2(n.i, 7, 1) * 6.283);
      base.compose(V.set(x, heightAt(x, y), y), Q, S.set(s, s, s));
      pushParts(model, base, tc('#ffffff'), 1, { st: null, t, dim: isTileVisible(store, n.x, n.y) ? 1 : 0.45 });
      if (sel.has(n.i)) pushRing(x, y, 0.65, RING.node);
      else if (hover === n.i) pushRing(x, y, 0.65, '#ffffff', 0.5);
    }

    // ---- projectiles ----
    for (const pr of store.projectiles) {
      const tt = Math.max(0, Math.min(1, (t - pr.t0) / pr.dur));
      const fromTower = pr.k === 'tower';
      const h0 = fromTower ? 2.3 : 0.5, h1 = 0.45;
      const arc = pr.k === 'slingshot' ? 0.9 : pr.k === 'airgunner' ? 0.15 : 0.35;
      const x = pr.x + (pr.tx - pr.x) * tt, y = pr.y + (pr.ty - pr.y) * tt;
      const z = heightAt(x, y) + h0 + (h1 - h0) * tt + 4 * tt * (1 - tt) * arc;
      const hot = pr.k !== 'slingshot';
      col.set(hot ? 0xffd27a : 0x8a8478);
      const k = hot ? 3 : 1;
      M.compose(V.set(x, z, y), Q.identity(), S.setScalar(pr.k === 'slingshot' ? 1.1 : 0.8));
      ob.push(B.proj, M, col.r * k, col.g * k, col.b * k);
      if (hot && Math.random() < 0.6) fx.glow.spawn(x, z, y, 0, 0, 0, 0.18, 0.08, 0.01, 1, 0.75, 0.35, 0.8);
      if (tt >= 1 && !pr.hitDone) { pr.hitDone = true; fx.flash(x, z, y, 0.4); fx.sparks(x, z, y, 5, 0.6); }
    }

    // ---- one-shot store fx ----
    for (const f of store.fx) {
      if (f.done) continue;
      f.done = true;
      const gy = heightAt(f.x, f.y);
      if (f.kind === 'hit') { fx.flash(f.x, gy + 0.45, f.y, 0.45, 1, 0.55, 0.35); fx.sparks(f.x, gy + 0.45, f.y, 6, 0.8); }
      else if (f.kind === 'unit') fx.puff(f.x, gy, f.y, 1);
      else fx.puff(f.x, gy, f.y, 1.6);
    }

    // ---- markers and pings ----
    for (const mk of store.moveMarks) {
      const k = (t - mk.t0) / 0.8;
      pushRing(mk.x, mk.y, 0.55 * (1 - k * 0.6), mk.color || RING.mine, 1 - k);
    }
    for (const pg of store.pings) {
      const life = pg.kind === 'alert' ? 3 : 2.5;
      const k = (t - pg.t0) / life;
      const hex = pg.kind === 'alert' ? '#E94B64' : pg.o !== undefined ? playerColor(store, pg.o) : '#536CFF';
      for (let r = 0; r < 2; r++) pushRing(pg.x, pg.y, 0.6 + ((k * 2 + r * 0.5) % 1) * 2.4, hex, 1 - k);
      const c = tc(hex);
      M.compose(V.set(pg.x, heightAt(pg.x, pg.y), pg.y), Q.identity(), S.set(1, 6 * (1 - k * 0.5), 1));
      ob.push(B.beam, M, c.r * (1 - k), c.g * (1 - k), c.b * (1 - k));
    }

    updateGhost(info.ghost);
    batcher.end();
    ob.end();
    rallyGeo.setDrawRange(0, rallyCount.n * 2);
    rallyPos.needsUpdate = true;
    fx.update(dt, renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)), heightAt);
    renderer.render(scene, camera);
  }

  return {
    view,
    camera,
    renderer,
    frame,
    resize(w, h) {
      vp.w = Math.max(1, w); vp.h = Math.max(1, h);
      renderer.setSize(vp.w, vp.h, false);
      camera.aspect = vp.w / vp.h;
      camera.updateProjectionMatrix();
    },
    dispose() {
      if (world) { world.terrain.dispose(); world.fog.dispose(); world = null; }
      for (const g of ghosts.values()) g.removeFromParent();
      ghosts.clear();
      ghostFoot.removeFromParent();
      batcher.dispose();
      ob.dispose();
      fx.dispose();
      if (B.boxGeo) B.boxGeo.dispose();
      rallyLines.removeFromParent();
      for (const o of owned) o.dispose();
      kit.dispose();
      lib.dispose();
      envRT.dispose();
      sun.shadow.map?.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
    }
  };
}
