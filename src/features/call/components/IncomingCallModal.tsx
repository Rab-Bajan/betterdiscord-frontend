import React, { useEffect, useState } from 'react';
import { Phone, PhoneOff, Volume2 } from 'lucide-react';
import CallAvatar from './CallAvatar';
import { isCallAudioBlocked, unlockCallAudio } from '../lib/callSounds';
import type { CallState } from '../types';

interface IncomingCallModalProps {
  call: CallState;
  onAccept: () => void;
  onDecline: () => void;
}

// Bejövő hívás: az egész alkalmazás felett jelenik meg, bármelyik oldalon is van a felhasználó.
export default function IncomingCallModal({ call, onAccept, onDecline }: IncomingCallModalProps) {
  const [blocked, setBlocked] = useState(isCallAudioBlocked());

  useEffect(() => {
    const t = setInterval(() => setBlocked(isCallAudioBlocked()), 800);
    return () => clearInterval(t);
  }, []);

  const { peer } = call;
  return (
    <div
      role="alertdialog"
      aria-label={`Bejövő hanghívás ${peer.username} felhasználótól`}
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md call-fade"
      onPointerDown={() => unlockCallAudio()}
    >
      <div
        className="call-pop relative w-full max-w-sm max-h-[90vh] rounded-2xl overflow-x-hidden overflow-y-auto text-center px-4 sm:px-6 pt-8 pb-7"
        style={{
          background: 'linear-gradient(160deg, #1B2040 0%, #151832 55%, #101329 100%)',
          border: '1px solid rgba(125, 105, 255, 0.15)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 80px rgba(118, 85, 245, 0.18)',
          paddingBottom: 'max(1.75rem, env(safe-area-inset-bottom))'
        }}
      >
        <div className="call-aurora absolute -top-24 -left-16 w-72 h-72 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(118,85,245,0.35), transparent 70%)' }} />
        <div className="relative">
          <div className="flex items-center justify-center gap-2 text-[11px] font-bold tracking-[0.18em] uppercase mb-6" style={{ color: '#28C997' }}>
            <Phone className="w-3.5 h-3.5 call-wiggle" /> Bejövő hanghívás
          </div>

          <div className="flex justify-center mb-5">
            <CallAvatar peer={peer} size={116} rings />
          </div>

          <h2 className="text-2xl font-bold truncate" title={peer.displayName} style={{ color: '#F4F3FF' }}>{peer.displayName}</h2>
          <p className="text-sm mt-0.5 truncate" style={{ color: '#999BBE' }}>@{peer.username}</p>
          <p className="text-sm mt-3" style={{ color: '#F4F3FF' }}>
            hív téged<span className="call-dot">.</span><span className="call-dot" style={{ animationDelay: '0.2s' }}>.</span><span className="call-dot" style={{ animationDelay: '0.4s' }}>.</span>
          </p>

          {blocked && (
            <button
              type="button"
              onClick={unlockCallAudio}
              className="mt-4 mx-auto flex items-center gap-1.5 text-xs px-3 py-2 min-h-[40px] max-w-full rounded-full text-left"
              style={{ background: 'rgba(118,85,245,0.18)', color: '#F4F3FF', border: '1px solid rgba(118,85,245,0.35)' }}
            >
              <Volume2 className="w-3.5 h-3.5 flex-shrink-0" /> A böngésző elnémította a csengőt – koppints a bekapcsoláshoz
            </button>
          )}

          <div className="flex items-center justify-center gap-8 sm:gap-10 mt-8">
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={onDecline}
                aria-label="Hívás elutasítása"
                className="w-16 h-16 rounded-full flex items-center justify-center text-white transition active:scale-90 hover:scale-105"
                style={{ background: 'linear-gradient(135deg, #E94B64, #E94B64)', boxShadow: '0 10px 28px rgba(233, 75, 100, 0.4)' }}
              >
                <PhoneOff className="w-7 h-7" />
              </button>
              <span className="text-xs font-medium" style={{ color: '#999BBE' }}>Elutasítás</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={onAccept}
                aria-label="Hívás fogadása"
                className="w-16 h-16 rounded-full flex items-center justify-center text-white transition active:scale-90 hover:scale-105"
                style={{ background: 'linear-gradient(135deg, #28C997, #28C997)', boxShadow: '0 10px 28px rgba(40, 201, 151, 0.45)' }}
              >
                <Phone className="w-7 h-7" />
              </button>
              <span className="text-xs font-medium" style={{ color: '#999BBE' }}>Fogadás</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
