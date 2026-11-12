import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import type { AdminClient } from '../lib/AdminClient';
import { buildRig, rigSelectValue } from '../lib/slotRig';
import type { CasinoPlayer } from '../types';
import { btnCls, btnStyle, card, inputCls, inputStyle } from './adminStyles';

// Kaszinó: egyenleg és slot-manipuláció játékosonként
const RIG_OPTIONS = [
  { value: '', label: 'Nincs (véletlen)' },
  { value: 'jackpot:⭐', label: 'Jackpot ⭐ ×15' },
  { value: 'jackpot:💎', label: 'Jackpot 💎 ×10' },
  { value: 'jackpot:🍇', label: 'Jackpot 🍇 ×6' },
  { value: 'jackpot:🍒', label: 'Jackpot 🍒 ×5' },
  { value: 'bonus', label: 'Bónusz ✨✨✨ (5 ingyen pörgetés)' },
  { value: 'lose', label: 'Mindig veszít' }
];

/** Unsaved form values of one player (input strings). */
type PlayerEdit = Partial<Record<'balance' | 'freeSpins' | 'rig' | 'spins', string>>;

export default function CasinoAdminTab({ admin }: { admin: AdminClient }) {
  const [players, setPlayers] = useState<CasinoPlayer[]>([]);
  const [edits, setEdits] = useState<Record<string, PlayerEdit>>({});
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const res = await admin.listCasinoPlayers();
    if (res.ok) setPlayers(res.value);
    else setMsg(res.error);
  }, [admin]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  const field = (p: CasinoPlayer, key: keyof PlayerEdit, fallback: string | number): string | number => edits[p.playerId]?.[key] ?? fallback;
  const setField = (p: CasinoPlayer, key: keyof PlayerEdit, value: string) =>
    setEdits((prev) => ({ ...prev, [p.playerId]: { ...prev[p.playerId], [key]: value } }));
  const clearEdit = (p: CasinoPlayer) => setEdits((prev) => { const n = { ...prev }; delete n[p.playerId]; return n; });

  const saveBalance = async (p: CasinoPlayer) => {
    const res = await admin.setCasinoBalance(p.playerId, Number(field(p, 'balance', p.balance)), Number(field(p, 'freeSpins', p.freeSpins)));
    setMsg(res.ok ? 'Egyenleg elmentve.' : res.error);
    if (res.ok) { clearEdit(p); void load(); }
  };

  const saveRig = async (p: CasinoPlayer) => {
    const value = String(field(p, 'rig', rigSelectValue(p.rig)));
    const spins = Number(field(p, 'spins', p.rig?.spins || 1)) || 1;
    const rig = buildRig(value, spins);
    const res = await admin.setCasinoRig(p.playerId, rig);
    setMsg(res.ok ? (rig ? `Beállítva: a következő ${spins} pörgetés fix.` : 'Pörgetés-manipuláció törölve.') : res.error);
    if (res.ok) { clearEdit(p); void load(); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: '#999BBE' }}>
          Játékosok a kaszinóban. Az egyenleg azonnal frissül nekik; a pörgetés-beállítás a következő N pörgetésre érvényes.
        </p>
        <button onClick={() => { void load(); }} className="p-2 rounded-xl flex-shrink-0" style={{ background: '#1B2040', color: '#999BBE' }} title="Frissítés">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {players.length === 0 && (
        <div className="text-sm p-6 text-center rounded-xl" style={{ ...card, color: '#999BBE' }}>
          Még senki nem lépett be a kaszinóba.
        </div>
      )}

      {players.map((p) => (
        <div key={p.playerId} className="rounded-xl p-3 space-y-2.5" style={card}>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: p.online ? '#28C997' : '#999BBE' }} />
            <strong className="text-sm" style={{ color: '#F4F3FF' }}>{p.name || 'Ismeretlen'}</strong>
            <span className="text-[10px] font-mono truncate" style={{ color: '#999BBE' }}>{p.playerId.slice(0, 12)}…</span>
            {p.rig && (
              <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(233, 75, 100, 0.15)', color: '#E94B64' }}>
                manipulált: {p.rig.mode} ×{p.rig.spins}
              </span>
            )}
          </div>

          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
            <label className="text-[11px] min-w-0" style={{ color: '#999BBE' }}>Egyenleg (kredit)
              <input type="number" min="0" className={inputCls} style={inputStyle}
                value={field(p, 'balance', p.balance)} onChange={(e) => setField(p, 'balance', e.target.value)} />
            </label>
            <label className="text-[11px] min-w-0" style={{ color: '#999BBE' }}>Ingyen pörgetés
              <input type="number" min="0" className={inputCls} style={inputStyle}
                value={field(p, 'freeSpins', p.freeSpins)} onChange={(e) => setField(p, 'freeSpins', e.target.value)} />
            </label>
            <button className={btnCls} style={btnStyle} onClick={() => { void saveBalance(p); }}>Mentés</button>
          </div>

          <div className="grid grid-cols-[1fr_80px_auto] gap-2 items-end">
            <label className="text-[11px] min-w-0" style={{ color: '#999BBE' }}>Slot manipuláció
              <select className={inputCls} style={inputStyle}
                value={field(p, 'rig', rigSelectValue(p.rig))}
                onChange={(e) => setField(p, 'rig', e.target.value)}>
                {RIG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="text-[11px] min-w-0" style={{ color: '#999BBE' }}>Pörgetés
              <input type="number" min="1" max="1000" className={inputCls} style={inputStyle}
                value={field(p, 'spins', p.rig?.spins || 1)} onChange={(e) => setField(p, 'spins', e.target.value)} />
            </label>
            <button className={btnCls} style={btnStyle} onClick={() => { void saveRig(p); }}>Alkalmaz</button>
          </div>
        </div>
      ))}
      {msg && <div className="text-xs" style={{ color: '#28C997' }}>{msg}</div>}
    </div>
  );
}
