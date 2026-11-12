// A SUDS WAR menü RPC hívásai (`game:rpc` ack-kel, 8 mp időkorláttal). A hibák magyar szövegűek.
import { isRecord, isString } from '../../../../shared/lib/guards';
import type { SocketEventTarget } from '../../../../shared/hooks/useSocketEvents';

const RPC_TIMEOUT_MS = 8000;

/** An RPC failure; `needsLogin` is set when the action requires an account. */
export class GameRpcError extends Error {
  readonly needsLogin: boolean;

  constructor(message: string, needsLogin = false) {
    super(message);
    this.name = 'GameRpcError';
    this.needsLogin = needsLogin;
  }
}

/** The part of a socket.io socket the RPC needs (`timeout().emit` with an error-first ack). */
export interface TimeoutSocket {
  timeout(ms: number): { emit(event: string, ...args: unknown[]): unknown };
}

/** The arena's socket: RPC with timeouts plus event listeners. */
export type ArenaSocket = TimeoutSocket & SocketEventTarget & { readonly id?: string | undefined; readonly connected: boolean; emit(event: string, ...args: unknown[]): unknown };

export class GameRpc {
  readonly #socket: TimeoutSocket;

  constructor(socket: TimeoutSocket) {
    this.#socket = socket;
  }

  /** Resolves with the reply's `data`; rejects with a GameRpcError. */
  call(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.#socket.timeout(RPC_TIMEOUT_MS).emit('game:rpc', method, params, (err: unknown, reply: unknown) => {
        if (err) reject(new GameRpcError('A szerver nem válaszolt.'));
        else if (!isRecord(reply) || !reply.ok) {
          const error = isRecord(reply) && isString(reply.error) ? reply.error : '';
          reject(new GameRpcError(error, isRecord(reply) && !!reply.needsLogin));
        } else resolve(reply.data);
      });
    });
  }
}
