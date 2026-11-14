import React from 'react';
import { CloudDrizzle, CloudFog, Lock, Maximize, Minimize, Moon, Sun } from 'lucide-react';
import { DISTRICT_HUD_NAMES } from '../types';
import { SWEEPERS_THEME as T, cleanlinessTone, formatFt } from '../theme';
import GpsRadar from './GpsRadar';
import type { SweepersHud, SweepersRadar } from '../lib/engine/SweepersGame';
import type { WeatherKind } from '../worldTypes';

interface HUDOverlayProps {
  hud: SweepersHud;
  radar: SweepersRadar | null;
  /** Hungarian names of the districts just unlocked (`miskolc:district_unlocked`), shown for a few seconds. */
  unlockToast: string | null;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

const panel = { background: 'rgba(16, 19, 41, 0.82)', border: `1px solid ${T.border}`, backdropFilter: 'blur(6px)' } as const;

const WEATHER_LABEL: Readonly<Record<WeatherKind, string>> = { clear: 'Derült', smog: 'Szmog', drizzle: 'Szitálás' };

function WeatherIcon({ kind, night }: { kind: WeatherKind; night: boolean }) {
  if (kind === 'smog') return <CloudFog className="w-3.5 h-3.5" style={{ color: '#C8C2A0' }} />;
  if (kind === 'drizzle') return <CloudDrizzle className="w-3.5 h-3.5" style={{ color: '#8FB3E8' }} />;
  return night ? <Moon className="w-3.5 h-3.5" style={{ color: '#C7D2FE' }} /> : <Sun className="w-3.5 h-3.5" style={{ color: '#FFE4B5' }} />;
}

/** "AVAS LAKÓTELEP – 68.4% TISZTA" (spec 30); outside the grid / locked districts say so. */
export function districtBanner(hud: Pick<SweepersHud, 'district' | 'cleanliness' | 'districtLocked'>): string {
  if (hud.district === null) return hud.districtLocked ? 'VÁROSHATÁRON KÍVÜL – LEZÁRVA' : 'VÁROSHATÁRON KÍVÜL';
  const name = DISTRICT_HUD_NAMES[hud.district] ?? 'ISMERETLEN KERÜLET';
  if (hud.districtLocked) return `${name} – LEZÁRVA`;
  return hud.cleanliness === null ? name : `${name} – ${hud.cleanliness.toFixed(1)}% TISZTA`;
}

/** HUD: funds top-left, district banner + clock/weather top-centre, GPS radar top-right. */
export default function HUDOverlay({ hud, radar, unlockToast, isFullscreen, onToggleFullscreen }: HUDOverlayProps) {
  const tone = hud.districtLocked ? T.muted : hud.cleanliness === null ? T.text : cleanlinessTone(hud.cleanliness);
  return (
    <div className="absolute inset-0 pointer-events-none z-20" style={{ fontFamily: T.font, color: T.text }}>
      <div className="absolute top-3 left-3 flex flex-col items-start gap-1">
        <div className="rounded-lg px-3 py-2 text-xs space-y-0.5" style={panel}>
          <div>
            <span style={{ color: T.muted }}>{hud.economy ? 'Csapat: ' : 'Csapatkassza: '}</span>
            <strong className="tabular-nums" style={hud.teamFunds < 0 ? { color: T.red } : undefined}>{formatFt(hud.teamFunds)}</strong>
          </div>
          <div>
            <span style={{ color: T.muted }}>{hud.economy ? 'Pénztárca: ' : 'Saját pénz: '}</span>
            <strong className="tabular-nums" style={{ color: T.green }}>{formatFt(hud.cash)}</strong>
          </div>
        </div>
        {hud.economy && (
          <div className="flex flex-wrap gap-1 text-[11px] font-semibold tabular-nums">
            <span className="rounded-md px-2 py-0.5" style={{ ...panel, color: (hud.economy.lme.pct[2] ?? 0) >= 0 ? T.green : T.red }}>{hud.economy.copper}</span>
            <span className="rounded-md px-2 py-0.5" style={panel}>{hud.economy.inspector}</span>
            {hud.economy.grid.st > 0 && <span className="rounded-md px-2 py-0.5" style={{ ...panel, color: T.orange }}>{hud.economy.grid.st === 2 ? 'Áramszünet' : 'Feszültségesés'}</span>}
          </div>
        )}
      </div>

      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 max-w-[56vw]">
        <div className="rounded-lg px-4 py-1.5 text-center flex items-center gap-2" style={panel}>
          {hud.districtLocked && <Lock className="w-3.5 h-3.5 shrink-0" style={{ color: T.orange }} />}
          <span className="text-sm font-black tracking-wide truncate tabular-nums" style={{ color: tone }}>{districtBanner(hud)}</span>
        </div>
        <div className="rounded-md px-2.5 py-0.5 flex items-center gap-2 text-[11px] font-semibold tabular-nums" style={panel}>
          <span style={{ color: T.muted }}>{hud.day}. nap</span>
          <span>{hud.clock}</span>
          <span className="flex items-center gap-1" title={WEATHER_LABEL[hud.weather]}>
            <WeatherIcon kind={hud.weather} night={hud.night} />
            <span style={{ color: T.muted }}>{WEATHER_LABEL[hud.weather]}</span>
          </span>
        </div>
        {unlockToast && (
          <div className="mt-2 rounded-xl px-5 py-2.5 text-center" style={{ ...panel, border: `1px solid ${T.green}`, boxShadow: `0 0 24px ${T.green}55` }}>
            <div className="text-[10px] font-bold tracking-[0.2em]" style={{ color: T.green }}>ÚJ KERÜLET MEGNYÍLT</div>
            <div className="text-base font-black">{unlockToast}</div>
          </div>
        )}
      </div>

      <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
        <GpsRadar radar={radar} />
        <button
          type="button"
          onClick={onToggleFullscreen}
          title={isFullscreen ? 'Kilépés a teljes képernyőből (F11)' : 'Teljes képernyő (F11)'}
          aria-label={isFullscreen ? 'Kilépés a teljes képernyőből' : 'Teljes képernyő'}
          className="p-2 rounded-lg pointer-events-auto"
          style={panel}
        >
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        </button>
      </div>

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(226, 232, 240, 0.85)' }} />
      {hud.economy && hud.economy.scale !== null && (
        // the 2 s stillness ring (E.7): the server weighs, this only shows the wait
        <svg className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
          <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(226, 232, 240, 0.25)" strokeWidth="4" />
          <circle cx="28" cy="28" r="24" fill="none" stroke={T.green} strokeWidth="4" strokeDasharray={`${2 * Math.PI * 24}`} strokeDashoffset={`${2 * Math.PI * 24 * (1 - hud.economy.scale)}`} transform="rotate(-90 28 28)" />
        </svg>
      )}
      {hud.economy?.prompt && (
        <div className="absolute left-1/2 top-[58%] -translate-x-1/2 rounded-md px-3 py-1 text-xs font-bold" style={panel}>{hud.economy.prompt}</div>
      )}
    </div>
  );
}
