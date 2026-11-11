import React, { useState } from 'react';
import { BarChart3, X, ArrowLeft, RotateCcw } from 'lucide-react';
import { useGameAnalysis } from '../hooks/useGameAnalysis';
import ImportPanel from './ImportPanel';
import AnalysisProgress from './AnalysisProgress';
import ReviewScreen from './ReviewScreen';

const DEFAULT_SETTINGS = { depth: 14, movetimeMs: '', multipv: 3, engine: 'full' };

// A beviteli mezők szövegeit számokká alakítjuk (üres = nincs megadva)
function toRequest(settings) {
  const num = (value) => (value === '' || value == null || Number(value) <= 0 ? undefined : Number(value));
  return { depth: num(settings.depth), movetimeMs: num(settings.movetimeMs), multipv: num(settings.multipv), engine: settings.engine };
}

// Játszma-elemzés: Chess.com import vagy PGN -> Stockfish elemzés -> lépésenkénti értékelés
export default function GameAnalysisView({ onClose }) {
  const analysis = useGameAnalysis();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const { phase, imported, progress, result, error } = analysis;

  const headerButton = 'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition';
  const headerStyle = { background: '#1B2040', color: '#F4F3FF', border: '1px solid rgba(125, 105, 255, 0.2)' };

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden select-none" style={{ background: '#090A18' }}>
      <div className="min-h-14 py-2 px-3 sm:px-5 flex items-center justify-between gap-2 flex-shrink-0" style={{ background: '#101329', borderBottom: '1px solid rgba(125, 105, 255, 0.12)' }}>
        <div className="flex items-center gap-2 min-w-0">
          <BarChart3 className="w-5 h-5 flex-shrink-0" style={{ color: '#7655F5' }} />
          <h1 className="font-bold truncate text-sm sm:text-base" style={{ color: '#F4F3FF' }}>Játszma elemzés</h1>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold hidden sm:inline" style={{ background: 'rgba(125, 105, 255, 0.15)', color: '#999BBE' }}>Stockfish 19</span>
        </div>
        <div className="flex items-center gap-2">
          {phase === 'done' && (
            <>
              <button type="button" onClick={analysis.backToSettings} className={headerButton} style={headerStyle}>
                <ArrowLeft className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Beállítások</span>
              </button>
              <button type="button" onClick={analysis.reset} className={headerButton} style={headerStyle}>
                <RotateCcw className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Új játszma</span>
              </button>
            </>
          )}
          <button type="button" onClick={onClose} className={headerButton} style={headerStyle} title="Vissza a csevegéshez">
            <X className="w-4 h-4" /> <span className="hidden sm:inline">Bezárás</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-5 select-text">
        {phase === 'done' && result ? (
          <ReviewScreen result={result} />
        ) : phase === 'analyzing' ? (
          <AnalysisProgress progress={progress} game={imported?.game} onCancel={analysis.cancel} />
        ) : (
          <ImportPanel
            phase={phase}
            imported={imported}
            error={error}
            settings={settings}
            onSettingsChange={setSettings}
            onImport={analysis.importGame}
            onStart={() => analysis.startAnalysis(toRequest(settings))}
          />
        )}
      </div>
    </div>
  );
}
