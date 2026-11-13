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
import type { PlayerInputPayload } from '../net/SweepersNet';
import { ackFor, type HexSnapshot, type InitState, type PlayerSnapshot, type TickSync } from '../../types';
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
}

const KEEPALIVE_MS = 1000;
const DEBUG_INTERVAL_MS = 250;
const RADAR_INTERVAL_MS = 100;
/** Weather cross-fade, seconds; the road soaks in over WET_IN_S and dries over WET_OUT_S. */
const WEATHER_FADE_S = 4;
const WET_IN_S = 20;
const WET_OUT_S = 45;
const STEP_LENGTH = { WALK: 1.9, SPRINT: 2.5 } as const;

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
  readonly #prediction = new PredictionBuffer();
  readonly #limiter = new SendRateLimiter(50);
  readonly #clock = new ServerClock();
  readonly #frameClock = new THREE.Clock();
  readonly #cb: SweepersGameCallbacks;
  readonly #resizeObserver: ResizeObserver | null;
  readonly #onWindowResize: () => void;
  readonly #onCanvasClick: () => void;
  readonly #offAction: () => void;

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
      this.#scene.add(controls.camera, this.#rain.root);
      resetWorldUniforms();

      this.input.attach(window, canvas);
      this.#offAction = this.input.onAction(callbacks.onAction);
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
    this.#world.load(state.layout, state.hexes, state.unlockedDistricts);
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
      this.#remotes.push(p.id, { t: tick.t, x: p.x, y: p.y, z: p.z, rotY: p.rotY }, p.state);
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

  /** Spec 18 hook for Phase C: cleans the asphalt mask around (x, z). */
  paintClean(x: number, z: number, radius: number, strength: number): void {
    this.#world.mask?.paint(x, z, radius, strength);
  }

  setRtt(ms: number): void {
    this.#rttMs = ms;
  }

  dispose(): void {
    this.#renderer.renderer.setAnimationLoop(null);
    this.#offAction();
    this.input.dispose();
    this.#controls.dispose();
    this.#renderer.canvas.removeEventListener('click', this.#onCanvasClick);
    window.removeEventListener('resize', this.#onWindowResize);
    this.#resizeObserver?.disconnect();
    this.#remotes.dispose();
    this.#rain.dispose();
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
    const intent = this.#controls.isLocked && this.#ready
      ? this.input.moveIntent(yaw)
      : { forward: 0, strafe: 0, sprint: false, jump: false, yaw };

    const wasGrounded = this.#body.grounded;
    const prevX = this.#body.x;
    const prevZ = this.#body.z;
    this.#mode = stepBody(this.#body, intent, dt, this.#world.collision);
    if (!wasGrounded && this.#body.grounded) this.audio.land();
    this.#footsteps(Math.hypot(this.#body.x - prevX, this.#body.z - prevZ));

    this.#controls.update(this.#body, this.#mode === 'SPRINT', dt);
    const serverNow = this.#clock.now(now);
    this.#environment(serverNow, dt, now);
    this.#remotes.update(serverNow, dt);
    if (this.#ready) {
      this.#maybeSend(now, yaw);
      this.#updateHud(false);
      this.#radarTick(now, yaw);
    }
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
    const changed = Math.abs(x - last.x) > 0.005 || Math.abs(y - last.y) > 0.005 || Math.abs(z - last.z) > 0.005
      || Math.abs(rotY - last.rotY) > 0.002 || this.#mode !== last.state;
    if (!changed && now - last.at < KEEPALIVE_MS) return;
    const seq = this.#prediction.record(this.#body);
    this.#lastSent = { x, y, z, rotY, state: this.#mode, at: now };
    this.#world.collision.setPathOrigin(x, z);
    this.#cb.sendInput({ seq, x, y, z, rotY, state: this.#mode });
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
    const budget = plan ? drawBudget(plan, players * FIGURE_DRAW_CALLS, players * FIGURE_SHADOW_CASTERS) : null;
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
      debris: 0,
      conveyors: 0,
      rttMs: this.#rttMs,
      x: this.#body.x,
      y: this.#body.y,
      z: this.#body.z
    });
  }
}
