import React from 'react';
import { Brush, Fan, Hand, Magnet, ShoppingBag, Wind, type LucideIcon } from 'lucide-react';
import { SWEEPERS_THEME as T } from '../theme';
import { BAG_SLOT, HOTBAR_SLOTS, bagSlotEnabled, slotOfTool, slotTool } from '../lib/tools/hotbar';
import { BAG_TIERS } from '../lib/logistics/tables';
import { FUEL_TANK_ML, ownsTool, toolSpec, wears } from '../lib/tools/catalog';
import type { SweepersPlayerHud } from '../lib/engine/SweepersGame';

const panel = { background: 'rgba(16, 19, 41, 0.82)', border: `1px solid ${T.border}`, backdropFilter: 'blur(6px)' } as const;
/** Active hotbar slot border (spec 60). */
export const ACTIVE_SLOT_COLOR = '#7655F5';
/** Stamina bar colour (142). */
export const STAMINA_COLOR = '#28C997';

function iconOf(tool: number | null): LucideIcon {
  if (tool === null) return ShoppingBag;
  if (tool <= 3) return Brush;
  if (tool === 4) return Wind;
  if (tool === 5) return Fan;
  if (tool === 6) return Magnet;
  return Hand;
}

function Bar({ value, color, height = 3 }: { value: number; color: string; height?: number }) {
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height, background: 'rgba(148, 163, 184, 0.2)' }}>
      <div style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`, height: '100%', background: color }} />
    </div>
  );
}

/** One hotbar slot's content (pure, tested through the rendered labels). */
export interface SlotView {
  readonly slot: number;
  readonly label: string;
  readonly tool: number | null;
  readonly owned: boolean;
  readonly active: boolean;
  readonly disabled: boolean;
  /** Durability 0..1 (tools 1–3). */
  readonly durability: number | null;
  /** Buffer fill 0..1 of the equipped tool. */
  readonly fill: number | null;
  /** Fuel 0..1 (slot 2). */
  readonly fuel: number | null;
  /** Slot 6: the selected bag tier's stock, and the tie progress 0..1. */
  readonly count: number | null;
  readonly tie: number | null;
}

/** Short bag names on slot 6. */
const BAG_SHORT: readonly string[] = ['Kék', 'Fekete', 'Big-Bag'];

export function hotbarSlots(hud: SweepersPlayerHud): SlotView[] {
  const p = hud.personal;
  const activeSlot = slotOfTool(hud.tool);
  const out: SlotView[] = [];
  for (let slot = 0; slot < HOTBAR_SLOTS; slot++) {
    if (slot === BAG_SLOT) {
      const tier = hud.bagTier;
      out.push({
        slot,
        label: tier === null ? 'Zsák' : `Zsák: ${BAG_SHORT[tier] ?? ''}`,
        tool: null,
        owned: bagSlotEnabled(p.bags),
        active: hud.carrying,
        disabled: !bagSlotEnabled(p.bags),
        durability: null,
        fill: null,
        fuel: null,
        count: tier === null ? null : (p.bags[tier] ?? 0),
        tie: hud.tie > 0 ? hud.tie : null
      });
      continue;
    }
    const tool = slotTool(slot, p.owned, hud.tool);
    const spec = tool === null ? null : toolSpec(tool);
    const owned = tool !== null && ownsTool(p.owned, tool);
    const active = slot === activeSlot && tool === hud.tool;
    out.push({
      slot,
      label: slot === 0 ? `Seprű: ${spec?.short ?? ''}` : (spec?.short ?? ''),
      tool,
      owned,
      active: active && !hud.carrying,
      disabled: false,
      durability: tool !== null && wears(tool) && owned ? (p.dur[tool - 1] ?? 1000) / 1000 : null,
      fill: active && spec?.bufKg && p.caps.bufKg > 0 ? p.buf.kg / p.caps.bufKg : null,
      fuel: tool === 4 && owned ? p.fuelMl / FUEL_TANK_ML : null,
      count: null,
      tie: null
    });
  }
  return out;
}

/** Hotbar bottom centre (60), stamina bottom left (59/142), backpack gauge and effect chips. */
export default function ToolHud({ hud }: { hud: SweepersPlayerHud }) {
  const p = hud.personal;
  const slots = hotbarSlots(hud);
  const chips: string[] = [];
  if (hud.fx.stench) chips.push('Bűz');
  if (hud.fx.beer) chips.push('Sör');
  if (hud.fx.kofola) chips.push('Kofola');
  return (
    <>
      <div className="absolute bottom-3 left-3 w-52 rounded-lg px-3 py-2 text-[11px] space-y-1.5" style={panel}>
        <div className="flex justify-between">
          <span style={{ color: T.muted }}>Állóképesség</span>
          <strong className="tabular-nums" style={{ color: STAMINA_COLOR }}>{Math.round(hud.stamina)}</strong>
        </div>
        <Bar value={hud.stamina / 100} color={STAMINA_COLOR} height={6} />
        <div className="flex justify-between pt-0.5">
          <span style={{ color: T.muted }}>Hátizsák</span>
          <span className="tabular-nums">{p.pack.kg.toFixed(1)} / {p.caps.packKg} kg · {p.pack.l.toFixed(1)} / {p.caps.packL} L</span>
        </div>
        <Bar value={Math.max(p.caps.packKg > 0 ? p.pack.kg / p.caps.packKg : 0, p.caps.packL > 0 ? p.pack.l / p.caps.packL : 0)} color={T.blue} height={4} />
        {chips.length > 0 && (
          <div className="flex gap-1 pt-0.5">
            {chips.map((c) => (
              <span key={c} className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: c === 'Bűz' ? '#5d7a2e' : c === 'Sör' ? '#B8862E' : '#8B3A2E', color: '#fff' }}>{c}</span>
            ))}
          </div>
        )}
      </div>

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5" role="toolbar" aria-label="Eszköztár">
        {slots.map((s) => {
          const Icon = iconOf(s.tool);
          return (
            <div
              key={s.slot}
              title={s.slot === BAG_SLOT ? (s.disabled ? 'Nincs zsákod – vegyél a MÉH műhelyben' : `${BAG_TIERS[hud.bagTier ?? 0]?.name ?? ''} · Q: bezsákolás, 6: váltás`) : s.owned ? s.label : `${s.label} (nincs meg)`}
              className="relative w-14 h-14 rounded-lg flex flex-col items-center justify-center gap-0.5 px-1"
              style={{ ...panel, border: `2px solid ${s.active ? ACTIVE_SLOT_COLOR : T.border}`, opacity: s.disabled ? 0.35 : s.owned ? 1 : 0.5 }}
              data-active={s.active ? 'true' : 'false'}
            >
              <span className="absolute top-0.5 left-1 text-[9px] font-bold" style={{ color: T.muted }}>{s.slot + 1}</span>
              <Icon className="w-5 h-5" style={{ color: s.active ? '#fff' : T.text }} />
              <span className="text-[8px] leading-none truncate max-w-full" style={{ color: T.muted }}>{s.label.replace('Seprű: ', '')}</span>
              {s.durability !== null && <Bar value={s.durability} color={s.durability < 0.2 ? T.red : T.orange} height={2} />}
              {s.fill !== null && <Bar value={s.fill} color={T.blue} height={2} />}
              {s.fuel !== null && <Bar value={s.fuel} color="#E0B23A" height={2} />}
              {s.count !== null && <span className="absolute top-0.5 right-1 text-[9px] font-bold tabular-nums">×{s.count}</span>}
              {s.tie !== null && <Bar value={s.tie} color={T.green} height={2} />}
            </div>
          );
        })}
      </div>
    </>
  );
}
