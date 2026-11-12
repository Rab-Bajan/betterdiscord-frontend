import { useEffect, useRef } from 'react';
import type { SpatialConfig } from '../../../voice-room/lib/SpatialVoiceMixer.ts';

/** The local listener: eye position, facing and whether we are still alive. */
export interface VoiceListener {
  x: number;
  y: number;
  z: number;
  yaw?: number;
  alive?: boolean;
}

/** A remote voice peer as seen from the listener. */
export interface VoicePeer {
  socketId: string;
  x: number;
  y: number;
  z: number;
  alive?: boolean;
  occluded?: boolean;
  hasRadio?: boolean;
}

export type SetPeerSpatial = (peerId: string, cfg: SpatialConfig | null) => void;

export interface UsePhobiaVoiceOptions {
  setPeerSpatial?: SetPeerSpatial | null;
  getListener?: () => VoiceListener | null;
  getPeers?: () => ReadonlyArray<VoicePeer | null | undefined>;
  enabled?: boolean;
}

type VoiceFns = Pick<UsePhobiaVoiceOptions, 'setPeerSpatial' | 'getListener' | 'getPeers'>;

const UPDATE_INTERVAL_MS = 80; // ~12 Hz
const MAX_RANGE = 25;

// Játékon belüli térbeli hang: a hallgató és a többiek pozíciójából állítja a setPeerSpatial-t.
//  - occluded: fojtott (lowpass) és halkabb hang
//  - halott játékosokat az élők nem hallják
//  - hasRadio (walkie-talkie): nem pozicionális, rádiószűrt hang, távolságtól függetlenül
// Kilépéskor / kikapcsoláskor minden játékos visszaáll a normál hangra (null).
export function usePhobiaVoice({ setPeerSpatial, getListener, getPeers, enabled = true }: UsePhobiaVoiceOptions): void {
  const fnsRef = useRef<VoiceFns>({});
  fnsRef.current = { setPeerSpatial, getListener, getPeers };

  useEffect(() => {
    if (!enabled) return undefined;
    const active = new Set<string>();

    const release = (id: string): void => {
      active.delete(id);
      try { fnsRef.current.setPeerSpatial?.(id, null); } catch { /* ignore */ }
    };

    const tick = (): void => {
      const { setPeerSpatial: set, getListener: getL, getPeers: getP } = fnsRef.current;
      if (!set) return;
      const listener = getL?.();
      const peers = getP?.() || [];
      if (!listener) {
        [...active].forEach(release);
        return;
      }
      const listenerAlive = listener.alive !== false;
      const seen = new Set<string>();
      for (const p of peers) {
        if (!p || !p.socketId) continue;
        seen.add(p.socketId);
        const dx = p.x - listener.x;
        const dy = p.y - listener.y;
        const dz = p.z - listener.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        let gain = 1;
        if (p.alive === false && listenerAlive) gain = 0;
        // A rádió globális; a térbeli hang csak hatótávon belül szól
        else if (!p.hasRadio && dist > MAX_RANGE) gain = 0;
        else if (p.occluded && !p.hasRadio) gain = 0.45;
        set(p.socketId, {
          x: p.x, y: p.y, z: p.z,
          listener: { x: listener.x, y: listener.y, z: listener.z, yaw: listener.yaw || 0 },
          muffled: !!p.occluded && !p.hasRadio,
          radio: !!p.hasRadio && gain > 0,
          gain
        });
        active.add(p.socketId);
      }
      [...active].forEach((id) => { if (!seen.has(id)) release(id); });
    };

    tick();
    const timer = setInterval(tick, UPDATE_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      [...active].forEach(release);
    };
  }, [enabled]);
}

export default usePhobiaVoice;
