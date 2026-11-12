import React from 'react';
import { CLASSIFICATION_ORDER, classInfo } from '../lib/classifications';
import { resultLabel } from '../lib/analysisFormat';
import type { AnalysisResult, PlayerColor, PlayerInfo, SideSummary } from '../types';

interface PlayerCardProps {
  side: PlayerColor;
  player: PlayerInfo;
  summary: SideSummary;
  isWinner: boolean;
}

function PlayerCard({ side, player, summary, isWinner }: PlayerCardProps) {
  const dot = side === 'white' ? '#F1F1FA' : '#14142B';
  return (
    <div className="flex-1 min-w-0 rounded-xl p-3 text-center" style={{ background: '#151832', border: `1px solid ${isWinner ? 'rgba(40, 201, 151, 0.5)' : 'rgba(125, 105, 255, 0.15)'}` }}>
      <div className="flex items-center justify-center gap-1.5 text-sm font-bold truncate" style={{ color: '#F4F3FF' }}>
        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: dot, border: '1px solid #7C80C2' }} />
        <span className="truncate">{player.name}</span>
      </div>
      <div className="text-[11px]" style={{ color: '#999BBE' }}>{player.rating ? `${player.rating} pont` : 'ismeretlen értékszám'}</div>
      <div className="mt-2 text-3xl font-black tabular-nums" style={{ color: '#F4F3FF' }}>
        {summary.accuracy == null ? '–' : summary.accuracy.toFixed(1)}
      </div>
      <div className="text-[11px] uppercase tracking-wider" style={{ color: '#999BBE' }}>Pontosság</div>
      <div className="mt-1 text-xs" style={{ color: '#999BBE' }}>
        Átl. CPL: <strong style={{ color: '#F4F3FF' }}>{summary.averageCpl == null ? '–' : Math.round(summary.averageCpl)}</strong>
      </div>
    </div>
  );
}

export default function SummaryPanel({ result }: { result: AnalysisResult }) {
  const { players, summary } = result;
  const rows = CLASSIFICATION_ORDER.filter((id) => (summary.white.counts[id] ?? 0) > 0 || (summary.black.counts[id] ?? 0) > 0);
  const winner = result.result === '1-0' ? 'white' : result.result === '0-1' ? 'black' : null;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <PlayerCard side="white" player={players.white} summary={summary.white} isWinner={winner === 'white'} />
        <PlayerCard side="black" player={players.black} summary={summary.black} isWinner={winner === 'black'} />
      </div>

      <div className="text-xs space-y-0.5" style={{ color: '#999BBE' }}>
        <div><strong style={{ color: '#F4F3FF' }}>{resultLabel(result.result)}</strong>{result.termination ? ` · ${result.termination}` : ''}</div>
        {result.opening && <div>Megnyitás: <strong style={{ color: '#F4F3FF' }}>{result.opening.eco} · {result.opening.name}</strong></div>}
        <div>
          {[result.date, result.time, result.timeControl ? `időkontroll: ${result.timeControl}` : null].filter(Boolean).join(' · ')}
        </div>
        <div>Motor: {result.engine.name}, elért mélység: {result.engine.reachedDepth}{result.engine.movetimeMs ? `, ${result.engine.movetimeMs} ms/állás` : ''}</div>
      </div>

      <table className="w-full text-sm" style={{ color: '#F4F3FF' }}>
        <caption className="sr-only">Lépések besorolás szerint</caption>
        <thead>
          <tr className="text-[11px] uppercase tracking-wider" style={{ color: '#999BBE' }}>
            <th className="text-left font-semibold pb-1">Besorolás</th>
            <th className="font-semibold pb-1 w-12">Fehér</th>
            <th className="font-semibold pb-1 w-12">Fekete</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((id) => {
            const info = classInfo(id);
            return (
              <tr key={id} style={{ borderTop: '1px solid rgba(125, 105, 255, 0.1)' }}>
                <td className="py-1">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-flex items-center justify-center rounded-full text-[9px] font-extrabold text-white" style={{ background: info.color, width: 18, height: 18 }} aria-hidden="true">{info.symbol}</span>
                    {info.label}
                  </span>
                </td>
                <td className="text-center tabular-nums">{summary.white.counts[id]}</td>
                <td className="text-center tabular-nums">{summary.black.counts[id]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
