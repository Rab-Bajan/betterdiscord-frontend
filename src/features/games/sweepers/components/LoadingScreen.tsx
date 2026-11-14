import React from 'react';
import { SWEEPERS_THEME as T } from '../theme';

const ROWS = [
  { line: '1', stop: 'Tiszai pályaudvar', time: '05:12' },
  { line: '2', stop: 'Újgyőri főtér', time: '05:20' },
  { line: '34', stop: 'Avas, kilátó', time: '05:27' },
  { line: '10', stop: 'Vasgyár, Diósgyőri Gimnázium', time: '05:35' }
] as const;

interface LoadingScreenProps {
  error?: string | null;
  onRetry?: (() => void) | undefined;
  retryLabel?: string;
}

/** "MVK Zrt. Járatbetöltés...": the world initialises behind a Miskolc bus timetable board. */
export default function LoadingScreen({ error, onRetry, retryLabel = 'Újra' }: LoadingScreenProps) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-4" style={{ background: T.bg0, fontFamily: T.font }}>
      <div className="w-full max-w-md rounded-xl overflow-hidden shadow-2xl" style={{ background: T.bg1, border: `1px solid ${T.border}` }}>
        <div className="flex items-center gap-3 px-4 py-3" style={{ background: T.bg3, borderBottom: `3px solid ${T.blue}` }}>
          <span className="px-2 py-1 rounded font-black text-sm tracking-wider" style={{ background: T.blue, color: '#fff' }}>MVK</span>
          <div className="min-w-0">
            <div className="font-bold text-sm" style={{ color: T.text }}>Menetrend · Központi MÉH Telep</div>
            <div className="text-[11px]" style={{ color: T.muted }}>Érvényes: munkanapokon, takarítási időszakban</div>
          </div>
        </div>
        <table className="w-full text-sm" style={{ color: T.text }}>
          <thead>
            <tr className="text-[11px] uppercase" style={{ color: T.muted }}>
              <th className="text-left px-4 py-2 font-semibold">Járat</th>
              <th className="text-left px-2 py-2 font-semibold">Célállomás</th>
              <th className="text-right px-4 py-2 font-semibold">Indul</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, i) => (
              <tr key={row.line} style={{ background: i % 2 === 0 ? T.bg2 : 'transparent' }}>
                <td className="px-4 py-1.5">
                  <span className="inline-block min-w-[2rem] text-center rounded font-bold text-xs py-0.5" style={{ background: T.violet, color: '#fff' }}>{row.line}</span>
                </td>
                <td className="px-2 py-1.5 truncate">{row.stop}</td>
                <td className="px-4 py-1.5 text-right font-mono tabular-nums" style={{ color: T.green }}>{row.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-4 flex items-center justify-between gap-3" style={{ borderTop: `1px solid ${T.border}` }}>
          {error ? (
            <>
              <span className="text-sm font-semibold" style={{ color: T.red }}>{error}</span>
              {onRetry && (
                <button type="button" onClick={onRetry} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: T.violet, color: '#fff' }}>
                  {retryLabel}
                </button>
              )}
            </>
          ) : (
            <>
              <span className="font-bold tracking-wide" style={{ color: T.text }}>MVK Zrt. Járatbetöltés...</span>
              <span className="flex gap-1" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="w-2 h-2 rounded-full animate-pulse" style={{ background: T.green, animationDelay: `${i * 0.2}s` }} />
                ))}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
