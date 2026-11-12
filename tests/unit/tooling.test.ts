import { describe, expect, it } from 'vitest';

describe('test tooling', () => {
  it('runs TypeScript tests under vitest', () => {
    const answer: number = 6 * 7;
    expect(answer).toBe(42);
  });
});
