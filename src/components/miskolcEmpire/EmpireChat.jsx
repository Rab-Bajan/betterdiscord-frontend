import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, ChevronDown, Send } from 'lucide-react';
import { playerColor } from './empireStore';

// Collapsible in-match chat ('empire:chat'). Messages live in store.chat; the parent HUD re-renders at
// 4 Hz. Enter opens the panel and focuses the input when nothing else has focus.
export default function EmpireChat({ store, onSend }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [seen, setSeen] = useState(store.chatVersion);
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const unread = open ? 0 : Math.min(99, store.chatVersion - seen);

  useEffect(() => { if (open) setSeen(store.chatVersion); }, [open, store.chatVersion]);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, store.chatVersion]);
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (e.key === 'Enter' && !typing) {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true);
    const ok = await onSend(msg);
    setSending(false);
    if (ok) setText('');
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="pointer-events-auto relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition hover:brightness-125"
        style={{ background: 'rgba(14,16,36,0.78)', color: '#c9cdea', border: '1px solid rgba(125,105,255,0.25)', backdropFilter: 'blur(10px)' }}
        title="Csevegés (Enter)"
      >
        <MessageSquare className="w-3.5 h-3.5" /> Csevegés
        {unread > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[17px] h-[17px] px-1 rounded-full text-[9px] font-black flex items-center justify-center" style={{ background: '#E94B64', color: '#fff' }}>{unread}</span>}
      </button>
    );
  }
  return (
    <div className="pointer-events-auto w-[300px] max-w-[80vw] rounded-2xl overflow-hidden flex flex-col" style={{ background: 'rgba(14,16,36,0.82)', border: '1px solid rgba(125,105,255,0.25)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
      <div className="flex items-center justify-between px-3 py-1.5" style={{ borderBottom: '1px solid rgba(125,105,255,0.15)' }}>
        <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: '#c7bfff' }}><MessageSquare className="w-3.5 h-3.5" /> Meccs csevegés</span>
        <button onClick={() => setOpen(false)} className="p-0.5 rounded hover:bg-white/10" title="Összecsukás"><ChevronDown className="w-4 h-4" style={{ color: '#999BBE' }} /></button>
      </div>
      <div ref={listRef} className="px-3 py-2 space-y-1 overflow-y-auto text-[12px]" style={{ maxHeight: 170, minHeight: 60 }}>
        {store.chat.length === 0 && <div className="text-[11px] italic" style={{ color: '#7f83a8' }}>Még nincs üzenet. Írj valamit a többieknek!</div>}
        {store.chat.map((m, i) => (
          <div key={`${m.t}-${i}`} className="break-words leading-snug">
            <span className="font-bold" style={{ color: m.spectator ? '#999BBE' : playerColor(store, m.idx) }}>{m.from}:</span>{' '}
            <span style={{ color: m.spectator ? '#b9bcd6' : '#F4F3FF' }}>{m.text}</span>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="flex items-center gap-1.5 px-2 py-1.5" style={{ borderTop: '1px solid rgba(125,105,255,0.15)' }}>
        <input
          ref={inputRef}
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.currentTarget.blur(); setOpen(false); } }}
          placeholder="Üzenet..."
          className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg text-xs outline-none"
          style={{ background: '#101329', color: '#F4F3FF', border: '1px solid rgba(125,105,255,0.2)' }}
        />
        <button type="submit" disabled={!text.trim() || sending} className="p-1.5 rounded-lg transition enabled:hover:brightness-125 disabled:opacity-40" style={{ background: 'linear-gradient(135deg,#7655F5,#536CFF)', color: '#fff' }} title="Küldés">
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}
