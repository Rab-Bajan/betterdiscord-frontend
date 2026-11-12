import React, { useState } from 'react';
import type { AdminClient } from '../lib/AdminClient';
import { btnCls, btnStyle, card, inputCls, inputStyle, type AdminMessage } from './adminStyles';

// Sakk: a szoba aktuális partijának módosítása
const PIECES: Array<{ value: string; label: string }> = [
  { value: '', label: 'Eltávolítás (üres mező)' },
  ...[['w', 'Fehér'], ['b', 'Fekete']].flatMap(([color, name]) =>
    [['k', 'Király'], ['q', 'Vezér'], ['r', 'Bástya'], ['b', 'Futó'], ['n', 'Huszár'], ['p', 'Gyalog']].map(([type, label]) => ({
      value: `${color}${type}`, label: `${name} ${label}`
    }))
  )
];

interface ChessAdminTabProps {
  admin: AdminClient;
  channelId: string | null | undefined;
}

export default function ChessAdminTab({ admin, channelId }: ChessAdminTabProps) {
  const [from, setFrom] = useState('e2');
  const [to, setTo] = useState('e5');
  const [switchTurn, setSwitchTurn] = useState(true);
  const [square, setSquare] = useState('d4');
  const [piece, setPiece] = useState('wq');
  const [turn, setTurn] = useState('w');
  const [msg, setMsg] = useState<AdminMessage>({ text: '', ok: true });

  if (!channelId) {
    return <div className="text-sm p-6 text-center rounded-xl" style={{ ...card, color: '#999BBE' }}>Lépj be egy hangszobába, ahol fut a sakk parti.</div>;
  }

  const run = async (event: string, payload: Record<string, unknown>) => {
    const res = await admin.chess(event, channelId, payload);
    setMsg(res.ok
      ? { ok: true, text: `Kész. Következő: ${res.value.turn === 'w' ? 'fehér' : 'fekete'} (${res.value.status})` }
      : { ok: false, text: res.error });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs" style={{ color: '#999BBE' }}>
        A szoba aktuális partiját módosítod. Mezők sakk-jelöléssel (a1–h8). A tábla a játékosoknál azonnal frissül.
      </p>

      <div className="rounded-xl p-3 space-y-2" style={card}>
        <strong className="text-sm" style={{ color: '#F4F3FF' }}>Szabálytalan lépés</strong>
        <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-end">
          <input className={inputCls} style={inputStyle} value={from} maxLength={2} onChange={(e) => setFrom(e.target.value.toLowerCase())} placeholder="honnan" />
          <span className="pb-2" style={{ color: '#999BBE' }}>→</span>
          <input className={inputCls} style={inputStyle} value={to} maxLength={2} onChange={(e) => setTo(e.target.value.toLowerCase())} placeholder="hova" />
          <button className={btnCls} style={btnStyle} onClick={() => { void run('admin:chess-force-move', { from, to, switchTurn }); }}>Lépés</button>
        </div>
        <label className="flex items-center gap-2 text-xs" style={{ color: '#999BBE' }}>
          <input type="checkbox" checked={switchTurn} onChange={(e) => setSwitchTurn(e.target.checked)} />
          Lépés után a másik fél jön (mint egy szabályos lépés)
        </label>
      </div>

      <div className="rounded-xl p-3 space-y-2" style={card}>
        <strong className="text-sm" style={{ color: '#F4F3FF' }}>Bábu lerakása / eltávolítása</strong>
        <div className="grid grid-cols-[80px_1fr_auto] gap-2 items-end">
          <input className={inputCls} style={inputStyle} value={square} maxLength={2} onChange={(e) => setSquare(e.target.value.toLowerCase())} placeholder="mező" />
          <select className={inputCls} style={inputStyle} value={piece} onChange={(e) => setPiece(e.target.value)}>
            {PIECES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button className={btnCls} style={btnStyle}
            onClick={() => { void run('admin:chess-put', { square, piece: piece ? { color: piece[0], type: piece[1] } : null }); }}>
            Alkalmaz
          </button>
        </div>
        <p className="text-[11px] min-w-0" style={{ color: '#999BBE' }}>Extra bábu is lehet (pl. második vezér); királyból oldalanként csak egy lehet.</p>
      </div>

      <div className="rounded-xl p-3 flex items-center gap-2" style={card}>
        <strong className="text-sm flex-1" style={{ color: '#F4F3FF' }}>Ki következik?</strong>
        <select className="px-2.5 py-1.5 rounded-lg text-sm outline-none text-white" style={inputStyle} value={turn} onChange={(e) => setTurn(e.target.value)}>
          <option value="w">Fehér</option>
          <option value="b">Fekete</option>
        </select>
        <button className={btnCls} style={btnStyle} onClick={() => { void run('admin:chess-set-turn', { turn }); }}>Beállít</button>
      </div>

      {msg.text && <div className="text-xs" style={{ color: msg.ok ? '#28C997' : '#E94B64' }}>{msg.text}</div>}
    </div>
  );
}
