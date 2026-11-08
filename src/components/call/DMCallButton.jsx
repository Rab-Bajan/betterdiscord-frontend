import React from 'react';
import { Phone } from 'lucide-react';

// Hívás gomb a DM fejlécében. Mindig az aktuális beszélgetőpartnert hívja.
export default function DMCallButton({ partner, onCall, disabled, disabledReason }) {
  if (!partner) return null;
  return (
    <button
      type="button"
      onClick={() => onCall(partner)}
      disabled={disabled}
      title={disabled ? disabledReason : `Hanghívás: @${partner.username}`}
      aria-label={`Hanghívás indítása: ${partner.username}`}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white transition active:scale-95 disabled:opacity-45 disabled:cursor-not-allowed"
      style={{ background: 'linear-gradient(135deg, #28C997, #1FAF82)', boxShadow: disabled ? 'none' : '0 4px 14px rgba(40, 201, 151, 0.3)' }}
    >
      <Phone className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">Hívás</span>
    </button>
  );
}
