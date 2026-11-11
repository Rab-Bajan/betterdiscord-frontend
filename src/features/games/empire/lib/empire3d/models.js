// Model library for the 3D view: every unit, building and resource node, built lazily on first use.
// The geometry itself lives in humans.js / vehicles.js / buildings.js; modelKit.js merges each model into
// a few instanced batches. A finished model is { parts, joints, top, radius, emitters, size, vehicle }:
//   parts[]  { geo, mat, team, cargo, scaffold, ji }   ji = index of the joint the part rides on, or -1
//   joints[] { parent, p, rest, src, axis, hold, swing, actBase, actAmp, actPh }   posed by scene.js
// Every model exists in two levels of detail (0 = close, 1 = zoomed out) that share materials and, for
// the current models, the skeleton (test_empire_models.mjs checks it), so the renderer can swap them freely.
import { createKit } from './modelKit.js';
import { defineUnits } from './humans.js';
import { defineVehicles } from './vehicles.js';
import { defineBuildings } from './buildings.js';

function createLibrary(kit) {
  const models = new Map();
  const def = (key, build) => { models.set(key, { build, built: null }); };
  defineUnits(kit, def);
  defineVehicles(kit, def);
  const { genericBuilding } = defineBuildings(kit, def);
  const generic = new Map();
  return {
    get(key) {
      const m = models.get(key);
      if (!m) return null;
      if (!m.built) m.built = m.build();
      return m.built;
    },
    generic(size) {
      let g = generic.get(size);
      if (!g) { g = genericBuilding(size); generic.set(size, g); }
      return g;
    }
  };
}

export function createModelKit(lib) {
  const fine = createKit(lib);
  const coarse = createKit(lib, fine);
  const levels = [createLibrary(fine), createLibrary(coarse)];
  // When one level of a model is first used, the other level is built shortly after in a spare moment,
  // so crossing the zoom threshold later does not have to build every visible kind in a single frame.
  const warmed = new Set();
  const queue = [];
  let timer = 0, disposed = false;
  const drain = () => {
    timer = 0;
    if (disposed) return;
    const job = queue.shift();
    if (job) job();
    if (queue.length) timer = setTimeout(drain, 30);
  };
  const fetch = (lod, key, build) => {
    if (!warmed.has(key)) {
      warmed.add(key);
      queue.push(() => build(1 - lod));
      if (!timer) timer = setTimeout(drain, 200);
    }
    return build(lod);
  };

  return {
    mats: fine.mats,
    setTime: fine.setTime,
    unit(kind, lod = 0) {
      return fetch(lod, `u:${kind}`, (l) => levels[l].get(kind) || levels[l].get('unit_generic'));
    },
    // 'house' moves into the panel block from epoch 3
    building(kind, epoch = 1, size = 2, lod = 0) {
      const key = kind === 'house' && epoch >= 3 ? 'house_panel' : kind;
      return fetch(lod, `b:${key}:${size}`, (l) => (key.startsWith('node_') ? null : levels[l].get(key)) || levels[l].generic(size));
    },
    // a thrown object drawn in place of the plain projectile sphere, or null when the kind has none
    projectile(kind, lod = 0) {
      return fetch(lod, `p:${kind}`, (l) => levels[l].get(`proj_${kind}`));
    },
    node(kind, lod = 0) {
      return fetch(lod, `n:${kind}`, (l) => levels[l].get(`node_${kind}`) || levels[l].get('node_iron'));
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      queue.length = 0;
      coarse.dispose();
      fine.dispose();
    }
  };
}
