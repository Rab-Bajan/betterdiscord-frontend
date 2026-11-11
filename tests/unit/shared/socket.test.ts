// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { Socket } from 'socket.io-client';

const fakeSocket = vi.hoisted(() => ({ marker: 'the-one-socket' }));
const ioMock = vi.hoisted(() => vi.fn(() => fakeSocket));
vi.mock('socket.io-client', () => ({ io: ioMock }));

import { socket, socketClient, SocketClient } from '../../../src/shared/services/socket';

function makeFake() {
  return {
    connected: true,
    id: 'abc',
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  };
}

describe('socket singleton wiring', () => {
  // jsdom serves http://localhost:3000, so SOCKET_URL targets the :5000 backend
  it('creates exactly one connection with the original options', () => {
    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(ioMock).toHaveBeenCalledWith('https://localhost:5000', {
      transports: ['websocket', 'polling'],
      autoConnect: false
    });
  });

  it('socketClient wraps the same raw socket that is exported', () => {
    expect(socket).toBe(fakeSocket);
    expect(socketClient.raw).toBe(socket);
  });
});

describe('SocketClient', () => {
  it('delegates every method and getter to the underlying socket', () => {
    const fake = makeFake();
    const client = new SocketClient(fake as unknown as Socket);
    const handler = () => {};

    expect(client.connect()).toBe(client);
    expect(fake.connect).toHaveBeenCalledTimes(1);
    client.on('msg', handler);
    expect(fake.on).toHaveBeenCalledWith('msg', handler);
    client.once('msg', handler);
    expect(fake.once).toHaveBeenCalledWith('msg', handler);
    client.off('msg', handler);
    expect(fake.off).toHaveBeenCalledWith('msg', handler);
    client.emit('send', 1, { a: 2 });
    expect(fake.emit).toHaveBeenCalledWith('send', 1, { a: 2 });
    client.disconnect();
    expect(fake.disconnect).toHaveBeenCalledTimes(1);

    expect(client.connected).toBe(true);
    expect(client.id).toBe('abc');
    fake.connected = false;
    expect(client.connected).toBe(false);
  });
});
