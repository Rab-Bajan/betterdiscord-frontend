import React from 'react';
import { Phone } from 'lucide-react';
import { describeCallEvent } from '../lib/callFormat';
import type { CallEvent, CallPartner } from '../types';

interface CallEventMessageProps {
  msg: { callEvent: CallEvent; timestamp?: string | null };
  myUsername: string | null | undefined;
  partner: CallPartner | null | undefined;
  onCallAgain?: ((partner: CallPartner) => void) | undefined;
  callDisabled: boolean;
}

// A hívás eredménye rendszerüzenetként a DM-ben, "Hívás újra" gombbal
export default function CallEventMessage({ msg, myUsername, partner, onCallAgain, callDisabled }: CallEventMessageProps) {
  const ev = msg.callEvent;
  const { Icon, color, title, sub } = describeCallEvent(ev, myUsername);
  return (
    <div className="flex items-center gap-2 sm:gap-3 mx-0 sm:mx-3 my-1 px-3 sm:px-3.5 py-2.5 rounded-xl min-w-0" role="status"
      style={{ background: 'rgba(118, 85, 245, 0.07)', border: '1px solid rgba(125, 105, 255, 0.14)' }}>
      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${color}22`, color }}>
        <Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold truncate" title={title} style={{ color: ev.status === 'completed' ? '#F4F3FF' : color }}>{title}</div>
        <div className="text-[11px] truncate" style={{ color: '#999BBE' }}>{sub} · {msg.timestamp}</div>
      </div>
      {onCallAgain && partner && (
        <button
          type="button"
          onClick={() => onCallAgain(partner)}
          disabled={callDisabled}
          className="flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-1.5 min-h-[36px] flex-shrink-0 whitespace-nowrap rounded-xl transition active:scale-95 disabled:opacity-40"
          style={{ background: 'rgba(40, 201, 151, 0.15)', color: '#28C997', border: '1px solid rgba(40, 201, 151, 0.3)' }}
        >
          <Phone className="w-3.5 h-3.5" /> Hívás újra
        </button>
      )}
    </div>
  );
}
