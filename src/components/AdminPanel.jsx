import React, { useState, useEffect, useCallback } from 'react';
import { X, ShieldCheck, Dices, Crown, RefreshCw, Flag, ArrowLeft, Trash2 } from 'lucide-react';

const card = { background: '#151832', border: '1px solid rgba(125, 105, 255, 0.15)' };
const inputCls = 'px-2.5 py-1.5 rounded-lg text-sm outline-none text-white w-full';
const inputStyle = { background: '#0d0f24', border: '1px solid rgba(125, 105, 255, 0.2)' };
const btnCls = 'px-3 py-1.5 rounded-lg text-xs font-bold text-white transition active:scale-95 flex-shrink-0';
const btnStyle = { background: 'linear-gradient(135deg, #7655F5, #536CFF)' };

// socket.emit ack-kel, Promise-ként
const call = (socket, event, payload) =>
  new Promise((resolve) => socket.emit(event, payload, (res) => resolve(res || { ok: false, error: 'Nincs válasz a szervertől.' })));

const RIG_OPTIONS = [
  { value: '', label: 'Nincs (véletlen)' },
  { value: 'jackpot:⭐', label: 'Jackpot ⭐ ×15' },
  { value: 'jackpot:💎', label: 'Jackpot 💎 ×10' },
  { value: 'jackpot:🍇', label: 'Jackpot 🍇 ×6' },
  { value: 'jackpot:🍒', label: 'Jackpot 🍒 ×5' },
  { value: 'bonus', label: 'Bónusz ✨✨✨ (5 ingyen pörgetés)' },
  { value: 'lose', label: 'Mindig veszít' }
];

function CasinoTab({ socket }) {
  const [players, setPlayers] = useState([]);
  const [edits, setEdits] = useState({}); // playerId -> { balance, freeSpins, rig, spins }
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const res = await call(socket, 'admin:casino-list', {});
    if (res.ok) setPlayers(res.players);
    else setMsg(res.error);
  }, [socket]);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  const field = (p, key, fallback) => edits[p.playerId]?.[key] ?? fallback;
  const setField = (p, key, value) =>
    setEdits((prev) => ({ ...prev, [p.playerId]: { ...prev[p.playerId], [key]: value } }));
  const clearEdit = (p) => setEdits((prev) => { const n = { ...prev }; delete n[p.playerId]; return n; });

  const saveBalance = async (p) => {
    const res = await call(socket, 'admin:casino-set-balance', {
      playerId: p.playerId,
      balance: Number(field(p, 'balance', p.balance)),
      freeSpins: Number(field(p, 'freeSpins', p.freeSpins))
    });
    setMsg(res.ok ? 'Egyenleg elmentve.' : res.error);
    if (res.ok) { clearEdit(p); load(); }
  };

  const saveRig = async (p) => {
    const value = field(p, 'rig', p.rig ? (p.rig.mode === 'jackpot' ? `jackpot:${p.rig.symbols[0]}` : p.rig.mode) : '');
    const spins = Number(field(p, 'spins', p.rig?.spins || 1)) || 1;
    let rig = null;
    if (value.startsWith('jackpot:')) rig = { mode: 'jackpot', symbols: [value.split(':')[1]], spins };
    else if (value) rig = { mode: value, spins };
    const res = await call(socket, 'admin:casino-set-rig', { playerId: p.playerId, rig });
    setMsg(res.ok ? (rig ? `Beállítva: a következő ${spins} pörgetés fix.` : 'Pörgetés-manipuláció törölve.') : res.error);
    if (res.ok) { clearEdit(p); load(); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: '#999BBE' }}>
          Játékosok a kaszinóban. Az egyenleg azonnal frissül nekik; a pörgetés-beállítás a következő N pörgetésre érvényes.
        </p>
        <button onClick={load} className="p-1.5 rounded-lg" style={{ background: '#1B2040', color: '#999BBE' }} title="Frissítés">
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
            <span className="w-2 h-2 rounded-full" style={{ background: p.online ? '#28C997' : '#666' }} />
            <strong className="text-sm" style={{ color: '#F4F3FF' }}>{p.name || 'Ismeretlen'}</strong>
            <span className="text-[10px] font-mono truncate" style={{ color: '#666A90' }}>{p.playerId.slice(0, 12)}…</span>
            {p.rig && (
              <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(233, 75, 100, 0.15)', color: '#E94B64' }}>
                manipulált: {p.rig.mode} ×{p.rig.spins}
              </span>
            )}
          </div>

          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
            <label className="text-[11px]" style={{ color: '#999BBE' }}>Egyenleg (kredit)
              <input type="number" min="0" className={inputCls} style={inputStyle}
                value={field(p, 'balance', p.balance)} onChange={(e) => setField(p, 'balance', e.target.value)} />
            </label>
            <label className="text-[11px]" style={{ color: '#999BBE' }}>Ingyen pörgetés
              <input type="number" min="0" className={inputCls} style={inputStyle}
                value={field(p, 'freeSpins', p.freeSpins)} onChange={(e) => setField(p, 'freeSpins', e.target.value)} />
            </label>
            <button className={btnCls} style={btnStyle} onClick={() => saveBalance(p)}>Mentés</button>
          </div>

          <div className="grid grid-cols-[1fr_80px_auto] gap-2 items-end">
            <label className="text-[11px]" style={{ color: '#999BBE' }}>Slot manipuláció
              <select className={inputCls} style={inputStyle}
                value={field(p, 'rig', p.rig ? (p.rig.mode === 'jackpot' ? `jackpot:${p.rig.symbols[0]}` : p.rig.mode) : '')}
                onChange={(e) => setField(p, 'rig', e.target.value)}>
                {RIG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="text-[11px]" style={{ color: '#999BBE' }}>Pörgetés
              <input type="number" min="1" max="1000" className={inputCls} style={inputStyle}
                value={field(p, 'spins', p.rig?.spins || 1)} onChange={(e) => setField(p, 'spins', e.target.value)} />
            </label>
            <button className={btnCls} style={btnStyle} onClick={() => saveRig(p)}>Alkalmaz</button>
          </div>
        </div>
      ))}
      {msg && <div className="text-xs" style={{ color: '#28C997' }}>{msg}</div>}
    </div>
  );
}

const PIECES = [
  { value: '', label: 'Eltávolítás (üres mező)' },
  ...[['w', 'Fehér'], ['b', 'Fekete']].flatMap(([color, name]) =>
    [['k', 'Király'], ['q', 'Vezér'], ['r', 'Bástya'], ['b', 'Futó'], ['n', 'Huszár'], ['p', 'Gyalog']].map(([type, label]) => ({
      value: `${color}${type}`, label: `${name} ${label}`
    }))
  )
];

function ChessTab({ socket, channelId }) {
  const [from, setFrom] = useState('e2');
  const [to, setTo] = useState('e5');
  const [switchTurn, setSwitchTurn] = useState(true);
  const [square, setSquare] = useState('d4');
  const [piece, setPiece] = useState('wq');
  const [turn, setTurn] = useState('w');
  const [msg, setMsg] = useState({ text: '', ok: true });

  const run = async (event, payload) => {
    const res = await call(socket, event, { channelId, ...payload });
    setMsg({ ok: res.ok, text: res.ok ? `Kész. Következő: ${res.turn === 'w' ? 'fehér' : 'fekete'} (${res.status})` : res.error });
  };

  if (!channelId) {
    return <div className="text-sm p-6 text-center rounded-xl" style={{ ...card, color: '#999BBE' }}>Lépj be egy hangszobába, ahol fut a sakk parti.</div>;
  }

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
          <button className={btnCls} style={btnStyle} onClick={() => run('admin:chess-force-move', { from, to, switchTurn })}>Lépés</button>
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
            onClick={() => run('admin:chess-put', { square, piece: piece ? { color: piece[0], type: piece[1] } : null })}>
            Alkalmaz
          </button>
        </div>
        <p className="text-[11px]" style={{ color: '#666A90' }}>Extra bábu is lehet (pl. második vezér); királyból oldalanként csak egy lehet.</p>
      </div>

      <div className="rounded-xl p-3 flex items-center gap-2" style={card}>
        <strong className="text-sm flex-1" style={{ color: '#F4F3FF' }}>Ki következik?</strong>
        <select className="px-2.5 py-1.5 rounded-lg text-sm outline-none text-white" style={inputStyle} value={turn} onChange={(e) => setTurn(e.target.value)}>
          <option value="w">Fehér</option>
          <option value="b">Fekete</option>
        </select>
        <button className={btnCls} style={btnStyle} onClick={() => run('admin:chess-set-turn', { turn })}>Beállít</button>
      </div>

      {msg.text && <div className="text-xs" style={{ color: msg.ok ? '#28C997' : '#E94B64' }}>{msg.text}</div>}
    </div>
  );
}

// DM moderáció: csak jelentett üzenetek, és csak azok környéke látható
function ModerationTab({ socket }) {
  const [reports, setReports] = useState([]);
  const [open, setOpen] = useState(null); // { report, messages }
  const [msg, setMsg] = useState({ text: '', ok: true });

  const load = useCallback(async () => {
    const res = await call(socket, 'admin:dm-reports', {});
    if (res.ok) setReports(res.reports);
    else setMsg({ ok: false, text: res.error });
  }, [socket]);

  useEffect(() => { load(); }, [load]);

  const openReport = async (id) => {
    const res = await call(socket, 'admin:dm-report-context', { reportId: id });
    if (res.ok) { setOpen(res); setMsg({ text: '', ok: true }); }
    else setMsg({ ok: false, text: res.error });
  };

  const removeMessage = async (messageId) => {
    if (!window.confirm('Eltávolítod ezt az üzenetet? Mindkét félnél "admin eltávolította" jelzés látszik majd helyette.')) return;
    const res = await call(socket, 'admin:dm-remove-message', { reportId: open.report.id, messageId });
    if (res.ok) {
      setOpen((o) => ({ ...o, messages: o.messages.map((m) => (m.id === messageId ? { ...m, text: '', attachments: [], removedByAdmin: true } : m)) }));
      setMsg({ ok: true, text: 'Üzenet eltávolítva.' });
    } else setMsg({ ok: false, text: res.error });
  };

  const resolve = async () => {
    const res = await call(socket, 'admin:dm-resolve', { reportId: open.report.id });
    if (res.ok) { setOpen(null); setMsg({ ok: true, text: 'Jelentés lezárva.' }); load(); }
    else setMsg({ ok: false, text: res.error });
  };

  if (open) {
    return (
      <div className="space-y-3">
        <button onClick={() => setOpen(null)} className="flex items-center gap-1.5 text-xs" style={{ color: '#999BBE' }}>
          <ArrowLeft className="w-3.5 h-3.5" /> Vissza a jelentésekhez
        </button>
        <div className="rounded-xl p-3 text-xs space-y-1" style={card}>
          <div style={{ color: '#F4F3FF' }}><strong>{open.report.reporter}</strong> jelentette az üzenetet</div>
          {open.report.reason && <div style={{ color: '#999BBE' }}>Indok: „{open.report.reason}”</div>}
          <div style={{ color: '#666A90' }}>Csak a jelentett üzenet és a környező üzenetek láthatók. A megnyitás naplózódik.</div>
        </div>

        <div className="space-y-1.5">
          {open.messages.map((m) => {
            const reported = m.id === open.report.reportedMessageId;
            return (
              <div key={m.id} className="rounded-lg px-3 py-2 flex items-start gap-2 group"
                style={{ background: reported ? 'rgba(233, 75, 100, 0.1)' : '#151832', border: reported ? '1px solid rgba(233, 75, 100, 0.4)' : '1px solid transparent' }}>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px]" style={{ color: '#999BBE' }}>
                    <strong style={{ color: '#F4F3FF' }}>{m.senderUsername}</strong> · {m.timestamp}
                    {reported && <span className="ml-2 font-bold" style={{ color: '#E94B64' }}>jelentett</span>}
                  </div>
                  {m.removedByAdmin
                    ? <div className="text-sm italic" style={{ color: '#666A90' }}>(eltávolítva)</div>
                    : <div className="text-sm whitespace-pre-wrap break-words" style={{ color: '#F4F3FF' }}>
                        {m.text || (m.attachments?.length ? `📎 ${m.attachments.length} csatolmány` : '')}
                      </div>}
                </div>
                {!m.removedByAdmin && (
                  <button onClick={() => removeMessage(m.id)} title="Üzenet eltávolítása"
                    className="p-1.5 rounded-lg opacity-60 hover:opacity-100 transition" style={{ color: '#E94B64' }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button className={btnCls} style={btnStyle} onClick={resolve}>Jelentés lezárása</button>
          {msg.text && <span className="text-xs" style={{ color: msg.ok ? '#28C997' : '#E94B64' }}>{msg.text}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: '#999BBE' }}>
          Nyitott jelentések. A privát beszélgetések tartalma csak akkor látható, ha egy résztvevő jelentett egy üzenetet.
        </p>
        <button onClick={load} className="p-1.5 rounded-lg" style={{ background: '#1B2040', color: '#999BBE' }} title="Frissítés">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      {reports.length === 0 && (
        <div className="text-sm p-6 text-center rounded-xl" style={{ ...card, color: '#999BBE' }}>Nincs nyitott jelentés.</div>
      )}
      {reports.map((r) => (
        <button key={r.id} onClick={() => openReport(r.id)} className="w-full text-left rounded-xl p-3 transition hover:brightness-125" style={card}>
          <div className="text-sm" style={{ color: '#F4F3FF' }}>
            <strong>{r.reporter}</strong> jelentette <strong>{r.reportedUser}</strong> üzenetét
          </div>
          <div className="text-xs mt-0.5" style={{ color: '#999BBE' }}>
            {r.reason ? `„${r.reason}” · ` : ''}{new Date(r.createdAt).toLocaleString()}
          </div>
        </button>
      ))}
      {msg.text && <div className="text-xs" style={{ color: msg.ok ? '#28C997' : '#E94B64' }}>{msg.text}</div>}
    </div>
  );
}

export default function AdminPanel({ socket, channelId, currentUser, onClose }) {
  const [tab, setTab] = useState('casino');

  const tabBtn = (id, icon, label) => (
    <button
      onClick={() => setTab(id)}
      className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
      style={{ background: tab === id ? '#7655F5' : 'transparent', color: tab === id ? 'white' : '#999BBE' }}
    >
      {icon}{label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3" onClick={onClose}>
      <div
        className="w-full max-w-xl max-h-[88vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden select-text"
        style={{ background: '#101329', border: '1px solid rgba(125, 105, 255, 0.3)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid rgba(125, 105, 255, 0.12)' }}>
          <ShieldCheck className="w-5 h-5" style={{ color: '#f0b232' }} />
          <strong style={{ color: '#F4F3FF' }}>Admin menü</strong>
          <span className="text-xs" style={{ color: '#999BBE' }}>({currentUser?.username})</span>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg" style={{ color: '#999BBE' }}><X className="w-4 h-4" /></button>
        </div>

        <div className="flex gap-1 p-2" style={{ borderBottom: '1px solid rgba(125, 105, 255, 0.12)' }}>
          {tabBtn('casino', <Dices className="w-3.5 h-3.5" />, 'Kaszinó')}
          {tabBtn('chess', <Crown className="w-3.5 h-3.5" />, 'Sakk')}
          {tabBtn('moderation', <Flag className="w-3.5 h-3.5" />, 'Moderáció')}
        </div>

        <div className="p-4 overflow-y-auto">
          {tab === 'casino' && <CasinoTab socket={socket} />}
          {tab === 'chess' && <ChessTab socket={socket} channelId={channelId} />}
          {tab === 'moderation' && <ModerationTab socket={socket} />}
        </div>
      </div>
    </div>
  );
}
