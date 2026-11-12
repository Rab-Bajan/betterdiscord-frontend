import { describe, it, expect } from 'vitest';
import { formatHistory } from '../../../../src/features/games/chess/lib/chessHistory';
import { isChessSession } from '../../../../src/features/games/chess/types';

describe('chess history', () => {
  it('pairs moves into rows and accepts plain SAN strings', () => {
    expect(formatHistory([{ san: 'e4' }, { san: 'e5' }, 'Nf3'])).toEqual([
      { white: 'e4', black: 'e5' },
      { white: 'Nf3', black: null }
    ]);
    expect(formatHistory([])).toEqual([]);
  });
});

describe('isChessSession', () => {
  const base = { active: true, white: { id: 's1', username: 'A' }, black: null, spectators: [], history: [], status: 'playing', inCheck: false, winner: null, lastMove: null };
  it('accepts server sessions and rejects other room sessions', () => {
    expect(isChessSession(base)).toBe(true);
    expect(isChessSession({ ...base, lastMove: { from: 'e2', to: 'e4' } })).toBe(true);
    expect(isChessSession({ active: true, startedBy: 'A' })).toBe(false);
    expect(isChessSession({ ...base, white: { id: 1 } })).toBe(false);
  });
});
