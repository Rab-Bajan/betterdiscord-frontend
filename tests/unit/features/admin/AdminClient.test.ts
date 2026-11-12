import { describe, it, expect } from 'vitest';
import { AdminClient } from '../../../../src/features/admin/lib/AdminClient';
import { buildRig, rigSelectValue } from '../../../../src/features/admin/lib/slotRig';
import type { SocketLike } from '../../../../src/shared/services/socket/SocketLike';

/** Replies to every emit with the configured ack. */
function ackSocket(replies: Record<string, unknown>) {
  const sent: Array<[string, unknown]> = [];
  const socket: SocketLike = {
    on: () => {},
    off: () => {},
    emit: (event, payload, ack) => {
      sent.push([event, payload]);
      if (typeof ack === 'function') ack(replies[event]);
    }
  };
  return { socket, sent };
}

describe('AdminClient', () => {
  it('lists casino players and drops malformed rows', async () => {
    const { socket } = ackSocket({ 'admin:casino-list': { ok: true, players: [{ playerId: 'p1', balance: 5, freeSpins: 0 }, { name: 'x' }] } });
    await expect(new AdminClient(socket).listCasinoPlayers()).resolves.toEqual({ ok: true, value: [{ playerId: 'p1', balance: 5, freeSpins: 0 }] });
  });

  it('passes server errors through and reports a missing reply', async () => {
    const { socket } = ackSocket({ 'admin:dm-reports': { ok: false, error: 'Nincs jogosultság.' } });
    const admin = new AdminClient(socket);
    await expect(admin.listDmReports()).resolves.toEqual({ ok: false, error: 'Nincs jogosultság.' });
    await expect(admin.resolveDmReport('r1')).resolves.toEqual({ ok: false, error: 'Nincs válasz a szervertől.' });
  });

  it('sends the channel with chess commands and reads the new turn', async () => {
    const { socket, sent } = ackSocket({ 'admin:chess-set-turn': { ok: true, turn: 'b', status: 'playing' } });
    await expect(new AdminClient(socket).chess('admin:chess-set-turn', 'ch1', { turn: 'b' }))
      .resolves.toEqual({ ok: true, value: { turn: 'b', status: 'playing' } });
    expect(sent).toEqual([['admin:chess-set-turn', { channelId: 'ch1', turn: 'b' }]]);
  });

  it('opens a report context with defaults for missing fields', async () => {
    const { socket } = ackSocket({ 'admin:dm-report-context': { ok: true, report: { id: 'r1', reporter: 'Anna', reportedMessageId: 'm2' }, messages: [{ id: 'm2', text: 'x' }, 7] } });
    await expect(new AdminClient(socket).openDmReport('r1')).resolves.toEqual({
      ok: true,
      value: { report: { id: 'r1', reporter: 'Anna', reason: null, reportedMessageId: 'm2' }, messages: [{ id: 'm2', text: 'x' }] }
    });
  });
});

describe('slot rig', () => {
  it('round-trips select values', () => {
    expect(rigSelectValue(null)).toBe('');
    expect(rigSelectValue({ mode: 'jackpot', symbols: ['💎'], spins: 2 })).toBe('jackpot:💎');
    expect(rigSelectValue({ mode: 'lose', spins: 1 })).toBe('lose');
    expect(buildRig('jackpot:⭐', 3)).toEqual({ mode: 'jackpot', symbols: ['⭐'], spins: 3 });
    expect(buildRig('bonus', 1)).toEqual({ mode: 'bonus', spins: 1 });
    expect(buildRig('', 5)).toBeNull();
  });
});
