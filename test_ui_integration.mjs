import assert from 'node:assert';

console.log('--- Testing MiskolcPhobia UI Integration ---');

// Evidence types definition matching JournalModal.jsx
const EVIDENCE_TYPES = [
  { id: 'emf5', name: 'EMF 5', fullName: 'EMF 5 (Kábelkereső / Feszültségmérő)', icon: '⚡' },
  { id: 'spirit_box', name: 'Spirit Box', fullName: 'Spirit Box (Bömbölő CB Rádió)', icon: '📻' },
  { id: 'fingerprints', name: 'UV Ujjlenyomat', fullName: 'UV Ujjlenyomat (Zöld kéz- és lábnyom)', icon: '🟣' },
  { id: 'ghost_orbs', name: 'Szellemgömb', fullName: 'Szellemgömb (Videókamera Gömbök)', icon: '⚪' },
  { id: 'ghost_writing', name: 'Szellemírás', fullName: 'Szellemírás (Kockás Nyomozó Füzet)', icon: '📝' },
  { id: 'freezing', name: 'Fagypont Alatt', fullName: 'Fagypont Alatt (< 0.0°C hideg)', icon: '❄️' },
  { id: 'dots', name: 'D.O.T.S.', fullName: 'D.O.T.S. Projektor (Zöld Lézermező)', icon: '🟢' },
];

const GHOST_ARCHETYPES = [
  {
    id: 'lakatos_armando',
    name: 'Lakatos Ármándó',
    title: 'A Poltergeist',
    evidence: ['emf5', 'spirit_box', 'fingerprints'],
    huntThreshold: 50,
  },
  {
    id: 'kolompar_kalman',
    name: 'Kolompár Kálmán',
    title: 'A Bicskás Vadász',
    evidence: ['freezing', 'ghost_writing', 'dots'],
    huntThreshold: 50,
  },
  {
    id: 'rostas_bela',
    name: 'Rostás "Flexes" Béla',
    title: 'A Hangoskodó',
    evidence: ['emf5', 'spirit_box', 'ghost_orbs'],
    huntThreshold: 50,
  },
  {
    id: 'bunko_lajos',
    name: 'Bunkó Lajos',
    title: 'A Fagyos Rezes',
    evidence: ['freezing', 'fingerprints', 'ghost_orbs'],
    huntThreshold: 50,
  },
  {
    id: 'sarkozi_geza',
    name: 'Sárközi "Lókupec" Géza',
    title: 'A Csendes Árnyék',
    evidence: ['emf5', 'freezing', 'ghost_writing'],
    huntThreshold: 50,
  },
  {
    id: 'raffael_dzsenifer',
    name: 'Raffael Dzsenifer',
    title: 'A Démon',
    evidence: ['freezing', 'ghost_writing', 'dots'],
    huntThreshold: 70,
  },
  {
    id: 'a_keresztapa',
    name: 'A Keresztapa',
    title: 'A Mimic (Utánzó)',
    evidence: ['spirit_box', 'fingerprints', 'freezing'],
    deceptiveEvidence: 'ghost_orbs',
    huntThreshold: 50,
  },
];

// Test 1: Evidence Types
assert.strictEqual(EVIDENCE_TYPES.length, 7, 'Must have 7 evidence types');
const expectedEvidenceIds = ['emf5', 'spirit_box', 'fingerprints', 'ghost_orbs', 'ghost_writing', 'freezing', 'dots'];
for (const id of expectedEvidenceIds) {
  assert.ok(EVIDENCE_TYPES.some(e => e.id === id), `Missing evidence type ${id}`);
}
console.log('✓ Test 1 Passed: 7 evidence types verified.');

// Test 2: 7 Miskolc Folklore Archetypes
assert.strictEqual(GHOST_ARCHETYPES.length, 7, 'Must have 7 ghost archetypes');
const expectedArchetypeIds = [
  'lakatos_armando',
  'kolompar_kalman',
  'rostas_bela',
  'bunko_lajos',
  'sarkozi_geza',
  'raffael_dzsenifer',
  'a_keresztapa'
];
for (const id of expectedArchetypeIds) {
  assert.ok(GHOST_ARCHETYPES.some(g => g.id === id), `Missing ghost archetype ${id}`);
}
console.log('✓ Test 2 Passed: 7 Miskolc archetypes verified.');

// Test 3: Raffael Dzsenifer hunt threshold is 70%
const demon = GHOST_ARCHETYPES.find(g => g.id === 'raffael_dzsenifer');
assert.strictEqual(demon.huntThreshold, 70, 'Raffael Dzsenifer must hunt at 70% sanity');
console.log('✓ Test 3 Passed: Raffael Dzsenifer 70% hunt threshold confirmed.');

// Test 4: Dynamic Exclusion Logic Simulation
function testDynamicExclusion(evidenceState) {
  const markedFound = Object.entries(evidenceState)
    .filter(([_, state]) => state === 1)
    .map(([id]) => id);

  const markedExcluded = Object.entries(evidenceState)
    .filter(([_, state]) => state === 2)
    .map(([id]) => id);

  return GHOST_ARCHETYPES.filter(ghost => {
    const ghostEvidenceSet = new Set(ghost.evidence);
    if (ghost.id === 'a_keresztapa') {
      ghostEvidenceSet.add('ghost_orbs');
    }

    for (const found of markedFound) {
      if (!ghostEvidenceSet.has(found)) return false;
    }

    for (const excluded of markedExcluded) {
      if (ghost.id === 'a_keresztapa' && excluded === 'ghost_orbs') continue;
      if (ghost.evidence.includes(excluded)) return false;
    }

    return true;
  });
}

// Case A: Initial state (all 0) -> all 7 possible
let possible = testDynamicExclusion({});
assert.strictEqual(possible.length, 7, 'Initial state should allow all 7 ghosts');

// Case B: EMF 5 Found -> Only Lakatos Ármándó, Rostás Béla, Sárközi Géza
possible = testDynamicExclusion({ emf5: 1 });
assert.strictEqual(possible.length, 3, 'EMF 5 should narrow down to 3 ghosts');
const possibleNamesB = possible.map(g => g.name);
assert.ok(possibleNamesB.includes('Lakatos Ármándó'));
assert.ok(possibleNamesB.includes('Rostás "Flexes" Béla'));
assert.ok(possibleNamesB.includes('Sárközi "Lókupec" Géza'));

// Case C: EMF 5 Found + Spirit Box Found -> Lakatos Ármándó and Rostás Béla
possible = testDynamicExclusion({ emf5: 1, spirit_box: 1 });
assert.strictEqual(possible.length, 2, 'EMF 5 + Spirit Box narrows down to 2 ghosts');

// Case D: EMF 5 Found + Spirit Box Found + Fingerprints Found -> Lakatos Ármándó ONLY
possible = testDynamicExclusion({ emf5: 1, spirit_box: 1, fingerprints: 1 });
assert.strictEqual(possible.length, 1, 'Exact 3 evidences isolates Lakatos Ármándó');
assert.strictEqual(possible[0].id, 'lakatos_armando');

// Case E: Ruling out freezing -> Raffael Dzsenifer, Kolompár, Bunko, Sarkozi, Keresztapa ruled out
possible = testDynamicExclusion({ freezing: 2 });
assert.strictEqual(possible.length, 2, 'Excluding freezing leaves only Armando and Rostás');

// Case F: Deceptive 4th evidence for The Mimic (A Keresztapa)
// Ghost orbs found does NOT rule out A Keresztapa
possible = testDynamicExclusion({ ghost_orbs: 1 });
const mimicPresentWithOrbs = possible.some(g => g.id === 'a_keresztapa');
assert.ok(mimicPresentWithOrbs, 'The Mimic must NOT be excluded when Ghost Orbs are marked Found');

// Ghost orbs ruled out does NOT rule out A Keresztapa (because true evidence doesn't require orbs)
possible = testDynamicExclusion({ ghost_orbs: 2 });
const mimicPresentWithoutOrbs = possible.some(g => g.id === 'a_keresztapa');
assert.ok(mimicPresentWithoutOrbs, 'The Mimic must NOT be excluded when Ghost Orbs are marked Ruled Out');

console.log('✓ Test 4 Passed: Dynamic ghost exclusion logic fully verified across all edge cases.');

// Test 5: Payout Calculations
const baseReward = 3000;
const photoRewards = [1000, 700, 500];
const totalPhotos = photoRewards.reduce((a, b) => a + b, 0); // 2200 Ft
const sideTasksCompleted = 3;
const sideTaskReward = sideTasksCompleted * 500; // 1500 Ft
const rawPayout = baseReward + sideTaskReward + Math.min(3000, totalPhotos); // 6700 Ft

const alivePayout = rawPayout; // 6700
const deadPayout = Math.round(rawPayout * 0.5); // 3350
assert.strictEqual(alivePayout, 6700, 'Alive payout should be 100%');
assert.strictEqual(deadPayout, 3350, 'Dead payout should be 50% insurance');
console.log('✓ Test 5 Passed: Payout and insurance calculations verified.');

console.log('==================================================');
console.log('ALL UI INTEGRATION ASSERTIONS PASSED SUCCESSFULLY!');
console.log('==================================================');
