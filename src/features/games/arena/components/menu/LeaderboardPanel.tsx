import React, { useState } from 'react';
import type { ArenaSocket } from '../../lib/GameRpc';
import { Btn, Card, Muted, Status, usePanel } from './menuKit';
import type * as T from './menuTypes';
import { hasFields, isList } from './menuTypes';

const isLeaderboard = hasFields<T.Leaderboard>('name', 'rows');

export default function LeaderboardPanel({ socket }: { socket: ArenaSocket }) {
  const boards = usePanel(socket, 'leaderboards', isList<T.LeaderboardInfo>);
  const [id, setId] = useState('overall');
  const board = usePanel(socket, 'leaderboard', isLeaderboard, { id });
  return (
    <div className="space-y-3">
      <Status panel={boards} />
      <div className="flex flex-wrap gap-1">{(boards.data || []).map((b) => <Btn key={b.id} kind={b.id === id ? 'primary' : 'ghost'} onClick={() => setId(b.id)}>{b.name}</Btn>)}</div>
      <Status panel={board} />
      {board.data && (
        <Card title={board.data.name}>
          {board.data.rows.length === 0 ? <Muted>Még nincs bejegyzés.</Muted> : board.data.rows.map((r, i) => <div key={`${r.username}${i}`} className="flex justify-between text-xs py-0.5 text-white"><span>{i + 1}. {r.username || 'Ismeretlen'}</span><b>{r.value}</b></div>)}
        </Card>
      )}
    </div>
  );
}
