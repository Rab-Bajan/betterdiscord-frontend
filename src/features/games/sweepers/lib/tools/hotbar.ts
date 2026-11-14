// Eszközsor (spec 60, C.7): 8 eszköz 6 helyen. 1 = Seprű (a legjobb birtokolt seprű 0–3; ismételt 1-es
// lefelé lépteti a birtokoltakat), 2 = lombfúvó, 3 = vakuum, 4 = gereblye, 5 = kéz, 6 = zsák (Phase D). Tiszta kód.
import { BROOM_TOOLS, isBroom, ownsTool } from './catalog';

export const HOTBAR_SLOTS = 6;
/** Tool of slots 2..5 (index 1..4); slot 1 is the broom family, slot 6 the bag. */
const FIXED_SLOT_TOOLS: readonly (number | null)[] = [null, 4, 5, 6, 7, null];
export const BAG_SLOT = 5;

/** The slot index (0..5) a tool lives in. */
export function slotOfTool(tool: number): number {
  if (isBroom(tool)) return 0;
  const i = FIXED_SLOT_TOOLS.indexOf(tool);
  return i >= 0 ? i : 0;
}

/** Owned brooms, best first. */
export function ownedBrooms(owned: number): number[] {
  return BROOM_TOOLS.filter((t) => ownsTool(owned, t)).sort((a, b) => b - a);
}

/** The tool slot 1 shows: the equipped broom, or the best owned one. */
export function broomSlotTool(owned: number, current: number): number {
  if (isBroom(current) && ownsTool(owned, current)) return current;
  return ownedBrooms(owned)[0] ?? 0;
}

/** What the slot's own icon / gauges show (null: the bag slot). */
export function slotTool(slot: number, owned: number, current: number): number | null {
  if (slot === 0) return broomSlotTool(owned, current);
  return FIXED_SLOT_TOOLS[slot] ?? null;
}

/** Slot 6 (D.7): enabled while any bag is in stock. */
export const bagSlotEnabled = (bags: readonly number[]): boolean => bags.some((n) => n > 0);

/** Pressing 6 cycles the tiers in stock after `current` (wrapping); null when nothing is in stock. */
export function nextBagTier(bags: readonly number[], current: number | null): number | null {
  for (let i = 1; i <= bags.length; i++) {
    const tier = ((current ?? -1) + i + bags.length) % bags.length;
    if ((bags[tier] ?? 0) > 0) return tier;
  }
  return null;
}

/** The tier slot 6 shows: the selected one while in stock, else the first in stock. */
export const shownBagTier = (bags: readonly number[], selected: number | null): number | null =>
  selected !== null && (bags[selected] ?? 0) > 0 ? selected : nextBagTier(bags, null);

export type SlotChoice =
  | { readonly kind: 'select'; readonly tool: number }
  | { readonly kind: 'same' }
  | { readonly kind: 'unowned'; readonly tool: number }
  | { readonly kind: 'disabled' };

/**
 * Pressing slot `slot` (0..5) with `current` equipped. Slot 1 again cycles the owned brooms downward
 * (wrapping to the best); an unowned tool is refused locally (nothing is sent).
 */
export function chooseSlot(slot: number, owned: number, current: number): SlotChoice {
  if (slot === 0) {
    const brooms = ownedBrooms(owned);
    if (!isBroom(current)) {
      const best = brooms[0];
      return best === undefined ? { kind: 'unowned', tool: 0 } : { kind: 'select', tool: best };
    }
    const i = brooms.indexOf(current);
    const next = brooms[(i + 1) % brooms.length];
    if (next === undefined || next === current) return { kind: 'same' };
    return { kind: 'select', tool: next };
  }
  const tool = FIXED_SLOT_TOOLS[slot];
  if (tool === null || tool === undefined) return { kind: 'disabled' };
  if (!ownsTool(owned, tool)) return { kind: 'unowned', tool };
  return tool === current ? { kind: 'same' } : { kind: 'select', tool };
}
