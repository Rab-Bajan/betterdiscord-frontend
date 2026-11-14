import React from 'react';
import { SWEEPERS_THEME as T } from '../theme';
import { STRUCT_TYPES } from '../lib/logistics/tables';
import type { SweepersBuildHud } from '../lib/engine/SweepersGame';

/** Build mode palette (65): the types (wheel), rotation (R), level (PgUp/PgDn) and why the ghost is red. */
export default function BuildPalette({ hud }: { hud: SweepersBuildHud }) {
  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 pointer-events-none" style={{ fontFamily: T.font, color: T.text }}>
      {hud.reason !== null && (
        <div className="rounded-md px-3 py-1 text-xs font-semibold" style={{ background: 'rgba(16, 19, 41, 0.9)', border: `1px solid ${T.red}`, color: T.red }} role="status">{hud.reason}</div>
      )}
      <div className="rounded-md px-3 py-1 text-[11px] tabular-nums" style={{ background: 'rgba(16, 19, 41, 0.82)', border: `1px solid ${T.border}` }}>
        {STRUCT_TYPES[hud.type]?.name} · {hud.rot * 90}° · {hud.lvl}. szint
      </div>
      <div className="flex gap-1 max-w-[90vw] flex-wrap justify-center" role="listbox" aria-label="Építőelemek">
        {STRUCT_TYPES.map((t, i) => (
          <div
            key={t.key}
            role="option"
            aria-selected={i === hud.type}
            className="rounded px-1.5 py-1 text-[10px] font-semibold"
            style={{ background: 'rgba(16, 19, 41, 0.82)', border: `2px solid ${i === hud.type ? T.violet : T.border}` }}
          >
            {t.name}
          </div>
        ))}
      </div>
    </div>
  );
}
