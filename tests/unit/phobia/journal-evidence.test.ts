// Port of tests/legacy/ui-integration.legacy.mjs.
// NOTE: like the legacy script, this exercises a self-contained copy of the journal data and
// exclusion logic (mirroring JournalModal.jsx), not an import from src/. It guards the game-design
// contract (7 evidence types, 7 archetypes, 70% demon threshold, Mimic exclusion rules, payouts).
//
// legacy test                                  -> it()
// Test 1 evidence types (1 + 7 checks)          -> has 7 evidence types
// Test 2 archetypes (1 + 7 checks)              -> has 7 Miskolc folklore archetypes
// Test 3 demon hunt threshold                   -> Raffael Dzsenifer hunts at 70% sanity
// Test 4 dynamic exclusion (cases A-F, 11 checks) -> dynamic exclusion logic
// Test 5 payouts (2 checks)                     -> payout and insurance calculations
import { describe, it, expect } from 'vitest';

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

function testDynamicExclusion(evidenceState: Record<string, number>) {
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

describe('MiskolcPhobia journal evidence and payout rules', () => {
  it('has 7 evidence types', () => {
    expect(EVIDENCE_TYPES.length, 'Must have 7 evidence types').toBe(7);
    const expectedEvidenceIds = ['emf5', 'spirit_box', 'fingerprints', 'ghost_orbs', 'ghost_writing', 'freezing', 'dots'];
    for (const id of expectedEvidenceIds) {
      expect(EVIDENCE_TYPES.some(e => e.id === id), `Missing evidence type ${id}`).toBeTruthy();
    }
  });

  it('has 7 Miskolc folklore archetypes', () => {
    expect(GHOST_ARCHETYPES.length, 'Must have 7 ghost archetypes').toBe(7);
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
      expect(GHOST_ARCHETYPES.some(g => g.id === id), `Missing ghost archetype ${id}`).toBeTruthy();
    }
  });

  it('Raffael Dzsenifer hunts at 70% sanity', () => {
    const demon = GHOST_ARCHETYPES.find(g => g.id === 'raffael_dzsenifer');
    expect(demon?.huntThreshold, 'Raffael Dzsenifer must hunt at 70% sanity').toBe(70);
  });

  it('dynamic exclusion logic', () => {
    // Case A: Initial state (all 0) -> all 7 possible
    let possible = testDynamicExclusion({});
    expect(possible.length, 'Initial state should allow all 7 ghosts').toBe(7);

    // Case B: EMF 5 Found -> Only Lakatos Ármándó, Rostás Béla, Sárközi Géza
    possible = testDynamicExclusion({ emf5: 1 });
    expect(possible.length, 'EMF 5 should narrow down to 3 ghosts').toBe(3);
    const possibleNamesB = possible.map(g => g.name);
    expect(possibleNamesB.includes('Lakatos Ármándó')).toBeTruthy();
    expect(possibleNamesB.includes('Rostás "Flexes" Béla')).toBeTruthy();
    expect(possibleNamesB.includes('Sárközi "Lókupec" Géza')).toBeTruthy();

    // Case C: EMF 5 Found + Spirit Box Found -> Lakatos Ármándó and Rostás Béla
    possible = testDynamicExclusion({ emf5: 1, spirit_box: 1 });
    expect(possible.length, 'EMF 5 + Spirit Box narrows down to 2 ghosts').toBe(2);

    // Case D: EMF 5 Found + Spirit Box Found + Fingerprints Found -> Lakatos Ármándó ONLY
    possible = testDynamicExclusion({ emf5: 1, spirit_box: 1, fingerprints: 1 });
    expect(possible.length, 'Exact 3 evidences isolates Lakatos Ármándó').toBe(1);
    expect(possible[0]?.id).toBe('lakatos_armando');

    // Case E: Ruling out freezing -> Raffael Dzsenifer, Kolompár, Bunko, Sarkozi, Keresztapa ruled out
    possible = testDynamicExclusion({ freezing: 2 });
    expect(possible.length, 'Excluding freezing leaves only Armando and Rostás').toBe(2);

    // Case F: Deceptive 4th evidence for The Mimic (A Keresztapa)
    // Ghost orbs found does NOT rule out A Keresztapa
    possible = testDynamicExclusion({ ghost_orbs: 1 });
    const mimicPresentWithOrbs = possible.some(g => g.id === 'a_keresztapa');
    expect(mimicPresentWithOrbs, 'The Mimic must NOT be excluded when Ghost Orbs are marked Found').toBeTruthy();

    // Ghost orbs ruled out does NOT rule out A Keresztapa (because true evidence doesn't require orbs)
    possible = testDynamicExclusion({ ghost_orbs: 2 });
    const mimicPresentWithoutOrbs = possible.some(g => g.id === 'a_keresztapa');
    expect(mimicPresentWithoutOrbs, 'The Mimic must NOT be excluded when Ghost Orbs are marked Ruled Out').toBeTruthy();
  });

  it('payout and insurance calculations', () => {
    const baseReward = 3000;
    const photoRewards = [1000, 700, 500];
    const totalPhotos = photoRewards.reduce((a, b) => a + b, 0); // 2200 Ft
    const sideTasksCompleted = 3;
    const sideTaskReward = sideTasksCompleted * 500; // 1500 Ft
    const rawPayout = baseReward + sideTaskReward + Math.min(3000, totalPhotos); // 6700 Ft

    const alivePayout = rawPayout; // 6700
    const deadPayout = Math.round(rawPayout * 0.5); // 3350
    expect(alivePayout, 'Alive payout should be 100%').toBe(6700);
    expect(deadPayout, 'Dead payout should be 50% insurance').toBe(3350);
  });
});
