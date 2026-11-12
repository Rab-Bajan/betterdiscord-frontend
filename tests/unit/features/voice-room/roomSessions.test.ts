// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseVoiceSignal } from '../../../../src/features/voice-room/types';

describe('voice ICE candidate guard', () => {
  it('rejects candidates without a candidate string', () => {
    const base = { senderPeerId: 'p', signal: { type: 'ice-candidate' } };
    expect(parseVoiceSignal({ ...base, signal: { ...base.signal, candidate: { candidate: 'c', sdpMid: null } } }))
      .toEqual({ senderPeerId: 'p', signal: { type: 'ice-candidate', candidate: { candidate: 'c', sdpMid: null } } });
    expect(parseVoiceSignal({ ...base, signal: { ...base.signal, candidate: { sdpMid: '0' } } }))
      .toEqual({ senderPeerId: 'p', signal: { type: 'ice-candidate', candidate: null } });
  });
});
