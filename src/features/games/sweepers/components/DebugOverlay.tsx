import React from 'react';
import { SWEEPERS_THEME as T } from '../theme';
import type { SweepersDebugStats } from '../lib/engine/SweepersGame';

/** F3 overlay (spec 14). */
export default function DebugOverlay({ stats }: { stats: SweepersDebugStats }) {
  const rows: ReadonlyArray<readonly [string, string]> = [
    ['FPS', String(stats.fps)],
    ['Draw calls', String(stats.drawCalls)],
    ['Törmelék', String(stats.debris)],
    ['Szalagszakaszok', String(stats.conveyors)],
    ['Ping (RTT)', stats.rttMs === null ? '–' : `${Math.round(stats.rttMs)} ms`],
    ['X / Y / Z', `${stats.x.toFixed(2)} / ${stats.y.toFixed(2)} / ${stats.z.toFixed(2)}`]
  ];
  return (
    <div
      className="absolute left-3 top-20 z-30 rounded-lg px-3 py-2 text-[11px] font-mono pointer-events-none"
      style={{ background: 'rgba(9, 10, 24, 0.85)', border: `1px solid ${T.border}`, color: T.text }}
    >
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4">
          <span style={{ color: T.muted }}>{label}</span>
          <span className="tabular-nums">{value}</span>
        </div>
      ))}
    </div>
  );
}
