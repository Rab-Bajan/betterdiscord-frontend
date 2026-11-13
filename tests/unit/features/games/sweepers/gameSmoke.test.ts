// @vitest-environment jsdom
// Smoke test of the real SweepersRenderer + SweepersGame frame loop on a stub WebGL2 context: three r170
// renders the real city (every shadow map, night lamps) through the same calls a browser makes.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SweepersGame, type SweepersDebugStats, type SweepersGameCallbacks, type SweepersHud } from '../../../../../src/features/games/sweepers/lib/engine/SweepersGame';
import type { PlayerInputPayload } from '../../../../../src/features/games/sweepers/lib/net/SweepersNet';
import { DRAW_CALL_LIMIT } from '../../../../../src/features/games/sweepers/lib/world/drawPlan';
import { districtAt } from '../../../../../src/features/games/sweepers/lib/world/hexGrid';
import type { InitState } from '../../../../../src/features/games/sweepers/types';
import { installStubWebGl, type StubDom } from './stubWebGl';
import { realInit } from './fixtures';

interface Harness {
  readonly game: SweepersGame;
  readonly sent: PlayerInputPayload[];
  readonly debug: SweepersDebugStats[];
  readonly huds: SweepersHud[];
  canSend: boolean;
}

let dom: StubDom;
let harness: Harness | null = null;

const start = (): Harness => {
  const mount = document.createElement('div');
  document.body.appendChild(mount);
  const h: { sent: PlayerInputPayload[]; debug: SweepersDebugStats[]; huds: SweepersHud[]; canSend: boolean } = { sent: [], debug: [], huds: [], canSend: true };
  const callbacks: SweepersGameCallbacks = {
    onReady: () => undefined,
    onHud: (hud) => h.huds.push(hud),
    onDebug: (stats) => h.debug.push(stats),
    onRadar: () => undefined,
    onLockChange: () => undefined,
    onAction: () => undefined,
    canSend: () => h.canSend,
    sendInput: (input) => h.sent.push(input)
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
});

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
});
