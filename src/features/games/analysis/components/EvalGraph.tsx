import React, { useRef, useState, useEffect, useMemo, type MouseEvent } from 'react';
import { classInfo } from '../lib/classifications';
import { whiteShare, formatScore, moveLabel } from '../lib/analysisFormat';
import type { AnalysisPosition, AnalyzedMove } from '../types';

interface EvalGraphProps {
  positions: AnalysisPosition[];
  moves: AnalyzedMove[];
  currentPly: number;
  onSelect: (ply: number) => void;
}

const HEIGHT = 110;
const PAD_X = 6;
// Csak a fordulópontokat jelöljük a vonalon, hogy ne legyen zsúfolt (a többi a lépéslistában látszik)
const KEY_CLASSES = new Set(['brilliant', 'great', 'mistake', 'blunder', 'missed-win', 'missed-mate']);

// Értékelés-grafikon: a világos terület a fehér előnye, a sötét háttér a feketéé. Egy sorozat, egy tengely.
export default function EvalGraph({ positions, moves, currentPly, onSelect }: EvalGraphProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null); // ply

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => { if (entry) setWidth(Math.max(200, Math.round(entry.contentRect.width))); });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const count = positions.length;
  const plotW = width - PAD_X * 2;
  const x = (ply: number): number => PAD_X + (count <= 1 ? 0 : (ply / (count - 1)) * plotW);
  const y = (position: AnalysisPosition | undefined): number => HEIGHT - whiteShare(position?.eval) * HEIGHT;

  const { linePath, areaPath } = useMemo(() => {
    const pts = positions.map((p, i): [number, number] => [x(i), y(p)]);
    const line = pts.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
    const area = `${line} L${x(count - 1).toFixed(1)},${HEIGHT} L${x(0).toFixed(1)},${HEIGHT} Z`;
    return { linePath: line, areaPath: area };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, width]);

  const plyFromEvent = (event: MouseEvent<SVGSVGElement>): number => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return currentPly;
    const ratio = (event.clientX - rect.left - PAD_X) / plotW;
    return Math.max(0, Math.min(count - 1, Math.round(ratio * (count - 1))));
  };

  const shown = hover ?? currentPly;
  const shownPosition = positions[shown];
  const shownMove = shown > 0 ? moves[shown - 1] : null;

  return (
    <div ref={wrapRef} className="relative w-full" style={{ height: HEIGHT }}>
      <svg
        width={width}
        height={HEIGHT}
        className="block rounded-md cursor-pointer"
        style={{ background: '#1B2040', border: '1px solid rgba(125, 105, 255, 0.2)' }}
        role="img"
        aria-label={`Értékelés-grafikon ${count - 1} lépésen át. A lépéslista ugyanezeket az adatokat táblázatosan mutatja.`}
        onMouseMove={(e) => setHover(plyFromEvent(e))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => onSelect(plyFromEvent(e))}
      >
        <path d={areaPath} fill="#E9E9F7" opacity="0.92" />
        <line x1={PAD_X} x2={width - PAD_X} y1={HEIGHT / 2} y2={HEIGHT / 2} stroke="#7C80C2" strokeWidth="1" strokeDasharray="3 4" opacity="0.7" />
        <path d={linePath} fill="none" stroke="#7655F5" strokeWidth="2" strokeLinejoin="round" />

        {/* Fordulópontok: szín + alak (kör/rombusz), a felirat a tooltipben */}
        {moves.filter((m) => KEY_CLASSES.has(m.classification)).map((m) => {
          const px = x(m.ply);
          const py = y(positions[m.ply]);
          const good = m.classification === 'brilliant' || m.classification === 'great';
          return good ? (
            <circle key={m.ply} cx={px} cy={py} r="4.5" fill={classInfo(m.classification).color} stroke="#1B1C33" strokeWidth="2" />
          ) : (
            <rect key={m.ply} x={px - 4.5} y={py - 4.5} width="9" height="9" transform={`rotate(45 ${px} ${py})`} fill={classInfo(m.classification).color} stroke="#1B1C33" strokeWidth="2" />
          );
        })}

        {/* Aktuális állás és hover keresztvonal */}
        <line x1={x(currentPly)} x2={x(currentPly)} y1="0" y2={HEIGHT} stroke="#F4F3FF" strokeWidth="1.5" opacity="0.9" />
        {hover !== null && hover !== currentPly && (
          <line x1={x(hover)} x2={x(hover)} y1="0" y2={HEIGHT} stroke="#999BBE" strokeWidth="1" strokeDasharray="2 3" />
        )}
        <circle cx={x(shown)} cy={y(shownPosition)} r="4" fill="#fff" stroke="#7655F5" strokeWidth="2" />
      </svg>

      {hover !== null && (
        <div
          className="absolute z-10 pointer-events-none px-2.5 py-1.5 rounded-lg text-[11px] whitespace-nowrap"
          style={{
            top: 4,
            left: Math.min(Math.max(x(hover) + 10, 4), width - 150),
            background: 'rgba(9, 10, 24, 0.95)',
            border: '1px solid rgba(125, 105, 255, 0.3)',
            color: '#F4F3FF'
          }}
        >
          <div className="font-semibold">{shownMove ? moveLabel(shownMove) : 'Kiinduló állás'}</div>
          <div style={{ color: '#999BBE' }}>
            Értékelés: <strong style={{ color: '#F4F3FF' }}>{formatScore(shownPosition?.eval, { terminal: shownPosition?.terminal })}</strong>
            {shownMove && <> · {classInfo(shownMove.classification).label}</>}
          </div>
        </div>
      )}
    </div>
  );
}
