import { describe, it, expect, vi } from 'vitest';
import { AnalysisApi } from '../../../../src/features/games/analysis/lib/AnalysisApi';
import { isAnalysisResult, isImportedGameInfo } from '../../../../src/features/games/analysis/types';

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)));

describe('AnalysisApi', () => {
  it('posts JSON to /api/analysis and returns the body on ok', async () => {
    const f = vi.fn(() => json({ ok: true, jobId: 'j1' }));
    const reply = await new AnalysisApi(f).post('/jobs', { pgn: 'x' });
    expect(reply).toEqual({ ok: true, body: { ok: true, jobId: 'j1' } });
    expect(f).toHaveBeenCalledWith('/api/analysis/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"pgn":"x"}' });
  });

  it('reports server errors, unreachable servers and bad JSON', async () => {
    expect(await new AnalysisApi(() => json({ ok: false, error: 'Rossz PGN', canPastePgn: false })).get('/x'))
      .toEqual({ ok: false, error: 'Rossz PGN', body: { ok: false, error: 'Rossz PGN', canPastePgn: false } });
    expect((await new AnalysisApi(() => Promise.reject(new TypeError('net'))).get('/x')).ok).toBe(false);
    const bad = await new AnalysisApi(() => Promise.resolve(new Response('<html>'))).get('/x');
    expect(bad).toEqual({ ok: false, error: 'Váratlan válasz a szervertől.', body: {} });
  });
});

describe('analysis payload guards', () => {
  const player = { name: 'A', rating: null };
  it('checks imported games and results', () => {
    expect(isImportedGameInfo({ white: player, black: player, plies: 40 })).toBe(true);
    expect(isImportedGameInfo({ white: player, plies: 40 })).toBe(false);
    const result = { players: { white: player, black: player }, positions: [{ ply: 0 }], moves: [], summary: {}, engine: {} };
    expect(isAnalysisResult(result)).toBe(true);
    expect(isAnalysisResult({ ...result, positions: [] })).toBe(false);
  });
});
