import { describe, it, expect } from 'vitest';
import { InputManager } from '../../../../../src/features/games/sweepers/lib/input/InputManager';
import { actionForKey, actionForMouseButton, capturesDefault, hotbarSlot } from '../../../../../src/features/games/sweepers/lib/input/keymap';

describe('sweepers key map (spec 9)', () => {
  it('maps every bound key', () => {
    const expected: Record<string, string> = {
      KeyW: 'moveForward', KeyA: 'moveLeft', KeyS: 'moveBack', KeyD: 'moveRight',
      ShiftLeft: 'sprint', ShiftRight: 'sprint', Space: 'jump',
      KeyQ: 'tieBag', KeyE: 'interact', KeyB: 'toggleBuild', KeyR: 'rotateBuild', Tab: 'togglePda',
      Digit1: 'hotbar1', Digit2: 'hotbar2', Digit3: 'hotbar3', Digit4: 'hotbar4', Digit5: 'hotbar5', Digit6: 'hotbar6',
      KeyV: 'voiceWheel', F3: 'toggleDebug', F11: 'toggleFullscreen', KeyM: 'toggleMap',
      KeyL: 'headlights', KeyK: 'beacon', KeyH: 'horn'
    };
    for (const [code, action] of Object.entries(expected)) expect(actionForKey(code), code).toBe(action);
    expect(actionForKey('Digit7')).toBeNull();
    expect(actionForKey('KeyZ')).toBeNull();
  });
  it('maps mouse buttons', () => {
    expect(actionForMouseButton(0)).toBe('primaryUse');
    expect(actionForMouseButton(2)).toBe('secondaryUse');
    expect(actionForMouseButton(1)).toBeNull();
  });
  it('knows hotbar slots and captured keys', () => {
    expect(hotbarSlot('hotbar1')).toBe(0);
    expect(hotbarSlot('hotbar6')).toBe(5);
    expect(hotbarSlot('jump')).toBeNull();
    expect(capturesDefault('Tab')).toBe(true);
    expect(capturesDefault('F11')).toBe(true);
    expect(capturesDefault('KeyW')).toBe(false);
  });
});

describe('InputManager', () => {
  it('tracks held actions and fires one edge per press', () => {
    const input = new InputManager();
    const edges: string[] = [];
    input.onAction((a, e) => edges.push(`${a}:${e}`));
    expect(input.keyDown('KeyW')).toBe(true);
    input.keyDown('KeyW', true); // auto-repeat
    input.keyDown('KeyW'); // already held
    expect(input.isDown('moveForward')).toBe(true);
    input.keyUp('KeyW');
    expect(input.isDown('moveForward')).toBe(false);
    expect(edges).toEqual(['moveForward:down', 'moveForward:up']);
    expect(input.keyDown('KeyZ')).toBe(false);
  });
  it('builds the move intent', () => {
    const input = new InputManager();
    input.keyDown('KeyW');
    input.keyDown('KeyD');
    input.keyDown('ShiftLeft');
    input.keyDown('Space');
    expect(input.moveIntent(1.2)).toEqual({ forward: 1, strafe: 1, sprint: true, jump: true, yaw: 1.2 });
    input.keyDown('KeyS');
    input.keyDown('KeyA');
    expect(input.moveIntent(0)).toMatchObject({ forward: 0, strafe: 0 });
  });
  it('mouse buttons and clear()', () => {
    const input = new InputManager();
    const edges: string[] = [];
    input.onAction((a, e) => edges.push(`${a}:${e}`));
    input.mouseDown(0);
    input.mouseDown(2);
    input.mouseDown(1);
    input.clear();
    expect(edges).toEqual(['primaryUse:down', 'secondaryUse:down', 'primaryUse:up', 'secondaryUse:up']);
    expect(input.isDown('primaryUse')).toBe(false);
  });
  it('unsubscribes listeners', () => {
    const input = new InputManager();
    let n = 0;
    const off = input.onAction(() => { n += 1; });
    input.keyDown('KeyE');
    off();
    input.keyUp('KeyE');
    expect(n).toBe(1);
  });
  it('exposes press / hold / release with the held duration (LMB throw charge)', () => {
    let now = 1000;
    const input = new InputManager(() => now);
    const edges: Array<[string, string, number | undefined]> = [];
    input.onAction((a, e, ms) => edges.push([a, e, ms]));
    input.mouseDown(0);
    expect(input.heldFor('primaryUse')).toBe(0);
    now = 1600;
    expect(input.heldFor('primaryUse')).toBe(600);
    input.mouseUp(0);
    expect(input.heldFor('primaryUse')).toBe(0);
    expect(edges).toEqual([['primaryUse', 'down', undefined], ['primaryUse', 'up', 600]]);
  });
});
