import React, { useState } from 'react';
import type { ArenaSocket } from '../../lib/GameRpc';
import { useSocketEvents } from '../../../../../shared/hooks/useSocketEvents';
import { Btn, Card, Input, Muted, Status, usePanel, RANK_LABELS } from './menuKit';
import type * as T from './menuTypes';
import { hasFields } from './menuTypes';

const isClanInfo = hasFields<T.ClanInfo>('clan');

export default function ClanPanel({ socket }: { socket: ArenaSocket }) {
  const panel = usePanel(socket, 'clanInfo', isClanInfo);
  const [name, setName] = useState('');
  const [user, setUser] = useState('');
  const [chat, setChat] = useState('');
  useSocketEvents(socket, { 'game:clan-chat': () => { void panel.reload(); } });
  const d = panel.data;
  const clan = d?.clan ?? null;
  const rank = d?.myRank;
  const canManage = rank === 'leader' || rank === 'co_leader';
  const canInvite = canManage || rank === 'officer';

  return (
    <div className="space-y-3">
      <Status panel={panel} />
      {d?.invites?.map((c) => (
        <Card key={c.id}><div className="flex justify-between items-center text-xs text-white"><span>{c.logo} {c.name} meghívott</span><Btn onClick={() => panel.act('clanJoin', { id: c.id }, 'Beléptél.')}>Belépés</Btn></div></Card>
      ))}
      {d && !clan && (
        <>
          <Card title="Klán alapítása (500 érme)">
            <div className="flex gap-2"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Klán neve" className="flex-1" /><Btn onClick={() => panel.act('clanCreate', { name, description: '' }, 'Klán létrehozva!')}>Alapítás</Btn></div>
          </Card>
          <Card title="Klánok">
            {d.list.length === 0 ? <Muted>Még nincs klán.</Muted> : d.list.map((c) => (
              <div key={c.id} className="flex justify-between items-center text-xs py-0.5 text-white"><span>{c.logo} {c.name} · {c.members} tag · {c.xp} XP</span>{c.open ? <Btn onClick={() => panel.act('clanJoin', { id: c.id }, 'Beléptél.')}>Csatlakozás</Btn> : <Muted>Csak meghívással</Muted>}</div>
            ))}
          </Card>
        </>
      )}
      {d && clan && (
        <>
          <Card title={`${clan.logo} ${clan.name}`} right={<Btn kind="danger" onClick={() => panel.act('clanLeave', {}, 'Kiléptél.')}>Kilépés</Btn>}>
            <Muted>{clan.description || 'Nincs leírás.'}</Muted>
            <div className="flex flex-wrap gap-3 text-xs text-white mt-1"><span>XP: <b>{clan.xp}</b></span><span>Győzelmek: <b>{clan.wins}</b></span><span>Klánháború: <b>{clan.war_wins}</b></span><span>Hozzájárulás: <b>{clan.contribution}</b></span></div>
            {canManage && (
              <div className="flex gap-2 mt-2">
                <Btn kind="ghost" onClick={() => { const description = window.prompt('Új leírás', clan.description); if (description !== null) panel.act('clanUpdate', { description }); }}>Leírás</Btn>
                <Btn kind="ghost" onClick={() => { const logo = window.prompt('Új logó (emoji)', clan.logo); if (logo) panel.act('clanUpdate', { logo }); }}>Logó</Btn>
                <Btn kind="ghost" onClick={() => panel.act('clanUpdate', { open: !clan.open })}>{clan.open ? 'Zárt legyen' : 'Nyílt legyen'}</Btn>
              </div>
            )}
          </Card>
          <Card title="Tagok">
            {canInvite && <div className="flex gap-2 mb-2"><Input value={user} onChange={(e) => setUser(e.target.value)} placeholder="Felhasználónév" className="flex-1" /><Btn onClick={() => panel.act('clanInvite', { username: user }, 'Meghívó elküldve.')}>Meghívás</Btn></div>}
            {(d.members ?? []).map((m) => (
              <div key={m.username} className="flex justify-between items-center text-xs py-0.5 text-white">
                <span>{m.username}{m.self ? ' (te)' : ''} · <span style={{ color: '#999BBE' }}>{RANK_LABELS[m.rank]}</span></span>
                {!m.self && canInvite && (
                  <span className="flex gap-1 items-center">
                    {canManage && <select value={m.rank} onChange={(e) => panel.act('clanSetRank', { username: m.username, rank: e.target.value })} className="px-1 py-0.5 rounded text-xs" style={{ background: '#1B2040', color: '#fff' }}>{Object.entries(RANK_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
                    <Btn kind="danger" onClick={() => panel.act('clanKick', { username: m.username })}>Kirúgás</Btn>
                  </span>
                )}
              </div>
            ))}
          </Card>
          <Card title="Klánchat">
            <div className="max-h-48 overflow-y-auto space-y-0.5 mb-2 select-text">{(d.chat ?? []).map((c) => <div key={c.at + c.username} className="text-xs text-white"><b style={{ color: '#F4F3FF' }}>{c.username}:</b> {c.text}</div>)}</div>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (chat.trim()) panel.act('clanChat', { text: chat }).then(() => setChat('')); }}>
              <Input value={chat} onChange={(e) => setChat(e.target.value)} placeholder="Üzenet" className="flex-1" /><Btn type="submit">Küldés</Btn>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}
