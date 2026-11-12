import { describe, it, expect } from 'vitest';
import { mmss, sideLabel, REASON_TEXT } from '../../../../src/features/games/arena/lib/arenaLabels';
import { GameRpc, GameRpcError, type TimeoutSocket } from '../../../../src/features/games/arena/lib/GameRpc';
import { isGameEventList, isLobby, isMatchEnd, isMatchInfo, isSnapshot } from '../../../../src/features/games/arena/types';
import { hasFields } from '../../../../src/features/games/arena/components/menu/menuTypes';

describe('arena labels', () => {
  const factions = { soap: { id: 'soap', name: 'Szappan', color: '#fff' } };
  const players = [{ side: 'p3', username: 'Bela' }];

  it('names a side by faction, mode side, owner, then the raw id', () => {
    expect(sideLabel('soap', players, factions)).toBe('Szappan');
    expect(sideLabel('infected', players, factions)).toBe('Fertőzöttek');
    expect(sideLabel('p3', players, factions)).toBe('Bela');
    expect(sideLabel('nobody', players, factions)).toBe('nobody');
  });

  it('formats seconds as m:ss', () => {
    expect(mmss(0)).toBe('0:00');
    expect(mmss(65)).toBe('1:05');
    expect(mmss(600)).toBe('10:00');
  });

  it('has a text for the abandoned reason', () => {
    expect(REASON_TEXT.abandoned).toContain('jutalom nem jár');
  });
});

describe('GameRpc', () => {
  /** A fake socket whose ack is answered with `err, reply`, recording what was sent. */
  const fakeSocket = (err: unknown, reply: unknown) => {
    const sent: unknown[][] = [];
    let timeoutMs = 0;
    const socket: TimeoutSocket = {
      timeout(ms) {
        timeoutMs = ms;
        return {
          emit(event, ...args) {
            sent.push([event, ...args.slice(0, -1)]);
            const ack = args[args.length - 1];
            if (typeof ack === 'function') ack(err, reply);
            return undefined;
          }
        };
      }
    };
    return { socket, sent, timeout: () => timeoutMs };
  };

  it('sends game:rpc with method and params and resolves with data', async () => {
    const fake = fakeSocket(null, { ok: true, data: { level: 3 } });
    await expect(new GameRpc(fake.socket).call('overview', { a: 1 })).resolves.toEqual({ level: 3 });
    expect(fake.sent).toEqual([['game:rpc', 'overview', { a: 1 }]]);
    expect(fake.timeout()).toBe(8000);
  });

  it('defaults params to an empty object', async () => {
    const fake = fakeSocket(null, { ok: true, data: null });
    await new GameRpc(fake.socket).call('shop');
    expect(fake.sent).toEqual([['game:rpc', 'shop', {}]]);
  });

  it('rejects with the server error and needsLogin flag', async () => {
    const fake = fakeSocket(null, { ok: false, error: 'Jelentkezz be.', needsLogin: true });
    const err = await new GameRpc(fake.socket).call('buy').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GameRpcError);
    expect(err).toMatchObject({ message: 'Jelentkezz be.', needsLogin: true });
  });

  it('rejects malformed replies with an empty message', async () => {
    const fake = fakeSocket(null, 'garbage');
    await expect(new GameRpc(fake.socket).call('buy')).rejects.toMatchObject({ message: '', needsLogin: false });
  });

  it('rejects on ack timeout', async () => {
    const fake = fakeSocket(new Error('timeout'), undefined);
    await expect(new GameRpc(fake.socket).call('buy')).rejects.toMatchObject({ message: 'A szerver nem válaszolt.' });
  });
});

describe('arena payload guards', () => {
  it('checks lobby and match-end shapes', () => {
    expect(isLobby({ channelId: 'c1', players: [], modeOptions: {} })).toBe(true);
    expect(isLobby({ channelId: 'c1', players: [] })).toBe(false);
    expect(isLobby(null)).toBe(false);
    expect(isMatchEnd({ mode: 'boss', players: [] })).toBe(true);
    expect(isMatchEnd({ mode: 'boss' })).toBe(false);
  });

  it('checks match-start, snapshot and event shapes', () => {
    const info = { you: 0, players: [], world: {}, flags: {}, characters: {}, factions: {}, tickRate: 30, pickups: [] };
    expect(isMatchInfo(info)).toBe(true);
    expect(isMatchInfo({ ...info, tickRate: '30' })).toBe(false);
    expect(isSnapshot({ t: 1, p: [null, [1, 2, 3]] })).toBe(true);
    expect(isSnapshot({ t: 1, p: [5] })).toBe(false);
    expect(isGameEventList([{ t: 'go' }])).toBe(true);
    expect(isGameEventList([{ kind: 'go' }])).toBe(false);
  });

  it('hasFields only accepts records with every listed key', () => {
    const isShop = hasFields<{ wallet: unknown; items: unknown }>('wallet', 'items');
    expect(isShop({ wallet: {}, items: [] })).toBe(true);
    expect(isShop({ wallet: {} })).toBe(false);
    expect(isShop([])).toBe(false);
  });
});
