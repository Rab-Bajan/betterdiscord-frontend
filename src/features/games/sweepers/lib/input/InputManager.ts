// Bemenetkezelő: lenyomott akciók állapota + élesemények (lenyomás / felengedés).
import { actionForKey, actionForMouseButton, capturesDefault, type InputAction } from './keymap';
import type { MoveIntent } from '../movement/MovementModel';

export type InputEdge = 'down' | 'up';
/** `heldMs` is set on 'up': how long the action was held (press / hold / release). */
/** `heldMs` is set on a real 'up'; undefined on 'down' and on a cancelled release (`clear()`: blur, pointer unlock). */
export type InputListener = (action: InputAction, edge: InputEdge, heldMs?: number) => void;

const isEditable = (target: EventTarget | null): boolean =>
  typeof HTMLElement !== 'undefined' && target instanceof HTMLElement
  && (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');

export class InputManager {
  /** Held action -> press time (ms), for press / hold / release (e.g. LMB throw charge). */
  readonly #held = new Map<InputAction, number>();
  readonly #now: () => number;
  readonly #listeners = new Set<InputListener>();
  #detach: (() => void) | null = null;
  /** Gameplay keys only count while true (pointer locked, or build mode); F3/F11/M always work. */
  gameplayEnabled = false;
  /** Cursor in normalised device coordinates over the canvas (build mode hover), null when unknown. */
  pointer: { x: number; y: number } | null = null;

  constructor(now: () => number = () => performance.now()) {
    this.#now = now;
  }

  /** Returns false when the key is not bound. `repeat` key events never fire edges. */
  keyDown(code: string, repeat = false): boolean {
    const action = actionForKey(code);
    if (!action) return false;
    if (!repeat) this.#press(action);
    return true;
  }

  keyUp(code: string): boolean {
    const action = actionForKey(code);
    if (!action) return false;
    this.#release(action);
    return true;
  }

  mouseDown(button: number): void {
    const action = actionForMouseButton(button);
    if (action) this.#press(action);
  }

  mouseUp(button: number): void {
    const action = actionForMouseButton(button);
    if (action) this.#release(action);
  }

  /** Mouse wheel: one palette step per notch (D.7 build mode). */
  wheel(deltaY: number): void {
    if (deltaY === 0) return;
    const action = deltaY > 0 ? 'paletteNext' : 'palettePrev';
    this.#press(action);
    this.#release(action);
  }

  isDown(action: InputAction): boolean {
    return this.#held.has(action);
  }

  /** How long `action` has been held (ms), 0 when it is up. */
  heldFor(action: InputAction): number {
    const since = this.#held.get(action);
    return since === undefined ? 0 : Math.max(0, this.#now() - since);
  }

  /** Releases everything (window blur, pointer unlock). */
  clear(): void {
    for (const action of [...this.#held.keys()]) this.#release(action, true);
  }

  onAction(listener: InputListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  moveIntent(yaw: number): MoveIntent {
    const axis = (pos: InputAction, neg: InputAction): number => (this.isDown(pos) ? 1 : 0) - (this.isDown(neg) ? 1 : 0);
    return {
      forward: axis('moveForward', 'moveBack'),
      strafe: axis('moveRight', 'moveLeft'),
      sprint: this.isDown('sprint'),
      jump: this.isDown('jump'),
      yaw
    };
  }

  /** Binds to window keyboard / mouse events. */
  attach(win: Window, mouseTarget: HTMLElement): void {
    this.detach();
    const onKeyDown = (e: KeyboardEvent): void => {
      if (isEditable(e.target)) return;
      const always = e.code === 'F3' || e.code === 'F11' || e.code === 'KeyM';
      if (!this.gameplayEnabled && !always) return;
      if (this.keyDown(e.code, e.repeat) && capturesDefault(e.code)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      this.keyUp(e.code);
    };
    const onMouseDown = (e: MouseEvent): void => {
      if (this.gameplayEnabled) this.mouseDown(e.button);
    };
    const onMouseUp = (e: MouseEvent): void => this.mouseUp(e.button);
    const onContextMenu = (e: MouseEvent): void => e.preventDefault();
    const onWheel = (e: WheelEvent): void => {
      if (this.gameplayEnabled) this.wheel(e.deltaY);
    };
    const onMouseMove = (e: MouseEvent): void => {
      const r = mouseTarget.getBoundingClientRect();
      this.pointer = r.width > 0 && r.height > 0 ? { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 } : null;
    };
    const onBlur = (): void => this.clear();
    win.addEventListener('keydown', onKeyDown);
    win.addEventListener('keyup', onKeyUp);
    win.addEventListener('blur', onBlur);
    mouseTarget.addEventListener('mousedown', onMouseDown);
    win.addEventListener('mouseup', onMouseUp);
    mouseTarget.addEventListener('contextmenu', onContextMenu);
    mouseTarget.addEventListener('wheel', onWheel, { passive: true });
    mouseTarget.addEventListener('mousemove', onMouseMove);
    this.#detach = () => {
      win.removeEventListener('keydown', onKeyDown);
      win.removeEventListener('keyup', onKeyUp);
      win.removeEventListener('blur', onBlur);
      mouseTarget.removeEventListener('mousedown', onMouseDown);
      win.removeEventListener('mouseup', onMouseUp);
      mouseTarget.removeEventListener('contextmenu', onContextMenu);
      mouseTarget.removeEventListener('wheel', onWheel);
      mouseTarget.removeEventListener('mousemove', onMouseMove);
    };
  }

  detach(): void {
    this.#detach?.();
    this.#detach = null;
  }

  dispose(): void {
    this.detach();
    this.#held.clear();
    this.#listeners.clear();
  }

  #press(action: InputAction): void {
    if (this.#held.has(action)) return;
    this.#held.set(action, this.#now());
    for (const l of this.#listeners) l(action, 'down');
  }

  #release(action: InputAction, cancelled = false): void {
    const since = this.#held.get(action);
    if (since === undefined) return;
    this.#held.delete(action);
    const heldMs = cancelled ? undefined : Math.max(0, this.#now() - since);
    for (const l of this.#listeners) l(action, 'up', heldMs);
  }
}
