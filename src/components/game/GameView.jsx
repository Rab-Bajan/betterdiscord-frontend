import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Shield, Swords, Trophy, Zap } from 'lucide-react';
import { useSocketEvents } from '../../hooks/useSocketEvents';
import GameClient, { QUALITY_PRESETS } from '../../game/GameClient';
import GameMenu, { MENU_TABS } from './GameMenu';

const QUALITY_KEY = 'sudswar_quality';
const VOICE_KEY = 'sudswar_voice';
const IS_TOUCH = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
const PROXIMITY_FULL = 8;
const PROXIMITY_ZERO = 45;
const readStored = (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
const SIDE_NAMES = { players: 'A csapat', survivor: 'Túlélők', infected: 'Fertőzöttek', a: 'A oldal', b: 'B oldal' };
const REASON_TEXT = { abandoned: 'A meccs idő előtt véget ért, jutalom nem jár.', wiped: 'Mindenki elesett.', boss_dead: 'A főellenség legyőzve!', core_destroyed: 'A mag leomlott.', objectives: 'A pontok tartásával.', goal: 'A cél teljesült.' };
const ITEM_NAMES = { boost: 'Turbó', mine: 'Akna', rocket: 'Rakéta' };

const sideLabel = (side, players, factions) => {
  if (factions[side]) return factions[side].name;
  if (SIDE_NAMES[side]) return SIDE_NAMES[side];
  const owner = players.find((p) => p.side === side);
  return owner?.username || side;
};

const readQuality = () => {
  try {
    const value = localStorage.getItem(QUALITY_KEY);
    return QUALITY_PRESETS[value] ? value : 'medium';
  } catch {
    return 'medium';
  }
};

const card = { background: '#151832', border: '1px solid rgba(125, 105, 255, 0.18)' };
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function TouchControls({ clientRef }) {
  const stick = useRef({ id: null, x: 0, y: 0 });
  const look = useRef({ id: null, x: 0, y: 0 });
  const [knob, setKnob] = useState([0, 0]);
  const touch = () => clientRef.current?.touch;

  const stickMove = (e) => {
    const t = [...e.changedTouches].find((q) => q.identifier === stick.current.id);
    if (!t || !touch()) return;
    const dx = Math.max(-50, Math.min(50, t.clientX - stick.current.x));
    const dy = Math.max(-50, Math.min(50, t.clientY - stick.current.y));
    setKnob([dx, dy]);
    touch().mx = dx / 50;
    touch().mz = -dy / 50;
  };
  const stickEnd = () => {
    stick.current.id = null;
    setKnob([0, 0]);
    if (touch()) Object.assign(touch(), { mx: 0, mz: 0 });
  };
  const hold = (key) => ({
    onTouchStart: (e) => { e.preventDefault(); e.stopPropagation(); if (touch()) touch()[key] = true; },
    onTouchEnd: (e) => { e.preventDefault(); e.stopPropagation(); if (touch()) touch()[key] = false; }
  });
  const round = 'w-14 h-14 rounded-full flex items-center justify-center text-xs font-extrabold text-white';
  const glass = { background: 'rgba(118,85,245,0.45)', border: '1px solid rgba(255,255,255,0.3)' };

  return (
    <div
      className="absolute inset-0"
      style={{ touchAction: 'none' }}
      onTouchStart={(e) => { const t = e.changedTouches[0]; if (look.current.id === null) look.current = { id: t.identifier, x: t.clientX, y: t.clientY }; }}
      onTouchMove={(e) => {
        const t = [...e.changedTouches].find((q) => q.identifier === look.current.id);
        if (!t) return;
        clientRef.current?.look(t.clientX - look.current.x, t.clientY - look.current.y);
        look.current.x = t.clientX;
        look.current.y = t.clientY;
      }}
      onTouchEnd={() => { look.current.id = null; }}
    >
      <div
        className="absolute bottom-20 left-5 w-28 h-28 rounded-full"
        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.25)' }}
        onTouchStart={(e) => { e.stopPropagation(); const t = e.changedTouches[0]; stick.current = { id: t.identifier, x: t.clientX, y: t.clientY }; }}
        onTouchMove={(e) => { e.stopPropagation(); stickMove(e); }}
        onTouchEnd={(e) => { e.stopPropagation(); stickEnd(); }}
      >
        <div className="absolute w-12 h-12 rounded-full left-8 top-8" style={{ background: 'rgba(255,255,255,0.35)', transform: `translate(${knob[0] / 2}px, ${knob[1] / 2}px)` }} />
      </div>
      <div className="absolute bottom-20 right-4 grid grid-cols-2 gap-2">
        <button type="button" className={round} style={glass} {...hold('jump')}>UGR</button>
        <button type="button" className={round} style={glass} {...hold('fire')}>TŰZ</button>
        <button type="button" className={round} style={glass} {...hold('interact')}>E</button>
        <button type="button" className={round} style={glass} onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); clientRef.current?.triggerAbility(); }}>Q</button>
        <button type="button" className={`${round} col-span-2 w-full`} style={glass} {...hold('sprint')}>SPRINT</button>
      </div>
    </div>
  );
}

function ModeHud({ hud, info }) {
  const m = hud.modeHud;
  const box = 'px-3 py-1.5 rounded-xl text-xs font-bold';
  const bg = { background: 'rgba(9,10,24,0.72)' };
  if (info.mode === 'boss' && m) {
    const ratio = (m.bossHp / m.bossMax) * 100;
    return (
      <div className="absolute top-14 left-1/2 -translate-x-1/2 w-96 max-w-[80%] p-2 rounded-xl" style={bg}>
        <div className="flex justify-between text-xs font-extrabold mb-1"><span>{m.boss}</span><span>{m.phase}. fázis</span></div>
        <div className="h-3 rounded-full overflow-hidden" style={{ background: '#1B2040' }}><div className="h-full" style={{ width: `${ratio}%`, background: '#E94B64' }} /></div>
      </div>
    );
  }
  if (info.mode === 'survival' && m) return <div className={`absolute top-14 left-1/2 -translate-x-1/2 ${box}`} style={bg}>{m.wave}. hullám · {m.enemies} ellenfél</div>;
  if (info.mode === 'royale' && m) return <div className={`absolute top-14 left-1/2 -translate-x-1/2 ${box}`} style={bg}>Életben: {m.alive} · Páncél: {hud.armor}{hud.item ? ` · ${info.weapons[hud.item]?.name || ''}` : ''}</div>;
  if (info.mode === 'infection') return <div className={`absolute top-14 left-1/2 -translate-x-1/2 ${box}`} style={{ ...bg, color: hud.side === 'infected' ? '#a3e635' : '#7dd3fc' }}>{hud.side === 'infected' ? 'Fertőzött vagy! Vadászd le a túlélőket.' : 'Túlélő vagy! Bírd ki a végéig.'}</div>;
  if (info.mode === 'clan_wars' && m) return <div className={`absolute top-14 left-1/2 -translate-x-1/2 ${box}`} style={bg}>Nyersanyag A: {m.resources.a} · B: {m.resources.b} · Pontok: {m.nodes.map(([, o]) => o || '–').join(' ')}</div>;
  if (info.mode === 'racing' && m) {
    const pos = m.rank.indexOf(info.you) + 1;
    return (
      <>
        <div className="absolute top-14 left-3 px-3 py-2 rounded-xl text-sm font-extrabold" style={bg}>{pos}. hely · {Math.min(hud.lap + 1, m.laps)}/{m.laps} kör</div>
        {m.startIn > 0 && <div className="absolute inset-0 flex items-center justify-center text-7xl font-black">{m.startIn}</div>}
        <div className="absolute bottom-16 right-3 p-2 rounded-xl w-44 text-xs font-bold" style={bg}>
          <div>{Math.round(hud.speed * 3.6)} km/h</div>
          <div className="h-2 rounded-full mt-1 overflow-hidden" style={{ background: '#1B2040' }}><div className="h-full" style={{ width: `${hud.nitro}%`, background: '#22d3ee' }} /></div>
          <div className="mt-1">Tárgy: {ITEM_NAMES[hud.item] || 'nincs'}</div>
        </div>
      </>
    );
  }
  return null;
}

function Hud({ hud, info, speaking }) {
  if (!hud) return null;
  const teamColor = (team) => (team ? info.factions[team]?.color : '#ffffff') || '#ffffff';
  const me = info.players[info.you];
  const ability = info.characters[me.characterId].ability;
  const hpPct = (hud.hp / hud.maxHp) * 100;
  const scoreEntries = Object.entries(hud.score);
  const isRace = info.flags.vehicle;

  return (
    <div className="absolute inset-0 pointer-events-none text-white select-none">
      {hud.damaged && <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 90px rgba(233,75,100,0.65)' }} />}

      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-1.5 rounded-xl font-extrabold" style={{ background: 'rgba(9,10,24,0.72)' }}>
        {!isRace && scoreEntries.slice(0, 1).map(([k, v]) => <span key={k} className="text-xl" style={{ color: teamColor(k) }}>{v}</span>)}
        <span className="text-xs font-mono" style={{ color: '#F4F3FF' }}>{mmss(hud.timeLeft)}</span>
        {!isRace && scoreEntries.slice(1, 2).map(([k, v]) => <span key={k} className="text-xl" style={{ color: teamColor(k) }}>{v}</span>)}
      </div>

      <ModeHud hud={hud} info={info} />

      {hud.announcement && <div className="absolute top-1/4 left-1/2 -translate-x-1/2 text-2xl font-black text-center" style={{ textShadow: '0 2px 8px #000' }}>{hud.announcement}</div>}

      <div className="absolute top-3 right-3 space-y-1 text-xs font-semibold text-right">
        {hud.feed.map((f) => (
          <div key={f.id} className="px-2 py-1 rounded-lg" style={{ background: 'rgba(9,10,24,0.72)' }}>
            <span style={{ color: teamColor(f.killerTeam) }}>{f.killer}</span> {f.verb} <span style={{ color: teamColor(f.victimTeam) }}>{f.victim}</span>
          </div>
        ))}
      </div>

      {speaking.length > 0 && <div className="absolute top-14 right-3 text-xs font-semibold text-right" style={{ color: '#6ee7b7' }}>{speaking.map((n) => <div key={n}>🎙️ {n}</div>)}</div>}

      {!isRace && !hud.spectating && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: hud.hitMarker ? '#E94B64' : '#ffffff', boxShadow: '0 0 3px #000', transform: hud.hitMarker ? 'scale(2)' : undefined }} />
        </div>
      )}

      {!isRace && (
        <>
          <div className="absolute bottom-3 left-3 w-56 p-2.5 rounded-xl" style={{ background: 'rgba(9,10,24,0.72)' }}>
            <div className="flex justify-between text-xs font-bold mb-1">
              <span>{info.characters[me.characterId].name}</span>
              <span>{hud.hp} / {hud.maxHp}</span>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background: '#1B2040' }}>
              <div className="h-full" style={{ width: `${hpPct}%`, background: hpPct > 35 ? '#28C997' : '#E94B64' }} />
            </div>
          </div>
          <div className="absolute bottom-3 right-3 px-3 py-2 rounded-xl text-xs font-bold text-center" style={{ background: 'rgba(9,10,24,0.72)', opacity: hud.abilityCooldown > 0 ? 0.65 : 1 }}>
            <div>[Q] {ability.name}</div>
            <div style={{ color: hud.abilityCooldown > 0 ? '#999BBE' : '#28C997' }}>{hud.abilityCooldown > 0 ? `${hud.abilityCooldown.toFixed(1)} mp` : 'Kész'}</div>
          </div>
        </>
      )}

      {!hud.alive && !hud.downed && !hud.eliminated && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: 'rgba(9,10,24,0.45)' }}>
          <div className="text-2xl font-extrabold">Elmostak!</div>
          <div className="text-sm mt-1">Újraéledés: {Math.ceil(hud.respawnIn)} mp</div>
        </div>
      )}

      {hud.downed && (
        <div className="absolute inset-x-0 top-1/3 text-center">
          <div className="text-2xl font-extrabold">Földre kerültél!</div>
          <div className="text-sm mt-1">A csapattársad E-vel felsegíthet{hud.revive > 0 ? `: ${hud.revive.toFixed(1)} / 2.5 mp` : ''}</div>
        </div>
      )}

      {hud.eliminated && (
        <div className="absolute inset-x-0 top-20 text-center">
          <div className="text-xl font-extrabold">Kiestél, {hud.place}. hely</div>
          {hud.spectating && <div className="text-sm mt-1">Nézed: {hud.spectating} · kattints a váltáshoz</div>}
        </div>
      )}

      {!IS_TOUCH && (hud.paused || !hud.locked) && hud.alive && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-xs font-semibold" style={{ background: 'rgba(9,10,24,0.82)' }}>
          {isRace ? 'W gáz · S fék · A/D kormány · Shift nitró · Q tárgy · Tab eredmények · Esc menü' : 'Kattints a játékba az egérrel irányításhoz. WASD mozgás · Space ugrás · Shift sprint · Bal klikk lövés · Q képesség · E interakció · T emote · Tab eredmények · Esc menü'}
        </div>
      )}

      {hud.showScoreboard && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 p-3 rounded-xl w-80 max-w-[90%] max-h-[70%] overflow-y-auto" style={{ background: 'rgba(9,10,24,0.9)' }}>
          {[...hud.board].sort((a, b) => b.kills - a.kills).map((p) => (
            <div key={p.i} className="flex justify-between text-xs py-0.5" style={{ opacity: p.connected ? 1 : 0.45 }}>
              <span className="truncate" style={{ color: teamColor(p.team) }}>{p.username}</span>
              <span className="font-mono">{p.kills} / {p.deaths}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Results({ result, onBack }) {
  const { factions } = result;
  const myRewards = result.rewards?.[result.youIndex];
  const me = result.players.find((p) => p.i === result.youIndex);
  const label = (side) => sideLabel(side, result.players, factions);
  let title = result.winner ? `${label(result.winner)} győzött!` : 'Nincs győztes';
  if (result.mode === 'boss') title = result.winner ? 'A főellenség legyőzve!' : 'Lejárt az idő';
  if (result.mode === 'survival') title = `Túlélt hullámok: ${result.waves}`;
  const ordered = result.mode === 'racing' || result.mode === 'royale' ? [...result.players].sort((a, b) => (a.place || 99) - (b.place || 99)) : [...result.players].sort((a, b) => b.kills - a.kills);
  return (
    <div className="flex-1 overflow-y-auto p-4 flex justify-center">
      <div className="w-full max-w-xl rounded-2xl p-5 h-fit" style={card}>
        <div className="flex items-center gap-2 mb-1">
          <Trophy className="w-6 h-6 text-amber-400" />
          <h2 className="text-xl font-extrabold text-white">{title}</h2>
        </div>
        <p className="text-sm mb-3" style={{ color: '#999BBE' }}>
          {me?.outcome === 'win' ? 'Győztél! ' : ''}{me?.place ? `${me.place}. hely. ` : ''}{REASON_TEXT[result.reason] || ''}
        </p>
        <table className="w-full text-sm text-left mb-3" style={{ color: '#F4F3FF' }}>
          <thead><tr style={{ color: '#999BBE' }} className="text-xs"><th className="py-1">Játékos</th><th>Ölés</th><th>Halál</th><th>Asszt</th><th>Sebzés</th></tr></thead>
          <tbody>
            {ordered.map((p) => (
              <tr key={p.i}><td className="py-0.5" style={{ color: factions[p.team].color }}>{p.place ? `${p.place}. ` : ''}{p.username}</td><td>{p.kills}</td><td>{p.deaths}</td><td>{p.assists}</td><td>{p.damage}</td></tr>
            ))}
          </tbody>
        </table>
        {!result.rewardsSaved && <p className="text-sm mb-3" style={{ color: '#E94B64' }}>A meccs eredményét nem sikerült elmenteni, ezért nem kaptál jutalmat.</p>}
        {result.rewardsSaved && myRewards && (
          <p className="text-sm mb-3 font-semibold" style={{ color: '#28C997' }}>
            +{myRewards.xp} XP · +{myRewards.coins || 0} érme · {myRewards.level}. szint{myRewards.leveledUp ? ' · Szintlépés!' : ''}
            {myRewards.xp === 0 && <span style={{ color: '#999BBE' }}> (rövid vagy üres meccsért nem jár jutalom)</span>}
            {myRewards.achievements?.length > 0 && <span className="block">🏆 Új eredmény! Nézd meg a Küldetések fülön.</span>}
          </p>
        )}
        {result.rewardsSaved && !myRewards && <p className="text-sm mb-3" style={{ color: '#999BBE' }}>Vendégként nem gyűjtesz jutalmat, ehhez jelentkezz be.</p>}
        <button type="button" onClick={onBack} className="w-full py-2.5 rounded-xl font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg, #7655F5, #536CFF)' }}>Vissza a lobbiba</button>
      </div>
    </div>
  );
}

function Lobby({ lobby, catalog, socket, profile, error, notice, onSwitchLobby }) {
  const me = lobby.players.find((p) => p.id === socket.id);
  if (!me) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#7655F5]" /></div>;

  const setLoadout = (team, characterId) => socket.emit('game:set-loadout', { team, characterId });
  const currentMode = catalog.modes.find((m) => m.id === lobby.mode);
  const isPublic = lobby.channelId.startsWith('public:');
  const canChangeMode = !isPublic && !lobby.battle && lobby.phase !== 'playing';
  const setMode = (mode, options = {}) => socket.emit('game:set-mode', { mode, options });
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
          <p className="text-xs" style={{ color: '#c7d2fe' }}>{lobby.battle ? `Területi csata: ${lobby.battle.territory}` : currentMode?.description}</p>
          {canChangeMode && lobby.mode === 'boss' && (
            <div className="flex gap-2 text-xs">
              <select aria-label="Főellenség" value={lobby.modeOptions.bossId || currentMode.options.bosses[0]} onChange={(e) => setMode('boss', { ...lobby.modeOptions, bossId: e.target.value })} className="px-2 py-1 rounded-lg" style={selectStyle}>{currentMode.options.bosses.map((id) => <option key={id} value={id}>{catalog.npcDefs[id].name}</option>)}</select>
              <select aria-label="Nehézség" value={lobby.modeOptions.difficulty || 'normal'} onChange={(e) => setMode('boss', { ...lobby.modeOptions, difficulty: e.target.value })} className="px-2 py-1 rounded-lg" style={selectStyle}>{Object.entries(catalog.difficulties).map(([id, d]) => <option key={id} value={id}>{d.label}</option>)}</select>
            </div>
          )}
          {canChangeMode && lobby.mode === 'racing' && (
            <select aria-label="Pálya" value={lobby.modeOptions.trackId || currentMode.options.tracks[0]} onChange={(e) => setMode('racing', { trackId: e.target.value })} className="px-2 py-1 rounded-lg text-xs" style={selectStyle}>{Object.entries(catalog.tracks).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
          )}
        </div>

        {error && <div className="px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: 'rgba(233,75,100,0.15)', color: '#fca5a5' }}>{error}</div>}
        {!error && notice && <div className="px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: 'rgba(240,178,50,0.14)', color: '#fde68a' }}>{notice}</div>}

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
                      <span className="truncate">{p.username}{p.id === socket.id ? ' (te)' : ''}{p.title ? <span className="ml-1 text-amber-300">[{p.title}]</span> : null}</span>
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

export default function GameView({ socket, channelId, isAdmin = false, participants = [], setPeerVolume }) {
  const [lobby, setLobby] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [profile, setProfile] = useState(null);
  const [matchInfo, setMatchInfo] = useState(null);
  const [result, setResult] = useState(null);
  const [hud, setHud] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [connected, setConnected] = useState(socket.connected);
  const [quality, setQuality] = useState(readQuality);
  const [voiceMode, setVoiceMode] = useState(() => readStored(VOICE_KEY, 'all'));
  const [tab, setTab] = useState('play');
  const [otherLobby, setOtherLobby] = useState(null);
  const [toast, setToast] = useState(null);

  const activeLobby = otherLobby || channelId;
  const canvasHostRef = useRef(null);
  const clientRef = useRef(null);
  const matchRef = useRef(null);
  matchRef.current = matchInfo;
  
  const showError = (message) => {
    setError(message);
    setTimeout(() => setError(null), 5000);
  };

  useEffect(() => {
    const join = () => {
      socket.emit('game:lobby-join', { channelId: activeLobby });
      socket.emit('game:get-profile');
    };
    if (socket.connected) join();
    socket.on('connect', join);
    return () => {
      socket.off('connect', join);
      socket.emit('game:lobby-leave');
    };
  }, [socket, activeLobby]);

  useSocketEvents(socket, {
    connect: () => setConnected(true),
    disconnect: () => setConnected(false),
    'game:lobby': setLobby,
    'game:catalog': setCatalog,
    'game:profile': setProfile,
    'game:private-created': ({ channelId: id }) => setOtherLobby(id),
    'game:notify': (n) => {
      if (!n.text) return;
      setToast(n);
      setTimeout(() => setToast(null), 8000);
    },
    'game:error': ({ message }) => {
      showError(message);
      if (message.includes('privát lobbi')) setOtherLobby(null);
    },
    'game:notice': ({ message }) => {
      setNotice(message);
      setTimeout(() => setNotice(null), 4000);
    },
    'game:match-start': (info) => {
      setResult(null);
      setHud(null);
      setMatchInfo(info);
    },
    'game:snapshot': (snapshot) => clientRef.current?.onSnapshot(snapshot),
    'game:events': (events) => clientRef.current?.onEvents(events),
    'game:match-end': (end) => {
      const info = matchRef.current;
      setResult({ ...end, youIndex: info?.you, factions: info?.factions });
      setMatchInfo(null);
      socket.emit('game:get-profile');
    },
    'game:match-aborted': ({ message }) => {
      setMatchInfo(null);
      showError(message);
    }
  });

  // Egy futó meccshez egy renderelő tartozik, kilépéskor minden GPU erőforrás felszabadul
  useEffect(() => {
    if (!matchInfo || !canvasHostRef.current) return undefined;
    let client;
    try {
      client = new GameClient(canvasHostRef.current, socket, matchInfo, setHud, quality);
    } catch (err) {
      console.error('[Game] WebGL indítási hiba:', err);
      showError('A 3D megjelenítést nem sikerült elindítani ezen az eszközön.');
      setMatchInfo(null);
      return undefined;
    }
    clientRef.current = client;
    return () => {
      clientRef.current = null;
      client.dispose();
    };
  }, [matchInfo, socket]);

  // Csapat- és közelségi hang: csak a már meglévő hangkapcsolat hangerejét állítja, a kapcsolathoz nem nyúl
  useEffect(() => {
    if (!matchInfo || !setPeerVolume) return undefined;
    const players = matchInfo.players.filter((p) => p.sid && p.i !== matchInfo.you);
    const timer = setInterval(() => {
      const list = clientRef.current?.voiceDistances() || [];
      const mine = list[matchInfo.you];
      for (const entry of list) {
        if (!entry.sid || entry === mine) continue;
        let volume = 1;
        if (voiceMode === 'team' && !matchInfo.flags.ffa) volume = entry.side === mine?.side ? 1 : 0;
        if (voiceMode === 'proximity') volume = Math.max(0, Math.min(1, 1 - (entry.distance - PROXIMITY_FULL) / (PROXIMITY_ZERO - PROXIMITY_FULL)));
        setPeerVolume(entry.sid, volume);
      }
    }, 250);
    return () => {
      clearInterval(timer);
      players.forEach((p) => setPeerVolume(p.sid, 1));
    };
  }, [matchInfo, voiceMode, setPeerVolume]);

  const changeQuality = (value) => {
    setQuality(value);
    try {
      localStorage.setItem(QUALITY_KEY, value);
    } catch {
      // csak kényelmi beállítás
    }
  };
  const changeVoice = (value) => {
    setVoiceMode(value);
    try {
      localStorage.setItem(VOICE_KEY, value);
    } catch {
      // csak kényelmi beállítás
    }
  };

  const joinBattle = (battleId) => {
    setTab('play');
    socket.emit('game:set-mode', { mode: 'team_deathmatch', options: { battleId } });
  };

  const speaking = matchInfo ? participants.filter((p) => p.isSpeaking).map((p) => p.username) : [];

  if (matchInfo) {
    return (
      <div className="flex-1 relative min-h-0 overflow-hidden" style={{ background: '#141a33' }}>
        <div ref={canvasHostRef} className="absolute inset-0" />
        <Hud hud={hud} info={matchInfo} speaking={speaking} />
        {IS_TOUCH && <TouchControls clientRef={clientRef} />}
        {!connected && (
          <div className="absolute inset-x-0 top-14 flex justify-center pointer-events-none">
            <div className="px-4 py-2 rounded-xl text-xs font-bold text-white" style={{ background: '#E94B64' }}>Megszakadt a kapcsolat, újracsatlakozás...</div>
          </div>
        )}
      </div>
    );
  }

  if (result?.factions) return <Results result={result} onBack={() => setResult(null)} />;

  if (!lobby || !catalog) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        {error ? <p className="text-sm" style={{ color: '#fca5a5' }}>{error}</p> : <Loader2 className="w-6 h-6 animate-spin text-[#7655F5]" />}
      </div>
    );
  }

  const tabs = [['play', 'Játék'], ...MENU_TABS, ...(isAdmin ? [['admin', 'Admin']] : [])];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex gap-1 p-2 overflow-x-auto flex-shrink-0" style={{ background: '#101329' }}>
        {tabs.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className="px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap" style={{ background: tab === id ? '#7655F5' : 'transparent', color: tab === id ? '#fff' : '#999BBE' }}>{label}</button>
        ))}
      </div>
      {toast && (
        <div className="mx-3 mt-2 px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between gap-2" style={{ background: 'rgba(118,85,245,0.2)', color: '#c7d2fe' }}>
          <span>{toast.text}</span>
          {toast.lobbyId && <button type="button" onClick={() => { setOtherLobby(toast.lobbyId); setToast(null); setTab('play'); }} className="px-2 py-1 rounded-lg font-bold text-white" style={{ background: '#7655F5' }}>Csatlakozás</button>}
        </div>
      )}
      {tab === 'play' ? (
        <Lobby lobby={lobby} catalog={catalog} socket={socket} profile={profile} error={error} notice={notice} onSwitchLobby={setOtherLobby} />
      ) : (
        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          <div className="max-w-4xl mx-auto">
            <GameMenu tab={tab} socket={socket} factions={catalog.factions} lobbyId={activeLobby} onJoinBattle={joinBattle} quality={quality} onQuality={changeQuality} voiceMode={voiceMode} onVoiceMode={changeVoice} />
          </div>
        </div>
      )}
    </div>
  );
}
