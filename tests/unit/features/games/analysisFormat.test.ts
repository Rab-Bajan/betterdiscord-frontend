import { describe, it, expect } from 'vitest';
import { formatScore, whiteShare, scoreSign, formatClock, resultLabel, moveLabel } from '../../../../src/features/games/analysis/lib/analysisFormat';
import { CLASSIFICATIONS, CLASSIFICATION_ORDER, classInfo } from '../../../../src/features/games/analysis/lib/classifications';

describe('formatScore', () => {
  it('centipawns as signed pawns with two decimals', () => {
    expect(formatScore({ cp: 35 })).toBe('+0.35');
    expect(formatScore({ cp: -120 })).toBe('-1.20');
    expect(formatScore({ cp: 0 })).toBe('0.00');
  });
  it('clips to ±99', () => {
    expect(formatScore({ cp: 123456 })).toBe('+99.00');
    expect(formatScore({ cp: -123456 })).toBe('-99.00');
  });
  it('mate shows the distance without a sign', () => {
    expect(formatScore({ mate: 3 })).toBe('#3');
    expect(formatScore({ mate: -2 })).toBe('#2');
  });
  it('checkmate terminal wins over any score; missing score is a dash', () => {
    expect(formatScore({ cp: 50 }, { terminal: 'checkmate' })).toBe('#');
    expect(formatScore(null, { terminal: 'checkmate' })).toBe('#');
    expect(formatScore(null)).toBe('–');
    expect(formatScore(undefined, { terminal: 'stalemate' })).toBe('–');
  });
});

describe('whiteShare', () => {
  it('is 0.5 for no score or equality, extreme for mates', () => {
    expect(whiteShare(null)).toBe(0.5);
    expect(whiteShare({ cp: 0 })).toBe(0.5);
    expect(whiteShare({ mate: 1 })).toBe(1);
    expect(whiteShare({ mate: -1 })).toBe(0);
    expect(whiteShare({ mate: 0 })).toBe(0);
  });
  it('is monotonic, symmetric and clamped at ±1000 cp', () => {
    expect(whiteShare({ cp: 100 })).toBeGreaterThan(0.5);
    expect(whiteShare({ cp: 100 }) + whiteShare({ cp: -100 })).toBeCloseTo(1, 12);
    expect(whiteShare({ cp: 300 })).toBeGreaterThan(whiteShare({ cp: 100 }));
    expect(whiteShare({ cp: 5000 })).toBe(whiteShare({ cp: 1000 }));
    expect(whiteShare({ cp: 1000 })).toBeCloseTo(0.9755, 3);
  });
});

it('scoreSign', () => {
  expect(scoreSign({ cp: 20 })).toBe(1);
  expect(scoreSign({ cp: -20 })).toBe(-1);
  expect(scoreSign({ mate: -3 })).toBe(-1);
  expect(scoreSign(null)).toBe(0);
});

it('formatClock', () => {
  expect(formatClock(null)).toBeNull();
  expect(formatClock(undefined)).toBeNull();
  expect(formatClock(0)).toBe('0:00');
  expect(formatClock(59.6)).toBe('1:00');
  expect(formatClock(605)).toBe('10:05');
  expect(formatClock(3661)).toBe('1:01:01');
});

it('resultLabel', () => {
  expect(resultLabel('1-0')).toBe('Fehér nyert');
  expect(resultLabel('0-1')).toBe('Fekete nyert');
  expect(resultLabel('1/2-1/2')).toBe('Döntetlen');
  for (const r of ['*', '', null, undefined]) expect(resultLabel(r)).toBe('Eredmény ismeretlen');
});

it('moveLabel', () => {
  expect(moveLabel({ moveNumber: 12, color: 'white', san: 'Nf3' })).toBe('12. Nf3');
  expect(moveLabel({ moveNumber: 12, color: 'black', san: 'Nf6' })).toBe('12... Nf6');
});

describe('classifications', () => {
  it('the display order lists every classification exactly once', () => {
    expect([...CLASSIFICATION_ORDER].sort()).toEqual(Object.keys(CLASSIFICATIONS).sort());
  });
  it('every classification has a symbol and a label besides its colour (accessibility)', () => {
    for (const info of Object.values(CLASSIFICATIONS)) {
      expect(info.symbol).not.toBe('');
      expect(info.label).not.toBe('');
      expect(info.color).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
  it('classInfo falls back to "good" for unknown ids', () => {
    expect(classInfo('blunder')).toBe(CLASSIFICATIONS.blunder);
    expect(classInfo('nope')).toBe(CLASSIFICATIONS.good);
    expect(classInfo(null)).toBe(CLASSIFICATIONS.good);
    expect(classInfo(undefined)).toBe(CLASSIFICATIONS.good);
  });
});
