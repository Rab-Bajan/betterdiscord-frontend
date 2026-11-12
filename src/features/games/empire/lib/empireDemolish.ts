// Client-side preview of the server's demolish refund rule (contract section 2); the ack is authoritative.
import { RES_KEYS, RES_META } from './empireContent.ts';
import type { BuildingDef, Cost, DemolishConfig, EmpireBuilding } from '../types.ts';

export const DEFAULT_DEMOLISH: Readonly<DemolishConfig> = { maxRefund: 0.5, minRefund: 0.35, holdMs: 1500 };

export type DemolishTarget = Pick<EmpireBuilding, 'bp' | 'hp' | 'mhp' | 'lv' | 'up'>;

export function demolishRefundPreview(def: BuildingDef | null | undefined, b: DemolishTarget, cfg: Readonly<DemolishConfig> = DEFAULT_DEMOLISH): Record<string, number> {
  const cost = def?.cost || {};
  let r: number;
  if (b.bp < 100) r = cfg.maxRefund * (b.bp / 100);
  else {
    const f = Math.max(0, Math.min(1, b.hp / (b.mhp || 1)));
    r = f >= 0.5 ? cfg.minRefund + (cfg.maxRefund - cfg.minRefund) * ((f - 0.5) / 0.5) : cfg.minRefund * (f / 0.5);
  }
  const out: Record<string, number> = {};
  const add = (c: Cost | undefined, f: number): void => {
    for (const [k, v] of Object.entries(c || {})) out[k] = (out[k] || 0) + Number(v) * f;
  };
  add(cost, r);
  // paid upgrades come back at the same rate, a running one in full
  const ups = def?.upgrades || [];
  for (let lv = 2; lv <= (b.lv || 1); lv++) add(ups[lv - 2]?.cost, r);
  if (b.up >= 0) add(ups[(b.lv || 1) - 1]?.cost, 1);
  for (const [k, v] of Object.entries(out)) out[k] = Math.floor(v + 1e-9);
  return out;
}

export function refundText(refund: Readonly<Record<string, number>> | null | undefined): string {
  const parts = RES_KEYS.flatMap((k) => {
    const v = refund?.[k];
    return v !== undefined && v > 0 ? [`+${v} ${RES_META[k].label}`] : [];
  });
  return parts.length ? `Bontás: ${parts.join(', ')}` : 'Bontás: nincs visszatérítés.';
}
