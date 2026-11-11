import { useState, useRef, useCallback, useEffect } from 'react';

const API = '/api/analysis';
const POLL_MS = 600;

async function request(path, options) {
  let response;
  try {
    response = await fetch(`${API}${path}`, options);
  } catch {
    return { ok: false, error: 'A szerver nem érhető el. Ellenőrizd a kapcsolatot.' };
  }
  try {
    return await response.json();
  } catch {
    return { ok: false, error: 'Váratlan válasz a szervertől.' };
  }
}

const post = (path, body) =>
  request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/**
 * A játszma-elemzés teljes folyamata:
 *   idle -> importing -> imported -> analyzing -> done        (hiba: error / lemondás: imported)
 */
export function useGameAnalysis() {
  const [phase, setPhase] = useState('idle');
  const [imported, setImported] = useState(null); // { pgn, game, source }
  const [progress, setProgress] = useState(null); // { done, total, percent, etaSeconds, queuePosition }
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null); // { message, canPastePgn }
  const jobRef = useRef(null);
  const pollRef = useRef(null);

  const stopPolling = () => {
    clearTimeout(pollRef.current);
    pollRef.current = null;
  };

  useEffect(() => () => stopPolling(), []);

  const importGame = useCallback(async ({ url, pgn }) => {
    stopPolling();
    setError(null);
    setResult(null);
    setPhase('importing');
    const res = await post('/import', pgn ? { pgn } : { url });
    if (!res.ok) {
      setError({ message: res.error || 'Az importálás sikertelen.', canPastePgn: res.canPastePgn !== false });
      setPhase('error');
      return false;
    }
    setImported({ pgn: res.pgn, game: res.game, source: res.source, link: res.link });
    setPhase('imported');
    return true;
  }, []);

  const poll = useCallback(async (jobId) => {
    const res = await request(`/jobs/${jobId}`);
    if (jobRef.current !== jobId) return; // közben új elemzés indult vagy megszakították

    if (!res.ok) {
      setError({ message: res.error || 'Az elemzés állapota nem kérdezhető le.', canPastePgn: false });
      setPhase('error');
      return;
    }
    setProgress({ ...res.progress, queuePosition: res.queuePosition });

    if (res.status === 'done') {
      jobRef.current = null;
      setResult(res.result);
      setPhase('done');
    } else if (res.status === 'error') {
      jobRef.current = null;
      setError({ message: res.error || 'Az elemzés sikertelen.', canPastePgn: false });
      setPhase('error');
    } else if (res.status === 'cancelled') {
      jobRef.current = null;
      setPhase('imported');
    } else {
      pollRef.current = setTimeout(() => poll(jobId), POLL_MS);
    }
  }, []);

  const startAnalysis = useCallback(async (settings) => {
    if (!imported) return;
    stopPolling();
    setError(null);
    setProgress({ done: 0, total: (imported.game?.plies || 0) + 1, percent: 0, etaSeconds: null, queuePosition: null });
    setPhase('analyzing');
    const res = await post('/jobs', { pgn: imported.pgn, ...settings });
    if (!res.ok) {
      setError({ message: res.error || 'Az elemzés indítása sikertelen.', canPastePgn: false });
      setPhase('error');
      return;
    }
    jobRef.current = res.jobId;
    poll(res.jobId);
  }, [imported, poll]);

  const cancel = useCallback(async () => {
    const jobId = jobRef.current;
    stopPolling();
    jobRef.current = null;
    setPhase('imported');
    if (jobId) await request(`/jobs/${jobId}`, { method: 'DELETE' });
  }, []);

  const reset = useCallback(() => {
    const jobId = jobRef.current;
    stopPolling();
    jobRef.current = null;
    if (jobId) request(`/jobs/${jobId}`, { method: 'DELETE' });
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
