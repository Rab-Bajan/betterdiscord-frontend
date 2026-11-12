import { useEffect, useRef } from 'react';

/** Socket payloads are untrusted: handlers receive `unknown` and must narrow. */
export type SocketEventHandler = (...args: unknown[]) => void;
export type SocketEventHandlers = Record<string, SocketEventHandler | undefined>;

/** The part of a socket.io client socket this hook needs. */
export interface SocketEventTarget {
  on(event: string, listener: SocketEventHandler): unknown;
  off(event: string, listener: SocketEventHandler): unknown;
}

// Eseménykezelők bekötése a socketre. A kezelők mindig a legfrissebb renderből futnak (nincs
// elavult closure), és takarításkor csak a saját figyelőinket távolítjuk el.
export function useSocketEvents(socket: SocketEventTarget | null | undefined, handlers: SocketEventHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!socket) return undefined;
    const bound = Object.keys(handlersRef.current).map((event): [string, SocketEventHandler] => {
      const listener: SocketEventHandler = (...args) => handlersRef.current[event]?.(...args);
      socket.on(event, listener);
      return [event, listener];
    });
    return () => bound.forEach(([event, listener]) => socket.off(event, listener));
  }, [socket]);
}
