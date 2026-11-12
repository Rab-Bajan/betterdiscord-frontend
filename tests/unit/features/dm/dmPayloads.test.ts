import { describe, it, expect } from 'vitest';
import { dmKeyFor } from '../../../../src/features/dm/hooks/useDirectMessages';
import { isDmPartner, parseDirectMessage, parseDmHistory } from '../../../../src/features/dm/types';

describe('dmKeyFor', () => {
  it('is order- and case-independent', () => {
    expect(dmKeyFor('Bela', 'anna')).toBe('anna::bela');
    expect(dmKeyFor('anna', 'BELA')).toBe(dmKeyFor('bela', 'Anna'));
    expect(dmKeyFor(null, 'x')).toBe('::x');
  });
});

describe('dm payloads', () => {
  it('requires a dmKey on direct messages', () => {
    expect(parseDirectMessage({ id: 'm', dmKey: 'a::b', text: 'szia' })).toEqual({ id: 'm', dmKey: 'a::b', text: 'szia' });
    expect(parseDirectMessage({ id: 'm' })).toBeNull();
  });

  it('parses dm:history with defaults', () => {
    expect(parseDmHistory({ dmKey: 'a::b', messages: [{ id: 'm' }, 3] })).toEqual({ partnerUsername: undefined, dmKey: 'a::b', messages: [{ id: 'm' }] });
    expect(parseDmHistory({ partnerUsername: 'b' })).toEqual({ partnerUsername: 'b', dmKey: undefined, messages: [] });
  });

  it('accepts partners without an id (offline at send time)', () => {
    expect(isDmPartner({ username: 'b' })).toBe(true);
    expect(isDmPartner({ id: 'x' })).toBe(false);
  });
});
