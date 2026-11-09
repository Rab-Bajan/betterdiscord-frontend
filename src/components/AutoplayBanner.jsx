import React from 'react';
import { Volume2 } from 'lucide-react';

// Akkor jelenik meg, ha a böngésző letiltotta az automatikus hanglejátszást
export default function AutoplayBanner({ onUnlock }) {
  return (
    <div
      onClick={onUnlock}
      className="px-4 py-2 pt-safe flex items-center justify-between gap-3 text-xs font-bold cursor-pointer transition shadow-md z-50 flex-shrink-0 animate-bounce select-none text-white"
      style={{ background: 'linear-gradient(135deg, #7655F5, #536CFF)' }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Volume2 className="w-4 h-4 flex-shrink-0" />
        <span>A böngésződ blokkolta a hangot. Kattints ide (vagy bárhová az ablakban) az élő hang engedélyezéséhez!</span>
      </div>
      <span className="bg-white/20 px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex-shrink-0 whitespace-nowrap">Hang Bekapcsolása 🔊</span>
    </div>
  );
}
