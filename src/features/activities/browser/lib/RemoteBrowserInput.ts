// A közös böngésző távvezérlése: az egér-, görgő- és billentyűeseményeket a szerveren futó
// böngésző 1280×720-as képterületének koordinátáira fordítja és elküldi a szobának.
import type { SocketLike } from '../../../../shared/services/socket/SocketLike';

export const VIEWPORT_WIDTH = 1280;
export const VIEWPORT_HEIGHT = 720;
const MOVE_THROTTLE_MS = 35;
const PREVENTED_CODES = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Backspace', 'Enter'];

export interface ViewportPoint {
  x: number;
  y: number;
}

type Rect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;

/** A pointer position mapped (and clamped) onto the remote viewport; null for an empty rect. */
export function toViewport(clientX: number, clientY: number, rect: Rect): ViewportPoint | null {
  if (rect.width === 0 || rect.height === 0) return null;
  return {
    x: Math.min(VIEWPORT_WIDTH, Math.max(0, (clientX - rect.left) * (VIEWPORT_WIDTH / rect.width))),
    y: Math.min(VIEWPORT_HEIGHT, Math.max(0, (clientY - rect.top) * (VIEWPORT_HEIGHT / rect.height)))
  };
}

export const mouseButtonName = (button: number): 'left' | 'middle' | 'right' =>
  button === 2 ? 'right' : button === 1 ? 'middle' : 'left';

/** The key fields this class reads (a React or DOM KeyboardEvent). */
export interface KeyInput {
  key: string;
  code: string;
  keyCode: number;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  getModifierState?: (key: 'AltGraph') => boolean;
  preventDefault: () => void;
}

export class RemoteBrowserInput {
  readonly #socket: SocketLike | null | undefined;
  readonly #channelId: string | undefined;
  readonly #now: () => number;
  #lastMoveSent = 0;

  constructor(socket: SocketLike | null | undefined, channelId: string | undefined, now: () => number = Date.now) {
    this.#socket = socket;
    this.#channelId = channelId;
    this.#now = now;
  }

  /** Mouse moves are throttled to one per 35 ms. */
  move(point: ViewportPoint): void {
    const now = this.#now();
    if (now - this.#lastMoveSent <= MOVE_THROTTLE_MS) return;
    this.#lastMoveSent = now;
    this.#emit('browser:mouse-move', { x: point.x, y: point.y });
  }

  click(point: ViewportPoint, button: number, clickCount: number): void {
    this.#emit('browser:mouse-click', { x: point.x, y: point.y, button: mouseButtonName(button), clickCount: clickCount || 1 });
  }

  scroll(point: ViewportPoint, deltaX: number, deltaY: number): void {
    this.#emit('browser:scroll', { x: point.x, y: point.y, deltaX, deltaY });
  }

  keyDown(e: KeyInput): void {
    // Az AltGr több billentyűzeten Ctrl+Alt-ként érkezik, de karaktert ír (pl. @ a magyar kiosztáson)
    const altGraph = e.getModifierState?.('AltGraph');
    const ctrlKey = e.ctrlKey && !altGraph;
    const altKey = e.altKey && !altGraph;

    // A Ctrl+V-t a paste esemény kezeli, így a helyi vágólap tartalma kerül a böngészőbe
    if (ctrlKey && !altKey && !e.metaKey && e.key.toLowerCase() === 'v') return;

    // Speciális böngésző funkcióbillentyűk megelőzése
    if (PREVENTED_CODES.includes(e.code)) e.preventDefault();

    const modifiers = (altKey ? 1 : 0) | (ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);
    this.#emit('browser:key', { type: 'keydown', key: e.key, code: e.code, keyCode: e.keyCode, modifiers });

    // Az Enter csak char eseménnyel küld el űrlapot vagy kezd új sort a CDP-n keresztül
    const text = e.key === 'Enter' ? '\r' : e.key.length === 1 && !ctrlKey && !altKey && !e.metaKey ? e.key : null;
    if (text) this.#emit('browser:key', { type: 'char', text });
  }

  keyUp(e: Pick<KeyInput, 'key' | 'code' | 'keyCode'>): void {
    this.#emit('browser:key', { type: 'keyup', key: e.key, code: e.code, keyCode: e.keyCode });
  }

  insertText(text: string): void {
    this.#emit('browser:insert-text', { text });
  }

  #emit(event: string, payload: Record<string, unknown>): void {
    this.#socket?.emit(event, { channelId: this.#channelId, ...payload });
  }
}
