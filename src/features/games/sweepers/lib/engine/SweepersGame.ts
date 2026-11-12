// A játék motorja: jelenet, renderelés, irányítás, előrejelzés és a hálózati állapot összefésülése.
import * as THREE from 'three';
import { SweepersRenderer } from './SweepersRenderer';
import { FirstPersonControls } from './FirstPersonControls';
import { InputManager, type InputListener } from '../input/InputManager';
import { stepBody, type BodyState, type MoveMode } from '../movement/MovementModel';
import { PredictionBuffer, SendRateLimiter } from '../net/Prediction';
import { ServerClock } from '../net/interpolation';
import { SceneEnvironment } from '../world/SceneEnvironment';
import { WorldBuilder } from '../world/WorldBuilder';
import { RemotePlayers } from '../world/RemotePlayers';
import { SweepersAudio } from '../audio/SweepersAudio';
import { AssetCache } from './AssetCache';
import type { PlayerInputPayload } from '../net/SweepersNet';
import { ackFor, type InitState, type PlayerSnapshot, type TickSync } from '../../types';

export interface SweepersHud {
  readonly district: number | null;
  readonly cleanliness: number | null;
  readonly teamFunds: number;
  readonly cash: number;
}

export interface SweepersDebugStats {
  readonly fps: number;
  readonly drawCalls: number;
  readonly debris: number;
  readonly conveyors: number;
  readonly rttMs: number | null;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SweepersGameCallbacks {
  onReady(): void;
  onHud(hud: SweepersHud): void;
  onDebug(stats: SweepersDebugStats): void;
  onLockChange(locked: boolean): void;
  onAction: InputListener;
  /** False while the network cannot take inputs (disconnected / rejoining): nothing is recorded. */
  canSend(): boolean;
  sendInput(input: PlayerInputPayload): void;
}

const KEEPALIVE_MS = 1000;
const DEBUG_INTERVAL_MS = 250;
const STEP_LENGTH = { WALK: 1.9, SPRINT: 2.5 } as const;

export class SweepersGame {
  readonly input = new InputManager();
  readonly audio = new SweepersAudio();
  readonly #renderer: SweepersRenderer;
  readonly #scene = new THREE.Scene();
  readonly #controls: FirstPersonControls;
  readonly #env: SceneEnvironment;
  readonly #world: WorldBuilder;
  readonly #remotes: RemotePlayers;
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
  #hud: SweepersHud = { district: null, cleanliness: null, teamFunds: 0, cash: 0 };
  #frames = 0;
  #fps = 0;
  #lastDebug = 0;

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
      this.#scene.add(controls.camera);

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
    const self = state.players.find((p) => p.id === state.selfId);
    if (self) {
      Object.assign(this.#body, { x: self.x, y: self.y, z: self.z, vy: 0, grounded: self.y <= 0.001 });
      this.#controls.setYaw(self.rotY);
    }
    this.#remotes.reset(state.players.filter((p) => p.id !== state.selfId), state.serverTime);
    this.#world.applyHexes(state.hexes);
    this.#prediction.reset(this.#body);
    this.#lastSent.at = -Infinity;
    this.#hud = { ...this.#hud, teamFunds: state.teamFunds, cash: state.personal.cash, district: null, cleanliness: null };
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
        this.#body.grounded = fixed.y <= 0.001;
        if (this.#body.grounded) this.#body.vy = 0;
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
    this.#world.dispose();
    this.#env.dispose();
    this.#scene.clear();
    this.audio.dispose();
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
    this.#mode = stepBody(this.#body, intent, dt);
    if (!wasGrounded && this.#body.grounded) this.audio.land();
    this.#footsteps(Math.hypot(this.#body.x - prevX, this.#body.z - prevZ));

    this.#controls.update(this.#body, this.#mode === 'SPRINT', dt);
    this.#env.follow(this.#body.x, this.#body.z);
    this.#remotes.update(this.#clock.now(now), dt);
    if (this.#ready) {
      this.#maybeSend(now, yaw);
      this.#updateHud(false);
    }
    this.#renderer.render(this.#scene, this.#controls.camera);
    this.#debugTick(now);
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
    if (!this.#cb.canSend() || !this.#limiter.ready(now)) return;
    const { x, y, z } = this.#body;
    const last = this.#lastSent;
    const changed = Math.abs(x - last.x) > 0.005 || Math.abs(y - last.y) > 0.005 || Math.abs(z - last.z) > 0.005
      || Math.abs(rotY - last.rotY) > 0.002 || this.#mode !== last.state;
    if (!changed && now - last.at < KEEPALIVE_MS) return;
    const seq = this.#prediction.record(this.#body);
    this.#lastSent = { x, y, z, rotY, state: this.#mode, at: now };
    this.#cb.sendInput({ seq, x, y, z, rotY, state: this.#mode });
  }

  #updateHud(force: boolean): void {
    const hex = this.#world.hexAt(this.#body.x, this.#body.z);
    const district = hex?.district ?? null;
    const cleanliness = hex ? Math.round(hex.cleanliness) : null;
    if (!force && district === this.#hud.district && cleanliness === this.#hud.cleanliness) return;
    this.#hud = { ...this.#hud, district, cleanliness };
    this.#cb.onHud(this.#hud);
  }

  #debugTick(now: number): void {
    this.#frames += 1;
    const elapsed = now - this.#lastDebug;
    if (elapsed < DEBUG_INTERVAL_MS) return;
    this.#fps = Math.round((this.#frames * 1000) / elapsed);
    this.#frames = 0;
    this.#lastDebug = now;
    this.#cb.onDebug({
      fps: this.#fps,
      drawCalls: this.#renderer.drawCalls,
      debris: 0,
      conveyors: 0,
      rttMs: this.#rttMs,
      x: this.#body.x,
      y: this.#body.y,
      z: this.#body.z
    });
  }
}
