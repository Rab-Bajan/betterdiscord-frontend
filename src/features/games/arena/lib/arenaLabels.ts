// Az aréna felületének közös feliratai és segédfüggvényei.
import type { Faction } from '../types';

export const IS_TOUCH = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

const SIDE_NAMES: Readonly<Record<string, string>> = { players: 'A csapat', survivor: 'Túlélők', infected: 'Fertőzöttek', a: 'A oldal', b: 'B oldal' };
export const REASON_TEXT: Readonly<Record<string, string>> = { abandoned: 'A meccs idő előtt véget ért, jutalom nem jár.', wiped: 'Mindenki elesett.', boss_dead: 'A főellenség legyőzve!', core_destroyed: 'A mag leomlott.', objectives: 'A pontok tartásával.', goal: 'A cél teljesült.' };
export const ITEM_NAMES: Readonly<Record<string, string>> = { boost: 'Turbó', mine: 'Akna', rocket: 'Rakéta' };

export const card = { background: '#151832', border: '1px solid rgba(125, 105, 255, 0.18)' };

/** The display name of a winning side: faction, mode side, or the player who owns it. */
export const sideLabel = (side: string, players: ReadonlyArray<{ side?: string; username: string }>, factions: Readonly<Record<string, Faction>>): string => {
  const faction = factions[side];
  if (faction) return faction.name;
  const name = SIDE_NAMES[side];
  if (name) return name;
  const owner = players.find((p) => p.side === side);
  return owner?.username || side;
};

export const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
