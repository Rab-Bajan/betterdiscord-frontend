import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ArrowLeft, Trash2 } from 'lucide-react';
import type { AdminClient } from '../lib/AdminClient';
import type { DmReportContext, DmReportSummary } from '../types';
import { btnCls, btnStyle, card, type AdminMessage } from './adminStyles';

// DM moderáció: csak jelentett üzenetek, és csak azok környéke látható
export default function ModerationTab({ admin }: { admin: AdminClient }) {
  const [reports, setReports] = useState<DmReportSummary[]>([]);
  const [open, setOpen] = useState<DmReportContext | null>(null);
  const [msg, setMsg] = useState<AdminMessage>({ text: '', ok: true });

  const load = useCallback(async () => {
    const res = await admin.listDmReports();
    if (res.ok) setReports(res.value);
    else setMsg({ ok: false, text: res.error });
  }, [admin]);

  useEffect(() => { void load(); }, [load]);

  const openReport = async (id: string) => {
    const res = await admin.openDmReport(id);
    if (res.ok) { setOpen(res.value); setMsg({ text: '', ok: true }); }
    else setMsg({ ok: false, text: res.error });
  };

  const removeMessage = async (report: DmReportContext['report'], messageId: string) => {
    if (!window.confirm('Eltávolítod ezt az üzenetet? Mindkét félnél "admin eltávolította" jelzés látszik majd helyette.')) return;
    const res = await admin.removeDmMessage(report.id, messageId);
    if (res.ok) {
      setOpen((o) => o && ({ ...o, messages: o.messages.map((m) => (m.id === messageId ? { ...m, text: '', attachments: [], removedByAdmin: true } : m)) }));
      setMsg({ ok: true, text: 'Üzenet eltávolítva.' });
    } else setMsg({ ok: false, text: res.error });
  };

  const resolve = async (report: DmReportContext['report']) => {
    const res = await admin.resolveDmReport(report.id);
    if (res.ok) { setOpen(null); setMsg({ ok: true, text: 'Jelentés lezárva.' }); void load(); }
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
          <div style={{ color: '#999BBE' }}>Csak a jelentett üzenet és a környező üzenetek láthatók. A megnyitás naplózódik.</div>
        </div>

        <div className="space-y-1.5">
          {open.messages.map((m) => {
            const reported = m.id === open.report.reportedMessageId;
            return (
              <div key={m.id} className="rounded-lg px-3 py-2 flex items-start gap-2 group"
                style={{ background: reported ? 'rgba(233, 75, 100, 0.1)' : '#151832', border: reported ? '1px solid rgba(233, 75, 100, 0.4)' : '1px solid transparent' }}>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] min-w-0" style={{ color: '#999BBE' }}>
                    <strong style={{ color: '#F4F3FF' }}>{m.senderUsername}</strong> · {m.timestamp}
                    {reported && <span className="ml-2 font-bold" style={{ color: '#E94B64' }}>jelentett</span>}
                  </div>
                  {m.removedByAdmin
                    ? <div className="text-sm italic" style={{ color: '#999BBE' }}>(eltávolítva)</div>
                    : <div className="text-sm whitespace-pre-wrap break-words" style={{ color: '#F4F3FF' }}>
                        {m.text || (m.attachments?.length ? `📎 ${m.attachments.length} csatolmány` : '')}
                      </div>}
                </div>
                {!m.removedByAdmin && (
                  <button onClick={() => { void removeMessage(open.report, m.id); }} title="Üzenet eltávolítása"
                    className="p-1.5 rounded-lg opacity-60 hover:opacity-100 transition" style={{ color: '#E94B64' }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button className={btnCls} style={btnStyle} onClick={() => { void resolve(open.report); }}>Jelentés lezárása</button>
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
        <button onClick={() => { void load(); }} className="p-2 rounded-xl flex-shrink-0" style={{ background: '#1B2040', color: '#999BBE' }} title="Frissítés">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      {reports.length === 0 && (
        <div className="text-sm p-6 text-center rounded-xl" style={{ ...card, color: '#999BBE' }}>Nincs nyitott jelentés.</div>
      )}
      {reports.map((r) => (
        <button key={r.id} onClick={() => { void openReport(r.id); }} className="w-full text-left rounded-xl p-3 transition hover:brightness-125" style={card}>
          <div className="text-sm" style={{ color: '#F4F3FF' }}>
            <strong>{r.reporter}</strong> jelentette <strong>{r.reportedUser}</strong> üzenetét
          </div>
          <div className="text-xs mt-0.5" style={{ color: '#999BBE' }}>
            {r.reason ? `„${r.reason}” · ` : ''}{new Date(r.createdAt ?? 0).toLocaleString()}
          </div>
        </button>
      ))}
      {msg.text && <div className="text-xs" style={{ color: msg.ok ? '#28C997' : '#E94B64' }}>{msg.text}</div>}
    </div>
  );
}
