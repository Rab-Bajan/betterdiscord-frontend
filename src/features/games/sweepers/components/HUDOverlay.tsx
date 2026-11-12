import React from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { DISTRICT_NAMES } from '../types';
import { SWEEPERS_THEME as T, cleanlinessTone, formatFt } from '../theme';
import type { SweepersHud } from '../lib/engine/SweepersGame';

interface HUDOverlayProps {
  hud: SweepersHud;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

const panel = { background: 'rgba(16, 19, 41, 0.82)', border: `1px solid ${T.border}`, backdropFilter: 'blur(6px)' } as const;

/** HUD shell: funds top-left, current district top-centre. Later phases add the rest. */
export default function HUDOverlay({ hud, isFullscreen, onToggleFullscreen }: HUDOverlayProps) {
  const districtName = hud.district === null ? 'Városhatáron kívül' : DISTRICT_NAMES[hud.district] ?? 'Ismeretlen kerület';
  return (
    <div className="absolute inset-0 pointer-events-none z-20" style={{ fontFamily: T.font, color: T.text }}>
      <div className="absolute top-3 left-3 rounded-lg px-3 py-2 text-xs space-y-0.5" style={panel}>
        <div>
          <span style={{ color: T.muted }}>Csapatkassza: </span>
          <strong className="tabular-nums">{formatFt(hud.teamFunds)}</strong>
        </div>
        <div>
          <span style={{ color: T.muted }}>Saját pénz: </span>
          <strong className="tabular-nums" style={{ color: T.green }}>{formatFt(hud.cash)}</strong>
        </div>
      </div>

      <div className="absolute top-3 left-1/2 -translate-x-1/2 rounded-lg px-4 py-2 text-center max-w-[60vw]" style={panel}>
        <div className="text-sm font-bold truncate">{districtName}</div>
        {hud.cleanliness !== null && (
          <div className="text-[11px] font-semibold tabular-nums" style={{ color: cleanlinessTone(hud.cleanliness) }}>
            Tisztaság: {hud.cleanliness}%
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onToggleFullscreen}
        title={isFullscreen ? 'Kilépés a teljes képernyőből (F11)' : 'Teljes képernyő (F11)'}
        aria-label={isFullscreen ? 'Kilépés a teljes képernyőből' : 'Teljes képernyő'}
        className="absolute top-3 right-3 p-2 rounded-lg pointer-events-auto"
        style={panel}
      >
        {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
      </button>

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(226, 232, 240, 0.85)' }} />
    </div>
  );
}
