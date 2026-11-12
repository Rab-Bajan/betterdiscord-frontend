/** Socket payloads are untrusted: listeners receive `unknown` and must narrow. */
export type SocketListener = (...args: unknown[]) => void;

/**
 * The part of a socket.io client socket that features use. The shared `socket` satisfies it, and
 * tests can pass a small fake.
 */
export interface SocketLike {
  readonly id?: string | undefined;
  on(event: string, listener: SocketListener): unknown;
  off(event: string, listener?: SocketListener): unknown;
  emit(event: string, ...args: unknown[]): unknown;
}
