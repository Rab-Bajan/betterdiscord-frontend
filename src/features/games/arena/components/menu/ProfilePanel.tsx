import React, { useState } from 'react';
import type { ArenaSocket } from '../../lib/GameRpc';
import { Btn, Card, Input, Muted, Status, usePanel, CURRENCY_LABELS, MODE_LABELS, STAT_LABELS } from './menuKit';
import type * as T from './menuTypes';
import { hasFields, isList } from './menuTypes';

const isOverview = hasFields<T.Overview>('profile', 'wallet');

export default function ProfilePanel({ socket, lobbyId }: { socket: ArenaSocket; lobbyId: string | undefined }) {
  const panel = usePanel(socket, 'overview', isOverview);
  const friends = usePanel(socket, 'friends', isList<T.Friend>);
  const [name, setName] = useState('');
  const d = panel.data;
  return (
    <div className="space-y-3">
      <Status panel={panel} /><Status panel={{ ...friends, data: true }} />
      {d && (
        <>
          <Card title={`${d.profile.username || ''} · ${d.profile.level}. szint · ${d.profile.badge}`} right={d.profile.title && <span className="text-xs font-bold text-shark-gold">{d.profile.title}</span>}>
            <div className="flex flex-wrap gap-3 text-xs mb-2 text-white">{Object.entries(d.wallet).map(([k, v]) => <span key={k}>{CURRENCY_LABELS[k]}: <b>{v}</b></span>)}</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-xs" style={{ color: '#F4F3FF' }}>
              {Object.entries(STAT_LABELS).map(([k, label]) => <div key={k} className="flex justify-between gap-2"><span style={{ color: '#999BBE' }}>{label}</span><b>{d.profile.stats[k] || 0}</b></div>)}
            </div>
          </Card>
          <Card title="Meccselőzmények">
            {d.profile.history.length === 0 ? <Muted>Még nincs lejátszott meccsed.</Muted> : d.profile.history.map((m) => (
              <div key={m.ended_at} className="flex justify-between text-xs py-0.5 text-white">
                <span>{MODE_LABELS[m.mode] || m.mode}</span>
                <span style={{ color: m.outcome === 'win' ? '#28C997' : '#999BBE' }}>{m.outcome === 'win' ? 'Győzelem' : m.outcome === 'draw' ? 'Döntetlen' : 'Vereség'}</span>
                <span>{m.kills}/{m.deaths} · +{m.xp_awarded} XP</span>
              </div>
            ))}
          </Card>
          <Card title="Barátok">
            <div className="flex gap-2 mb-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Felhasználónév" className="flex-1" />
              <Btn onClick={() => friends.act('friendRequest', { username: name }, 'Jelölés elküldve.')}>Jelölés</Btn>
              <Btn kind="ghost" onClick={() => friends.act('block', { username: name }, 'Letiltva.')}>Tiltás</Btn>
              <Btn kind="danger" onClick={() => { const reason = window.prompt('Miért jelented?'); if (reason) friends.act('report', { username: name, reason }, 'Jelentés elküldve.'); }}>Jelentés</Btn>
            </div>
            {(friends.data || []).map((f) => (
              <div key={f.username} className="flex items-center justify-between text-xs py-0.5 text-white">
                <span>{f.online ? '🟢' : '⚫'} {f.username}{f.status === 'pending' ? ' (függőben)' : ''}</span>
                <span className="flex gap-1">
                  {f.incoming && <Btn onClick={() => friends.act('friendAccept', { username: f.username })}>Elfogadás</Btn>}
                  {f.status === 'accepted' && <Btn kind="ghost" onClick={() => friends.act('inviteToLobby', { username: f.username, lobbyId }, 'Meghívó elküldve.')}>Meghívás</Btn>}
                  <Btn kind="ghost" onClick={() => friends.act('friendRemove', { username: f.username })}>Törlés</Btn>
                </span>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
