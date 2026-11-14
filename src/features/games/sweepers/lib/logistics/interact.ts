// E sorrendje (D.7) és a zsákkötés 1,2 s-os animációja (Q). Tiszta kód.

export type Interaction =
  | { readonly kind: 'clearJam'; readonly id: number }
  | { readonly kind: 'pickup'; readonly id: number }
  | { readonly kind: 'crane' }
  | { readonly kind: 'office' }
  | { readonly kind: 'kiosk' }
  | null;

export const JAM_REACH_M = 2;
export const BAG_REACH_M = 2;
export const CRANE_REACH_M = 2.5;
export const OFFICE_REACH_M = 8;

export interface InteractCandidates {
  /** Nearest jammed junction (distance to its footprint). */
  readonly jam: { readonly id: number; readonly d: number } | null;
  /** A broom (tools 0–3) is in hand. */
  readonly broom: boolean;
  /** Nearest pickable bag. */
  readonly bag: { readonly id: number; readonly d: number } | null;
  readonly craneD: number;
  readonly officeD: number;
  readonly kiosk: boolean;
}

/** D.7: jam (with a broom) → bag → crane console → office → kiosk. */
export function chooseInteraction(c: InteractCandidates): Interaction {
  if (c.jam && c.broom && c.jam.d <= JAM_REACH_M) return { kind: 'clearJam', id: c.jam.id };
  if (c.bag && c.bag.d <= BAG_REACH_M) return { kind: 'pickup', id: c.bag.id };
  if (c.craneD <= CRANE_REACH_M) return { kind: 'crane' };
  if (c.officeD <= OFFICE_REACH_M) return { kind: 'office' };
  return c.kiosk ? { kind: 'kiosk' } : null;
}

export const TIE_MS = 1200;
/** Moving farther than this from the start cancels the tie. */
export const TIE_CANCEL_M = 0.5;

/** Q starts the tie; it is sent at its end. Moving > 0.5 m, a tool use or a switch cancels it (D.7). */
export class TieAnimation {
  #start: { readonly x: number; readonly z: number; readonly at: number; readonly tier: number } | null = null;

  get active(): boolean {
    return this.#start !== null;
  }

  /** 0..1 progress (HUD). */
  progress(now: number): number {
    return this.#start ? Math.min(1, (now - this.#start.at) / TIE_MS) : 0;
  }

  start(x: number, z: number, tier: number, now: number): void {
    this.#start = { x, z, at: now, tier };
  }

  cancel(): boolean {
    const was = this.#start !== null;
    this.#start = null;
    return was;
  }

  /** Per frame: the tier to send when the tie completes, 'cancelled' when it moved too far, else null. */
  update(x: number, z: number, now: number): number | 'cancelled' | null {
    const s = this.#start;
    if (!s) return null;
    if (Math.hypot(x - s.x, z - s.z) > TIE_CANCEL_M) {
      this.#start = null;
      return 'cancelled';
    }
    if (now - s.at < TIE_MS) return null;
    this.#start = null;
    return s.tier;
  }
}
