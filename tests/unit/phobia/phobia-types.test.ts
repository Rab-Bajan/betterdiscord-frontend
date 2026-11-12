// Socket payload guards in phobia/types.ts and the journal catalog. Payload fixtures mirror the
// backend producers in betterdiscord/miskolcPhobiaHandler.js (tick players, getPublicSummary,
// player-joined, verdict-result) so a guard that would drop a valid server field fails here.
import { describe, it, expect } from 'vitest';
import {
  parseBreakerUpdate,
  parseBreakerTrippedReason,
  parseItemThrown,
  parseLightId,
  parseLightUpdate,
  parseMatchResult,
  parseObjective,
  parsePhoto,
  parsePlayer,
  parsePlayers,
  parseSettings,
  parseWorldItem,
  toTask
} from '../../../src/features/games/phobia/types.ts';
import { EVIDENCE_TYPES, GHOST_ARCHETYPES } from '../../../src/features/games/phobia/lib/ghostCatalog.ts';

// `phobia:tick` player entry (handler tick loop)
const tickPlayer = {
  id: 'sock_1',
  userId: 'u1',
  username: 'Béla',
  avatarColor: '#7655F5',
  flashlightOn: true,
  isSpeaking: false,
  isInsideTruck: true,
  x: -4,
  y: 0,
  z: -15,
  pitch: 0.1,
  yaw: 3.1,
  sanity: 87,
  crouched: false,
  sprinting: true,
  alive: true,
  hidingSpotId: null,
  activeSlot: 1
};

// getPublicSummary() player entry
const summaryPlayer = {
  id: 'sock_2',
  socketId: 'sock_2',
  userId: 'u2',
  username: 'Géza',
  avatarColor: '#28C997',
  position: [1, 0, 2],
  rotation: [0, 1.5],
  sanity: 100,
  alive: true,
  hidingSpotId: 'mazsahaz_locker_1',
  isSpeaking: true,
  activeSlot: 0,
  inventory: [{ id: 'walkie_1', type: 'walkie_talkie' }, null, null]
};

describe('parsePlayer / parsePlayers', () => {
  it('keeps every field of a tick player', () => {
    expect(parsePlayer(tickPlayer)).toEqual(tickPlayer);
  });

  it('keeps summary players with position / rotation arrays and inventory', () => {
    const p = parsePlayer(summaryPlayer);
    expect(p).toEqual(summaryPlayer);
    expect(p?.inventory).not.toBe(summaryPlayer.inventory);
  });

  it('drops wrong-typed fields but keeps the record', () => {
    expect(parsePlayer({ id: 7, username: 'x', alive: 'yes', sanity: '50', position: [1, 'a'] })).toEqual({
      username: 'x',
      position: [1, Number.NaN]
    });
  });

  it('rejects non-objects', () => {
    expect(parsePlayer(null)).toBeNull();
    expect(parsePlayer('sock_1')).toBeNull();
    expect(parsePlayer([tickPlayer])).toBeNull();
  });

  it('parsePlayers drops non-object entries and returns [] for non-arrays', () => {
    expect(parsePlayers([tickPlayer, null, 3, summaryPlayer]).map((p) => p.id)).toEqual(['sock_1', 'sock_2']);
    expect(parsePlayers({ 0: tickPlayer })).toEqual([]);
    expect(parsePlayers(undefined)).toEqual([]);
  });
});

describe('parseSettings', () => {
  it('keeps the sanitized server settings', () => {
    expect(parseSettings({ evidenceCount: 2, startingSanity: 75 })).toEqual({ evidenceCount: 2, startingSanity: 75 });
  });

  it('drops non-numeric fields and rejects non-objects', () => {
    expect(parseSettings({ evidenceCount: '2', startingSanity: 50, extra: true })).toEqual({ startingSanity: 50 });
    expect(parseSettings(null)).toBeNull();
    expect(parseSettings([2, 75])).toBeNull();
  });
});

describe('toTask / parseObjective', () => {
  it('maps a server objective to the HUD task shape', () => {
    expect(toTask({ id: 'emf_5', textHu: 'Észlelj EMF 5-öt', done: true, rewardFt: 500 })).toEqual({
      id: 'emf_5',
      title: 'Észlelj EMF 5-öt',
      reward: 500,
      completed: true
    });
  });

  it('falls back to title / desc / reward / completed', () => {
    expect(toTask({ id: 'freezing_temp', desc: 'Mérj fagypontot', reward: 750, completed: false })).toEqual({
      id: 'freezing_temp',
      title: 'Mérj fagypontot',
      reward: 750,
      completed: false
    });
  });

  it('tolerates non-objects', () => {
    expect(toTask(null)).toEqual({ id: undefined, title: '', reward: undefined, completed: false });
  });

  it('parseObjective keeps the primary objective text and state', () => {
    expect(parseObjective({ textHu: 'Azonosítsd a szellem típusát', done: false })).toEqual({
      textHu: 'Azonosítsd a szellem típusát',
      done: false
    });
    expect(parseObjective({ title: 'x', completed: true, done: 'no' })).toEqual({ title: 'x', completed: true });
    expect(parseObjective(null)).toBeNull();
  });
});

describe('parsePhoto / parseMatchResult', () => {
  it('keeps the journal fields of phobia:photo-taken', () => {
    const photo = { id: 'p1', subject: 'Szellem', reward: 300, kind: 'ghost', ghostInFrame: true, takenBy: 'Béla' };
    expect(parsePhoto(photo)).toEqual({ id: 'p1', subject: 'Szellem', reward: 300 });
    expect(parsePhoto({ id: 'p2', stars: 3, dataUrl: null })).toEqual({ id: 'p2', stars: 3, dataUrl: null });
    expect(parsePhoto(undefined)).toBeNull();
  });

  it('keeps the verdict fields the UI reads', () => {
    const verdict = {
      correct: true,
      ghostType: 'Bunkó Lajos',
      ghostArchetype: 'The Copper Thief',
      objectiveRewardFt: 0,
      rewardFt: 3000,
      xpGained: 250,
      profile: null,
      matchId: 'm1'
    };
    expect(parseMatchResult(verdict)).toEqual({ correct: true, ghostType: 'Bunkó Lajos', rewardFt: 3000 });
  });

  it('keeps concluded / reason and leaves correct out when absent', () => {
    expect(parseMatchResult({ concluded: true, reason: 'all_players_killed' })).toEqual({
      concluded: true,
      reason: 'all_players_killed'
    });
    expect(parseMatchResult('done')).toBeNull();
  });
});

describe('electrical / item guards', () => {
  it('parseBreakerUpdate keeps breakerOn and string lights', () => {
    expect(parseBreakerUpdate({ breakerOn: false, tripped: true })).toEqual({ breakerOn: false });
    expect(parseBreakerUpdate({ breakerOn: true, activeLights: ['a', 2, 'b'] })).toEqual({ breakerOn: true, activeLights: ['a', 'b'] });
    expect(parseBreakerUpdate({ breakerOn: 'on' })).toBeNull();
    expect(parseBreakerTrippedReason({ reason: 'overload', maxLights: 6 })).toBe('overload');
  });

  it('parseLightUpdate / parseLightId need a light id', () => {
    expect(parseLightUpdate({ lightId: 'light_mazsahaz_office', state: true, activeLights: ['light_mazsahaz_office'] })).toEqual({
      lightId: 'light_mazsahaz_office',
      state: true,
      activeLights: ['light_mazsahaz_office']
    });
    expect(parseLightUpdate({ lightId: '', state: true })).toBeNull();
    expect(parseLightId({ lightId: 'x' })).toBe('x');
    expect(parseLightId({})).toBeNull();
  });

  it('parseItemThrown normalises the three server shapes', () => {
    expect(parseItemThrown({ propId: 'scrap_pipe_1', x: 1, y: 2, z: 3, impulse: [4, 5, 6] })).toEqual({
      itemId: 'scrap_pipe_1',
      position: { x: 1, y: 2, z: 3 },
      velocity: { x: 4, y: 5, z: 6 }
    });
    expect(parseItemThrown({ item: { id: 'emf_1', x: 0, y: 0.1, z: 2 }, impulse: [0, 1, 0] })).toEqual({
      itemId: 'emf_1',
      position: { x: 0, y: 0.1, z: 2 },
      velocity: { x: 0, y: 1, z: 0 }
    });
    expect(parseItemThrown({ itemId: 'scrap_can_1', velocity: { x: 1, y: 0, z: 0 } })).toEqual({
      itemId: 'scrap_can_1',
      position: null,
      velocity: { x: 1, y: 0, z: 0 }
    });
    expect(parseItemThrown({ impulse: [0, 0, 0] })).toBeNull();
  });

  it('parseWorldItem needs an id and a finite position', () => {
    expect(parseWorldItem({ id: 'it1', type: 'emf_reader', x: 1, y: 0, z: 2, rx: 0, ry: 1, rz: 0 })).toEqual({
      id: 'it1',
      type: 'emf_reader',
      x: 1,
      y: 0,
      z: 2,
      rx: 0,
      ry: 1,
      rz: 0
    });
    expect(parseWorldItem({ id: 'it1', x: Number.NaN, y: 0, z: 0 })).toBeNull();
    expect(parseWorldItem({ x: 0, y: 0, z: 0 })).toBeNull();
  });
});

describe('ghost catalog', () => {
  it('has the 7 evidence types and 7 archetypes with 3 known evidences each', () => {
    const evidenceIds = new Set(EVIDENCE_TYPES.map((e) => e.id));
    expect(evidenceIds.size).toBe(7);
    expect(GHOST_ARCHETYPES).toHaveLength(7);
    for (const ghost of GHOST_ARCHETYPES) {
      expect(ghost.evidence).toHaveLength(3);
      for (const ev of ghost.evidence) expect(evidenceIds.has(ev)).toBe(true);
    }
  });

  it('keeps the demon threshold and the Mimic fake orb', () => {
    expect(GHOST_ARCHETYPES.find((g) => g.id === 'raffael_dzsenifer')?.huntThreshold).toBe(70);
    expect(GHOST_ARCHETYPES.find((g) => g.id === 'a_keresztapa')?.deceptiveEvidence).toBe('ghost_orbs');
  });
});
