import React from 'react';
import { whiteShare, formatScore, type Score } from '../lib/analysisFormat';

interface EvalBarProps {
  score: Score | null | undefined;
  terminal?: string | null;
  flipped?: boolean;
}

// Függőleges értékelősáv: a fehér rész alulról nő (ha a tábla meg van fordítva, felülről)
export default function EvalBar({ score, terminal = null, flipped = false }: EvalBarProps) {
  const share = terminal === 'checkmate' ? null : whiteShare(score); // matt végállásnál a nyertes dönt
  const white = share === null ? (score && (score.mate !== undefined ? score.mate > 0 : score.cp > 0) ? 1 : 0.5) : share;
  const label = formatScore(score, { terminal });
  const whiteAhead = white >= 0.5;

  return (
    <div
      className="relative w-7 sm:w-8 rounded-md overflow-hidden flex-shrink-0 self-stretch"
      style={{ background: '#1B2040', border: '1px solid rgba(125, 105, 255, 0.2)' }}
      role="img"
      aria-label={`Értékelés: ${label} (${whiteAhead ? 'fehér' : 'fekete'} előnyben)`}
    >
      <div
        className="absolute left-0 right-0 transition-[height] duration-300"
        style={{ [flipped ? 'top' : 'bottom']: 0, height: `${white * 100}%`, background: '#F1F1FA' }}
      />
      <span
        className="absolute left-0 right-0 text-center text-[10px] sm:text-[11px] font-bold tabular-nums"
        style={{
          [whiteAhead !== flipped ? 'bottom' : 'top']: 4,
          color: whiteAhead ? '#14142B' : '#F1F1FA'
        }}
      >
        {label}
      </span>
    </div>
  );
}
