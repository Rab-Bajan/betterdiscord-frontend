import React, { useState } from 'react';
import type { ArenaSocket } from '../../lib/GameRpc';
import { Btn, Card, Input, Muted, Status, usePanel, resultField } from './menuKit';
import type * as T from './menuTypes';
import { hasFields } from './menuTypes';

const isBaseState = hasFields<T.BaseState>('buildings', 'catalog');

export default function BasePanel({ socket }: { socket: ArenaSocket }) {
  const panel = usePanel(socket, 'baseState', isBaseState);
  const [target, setTarget] = useState('');
  const d = panel.data;
  return (
    <div className="space-y-3">
      <Status panel={panel} />
      {d && (
        <>
          <Card title={`Bázis · védelem: ${d.defense}`} right={<Btn disabled={d.pending <= 0} onClick={() => panel.act('baseCollect', {}, (r) => `+${String(resultField(r, 'amount'))} érme`)}>Begyűjtés ({d.pending})</Btn>}>
            {d.buildings.length === 0 ? <Muted>Még nincs épületed.</Muted> : d.buildings.map((b) => (
              <div key={b.id} className="flex justify-between items-center text-xs py-1 text-white gap-2">
                <span><b>{b.def.name}</b> {b.level}. szint · {b.health}/{b.maxHealth} élet{!b.ready && <span style={{ color: '#F5B041' }}> · épül: {Math.ceil((b.ready_at - d.now) / 1000)} mp</span>}</span>
                <span className="flex gap-1">
                  {b.health < b.maxHealth && <Btn kind="ghost" onClick={() => panel.act('baseRepair', { id: b.id }, 'Megjavítva.')}>Javítás</Btn>}
                  <Btn disabled={!b.ready || b.level >= b.def.maxLevel} onClick={() => panel.act('baseUpgrade', { id: b.id }, 'Fejlesztés elindult.')}>Fejlesztés ({b.def.cost * (b.level + 1)})</Btn>
                </span>
              </div>
            ))}
          </Card>
          <Card title="Építés">
            <div className="grid sm:grid-cols-2 gap-1.5">
              {d.catalog.map((c) => (
                <div key={c.id} className="flex justify-between items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-white" style={{ background: '#1B2040' }}>
                  <span><b>{c.name}</b><span className="block text-[10px]" style={{ color: '#999BBE' }}>{c.desc} {c.time} mp, max {c.max}</span></span>
                  <Btn onClick={() => panel.act('baseBuild', { type: c.id }, 'Építés elindult.')}>{c.cost} 🪙</Btn>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Rajtaütés">
            <div className="flex gap-2"><Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Felhasználónév" className="flex-1" /><Btn disabled={d.raidReadyAt > d.now} onClick={() => panel.act('baseRaid', { username: target }, (r) => (resultField(r, 'success') ? `Siker! ${String(resultField(r, 'stolen'))} érmét szereztél, sérült: ${String(resultField(r, 'damaged'))}.` : `Visszavertek (${String(resultField(r, 'attack'))} vs ${String(resultField(r, 'defense'))}).`))}>Támadás</Btn></div>
            {d.raidReadyAt > d.now && <Muted>Újra támadhatsz {Math.ceil((d.raidReadyAt - d.now) / 60000)} perc múlva.</Muted>}
          </Card>
        </>
      )}
    </div>
  );
}
