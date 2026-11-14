import React, { useState } from 'react';
import { X } from 'lucide-react';
import { SWEEPERS_THEME as T, formatFt } from '../theme';
import {
  FUEL_COST,
  FUEL_TANK_ML,
  GLOVES_COST,
  HARD_LEVELS,
  PACK_LEVELS,
  REFRESHMENTS,
  TOOLS,
  WIDTH_LEVELS,
  ownsTool,
  repairCost
} from '../lib/tools/catalog';
import type { BuyUpgradePayload } from '../lib/net/SweepersNet';
import { BAG_TIERS } from '../lib/logistics/tables';
import type { PersonalState } from '../debrisTypes';

/** One row of the shop: what it sells, its price, and why it cannot be bought (null: it can). */
export interface ShopOffer {
  readonly key: string;
  readonly section: 'workbench' | 'bags' | 'kiosk';
  readonly name: string;
  readonly detail: string;
  readonly price: number | null;
  readonly blocked: string | null;
  readonly buy: BuyUpgradePayload | null;
  /** "Megvetted: …" / "Megjavítva: …" */
  readonly toastName: string;
  readonly repair: boolean;
}

const nextLevel = <T,>(levels: readonly T[], current: number): T | null => levels[current + 1] ?? null;

/** Every offer for this player (C.4 buy rules, as far as the client can tell). */
export function shopOffers(p: PersonalState): ShopOffer[] {
  const out: ShopOffer[] = [];
  const afford = (price: number): string | null => (p.cash >= price ? null : 'Nincs elég pénzed');
  for (const tool of TOOLS) {
    if (tool.cost === 0) continue;
    const owned = ownsTool(p.owned, tool.id);
    out.push({
      key: `tool.${tool.id}`,
      section: 'workbench',
      name: tool.name,
      detail: tool.bufKg ? `${tool.bufKg} kg tartály · ${tool.reach} m` : `${tool.reach} m`,
      price: owned ? null : tool.cost,
      blocked: owned ? 'Megvan' : afford(tool.cost),
      buy: owned ? null : { item: 'tool', tier: tool.id },
      toastName: tool.name,
      repair: false
    });
  }
  const leveled = (key: 'width' | 'pack' | 'hard', name: string, levels: readonly { readonly cost: number }[], current: number, detail: (lvl: number) => string): void => {
    const next = nextLevel(levels, current);
    out.push({
      key,
      section: 'workbench',
      name: `${name} (${current}/${levels.length - 1})`,
      detail: next ? detail(current + 1) : 'Legmagasabb szint',
      price: next ? next.cost : null,
      blocked: next ? afford(next.cost) : 'Legmagasabb szint',
      buy: next ? { item: key, level: current + 1 } : null,
      toastName: `${name} ${current + 1}. szint`,
      repair: false
    });
  };
  leveled('width', 'Seprűfej-szélesítés', WIDTH_LEVELS, p.widthLvl, (l) => `+${Math.round((WIDTH_LEVELS[l]?.bonus ?? 0) * 100)} % szélesség`);
  leveled('pack', 'Hátizsák', PACK_LEVELS, p.backpackTier, (l) => `${PACK_LEVELS[l]?.name ?? ''}: ${PACK_LEVELS[l]?.kg ?? 0} kg / ${PACK_LEVELS[l]?.l ?? 0} L`);
  leveled('hard', 'Sörtekeménység', HARD_LEVELS, p.hardLvl, (l) => `×${HARD_LEVELS[l]?.eff ?? 1} nehéz salakon, ×${HARD_LEVELS[l]?.wear ?? 1} kopás`);
  out.push({
    key: 'gloves',
    section: 'workbench',
    name: 'Munkáskesztyű',
    detail: 'Bűzös káposztánál sem lassulsz',
    price: p.gloves ? null : GLOVES_COST,
    blocked: p.gloves ? 'Megvan' : afford(GLOVES_COST),
    buy: p.gloves ? null : { item: 'gloves' },
    toastName: 'Munkáskesztyű',
    repair: false
  });
  for (const tier of [1, 2, 3]) {
    const spec = TOOLS[tier];
    if (!spec || !ownsTool(p.owned, tier)) continue;
    const dur = p.dur[tier - 1] ?? 1000;
    out.push({
      key: `repair.${tier}`,
      section: 'workbench',
      name: `Javítás: ${spec.name}`,
      detail: `Szigetelőszalag és drót · ${Math.round(dur / 10)} %`,
      price: dur >= 1000 ? null : repairCost(tier),
      blocked: dur >= 1000 ? 'Ép' : afford(repairCost(tier)),
      buy: dur >= 1000 ? null : { item: 'repair', tier },
      toastName: spec.name,
      repair: true
    });
  }
  if (ownsTool(p.owned, 4)) {
    const full = p.fuelMl >= FUEL_TANK_ML;
    out.push({
      key: 'fuel',
      section: 'workbench',
      name: 'Keverékbenzin',
      detail: `Tank: ${Math.round(p.fuelMl)} / ${FUEL_TANK_ML} ml`,
      price: full ? null : FUEL_COST,
      blocked: full ? 'Tele' : afford(FUEL_COST),
      buy: full ? null : { item: 'fuel' },
      toastName: 'Keverékbenzin',
      repair: false
    });
  }
  // Zsákok (D.4): tier × qty 1/5/10 at the workbench, within the stock cap
  BAG_TIERS.forEach((bag, tier) => {
    for (const qty of [1, 5, 10] as const) {
      const price = bag.cost * qty;
      const full = (p.bags[tier] ?? 0) + qty > bag.cap;
      out.push({
        key: `bag.${tier}.${qty}`,
        section: 'bags',
        name: bag.name,
        detail: `${bag.kg} kg / ${bag.l} L · raktáron ${p.bags[tier] ?? 0} / ${bag.cap}`,
        price,
        blocked: full ? 'Nem fér több' : afford(price),
        buy: { item: 'bag', tier, qty },
        toastName: `${bag.name} ×${qty}`,
        repair: false
      });
    }
  });
  for (const r of REFRESHMENTS) {
    out.push({ key: r.item, section: 'kiosk', name: r.name, detail: r.effect, price: r.cost, blocked: afford(r.cost), buy: { item: r.item }, toastName: r.name, repair: false });
  }
  return out;
}

interface ShopPanelProps {
  personal: PersonalState;
  access: { readonly workbench: boolean; readonly kiosk: boolean };
  onBuy: (offer: ShopOffer) => void;
  onClose: () => void;
  /** The office's "Logisztika" tab (D.7); without it there are no tabs. */
  logistics?: React.ReactNode;
}

/** "MÉH műhely" (E at the office) and "Büfé" (E at a kiosk or the office), C.7 "Shop". */
export default function ShopPanel({ personal, access, onBuy, onClose, logistics }: ShopPanelProps) {
  const [tab, setTab] = useState<'shop' | 'logistics'>('shop');
  const offers = shopOffers(personal);
  const sections: ReadonlyArray<readonly ['workbench' | 'bags' | 'kiosk', string]> = [['workbench', 'MÉH műhely'], ['bags', 'Zsákok'], ['kiosk', 'Büfé']];
  const allowed = (key: 'workbench' | 'bags' | 'kiosk'): boolean => (key === 'bags' ? access.workbench : access[key]);
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-4" style={{ background: 'rgba(9, 10, 24, 0.6)' }}>
      <div className="rounded-xl w-full max-w-lg max-h-[80vh] overflow-y-auto" style={{ background: T.bg1, border: `1px solid ${T.border}`, color: T.text }} role="dialog" aria-label="Bolt">
        <div className="flex items-center justify-between px-4 py-3 sticky top-0" style={{ background: T.bg1, borderBottom: `1px solid ${T.border}` }}>
          <div className="font-black">Bolt</div>
          <div className="text-xs" style={{ color: T.green }}>{formatFt(personal.cash)}</div>
          <button type="button" onClick={onClose} aria-label="Bezárás" className="p-1 rounded" style={{ background: T.bg3 }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        {logistics !== undefined && (
          <div className="flex gap-1 px-4 pt-3" role="tablist">
            {([['shop', 'MÉH műhely'], ['logistics', 'Logisztika']] as const).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className="px-3 py-1 rounded-md text-xs font-bold" style={{ background: tab === key ? T.violet : T.bg3, color: '#fff' }}>
                {label}
              </button>
            ))}
          </div>
        )}
        {logistics !== undefined && tab === 'logistics' && logistics}
        {(logistics === undefined || tab === 'shop') && sections.filter(([key]) => allowed(key)).map(([key, title]) => (
          <div key={key} className="px-4 py-3 space-y-1.5">
            <div className="text-[11px] font-bold tracking-wider" style={{ color: T.muted }}>{title.toUpperCase()}</div>
            {key === 'bags' && BAG_TIERS.map((bag, tier) => {
              const row = offers.filter((o) => o.key.startsWith(`bag.${tier}.`));
              return (
                <div key={bag.key} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: T.bg2 }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{bag.name}</div>
                    <div className="text-[11px] truncate" style={{ color: T.muted }}>{row[0]?.detail} · {formatFt(bag.cost)} / db</div>
                  </div>
                  {row.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      disabled={o.blocked !== null}
                      onClick={() => onBuy(o)}
                      className="px-2 py-1.5 rounded-md text-xs font-bold shrink-0 disabled:opacity-40"
                      style={{ background: o.blocked ? T.bg3 : T.violet, color: '#fff' }}
                      title={o.blocked ?? (o.price === null ? undefined : formatFt(o.price))}
                    >
                      ×{o.buy?.qty ?? 1}
                    </button>
                  ))}
                </div>
              );
            })}
            {key !== 'bags' && offers.filter((o) => o.section === key).map((o) => (
              <div key={o.key} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: T.bg2 }}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{o.name}</div>
                  <div className="text-[11px] truncate" style={{ color: T.muted }}>{o.detail}</div>
                </div>
                <button
                  type="button"
                  disabled={o.buy === null || o.blocked !== null}
                  onClick={() => onBuy(o)}
                  className="px-3 py-1.5 rounded-md text-xs font-bold shrink-0 disabled:opacity-40"
                  style={{ background: o.buy && !o.blocked ? T.violet : T.bg3, color: '#fff' }}
                  title={o.blocked ?? undefined}
                >
                  {o.price === null ? (o.blocked ?? '–') : formatFt(o.price)}
                </button>
              </div>
            ))}
          </div>
        ))}
        <div className="px-4 pb-3 text-[11px]" style={{ color: T.muted }}>Pénzt a mérlegnél kapsz majd a leadott hulladékért.</div>
      </div>
    </div>
  );
}
