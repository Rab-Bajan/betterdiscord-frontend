// Model library for the 3D view: every unit, building and resource node, built lazily on first use.
// The geometry itself lives in humans.ts / vehicles.ts / buildings.ts; modelKit.ts merges each model into
// a few instanced batches. A finished model is { parts, joints, top, radius, emitters, size, vehicle }:
//   parts[]  { geo, mat, team, cargo, scaffold, ji }   ji = index of the joint the part rides on, or -1
//   joints[] { parent, p, rest, src, axis, hold, swing, actBase, actAmp, actPh }   posed by scene.js
// Every model exists in two levels of detail (0 = close, 1 = zoomed out) that share materials and, for
// the current models, the skeleton (test_empire_models.mjs checks it), so the renderer can swap them freely.
import { createKit } from './modelKit.ts';
import { defineUnits } from './humans.ts';
import { defineVehicles } from './vehicles.ts';
import { defineBuildings } from './buildings.ts';
import type { Kit, Mats, Model } from './modelKit.ts';
import type { TextureLib } from './textures.ts';

/** Registers a lazily built model under a key. */
export type DefineModel = (key: string, build: () => Model) => void;
/** 0 = close-up detail, 1 = zoomed out */
export type Lod = 0 | 1;

interface Library {
  get(key: string): Model | null;
  /** a model every library defines (the fallbacks) */
  must(key: string): Model;
  generic(size: number): Model;
}

function createLibrary(kit: Kit): Library {
  const models = new Map<string, { build: () => Model; built: Model | null }>();
  const def: DefineModel = (key, build) => { models.set(key, { build, built: null }); };
  defineUnits(kit, def);
  defineVehicles(kit, def);
  const { genericBuilding } = defineBuildings(kit, def);
  const generic = new Map<number, Model>();
  const lib: Library = {
    get(key) {
      const m = models.get(key);
      if (!m) return null;
      if (!m.built) m.built = m.build();
      return m.built;
    },
    must(key) {
      const m = lib.get(key);
      if (!m) throw new Error(`model ${key} is not defined`);
      return m;
    },
    generic(size) {
      let g = generic.get(size);
      if (!g) { g = genericBuilding(size); generic.set(size, g); }
      return g;
    }
  };
  return lib;
}

export interface ModelKit {
  mats: Mats;
  setTime(t: number): void;
  unit(kind: string, lod?: Lod): Model;
  building(kind: string, epoch?: number, size?: number, lod?: Lod): Model;
  projectile(kind: string, lod?: Lod): Model | null;
  node(kind: string, lod?: Lod): Model;
  dispose(): void;
}

export function createModelKit(lib: TextureLib): ModelKit {
  const fine = createKit(lib);
  const coarse = createKit(lib, fine);
  const levels: readonly [Library, Library] = [createLibrary(fine), createLibrary(coarse)];
  // When one level of a model is first used, the other level is built shortly after in a spare moment,
  // so crossing the zoom threshold later does not have to build every visible kind in a single frame.
  const warmed = new Set<string>();
  const queue: Array<() => void> = [];
  let timer: ReturnType<typeof setTimeout> | 0 = 0, disposed = false;
  const drain = () => {
    timer = 0;
    if (disposed) return;
    const job = queue.shift();
    if (job) job();
    if (queue.length) timer = setTimeout(drain, 30);
  };
  const fetch = <T,>(lod: Lod, key: string, build: (l: Lod) => T): T => {
    if (!warmed.has(key)) {
      warmed.add(key);
      queue.push(() => { build(lod === 0 ? 1 : 0); });
      if (!timer) timer = setTimeout(drain, 200);
    }
    return build(lod);
  };

  return {
    mats: fine.mats,
    setTime: fine.setTime,
    unit(kind, lod = 0) {
      return fetch(lod, `u:${kind}`, (l) => levels[l].get(kind) || levels[l].must('unit_generic'));
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
      return fetch(lod, `n:${kind}`, (l) => levels[l].get(`node_${kind}`) || levels[l].must('node_iron'));
    },
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      queue.length = 0;
      coarse.dispose();
      fine.dispose();
    }
  };
}
