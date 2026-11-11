// node test_empire_models.mjs — builds every MiskolcEmpire 3D model headlessly and checks the contract
// scene.js relies on (instancing-ready parts, a valid skeleton) plus a triangle budget per model.
import assert from 'node:assert';

// the texture library paints two small atlases on a canvas; a no-op 2D context is enough here
const ctx = new Proxy({}, { get: (t, k) => (k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

const { createTextureLib } = await import('./src/components/miskolcEmpire/empire3d/textures.js');
const { createModelKit } = await import('./src/components/miskolcEmpire/empire3d/models.js');

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };

const lib = createTextureLib();
const kit = createModelKit(lib);
const UNITS = ['scavenger', 'builder', 'knife', 'brawler', 'slingshot', 'airgunner', 'grinder', 'elder', 'infiltrator', 'ciganyAsszony', 'civilian', 'horseWagon', 'lada', 'ram'];
const BUILDINGS = ['townCenter', 'scrapYard', 'house', 'tavern', 'barracks', 'workshop', 'tower', 'fence', 'wall'];
const NODES = ['iron', 'copper', 'food', 'wood'];
const SRC = new Set(['legL', 'legR', 'kneeL', 'kneeR', 'armL', 'armR', 'elbowL', 'elbowR', 'wheel', 'disk', 'piston', 'crane', 'search']);

const tris = (m, scaffold = false) => m.parts.filter((p) => p.scaffold === scaffold).reduce((n, p) => n + p.geo.index.count / 3, 0);
function check(name, m, budget) {
  assert.ok(m.parts.length > 0, `${name}: no parts`);
  for (const p of m.parts) {
    assert.ok(p.geo.index, `${name}: part without index`);
    for (const a of ['position', 'normal', 'uv', 'color']) assert.ok(p.geo.attributes[a], `${name}: part without ${a}`);
    assert.ok(p.mat && p.mat.isMaterial, `${name}: part without material`);
    assert.ok(p.ji >= -1 && p.ji < m.joints.length, `${name}: joint index out of range`);
    const pos = p.geo.attributes.position.array;
    for (let i = 0; i < pos.length; i++) assert.ok(Number.isFinite(pos[i]), `${name}: non-finite vertex`);
  }
  m.joints.forEach((j, i) => {
    assert.ok(j.parent < i, `${name}: joint ${i} listed before its parent`);
    assert.ok(j.src === null || SRC.has(j.src), `${name}: unknown animation channel ${j.src}`);
  });
  assert.ok(m.top > 0 && m.radius > 0, `${name}: missing top / radius`);
  const n = tris(m);
  assert.ok(n <= budget, `${name}: ${n} triangles exceeds the budget of ${budget}`);
  return n;
}

const report = [];
const lods = new Map();
test('every unit builds, has a posable skeleton and stays within 12k triangles', () => {
  for (const k of UNITS) {
    const m = kit.unit(k);
    report.push([k, check(k, m, 12000), m.parts.length, m.joints.length]);
    assert.ok(m.joints.length > 0, `${k}: units are animated`);
    // civilians are neutral: nothing on them may take a player's colour
    assert.strictEqual(m.parts.some((p) => p.team), k !== 'civilian', `${k}: wrong use of the owner's colour`);
  }
  assert.strictEqual(kit.unit('no-such-unit'), kit.unit('unit_generic'));
});
test('every building builds with scaffolding and stays within 40k triangles', () => {
  for (const k of BUILDINGS) {
    const m = kit.building(k, 1, 2);
    report.push([k, check(k, m, 40000), m.parts.length, m.joints.length]);
    assert.ok(m.parts.some((p) => p.scaffold), `${k}: no scaffolding for the construction phase`);
    assert.ok(m.parts.some((p) => p.team), `${k}: nothing shows the owner's colour`);
    assert.ok(m.size >= 1);
  }
});
test('the house becomes a panel block from epoch 3 and unknown kinds fall back to a generic building', () => {
  assert.notStrictEqual(kit.building('house', 3, 2), kit.building('house', 1, 2));
  assert.strictEqual(kit.building('house', 4, 2), kit.building('house', 3, 2));
  report.push(['house_panel', check('house_panel', kit.building('house', 3, 2), 40000), kit.building('house', 3, 2).parts.length, 0]);
  const g = kit.building('no-such-building', 1, 3);
  assert.strictEqual(g.size, 3);
  assert.strictEqual(kit.building('another-unknown', 1, 3), g);
  check('generic', g, 40000);
});
test('resource nodes build and unknown kinds fall back to iron', () => {
  for (const k of NODES) report.push([`node_${k}`, check(`node_${k}`, kit.node(k), 9000), kit.node(k).parts.length, 0]);
  assert.strictEqual(kit.node('nope'), kit.node('iron'));
});
test('emitters sit inside the building they belong to', () => {
  for (const k of BUILDINGS) for (const e of kit.building(k, 1, 2).emitters) {
    assert.ok(['smoke', 'fire', 'weld'].includes(e.type));
    assert.ok(Math.abs(e.p[0]) < 1.6 && Math.abs(e.p[2]) < 1.6 && e.p[1] > 0 && e.p[1] < 3.2, `${k}: emitter out of bounds`);
  }
});
test('wheels of one vehicle share a single geometry per material', () => {
  const lada = kit.unit('lada');
  const wheelParts = lada.parts.filter((p) => p.ji >= 0 && lada.joints[p.ji].src === 'wheel');
  assert.strictEqual(new Set(wheelParts.map((p) => p.geo.uuid)).size * 4, wheelParts.length);
});
test('the thrown clog is a small rigid model with a distant version; other projectiles have none', () => {
  const near = kit.projectile('ciganyAsszony'), far = kit.projectile('ciganyAsszony', 1);
  report.push(['clog', check('clog', near, 1500), near.parts.length, 0]);
  check('clog (far)', far, 1500);
  lods.set('clog', tris(far));
  assert.ok(tris(far) < tris(near));
  for (const m of [near, far]) {
    assert.strictEqual(m.joints.length, 0);
    assert.ok(!m.parts.some((p) => p.team || p.ji >= 0));
    assert.ok(m.parts.some((p) => p.mat === kit.mats.wood));
  }
  assert.strictEqual(kit.projectile('slingshot'), null);
});
test('the distant level of detail keeps skeleton, materials and bounds with far fewer triangles', () => {
  const pairs = [...UNITS.map((k) => [k, kit.unit(k), kit.unit(k, 1)]), ...BUILDINGS.map((k) => [k, kit.building(k, 1, 2), kit.building(k, 1, 2, 1)]), ...NODES.map((k) => [k, kit.node(k), kit.node(k, 1)])];
  for (const [k, hi, lo] of pairs) {
    const n = check(`${k} (far)`, lo, 40000);
    lods.set(k, n);
    // rounded figures simplify a lot; buildings are mostly flat boards that were cheap to begin with
    assert.ok(n <= tris(hi) * (UNITS.includes(k) ? 0.5 : 0.8) || n < 400, `${k}: far model has ${n} of ${tris(hi)} triangles`);
    assert.deepStrictEqual(lo.joints.map((j) => [j.src, j.parent]), hi.joints.map((j) => [j.src, j.parent]), `${k}: skeletons differ`);
    assert.deepStrictEqual([lo.top, lo.radius, lo.size, lo.emitters.length], [hi.top, hi.radius, hi.size, hi.emitters.length]);
    const mats = new Set(hi.parts.map((p) => p.mat));
    for (const p of lo.parts) assert.ok(mats.has(p.mat), `${k}: far model uses a material the near one does not`);
  }
});
test('dispose releases every geometry of every built model exactly once', () => {
  const geos = new Set();
  for (const k of UNITS) for (const l of [0, 1]) kit.unit(k, l).parts.forEach((p) => geos.add(p.geo));
  for (const k of BUILDINGS) for (const l of [0, 1]) kit.building(k, 1, 2, l).parts.forEach((p) => geos.add(p.geo));
  for (const l of [0, 1]) kit.projectile('ciganyAsszony', l).parts.forEach((p) => geos.add(p.geo));
  const count = new Map();
  for (const g of geos) g.addEventListener('dispose', () => count.set(g, (count.get(g) || 0) + 1));
  kit.dispose();
  lib.dispose();
  for (const g of geos) assert.strictEqual(count.get(g), 1);
});

if (process.argv.includes('--report')) for (const [k, n, parts, joints] of report) console.log(`${k.padEnd(14)} ${String(n).padStart(6)} tris (far ${String(lods.get(k) ?? '-').padStart(5)})  ${String(parts).padStart(3)} batches  ${joints} joints`);
console.log(`--- ${passed} passed ---`);
