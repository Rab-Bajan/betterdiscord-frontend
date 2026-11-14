import React from 'react';
import { SWEEPERS_THEME as T, formatFt } from '../theme';
import { STRUCT_TYPES, T_STRIPPER } from '../lib/logistics/tables';
import { BLUEPRINT_COST } from '../lib/economy/tables';
import { hasBlueprint } from '../lib/logistics/placement';
import type { SweepersBuildHud } from '../lib/engine/SweepersGame';

/** Palette entries: a machine without its blueprint is locked and shows the blueprint price (E.7). */
export function paletteEntries(bp: number): { readonly key: string; readonly label: string; readonly locked: boolean }[] {
  return STRUCT_TYPES.map((t, i) => {
    const locked = !hasBlueprint(bp, i);
    return { key: t.key, label: locked ? `${t.name} · tervrajz ${formatFt(BLUEPRINT_COST[i - T_STRIPPER] ?? 0)}` : t.name, locked };
  });
}

/** Build mode palette (65): the types (wheel), rotation (R), level (PgUp/PgDn) and why the ghost is red. */
export default function BuildPalette({ hud, bp }: { hud: SweepersBuildHud; bp: number }) {
  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 pointer-events-none" style={{ fontFamily: T.font, color: T.text }}>
      {hud.reason !== null && (
        <div className="rounded-md px-3 py-1 text-xs font-semibold" style={{ background: 'rgba(16, 19, 41, 0.9)', border: `1px solid ${T.red}`, color: T.red }} role="status">{hud.reason}</div>
      )}
      <div className="rounded-md px-3 py-1 text-[11px] tabular-nums" style={{ background: 'rgba(16, 19, 41, 0.82)', border: `1px solid ${T.border}` }}>
        {STRUCT_TYPES[hud.type]?.name} · {hud.rot * 90}° · {hud.lvl}. szint
      </div>
      <div className="flex gap-1 max-w-[90vw] flex-wrap justify-center" role="listbox" aria-label="Építőelemek">
        {paletteEntries(bp).map((e, i) => (
          <div
            key={e.key}
            role="option"
            aria-selected={i === hud.type}
            aria-disabled={e.locked}
            className="rounded px-1.5 py-1 text-[10px] font-semibold"
            style={{ background: 'rgba(16, 19, 41, 0.82)', border: `2px solid ${i === hud.type ? T.violet : T.border}`, opacity: e.locked ? 0.45 : 1 }}
          >
            {e.label}
          </div>
        ))}
      </div>
    </div>
  );
}
