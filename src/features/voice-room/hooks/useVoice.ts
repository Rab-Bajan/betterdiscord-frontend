// A VoiceSession React-adaptere: egy munkamenet a socket élettartamára, az állapot
// useSyncExternalStore-on keresztül.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { SocketLike } from '../../../shared/services/socket/SocketLike';
import { VoiceSession, type VoiceSessionCallbacks, type VoiceState } from '../lib/VoiceSession';
import type { SpatialConfig } from '../lib/SpatialVoiceMixer';

export interface VoiceApi extends VoiceState {
  setPeerVolume: (peerId: string, volume: number) => void;
  setPeerSpatial: (peerId: string, cfg: SpatialConfig | null) => void;
  toggleCamera: () => Promise<void>;
  unlockAllAudio: () => void;
  joinChannel: (channelId: string) => Promise<void>;
  leaveChannel: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleScreenShare: () => Promise<void>;
}

export function useVoice(socket: SocketLike, callbacks: VoiceSessionCallbacks = {}): VoiceApi {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // useState, nem useMemo: a munkamenet erőforrásokat birtokol, a React nem dobhatja el.
  // A socket modul-szintű egyke, ezért az első példány végig érvényes.
  const [session] = useState(() => new VoiceSession(socket, () => callbacksRef.current));

  useEffect(() => {
    session.start();
    return () => session.stop();
  }, [session]);

  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);

  // A játékok (pl. MiskolcPhobia) ezeket effektek függőségeként használják: stabil referencia kell
  const stable = useMemo(() => ({
    setPeerVolume: (peerId: string, volume: number) => session.setPeerVolume(peerId, volume),
    setPeerSpatial: (peerId: string, cfg: SpatialConfig | null) => session.setPeerSpatial(peerId, cfg),
    toggleCamera: () => session.toggleCamera(),
    unlockAllAudio: () => session.unlockAllAudio(),
    joinChannel: (channelId: string) => session.joinChannel(channelId),
    leaveChannel: () => session.leaveChannel(),
    toggleMute: () => session.toggleMute(),
    toggleDeafen: () => session.toggleDeafen(),
    toggleScreenShare: () => session.toggleScreenShare()
  }), [session]);

  return { ...state, ...stable };
}
