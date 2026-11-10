import React from 'react';

/**
 * First-person view from inside a locker / trunk: everything is black except a narrow, soft-edged
 * slit where the door does not quite close.
 */
export default function HideOverlay({ spotName = '' }) {
  return (
    <div className="absolute inset-0 z-30 pointer-events-none select-none" aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 62% 11% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.78) 82%, rgba(0,0,0,0.97) 100%)'
        }}
      />
      {/* Metal door edges above and below the slit */}
      <div className="absolute left-0 right-0 top-0 h-[36%] bg-gradient-to-b from-black via-[#07080c] to-transparent opacity-90" />
      <div className="absolute left-0 right-0 bottom-0 h-[36%] bg-gradient-to-t from-black via-[#07080c] to-transparent opacity-90" />
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-black/80 border border-indigo-500/40 text-[11px] text-indigo-200 text-center">
        {spotName ? `${spotName} – ` : ''}maradj csendben.{' '}
        <kbd className="px-1.5 py-0.5 rounded bg-indigo-950 border border-indigo-400/60 text-indigo-200 font-mono font-bold">E</kbd> kilépés
      </div>
    </div>
  );
}
