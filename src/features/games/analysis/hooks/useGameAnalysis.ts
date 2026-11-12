import { useState, useRef, useCallback, useEffect } from 'react';
import { isRecord, isString } from '../../../../shared/lib/guards';
import { AnalysisApi } from '../lib/AnalysisApi';
import {
  isAnalysisResult, isImportedGameInfo,
  type AnalysisProgressInfo, type AnalysisResult, type AnalysisSettings, type ImportedGame
} from '../types';

const POLL_MS = 600;
const api = new AnalysisApi();

export type AnalysisPhase = 'idle' | 'importing' | 'imported' | 'analyzing' | 'done' | 'error';

export interface AnalysisError {
  message: string;
  canPastePgn: boolean;
}

export interface ImportRequest {
  url?: string;
  pgn?: string;
}

export interface GameAnalysis {
  phase: AnalysisPhase;
  imported: ImportedGame | null;
  progress: AnalysisProgressInfo | null;
  result: AnalysisResult | null;
  error: AnalysisError | null;
  importGame: (request: ImportRequest) => Promise<boolean>;
  startAnalysis: (settings: AnalysisSettings) => Promise<void>;
  cancel: () => Promise<void>;
  reset: () => void;
  backToSettings: () => void;
}

const numberOrNull = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/**
 * A játszma-elemzés teljes folyamata:
 *   idle -> importing -> imported -> analyzing -> done        (hiba: error / lemondás: imported)
 */
export function useGameAnalysis(): GameAnalysis {
  const [phase, setPhase] = useState<AnalysisPhase>('idle');
  const [imported, setImported] = useState<ImportedGame | null>(null);
  const [progress, setProgress] = useState<AnalysisProgressInfo | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<AnalysisError | null>(null);
  const jobRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = null;
  };

  useEffect(() => () => stopPolling(), []);

  const fail = (message: string, canPastePgn = false) => {
    setError({ message, canPastePgn });
    setPhase('error');
  };

  const importGame = useCallback(async ({ url, pgn }: ImportRequest) => {
    stopPolling();
    setError(null);
    setResult(null);
    setPhase('importing');
    const res = await api.post('/import', pgn ? { pgn } : { url });
    const { body } = res;
    if (!res.ok || !isString(body.pgn) || !isImportedGameInfo(body.game)) {
      fail((!res.ok && res.error) || 'Az importálás sikertelen.', body.canPastePgn !== false);
      return false;
    }
    setImported({
      pgn: body.pgn,
      game: body.game,
      source: isString(body.source) ? body.source : undefined,
      link: isString(body.link) ? body.link : undefined
    });
    setPhase('imported');
    return true;
  }, []);

  const poll = useCallback(async (jobId: string) => {
    const res = await api.get(`/jobs/${jobId}`);
    if (jobRef.current !== jobId) return; // közben új elemzés indult vagy megszakították

    if (!res.ok) {
      fail(res.error || 'Az elemzés állapota nem kérdezhető le.');
      return;
    }
    const { body } = res;
    const r = body.progress;
    if (isRecord(r)) {
      setProgress({
        done: numberOrNull(r.done) ?? 0,
        total: numberOrNull(r.total) ?? 0,
        percent: numberOrNull(r.percent) ?? 0,
        etaSeconds: numberOrNull(r.etaSeconds),
        queuePosition: numberOrNull(body.queuePosition)
      });
    }

    if (body.status === 'done') {
      jobRef.current = null;
      if (isAnalysisResult(body.result)) {
        setResult(body.result);
        setPhase('done');
      } else {
        fail('Az elemzés sikertelen.');
      }
    } else if (body.status === 'error') {
      jobRef.current = null;
      fail((isString(body.error) && body.error) || 'Az elemzés sikertelen.');
    } else if (body.status === 'cancelled') {
      jobRef.current = null;
      setPhase('imported');
    } else {
      pollRef.current = setTimeout(() => { void poll(jobId); }, POLL_MS);
    }
  }, []);

  const startAnalysis = useCallback(async (settings: AnalysisSettings) => {
    if (!imported) return;
    stopPolling();
    setError(null);
    setProgress({ done: 0, total: (imported.game.plies || 0) + 1, percent: 0, etaSeconds: null, queuePosition: null });
    setPhase('analyzing');
    const res = await api.post('/jobs', { pgn: imported.pgn, ...settings });
    const jobId = res.body.jobId;
    if (!res.ok || !isString(jobId)) {
      fail((!res.ok && res.error) || 'Az elemzés indítása sikertelen.');
      return;
    }
    jobRef.current = jobId;
    void poll(jobId);
  }, [imported, poll]);

  const cancel = useCallback(async () => {
    const jobId = jobRef.current;
    stopPolling();
    jobRef.current = null;
    setPhase('imported');
    if (jobId) await api.delete(`/jobs/${jobId}`);
  }, []);

  const reset = useCallback(() => {
    const jobId = jobRef.current;
    stopPolling();
    jobRef.current = null;
    if (jobId) void api.delete(`/jobs/${jobId}`);
    setPhase('idle');
    setImported(null);
    setResult(null);
    setProgress(null);
    setError(null);
  }, []);

  // Vissza a beállításokhoz (az importált játszma megmarad)
  const backToSettings = useCallback(() => {
    setResult(null);
    setError(null);
    setPhase(imported ? 'imported' : 'idle');
  }, [imported]);

  return { phase, imported, progress, result, error, importGame, startAnalysis, cancel, reset, backToSettings };
}
