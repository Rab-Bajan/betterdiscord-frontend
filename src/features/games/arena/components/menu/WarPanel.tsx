import React, { useState } from 'react';
import type { ArenaSocket } from '../../lib/GameRpc';
import { Btn, Card, Muted, Status, usePanel, resultField } from './menuKit';
import type * as T from './menuTypes';
import { hasFields, type MenuFaction } from './menuTypes';
import { useSocketEvents } from '../../../../../shared/hooks/useSocketEvents';
import { isString } from '../../../../../shared/lib/guards';

const isWarMap = hasFields<T.WarMap>('territories', 'standings');
const isOverview = hasFields<T.Overview>('profile', 'wallet');

interface WarPanelProps {
  socket: ArenaSocket;
  onJoinBattle: (battleId: string) => void;
  factions: Record<string, MenuFaction>;
}

export default function WarPanel({ socket, onJoinBattle, factions }: WarPanelProps) {
  const map = usePanel(socket, 'warMap', isWarMap);
  const overview = usePanel(socket, 'overview', isOverview);
  const [selected, setSelected] = useState<string | null>(null);
  useSocketEvents(socket, { 'game:war-updated': () => { void map.reload(); } });
  const myFaction = overview.data?.profile.faction;
  const list = map.data?.territories || [];
  const byId = new Map(list.map((t) => [t.id, t]));
  const t = selected ? byId.get(selected) : undefined;
  const color = (owner: string | null | undefined): string => (owner ? factions[owner]?.color ?? '#6b7280' : '#6b7280');
  const reachable = t && myFaction && t.owner !== myFaction && t.links.some((id) => byId.get(id)?.owner === myFaction);

  return (
    <div className="space-y-3">
      <Status panel={map} />
      {overview.data && !myFaction && (
        <Card title="Válassz frakciót erre az évszakra">
          <div className="flex gap-2">{Object.values(factions).map((f) => <Btn key={f.id} onClick={async () => { await overview.act('setFaction', { faction: f.id }, `Csatlakoztál: ${f.name}`); map.reload(); }}>{f.name}</Btn>)}</div>
        </Card>
      )}
      {map.data && (
        <>
          <div className="flex flex-wrap gap-3 text-xs">{map.data.standings.map((s) => <span key={s.faction} style={{ color: factions[s.faction]?.color }}><b>{factions[s.faction]?.name}</b>: {s.total} pont</span>)}</div>
          <svg viewBox="0 0 100 100" className="w-full max-h-96 rounded-2xl" style={{ background: '#101329' }} role="img" aria-label="Világtérkép">
            {list.flatMap((a) => a.links.filter((id) => id > a.id).map((id) => <line key={a.id + id} x1={a.x} y1={a.y} x2={byId.get(id)?.x} y2={byId.get(id)?.y} stroke="rgba(153,155,190,0.35)" strokeWidth="0.4" />))}
            {list.map((a) => (
              <g key={a.id} onClick={() => setSelected(a.id)} className="cursor-pointer">
                <circle cx={a.x} cy={a.y} r={2 + a.value * 0.5} fill={color(a.owner)} stroke={selected === a.id ? '#fff' : a.battle ? '#ef4444' : 'none'} strokeWidth="0.7" />
                <text x={a.x} y={a.y + 7} textAnchor="middle" fontSize="2.5" fill="#F4F3FF">{a.name}</text>
              </g>
            ))}
          </svg>
        </>
      )}
      {t && (
        <Card title={t.name} right={<span className="text-xs font-bold" style={{ color: color(t.owner) }}>{t.owner ? factions[t.owner]?.name : 'Semleges'}</span>}>
          <div className="flex gap-3 text-xs text-white mb-2"><span>Védelem: <b>{t.defense}</b></span><span>Stratégiai érték: <b>{t.value}</b></span></div>
          {t.battle ? <Btn onClick={() => { if (t.battle) onJoinBattle(t.battle.id); }}>Csatlakozás a csatához</Btn> : <Btn disabled={!reachable} onClick={async () => { const out = await map.act('warAttack', { id: t.id }, 'Támadás elindítva!'); const battleId = resultField(out, 'battleId'); if (isString(battleId)) onJoinBattle(battleId); }}>Támadás</Btn>}
          {!t.battle && !reachable && <Muted>Csak saját területtel szomszédos ellenséges vagy semleges terület támadható.</Muted>}
          <div className="mt-2">{t.history.map((h) => <div key={h.resolved_at} className="text-[11px]" style={{ color: '#999BBE' }}>{new Date(h.resolved_at).toLocaleString('hu-HU')}: támadó {factions[h.attacker]?.name}, győztes {h.winner ? factions[h.winner]?.name : 'senki'}</div>)}</div>
        </Card>
      )}
    </div>
  );
}
