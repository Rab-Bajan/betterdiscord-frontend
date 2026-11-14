import React from 'react';
import { Mic, MicOff, Headphones, PhoneOff } from 'lucide-react';
import { SWEEPERS_THEME as T } from '../theme';

export interface SweepersVoiceControls {
  readonly isMuted: boolean;
  readonly isDeafened: boolean;
  readonly onToggleMute: () => void;
  readonly onToggleDeafen: () => void;
  readonly onDisconnect: () => void;
}

/** Floating voice controls kept reachable while the game covers the screen. */
export default function VoicePill({ isMuted, isDeafened, onToggleMute, onToggleDeafen, onDisconnect }: SweepersVoiceControls) {
  const button = (active: boolean) => ({
    background: active ? 'rgba(233, 75, 100, 0.2)' : T.bg3,
    color: active ? T.red : T.text
  });
  return (
    <div
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 rounded-full px-2 py-1.5 shadow-xl"
      style={{ background: 'rgba(16, 19, 41, 0.9)', border: `1px solid ${T.border}`, backdropFilter: 'blur(6px)' }}
    >
      <button type="button" onClick={onToggleMute} title={isMuted ? 'Mikrofon be' : 'Némítás'} aria-label={isMuted ? 'Mikrofon be' : 'Némítás'} className="p-2 rounded-full" style={button(isMuted)}>
        {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
      </button>
      <button type="button" onClick={onToggleDeafen} title={isDeafened ? 'Hang be' : 'Süketítés'} aria-label={isDeafened ? 'Hang be' : 'Süketítés'} className="p-2 rounded-full" style={button(isDeafened)}>
        <Headphones className="w-4 h-4" />
      </button>
      <button type="button" onClick={onDisconnect} title="Kilépés a hangcsatornából" aria-label="Kilépés a hangcsatornából" className="p-2 rounded-full" style={{ background: T.red, color: '#fff' }}>
        <PhoneOff className="w-4 h-4" />
      </button>
    </div>
  );
}
