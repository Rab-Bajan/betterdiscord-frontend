import React, { useEffect, useRef, useState } from 'react';
import { Crown, Play, Users, Skull, Ghost, LogOut, Loader2, Lock } from 'lucide-react';

const EVIDENCE_OPTIONS = [
  { value: 3, label: '3', hint: 'Klasszikus: minden bizonyíték elérhető' },
  { value: 2, label: '2', hint: 'Nehéz: két bizonyíték, a viselkedés is számít' },
  { value: 1, label: '1', hint: 'Rémálom: egyetlen bizonyíték' }
];

const clampSanity = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

/**
 * Pre-game lobby: player list, host-only settings (evidence count, starting sanity), Start button.
 * Non-hosts see the same settings read-only.
 */
export default function LobbyScreen({
  players = [],
  hostSocketId = null,
  selfId = null,
  settings = null,
  connecting = false,
  onChangeSettings,
  onStart,
  onClose
}) {
  const isHost = !!selfId && selfId === hostSocketId;
  const evidenceCount = [1, 2, 3].includes(settings?.evidenceCount) ? settings.evidenceCount : 3;
  const startingSanity = clampSanity(settings?.startingSanity ?? 100);

  // Local slider value so dragging is smooth; commits (to the server) on release
  const [sanityDraft, setSanityDraft] = useState(startingSanity);
  const draggingRef = useRef(false);
  useEffect(() => {
    if (!draggingRef.current) setSanityDraft(startingSanity);
  }, [startingSanity]);

  const commitSanity = (v) => {
    draggingRef.current = false;
    if (isHost && onChangeSettings) onChangeSettings({ evidenceCount, startingSanity: clampSanity(v) });
  };

  const list = Array.isArray(players) ? players.filter(Boolean) : [];
  const sanityTone = sanityDraft > 50 ? 'text-emerald-400' : sanityDraft > 25 ? 'text-amber-400' : 'text-red-400';

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center p-4 select-none font-sans overflow-y-auto"
      style={{ background: 'radial-gradient(ellipse at center, rgba(12,10,24,0.82) 0%, rgba(4,4,10,0.96) 75%)' }}
    >
      <div
        className="w-full max-w-3xl rounded-3xl overflow-hidden shadow-2xl border border-purple-500/30"
        style={{ background: 'linear-gradient(150deg, #151826 0%, #0b0d17 100%)', boxShadow: '0 30px 80px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.06)' }}
      >
        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between border-b border-purple-500/20" style={{ background: 'linear-gradient(90deg, #101329, #1b1e38)' }}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center">
              <Ghost className="w-6 h-6 text-purple-300" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-purple-400 to-indigo-400">
                MISKOLCPHOBIA
              </h1>
              <p className="text-[11px] text-purple-300/70 font-mono">MÉH Telep – előszoba</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl bg-black/50 hover:bg-red-950/70 border border-gray-700 hover:border-red-500/60 text-gray-300 hover:text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              title="Vissza a szobába"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Kilépés</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
          {/* Players */}
          <section>
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-300 flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-purple-400" />
              Nyomozók
              <span className="ml-auto font-mono text-gray-500 normal-case">{list.length} / 4</span>
            </h2>
            <ul className="space-y-2 min-h-[96px]">
              {connecting && list.length === 0 && (
                <li className="flex items-center gap-2 text-xs text-gray-400 p-3 rounded-xl bg-black/30 border border-gray-800">
                  <Loader2 className="w-4 h-4 animate-spin text-purple-400" /> Csatlakozás a szerverhez...
                </li>
              )}
              {list.map((p) => {
                const id = p.id || p.socketId;
                const host = id && id === hostSocketId;
                const me = id && id === selfId;
                return (
                  <li
                    key={id || p.username}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border ${me ? 'bg-purple-950/40 border-purple-500/50' : 'bg-[#121425] border-gray-800'}`}
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0 shadow"
                      style={{ background: p.avatarColor || '#7655F5' }}
                    />
                    <span className="text-sm font-semibold text-gray-100 truncate flex-1">{p.username || 'Nyomozó'}</span>
                    {me && <span className="text-[10px] font-mono text-purple-300">te</span>}
                    {host && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-950/50 border border-amber-500/40 px-1.5 py-0.5 rounded-md">
                        <Crown className="w-3 h-3" /> Házigazda
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Settings */}
          <section className="space-y-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-300 flex items-center gap-2">
              <Skull className="w-4 h-4 text-red-400" />
              Beállítások
              {!isHost && (
                <span className="ml-auto flex items-center gap-1 text-[10px] font-medium text-gray-500 normal-case">
                  <Lock className="w-3 h-3" /> csak a házigazda módosíthatja
                </span>
              )}
            </h2>

            <div>
              <div className="text-xs text-gray-400 mb-2">Elérhető bizonyítékok száma</div>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Bizonyítékok száma">
                {EVIDENCE_OPTIONS.map((o) => {
                  const active = evidenceCount === o.value;
                  return (
                    <button
                      key={o.value}
                      role="radio"
                      aria-checked={active}
                      disabled={!isHost}
                      onClick={() => onChangeSettings && onChangeSettings({ evidenceCount: o.value, startingSanity: clampSanity(sanityDraft) })}
                      className={`py-2.5 rounded-xl border text-lg font-black transition ${
                        active
                          ? 'bg-purple-900/50 border-purple-400 text-white shadow-[0_0_18px_rgba(168,85,247,0.35)]'
                          : 'bg-[#121425] border-gray-800 text-gray-400'
                      } ${isHost ? 'hover:border-purple-500/60 cursor-pointer' : 'cursor-default opacity-80'}`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-gray-500 mt-1.5">{EVIDENCE_OPTIONS.find((o) => o.value === evidenceCount)?.hint}</p>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                <span>Kezdő épelme</span>
                <span className={`font-mono font-bold text-sm ${sanityTone}`}>{sanityDraft}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={sanityDraft}
                disabled={!isHost}
                aria-label="Kezdő épelme"
                onPointerDown={() => { draggingRef.current = true; }}
                onChange={(e) => setSanityDraft(clampSanity(e.target.value))}
                onPointerUp={(e) => commitSanity(e.currentTarget.value)}
                onKeyUp={(e) => commitSanity(e.currentTarget.value)}
                onBlur={(e) => { if (draggingRef.current) commitSanity(e.currentTarget.value); }}
                className={`w-full accent-purple-500 ${isHost ? 'cursor-pointer' : 'cursor-default opacity-70'}`}
              />
              <div className="flex justify-between text-[10px] text-gray-600 font-mono mt-0.5">
                <span>0%</span><span>50%</span><span>100%</span>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-purple-500/20 bg-black/30 flex items-center justify-between gap-4">
          <p className="text-[11px] text-gray-500 leading-snug">
            Szerelj fel a teherautónál, találd meg a szellem szobáját, gyűjts bizonyítékot és azonosítsd a szellemet.
          </p>
          {isHost ? (
            <button
              onClick={onStart}
              disabled={connecting || list.length === 0}
              className="shrink-0 px-6 py-3 rounded-2xl bg-gradient-to-r from-red-700 to-purple-700 hover:from-red-600 hover:to-purple-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm tracking-wide shadow-lg flex items-center gap-2 transition cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              Küldetés indítása
            </button>
          ) : (
            <div className="shrink-0 px-4 py-2.5 rounded-2xl bg-black/50 border border-gray-800 text-xs text-gray-400 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
              Várakozás a házigazdára...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
