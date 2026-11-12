import { describe, it, expect } from 'vitest';
import { PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing } from 'lucide-react';
import { describeCallEvent, formatDuration } from '../../../../src/features/call/lib/callFormat';

describe('formatDuration', () => {
  it('formats mm:ss and h:mm:ss, clamping bad input to zero', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(65.9)).toBe('01:05');
    expect(formatDuration(3723)).toBe('1:02:03');
    expect(formatDuration(-5)).toBe('00:00');
    expect(formatDuration(undefined)).toBe('00:00');
  });
});

describe('describeCallEvent', () => {
  const ev = { callerUsername: 'Anna', calleeUsername: 'Bela', durationSec: 75 };

  it('describes a completed call from both sides (caller matched case-insensitively)', () => {
    expect(describeCallEvent({ ...ev, status: 'completed' }, 'anna')).toEqual({
      Icon: PhoneOutgoing, color: '#28C997', title: 'Hanghívás · 01:15', sub: 'Te hívtad'
    });
    expect(describeCallEvent({ ...ev, status: 'completed' }, 'Bela')).toMatchObject({ Icon: PhoneIncoming, sub: 'Anna hívott' });
  });

  it('describes declined, busy and failed calls', () => {
    expect(describeCallEvent({ ...ev, status: 'declined' }, 'Anna')).toMatchObject({ Icon: PhoneOff, sub: 'Bela elutasította' });
    expect(describeCallEvent({ ...ev, status: 'busy' }, 'Anna')).toMatchObject({ title: 'Foglalt' });
    expect(describeCallEvent({ ...ev, status: 'busy' }, 'Bela')).toMatchObject({ title: 'Nem fogadott hanghívás' });
    expect(describeCallEvent({ ...ev, status: 'failed' }, 'Anna')).toMatchObject({ sub: 'A kapcsolat nem jött létre' });
  });

  it('treats anything else as missed, with the offline reason for the caller', () => {
    expect(describeCallEvent({ ...ev, status: 'missed', endReason: 'offline' }, 'Anna')).toMatchObject({
      Icon: PhoneMissed, sub: 'Bela nem volt elérhető'
    });
    expect(describeCallEvent({ ...ev, status: 'missed' }, 'Anna').sub).toBe('Bela nem vette fel');
    expect(describeCallEvent({ ...ev }, 'Bela').sub).toBe('Anna hívott');
  });
});
