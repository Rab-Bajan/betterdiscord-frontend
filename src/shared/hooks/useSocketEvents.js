import { useEffect, useRef } from 'react';

// Eseménykezelők bekötése a socketre. A kezelők mindig a legfrissebb renderből futnak (nincs
// elavult closure), és takarításkor csak a saját figyelőinket távolítjuk el.
export function useSocketEvents(socket, handlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!socket) return undefined;
    const bound = Object.keys(handlersRef.current).map((event) => {
      const listener = (...args) => handlersRef.current[event]?.(...args);
      socket.on(event, listener);
      return [event, listener];
    });
    return () => bound.forEach(([event, listener]) => socket.off(event, listener));
  }, [socket]);
}
