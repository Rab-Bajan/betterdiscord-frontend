// A játék motorja: jelenet, renderelés, irányítás, előrejelzés és a hálózati állapot összefésülése.
import * as THREE from 'three';
import { SweepersRenderer } from './SweepersRenderer';
import { FirstPersonControls } from './FirstPersonControls';
import { InputManager, type InputListener } from '../input/InputManager';
import { stepBody, type BodyState, type MoveMode } from '../movement/MovementModel';
import { PredictionBuffer, SendRateLimiter } from '../net/Prediction';
import { ServerClock } from '../net/interpolation';
import { SceneEnvironment, nextWeatherBlend } from '../world/SceneEnvironment';
import { WorldBuilder } from '../world/WorldBuilder';
import { RemotePlayers } from '../world/RemotePlayers';
import { SweepersAudio } from '../audio/SweepersAudio';
import { AssetCache } from './AssetCache';
import { WeatherFx } from '../world/WeatherFx';
import { WORLD_UNIFORMS, resetWorldUniforms } from '../world/materials';
import { clockLabel, extrapolateClock, lightingAt } from '../world/dayNight';
import { crossesClean } from '../world/lampState';
import { drawBudget } from '../world/drawPlan';
import { FIGURE_DRAW_CALLS, FIGURE_SHADOW_CASTERS, type RadarPin } from '../world/RemotePlayers';
import type { WeatherBlend } from '../world/SceneEnvironment';
import type { PlayerActionPayload, PlayerInputPayload, SweepHitPayload } from '../net/SweepersNet';
import { ackFor, type HexSnapshot, type InitState, type PlayerAnimState, type PlayerSnapshot, type TickSync } from '../../types';
import { DebrisWorld } from '../debris/DebrisWorld';
import { DEBRIS_DRAW_CALLS } from '../debris/DebrisRenderer';
import { PARTICLE_DRAW_CALLS } from '../debris/DebrisParticles';
import { detectorInterval, forwardOf, nearestBuriedCopper, predictUse, type UsePrediction } from '../debris/regions';
import { ITEM_NAMES, isJackpot } from '../debris/tables';
import type { CellPaint } from '../debris/ChunkStore';
import { ToolRig, RIG_DRAW_CALLS } from '../tools/ToolRig';
import { REMOTE_PROP_DRAW_CALLS } from '../tools/RemoteToolProps';
import { ToolSession } from '../tools/ToolSession';
import { chooseSlot } from '../tools/hotbar';
import { HAND_TOOL, KIOSK_RADIUS_M, KOFOLA_SPRINT, WORKBENCH_RADIUS_M, isBroom, toolSpec } from '../tools/catalog';
import { hotbarSlot, type InputAction } from '../input/keymap';
import {
  DEFAULT_PERSONAL,
  RATE_LIMITED_CODE,
  isToastable,
  type ActionAck,
  type ChunkUpdate,
  type PersonalState,
  type SweepAck
} from '../../debrisTypes';
import { SWEEPERS_ERRORS } from '../../errors';
import { DEFAULT_CLOCK, type ClockState, type DistrictUnlocked, type WeatherKind, type WeatherState } from '../../worldTypes';

export interface SweepersHud {
  readonly district: number | null;
  /** One decimal (spec 30 banner: "68.4% TISZTA"). */
  readonly cleanliness: number | null;
  readonly teamFunds: number;
  readonly cash: number;
  /** In-game wall clock "HH:MM". */
  readonly clock: string;
  readonly day: number;
  readonly night: boolean;
  readonly weather: WeatherKind;
  readonly districtLocked: boolean;
}

export interface SweepersDebugStats {
  readonly fps: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
  readonly programs: number;
  /** Planned worst-case draw calls of the loaded city (all passes) vs. the 400 limit. */
  readonly plannedDrawCalls: number | null;
  readonly lod: { readonly near: number; readonly mid: number; readonly far: number; readonly culled: number } | null;
  readonly debris: number;
  readonly conveyors: number;
  readonly rttMs: number | null;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Tools, stamina and pack for the hotbar / gauges (spec 59/60), ~10 Hz when something changed. */
export interface SweepersPlayerHud {
  readonly personal: PersonalState;
  /** Equipped tool as shown (a pending switch shows at once). */
  readonly tool: number;
  /** 0..100, one decimal. */
  readonly stamina: number;
  readonly fx: { readonly stench: boolean; readonly beer: boolean; readonly kofola: boolean };
  /** E opens the MÉH műhely (workbench) / the Büfé here. */
  readonly shop: { readonly workbench: boolean; readonly kiosk: boolean };
  /** The server streams debris (Phase C). */
  readonly debris: boolean;
}

/** Main-pass draws Phase C adds on top of the city plan and the figures (≤ 16, C.7). */
export const PHASE_C_DRAW_CALLS = DEBRIS_DRAW_CALLS + RIG_DRAW_CALLS + REMOTE_PROP_DRAW_CALLS + PARTICLE_DRAW_CALLS;

/** Radar snapshot (spec 30), ~10 Hz. */
export interface SweepersRadar {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly selfColor: string;
  readonly players: readonly RadarPin[];
  readonly hexes: readonly HexSnapshot[];
  readonly unlocked: ReadonlySet<number>;
  readonly weighbridge: { readonly x: number; readonly z: number } | null;
}

export interface SweepersGameCallbacks {
  onReady(): void;
  onHud(hud: SweepersHud): void;
  onDebug(stats: SweepersDebugStats): void;
  onRadar(radar: SweepersRadar): void;
  onLockChange(locked: boolean): void;
  onAction: InputListener;
  /** False while the network cannot take inputs (disconnected / rejoining): nothing is recorded. */
  canSend(): boolean;
  sendInput(input: PlayerInputPayload): void;
  /** Phase C: false when nothing was sent. */
  sendSweep(hit: SweepHitPayload, onAck: (ack: SweepAck) => void): boolean;
  sendAction(action: PlayerActionPayload, onAck: (ack: ActionAck) => void): boolean;
  onPlayer(hud: SweepersPlayerHud): void;
  /** A short Hungarian message for the player. */
  onToast(text: string): void;
}

const KEEPALIVE_MS = 1000;
const DEBUG_INTERVAL_MS = 250;
const RADAR_INTERVAL_MS = 100;
/** Weather cross-fade, seconds; the road soaks in over WET_IN_S and dries over WET_OUT_S. */
const WEATHER_FADE_S = 4;
const WET_IN_S = 20;
const WET_OUT_S = 45;
const STEP_LENGTH = { WALK: 1.9, SPRINT: 2.5 } as const;
const PLAYER_HUD_INTERVAL_MS = 100;
/** After a use the sent state shows the tool animation this long. */
const USE_STATE_MS = 600;
/** Kick contact (C.3): within 0.45 m of a loose can at > 1 m/s; one kick per can per second. */
const KICK_RADIUS_M = 0.45;
const KICK_MIN_SPEED = 1;
const KICK_COOLDOWN_MS = 1000;
/** Kicks share the server's player_action bucket (5/s) with select and dump: ≤ 1 per frame, ≤ 2 per second. */
const KICKS_PER_S = 2;
/** A rate-limited `select` is sent once more after this delay, without a toast. */
const SELECT_RETRY_MS = 250;
const ACID_TOAST_MS = 3000;
/** Beer wobble (59): camera roll of 1.5° at 0.6 Hz. */
const BEER_ROLL_RAD = (1.5 * Math.PI) / 180;
const BEER_HZ = 0.6;
const EXHAUSTED_TOAST_MS = 2500;

export const EMPTY_HUD: SweepersHud = {
  district: null,
  cleanliness: null,
  teamFunds: 0,
  cash: 0,
  clock: '06:00',
  day: 1,
  night: false,
  weather: 'clear',
  districtLocked: false
};

export class SweepersGame {
  readonly input = new InputManager();
  readonly audio = new SweepersAudio();
  readonly #renderer: SweepersRenderer;
  readonly #scene = new THREE.Scene();
  readonly #controls: FirstPersonControls;
  readonly #env: SceneEnvironment;
  readonly #world: WorldBuilder;
  readonly #remotes: RemotePlayers;
  readonly #rain: WeatherFx;
  readonly #debris: DebrisWorld;
  readonly #rig = new ToolRig();
  readonly #tools = new ToolSession(DEFAULT_PERSONAL, 0);
  readonly #prediction = new PredictionBuffer();
  readonly #limiter = new SendRateLimiter(50);
  readonly #clock = new ServerClock();
  readonly #frameClock = new THREE.Clock();
  readonly #cb: SweepersGameCallbacks;
  readonly #resizeObserver: ResizeObserver | null;
  readonly #onWindowResize: () => void;
  readonly #onCanvasClick: () => void;
  readonly #offAction: () => void;
  readonly #offToolAction: () => void;

  readonly #body: BodyState = { x: 0, y: 0, z: 0, vy: 0, grounded: true };
  #mode: MoveMode = 'IDLE';
  #selfId: number | null = null;
  #ready = false;
  #lastSent = { x: NaN, y: NaN, z: NaN, rotY: NaN, state: '', at: -Infinity };
  #stepDistance = 0;
  #rttMs: number | null = null;
  #hud: SweepersHud = EMPTY_HUD;
  #frames = 0;
  #fps = 0;
  #lastDebug = 0;
  #lastRadar = 0;
  #clockState: ClockState = DEFAULT_CLOCK;
  #weather: WeatherState = { kind: 'clear', untilServerTime: null };
  #weatherBlend: WeatherBlend = { from: 'clear', to: 'clear', t: 1 };
  #wetness = 0;
  #selfColor = '#FF7A1A';
  #elapsed = 0;
  #debrisOn = false;
  #lastUseAt = -Infinity;
  #lastPlayerHud = 0;
  #playerHud: SweepersPlayerHud | null = null;
  #kicked = new Map<number, number>();
  #kickTimes: number[] = [];
  #selectRetry: ReturnType<typeof setTimeout> | null = null;
  #inAcid = false;
  #lastAcidToast = -Infinity;
  #lastExhaustedToast = -Infinity;
  #lastDetectorClick = -Infinity;
  #stenchUntil = 0;
  constructor(mount: HTMLElement, callbacks: SweepersGameCallbacks) {
    this.#cb = callbacks;
    this.#renderer = new SweepersRenderer(mount);
    const canvas = this.#renderer.canvas;
    this.#onCanvasClick = () => this.lock();
    this.#onWindowResize = () => this.#renderer.resize(this.#controls.camera);
    let controls: FirstPersonControls | null = null;
    let observer: ResizeObserver | null = null;
    try {
      controls = new FirstPersonControls(canvas, (locked) => {
        this.input.gameplayEnabled = locked;
        if (!locked) this.input.clear();
        callbacks.onLockChange(locked);
      });
      this.#controls = controls;
      this.#env = new SceneEnvironment(this.#scene);
      this.#world = new WorldBuilder(this.#scene);
      this.#remotes = new RemotePlayers(this.#scene);
      this.#rain = new WeatherFx();
      this.#debris = new DebrisWorld((x, z) => this.#world.groundAt(x, z));
      controls.camera.add(this.#rig.root);
      this.#scene.add(controls.camera, this.#rain.root, this.#debris.root);
      resetWorldUniforms();

      this.input.attach(window, canvas);
      this.#offAction = this.input.onAction(callbacks.onAction);
      this.#offToolAction = this.input.onAction((action, edge) => {
        if (edge === 'down') this.#toolAction(action);
      });
      canvas.addEventListener('click', this.#onCanvasClick);

      window.addEventListener('resize', this.#onWindowResize);
      observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(this.#onWindowResize) : null;
      this.#resizeObserver = observer;
      observer?.observe(mount);
      this.#renderer.resize(controls.camera);

      this.#renderer.renderer.setAnimationLoop(() => this.#frame());
    } catch (err) {
      // a half-built game must not leak the WebGL context or global listeners
      window.removeEventListener('resize', this.#onWindowResize);
      observer?.disconnect();
      canvas.removeEventListener('click', this.#onCanvasClick);
      controls?.dispose();
      this.input.dispose();
      this.#scene.clear();
      AssetCache.get().releaseGpu();
      this.#renderer.dispose();
      throw err;
    }
  }

  /** Where the server's path check of the next input starts (null: not checked); F3 / tests. */
  get pathOrigin(): { readonly x: number; readonly z: number } | null {
    return this.#world.collision.pathOrigin;
  }

  /** Pointer lock + audio unlock; must run inside a user gesture. */
  lock(): void {
    if (!this.#ready) return;
    this.audio.unlock();
    this.#controls.lock();
  }

  unlock(): void {
    this.#controls.unlock();
  }

  /** Full (re)build from init_state: first join and every reconnect (spec 13). */
  applyInit(state: InitState): void {
    const now = performance.now();
    this.#selfId = state.selfId;
    this.#clock.observe(state.serverTime, now);
    this.#debrisOn = state.debris !== null;
    this.#cancelSelectRetry();
    this.#debris.reset(); // the server streams the interest disc again; the mask keeps what it shows
    this.#world.load(state.layout, state.hexes, state.unlockedDistricts);
    this.#tools.reset(state.personal, now);
    this.#rig.setTool(state.personal.toolTier);
    this.#stenchUntil = state.personal.fx.stench ?? 0;
    const self = state.players.find((p) => p.id === state.selfId);
    if (self) {
      const ground = this.#world.collision.support(self.x, self.z);
      Object.assign(this.#body, { x: self.x, y: Math.max(self.y, ground), z: self.z, vy: 0, vx: 0, vz: 0, grounded: self.y <= ground + 0.05 });
      this.#controls.setYaw(self.rotY);
      this.#selfColor = self.avatarColor;
    }
    this.#remotes.reset(state.players.filter((p) => p.id !== state.selfId), state.serverTime);
    this.#prediction.reset(this.#body);
    this.#world.collision.setPathOrigin(this.#body.x, this.#body.z);
    this.#lastSent.at = -Infinity;
    this.#clockState = state.clock;
    this.#weather = state.weather;
    this.#weatherBlend = { from: state.weather.kind, to: state.weather.kind, t: 1 };
    this.#wetness = state.weather.kind === 'drizzle' ? 1 : 0;
    this.#hud = { ...this.#hud, teamFunds: state.teamFunds, cash: state.personal.cash, district: null, cleanliness: null, weather: state.weather.kind };
    this.#updateHud(true);
    this.#emitPlayerHud(now, true);
    if (!this.#ready) {
      this.#ready = true;
      this.#cb.onReady();
    }
  }

  applyTick(tick: TickSync): void {
    const now = performance.now();
    this.#clock.observe(tick.t, now);
    const self = this.#selfId;
    const ack = self === null ? null : ackFor(tick, self);
    if (ack !== null) this.#prediction.acknowledge(ack);
    for (const p of tick.players) {
      if (p.id === self) {
        if (!p.corr) continue; // own pose is predicted locally; only corrections apply
        const fixed = this.#prediction.reconcile(p, ack, this.#body);
        Object.assign(this.#body, fixed);
        const origin = this.#prediction.lastSent;
        if (origin) this.#world.collision.setPathOrigin(origin.x, origin.z);
        const ground = this.#world.collision.support(fixed.x, fixed.z);
        this.#body.grounded = fixed.y <= ground + 0.05;
        if (this.#body.grounded) {
          this.#body.vy = 0;
          this.#body.y = Math.max(fixed.y, ground);
        }
        continue;
      }
      this.#remotes.push(p.id, { t: tick.t, x: p.x, y: p.y, z: p.z, rotY: p.rotY }, p.state, p.tool);
    }
    for (const id of tick.gone) this.#remotes.remove(id);
  }

  addPlayer(player: PlayerSnapshot): void {
    if (player.id === this.#selfId) return;
    this.#remotes.add(player, this.#clock.now(performance.now()));
  }

  removePlayer(id: number): void {
    this.#remotes.remove(id);
  }

  /** `miskolc:clock`: re-anchors the local extrapolation. */
  applyClock(clock: ClockState): void {
    this.#clockState = clock;
    this.#updateHud(true);
  }

  /** `miskolc:weather`: cross-fades fog / rain / wet roads to the new kind. */
  applyWeather(weather: WeatherState): void {
    this.#weatherBlend = nextWeatherBlend(this.#weatherBlend, weather.kind);
    this.#weather = weather;
    this.#updateHud(true);
  }

  /** `miskolc:district_unlocked`: the tape comes down and the hex opens for local prediction. */
  applyDistrictUnlocked(event: DistrictUnlocked): void {
    this.#world.setUnlocked(event.unlockedDistricts);
    this.#updateHud(true);
  }

  /**
   * Hex cleanliness changed (Phase C producer): border colour, beacon mode and the HUD follow; the
   * chime plays when it crosses 90 %.
   */
  setHexCleanliness(id: number, value: number): void {
    const result = this.#world.setHexCleanliness(id, value);
    if (!result) return;
    if (crossesClean(result.previous, result.hex.cleanliness)) this.audio.chime();
    this.#updateHud(true);
  }

  /** Spec 18 brush: cleans the asphalt mask softly around (x, z). */
  paintClean(x: number, z: number, radius: number, strength: number): void {
    this.#world.mask?.paint(x, z, radius, strength);
  }

  /** `miskolc:debris_chunk_update`: mirror, mask cells, kicks, and hex cleanliness (`hx`). */
  applyDebris(update: ChunkUpdate): void {
    const now = performance.now();
    const applied = this.#debris.apply(update, now);
    this.#paint(applied.paint);
    for (const kick of applied.kicks) this.audio.sfx('sfx_can_rattle', { x: kick.toX, z: kick.toZ });
    const repainted = new Set<number>();
    for (const { hexId, c10 } of applied.hx) {
      const result = this.#world.setHexCleanliness(hexId, c10 / 10);
      if (!result) continue;
      if (crossesClean(result.previous, result.hex.cleanliness)) this.audio.chime();
      if (result.repainted) repainted.add(hexId);
    }
    // a hex fill repaints its whole hex: the loaded cells go back on top
    this.#paint(this.#debris.cellsInHexes(repainted, (x, z) => this.#world.hexAt(x, z)?.id ?? null));
    if (applied.hx.length > 0) this.#updateHud(true);
  }

  /** `miskolc:personal_update`: the authoritative tools / pack / stamina / effects. */
  applyPersonal(personal: PersonalState): void {
    const now = performance.now();
    const serverNow = this.#clock.now(now);
    const stench = personal.fx.stench ?? 0;
    if (stench > serverNow && this.#stenchUntil <= serverNow) this.#cb.onToast('Bűz! 10 mp-ig lassabban söpörsz.');
    this.#stenchUntil = stench;
    this.#tools.setPersonal(personal, now);
    if (!this.#tools.switching) this.#rig.setTool(personal.toolTier);
    if (personal.cash !== this.#hud.cash) {
      this.#hud = { ...this.#hud, cash: personal.cash };
      this.#cb.onHud(this.#hud);
    }
    this.#emitPlayerHud(now, true);
  }

  /** Where E opens a shop (C.7 "Shop"): the office workbench (8 m) and büfé, or a ticket kiosk (4 m). */
  get shopAccess(): { readonly workbench: boolean; readonly kiosk: boolean } {
    const layout = this.#world.layout;
    if (!layout || !this.#debrisOn) return { workbench: false, kiosk: false };
    const { x, z } = this.#body;
    const office = layout.landmarks.office;
    const workbench = Math.hypot(office.x - x, office.z - z) <= WORKBENCH_RADIUS_M;
    const kiosk = workbench || layout.buildings.some((b) => b.kind === 'ticket_kiosk' && Math.hypot(b.x - x, b.z - z) <= KIOSK_RADIUS_M);
    return { workbench, kiosk };
  }

  /** The player's tool state (shop / tests). */
  get personal(): PersonalState {
    return this.#tools.personal;
  }

  /** Rendered debris instances (F3 "total active debris count"). */
  get debrisRendered(): number {
    return this.#debris.renderer.stats.rendered;
  }

  setRtt(ms: number): void {
    this.#rttMs = ms;
  }

  dispose(): void {
    this.#renderer.renderer.setAnimationLoop(null);
    this.#cancelSelectRetry();
    this.#offAction();
    this.#offToolAction();
    this.input.dispose();
    this.#controls.dispose();
    this.#renderer.canvas.removeEventListener('click', this.#onCanvasClick);
    window.removeEventListener('resize', this.#onWindowResize);
    this.#resizeObserver?.disconnect();
    this.#remotes.dispose();
    this.#rain.dispose();
    this.#debris.dispose();
    this.#rig.dispose();
    this.#world.dispose();
    this.#env.dispose();
    this.#scene.clear();
    this.audio.dispose();
    resetWorldUniforms();
    AssetCache.get().releaseGpu(); // before the context goes away; CPU-side assets stay cached
    this.#renderer.dispose();
  }

  #frame(): void {
    const dt = Math.min(this.#frameClock.getDelta(), 0.1);
    const now = performance.now();
    const yaw = this.#controls.yaw;
    const serverNowStart = this.#clock.now(now);
    const kofola = (this.#tools.personal.fx.kofola ?? 0) > serverNowStart;
    const intent = this.#controls.isLocked && this.#ready
      ? { ...this.input.moveIntent(yaw), sprintMul: kofola ? KOFOLA_SPRINT : 1 }
      : { forward: 0, strafe: 0, sprint: false, jump: false, yaw };

    const wasGrounded = this.#body.grounded;
    const prevX = this.#body.x;
    const prevZ = this.#body.z;
    this.#mode = stepBody(this.#body, intent, dt, this.#world.collision);
    if (!wasGrounded && this.#body.grounded) this.audio.land();
    this.#footsteps(Math.hypot(this.#body.x - prevX, this.#body.z - prevZ));

    const beer = (this.#tools.personal.fx.beer ?? 0) > serverNowStart;
    const roll = beer ? BEER_ROLL_RAD * Math.sin(this.#elapsed * Math.PI * 2 * BEER_HZ) : 0;
    this.#controls.update(this.#body, this.#mode === 'SPRINT', dt, roll);
    const serverNow = this.#clock.now(now);
    this.#environment(serverNow, dt, now);
    this.#remotes.update(serverNow, dt);
    if (this.#ready) {
      this.#phaseC(now, serverNow, dt, yaw, prevX, prevZ);
      this.#maybeSend(now, yaw);
      this.#updateHud(false);
      this.#radarTick(now, yaw);
      this.#emitPlayerHud(now, false);
    }
    this.#paint(this.#debris.update(this.#controls.camera, now, dt));
    this.#renderer.beginFrame();
    this.#world.prepare(this.#renderer.renderer);
    this.#renderer.render(this.#scene, this.#controls.camera);
    this.#debugTick(now);
  }

  /** Day/night from the extrapolated server clock, weather fades, LOD, lamps and rain. */
  #environment(serverNow: number, dt: number, now: number): void {
    this.#elapsed += dt;
    const clockNow = extrapolateClock(this.#clockState, serverNow);
    const light = lightingAt(this.#clockState, clockNow.timeMs);
    const blend = this.#weatherBlend;
    if (blend.t < 1) this.#weatherBlend = { ...blend, t: Math.min(1, blend.t + dt / WEATHER_FADE_S) };
    const raining = this.#weatherBlend.to === 'drizzle' ? this.#weatherBlend.t : this.#weatherBlend.from === 'drizzle' ? 1 - this.#weatherBlend.t : 0;
    const wetTarget = this.#weather.kind === 'drizzle' ? 1 : 0;
    this.#wetness += (wetTarget - this.#wetness) * Math.min(1, dt / (wetTarget > this.#wetness ? WET_IN_S : WET_OUT_S));
    WORLD_UNIFORMS.uNight.value = 1 - light.daylight;
    WORLD_UNIFORMS.uWetness.value = this.#wetness;
    WORLD_UNIFORMS.uTime.value = this.#elapsed;
    this.#env.follow(this.#body.x, this.#body.y, this.#body.z);
    this.#env.apply(light, this.#weatherBlend);
    const camera = this.#controls.camera;
    this.#world.update({ camera, timeSec: this.#elapsed, now, night: 1 - light.daylight, lampsOn: light.lampsOn });
    this.#rain.update(this.#elapsed, camera.position, raining);
  }

  #paint(cells: readonly CellPaint[]): void {
    if (cells.length > 0) this.#world.mask?.paintCells(cells);
  }

  /** Tool uses, kicks, hazards, the detector and the rig, once per frame. */
  #phaseC(now: number, serverNow: number, dt: number, yaw: number, prevX: number, prevZ: number): void {
    const stench = (this.#tools.personal.fx.stench ?? 0) > serverNow;
    this.#rig.setTool(this.#tools.tool);
    this.#rig.update({ dt, time: this.#elapsed, moving: this.#mode !== 'IDLE', sprint: this.#mode === 'SPRINT', animSpeed: stench ? 0.5 : 1 });
    this.audio.setListener(this.#body.x, this.#body.z);
    const surface = this.#world.collision.surfaceAt(this.#body.x, this.#body.z);
    const inAcid = surface === 'acid';
    if (inAcid && !this.#inAcid) {
      this.audio.sfx('sfx_acid_sizzle');
      if (this.#debrisOn && now - this.#lastAcidToast >= ACID_TOAST_MS) {
        this.#lastAcidToast = now;
        this.#cb.onToast('Sav! −20 állóképesség');
      }
    }
    this.#inAcid = inAcid;
    if (!this.#debrisOn) return;
    if (this.#controls.isLocked) this.#useTools(now, yaw, stench);
    if (dt > 0) this.#kicks(now, (this.#body.x - prevX) / dt, (this.#body.z - prevZ) / dt);
    if (this.#tools.tool === 6) {
      const interval = detectorInterval(nearestBuriedCopper(this.#debris.store, this.#body.x, this.#body.z, 6));
      if (interval !== null && now - this.#lastDetectorClick >= interval * 1000) {
        this.#lastDetectorClick = now;
        this.audio.sfx('sfx_detector_click');
      }
    }
  }

  #useTools(now: number, yaw: number, stench: boolean): void {
    const primary = this.input.isDown('primaryUse');
    const secondary = this.input.isDown('secondaryUse');
    if ((!primary && !secondary) || !this.#cb.canSend()) return;
    const alt = !primary;
    const use = this.#tools.tryUse(alt, now, this.#mode);
    if (!use.ok) {
      if (use.reason === 'exhausted' && now - this.#lastExhaustedToast >= EXHAUSTED_TOAST_MS) {
        this.#lastExhaustedToast = now;
        this.#cb.onToast(SWEEPERS_ERRORS.exhausted);
      }
      return;
    }
    const { x, z } = this.#body;
    const prediction: UsePrediction = alt
      ? { cells: [], items: [] }
      : predictUse(this.#debris.store, {
        tool: use.tool,
        x,
        z,
        rotY: yaw,
        personal: this.#tools.personal,
        stench,
        drizzle: this.#weather.kind === 'drizzle',
        surfaceAt: (px, pz) => this.#world.collision.surfaceAt(px, pz),
        districtAt: (px, pz) => this.#world.hexAt(px, pz)?.district ?? null,
        isLocked: (px, pz) => this.#world.collision.isLocked(px, pz)
      });
    const seq = use.seq;
    this.#paint(this.#debris.prediction.begin(seq, prediction.items, prediction.cells, now));
    const sent = this.#cb.sendSweep({ seq, tool: use.tool, alt: alt ? 1 : 0, x, z, rotY: yaw }, (ack) => this.#onSweepAck(seq, use.tool, ack));
    if (!sent) {
      this.#paint(this.#debris.prediction.ack(seq, null));
      return;
    }
    this.#lastUseAt = now;
    this.#rig.use(alt);
    this.#useEffects(use.tool, alt, x, z, yaw, prediction);
  }

  /** Sound and particles of one use (the server decides what really happened). */
  #useEffects(tool: number, alt: boolean, x: number, z: number, yaw: number, prediction: UsePrediction): void {
    const spec = toolSpec(tool);
    if (!spec) return;
    const f = forwardOf(yaw);
    const ground = this.#world.groundAt(x, z);
    if (isBroom(tool) || tool === 6) {
      if (alt) return;
      const head = { x: x + f.x * spec.reach, z: z + f.z * spec.reach };
      const hex = this.#world.hexAt(head.x, head.z);
      const s = this.#world.collision.surfaceAt(head.x, head.z);
      const heavy = this.#weather.kind === 'drizzle' || hex?.district === 3 || s === 'wet' || s === 'mud' || s === 'grease';
      this.audio.sfx(heavy ? 'sfx_broom_gravel' : 'sfx_broom_scratch_asphalt');
      if (prediction.cells.length > 0) this.#debris.particles.puff({ x: head.x, y: this.#world.groundAt(head.x, head.z) + 0.05, z: head.z }, Math.min(14, 4 + prediction.cells.length));
      return;
    }
    const nozzle = { x: x + f.x * 0.9, y: ground + 0.35, z: z + f.z * 0.9 };
    if (tool === 4) {
      this.audio.sfx('sfx_leaf_blower_2t');
      if (!alt) this.#debris.particles.blow(nozzle, f, spec.reach, 10);
    } else if (tool === 5) {
      this.audio.sfx('sfx_vacuum_hum_loop');
      if (alt) {
        this.#debris.particles.blow(nozzle, f, 2, 8);
        return;
      }
      const sources = prediction.cells.slice(0, 16).map((c) => {
        const p = this.#debris.store.paintFromStore(c.chunk, c.idx);
        return p ? { x: p.x, y: this.#world.groundAt(p.x, p.z) + 0.03, z: p.z } : nozzle;
      });
      this.#debris.particles.pull(sources, nozzle);
    } else if (tool === HAND_TOOL && alt) {
      this.audio.sfx('sfx_can_crunch');
    }
  }

  #onSweepAck(seq: number, tool: number, ack: SweepAck): void {
    if (!ack.ok) {
      this.#paint(this.#debris.prediction.ack(seq, null));
      if (isToastable(ack, true)) this.#cb.onToast(ack.error);
      return;
    }
    for (const id of ack.items) {
      const item = this.#debris.store.item(id);
      if (!item) continue;
      if (isJackpot(item.kind)) this.#cb.onToast(`Kincs! ${ITEM_NAMES[item.kind]}`);
      this.audio.sfx(item.kind === 'can' || item.kind === 'cabbage' ? 'sfx_metal_clink' : 'sfx_copper_heavy_thud', { x: item.x, z: item.z });
    }
    if (tool === 5 && ack.kg > 0) this.audio.sfx('sfx_vacuum_slurp');
    this.#paint(this.#debris.prediction.ack(seq, ack.items));
  }

  /** Kick contact (37): the server decides the rest point; the roll arrives as `kicks`. */
  #kicks(now: number, vx: number, vz: number): void {
    if (Math.hypot(vx, vz) <= KICK_MIN_SPEED || !this.#cb.canSend()) return;
    this.#kickTimes = this.#kickTimes.filter((at) => now - at < 1000);
    if (this.#kickTimes.length >= KICKS_PER_S) return;
    const { x, z } = this.#body;
    let nearest: { id: number; d: number } | null = null;
    for (const id of this.#debris.store.hash.near(x, z, KICK_RADIUS_M)) {
      const item = this.#debris.store.item(id);
      if (!item || item.kind !== 'can' || item.stuck || this.#debris.store.isHidden(id)) continue;
      const d = Math.hypot(item.x - x, item.z - z);
      if (d > KICK_RADIUS_M || now - (this.#kicked.get(id) ?? -Infinity) < KICK_COOLDOWN_MS) continue;
      if (!nearest || d < nearest.d) nearest = { id, d };
    }
    if (!nearest) return;
    this.#kicked.set(nearest.id, now);
    this.#kickTimes.push(now);
    this.#cb.sendAction({ kind: 'kick', id: nearest.id, vx, vz }, () => undefined); // a refused kick is silent
    if (this.#kicked.size > 256) for (const [id, at] of this.#kicked) if (now - at >= KICK_COOLDOWN_MS) this.#kicked.delete(id);
  }

  /** Hotbar keys (60) and G (dump). */
  #toolAction(action: InputAction): void {
    if (!this.#ready || !this.#debrisOn) return;
    if (action === 'dumpPack') {
      this.#cb.sendAction({ kind: 'dump' }, (ack) => {
        if (ack.ok) this.#cb.onToast('Kiborítottad a hátizsákot.');
        else if (isToastable(ack, false)) this.#cb.onToast(ack.error);
      });
      return;
    }
    const slot = hotbarSlot(action);
    if (slot === null) return;
    const p = this.#tools.personal;
    const choice = chooseSlot(slot, p.owned, this.#tools.tool);
    if (choice.kind === 'unowned') {
      this.#cb.onToast(SWEEPERS_ERRORS.notOwned);
      return;
    }
    if (choice.kind !== 'select' || this.#tools.switching) return;
    const tool = choice.tool;
    if (!this.#sendSelect(tool, true)) return;
    this.#tools.beginSelect(tool);
    this.#rig.setTool(tool);
    this.#emitPlayerHud(performance.now(), true);
  }

  /** Sends `select`; a rate-limited one (the bucket is shared with kicks) is retried once, silently. */
  #sendSelect(tool: number, retry: boolean): boolean {
    return this.#cb.sendAction({ kind: 'select', tool }, (ack) => {
      if (retry && !ack.ok && ack.code === RATE_LIMITED_CODE) {
        this.#selectRetry = setTimeout(() => {
          this.#selectRetry = null;
          if (!this.#sendSelect(tool, false)) this.#endSelect(false);
        }, SELECT_RETRY_MS);
        return;
      }
      this.#endSelect(ack.ok);
      if (!ack.ok && isToastable(ack, false)) this.#cb.onToast(ack.error);
    });
  }

  #endSelect(ok: boolean): void {
    this.#tools.endSelect(ok, performance.now());
    this.#rig.setTool(this.#tools.tool);
    this.#emitPlayerHud(performance.now(), true);
  }

  #cancelSelectRetry(): void {
    if (this.#selectRetry !== null) clearTimeout(this.#selectRetry);
    this.#selectRetry = null;
  }

  #emitPlayerHud(now: number, force: boolean): void {
    if (!force && now - this.#lastPlayerHud < PLAYER_HUD_INTERVAL_MS) return;
    this.#lastPlayerHud = now;
    const serverNow = this.#clock.now(now);
    const p = this.#tools.personal;
    const fx = { stench: (p.fx.stench ?? 0) > serverNow, beer: (p.fx.beer ?? 0) > serverNow, kofola: (p.fx.kofola ?? 0) > serverNow };
    const hud: SweepersPlayerHud = {
      personal: p,
      tool: this.#tools.tool,
      stamina: Math.round(this.#tools.stamina(now, this.#mode) * 10) / 10,
      fx,
      shop: this.shopAccess,
      debris: this.#debrisOn
    };
    const h = this.#playerHud;
    if (!force && h && h.personal === hud.personal && h.tool === hud.tool && h.stamina === hud.stamina && h.debris === hud.debris
      && h.fx.stench === fx.stench && h.fx.beer === fx.beer && h.fx.kofola === fx.kofola
      && h.shop.workbench === hud.shop.workbench && h.shop.kiosk === hud.shop.kiosk) return;
    this.#playerHud = hud;
    this.#cb.onPlayer(hud);
  }

  /** The animation state sent to the server: the tool's while it is in use, else the locomotion mode. */
  #sendState(now: number): PlayerAnimState {
    if (now - this.#lastUseAt >= USE_STATE_MS) return this.#mode;
    const tool = this.#tools.tool;
    if (tool === 4 || tool === 5) return 'OPERATING_VACUUM';
    return tool === HAND_TOOL ? this.#mode : 'SWEEPING_ARCS';
  }

  #radarTick(now: number, yaw: number): void {
    if (now - this.#lastRadar < RADAR_INTERVAL_MS) return;
    this.#lastRadar = now;
    const wb = this.#world.layout?.landmarks.weighbridge;
    this.#cb.onRadar({
      x: this.#body.x,
      z: this.#body.z,
      yaw,
      selfColor: this.#selfColor,
      players: this.#remotes.pins(),
      hexes: this.#world.hexes,
      unlocked: this.#world.unlocked,
      weighbridge: wb ? { x: wb.x, z: wb.z } : null
    });
  }

  #footsteps(distance: number): void {
    if (!this.#body.grounded || this.#mode === 'IDLE') {
      this.#stepDistance = 0;
      return;
    }
    this.#stepDistance += distance;
    const stride = STEP_LENGTH[this.#mode];
    if (this.#stepDistance >= stride) {
      this.#stepDistance -= stride;
      this.audio.footstep(this.#mode === 'SPRINT');
    }
  }

  #maybeSend(now: number, rotY: number): void {
    if (!this.#cb.canSend()) {
      // offline the server keeps its old pose and the next init_state re-anchors: no stale path check
      this.#world.collision.setPathOrigin(NaN, NaN);
      return;
    }
    if (!this.#limiter.ready(now)) return;
    const { x, y, z } = this.#body;
    const last = this.#lastSent;
    const state = this.#sendState(now);
    const changed = Math.abs(x - last.x) > 0.005 || Math.abs(y - last.y) > 0.005 || Math.abs(z - last.z) > 0.005
      || Math.abs(rotY - last.rotY) > 0.002 || state !== last.state;
    if (!changed && now - last.at < KEEPALIVE_MS) return;
    const seq = this.#prediction.record(this.#body);
    this.#lastSent = { x, y, z, rotY, state, at: now };
    this.#world.collision.setPathOrigin(x, z);
    this.#cb.sendInput({ seq, x, y, z, rotY, state });
  }

  #updateHud(force: boolean): void {
    const hex = this.#world.hexAt(this.#body.x, this.#body.z);
    const district = hex?.district ?? null;
    const cleanliness = hex ? Math.round(hex.cleanliness * 10) / 10 : null;
    const clockNow = extrapolateClock(this.#clockState, this.#clock.now(performance.now()));
    const clock = clockLabel(this.#clockState, clockNow);
    const night = clockNow.timeMs >= this.#clockState.daylightMs;
    // outside the grid the lock follows the sector of the outskirts hex (as the movement rules)
    const districtLocked = district === null ? this.#world.collision.isLocked(this.#body.x, this.#body.z) : !this.#world.unlocked.has(district);
    const h = this.#hud;
    if (!force && district === h.district && cleanliness === h.cleanliness && clock === h.clock && clockNow.day === h.day && districtLocked === h.districtLocked) return;
    this.#hud = { ...h, district, cleanliness, clock, day: clockNow.day, night, weather: this.#weather.kind, districtLocked };
    this.#cb.onHud(this.#hud);
  }

  #debugTick(now: number): void {
    this.#frames += 1;
    const elapsed = now - this.#lastDebug;
    if (elapsed < DEBUG_INTERVAL_MS) return;
    this.#fps = Math.round((this.#frames * 1000) / elapsed);
    this.#frames = 0;
    this.#lastDebug = now;
    const info = this.#renderer.renderer.info;
    const plan = this.#world.plan;
    const players = this.#remotes.count;
    const budget = plan ? drawBudget(plan, players * FIGURE_DRAW_CALLS + PHASE_C_DRAW_CALLS, players * FIGURE_SHADOW_CASTERS) : null;
    const lod = this.#world.lodStats;
    this.#cb.onDebug({
      fps: this.#fps,
      drawCalls: this.#renderer.drawCalls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      plannedDrawCalls: budget?.total ?? null,
      lod: lod ? { ...lod } : null,
      debris: this.#debris.renderer.stats.rendered,
      conveyors: 0,
      rttMs: this.#rttMs,
      x: this.#body.x,
      y: this.#body.y,
      z: this.#body.z
    });
  }
}
