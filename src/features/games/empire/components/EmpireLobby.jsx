import React, { useState } from 'react';
import { Bot, Users, Swords, Play, LogOut, RefreshCw, Library, X } from 'lucide-react';
import { GLASS } from './EmpireHud';

const DIFFICULTIES = [
  { id: 'easy', label: 'Könnyű' },
  { id: 'medium', label: 'Közepes' },
  { id: 'hard', label: 'Nehéz' }
];
const MODES = [
  { id: '1v1', label: '1v1', max: 2 },
  { id: '2v2', label: '2v2', max: 4 },
  { id: 'ffa', label: 'Mindenki mindenki ellen', max: 4 }
];
// A szerver MAP_SIZE_OPTIONS kulcsai (csempe oldalhossz)
const MAP_SIZES = [
  { id: 'tiny', label: 'Apró', tiles: 56 },
  { id: 'small', label: 'Kicsi', tiles: 64 },
  { id: 'medium', label: 'Közepes', tiles: 88 },
  { id: 'large', label: 'Nagy', tiles: 112 },
  { id: 'huge', label: 'Óriási', tiles: 136 }
];
const MAP_HU = Object.fromEntries(MAP_SIZES.map((x) => [x.id, x.label]));
// ha a játékos nem választ, a régi viselkedés: 2 főnél kicsi, többnél közepes
const defaultMapSize = (players) => (players > 2 ? 'medium' : 'small');

function MapSizePicker({ value, onChange }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs" style={{ color: '#999BBE' }}>Térkép mérete:</span>
      {MAP_SIZES.map((x) => (
        <Pill key={x.id} active={value === x.id} onClick={() => onChange(x.id)}>
          <span title={`${x.tiles}×${x.tiles} mező`}>{x.label}</span>
        </Pill>
      ))}
    </div>
  );
}

const MODE_HU = { ai: 'Egyjátékos', '1v1': '1v1', '2v2': '2v2', ffa: 'Mindenki mindenki ellen' };
const STATUS_HU = { lobby: 'Lobbi', playing: 'Játékban', ended: 'Befejezve' };
const DIFF_HU = { easy: 'Könnyű', medium: 'Közepes', hard: 'Nehéz' };

function Pill({ active, onClick, children, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all enabled:hover:brightness-125 disabled:opacity-40"
      style={{ background: active ? 'linear-gradient(135deg,#7655F5,#536CFF)' : '#1B2040', color: active ? '#fff' : '#c9cdea', border: '1px solid rgba(125,105,255,0.25)' }}
    >
      {children}
    </button>
  );
}

function PlayerDots({ players = [], max }) {
  return (
    <span className="inline-flex items-center gap-1">
      {players.map((p) => <span key={p.idx} title={p.name} className="w-2.5 h-2.5 rounded-full" style={{ background: typeof p.color === 'string' ? p.color : '#999BBE', opacity: p.connected === false ? 0.4 : 1 }} />)}
      <span className="text-[11px] ml-1" style={{ color: '#999BBE' }}>{players.length}/{max}</span>
    </span>
  );
}

// Summary.host is the host's player idx (0 is valid)
const hostName = (s) => s?.players?.find((p) => p.idx === s.host)?.name || null;

function MatchCard({ match, onJoin, busy, highlight }) {
  const full = match.status === 'lobby' && match.players?.length >= match.maxPlayers;
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl transition-all hover:-translate-y-0.5" style={{ background: '#151832', border: `1px solid ${highlight ? 'rgba(40,201,151,0.55)' : 'rgba(125,105,255,0.18)'}` }}>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-sm truncate">{match.name || 'Névtelen meccs'}</div>
        <div className="text-[11px] flex flex-wrap gap-x-2" style={{ color: '#999BBE' }}>
          <span>{MODE_HU[match.mode] || match.mode}</span>
          <span style={{ color: match.status === 'playing' ? '#28C997' : '#f5b041' }}>{STATUS_HU[match.status] || match.status}</span>
          {match.difficulty && <span>MI: {DIFF_HU[match.difficulty] || match.difficulty}</span>}
          {match.mapSize && <span>Térkép: {MAP_HU[match.mapSize] || match.mapSize}</span>}
          {hostName(match) && <span>Házigazda: {hostName(match)}</span>}
        </div>
      </div>
      <PlayerDots players={match.players} max={match.maxPlayers} />
      <button
        onClick={() => onJoin(match.roomId)}
        disabled={busy || full || match.status === 'ended'}
        className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition enabled:hover:brightness-110 enabled:active:scale-95 disabled:opacity-40"
        style={{ background: 'linear-gradient(135deg,#28C997,#1fa57c)', color: '#06281f' }}
      >
        {full ? 'Megtelt' : match.status === 'playing' ? 'Belépés' : 'Csatlakozás'}
      </button>
    </div>
  );
}

function LobbyRoom({ m, currentUser }) {
  const summary = m.current?.summary;
  const [fill, setFill] = useState(true);
  const [difficulty, setDifficulty] = useState('medium');
  if (!summary) return <div className="p-6 text-sm" style={{ color: '#999BBE' }}>Szoba betöltése...</div>;
  const me = currentUser?.username;
  const host = summary.host;
  const isHost = hostName(summary) === me;
  return (
    <div className="max-w-xl mx-auto w-full rounded-3xl p-5" style={GLASS}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-black text-lg">{summary.name || 'MiskolcEmpire szoba'}</div>
          <div className="text-xs" style={{ color: '#999BBE' }}>{MODE_HU[summary.mode] || summary.mode} · {summary.players?.length}/{summary.maxPlayers} játékos · {MAP_HU[summary.mapSize || defaultMapSize(summary.maxPlayers)]} térkép</div>
        </div>
        <button onClick={m.leaveMatch} className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition hover:brightness-125" style={{ background: 'rgba(233,75,100,0.15)', color: '#E94B64', border: '1px solid rgba(233,75,100,0.4)' }}>
          <LogOut className="w-3.5 h-3.5" />Kilépés
        </button>
      </div>
      <div className="space-y-1.5 mb-4">
        {summary.players?.map((p) => (
          <div key={p.idx} className="flex items-center gap-2.5 px-3 py-2 rounded-xl" style={{ background: '#151832' }}>
            <span className="w-3 h-3 rounded-full" style={{ background: typeof p.color === 'string' ? p.color : '#999BBE' }} />
            <span className="font-semibold text-sm">{p.name}</span>
            {p.idx === host && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(245,176,65,0.2)', color: '#f5b041' }}>Házigazda</span>}
            {p.isAi && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#1B2040', color: '#999BBE' }}>MI</span>}
            <span className="ml-auto text-[11px]" style={{ color: '#999BBE' }}>{p.team + 1}. csapat</span>
          </div>
        ))}
        {Array.from({ length: Math.max(0, (summary.maxPlayers || 0) - (summary.players?.length || 0)) }).map((_, i) => (
          <div key={`e${i}`} className="px-3 py-2 rounded-xl text-xs italic" style={{ background: 'rgba(21,24,50,0.5)', color: '#6b6f95', border: '1px dashed rgba(125,105,255,0.2)' }}>Üres hely...</div>
        ))}
      </div>
      {isHost ? (
        <div className="space-y-2.5">
          <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: '#c9cdea' }}>
            <input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} /> Üres helyek feltöltése MI-vel
          </label>
          {fill && (
            <div className="flex gap-1.5 items-center">
              <span className="text-[11px]" style={{ color: '#999BBE' }}>MI szint:</span>
              {DIFFICULTIES.map((d) => <Pill key={d.id} active={difficulty === d.id} onClick={() => setDifficulty(d.id)}>{d.label}</Pill>)}
            </div>
          )}
          <button
            onClick={() => m.startMatch({ fillWithAi: fill, difficulty })}
            disabled={m.busy}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#7655F5,#536CFF)', color: '#fff' }}
          >
            <Play className="w-4 h-4" />Meccs indítása
          </button>
        </div>
      ) : (
        <div className="text-xs text-center py-2" style={{ color: '#999BBE' }}>Várakozás a házigazdára, hogy elindítsa a meccset...</div>
      )}
    </div>
  );
}

export default function EmpireLobby({ m, channelId, channelSession, currentUser, onOpenTech, onClose }) {
  const [tab, setTab] = useState('ai');
  const [difficulty, setDifficulty] = useState('medium');
  const [mode, setMode] = useState('1v1');
  const [ffaMax, setFfaMax] = useState(4);
  const [mapSize, setMapSize] = useState(null);
  const [name, setName] = useState('');
  const [bindChannel, setBindChannel] = useState(true);
  const channelTaken = !!channelId && (!!channelSession?.active || m.matches.some((x) => x.roomId === channelId && x.status !== 'ended'));
  const useChannel = !!channelId && bindChannel && !channelTaken;
  const channelMatch = channelId ? m.matches.find((x) => x.roomId === channelId && x.status !== 'ended') : null;

  const playerCount = tab === 'ai' ? 2 : mode === 'ffa' ? ffaMax : MODES.find((x) => x.id === mode).max;
  const effectiveMap = mapSize || defaultMapSize(playerCount);

  const create = () => {
    const base = { name: name.trim() || undefined, ...(useChannel ? { channelId } : {}) };
    if (tab === 'ai') m.createMatch({ ...base, mode: 'ai', difficulty, mapSize: effectiveMap });
    else m.createMatch({ ...base, mode, maxPlayers: playerCount, mapSize: effectiveMap });
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8" style={{ background: 'radial-gradient(ellipse at top, #151832 0%, #090A18 70%)' }}>
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-56">
            <div className="text-3xl font-black tracking-tight flex items-center gap-2">
              <span>⚔️</span><span style={{ background: 'linear-gradient(135deg,#7655F5,#536CFF)', WebkitBackgroundClip: 'text', color: 'transparent' }}>MiskolcEmpire</span>
            </div>
            <div className="text-xs mt-1" style={{ color: '#999BBE' }}>Vasgyártól a Cyber-Miskolcig: építs telepet, gyűjts vasat, és vidd a Vajdát a csúcsra. A bogrács közben forr.</div>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={onOpenTech} className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition hover:brightness-125" style={{ background: '#1B2040', border: '1px solid rgba(125,105,255,0.25)' }}>
              <Library className="w-3.5 h-3.5" />Technológiák
            </button>
            {onClose && <button onClick={onClose} title="Bezárás" className="p-2 rounded-xl transition hover:bg-white/10"><X className="w-4 h-4" /></button>}
          </div>
        </div>

        {m.phase === 'lobby' ? (
          <LobbyRoom m={m} currentUser={currentUser} />
        ) : (
          <>
            {channelMatch && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-widest mb-1.5" style={{ color: '#28C997' }}>Ebben a hangszobában folyó meccs</div>
                <MatchCard match={channelMatch} onJoin={m.joinMatch} busy={m.busy} highlight />
              </div>
            )}

            <div className="rounded-3xl p-5 space-y-4" style={GLASS}>
              <div className="flex gap-2">
                <Pill active={tab === 'ai'} onClick={() => setTab('ai')}><span className="inline-flex items-center gap-1.5"><Bot className="w-3.5 h-3.5" />Egyjátékos</span></Pill>
                <Pill active={tab === 'multi'} onClick={() => setTab('multi')}><span className="inline-flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />Többjátékos</span></Pill>
              </div>
              {tab === 'ai' ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs" style={{ color: '#999BBE' }}>Ellenfél nehézsége:</span>
                  {DIFFICULTIES.map((d) => <Pill key={d.id} active={difficulty === d.id} onClick={() => setDifficulty(d.id)}>{d.label}</Pill>)}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs" style={{ color: '#999BBE' }}>Mód:</span>
                    {MODES.map((x) => <Pill key={x.id} active={mode === x.id} onClick={() => setMode(x.id)}>{x.label}</Pill>)}
                  </div>
                  {mode === 'ffa' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: '#999BBE' }}>Játékosok száma:</span>
                      {[3, 4].map((n) => <Pill key={n} active={ffaMax === n} onClick={() => setFfaMax(n)}>{n}</Pill>)}
                    </div>
                  )}
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value.slice(0, 40))}
                    placeholder="Szoba neve (nem kötelező)"
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none focus:ring-1"
                    style={{ background: '#101329', color: '#F4F3FF', border: '1px solid rgba(125,105,255,0.25)' }}
                  />
                </div>
              )}
              <MapSizePicker value={effectiveMap} onChange={setMapSize} />
              {channelId && (
                <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: channelTaken ? '#6b6f95' : '#c9cdea' }}>
                  <input type="checkbox" checked={useChannel} disabled={channelTaken} onChange={(e) => setBindChannel(e.target.checked)} />
                  A meccs a hangszobához kötődik (mások is láthatják és csatlakozhatnak){channelTaken ? ' (már fut egy)' : ''}
                </label>
              )}
              <button
                onClick={create}
                disabled={m.busy || !m.connected || !m.content}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#7655F5,#536CFF)', color: '#fff' }}
              >
                <Swords className="w-4 h-4" />{tab === 'ai' ? 'Indítás az MI ellen' : 'Szoba létrehozása'}
              </button>
              {!m.connected && <div className="text-[11px] text-center" style={{ color: '#E94B64' }}>Nincs kapcsolat a szerverrel.</div>}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: '#999BBE' }}>Nyitott meccsek</div>
                <button onClick={m.refreshMatches} title="Frissítés" className="p-1.5 rounded-lg transition hover:bg-white/10"><RefreshCw className="w-3.5 h-3.5" style={{ color: '#999BBE' }} /></button>
              </div>
              <div className="space-y-2">
                {m.matches.filter((x) => x.status !== 'ended' && x.roomId !== channelMatch?.roomId).map((x) => (
                  <MatchCard key={x.roomId} match={x} onJoin={m.joinMatch} busy={m.busy} />
                ))}
                {!m.matches.some((x) => x.status !== 'ended') && (
                  <div className="text-xs text-center py-6 rounded-2xl" style={{ background: '#101329', color: '#6b6f95' }}>Most nincs nyitott meccs. Indíts egyet, a Diósgyőri vasgyár nem várja magától.</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
