import React, { useEffect, useState } from 'react';
import { SWEEPERS_THEME as T, formatFt } from '../theme';
import type { Telemetry } from '../logisticsTypes';
import type { GridRow } from '../economyTypes';
import { batteryPct, gridLines } from '../lib/economy/format';

const NUM = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 });
const KW = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 2 });

/** The D.8 telemetry labels; with the E grid the draw is real demand (no "not wired" note). */
export function telemetryLines(t: Telemetry, grid = false): string[] {
  return [
    `Szállított mennyiség: ${NUM.format(t.kgMin)} kg/perc`,
    `Szalagterhelés: ${Math.round(t.loadPct)} %`,
    `Fogyasztás: ${KW.format(t.kW)} kW${grid ? '' : ' (a hálózat még nincs bekötve)'}`,
    `Becsült bevétel: ${formatFt(t.ftHour)}/óra`,
    `Szalaghossz: ${NUM.format(t.beltM)} m`,
    `Elakadások: ${t.jams}`
  ];
}

interface LogisticsPanelProps {
  telemetry: Telemetry | null;
  /** Subscribes on open and unsubscribes on close (D.7). */
  onSubscribe: (on: boolean) => void;
  /** Phase E grid: adds the `Áram` tab. */
  grid?: GridRow | null;
}

const row = { background: T.bg2 } as const;

/** "Logisztika" tab of the office panel (75): the 1 Hz network telemetry, and the `Áram` tab (E.7). */
export default function LogisticsPanel({ telemetry, onSubscribe, grid }: LogisticsPanelProps) {
  const [power, setPower] = useState(false);
  useEffect(() => {
    onSubscribe(true);
    return () => onSubscribe(false);
  }, [onSubscribe]);
  return (
    <div className="px-4 py-3 space-y-1.5" aria-label="Logisztika">
      {grid && (
        <div className="flex gap-1" role="tablist">
          {([[false, 'Telemetria'], [true, 'Áram']] as const).map(([key, label]) => (
            <button key={label} type="button" role="tab" aria-selected={power === key} onClick={() => setPower(key)} className="px-2.5 py-0.5 rounded text-[11px] font-bold" style={{ background: power === key ? T.blue : T.bg3, color: '#fff' }}>{label}</button>
          ))}
        </div>
      )}
      {grid && power ? (
        <div className="space-y-1.5" aria-label="Áram">
          {gridLines(grid).map((line) => <div key={line.split(':')[0]} className="rounded-lg px-3 py-2 text-sm tabular-nums" style={{ ...row, color: line.startsWith('Állapot') && grid.st > 0 ? T.orange : T.text }}>{line}</div>)}
          <div className="h-2 rounded-full overflow-hidden" style={{ background: T.bg3 }} aria-label="Akkumulátor töltöttsége">
            <div className="h-full" style={{ width: `${batteryPct(grid)}%`, background: T.green }} />
          </div>
        </div>
      ) : telemetry === null ? (
        <div className="text-xs" style={{ color: T.muted }}>Telemetria betöltése…</div>
      ) : (
        telemetryLines(telemetry, grid !== undefined && grid !== null).map((line) => (
          <div key={line.split(':')[0]} className="rounded-lg px-3 py-2 text-sm tabular-nums" style={{ background: T.bg2 }}>{line}</div>
        ))
      )}
    </div>
  );
}
