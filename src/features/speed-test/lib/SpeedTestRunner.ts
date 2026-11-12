// Hálózati sebességmérés: ping és jitter a socketen keresztül, letöltés és feltöltés HTTP-n.
// A mérés lépéseiről és a becsült haladásról visszahívásokon keresztül értesít.
import type { SocketLike } from '../../../shared/services/socket/SocketLike';

export type SpeedTestPhase = 'ping' | 'download' | 'upload';

/** What the speed test UI shows: not started, a running phase, or done. */
export type SpeedTestState = 'idle' | SpeedTestPhase | 'completed';

export interface SpeedTestMeasurement {
  ping: number;
  jitter: number;
  download: number;
  upload: number;
}

export interface SpeedTestListener {
  onPhase(phase: SpeedTestPhase): void;
  /** Estimated overall progress, 0..100. */
  onProgress(percent: number): void;
  onPing(ping: number, jitter: number): void;
  onDownload(mbps: number): void;
}

/** What the runner needs from the browser; replaceable in tests. */
export interface SpeedTestEnvironment {
  fetch: typeof fetch;
  now: () => number;
}

const PING_SAMPLES = 6;
const PING_TIMEOUT_MS = 600;
const FALLBACK_RTT_MS = 25;
const DOWNLOAD_MB = 4;
const UPLOAD_MB = 2;
const PROGRESS_TICK_MS = 100;

const toMbps = (bytes: number, seconds: number): number => Number(((bytes * 8) / seconds / (1024 * 1024)).toFixed(1));

/** Average round trip and average change between consecutive round trips (ms, rounded). */
export function pingStats(rtts: readonly number[]): { ping: number; jitter: number } {
  const valid = rtts.length > 0 ? rtts : [FALLBACK_RTT_MS];
  const ping = Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
  let jitterSum = 0;
  for (let i = 1; i < valid.length; i++) {
    jitterSum += Math.abs((valid[i] ?? 0) - (valid[i - 1] ?? 0));
  }
  return { ping, jitter: Math.round(jitterSum / Math.max(valid.length - 1, 1)) };
}

export class SpeedTestRunner {
  readonly #socket: SocketLike | null | undefined;
  readonly #env: SpeedTestEnvironment;

  constructor(socket: SocketLike | null | undefined, env: SpeedTestEnvironment = { fetch: (...a) => fetch(...a), now: () => performance.now() }) {
    this.#socket = socket;
    this.#env = env;
  }

  /** Runs ping, download and upload in order and stores the result on the server. Rejects on network errors. */
  async run(listener: SpeedTestListener): Promise<SpeedTestMeasurement> {
    listener.onPhase('ping');
    const { ping, jitter } = pingStats(await this.#measureRoundTrips(listener));
    listener.onPing(ping, jitter);
    listener.onProgress(30);

    listener.onPhase('download');
    const download = await this.#measureDownload(listener);
    listener.onDownload(download);
    listener.onProgress(68);

    listener.onPhase('upload');
    const upload = await this.#measureUpload(listener);
    listener.onProgress(100);

    const result = { ping, jitter, download, upload };
    this.#socket?.emit('speedtest:save-result', result);
    return result;
  }

  async #measureRoundTrips(listener: SpeedTestListener): Promise<number[]> {
    const rtts: number[] = [];
    for (let i = 0; i < PING_SAMPLES; i++) {
      const start = this.#env.now();
      await new Promise<void>((resolve) => {
        this.#socket?.emit('speedtest:ping', { clientTime: Date.now() });
        this.#onceSocket('speedtest:pong', () => {
          rtts.push(this.#env.now() - start);
          resolve();
        });
        setTimeout(resolve, PING_TIMEOUT_MS); // Timeout védelem
      });
      listener.onProgress(5 + i * 4);
    }
    return rtts;
  }

  #onceSocket(event: string, listener: () => void): void {
    const socket = this.#socket;
    if (!socket) return;
    const once = () => {
      socket.off(event, once);
      listener();
    };
    socket.on(event, once);
  }

  async #measureDownload(listener: SpeedTestListener): Promise<number> {
    const start = this.#env.now();
    const stopProgress = this.#estimateProgress(listener, start, 30, 65);
    try {
      const response = await this.#env.fetch(`/api/speedtest/download?mb=${DOWNLOAD_MB}&t=${Date.now()}`, { cache: 'no-store' });
      const buffer = await response.arrayBuffer();
      return toMbps(buffer.byteLength, (this.#env.now() - start) / 1000);
    } finally {
      stopProgress();
    }
  }

  async #measureUpload(listener: SpeedTestListener): Promise<number> {
    const start = this.#env.now();
    const payload = new Uint8Array(UPLOAD_MB * 1024 * 1024);
    const stopProgress = this.#estimateProgress(listener, start, 68, 95);
    try {
      await this.#env.fetch('/api/speedtest/upload', {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'application/octet-stream' }
      });
      return toMbps(payload.byteLength, (this.#env.now() - start) / 1000);
    } finally {
      stopProgress();
    }
  }

  // A haladás becslése az eltelt idő alapján, amíg a kérés tart
  #estimateProgress(listener: SpeedTestListener, start: number, from: number, max: number): () => void {
    const timer = setInterval(() => {
      const elapsed = (this.#env.now() - start) / 1000;
      if (elapsed > 0) listener.onProgress(Math.min(from + Math.floor(elapsed * 25), max));
    }, PROGRESS_TICK_MS);
    return () => clearInterval(timer);
  }
}
