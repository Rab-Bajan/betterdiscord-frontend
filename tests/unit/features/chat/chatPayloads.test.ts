import { describe, it, expect } from 'vitest';
import { formatFileSize } from '../../../../src/features/chat/lib/fileDisplay';
import { parseChannelMessage, parseChannelMessages, parseTextChannels } from '../../../../src/features/chat/types';
import { parsePresenceList, parseSpeedTestResult, parseVoiceStates } from '../../../../src/shared/lib/presence';

describe('formatFileSize', () => {
  it('formats bytes with one decimal and drops trailing zeros', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(undefined)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB');
  });
});

describe('chat payloads', () => {
  it('keeps valid channels and drops malformed ones', () => {
    expect(parseTextChannels([{ id: 'a', name: 'A' }, { id: 1 }, null])).toEqual([{ id: 'a', name: 'A' }]);
    expect(parseTextChannels(undefined)).toBeNull();
  });

  it('requires an id and a channel for a new channel message', () => {
    expect(parseChannelMessage({ id: 'm1', channelId: 'c', text: 'hi' })).toEqual({ id: 'm1', channelId: 'c', text: 'hi' });
    expect(parseChannelMessage({ id: 'm1' })).toBeNull();
  });

  it('parses the per-channel message map', () => {
    expect(parseChannelMessages({ c: [{ id: 'm' }, 'junk'], d: 'x' })).toEqual({ c: [{ id: 'm' }], d: [] });
  });
});

describe('presence payloads', () => {
  it('parses user lists and voice states', () => {
    const u = { id: 's1', username: 'Anna', voiceChannel: 'v' };
    expect(parsePresenceList([u, { id: 2 }])).toEqual([u]);
    expect(parsePresenceList({})).toBeNull();
    expect(parseVoiceStates({ v: [u], w: null })).toEqual({ v: [u], w: [] });
    expect(parseVoiceStates([])).toBeNull();
  });

  it('accepts complete numeric speed test results only', () => {
    const r = { ping: 10, download: 99.5, upload: 20, jitter: 2, testedAt: 1 };
    expect(parseSpeedTestResult({ ...r, extra: true })).toEqual(r);
    expect(parseSpeedTestResult({ ...r, ping: '10' })).toBeNull();
  });
});
