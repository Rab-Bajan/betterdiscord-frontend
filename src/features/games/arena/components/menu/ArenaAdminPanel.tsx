import React, { useState } from 'react';
import type { ArenaSocket } from '../../lib/GameRpc';
import { Btn, Card, Input, Muted, Status, usePanel, MODE_LABELS } from './menuKit';
import type * as T from './menuTypes';
import { hasFields } from './menuTypes';

const isAdminOverview = hasFields<T.AdminOverview>('matches', 'reports', 'audit', 'disabledModes');

export default function ArenaAdminPanel({ socket }: { socket: ArenaSocket }) {
  const panel = usePanel(socket, 'adminOverview', isAdminOverview);
  const [name, setName] = useState('');
  const [hours, setHours] = useState(24);
  const [detail, setDetail] = useState<unknown>(null);
  const d = panel.data;
  return (
    <div className="space-y-3">
      <Status panel={panel} />
      {d && (
        <>
          <Card title="Szerver" right={<Btn kind="ghost" onClick={() => { void panel.reload(); }}>Frissítés</Btn>}>
            <div className="text-xs text-white">Memória: {d.memoryMb} MB · Lobbik: {d.lobbies} · Futó meccsek: {d.matches.length}</div>
            {d.matches.map((m) => <div key={m.id} className="text-xs" style={{ color: '#F4F3FF' }}>{MODE_LABELS[m.mode]} · {m.players} játékos · {m.time} mp · {JSON.stringify(m.score)}</div>)}
          </Card>
          <Card title="Beállítások">
            <div className="flex flex-wrap gap-2 items-center text-xs text-white">
              <Btn kind="ghost" onClick={() => { const days = Number(window.prompt('Évszak hossza (nap)', String(d.seasonDays))); if (days) panel.act('adminSetSeasonDays', { days }, 'Mentve.'); }}>Évszak: {d.seasonDays} nap</Btn>
              <Btn kind="ghost" onClick={() => { const value = Number(window.prompt('XP-szorzó', String(d.xpMultiplier))); if (!Number.isNaN(value)) panel.act('adminSetXpMultiplier', { value }, 'Mentve.'); }}>XP-szorzó: {d.xpMultiplier}</Btn>
              <Btn kind="danger" onClick={() => { if (window.confirm('Biztosan lezárod az évszakot?')) panel.act('adminEndSeason', {}, 'Évszak lezárva.'); }}>Évszak lezárása</Btn>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {Object.entries(MODE_LABELS).map(([id, label]) => {
                const off = d.disabledModes.includes(id);
                return <Btn key={id} kind={off ? 'danger' : 'ghost'} onClick={() => panel.act('adminSetDisabledModes', { modes: off ? d.disabledModes.filter((m) => m !== id) : [...d.disabledModes, id] })}>{label}: {off ? 'ki' : 'be'}</Btn>;
              })}
            </div>
          </Card>
          <Card title="Játékos">
            <div className="flex gap-2 items-center">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Felhasználónév" className="flex-1" />
              <Input type="number" value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-20" />
              <Btn kind="danger" onClick={() => panel.act('adminSuspend', { username: name, hours }, hours ? 'Felfüggesztve.' : 'Feloldva.')}>Felfüggesztés (óra)</Btn>
              <Btn kind="ghost" onClick={async () => setDetail(await panel.act('adminPlayer', { username: name }))}>Adatok</Btn>
            </div>
            {!!detail && <pre className="text-[11px] mt-2 max-h-56 overflow-auto select-text" style={{ color: '#F4F3FF' }}>{JSON.stringify(detail, null, 1)}</pre>}
          </Card>
          <Card title="Jelentések">
            {d.reports.length === 0 ? <Muted>Nincs nyitott jelentés.</Muted> : d.reports.map((r) => <div key={r.id} className="flex justify-between items-center text-xs py-0.5 text-white gap-2"><span>{r.reporter} → {r.target}: {r.reason}</span><Btn kind="ghost" onClick={() => panel.act('adminCloseReport', { id: r.id })}>Lezárás</Btn></div>)}
          </Card>
          <Card title="Napló">{d.audit.map((a) => <div key={a.at + a.action} className="text-[11px]" style={{ color: '#999BBE' }}>{new Date(a.at).toLocaleString('hu-HU')} · {a.actor} · {a.action} · {a.detail}</div>)}</Card>
        </>
      )}
    </div>
  );
}
