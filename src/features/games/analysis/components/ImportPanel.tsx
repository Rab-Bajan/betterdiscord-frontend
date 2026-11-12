import React, { useState } from 'react';
import { Link2, FileText, Loader2, Play, AlertTriangle, Sparkles } from 'lucide-react';
import type { FormEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { resultLabel } from '../lib/analysisFormat';
import type { AnalysisError, AnalysisPhase, ImportRequest } from '../hooks/useGameAnalysis';
import type { ImportedGame } from '../types';

/** The engine settings form; number fields may be empty strings while editing. */
export interface SettingsForm {
  depth: number | string;
  movetimeMs: number | string;
  multipv: number | string;
  engine: string;
}

type ImportMode = 'url' | 'pgn';

const MODES: ReadonlyArray<readonly [ImportMode, LucideIcon, string]> = [['url', Link2, 'Chess.com link'], ['pgn', FileText, 'PGN beillesztése']];

interface ImportPanelProps {
  phase: AnalysisPhase;
  imported: ImportedGame | null;
  error: AnalysisError | null;
  onImport: (request: ImportRequest) => void;
  onStart: () => void;
  settings: SettingsForm;
  onSettingsChange: (settings: SettingsForm) => void;
}

const EXAMPLE_URL = 'https://www.chess.com/analysis/game/live/186506919580/review?flip=true';

const PRESETS = [
  { id: 'fast', label: 'Gyors', depth: 10, hint: 'másodpercek' },
  { id: 'normal', label: 'Normál', depth: 14, hint: 'ajánlott' },
  { id: 'deep', label: 'Mély', depth: 18, hint: 'lassabb' }
];

const inputStyle = { background: '#101329', border: '1px solid rgba(125, 105, 255, 0.25)', color: '#F4F3FF' };
const cardStyle = { background: '#151832', border: '1px solid rgba(125, 105, 255, 0.15)' };

export default function ImportPanel({ phase, imported, error, onImport, onStart, settings, onSettingsChange }: ImportPanelProps) {
  const [mode, setMode] = useState<ImportMode>('url');
  const [url, setUrl] = useState('');
  const [pgn, setPgn] = useState('');
  const busy = phase === 'importing';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    onImport(mode === 'url' ? { url: url.trim() } : { pgn: pgn.trim() });
  };

  const canSubmit = mode === 'url' ? url.trim().length > 0 : pgn.trim().length > 0;
  const game = imported?.game;
  const set = (patch: Partial<SettingsForm>) => onSettingsChange({ ...settings, ...patch });

  return (
    <div className="space-y-4 max-w-2xl w-full mx-auto">
      <form onSubmit={submit} className="rounded-2xl p-4 sm:p-5 space-y-3" style={cardStyle}>
        <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background: '#101329' }} role="tablist">
          {MODES.map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => setMode(id)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
              style={{ background: mode === id ? '#7655F5' : 'transparent', color: mode === id ? '#fff' : '#999BBE' }}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {mode === 'url' ? (
          <div className="space-y-2">
            <label htmlFor="analysis-url" className="text-xs font-semibold" style={{ color: '#999BBE' }}>
              Illeszd be egy Chess.com játszma linkjét (élő vagy levelezési)
            </label>
            <input
              id="analysis-url"
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.chess.com/game/live/123456789"
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
              style={inputStyle}
              autoComplete="off"
              spellCheck={false}
            />
            <button type="button" onClick={() => setUrl(EXAMPLE_URL)} className="text-xs underline" style={{ color: '#7655F5' }}>
              Példa játszma betöltése
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <label htmlFor="analysis-pgn" className="text-xs font-semibold" style={{ color: '#999BBE' }}>
              PGN szöveg (a Chess.com-on: Megosztás → PGN)
            </label>
            <textarea
              id="analysis-pgn"
              value={pgn}
              onChange={(e) => setPgn(e.target.value)}
              rows={7}
              placeholder={'[White "Név"]\n[Black "Név"]\n\n1. e4 e5 2. Nf3 Nc6 …'}
              className="w-full px-3 py-2.5 rounded-xl text-xs font-mono outline-none resize-y"
              style={inputStyle}
              spellCheck={false}
            />
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !canSubmit}
          className="px-4 py-2.5 rounded-xl text-sm font-bold text-white flex items-center gap-2 transition disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #7655F5, #536CFF)' }}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {busy ? 'Importálás…' : 'Importálás'}
        </button>

        {phase === 'error' && error && (
          <div className="flex items-start gap-2 rounded-xl p-3 text-sm" style={{ background: 'rgba(233, 75, 100, 0.1)', border: '1px solid rgba(233, 75, 100, 0.35)', color: '#F4F3FF' }} role="alert">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#E94B64' }} />
            <div>
              <div>{error.message}</div>
              {error.canPastePgn && mode === 'url' && (
                <button type="button" onClick={() => setMode('pgn')} className="mt-1 text-xs underline" style={{ color: '#7655F5' }}>
                  Inkább PGN-t illesztek be
                </button>
              )}
            </div>
          </div>
        )}
      </form>

      {game && (
        <div className="rounded-2xl p-4 sm:p-5 space-y-4" style={cardStyle}>
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#999BBE' }}>Importált játszma</div>
            <div className="text-base font-bold mt-1" style={{ color: '#F4F3FF' }}>
              {game.white.name} {game.white.rating ? `(${game.white.rating})` : ''} <span style={{ color: '#999BBE' }}>vs</span> {game.black.name} {game.black.rating ? `(${game.black.rating})` : ''}
            </div>
            <div className="text-xs mt-1" style={{ color: '#999BBE' }}>
              {[resultLabel(game.result), game.termination, `${Math.ceil(game.plies / 2)} lépés`, game.date, game.timeControl ? `időkontroll: ${game.timeControl}` : null].filter(Boolean).join(' · ')}
            </div>
            <div className="text-[11px] mt-1" style={{ color: '#999BBE' }}>
              Forrás: {imported.source === 'chess.com-official' ? 'Chess.com hivatalos PGN' : imported.source === 'chess.com-callback' ? 'Chess.com játékadatok' : 'beillesztett PGN'}
            </div>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: '#999BBE' }}>Elemzési beállítások</legend>

            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => {
                const active = settings.depth === preset.depth && !settings.movetimeMs;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => set({ depth: preset.depth, movetimeMs: '' })}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold transition"
                    style={{ background: active ? '#7655F5' : '#1B2040', color: active ? '#fff' : '#F4F3FF', border: '1px solid rgba(125, 105, 255, 0.25)' }}
                  >
                    {preset.label} <span style={{ opacity: 0.7 }}>(d{preset.depth} · {preset.hint})</span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className="text-[11px] font-semibold" style={{ color: '#999BBE' }}>
                Mélység (6–24)
                <input type="number" min="6" max="24" value={settings.depth} onChange={(e) => set({ depth: e.target.value })} className="mt-1 w-full px-2.5 py-1.5 rounded-lg text-sm outline-none" style={inputStyle} />
              </label>
              <label className="text-[11px] font-semibold" style={{ color: '#999BBE' }}>
                Idő / állás (ms)
                <input type="number" min="50" max="10000" step="50" placeholder="nincs" value={settings.movetimeMs} onChange={(e) => set({ movetimeMs: e.target.value })} className="mt-1 w-full px-2.5 py-1.5 rounded-lg text-sm outline-none" style={inputStyle} />
              </label>
              <label className="text-[11px] font-semibold" style={{ color: '#999BBE' }}>
                Vonalak (2–5)
                <input type="number" min="2" max="5" value={settings.multipv} onChange={(e) => set({ multipv: e.target.value })} className="mt-1 w-full px-2.5 py-1.5 rounded-lg text-sm outline-none" style={inputStyle} />
              </label>
              <label className="text-[11px] font-semibold" style={{ color: '#999BBE' }}>
                Motor
                <select value={settings.engine} onChange={(e) => set({ engine: e.target.value })} className="mt-1 w-full px-2.5 py-1.5 rounded-lg text-sm outline-none" style={inputStyle}>
                  <option value="full">Teljes (erősebb)</option>
                  <option value="lite">Könnyű (gyorsabb)</option>
                </select>
              </label>
            </div>
            <p className="text-[11px]" style={{ color: '#999BBE' }}>
              Ha mélységet és időt is megadsz, a keresés a kettő közül az előbb teljesülőnél áll meg. A több vonal a „Nagyszerű” és „Zseniális” lépések felismeréséhez kell.
            </p>
          </fieldset>

          <button
            type="button"
            onClick={onStart}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white flex items-center gap-2 transition active:scale-95"
            style={{ background: 'linear-gradient(135deg, #28C997, #1BACA6)' }}
          >
            <Play className="w-4 h-4 fill-current" /> Elemzés indítása
          </button>
        </div>
      )}
    </div>
  );
}
