// Socket-réteg: csatlakozás, újracsatlakozás (spec 13), bemenetküldés, RTT-mérés a player_input ackján.
import type { SocketLike, SocketListener } from '../../../../../shared/services/socket/SocketLike';
import {
  JOIN_RATE_LIMITED_CODE,
  parseInitState,
  parseJoinAck,
  parseKicked,
  parsePlayerLeft,
  parsePlayerSnapshot,
  parseTickSync,
  type InitState,
  type PlayerAnimState,
  type PlayerSnapshot,
  type TickSync
} from '../../types';
import {
  DEFAULT_CLOCK,
  parseClock,
  parseDistrictUnlocked,
  parseWeather,
  type ClockState,
  type DistrictUnlocked,
  type WeatherState
} from '../../worldTypes';

export interface PlayerInputPayload {
  readonly seq: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotY: number;
  readonly state: PlayerAnimState;
}

export interface SweepersNetHandlers {
  onInit(state: InitState): void;
  onTick(tick: TickSync): void;
  onPlayerJoined(player: PlayerSnapshot): void;
  onPlayerLeft(id: number): void;
  onJoinError(error: string): void;
  onRtt(ms: number): void;
  /** Another tab of the same account took over the player (`miskolc:kicked`). */
  onKicked(reason: string): void;
  onDistrictUnlocked(event: DistrictUnlocked): void;
  onClock(clock: ClockState): void;
  onWeather(weather: WeatherState): void;
}

/** One RTT probe rides on a player_input ack this often. */
export const RTT_PROBE_INTERVAL_MS = 2000;
/** Waits before re-sending a rate-limited join (bucket 3, refill 2/s): 4 attempts in all, then the error shows. */
export const JOIN_RETRY_DELAYS_MS: readonly number[] = [600, 1200, 2400];
const RTT_TIMEOUT_MS = 5000;

export class SweepersNet {
  readonly #socket: SocketLike;
  readonly #channelId: string;
  readonly #handlers: SweepersNetHandlers;
  readonly #listeners: ReadonlyArray<readonly [string, SocketListener]>;
  readonly #now: () => number;
  #lastProbe = -Infinity;
  #probeInFlight = false;
  #probeId = 0;
  #probeTimer: ReturnType<typeof setTimeout> | null = null;
  #started = false;
  #connected = true;
  /** After a (re)join nothing is sent until init_state rebuilt the world. */
  #awaitingInit = true;
  #kicked = false;
  /** Identifies the current join; acks of an older one are ignored. */
  #joinId = 0;
  #retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** Day lengths of the last init_state; `miskolc:clock` only carries the time. */
  #clockBase: ClockState = DEFAULT_CLOCK;

  constructor(socket: SocketLike, channelId: string, handlers: SweepersNetHandlers, now: () => number = () => performance.now()) {
    this.#socket = socket;
    this.#channelId = channelId;
    this.#handlers = handlers;
    this.#now = now;
    const route = (parse: (v: unknown) => void): SocketListener => (payload) => parse(payload);
    this.#listeners = [
      ['connect', () => {
        this.#connected = true;
        if (!this.#kicked) this.join();
      }],
      ['disconnect', () => {
        this.#connected = false;
        this.#endProbe();
        this.#cancelRetry(); // the reconnect joins afresh
      }],
      ['miskolc:init_state', route((v) => {
        const state = parseInitState(v);
        if (!state || this.#kicked) return;
        this.#awaitingInit = false;
        this.#clockBase = state.clock;
        handlers.onInit(state);
      })],
      ['miskolc:kicked', route((v) => {
        const kicked = parseKicked(v);
        if (!kicked || this.#kicked) return;
        this.#kicked = true;
        this.#endProbe();
        this.#cancelRetry();
        handlers.onKicked(kicked.reason);
      })],
      ['miskolc:tick_sync', route((v) => {
        const tick = parseTickSync(v);
        if (tick) handlers.onTick(tick);
      })],
      ['miskolc:player_joined', route((v) => {
        const player = parsePlayerSnapshot(v);
        if (player) handlers.onPlayerJoined(player);
      })],
      ['miskolc:player_left', route((v) => {
        const id = parsePlayerLeft(v);
        if (id !== null) handlers.onPlayerLeft(id);
      })],
      ['miskolc:district_unlocked', route((v) => {
        const event = parseDistrictUnlocked(v);
        if (event && this.#worldEventsOpen) handlers.onDistrictUnlocked(event);
      })],
      ['miskolc:clock', route((v) => {
        const clock = parseClock(v, this.#clockBase);
        if (!clock || !this.#worldEventsOpen) return;
        this.#clockBase = clock;
        handlers.onClock(clock);
      })],
      ['miskolc:weather', route((v) => {
        const weather = parseWeather(v);
        if (weather && this.#worldEventsOpen) handlers.onWeather(weather);
      })]
    ];
  }

  start(): void {
    if (this.#started) return;
    this.#started = true;
    // a real socket.io client exposes `connected`; test fakes without it count as connected
    this.#connected = !('connected' in this.#socket) || this.#socket.connected === true;
    for (const [event, listener] of this.#listeners) this.#socket.on(event, listener);
    this.join();
  }

  /** (Re)joins; the server answers with init_state, which rebuilds the world. */
  join(): void {
    this.#endProbe();
    this.#cancelRetry();
    this.#awaitingInit = true;
    this.#joinId += 1;
    this.#emitJoin(this.#joinId, 0);
  }

  /** A rate-limited refusal retries after JOIN_RETRY_DELAYS_MS[attempt]; any other refusal is final. */
  #emitJoin(id: number, attempt: number): void {
    this.#socket.emit('miskolc:join_room', { channelId: this.#channelId }, (res: unknown) => {
      if (!this.#started || id !== this.#joinId || this.#kicked) return; // the view is gone or a newer join runs
      const ack = parseJoinAck(res);
      if (!ack || ack.ok) return;
      const delay = ack.code === JOIN_RATE_LIMITED_CODE ? JOIN_RETRY_DELAYS_MS[attempt] : undefined;
      if (delay === undefined) {
        this.#handlers.onJoinError(ack.error);
        return;
      }
      this.#retryTimer = setTimeout(() => {
        this.#retryTimer = null;
        if (this.#started && id === this.#joinId && !this.#kicked) this.#emitJoin(id, attempt + 1);
      }, delay);
    });
  }

  #cancelRetry(): void {
    if (this.#retryTimer !== null) clearTimeout(this.#retryTimer);
    this.#retryTimer = null;
  }

  /** False while disconnected, kicked or waiting for init_state: inputs would only flood a reconnect. */
  get canSend(): boolean {
    return this.#started && this.#connected && !this.#awaitingInit && !this.#kicked;
  }

  /** World state events apply only on top of an init_state (which carries unlocks, clock and weather). */
  get #worldEventsOpen(): boolean {
    return !this.#awaitingInit && !this.#kicked;
  }

  get kicked(): boolean {
    return this.#kicked;
  }

  sendInput(input: PlayerInputPayload): void {
    if (!this.canSend) return;
    const payload = { channelId: this.#channelId, ...input };
    const now = this.#now();
    if (!this.#probeInFlight && now - this.#lastProbe >= RTT_PROBE_INTERVAL_MS) {
      this.#lastProbe = now;
      this.#probeInFlight = true;
      const id = ++this.#probeId;
      this.#probeTimer = setTimeout(() => this.#endProbe(), RTT_TIMEOUT_MS);
      this.#socket.emit('miskolc:player_input', payload, () => {
        if (!this.#probeInFlight || id !== this.#probeId) return; // timed out, rejoined or stopped meanwhile
        this.#endProbe();
        this.#handlers.onRtt(Math.max(0, this.#now() - now));
      });
      return;
    }
    this.#socket.emit('miskolc:player_input', payload);
  }

  stop(): void {
    if (!this.#started) return;
    this.#started = false;
    this.#endProbe();
    this.#cancelRetry();
    for (const [event, listener] of this.#listeners) this.#socket.off(event, listener);
    // a displaced socket is no longer in the world; leaving would act on the new tab's player
    if (!this.#kicked) this.#socket.emit('miskolc:leave_room', { channelId: this.#channelId });
  }

  #endProbe(): void {
    this.#probeInFlight = false;
    if (this.#probeTimer !== null) clearTimeout(this.#probeTimer);
    this.#probeTimer = null;
  }
}
