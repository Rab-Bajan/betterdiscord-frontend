import React from 'react';
import { WifiOff } from 'lucide-react';
import { playerOf, playerColor } from './empireStore';
import { epochName } from './empireContent';

const CARD = {
  background: 'linear-gradient(160deg, rgba(34,38,72,0.72), rgba(14,16,36,0.78))',
  backdropFilter: 'blur(14px) saturate(140%)',
  WebkitBackdropFilter: 'blur(14px) saturate(140%)',
  border: '1px solid rgba(160,150,255,0.22)',
  boxShadow: '0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)'
};

// Every player on their own team with more than two players (or an explicit 'ffa' room) is a free-for-all.
export function isFfa(players, mode) {
  if (mode === 'ffa') return true;
  if (mode && mode !== 'ai') return false;
  const teams = new Set(players.map((p) => p.team));
  return players.length > 2 && teams.size === players.length;
}

function epochTitle(content, n) {
  const name = content?.epochs?.find((e) => e.n === n)?.name;
  return name ? `${n}. Korszak: ${name}` : `${n}. Korszak`;
}

function Ring({ pct, color }) {
  const r = 15, c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" className="flex-shrink-0">
      <circle cx="19" cy="19" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
      <circle cx="19" cy="19" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
        transform="rotate(-90 19 19)" style={{ transition: 'stroke-dashoffset .4s ease' }} />
      <text x="19" y="22.5" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#F4F3FF">{Math.floor(pct)}%</text>
    </svg>
  );
}

// Top-right status card: local player, team / FFA, current epoch with research progress, other players.
export default function EmpireHeader({ store, content, mode }) {
  const me = playerOf(store, store.you.idx);
  if (!me) return null;
  const players = store.players;
  const ffa = isFfa(players, mode);
  const epoch = store.res.epoch || me.epoch || 1;
  const research = store.res.research;
  const myColor = playerColor(store, me.idx);
  const others = players.filter((p) => p.idx !== me.idx);
  return (
    <div className="pointer-events-auto w-[268px] max-w-[46vw] rounded-2xl px-3 py-2.5 select-none" style={CARD}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: myColor, boxShadow: `0 0 10px ${myColor}` }} />
        <span className="font-black text-sm truncate min-w-0" style={{ color: '#F4F3FF' }} title={me.name}>{me.name}</span>
        <span className="ml-auto flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
          style={{ background: 'rgba(118,85,245,0.22)', color: '#c7bfff', border: '1px solid rgba(118,85,245,0.35)' }}>
          {ffa ? 'FFA' : `Csapat ${me.team + 1}`}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2.5 min-w-0">
        {research ? <Ring pct={research.pct || 0} color="#7c8cff" /> : (
          <div className="w-[38px] h-[38px] rounded-full flex items-center justify-center flex-shrink-0 text-sm font-black"
            style={{ background: 'rgba(83,108,255,0.16)', color: '#9fb0ff', border: '1px solid rgba(83,108,255,0.35)' }}>{epoch}</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-bold truncate" style={{ color: '#e4e1ff' }} title={epochTitle(content, epoch)}>{epochTitle(content, epoch)}</div>
          {research ? (
            <>
              <div className="text-[10px] truncate" style={{ color: '#999BBE' }} title={epochName(content, research.epoch)}>
                Kutatás: {epochName(content, research.epoch)}
              </div>
              <div className="mt-1 h-1.5 rounded-full overflow-hidden relative" style={{ background: 'rgba(0,0,0,0.45)' }}>
                <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, research.pct || 0))}%`, background: 'linear-gradient(90deg,#536CFF,#9b8cff)', transition: 'width .4s ease' }} />
                <div className="absolute inset-0 animate-pulse" style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)' }} />
              </div>
            </>
          ) : (
            <div className="text-[10px]" style={{ color: '#999BBE' }}>Nincs folyamatban lévő kutatás</div>
          )}
        </div>
      </div>
      {others.length > 0 && (
        <div className="mt-2 pt-2 space-y-1" style={{ borderTop: '1px solid rgba(160,150,255,0.14)' }}>
          {others.map((p) => {
            const out = p.alive === false;
            const ally = !ffa && p.team === me.team;
            return (
              <div key={p.idx} className="flex items-center gap-1.5 text-[11px] min-w-0" style={{ opacity: out ? 0.5 : 1 }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: playerColor(store, p.idx) }} />
                <span className="truncate min-w-0" style={{ color: '#e4e1ff', textDecoration: out ? 'line-through' : 'none' }} title={p.name}>{p.name}</span>
                {p.isAi && <span className="flex-shrink-0 px-1 rounded text-[9px] font-bold" style={{ background: '#1B2040', color: '#999BBE' }}>MI</span>}
                {p.connected === false && !p.isAi && <span className="flex-shrink-0" title="Lekapcsolódott"><WifiOff className="w-3 h-3" style={{ color: '#E94B64' }} /></span>}
                <span className="ml-auto flex-shrink-0 flex items-center gap-1">
                  {!ffa && <span className="text-[9px] font-semibold" style={{ color: ally ? '#5ec8ff' : '#999BBE' }}>{ally ? 'Szövetséges' : `Csapat ${p.team + 1}`}</span>}
                  {out
                    ? <span className="text-[9px] font-bold" style={{ color: '#E94B64' }}>{p.spectator ? 'Néző' : 'Kiesett'}</span>
                    : <span className="px-1.5 rounded-full text-[9px] font-bold" style={{ background: 'rgba(83,108,255,0.18)', color: '#9fb0ff' }} title={epochTitle(content, p.epoch || 1)}>{p.epoch || 1}. kor</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
