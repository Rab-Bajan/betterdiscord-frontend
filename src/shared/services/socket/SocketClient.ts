import type { Socket } from 'socket.io-client';

type Listener = (...args: unknown[]) => void;

/** Vékony OOP burok egy socket.io-client Sockethez; minden hívás a mögöttes sockethez delegál. */
export class SocketClient {
  readonly #socket: Socket;

  constructor(socket: Socket) {
    this.#socket = socket;
  }

  get raw(): Socket {
    return this.#socket;
  }

  get connected(): boolean {
    return this.#socket.connected;
  }

  get id(): string | undefined {
    return this.#socket.id;
  }

  connect(): this {
    this.#socket.connect();
    return this;
  }

  disconnect(): this {
    this.#socket.disconnect();
    return this;
  }

  on(event: string, listener: Listener): this {
    this.#socket.on(event, listener);
    return this;
  }

  once(event: string, listener: Listener): this {
    this.#socket.once(event, listener);
    return this;
  }

  off(event?: string, listener?: Listener): this {
    this.#socket.off(event, listener);
    return this;
  }

  emit(event: string, ...args: unknown[]): this {
    this.#socket.emit(event, ...args);
    return this;
  }
}
