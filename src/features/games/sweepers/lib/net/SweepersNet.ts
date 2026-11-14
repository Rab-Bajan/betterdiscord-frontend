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
import {
  parseActionAck,
  parseBuyAck,
  parseChunkUpdate,
  parsePersonalState,
  parseSweepAck,
  type ActionAck,
  type BuyAck,
  type ChunkUpdate,
  type PersonalState,
  type SweepAck
} from '../../debrisTypes';
import type { UpgradeItem } from '../tools/catalog';
import {
  parseLogisticsUpdate,
  parsePlaceAck,
  parseOkAck,
  parseStructureSpawned,
  parseTelemetry,
  parseTieAck,
  type LogisticsUpdate,
  type OkAck,
  type PlaceAck,
  type StructRow,
  type Telemetry,
  type TieAck
} from '../../logisticsTypes';
import {
  parseEconomyUpdate,
  parseInspection,
  parseScaleWeighed,
  type EconomyUpdate,
  type Inspection,
  type ScaleWeighed
} from '../../economyTypes';

export interface PlayerInputPayload {
  readonly seq: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotY: number;
  readonly state: PlayerAnimState;
}

/** `miskolc:sweep_hit` without the channel (C.4): one message per stroke / pulse. */
export interface SweepHitPayload {
  readonly seq: number;
  readonly tool: number;
  readonly alt: 0 | 1;
  readonly x: number;
  readonly z: number;
  readonly rotY: number;
}

/** `miskolc:player_action` without the channel (C.4). */
export type PlayerActionPayload =
  | { readonly kind: 'select'; readonly tool: number }
  | { readonly kind: 'kick'; readonly id: number; readonly vx: number; readonly vz: number }
  | { readonly kind: 'dump' };

/** `miskolc:buy_upgrade` without the channel (C.4; D.4 adds `bag` with `tier` and `qty`; E.4 the team items). */
export interface BuyUpgradePayload {
  readonly item: UpgradeItem | 'bag' | 'grease' | 'blueprint' | 'diesel' | 'license';
  readonly tier?: number;
  readonly level?: number;
  readonly qty?: 1 | 5 | 10;
}

/** `miskolc:place_structure` without the channel (D.4). */
export interface PlaceStructurePayload {
  readonly type: number;
  readonly x: number;
  readonly z: number;
  readonly rot: number;
  readonly lvl: number;
}

/** `miskolc:logistics_action` without the channel (D.4). */
export type LogisticsActionPayload =
  | { readonly kind: 'pickup'; readonly id: number }
  | { readonly kind: 'throw'; readonly power: number; readonly pitch: number; readonly rotY: number }
  | { readonly kind: 'clearJam'; readonly id: number }
  | { readonly kind: 'crane'; readonly bag: number; readonly to: number }
  | { readonly kind: 'telemetry'; readonly on: boolean }
  | { readonly kind: 'grease'; readonly id: number; readonly point: number }
  | { readonly kind: 'generator'; readonly on: boolean };

/** Sweep payloads go out with at most 3 decimals (C intro: floats ≤ 3 decimals). */
const r3 = (v: number): number => Math.round(v * 1000) / 1000;

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
  /** `miskolc:debris_chunk_update` (loads and room-wide deltas). */
  onDebris(update: ChunkUpdate): void;
  /** `miskolc:personal_update`: the full PersonalState of this player. */
  onPersonal(state: PersonalState): void;
  /** `miskolc:structure_spawned` (D.5). */
  onStructureSpawned(row: StructRow, by: number): void;
  /** `miskolc:logistics_update` (D.5). */
  onLogistics(update: LogisticsUpdate): void;
  /** `miskolc:logistics_telemetry` (1 Hz while subscribed). */
  onTelemetry(telemetry: Telemetry): void;
  /** `miskolc:economy` (E.5). */
  onEconomy(update: EconomyUpdate): void;
  /** `miskolc:scale_weighed` (E.5). */
  onScaleWeighed(event: ScaleWeighed): void;
  /** `miskolc:inspection` (E.5). */
  onInspection(event: Inspection): void;
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
      })],
      ['miskolc:debris_chunk_update', route((v) => {
        const update = parseChunkUpdate(v);
        if (update && this.#worldEventsOpen) handlers.onDebris(update);
      })],
      ['miskolc:personal_update', route((v) => {
        const state = parsePersonalState(v);
        if (state && this.#worldEventsOpen) handlers.onPersonal(state);
      })],
      ['miskolc:structure_spawned', route((v) => {
        const spawned = parseStructureSpawned(v);
        if (spawned && this.#worldEventsOpen) handlers.onStructureSpawned(spawned.row, spawned.by);
      })],
      ['miskolc:logistics_update', route((v) => {
        const update = parseLogisticsUpdate(v);
        if (update && this.#worldEventsOpen) handlers.onLogistics(update);
      })],
      ['miskolc:logistics_telemetry', route((v) => {
        const telemetry = parseTelemetry(v);
        if (telemetry && this.#worldEventsOpen) handlers.onTelemetry(telemetry);
      })],
      ['miskolc:economy', route((v) => {
        const update = parseEconomyUpdate(v);
        if (update && this.#worldEventsOpen) handlers.onEconomy(update);
      })],
      ['miskolc:scale_weighed', route((v) => {
        const event = parseScaleWeighed(v);
        if (event && this.#worldEventsOpen) handlers.onScaleWeighed(event);
      })],
      ['miskolc:inspection', route((v) => {
        const event = parseInspection(v);
        if (event && this.#worldEventsOpen) handlers.onInspection(event);
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

  /** One tool use; false (nothing sent) while inputs cannot go out. The ack is always parsed. */
  sendSweep(hit: SweepHitPayload, onAck: (ack: SweepAck) => void): boolean {
    if (!this.canSend) return false;
    const payload = { channelId: this.#channelId, seq: hit.seq, tool: hit.tool, alt: hit.alt, x: r3(hit.x), z: r3(hit.z), rotY: r3(hit.rotY) };
    this.#socket.emit('miskolc:sweep_hit', payload, (res: unknown) => {
      if (this.#started) onAck(parseSweepAck(res));
    });
    return true;
  }

  sendAction(action: PlayerActionPayload, onAck: (ack: ActionAck) => void): boolean {
    if (!this.canSend) return false;
    const payload = action.kind === 'kick'
      ? { channelId: this.#channelId, kind: action.kind, id: action.id, vx: r3(action.vx), vz: r3(action.vz) }
      : { channelId: this.#channelId, ...action };
    this.#socket.emit('miskolc:player_action', payload, (res: unknown) => {
      if (this.#started) onAck(parseActionAck(res));
    });
    return true;
  }

  buyUpgrade(buy: BuyUpgradePayload, onAck: (ack: BuyAck) => void): boolean {
    if (!this.canSend) return false;
    this.#socket.emit('miskolc:buy_upgrade', { channelId: this.#channelId, ...buy }, (res: unknown) => {
      if (this.#started) onAck(parseBuyAck(res));
    });
    return true;
  }

  /** `miskolc:tie_bag` (D.4). */
  tieBag(tier: number, onAck: (ack: TieAck) => void): boolean {
    return this.#emit('miskolc:tie_bag', { tier }, parseTieAck, onAck);
  }

  placeStructure(req: PlaceStructurePayload, onAck: (ack: PlaceAck) => void): boolean {
    return this.#emit('miskolc:place_structure', { type: req.type, x: req.x, z: req.z, rot: req.rot, lvl: req.lvl }, parsePlaceAck, onAck);
  }

  deleteStructure(id: number, onAck: (ack: OkAck) => void): boolean {
    return this.#emit('miskolc:delete_structure', { id }, parseOkAck, onAck);
  }

  /** `miskolc:logistics_action`; `parse` is the ack guard of that kind. */
  logisticsAction<T>(action: LogisticsActionPayload, parse: (value: unknown) => T, onAck: (ack: T) => void): boolean {
    const payload = action.kind === 'throw' ? { kind: action.kind, power: r3(action.power), pitch: r3(action.pitch), rotY: r3(action.rotY) } : action;
    return this.#emit('miskolc:logistics_action', payload, parse, onAck);
  }

  #emit<T>(event: string, body: object, parse: (value: unknown) => T, onAck: (ack: T) => void): boolean {
    if (!this.canSend) return false;
    this.#socket.emit(event, { channelId: this.#channelId, ...body }, (res: unknown) => {
      if (this.#started) onAck(parse(res));
    });
    return true;
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
