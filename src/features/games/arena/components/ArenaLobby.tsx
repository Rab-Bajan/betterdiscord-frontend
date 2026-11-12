import React from 'react';
import { Check, Loader2, Shield, Swords, Zap } from 'lucide-react';
import type { ArenaSocket } from '../lib/GameRpc';
import { card } from '../lib/arenaLabels';
import type { ArenaProfile, Catalog, Lobby } from '../types';

interface ArenaLobbyProps {
  lobby: Lobby;
  catalog: Catalog;
  socket: ArenaSocket;
  profile: ArenaProfile | null;
  error: string | null;
  notice: string | null;
  onSwitchLobby: (lobbyId: string | null) => void;
}

// Lobbi: mód- és lobbiválasztás, frakciók és karakterek, készenlét
export default function ArenaLobby({ lobby, catalog, socket, profile, error, notice, onSwitchLobby }: ArenaLobbyProps) {
  const me = lobby.players.find((p) => p.id === socket.id);
  if (!me) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#7655F5]" /></div>;

  const setLoadout = (team: string, characterId: string) => socket.emit('game:set-loadout', { team, characterId });
  const currentMode = catalog.modes.find((m) => m.id === lobby.mode);
  const isPublic = lobby.channelId.startsWith('public:');
  const canChangeMode = !isPublic && !lobby.battle && lobby.phase !== 'playing';
  const setMode = (mode: string, options: Lobby['modeOptions'] = {}) => socket.emit('game:set-mode', { mode, options });
  const selectStyle = { background: '#1B2040', color: '#F4F3FF' };
  const isCountdown = lobby.phase === 'countdown';

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-5">
      <div className="max-w-4xl mx-auto space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-black text-white tracking-wide">SUDS WAR</h1>
            <p className="text-xs" style={{ color: '#999BBE' }}>A hangkapcsolat játék közben is megmarad.</p>
          </div>
          <div className="flex items-center gap-2 text-xs" style={{ color: '#999BBE' }}>
            {profile ? <span className="font-semibold" style={{ color: '#28C997' }}>{profile.level}. szint · {profile.xp} XP · {profile.wins} győzelem</span> : <span>Vendégként nem gyűjtesz jutalmat</span>}
          </div>
        </div>

        <div className="rounded-2xl p-3 space-y-2" style={card}>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span style={{ color: '#999BBE' }}>Lobbi:</span>
            <button type="button" onClick={() => onSwitchLobby(null)} className="px-2 py-1 rounded-lg font-bold text-white" style={{ background: !lobby.channelId.includes(':') ? '#7655F5' : '#1B2040' }}>Hangszoba</button>
            <select aria-label="Nyilvános lobbi" value={isPublic ? lobby.channelId : ''} onChange={(e) => e.target.value && onSwitchLobby(e.target.value)} className="px-2 py-1 rounded-lg outline-none" style={selectStyle}>
              <option value="">Nyilvános meccs...</option>
              {catalog.modes.map((m) => <option key={m.id} value={`public:${m.id}`}>{m.name}</option>)}
            </select>
            <button type="button" onClick={() => socket.emit('game:private-create')} className="px-2 py-1 rounded-lg font-bold text-white" style={{ background: '#1B2040' }}>Privát lobbi</button>
            <button type="button" onClick={() => { const code = window.prompt('Privát lobbi kódja'); if (code) onSwitchLobby(`private:${code.trim().toUpperCase()}`); }} className="px-2 py-1 rounded-lg font-bold text-white" style={{ background: '#1B2040' }}>Belépés kóddal</button>
            {lobby.channelId.startsWith('private:') && <span className="font-mono font-bold text-white select-text">Kód: {lobby.channelId.slice(8)}</span>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {catalog.modes.map((m) => (
              <button key={m.id} type="button" disabled={!canChangeMode} onClick={() => setMode(m.id)} className="px-2 py-1.5 rounded-xl text-xs font-bold text-left disabled:opacity-50" style={{ background: lobby.mode === m.id ? 'rgba(118,85,245,0.35)' : '#1B2040', border: `1px solid ${lobby.mode === m.id ? '#7655F5' : 'transparent'}`, color: '#fff' }}>
                {m.name}<span className="block text-[10px] font-medium" style={{ color: '#999BBE' }}>{m.min}–{m.max} játékos</span>
              </button>
            ))}
          </div>
          <p className="text-xs" style={{ color: '#F4F3FF' }}>{lobby.battle ? `Területi csata: ${lobby.battle.territory}` : currentMode?.description}</p>
          {canChangeMode && lobby.mode === 'boss' && (
            <div className="flex gap-2 text-xs">
              <select aria-label="Főellenség" value={lobby.modeOptions.bossId || (currentMode?.options?.bosses ?? [])[0]} onChange={(e) => setMode('boss', { ...lobby.modeOptions, bossId: e.target.value })} className="px-2 py-1 rounded-lg" style={selectStyle}>{(currentMode?.options?.bosses ?? []).map((id) => <option key={id} value={id}>{catalog.npcDefs[id]?.name}</option>)}</select>
              <select aria-label="Nehézség" value={lobby.modeOptions.difficulty || 'normal'} onChange={(e) => setMode('boss', { ...lobby.modeOptions, difficulty: e.target.value })} className="px-2 py-1 rounded-lg" style={selectStyle}>{Object.entries(catalog.difficulties).map(([id, d]) => <option key={id} value={id}>{d.label}</option>)}</select>
            </div>
          )}
          {canChangeMode && lobby.mode === 'racing' && (
            <select aria-label="Pálya" value={lobby.modeOptions.trackId || (currentMode?.options?.tracks ?? [])[0]} onChange={(e) => setMode('racing', { trackId: e.target.value })} className="px-2 py-1 rounded-lg text-xs" style={selectStyle}>{Object.entries(catalog.tracks).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
          )}
        </div>

        {error && <div className="px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: 'rgba(233,75,100,0.15)', color: '#E94B64' }}>{error}</div>}
        {!error && notice && <div className="px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: 'rgba(245,176,65,0.14)', color: '#F5B041' }}>{notice}</div>}

        <div className="grid sm:grid-cols-2 gap-3">
          {Object.values(catalog.factions).map((faction) => {
            const members = lobby.players.filter((p) => p.team === faction.id);
            return (
              <div key={faction.id} className="rounded-2xl p-3" style={{ ...card, borderColor: me.team === faction.id ? faction.color : card.border }}>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-extrabold" style={{ color: faction.color }}>{faction.name}</h2>
                  <span className="text-xs" style={{ color: '#999BBE' }}>{members.length} / {lobby.teamLimit}</span>
                </div>
                <div className="space-y-1.5 mb-3">
                  {Object.values(catalog.characters).filter((c) => c.faction === faction.id).map((c) => {
                    const selected = me.characterId === c.id;
                    return (
                      <button key={c.id} type="button" onClick={() => setLoadout(faction.id, c.id)} disabled={lobby.phase === 'playing'} className="w-full text-left px-3 py-2 rounded-xl transition" style={{ background: selected ? 'rgba(118,85,245,0.3)' : '#1B2040', border: `1px solid ${selected ? '#7655F5' : 'transparent'}` }}>
                        <div className="flex justify-between text-sm font-bold text-white"><span>{c.name}</span><span className="text-xs font-semibold" style={{ color: '#999BBE' }}>{c.role}</span></div>
                        <div className="flex gap-3 text-[11px] mt-0.5" style={{ color: '#999BBE' }}>
                          <span className="flex items-center gap-1"><Shield className="w-3 h-3" />{c.maxHp}</span>
                          <span className="flex items-center gap-1"><Swords className="w-3 h-3" />{c.damage}</span>
                          <span className="flex items-center gap-1"><Zap className="w-3 h-3" />{c.ability.name}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="space-y-1">
                  {members.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-xs" style={{ color: '#F4F3FF' }}>
                      <span className="truncate">{p.username}{p.id === socket.id ? ' (te)' : ''}{p.title ? <span className="ml-1 text-shark-gold">[{p.title}]</span> : null}</span>
                      {p.ready && <Check className="w-3.5 h-3.5 text-[#28C997]" aria-label="Kész" />}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {lobby.phase === 'playing' ? (
          <p className="text-sm text-center" style={{ color: '#999BBE' }}>Ebben a szobában épp meccs fut. A következőhöz a vége után csatlakozhatsz.</p>
        ) : (
          <button type="button" onClick={() => socket.emit('game:ready', { ready: !me.ready })} className="w-full py-3 rounded-xl font-extrabold text-white" style={{ background: me.ready ? '#28C997' : 'linear-gradient(135deg, #7655F5, #536CFF)' }}>
            {isCountdown ? 'A meccs mindjárt indul...' : me.ready ? 'Kész! (kattints a visszavonáshoz)' : 'Készen állok'}
          </button>
        )}
      </div>
    </div>
  );
}
