import React from 'react';
import { classInfo } from '../lib/classifications';
import { formatScore, formatClock, moveLabel } from '../lib/analysisFormat';

// A kijelölt lépés magyarázata. Minden állítás az engine számaiból következik, semmi nincs "kitalálva".
export default function MoveDetail({ move, positions }) {
  if (!move) {
    return (
      <div className="rounded-xl p-3 text-sm" style={{ background: '#151832', color: '#999BBE' }}>
        Kiinduló állás. Lépkedj a nyilakkal (← →) vagy kattints egy lépésre.
      </div>
    );
  }

  const info = classInfo(move.classification);
  const isBestLike = ['best', 'book', 'brilliant', 'great'].includes(move.classification);
  const clock = formatClock(move.clock);
  const mover = move.color === 'white' ? 'fehér' : 'fekete';
  // A lépő szemszögéből mutatjuk a nyerési esélyt
  const before = Math.round(move.winBefore);
  const after = Math.round(move.winAfter);
  const afterPosition = positions[move.ply];

  return (
    <div className="rounded-xl p-3 space-y-2" style={{ background: '#151832', border: `1px solid ${info.color}55` }} aria-live="polite">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center justify-center rounded-full text-xs font-extrabold text-white" style={{ background: info.color, width: 26, height: 26 }} aria-hidden="true">{info.symbol}</span>
        <strong className="text-base" style={{ color: '#F4F3FF' }}>{moveLabel(move)}</strong>
        <span className="text-sm font-semibold" style={{ color: info.color }}>{info.label}</span>
        {clock && <span className="ml-auto text-xs" style={{ color: '#999BBE' }}>⏱ {clock}</span>}
      </div>

      <p className="text-xs" style={{ color: '#999BBE' }}>{info.help}</p>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs" style={{ color: '#999BBE' }}>
        <div>Értékelés (fehér): <strong style={{ color: '#F4F3FF' }}>{formatScore(move.evalBefore)} → {formatScore(move.evalAfter, { terminal: afterPosition?.terminal })}</strong></div>
        <div>{mover[0].toUpperCase() + mover.slice(1)} nyerési esélye: <strong style={{ color: '#F4F3FF' }}>{before}% → {after}%</strong></div>
        <div>CPL: <strong style={{ color: '#F4F3FF' }}>{move.cpl}</strong></div>
        <div>Lépés pontossága: <strong style={{ color: '#F4F3FF' }}>{move.accuracy.toFixed(0)}%</strong></div>
      </div>

      {!isBestLike && move.best.san && (
        <div className="text-sm" style={{ color: '#F4F3FF' }}>
          A Stockfish ezt javasolta: <strong style={{ color: '#96BC4B' }}>{move.best.san}</strong>{' '}
          <span style={{ color: '#999BBE' }}>({formatScore(move.evalBefore)})</span>
          {move.best.line.length > 1 && (
            <div className="text-xs mt-0.5" style={{ color: '#999BBE' }}>Fő vonal: {move.best.line.join(' ')}</div>
          )}
        </div>
      )}

      {move.classification === 'brilliant' && (
        <div className="text-xs" style={{ color: '#1BACA6' }}>Anyagáldozat: a lépés a folytatásban ~{move.sacrifice} egységnyi anyagot ad fel, mégis megmarad az előny.</div>
      )}
      {move.classification === 'great' && move.alternatives[0] && (
        <div className="text-xs" style={{ color: '#5C8BB0' }}>A következő legjobb lehetőség ({move.alternatives[0].san}) érdemben rosszabb: {formatScore(move.alternatives[0].score)}.</div>
      )}

      {move.missedTactic?.type === 'mate' && (
        <div className="text-xs font-semibold" style={{ color: '#E58F2A' }}>
          ⚠ Kihagyott taktika: kényszerített matt volt {move.missedTactic.mateIn} lépésben ({move.best.san}).
        </div>
      )}
      {move.missedTactic?.type === 'material' && (
        <div className="text-xs font-semibold" style={{ color: '#E58F2A' }}>
          ⚠ Kihagyott taktika: a legjobb vonal ~{move.missedTactic.gain} egységnyi anyagot nyert volna ({move.best.san}).
        </div>
      )}
    </div>
  );
}
