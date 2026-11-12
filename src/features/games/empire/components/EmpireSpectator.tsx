import { useEffect, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import { Eye, LogOut, Library, Volume2, VolumeX } from 'lucide-react';
import { playerColor } from '../lib/empireStore';
import { epochName } from '../lib/empireContent';
import type { DefeatStats, EmpireContent, EmpireStore } from '../types';

const GLASS_DARK: CSSProperties = {
  background: 'rgba(14,16,36,0.8)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(125,105,255,0.22)'
};

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const STAT_ROWS: ReadonlyArray<readonly [keyof DefeatStats, string, string]> = [
  ['unitsLost', 'Elvesztett egységek', '💀'],
  ['gathered', 'Gyűjtött nyersanyag', '⛏️'],
  ['damageDealt', 'Okozott sebzés', '💥'],
  ['unitsKilled', 'Legyőzött egységek', '⚔️'],
  ['buildingsDestroyed', 'Lerombolt épületek', '🏚️']
];
const AUTO_MS = 9000;

// Full-screen 'VERESÉG' banner with the owner's stats; leads into spectator mode.
export function DefeatBanner({ stats, onContinue }: { stats: Partial<DefeatStats> | undefined; onContinue: () => void }): JSX.Element {
  const [left, setLeft] = useState(Math.ceil(AUTO_MS / 1000));
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => {
      const l = Math.ceil((AUTO_MS - (Date.now() - t0)) / 1000);
      setLeft(l);
      if (l <= 0) { clearInterval(id); setLeaving(true); }
    }, 250);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!leaving) return undefined;
    const id = setTimeout(onContinue, 650);
    return () => clearTimeout(id);
  }, [leaving, onContinue]);
  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center pointer-events-auto p-4"
      style={{
        background: 'radial-gradient(ellipse at center, rgba(90,8,20,0.55), rgba(5,6,15,0.88) 70%)',
        transition: 'opacity .6s ease, backdrop-filter .6s ease',
        opacity: leaving ? 0 : 1,
        backdropFilter: leaving ? 'blur(0px)' : 'blur(3px)'
      }}
    >
      <style>{`
        @keyframes empDefeatIn { 0% { transform: scale(1.6); letter-spacing: .6em; opacity: 0; filter: blur(8px); } 60% { opacity: 1; filter: blur(0); } 100% { transform: scale(1); letter-spacing: .22em; } }
        @keyframes empDefeatGlow { 0%,100% { text-shadow: 0 0 24px rgba(233,75,100,.7), 0 0 60px rgba(233,75,100,.35); } 50% { text-shadow: 0 0 40px rgba(255,90,110,.95), 0 0 90px rgba(233,75,100,.55); } }
        @keyframes empRise { from { transform: translateY(14px); opacity: 0; } to { transform: none; opacity: 1; } }
      `}</style>
      <div className="w-full max-w-xl text-center">
        <div className="text-5xl sm:text-7xl font-black" style={{ color: '#ff5a6e', animation: 'empDefeatIn .9s cubic-bezier(.2,.8,.2,1) both, empDefeatGlow 2.4s ease-in-out .9s infinite', letterSpacing: '.22em' }}>
          VERESÉG
        </div>
        <div className="text-sm mt-2" style={{ color: '#d9b3ba', animation: 'empRise .6s ease .5s both' }}>
          A telepedet elfoglalták. A MÉH-telep csendes, a bogrács kihűlt.
        </div>
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-5 gap-2" style={{ animation: 'empRise .6s ease .8s both' }}>
          {STAT_ROWS.map(([k, label, icon]) => (
            <div key={k} className="rounded-2xl px-2 py-2.5" style={{ ...GLASS_DARK, borderColor: 'rgba(233,75,100,0.3)' }}>
              <div className="text-lg">{icon}</div>
              <div className="text-xl font-black tabular-nums" style={{ color: '#F4F3FF' }}>{Math.floor(stats?.[k] || 0)}</div>
              <div className="text-[10px] leading-tight mt-0.5" style={{ color: '#c9a7ae' }}>{label}</div>
            </div>
          ))}
        </div>
        <button
          onClick={() => setLeaving(true)}
          className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition hover:brightness-110 active:scale-95"
          style={{ background: 'linear-gradient(135deg,#7655F5,#536CFF)', color: '#fff', animation: 'empRise .6s ease 1.1s both' }}
        >
          <Eye className="w-4 h-4" /> Megfigyelő mód ({Math.max(0, left)})
        </button>
      </div>
    </div>
  );
}

// Top bar for eliminated players: match clock and every player's army / workers / buildings / epoch.
interface SpectatorBarProps {
  store: EmpireStore;
  content: EmpireContent | null;
  onLeave: () => void;
  onOpenTech: () => void;
  onToggleMute: () => void;
}

export function SpectatorBar({ store, content, onLeave, onOpenTech, onToggleMute }: SpectatorBarProps): JSX.Element {
  const sv = store.sv;
  const elapsed = sv ? sv.elapsed + Math.max(0, store.time - store.svAt) : 0;
  const rows = sv?.players || store.players.map((p) => ({ ...p, army: null, workers: null, buildings: null }));
  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-2 px-3 py-2 rounded-2xl" style={GLASS_DARK}>
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl" style={{ background: 'rgba(118,85,245,0.22)', color: '#c7bfff' }}>
        <Eye className="w-4 h-4" /><span className="text-xs font-black uppercase tracking-wider">Megfigyelő mód</span>
      </div>
      <div className="px-2.5 py-1 rounded-xl text-sm font-black tabular-nums" style={{ background: '#101329', color: '#F4F3FF' }} title="Meccsidő">⏱ {formatClock(elapsed)}</div>
      <div className="flex flex-wrap gap-1.5 min-w-0">
        {rows.map((p) => (
          <div key={p.idx} className="flex items-center gap-2 px-2.5 py-1 rounded-xl min-w-0" style={{ background: '#101329', opacity: p.alive === false ? 0.5 : 1 }}>
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: (typeof p.color === 'string' && p.color) || playerColor(store, p.idx) }} />
            <span className="text-xs font-bold truncate max-w-[110px]" title={p.name}>{p.name}</span>
            {p.alive === false ? (
              <span className="text-[10px] font-bold" style={{ color: '#E94B64' }}>Kiesett</span>
            ) : (
              <span className="flex items-center gap-1.5 text-[11px] tabular-nums" style={{ color: '#c9cdea' }}>
                {p.army !== null && <span title="Sereg">⚔️{p.army}</span>}
                {p.workers !== null && <span title="Munkások">👷{p.workers}</span>}
                {p.buildings !== null && <span title="Épületek">🏠{p.buildings}</span>}
                <span className="px-1.5 rounded-full text-[10px] font-bold" style={{ background: 'rgba(83,108,255,0.18)', color: '#9fb0ff' }} title={epochName(content, p.epoch || 1)}>
                  {p.epoch || 1}. kor
                </span>
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <button onClick={onToggleMute} title={store.ui.muted ? 'Hang bekapcsolása' : 'Némítás'} className="p-1.5 rounded-xl transition hover:brightness-125" style={{ background: '#1B2040', color: '#999BBE' }}>
          {store.ui.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
        <button onClick={onOpenTech} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition hover:brightness-125" style={{ background: '#1B2040', color: '#F4F3FF', border: '1px solid rgba(125,105,255,0.25)' }}>
          <Library className="w-3.5 h-3.5" /><span className="hidden sm:inline">Technológiák</span>
        </button>
        <button onClick={onLeave} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition hover:brightness-125" style={{ background: 'rgba(233,75,100,0.15)', color: '#E94B64', border: '1px solid rgba(233,75,100,0.4)' }}>
          <LogOut className="w-3.5 h-3.5" /><span>Kilépés</span>
        </button>
      </div>
    </div>
  );
}
