// A saját eszközhasználat állapota (C.3/C.4): felszerelt eszköz (függő váltással), ütem, sweep_hit seq,
// helyi állóképesség-becslés a szerver személyes állapota között. A szerver mindent újraellenőriz; a kliens
// csak azért kapuz, hogy ne küldjön biztos elutasítást. Tiszta kód.
import { toolSpec } from './catalog';
import type { PersonalState } from '../../debrisTypes';

/** Regeneration starts this long after the last accepted use (C.3 "Stamina"). */
export const REGEN_DELAY_MS = 1000;
/** Regeneration per second by movement state. */
export const REGEN_PER_S: Readonly<Record<string, number>> = { IDLE: 3, WALK: 2 };

export type UseRefusal = 'cadence' | 'exhausted' | 'switching' | 'noAction';
export type UseResult = { readonly ok: true; readonly seq: number; readonly tool: number } | { readonly ok: false; readonly reason: UseRefusal };

export class ToolSession {
  #personal: PersonalState;
  #personalAt: number;
  /** Stamina (0..100) the local uses spent since the last personal state. */
  #spent = 0;
  #pendingTool: number | null = null;
  readonly #lastUse: [number, number] = [-Infinity, -Infinity];
  #lastAnyUse = -Infinity;
  #seq = 0;

  constructor(personal: PersonalState, now: number) {
    this.#personal = personal;
    this.#personalAt = now;
  }

  get personal(): PersonalState {
    return this.#personal;
  }

  /** Equipped tool as the player sees it (a pending switch shows at once). */
  get tool(): number {
    return this.#pendingTool ?? this.#personal.toolTier;
  }

  get switching(): boolean {
    return this.#pendingTool !== null;
  }

  /** A new authoritative state (init_state or personal_update). */
  setPersonal(personal: PersonalState, now: number): void {
    this.#personal = personal;
    this.#personalAt = now;
    this.#spent = 0;
  }

  /** init_state (join / reconnect): a pending switch is dropped; seq keeps growing (it is per socket). */
  reset(personal: PersonalState, now: number): void {
    this.#pendingTool = null;
    this.#lastUse[0] = -Infinity;
    this.#lastUse[1] = -Infinity;
    this.#lastAnyUse = -Infinity;
    this.setPersonal(personal, now);
  }

  /** A `select` was sent; uses wait for its ack. */
  beginSelect(tool: number): void {
    this.#pendingTool = tool;
  }

  /** The select ack: on success the server's personal_update carries the tool; on refusal it reverts. */
  endSelect(ok: boolean, now: number): void {
    const tool = this.#pendingTool;
    this.#pendingTool = null;
    if (ok && tool !== null) this.setPersonal({ ...this.#personal, toolTier: tool }, now);
  }

  /** Stamina 0..100 now: the server value, minus local spending, plus regeneration as the server runs it. */
  stamina(now: number, mode: string): number {
    const base = this.#personal.stamina / 10 - this.#spent;
    const start = Math.max(this.#personalAt, this.#lastAnyUse + REGEN_DELAY_MS);
    const rate = REGEN_PER_S[mode] ?? 0;
    const regen = now > start ? (rate * (now - start)) / 1000 : 0;
    return Math.max(0, Math.min(100, base + regen));
  }

  /** One use of the equipped tool at `now`; on success the seq to send. */
  tryUse(alt: boolean, now: number, mode: string): UseResult {
    if (this.#pendingTool !== null) return { ok: false, reason: 'switching' };
    const tool = this.#personal.toolTier;
    const spec = toolSpec(tool);
    if (!spec) return { ok: false, reason: 'noAction' };
    const cadence = alt ? spec.altCadence : spec.cadence;
    if (cadence === null) return { ok: false, reason: 'noAction' };
    const i = alt ? 1 : 0;
    if (now - (this.#lastUse[i] ?? -Infinity) < cadence * 1000) return { ok: false, reason: 'cadence' };
    const cost = alt ? spec.altStamina : spec.stamina;
    if (this.stamina(now, mode) < cost) return { ok: false, reason: 'exhausted' };
    // regeneration up to now is banked before the use resets its delay
    this.#spent = this.#personal.stamina / 10 - this.stamina(now, mode) + cost;
    this.#lastUse[i] = now;
    this.#lastAnyUse = now;
    this.#seq += 1;
    return { ok: true, seq: this.#seq, tool };
  }
}
