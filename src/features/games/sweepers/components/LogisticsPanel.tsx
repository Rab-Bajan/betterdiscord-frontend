import React, { useEffect } from 'react';
import { SWEEPERS_THEME as T, formatFt } from '../theme';
import type { Telemetry } from '../logisticsTypes';

const NUM = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 });
const KW = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 2 });

/** The D.8 telemetry labels. */
export function telemetryLines(t: Telemetry): string[] {
  return [
    `Szállított mennyiség: ${NUM.format(t.kgMin)} kg/perc`,
    `Szalagterhelés: ${Math.round(t.loadPct)} %`,
    `Fogyasztás: ${KW.format(t.kW)} kW (a hálózat még nincs bekötve)`,
    `Becsült bevétel: ${formatFt(t.ftHour)}/óra`,
    `Szalaghossz: ${NUM.format(t.beltM)} m`,
    `Elakadások: ${t.jams}`
  ];
}

interface LogisticsPanelProps {
  telemetry: Telemetry | null;
  /** Subscribes on open and unsubscribes on close (D.7). */
  onSubscribe: (on: boolean) => void;
}

/** "Logisztika" tab of the office panel (75): the 1 Hz network telemetry. */
export default function LogisticsPanel({ telemetry, onSubscribe }: LogisticsPanelProps) {
  useEffect(() => {
    onSubscribe(true);
    return () => onSubscribe(false);
  }, [onSubscribe]);
  return (
    <div className="px-4 py-3 space-y-1.5" aria-label="Logisztika">
      {telemetry === null ? (
        <div className="text-xs" style={{ color: T.muted }}>Telemetria betöltése…</div>
      ) : (
        telemetryLines(telemetry).map((line) => (
          <div key={line.split(':')[0]} className="rounded-lg px-3 py-2 text-sm tabular-nums" style={{ background: T.bg2 }}>{line}</div>
        ))
      )}
    </div>
  );
}
