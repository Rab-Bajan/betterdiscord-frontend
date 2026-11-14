import React from 'react';
import { X } from 'lucide-react';
import { SWEEPERS_THEME as T } from '../theme';
import { BAG_TIERS, CRANE_TARGET_NAMES } from '../lib/logistics/tables';
import type { BagRow } from '../logisticsTypes';

interface CranePanelProps {
  /** Ground bags in the crane area, top of their stack. */
  bags: readonly BagRow[];
  busy: boolean;
  onSend: (bag: number, to: number) => void;
  onClose: () => void;
}

const KG = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 });

/** Crane console (74): every bag in the area with a target picker 0–4. */
export default function CranePanel({ bags, busy, onSend, onClose }: CranePanelProps) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-4" style={{ background: 'rgba(9, 10, 24, 0.6)' }}>
      <div className="rounded-xl w-full max-w-lg max-h-[80vh] overflow-y-auto" style={{ background: T.bg1, border: `1px solid ${T.border}`, color: T.text }} role="dialog" aria-label="Daru">
        <div className="flex items-center justify-between px-4 py-3 sticky top-0" style={{ background: T.bg1, borderBottom: `1px solid ${T.border}` }}>
          <div className="font-black">Bakdaru</div>
          {busy && <div className="text-xs" style={{ color: T.orange }}>A daru éppen dolgozik.</div>}
          <button type="button" onClick={onClose} aria-label="Bezárás" className="p-1 rounded" style={{ background: T.bg3 }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-4 py-3 space-y-1.5">
          {bags.length === 0 && <div className="text-xs" style={{ color: T.muted }}>Nincs zsák a daru hatókörében.</div>}
          {bags.map((b) => (
            <div key={b.id} className="rounded-lg px-3 py-2 space-y-1.5" style={{ background: T.bg2 }}>
              <div className="text-sm font-semibold">{BAG_TIERS[b.tier]?.name ?? 'Zsák'} · {KG.format(b.kg)} kg</div>
              <div className="flex flex-wrap gap-1">
                {CRANE_TARGET_NAMES.map((name, to) => (
                  <button
                    key={name}
                    type="button"
                    disabled={busy}
                    onClick={() => onSend(b.id, to)}
                    className="px-2 py-1 rounded-md text-[11px] font-bold disabled:opacity-40"
                    style={{ background: T.violet, color: '#fff' }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
