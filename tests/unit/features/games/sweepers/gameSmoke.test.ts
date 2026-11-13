// @vitest-environment jsdom
// Smoke test of the real SweepersRenderer + SweepersGame frame loop on a stub WebGL2 context: three r170
// renders the real city (every shadow map, night lamps) through the same calls a browser makes.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { SweepersGame, type SweepersDebugStats, type SweepersGameCallbacks, type SweepersHud } from '../../../../../src/features/games/sweepers/lib/engine/SweepersGame';
import type { PlayerInputPayload } from '../../../../../src/features/games/sweepers/lib/net/SweepersNet';
import { DRAW_CALL_LIMIT } from '../../../../../src/features/games/sweepers/lib/world/drawPlan';
import { districtAt, worldToHex } from '../../../../../src/features/games/sweepers/lib/world/hexGrid';
import { AsphaltCleaningShader } from '../../../../../src/features/games/sweepers/lib/world/AsphaltCleaningShader';
import { KOFOLA_SPRINT } from '../../../../../src/features/games/sweepers/lib/tools/catalog';
import type { InitState } from '../../../../../src/features/games/sweepers/types';
import { installStubWebGl, type StubDom } from './stubWebGl';
import { realInit } from './fixtures';
import type { ActionAck, SweepAck } from '../../../../../src/features/games/sweepers/debrisTypes';
import { DEFAULT_PERSONAL, parseChunkUpdate } from '../../../../../src/features/games/sweepers/debrisTypes';
import type { PlayerActionPayload, SweepHitPayload } from '../../../../../src/features/games/sweepers/lib/net/SweepersNet';
import { chunkIdAt } from '../../../../../src/features/games/sweepers/lib/debris/tables';
import { loadEntry, uniformCells } from './debrisHelpers';

interface Harness {
  readonly game: SweepersGame;
  readonly sent: PlayerInputPayload[];
  readonly debug: SweepersDebugStats[];
  readonly huds: SweepersHud[];
  readonly sweeps: Array<{ hit: SweepHitPayload; onAck: (ack: SweepAck) => void }>;
  readonly actions: Array<{ action: PlayerActionPayload; onAck: (ack: ActionAck) => void }>;
  readonly toasts: string[];
  canSend: boolean;
}

let dom: StubDom;
let harness: Harness | null = null;

const start = (): Harness => {
  const mount = document.createElement('div');
  document.body.appendChild(mount);
  const h: Omit<Harness, 'game'> = { sent: [], debug: [], huds: [], sweeps: [], actions: [], toasts: [], canSend: true };
  const callbacks: SweepersGameCallbacks = {
    onReady: () => undefined,
    onHud: (hud) => h.huds.push(hud),
    onDebug: (stats) => h.debug.push(stats),
    onRadar: () => undefined,
    onLockChange: () => undefined,
    onAction: () => undefined,
    canSend: () => h.canSend,
    sendInput: (input) => h.sent.push(input),
    sendSweep: (hit, onAck) => {
      h.sweeps.push({ hit, onAck });
      return h.canSend;
    },
    sendAction: (action, onAck) => {
      h.actions.push({ action, onAck });
      return h.canSend;
    },
    onPlayer: () => undefined,
    onToast: (text) => h.toasts.push(text)
  };
  const game = new SweepersGame(mount, callbacks);
  const out: Harness = Object.assign(h, { game });
  harness = out;
  return out;
};

/** The real fixture init at night (lamps on, both lamp shadow maps render), self at (x, z). */
const nightInit = (x?: number, z?: number): InitState => {
  const init = realInit();
  const players = init.players.map((p) => (p.id === init.selfId && x !== undefined && z !== undefined ? { ...p, x, z } : p));
  return { ...init, players, clock: { ...init.clock, timeMs: init.clock.daylightMs + 60_000 } };
};

const lockPointer = (): void => {
  const canvas = document.querySelector('canvas');
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => canvas });
  // jsdom has no pointer lock; unlocking on dispose releases it
  Object.defineProperty(document, 'exitPointerLock', { configurable: true, writable: true, value: () => undefined });
  document.dispatchEvent(new Event('pointerlockchange'));
};

beforeEach(() => {
  dom = installStubWebGl();
});

afterEach(() => {
  harness?.game.dispose();
  harness = null;
  Reflect.deleteProperty(document, 'pointerLockElement');
  Reflect.deleteProperty(document, 'exitPointerLock');
  dom.restore();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const DEBRIS = { gen: 1, origin: -256, chunkM: 8, cellM: 0.5, n: 64, loadM: 48 };

const key = (code: string): void => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code }));
};

describe('SweepersGame frame loop on a stub WebGL2 context', () => {
  it('renders the real city at night for several frames without throwing, within the draw budget', () => {
    const h = start();
    h.game.applyInit(nightInit());
    for (let i = 0; i < 20; i++) expect(() => dom.frame(30)).not.toThrow();
    // the loop is still alive (a throw in the animation callback stops setAnimationLoop for good)
    const before = h.debug.length;
    for (let i = 0; i < 20; i++) dom.frame(30);
    expect(h.debug.length).toBeGreaterThan(before);
    const last = h.debug.at(-1);
    if (!last) throw new Error('no debug stats');
    // the counter covers the shadow passes too: sun + spot + flood maps each draw the casters
    expect(last.drawCalls).toBeGreaterThan(0);
    expect(last.drawCalls).toBeLessThanOrEqual(DRAW_CALL_LIMIT);
    expect(h.sent.length).toBeGreaterThan(0); // keepalive inputs flow
  });

  it('moves the path origin to every sent pose while walking, and drops it while it cannot send', () => {
    const h = start();
    const init = nightInit();
    h.game.applyInit(init);
    const self = init.players.find((p) => p.id === init.selfId);
    if (!self) throw new Error('no self');
    expect(h.game.pathOrigin).toEqual({ x: self.x, z: self.z });
    lockPointer();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    for (let i = 0; i < 30; i++) dom.frame(20);
    const last = h.sent.at(-1);
    if (!last) throw new Error('nothing sent');
    expect(Math.hypot(last.x - self.x, last.z - self.z)).toBeGreaterThan(1); // really walked
    expect(h.game.pathOrigin).toEqual({ x: last.x, z: last.z });
    // offline: no stale path check (LOW-11); the next init_state re-anchors at the spawn
    h.canSend = false;
    dom.frame(20);
    expect(h.game.pathOrigin).toBeNull();
    h.canSend = true;
    h.game.applyInit(init);
    expect(h.game.pathOrigin).toEqual({ x: self.x, z: self.z });
  });

  it('shows the outskirts lock on the HUD (sector rule outside the grid)', () => {
    const h = start();
    expect(districtAt(-250, -10)).toBe(3);
    h.game.applyInit(nightInit(-250, -10)); // only district 0 is open in the fixture
    dom.frame(30);
    const hud = h.huds.at(-1);
    expect(hud?.district).toBeNull();
    expect(hud?.districtLocked).toBe(true);
  });

  it('Phase C: a broom stroke sends sweep_hit, hides the predicted can, and the server delta settles it', () => {
    const h = start();
    const base = nightInit();
    const self = base.players.find((p) => p.id === base.selfId);
    if (!self) throw new Error('no self');
    const debris = { gen: 1, origin: -256, chunkM: 8, cellM: 0.5, n: 64, loadM: 48 };
    const personal = { ...DEFAULT_PERSONAL, owned: 0b11000111, toolTier: 2, caps: { bufKg: 8, packKg: 10, packL: 8 } };
    h.game.applyInit({ ...base, debris, personal });
    // a can 1.2 m ahead (yaw 0 looks down −z), in the loaded chunk of the player
    const canX = self.x;
    const canZ = self.z - 1.2;
    const chunk = chunkIdAt(canX, canZ);
    if (chunk === null || chunk !== chunkIdAt(self.x, self.z)) throw new Error('fixture spawn moved');
    const load = parseChunkUpdate({ t: 1, load: [loadEntry(chunk, uniformCells(0xff), [{ id: 0x10001, kind: 'can', x: canX, z: canZ, massKg: 0.05 }])] });
    if (!load) throw new Error('bad load');
    h.game.applyDebris(load);
    for (let i = 0; i < 12; i++) dom.frame(30);
    expect(h.debug.at(-1)?.debris).toBe(1); // F3: rendered debris instances

    lockPointer();
    const canvas = document.querySelector('canvas');
    canvas?.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    dom.frame(30);
    const first = h.sweeps[0];
    if (!first) throw new Error('no sweep_hit');
    expect(first.hit).toMatchObject({ seq: 1, tool: 2, alt: 0 });
    expect(Math.hypot(first.hit.x - self.x, first.hit.z - self.z)).toBeLessThan(0.5);
    // held LMB: one use per 0.5 s cadence, not one per frame
    for (let i = 0; i < 10; i++) dom.frame(30);
    expect(h.sweeps).toHaveLength(1);
    expect(h.debug.at(-1)?.debris).toBe(0); // predicted pickup: hidden at once
    first.onAck({ ok: true, seq: 1, kg: 0.4, items: [0x10001], pushed: false });
    for (let i = 0; i < 20; i++) dom.frame(30);
    expect(h.sweeps.length).toBeGreaterThanOrEqual(2);
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
    for (const later of h.sweeps.slice(1)) later.onAck({ ok: false, error: 'x', code: 'SWEEPERS_TOO_FAST' });
    for (let i = 0; i < 40; i++) dom.frame(30);
    expect(h.debug.at(-1)?.debris).toBe(0); // collected per the ack: it stays hidden until its del
    const del = parseChunkUpdate({ t: 2, del: [0x10001], cells: [chunk, 0, 0x00], hx: [[0, 999]] });
    if (!del) throw new Error('bad delta');
    h.game.applyDebris(del);
    for (let i = 0; i < 12; i++) dom.frame(30);
    expect(h.debug.at(-1)?.debris).toBe(0);
    expect(h.toasts).toEqual([]); // TOO_FAST is silent
    // the server's personal_update brings the buffer; the sent anim state showed the sweep
    expect(h.sent.some((s) => s.state === 'SWEEPING_ARCS')).toBe(true);
  });

  it('Phase C: hotbar keys select owned tools, refuse unowned ones locally, G dumps the pack', () => {
    const h = start();
    const debris = { gen: 1, origin: -256, chunkM: 8, cellM: 0.5, n: 64, loadM: 48 };
    h.game.applyInit({ ...nightInit(), debris, personal: { ...DEFAULT_PERSONAL, owned: 0b10000101, toolTier: 0 } });
    lockPointer();
    const key = (code: string): void => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    };
    key('Digit2'); // blower not owned
    expect(h.actions).toEqual([]);
    expect(h.toasts).toEqual(['Ez az eszköz még nincs meg neked.']);
    key('Digit1'); // best owned broom: 2
    expect(h.actions[0]?.action).toEqual({ kind: 'select', tool: 2 });
    key('Digit5'); // ignored while the switch is pending
    expect(h.actions).toHaveLength(1);
    h.actions[0]?.onAck({ ok: true });
    expect(h.game.personal.toolTier).toBe(2);
    key('Digit5');
    expect(h.actions[1]?.action).toEqual({ kind: 'select', tool: 7 });
    h.actions[1]?.onAck({ ok: false, error: 'Nem ez az eszköz van a kezedben.', code: 'notEquipped' });
    expect(h.game.personal.toolTier).toBe(2);
    key('KeyG');
    expect(h.actions[2]?.action).toEqual({ kind: 'dump' });
    h.actions[2]?.onAck({ ok: true });
    expect(h.toasts.slice(1)).toEqual(['Nem ez az eszköz van a kezedben.', 'Kiborítottad a hátizsákot.']);
  });

  it('Phase C: kicks are limited to one per frame (the nearest can) and two per second', () => {
    const h = start();
    const base = nightInit();
    const self = base.players.find((p) => p.id === base.selfId);
    if (!self) throw new Error('no self');
    h.game.applyInit({ ...base, debris: DEBRIS, personal: { ...DEFAULT_PERSONAL } });
    const chunk = chunkIdAt(self.x, self.z);
    if (chunk === null) throw new Error('fixture spawn moved');
    // 10 cans in contact around the feet (≤ 0.3 m), the nearest at 0.05 m
    const cans = Array.from({ length: 10 }, (_, i) => {
      const r = 0.05 + i * 0.025;
      const a = (i / 10) * Math.PI * 2;
      return { id: 0x20001 + i, kind: 'can' as const, x: self.x + Math.cos(a) * r, z: self.z + Math.sin(a) * r, massKg: 0.05 };
    });
    const load = parseChunkUpdate({ t: 1, load: [loadEntry(chunk, uniformCells(0), cans)] });
    if (!load) throw new Error('bad load');
    h.game.applyDebris(load);
    lockPointer();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    const kicks = (): Array<{ kind: string; id?: number }> => h.actions.map((a) => a.action).filter((a) => a.kind === 'kick');
    let first = -1;
    for (let i = 0; i < 30 && first < 0; i++) {
      dom.frame(30);
      if (kicks().length > 0) first = i;
    }
    expect(kicks()).toHaveLength(1); // one per frame, even with 10 cans in contact
    dom.frame(30);
    expect(kicks()).toHaveLength(2); // the next frame kicks the next can
    for (let i = 0; i < 25; i++) dom.frame(30); // < 1 s after the first kick
    expect(kicks().length).toBeLessThanOrEqual(2);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  });

  it('Phase C: a rate-limited select is retried once after 250 ms without a toast', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const h = start();
    h.game.applyInit({ ...nightInit(), debris: DEBRIS, personal: { ...DEFAULT_PERSONAL, owned: 0b10000101, toolTier: 0 } });
    lockPointer();
    key('Digit1');
    expect(h.actions.map((a) => a.action)).toEqual([{ kind: 'select', tool: 2 }]);
    const limited: ActionAck = { ok: false, error: 'Túl gyorsan próbálkozol, várj egy kicsit.', code: 'SWEEPERS_RATE_LIMITED' };
    h.actions[0]?.onAck(limited);
    expect(h.game.personal.toolTier).toBe(0);
    vi.advanceTimersByTime(249);
    expect(h.actions).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(h.actions[1]?.action).toEqual({ kind: 'select', tool: 2 });
    h.actions[1]?.onAck({ ok: true });
    expect(h.game.personal.toolTier).toBe(2);
    expect(h.toasts).toEqual([]);
    // a second refusal in a row gives up and toasts
    key('Digit5');
    h.actions[2]?.onAck(limited);
    vi.advanceTimersByTime(250);
    h.actions[3]?.onAck(limited);
    expect(h.actions).toHaveLength(4);
    expect(h.toasts).toEqual([limited.error]);
    expect(h.game.personal.toolTier).toBe(2);
  });

  it('Phase C: the stench toast shows only when the previous stench had expired', () => {
    const h = start();
    const base = nightInit();
    h.game.applyInit({ ...base, debris: DEBRIS, personal: { ...DEFAULT_PERSONAL } });
    const stench = (until: number): void => h.game.applyPersonal({ ...DEFAULT_PERSONAL, fx: { stench: until } });
    stench(base.serverTime + 10_000);
    stench(base.serverTime + 10_600); // the next stroke near the cabbage extends it
    stench(base.serverTime + 11_200);
    expect(h.toasts).toEqual(['Bűz! 10 mp-ig lassabban söpörsz.']);
    for (let i = 0; i < 12; i++) dom.frame(1000); // 12 s later it has expired
    stench(base.serverTime + 30_000);
    expect(h.toasts).toHaveLength(2);
  });

  it('Phase C: an hx change repaints the loaded cells of that hex on top of its fill', () => {
    const h = start();
    const base = nightInit();
    const self = base.players.find((p) => p.id === base.selfId);
    if (!self) throw new Error('no self');
    h.game.applyInit({ ...base, debris: DEBRIS, personal: { ...DEFAULT_PERSONAL } });
    const chunk = chunkIdAt(self.x, self.z);
    const { q, r } = worldToHex(self.x, self.z);
    const hex = base.hexes.find((x) => x.q === q && x.r === r);
    if (chunk === null || !hex) throw new Error('fixture spawn moved');
    const load = parseChunkUpdate({ t: 1, load: [loadEntry(chunk, uniformCells(0x50))] });
    if (!load) throw new Error('bad load');
    h.game.applyDebris(load);
    const painted = vi.spyOn(AsphaltCleaningShader.prototype, 'paintCells');
    const hx = parseChunkUpdate({ t: 2, hx: [[hex.id, Math.round(hex.cleanliness * 10) + 7]] });
    if (!hx) throw new Error('bad hx');
    h.game.applyDebris(hx);
    const cells = painted.mock.calls.flatMap(([c]) => [...c]);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((c) => c.byte === 0x50)).toBe(true);
  });

  it('Phase C: the mask uploads only the painted cell instances', () => {
    const h = start();
    const base = nightInit();
    const self = base.players.find((p) => p.id === base.selfId);
    if (!self) throw new Error('no self');
    h.game.applyInit({ ...base, debris: DEBRIS, personal: { ...DEFAULT_PERSONAL } });
    dom.frame(30);
    const chunk = chunkIdAt(self.x, self.z);
    if (chunk === null) throw new Error('fixture spawn moved');
    const ranges = vi.spyOn(THREE.BufferAttribute.prototype, 'addUpdateRange');
    const cells = parseChunkUpdate({ t: 1, cells: [chunk, 0, 0x11, chunk, 1, 0x22, chunk, 2, 0x33] });
    if (!cells) throw new Error('bad cells');
    h.game.applyDebris(cells);
    dom.frame(30);
    const calls = ranges.mock.calls.map(([start, count]) => [start, count]);
    expect(calls).toContainEqual([0, 3 * 16]);
    expect(calls).toContainEqual([0, 3 * 3]);
  });

  it('Phase C: Kofola makes the sprint 15 % faster in the game loop', () => {
    const h = start();
    const base = nightInit();
    const walk = (kofola: boolean): number => {
      h.game.applyInit({ ...base, debris: DEBRIS, personal: { ...DEFAULT_PERSONAL, fx: kofola ? { kofola: base.serverTime + 600_000 } : {} } });
      const self = base.players.find((p) => p.id === base.selfId);
      if (!self) throw new Error('no self');
      dom.frame(30); // the frame clock starts on the first frame (dt 0)
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      for (let i = 0; i < 10; i++) dom.frame(30);
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' }));
      dom.frame(300); // standing still: the next F3 sample shows where the walk ended
      const pose = h.debug.at(-1);
      if (!pose) throw new Error('no debug stats');
      return Math.hypot(pose.x - self.x, pose.z - self.z);
    };
    lockPointer();
    const plain = walk(false);
    const fast = walk(true);
    expect(plain).toBeGreaterThan(0.5);
    expect(fast / plain).toBeCloseTo(KOFOLA_SPRINT, 1);
  });
});
