import { describe, it, expect } from 'vitest';
import { CallStatsAnalyzer, type StatsEntry } from '../../../../src/features/call/lib/CallStatsAnalyzer';

const inbound = (lost: number, recv: number, jitter = 0.01): StatsEntry =>
  ({ id: 'in', type: 'inbound-rtp', kind: 'audio', packetsLost: lost, packetsReceived: recv, jitter, codecId: 'c1' });
const codec: StatsEntry = { id: 'c1', type: 'codec', mimeType: 'audio/opus' };
const pair = (rttSec: number): StatsEntry =>
  ({ id: 'p', type: 'candidate-pair', nominated: true, currentRoundTripTime: rttSec, localCandidateId: 'l', remoteCandidateId: 'r' });
const candidates = (localType: string): StatsEntry[] => [
  { id: 'l', type: 'local-candidate', candidateType: localType },
  { id: 'r', type: 'remote-candidate', candidateType: 'host' }
];

describe('CallStatsAnalyzer', () => {
  it('reports good quality, codec, rtt and a direct route on a clean network', () => {
    const a = new CallStatsAnalyzer();
    const sample = a.analyze([inbound(0, 100), codec, pair(0.05), ...candidates('host')], 0, 64000);
    expect(sample).toEqual({ quality: 'good', rttMs: 50, codec: 'opus', route: 'direct', wantedBitrate: 64000 });
  });

  it('detects relay routes', () => {
    const sample = new CallStatsAnalyzer().analyze([pair(0.05), ...candidates('relay')], 64000, 64000);
    expect(sample.route).toBe('relay');
  });

  it('computes packet loss between samples and drops the bitrate on heavy loss', () => {
    const a = new CallStatsAnalyzer();
    a.analyze([inbound(0, 100)], 64000, 64000);
    const sample = a.analyze([inbound(20, 180)], 64000, 64000); // 20 lost of 100 => 20 %
    expect(sample.quality).toBe('poor');
    expect(sample.wantedBitrate).toBe(16000);
  });

  it('caps to 24 kbps on moderate loss and to 40 kbps on fair quality', () => {
    const a = new CallStatsAnalyzer();
    a.analyze([inbound(0, 100)], 64000, 64000);
    expect(a.analyze([inbound(8, 192)], 64000, 64000).wantedBitrate).toBe(24000); // 8 %
    expect(new CallStatsAnalyzer().analyze([pair(0.3)], 64000, 64000)).toMatchObject({ quality: 'fair', wantedBitrate: 40000 });
  });

  it('returns to the target only after four clean samples', () => {
    const a = new CallStatsAnalyzer();
    const wanted = [1, 2, 3, 4].map(() => a.analyze([pair(0.05)], 16000, 64000).wantedBitrate);
    expect(wanted).toEqual([16000, 16000, 16000, 64000]);
  });

  it('reset() forgets the previous sample and the clean streak', () => {
    const a = new CallStatsAnalyzer();
    a.analyze([inbound(0, 100)], 64000, 64000);
    [1, 2, 3].forEach(() => a.analyze([pair(0.05)], 16000, 64000));
    a.reset();
    expect(a.analyze([inbound(50, 150)], 16000, 64000)).toMatchObject({ quality: 'good', wantedBitrate: 16000 });
  });
});
