import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractYouTubeId, getLiveTime } from '../../../../src/features/activities/watch-party/lib/youtube';

const ID = 'dQw4w9WgXcQ';

describe('extractYouTubeId', () => {
  it.each([
    [ID],
    [`  ${ID}  `],
    [`https://www.youtube.com/watch?v=${ID}`],
    [`https://m.youtube.com/watch?feature=share&v=${ID}&t=10`],
    [`https://youtu.be/${ID}?si=abc`],
    [`https://www.youtube.com/embed/${ID}`],
    [`https://www.youtube.com/v/${ID}`],
    [`https://youtube.com/shorts/${ID}`],
    [`https://youtube.com/live/${ID}?feature=share`],
    [`HTTPS://WWW.YOUTUBE.COM/watch?v=${ID}`]
  ])('%s', (input) => {
    expect(extractYouTubeId(input)).toBe(ID);
  });

  it('returns empty string for non-YouTube or malformed input', () => {
    for (const s of ['', null, undefined, 'dQw4w9WgXc', 'https://example.com/watch?v=abc', 'https://vimeo.com/123', 'hello world']) {
      expect(extractYouTubeId(s)).toBe('');
    }
  });
});

describe('getLiveTime', () => {
  afterEach(() => vi.useRealTimers());

  it('missing state is 0, paused state is its currentTime', () => {
    expect(getLiveTime(null)).toBe(0);
    expect(getLiveTime({})).toBe(0);
    expect(getLiveTime({ currentTime: 12, isPlaying: false, receivedAt: 1 })).toBe(12);
    expect(getLiveTime({ currentTime: 12, isPlaying: true })).toBe(12);
  });

  it('playing state adds the time elapsed since it arrived (never negative)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    expect(getLiveTime({ currentTime: 10, isPlaying: true, receivedAt: 97_500 })).toBe(12.5);
    expect(getLiveTime({ currentTime: 10, isPlaying: true, receivedAt: 105_000 })).toBe(10);
  });
});
