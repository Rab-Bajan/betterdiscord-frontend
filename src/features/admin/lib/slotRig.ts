// A kaszinó slot-manipuláció választómezőjének értéke és a szervernek küldött beállítás.
import type { SlotRig } from '../types';

/** The select value for a rig: `jackpot:<symbol>`, the mode, or '' for none. */
export const rigSelectValue = (rig: SlotRig | null | undefined): string =>
  rig ? (rig.mode === 'jackpot' ? `jackpot:${rig.symbols?.[0]}` : rig.mode) : '';

/** The rig for a select value and spin count; null clears the rig. */
export function buildRig(value: string, spins: number): SlotRig | null {
  if (value.startsWith('jackpot:')) return { mode: 'jackpot', symbols: [value.split(':')[1] ?? ''], spins };
  if (value) return { mode: value, spins };
  return null;
}
