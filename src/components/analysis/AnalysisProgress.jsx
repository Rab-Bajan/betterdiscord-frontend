import React from 'react';
import { Loader2, X } from 'lucide-react';

export default function AnalysisProgress({ progress, game, onCancel }) {
  const queued = progress?.queuePosition > 0;
  const percent = progress?.percent ?? 0;

  return (
    <div className="max-w-xl w-full mx-auto rounded-2xl p-5 space-y-3" style={{ background: '#151832', border: '1px solid rgba(125, 105, 255, 0.15)' }} role="status" aria-live="polite">
      <div className="flex items-center gap-2">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#7655F5' }} />
        <strong style={{ color: '#F4F3FF' }}>{queued ? 'Várakozás a sorban…' : 'Elemzés folyamatban…'}</strong>
      </div>
      {game && <div className="text-xs" style={{ color: '#999BBE' }}>{game.white.name} vs {game.black.name}</div>}

      <div
        className="h-3 rounded-full overflow-hidden"
        style={{ background: '#0d0f24' }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Elemzés haladása"
      >
        <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${percent}%`, background: 'linear-gradient(90deg, #7655F5, #536CFF)' }} />
      </div>

      <div className="flex items-center justify-between text-xs" style={{ color: '#999BBE' }}>
        <span>
          {queued
            ? `${progress.queuePosition}. a sorban`
            : `${progress?.done ?? 0} / ${progress?.total ?? '?'} állás (${percent}%)`}
        </span>
        {progress?.etaSeconds != null && !queued && <span>kb. {progress.etaSeconds} mp van hátra</span>}
      </div>

      <button
        type="button"
        onClick={onCancel}
        className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
        style={{ background: '#1B2040', color: '#F4F3FF', border: '1px solid rgba(125, 105, 255, 0.25)' }}
      >
        <X className="w-3.5 h-3.5" /> Megszakítás
      </button>
    </div>
  );
}
