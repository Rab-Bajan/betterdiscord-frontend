import React from 'react';
import { Phone, PhoneMissed, PhoneOff, PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { formatDuration } from './CallScreen';

// A hívás eredménye rendszerüzenetként a DM-ben ("Hanghívás · 12:43", "Nem fogadott hanghívás", …)
export function describeCallEvent(ev, myUsername) {
  const iAmCaller = (ev.callerUsername || '').toLowerCase() === (myUsername || '').toLowerCase();
  switch (ev.status) {
    case 'completed':
      return { Icon: iAmCaller ? PhoneOutgoing : PhoneIncoming, color: '#28C997',
        title: `Hanghívás · ${formatDuration(ev.durationSec)}`, sub: iAmCaller ? 'Te hívtad' : `${ev.callerUsername} hívott` };
    case 'declined':
      return { Icon: PhoneOff, color: '#E94B64', title: 'Elutasított hanghívás',
        sub: iAmCaller ? `${ev.calleeUsername} elutasította` : 'Elutasítottad' };
    case 'busy':
      return { Icon: PhoneMissed, color: '#F5B041', title: iAmCaller ? 'Foglalt' : 'Nem fogadott hanghívás',
        sub: iAmCaller ? `${ev.calleeUsername} másik hívásban volt` : `${ev.callerUsername} hívott, de másik hívásban voltál` };
    case 'failed':
      return { Icon: PhoneOff, color: '#F5B041', title: 'Sikertelen hanghívás',
        sub: iAmCaller ? 'A kapcsolat nem jött létre' : `${ev.callerUsername} hívott` };
    default: // missed
      return { Icon: PhoneMissed, color: '#E94B64',
        title: iAmCaller ? 'Nem fogadott hanghívás' : 'Nem fogadott hanghívás',
        sub: iAmCaller
          ? (ev.endReason === 'offline' ? `${ev.calleeUsername} nem volt elérhető` : `${ev.calleeUsername} nem vette fel`)
          : `${ev.callerUsername} hívott` };
  }
}

export default function CallEventMessage({ msg, myUsername, partner, onCallAgain, callDisabled }) {
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
