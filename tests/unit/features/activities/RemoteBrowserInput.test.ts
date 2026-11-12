import { describe, it, expect, vi } from 'vitest';
import { RemoteBrowserInput, mouseButtonName, toViewport, type KeyInput } from '../../../../src/features/activities/browser/lib/RemoteBrowserInput';
import { isBrowserSession } from '../../../../src/features/activities/browser/types';
import type { SocketLike } from '../../../../src/shared/services/socket/SocketLike';

const recorder = () => {
  const sent: Array<[string, unknown]> = [];
  const socket: SocketLike = { on: () => {}, off: () => {}, emit: (e, p) => { sent.push([e, p]); } };
  return { socket, sent };
};

const key = (over: Partial<KeyInput>): KeyInput => ({
  key: 'a', code: 'KeyA', keyCode: 65, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, preventDefault: vi.fn(), ...over
});

describe('remote browser input', () => {
  it('maps and clamps pointer positions onto 1280x720', () => {
    expect(toViewport(320, 180, { left: 0, top: 0, width: 640, height: 360 })).toEqual({ x: 640, y: 360 });
    expect(toViewport(-50, 9999, { left: 0, top: 0, width: 640, height: 360 })).toEqual({ x: 0, y: 720 });
    expect(toViewport(1, 1, { left: 0, top: 0, width: 0, height: 10 })).toBeNull();
    expect([0, 1, 2].map(mouseButtonName)).toEqual(['left', 'middle', 'right']);
  });

  it('throttles mouse moves to one per 35 ms', () => {
    const { socket, sent } = recorder();
    let now = 1000;
    const input = new RemoteBrowserInput(socket, 'c1', () => now);
    input.move({ x: 1, y: 1 });
    now += 30; input.move({ x: 2, y: 2 });
    now += 10; input.move({ x: 3, y: 3 });
    expect(sent).toEqual([
      ['browser:mouse-move', { channelId: 'c1', x: 1, y: 1 }],
      ['browser:mouse-move', { channelId: 'c1', x: 3, y: 3 }]
    ]);
  });

  it('sends keydown plus a char for printable keys and Enter, not for Ctrl shortcuts', () => {
    const { socket, sent } = recorder();
    const input = new RemoteBrowserInput(socket, 'c1');
    input.keyDown(key({ shiftKey: true, key: 'A' }));
    expect(sent).toEqual([
      ['browser:key', { channelId: 'c1', type: 'keydown', key: 'A', code: 'KeyA', keyCode: 65, modifiers: 8 }],
      ['browser:key', { channelId: 'c1', type: 'char', text: 'A' }]
    ]);
    sent.length = 0;
    const enter = key({ key: 'Enter', code: 'Enter', keyCode: 13 });
    input.keyDown(enter);
    expect(enter.preventDefault).toHaveBeenCalled();
    expect(sent[1]).toEqual(['browser:key', { channelId: 'c1', type: 'char', text: '\r' }]);
    sent.length = 0;
    input.keyDown(key({ ctrlKey: true, key: 'c' }));
    expect(sent).toHaveLength(1);
    input.keyDown(key({ ctrlKey: true, key: 'v' }));
    expect(sent).toHaveLength(1); // Ctrl+V goes through the paste event
  });

  it('treats AltGr (Ctrl+Alt) as plain typing', () => {
    const { socket, sent } = recorder();
    new RemoteBrowserInput(socket, 'c1').keyDown(key({ key: '@', ctrlKey: true, altKey: true, getModifierState: () => true }));
    expect(sent).toEqual([
      ['browser:key', { channelId: 'c1', type: 'keydown', key: '@', code: 'KeyA', keyCode: 65, modifiers: 0 }],
      ['browser:key', { channelId: 'c1', type: 'char', text: '@' }]
    ]);
  });

  it('validates browser sessions', () => {
    expect(isBrowserSession({ active: true, controlMode: 'free', controller: { id: 's1', username: 'Anna' } })).toBe(true);
    expect(isBrowserSession({ controlMode: 'chaos' })).toBe(false);
  });
});
