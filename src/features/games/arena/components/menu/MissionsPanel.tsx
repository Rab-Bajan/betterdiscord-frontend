import React, { useState } from 'react';
import type { ArenaSocket } from '../../lib/GameRpc';
import { Btn, Card, Status, usePanel, rewardText, resultField } from './menuKit';
import type * as T from './menuTypes';
import { isList } from './menuTypes';
import { isRecord } from '../../../../../shared/lib/guards';

const rewardOf = (r: unknown): Record<string, number> => {
  const reward = resultField(r, 'reward');
  return isRecord(reward) ? Object.fromEntries(Object.entries(reward).filter((e): e is [string, number] => typeof e[1] === 'number')) : {};
};

export default function MissionsPanel({ socket }: { socket: ArenaSocket }) {
  const missions = usePanel(socket, 'missions', isList<T.Mission>);
  const achievements = usePanel(socket, 'achievements', isList<T.Achievement>);
  const missionList = missions.data;
  return (
    <div className="space-y-3">
      <Status panel={missions} />
      {missionList && ['daily', 'weekly'].map((kind) => (
        <Card key={kind} title={kind === 'daily' ? 'Napi küldetések' : 'Heti küldetések'}>
          {missionList.filter((m) => m.kind === kind).map((m) => (
            <div key={m.id} className="py-1">
              <div className="flex justify-between items-center text-xs text-white gap-2">
                <span>{m.name} <span style={{ color: '#999BBE' }}>({rewardText(m.reward)})</span></span>
                {m.claimed ? <span style={{ color: '#28C997' }}>Átvéve</span> : <Btn disabled={m.progress < m.goal} onClick={() => missions.act('claimMission', { id: m.id }, (r) => `Jutalom: ${rewardText(rewardOf(r))}`)}>Átvétel</Btn>}
              </div>
              <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: '#1B2040' }}><div className="h-full" style={{ width: `${(m.progress / m.goal) * 100}%`, background: '#7655F5' }} /></div>
              <div className="text-[10px]" style={{ color: '#999BBE' }}>{m.progress} / {m.goal}</div>
            </div>
          ))}
        </Card>
      ))}
      {achievements.data && (
        <Card title="Eredmények">
          <div className="grid sm:grid-cols-2 gap-1.5">
            {achievements.data.map((a) => (
              <div key={a.id} className="px-2 py-1.5 rounded-lg text-xs" style={{ background: a.earned ? 'rgba(40,201,151,0.14)' : '#1B2040', color: a.earned ? '#fff' : '#999BBE' }}>
                <b>{a.earned ? '🏆 ' : a.secret ? '🔒 ' : ''}{a.name}</b><div className="text-[11px]">{a.desc}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
