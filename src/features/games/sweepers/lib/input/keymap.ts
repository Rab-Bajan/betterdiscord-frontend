// Billentyű- és egérkiosztás (spec 9/14/15/65/101/104/144) -> típusos játékakciók.
// LMB: söprés / működtetés (nyomva tartva később zsákdobás töltése, spec 62); RMB: másodlagos művelet.

export const HOTBAR_ACTIONS = ['hotbar1', 'hotbar2', 'hotbar3', 'hotbar4', 'hotbar5', 'hotbar6'] as const;
export type HotbarAction = (typeof HOTBAR_ACTIONS)[number];

export type InputAction =
  | 'moveForward'
  | 'moveBack'
  | 'moveLeft'
  | 'moveRight'
  | 'sprint'
  | 'jump'
  | 'primaryUse'
  | 'secondaryUse'
  /** Q: tie & drop the garbage bag ("Zsák kötözése"). */
  | 'tieBag'
  /** G: empty the backpack and tool buffer at the feet ("Kiborítás", Phase C). */
  | 'dumpPack'
  /** E: enter vehicle, weighbridge panel, clear machine jam. */
  | 'interact'
  /** B: build mode ("Építés"); R rotates the placement 90° clockwise while building. */
  | 'toggleBuild'
  | 'rotateBuild'
  /** Tab: PDA (upgrade tree & district heatmap). */
  | 'togglePda'
  | HotbarAction
  /** V (hold): radial quick-shout voice wheel. */
  | 'voiceWheel'
  | 'toggleDebug'
  | 'toggleFullscreen'
  /** M: full-screen district GPS map ("Térkép"). */
  | 'toggleMap'
  /** Vehicle-only (Phase F); Space doubles as the hydraulic bed tip while driving. */
  | 'headlights'
  | 'beacon'
  | 'horn';

export const KEY_BINDINGS: Readonly<Record<string, InputAction>> = {
  KeyW: 'moveForward',
  KeyS: 'moveBack',
  KeyA: 'moveLeft',
  KeyD: 'moveRight',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  Space: 'jump',
  KeyQ: 'tieBag',
  KeyG: 'dumpPack',
  KeyE: 'interact',
  KeyB: 'toggleBuild',
  KeyR: 'rotateBuild',
  Tab: 'togglePda',
  Digit1: 'hotbar1',
  Digit2: 'hotbar2',
  Digit3: 'hotbar3',
  Digit4: 'hotbar4',
  Digit5: 'hotbar5',
  Digit6: 'hotbar6',
  KeyV: 'voiceWheel',
  F3: 'toggleDebug',
  F11: 'toggleFullscreen',
  KeyM: 'toggleMap',
  KeyL: 'headlights',
  KeyK: 'beacon',
  KeyH: 'horn'
};

export const MOUSE_BINDINGS: Readonly<Record<number, InputAction>> = {
  0: 'primaryUse',
  2: 'secondaryUse'
};

/** Keys whose browser default (focus change, devtools-ish, fullscreen, scroll) the game takes over. */
const CAPTURED_CODES = new Set(['Tab', 'F3', 'F11', 'Space']);

export const actionForKey = (code: string): InputAction | null => KEY_BINDINGS[code] ?? null;
export const actionForMouseButton = (button: number): InputAction | null => MOUSE_BINDINGS[button] ?? null;
export const capturesDefault = (code: string): boolean => CAPTURED_CODES.has(code);

/** Hotbar slot index 0..5 for a hotbar action, else null. */
export function hotbarSlot(action: InputAction): number | null {
  const i = (HOTBAR_ACTIONS as readonly string[]).indexOf(action);
  return i >= 0 ? i : null;
}
