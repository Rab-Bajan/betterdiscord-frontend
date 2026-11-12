import React from 'react';
import type { ArenaSocket } from '../../lib/GameRpc';
import { Card, Muted, Status, usePanel } from './menuKit';
import type * as T from './menuTypes';
import { hasFields, type MenuFaction } from './menuTypes';

const isSeasons = hasFields<T.Seasons>('current', 'standings', 'history');

export default function SeasonPanel({ socket, factions }: { socket: ArenaSocket; factions: Record<string, MenuFaction> }) {
  const panel = usePanel(socket, 'seasons', isSeasons);
  const d = panel.data;
  return (
    <div className="space-y-3">
      <Status panel={panel} />
      {d && (
        <>
          <Card title={`${d.current.id}. évszak`}>
            <Muted>Vége: {new Date(d.current.ends_at).toLocaleString('hu-HU')}. A győztes frakció tagjai drágakövet, a részvevők évszak-zsetont, a legjobb 10 játékos extra jutalmat, az első hely exkluzív címet kap.</Muted>
            {d.standings.map((s) => <div key={s.faction} className="flex justify-between text-xs py-0.5" style={{ color: factions[s.faction]?.color }}><b>{factions[s.faction]?.name}</b><span>{s.points} + {s.territoryValue} terület = {s.total}</span></div>)}
          </Card>
          <Card title="Korábbi évszakok">
            {d.history.length === 0 ? <Muted>Még nem zárult le évszak.</Muted> : d.history.map((h) => <div key={h.id} className="text-xs py-0.5 text-white">{h.id}. évszak: {h.winner ? factions[h.winner]?.name : 'döntetlen'} · legjobb: {h.summary.top[0]?.username || '-'}</div>)}
          </Card>
        </>
      )}
    </div>
  );
}
