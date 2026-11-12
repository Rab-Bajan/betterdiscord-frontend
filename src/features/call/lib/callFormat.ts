// Hívások szöveges megjelenítése: időtartam és a hívás-esemény (DM rendszerüzenet) leírása.
import { PhoneMissed, PhoneOff, PhoneIncoming, PhoneOutgoing, type LucideIcon } from 'lucide-react';
import type { CallEvent } from '../types';

/** `mm:ss`, or `h:mm:ss` from one hour up. */
export const formatDuration = (sec: number | null | undefined): string => {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(r).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

export interface CallEventDescription {
  Icon: LucideIcon;
  color: string;
  title: string;
  sub: string;
}

// A hívás eredménye rendszerüzenetként a DM-ben ("Hanghívás · 12:43", "Nem fogadott hanghívás", …)
export function describeCallEvent(ev: CallEvent, myUsername: string | null | undefined): CallEventDescription {
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
        title: 'Nem fogadott hanghívás',
        sub: iAmCaller
          ? (ev.endReason === 'offline' ? `${ev.calleeUsername} nem volt elérhető` : `${ev.calleeUsername} nem vette fel`)
          : `${ev.callerUsername} hívott` };
  }
}
