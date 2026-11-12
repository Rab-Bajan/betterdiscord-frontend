import React from 'react';
import { IS_TOUCH, ITEM_NAMES, mmss } from '../lib/arenaLabels';
import type { HudState, MatchInfo } from '../types';

interface ArenaHudProps {
  hud: HudState | null;
  info: MatchInfo;
  /** Names of players speaking in voice chat. */
  speaking: string[];
}

// Módfüggő kijelzés: főellenség, hullám, zóna, fertőzés, klánháború, verseny
function ModeHud({ hud, info }: { hud: HudState; info: MatchInfo }) {
  const m = hud.modeHud;
  const box = 'px-3 py-1.5 rounded-xl text-xs font-bold';
  const bg = { background: 'rgba(9,10,24,0.72)' };
  if (info.mode === 'boss' && m) {
    const ratio = (Number(m.bossHp) / Number(m.bossMax)) * 100;
    return (
      <div className="absolute top-14 left-1/2 -translate-x-1/2 w-96 max-w-[90%] p-2 rounded-xl" style={bg}>
        <div className="flex justify-between text-xs font-extrabold mb-1"><span>{m.boss}</span><span>{m.phase}. fázis</span></div>
        <div className="h-3 rounded-full overflow-hidden" style={{ background: '#1B2040' }}><div className="h-full" style={{ width: `${ratio}%`, background: '#E94B64' }} /></div>
      </div>
    );
  }
  if (info.mode === 'survival' && m) return <div className={`absolute top-14 left-1/2 -translate-x-1/2 ${box}`} style={bg}>{m.wave}. hullám · {m.enemies} ellenfél</div>;
  if (info.mode === 'royale' && m) return <div className={`absolute top-14 left-1/2 -translate-x-1/2 ${box}`} style={bg}>Életben: {m.alive} · Páncél: {hud.armor}{hud.item ? ` · ${info.weapons[hud.item]?.name || ''}` : ''}</div>;
  if (info.mode === 'infection') return <div className={`absolute top-14 left-1/2 -translate-x-1/2 ${box}`} style={{ ...bg, color: hud.side === 'infected' ? '#a3e635' : '#7dd3fc' }}>{hud.side === 'infected' ? 'Fertőzött vagy! Vadászd le a túlélőket.' : 'Túlélő vagy! Bírd ki a végéig.'}</div>;
  if (info.mode === 'clan_wars' && m) return <div className={`absolute top-14 left-1/2 -translate-x-1/2 ${box}`} style={bg}>Nyersanyag A: {m.resources?.a} · B: {m.resources?.b} · Pontok: {(m.nodes ?? []).map(([, o]) => o || '–').join(' ')}</div>;
  if (info.mode === 'racing' && m) {
    const pos = (m.rank ?? []).indexOf(info.you) + 1;
    return (
      <>
        <div className="absolute top-14 left-3 px-3 py-2 rounded-xl text-sm font-extrabold" style={bg}>{pos}. hely · {Math.min(hud.lap + 1, Number(m.laps))}/{m.laps} kör</div>
        {(m.startIn ?? 0) > 0 && <div className="absolute inset-0 flex items-center justify-center text-7xl font-black">{m.startIn}</div>}
        <div className="absolute bottom-16 right-3 p-2 rounded-xl w-44 max-w-[50%] text-xs font-bold" style={bg}>
          <div>{Math.round(hud.speed * 3.6)} km/h</div>
          <div className="h-2 rounded-full mt-1 overflow-hidden" style={{ background: '#1B2040' }}><div className="h-full" style={{ width: `${hud.nitro}%`, background: '#22d3ee' }} /></div>
          <div className="mt-1">Tárgy: {ITEM_NAMES[hud.item] || 'nincs'}</div>
        </div>
      </>
    );
  }
  return null;
}

// A meccs HUD-ja: pontszám, idő, életerő, képesség, ölésnapló, eredménytábla
export default function ArenaHud({ hud, info, speaking }: ArenaHudProps) {
  if (!hud) return null;
  const teamColor = (team: string | null | undefined): string => (team ? info.factions[team]?.color : '#ffffff') || '#ffffff';
  const me = info.players[info.you];
  const character = me ? info.characters[me.characterId] : undefined;
  if (!character) return null;
  const { ability } = character;
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

      {speaking.length > 0 && <div className="absolute top-14 right-3 text-xs font-semibold text-right" style={{ color: '#28C997' }}>{speaking.map((n) => <div key={n}>🎙️ {n}</div>)}</div>}

      {!isRace && !hud.spectating && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: hud.hitMarker ? '#E94B64' : '#ffffff', boxShadow: '0 0 3px #000', transform: hud.hitMarker ? 'scale(2)' : undefined }} />
        </div>
      )}

      {!isRace && (
        <>
          <div className="absolute bottom-3 left-3 w-56 max-w-[60%] p-2.5 rounded-xl" style={{ background: 'rgba(9,10,24,0.72)' }}>
            <div className="flex justify-between text-xs font-bold mb-1">
              <span>{character.name}</span>
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
