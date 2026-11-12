import React, { useState, useEffect, useCallback } from 'react';
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, RefreshCw, Lightbulb } from 'lucide-react';
import AnalysisBoard from './AnalysisBoard';
import EvalBar from './EvalBar';
import EvalGraph from './EvalGraph';
import MoveList from './MoveList';
import MoveDetail from './MoveDetail';
import SummaryPanel from './SummaryPanel';
import type { LucideIcon } from 'lucide-react';
import type { AnalysisResult, PlayerColor, PlayerInfo } from '../types';

type ReviewTab = 'moves' | 'summary';
const TABS: ReadonlyArray<readonly [ReviewTab, string]> = [['moves', 'Lépések'], ['summary', 'Összegzés']];

const BEST_LIKE = new Set(['best', 'book', 'brilliant', 'great']);

function PlayerStrip({ player, color }: { player: PlayerInfo; color: PlayerColor }) {
  return (
    <div className="flex items-center gap-2 px-1 py-1.5 min-w-0">
      <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ background: color === 'white' ? '#F1F1FA' : '#14142B', border: '1px solid #7C80C2' }} />
      <span className="text-sm font-bold truncate" style={{ color: '#F4F3FF' }}>{player.name}</span>
      {player.rating && <span className="text-xs" style={{ color: '#999BBE' }}>({player.rating})</span>}
    </div>
  );
}

const navButton = 'p-2 rounded-lg transition disabled:opacity-30';

export default function ReviewScreen({ result }: { result: AnalysisResult }) {
  const { moves, positions } = result;
  const last = positions.length - 1;
  const [ply, setPly] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showBest, setShowBest] = useState(false);
  const [tab, setTab] = useState<ReviewTab>('moves');

  const go = useCallback((target: number) => {
    setPly(Math.max(0, Math.min(last, target)));
    setShowBest(false);
  }, [last]);

  // Billentyűzet: ← → Home End (beviteli mezőkben nem)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); go(ply - 1); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); go(ply + 1); }
      else if (event.key === 'Home') { event.preventDefault(); go(0); }
      else if (event.key === 'End') { event.preventDefault(); go(last); }
      else if (event.key.toLowerCase() === 'f') setFlipped((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ply, last, go]);

  const move = (ply > 0 ? moves[ply - 1] : null) ?? null;
  const canShowBest = !!move && !BEST_LIKE.has(move.classification) && !!move.best.uci;
  const bestShown = showBest && canShowBest ? move : null;
  const showingBest = bestShown !== null;
  const current = positions[ply];

  // A "legjobb lépés" nézet a lépés ELŐTTI állást mutatja a javaslat nyilával
  const fen = (bestShown ? positions[ply - 1]?.fen : current?.fen) ?? '';
  const bestMove = bestShown ? { from: bestShown.best.uci.slice(0, 2), to: bestShown.best.uci.slice(2, 4) } : null;
  const lastMove = move && !showingBest ? { from: move.from, to: move.to } : null;
  const score = bestShown ? bestShown.evalBefore : current?.eval;
  const terminal = bestShown ? null : current?.terminal ?? null;

  const top = flipped ? result.players.white : result.players.black;
  const bottom = flipped ? result.players.black : result.players.white;

  return (
    <div className="flex flex-col lg:flex-row gap-4 w-full max-w-6xl mx-auto">
      {/* Bal oldal: tábla + grafikon */}
      {/* Nagy képernyőn a tábla magassága a nézethez igazodik, hogy a grafikon is látsszon görgetés nélkül */}
      <div className="w-full lg:w-[58%] lg:max-w-[max(340px,min(640px,calc(100vh_-_300px)))] flex-shrink-0 space-y-2">
        <PlayerStrip player={top} color={flipped ? 'white' : 'black'} />
        <div className="flex gap-2 items-stretch">
          <EvalBar score={score} terminal={terminal} flipped={flipped} />
          <div className="flex-1 min-w-0">
            <AnalysisBoard
              fen={fen}
              lastMove={lastMove}
              classification={move && !showingBest ? move.classification : null}
              bestMove={bestMove}
              flipped={flipped}
            />
          </div>
        </div>
        <PlayerStrip player={bottom} color={flipped ? 'black' : 'white'} />

        <div className="flex items-center justify-center gap-1" role="toolbar" aria-label="Lépések közti navigáció">
          {([
            [ChevronsLeft, 'Kezdőállás (Home)', () => go(0), ply === 0],
            [ChevronLeft, 'Előző lépés (←)', () => go(ply - 1), ply === 0],
            [ChevronRight, 'Következő lépés (→)', () => go(ply + 1), ply === last],
            [ChevronsRight, 'Utolsó állás (End)', () => go(last), ply === last]
          ] satisfies Array<[LucideIcon, string, () => void, boolean]>).map(([Icon, label, action, disabled]) => (
            <button key={label} type="button" onClick={action} disabled={disabled} title={label} aria-label={label} className={navButton} style={{ background: '#1B2040', color: '#F4F3FF' }}>
              <Icon className="w-5 h-5" />
            </button>
          ))}
          <button type="button" onClick={() => setFlipped((v) => !v)} title="Tábla megfordítása (F)" aria-label="Tábla megfordítása" className={`${navButton} ml-2`} style={{ background: '#1B2040', color: '#F4F3FF' }}>
            <RefreshCw className="w-5 h-5" />
          </button>
          {canShowBest && (
            <button
              type="button"
              onClick={() => setShowBest((v) => !v)}
              className="ml-2 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition"
              style={{ background: showingBest ? '#96BC4B' : '#1B2040', color: showingBest ? '#090A18' : '#F4F3FF' }}
              aria-pressed={showingBest}
            >
              <Lightbulb className="w-4 h-4" /> Legjobb lépés
            </button>
          )}
        </div>

        <EvalGraph positions={positions} moves={moves} currentPly={ply} onSelect={go} />
      </div>

      {/* Jobb oldal: lépések / összegzés + magyarázat */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <MoveDetail move={move} positions={positions} />

        <div className="rounded-xl flex flex-col min-h-0" style={{ background: '#151832', border: '1px solid rgba(125, 105, 255, 0.15)' }}>
          <div className="flex gap-1 p-2" role="tablist" style={{ borderBottom: '1px solid rgba(125, 105, 255, 0.12)' }}>
            {TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                style={{ background: tab === id ? '#7655F5' : 'transparent', color: tab === id ? '#fff' : '#999BBE' }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="p-2 overflow-y-auto" style={{ maxHeight: 'min(46vh, 460px)' }}>
            {tab === 'moves' ? <MoveList moves={moves} currentPly={ply} onSelect={go} /> : <SummaryPanel result={result} />}
          </div>
        </div>
      </div>
    </div>
  );
}
