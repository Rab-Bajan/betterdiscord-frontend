// A CallSession React-adaptere: egy munkamenet a socket élettartamára, az állapot
// useSyncExternalStore-on keresztül, és a böngészőfül címe bejövő hívás közben.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import type { SocketLike } from '../../../shared/services/socket/SocketLike';
import { CallSession } from '../lib/CallSession';
import type { CallActionResult, CallPartner, CallState } from '../types';

export interface UseCallOptions {
  onBeforeCall?: () => void;
}

export interface CallApi {
  call: CallState | null;
  isInCall: boolean;
  startCall: (partner: CallPartner | null | undefined) => Promise<CallActionResult>;
  acceptCall: () => Promise<void>;
  declineCall: () => void;
  endCall: () => void;
  dismiss: () => void;
  toggleMute: () => void;
  setInputDevice: (deviceId: string) => Promise<void>;
  setOutputDevice: (deviceId: string) => Promise<void>;
  reapplyProcessing: () => Promise<void>;
  retryAudio: () => void;
}

// Böngészőfül címe: bejövő hívásnál látszik a minimalizált ablakban is
function useIncomingCallTitle(call: CallState | null): void {
  const ringingFrom = call?.direction === 'incoming' && call.status === 'ringing' ? call.peer.username : null;
  useEffect(() => {
    if (ringingFrom === null) return undefined;
    const original = document.title;
    let on = true;
    const t = setInterval(() => {
      document.title = on ? `📞 Bejövő hívás – ${ringingFrom}` : original;
      on = !on;
    }, 1000);
    return () => { clearInterval(t); document.title = original; };
  }, [ringingFrom]);
}

export function useCall(
  socket: SocketLike,
  currentUserRef: RefObject<{ username: string } | null>,
  { onBeforeCall }: UseCallOptions = {}
): CallApi {
  const onBeforeCallRef = useRef(onBeforeCall);
  onBeforeCallRef.current = onBeforeCall;

  // useState, nem useMemo: a munkamenet erőforrásokat birtokol, a React nem dobhatja el.
  // A socket modul-szintű egyke, ezért az első példány végig érvényes.
  const [session] = useState(() => new CallSession({
    socket,
    getCurrentUser: () => currentUserRef.current,
    onBeforeCall: () => onBeforeCallRef.current?.()
  }));

  useEffect(() => {
    session.start();
    return () => session.stop();
  }, [session]);

  const call = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useIncomingCallTitle(call);

  return useMemo(() => ({
    call,
    isInCall: !!call && !call.terminal,
    startCall: (partner) => session.startCall(partner),
    acceptCall: () => session.acceptCall(),
    declineCall: () => session.declineCall(),
    endCall: () => session.endCall(),
    dismiss: () => session.dismiss(),
    toggleMute: () => session.toggleMute(),
    setInputDevice: (deviceId) => session.setInputDevice(deviceId),
    setOutputDevice: (deviceId) => session.setOutputDevice(deviceId),
    reapplyProcessing: () => session.reapplyProcessing(),
    retryAudio: () => session.retryAudio()
  }), [call, session]);
}
