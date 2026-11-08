import React, { useRef, useEffect } from 'react';
import { classInfo } from './classifications';
import { formatClock } from '../../utils/analysisFormat';

function Badge({ id }) {
  const info = classInfo(id);
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-[9px] font-extrabold text-white flex-shrink-0"
      style={{ background: info.color, width: 18, height: 18 }}
      title={info.label}
      aria-hidden="true"
    >
      {info.symbol}
    </span>
  );
}

function MoveCell({ move, active, onSelect }) {
  if (!move) return <div />;
  const info = classInfo(move.classification);
  const clock = formatClock(move.clock);
  return (
    <button
      type="button"
      data-active={active ? 'true' : undefined}
      onClick={() => onSelect(move.ply)}
      title={`${info.label}${clock ? ` · hátralévő idő: ${clock}` : ''}`}
      className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-sm font-semibold text-left transition min-w-0"
      style={{ background: active ? '#7655F5' : 'transparent', color: active ? '#fff' : '#F4F3FF' }}
      onMouseOver={(e) => { if (!active) e.currentTarget.style.background = 'rgba(125, 105, 255, 0.15)'; }}
      onMouseOut={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      <Badge id={move.classification} />
      <span className="truncate">{move.san}</span>
      {/* Szöveges jelölés is van: a besorolás nem csak színnel érthető */}
      <span className="sr-only">{info.label}</span>
    </button>
  );
}

// Lépéslista (egyben az értékelés táblázatos nézete)
export default function MoveList({ moves, currentPly, onSelect }) {
  const containerRef = useRef(null);

  // A kijelölt lépés a listán belül maradjon látható (az oldal görgetése nélkül)
  useEffect(() => {
    const container = containerRef.current;
    const active = container?.querySelector('[data-active="true"]');
    if (!container || !active) return;
    const top = active.offsetTop - container.offsetTop;
    if (top < container.scrollTop || top + active.offsetHeight > container.scrollTop + container.clientHeight) {
      container.scrollTo({ top: top - container.clientHeight / 2, behavior: 'smooth' });
    }
  }, [currentPly]);

  const rows = [];
  for (let i = 0; i < moves.length; i += 2) rows.push([moves[i], moves[i + 1]]);

  return (
    <div ref={containerRef} className="overflow-y-auto relative" role="table" aria-label="Lépéslista" style={{ maxHeight: '100%' }}>
      {rows.map(([white, black], index) => (
        <div key={index} role="row" className="grid items-center" style={{ gridTemplateColumns: '34px 1fr 1fr' }}>
          <span className="text-xs text-right pr-2 tabular-nums" style={{ color: '#999BBE' }} role="cell">{index + 1}.</span>
          <MoveCell move={white} active={white?.ply === currentPly} onSelect={onSelect} />
          <MoveCell move={black} active={black?.ply === currentPly} onSelect={onSelect} />
        </div>
      ))}
    </div>
  );
}
