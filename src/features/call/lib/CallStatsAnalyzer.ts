// Hívás-statisztika: minőségjelző + adaptív bitráta (csomagvesztés/RTT/jitter alapján).
// A getStats() riport bejegyzéseiből számol; a két minta közötti különbséghez megjegyzi az előzőt.
import type { CallQualityLevel, CallRoute } from '../types';

/** The fields of RTCStats entries this analyzer reads. */
export interface StatsEntry {
  id: string;
  type: string;
  kind?: string;
  nominated?: boolean;
  state?: string;
  selected?: boolean;
  currentRoundTripTime?: number | null;
  codecId?: string;
  mimeType?: string;
  packetsLost?: number;
  packetsReceived?: number;
  jitter?: number | null;
  localCandidateId?: string;
  remoteCandidateId?: string;
  candidateType?: string;
}

export interface CallStatsSample {
  quality: CallQualityLevel;
  rttMs: number | null;
  codec: string | null;
  route: CallRoute | null;
  /** The send bitrate the network allows now. */
  wantedBitrate: number;
}

export class CallStatsAnalyzer {
  #prev: { lost: number; recv: number } | null = null;
  #cleanTicks = 0;

  reset(): void {
    this.#prev = null;
    this.#cleanTicks = 0;
  }

  /**
   * @param currentBitrate the bitrate in effect (0 when none was set yet)
   * @param targetBitrate the bitrate of the chosen quality preset
   */
  analyze(entries: Iterable<StatsEntry>, currentBitrate: number, targetBitrate: number): CallStatsSample {
    const byId = new Map<string, StatsEntry>();
    let inbound: StatsEntry | null = null;
    let pair: StatsEntry | null = null;
    for (const s of entries) {
      byId.set(s.id, s);
      if (s.type === 'inbound-rtp' && s.kind === 'audio') inbound = s;
      if (s.type === 'candidate-pair' && (s.nominated || s.state === 'succeeded') && s.selected !== false && s.currentRoundTripTime != null) pair = s;
    }
    const codecMime = inbound?.codecId ? byId.get(inbound.codecId)?.mimeType : undefined;

    const lossFrac = inbound ? this.#lossSinceLastSample(inbound) : 0;
    const rtt = pair?.currentRoundTripTime != null ? pair.currentRoundTripTime * 1000 : null;
    const jitterMs = inbound?.jitter != null ? inbound.jitter * 1000 : null;

    let quality: CallQualityLevel = 'good';
    if (lossFrac > 0.12 || (rtt && rtt > 500) || (jitterMs && jitterMs > 80)) quality = 'poor';
    else if (lossFrac > 0.04 || (rtt && rtt > 250) || (jitterMs && jitterMs > 35)) quality = 'fair';

    // Romló hálózatnál lejjebb, tartósan jó hálózatnál vissza a beállított célra
    let wantedBitrate = currentBitrate || targetBitrate;
    if (lossFrac > 0.15 || (rtt && rtt > 700)) { wantedBitrate = 16000; this.#cleanTicks = 0; }
    else if (lossFrac > 0.06 || (rtt && rtt > 400)) { wantedBitrate = Math.min(targetBitrate, 24000); this.#cleanTicks = 0; }
    else if (quality === 'fair') { wantedBitrate = Math.min(targetBitrate, 40000); this.#cleanTicks = 0; }
    else if (++this.#cleanTicks >= 4) { wantedBitrate = targetBitrate; }

    let route: CallRoute | null = null;
    if (pair) {
      const local = pair.localCandidateId ? byId.get(pair.localCandidateId) : undefined;
      const remote = pair.remoteCandidateId ? byId.get(pair.remoteCandidateId) : undefined;
      route = local?.candidateType === 'relay' || remote?.candidateType === 'relay' ? 'relay' : 'direct';
    }

    return {
      quality,
      rttMs: rtt != null ? Math.round(rtt) : null,
      codec: codecMime ? codecMime.replace('audio/', '') : null,
      route,
      wantedBitrate
    };
  }

  #lossSinceLastSample(inbound: StatsEntry): number {
    const lost = inbound.packetsLost ?? 0;
    const recv = inbound.packetsReceived ?? 0;
    const prev = this.#prev;
    this.#prev = { lost, recv };
    if (!prev) return 0;
    const dLost = lost - prev.lost;
    const total = dLost + (recv - prev.recv);
    return total > 0 ? Math.max(0, dLost) / total : 0;
  }
}
