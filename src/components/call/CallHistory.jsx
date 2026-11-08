import React, { useEffect, useState } from 'react';
import { X, Phone } from 'lucide-react';
import { describeCallEvent } from './CallEventMessage';
import { formatDuration } from './CallScreen';

// Hívásnapló egy beszélgetőpartnerrel (szerver: calls tábla). Innen is újra lehet hívni.
export default function CallHistory({ socket, partner, myUsername, onCallAgain, callDisabled, onClose }) {
  const [calls, setCalls] = useState(null);

  useEffect(() => {
    socket.emit('call:history', { targetUsername: partner.username }, (res) => setCalls(res?.ok ? res.calls : []));
  }, [socket, partner.username]);

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center sm:p-4 call-fade"
      style={{ background: 'rgba(5, 6, 16, 0.7)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div role="dialog" aria-label="Híváselőzmények" onClick={(e) => e.stopPropagation()}
        className="call-pop w-full sm:max-w-md max-h-[80vh] flex flex-col rounded-t-3xl sm:rounded-3xl"
        style={{ background: '#101329', border: '1px solid rgba(125,105,255,0.2)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(125,105,255,0.12)' }}>
          <h2 className="font-bold" style={{ color: '#F4F3FF' }}>Hívások · @{partner.username}</h2>
          <button type="button" onClick={onClose} aria-label="Bezárás" className="p-2 rounded-xl" style={{ color: '#999BBE' }}><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto p-3 space-y-1.5">
          {calls === null && <p className="text-sm text-center py-8" style={{ color: '#999BBE' }}>Betöltés…</p>}
          {calls && calls.length === 0 && <p className="text-sm text-center py-8" style={{ color: '#999BBE' }}>Még nem volt hívás ezzel a személlyel.</p>}
          {calls && calls.map((c) => {
            const { Icon, color, title, sub } = describeCallEvent({ ...c, endReason: null }, myUsername);
            return (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: '#151832' }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${color}22`, color }}>
                  <Icon style={{ width: 16, height: 16 }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate" style={{ color: '#F4F3FF' }}>
                    {c.status === 'completed' ? `Hanghívás · ${formatDuration(c.durationSec)}` : title}
                  </div>
                  <div className="text-[11px] truncate" style={{ color: '#999BBE' }}>
                    {sub} · {new Date(c.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="p-3" style={{ borderTop: '1px solid rgba(125,105,255,0.12)' }}>
          <button type="button" disabled={callDisabled} onClick={() => { onClose(); onCallAgain(partner); }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-45"
            style={{ background: 'linear-gradient(135deg, #28C997, #1FAF82)' }}>
            <Phone className="w-4 h-4" /> Hívás újra
          </button>
        </div>
      </div>
    </div>
  );
}
