import React from 'react';
import { SWEEPERS_THEME as T } from '../theme';
import type { SweepersVehicleHud } from '../lib/engine/SweepersGame';

const panel = { background: 'rgba(16, 19, 41, 0.85)', border: `1px solid ${T.border}` } as const;
const KG = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0 });
const LIGHTS = ['Ki', 'Tompa', 'Távolsági'] as const;

/** A labelled 0..1 bar gauge. */
function Gauge({ label, value, text, warn }: { label: string; value: number; text: string; warn: boolean }) {
  return (
    <div className="w-28">
      <div className="flex justify-between text-[10px]" style={{ color: T.muted }}><span>{label}</span><span className="tabular-nums" style={warn ? { color: T.red } : undefined}>{text}</span></div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: T.bg3 }}>
        <div className="h-full" style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`, background: warn ? T.red : T.green }} />
      </div>
    </div>
  );
}

/** The cockpit (98): speedometer, fuel, water temperature, bed, damage, lever hint and the bouncing mirror frame (F.10). */
export default function VehicleDash({ hud }: { hud: SweepersVehicleHud }) {
  const d = hud.dash;
  if (!d) {
    return hud.prompt ? (
      <div className="absolute left-1/2 top-[62%] -translate-x-1/2 z-20 rounded-md px-3 py-1 text-xs font-bold pointer-events-none" style={{ ...panel, color: T.text }}>{hud.prompt}</div>
    ) : null;
  }
  // the mirror frame bounces with the speed (no reflection: a second scene render would double the draws)
  const bounce = Math.min(3, d.kmh / 15);
  return (
    <div className="absolute inset-x-0 bottom-0 z-20 pointer-events-none flex flex-col items-center gap-2 pb-24" style={{ fontFamily: T.font, color: T.text }} aria-label="Műszerfal">
      {!d.manual && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-40 h-10 rounded-md" style={{ border: '3px solid #1c1c1c', background: 'linear-gradient(180deg, #8fa6bf, #4c5a6a)', transform: `translate(-50%, ${bounce * Math.sin(d.kmh)}px)` }} aria-hidden="true" />
      )}
      {d.tipHint && <div className="rounded-md px-3 py-1 text-xs font-bold" style={panel}>{d.tipHint}</div>}
      <div className="rounded-xl px-4 py-2 flex items-end gap-4" style={panel}>
        <div className="text-center">
          <div className="text-3xl font-black tabular-nums leading-none">{d.kmh}</div>
          <div className="text-[10px]" style={{ color: T.muted }}>km/h</div>
        </div>
        <div className="flex flex-col gap-1">
          {d.fuel !== null && <Gauge label="Üzemanyag" value={d.fuel} text={`${d.fuelL.toFixed(1)} / ${d.tankL} L`} warn={d.fuel < 0.15} />}
          {!d.manual && <Gauge label="Vízhőfok" value={(d.tempC - 20) / 100} text={`${d.tempC} °C`} warn={false} />}
          <Gauge label="Plató" value={d.capKg > 0 ? d.bedKg / d.capKg : 0} text={`${KG.format(d.bedKg)} / ${KG.format(d.capKg)} kg`} warn={d.bedKg >= d.capKg} />
        </div>
        <div className="text-[10px] space-y-0.5" style={{ color: T.muted }}>
          <div className="font-bold" style={{ color: T.text }}>{d.name}</div>
          {d.bags > 0 && <div>Zsákok: {d.bags}</div>}
          {!d.manual && <div>Lámpa: {LIGHTS[d.lights]}{d.beacon ? ' · Villogó' : ''}</div>}
          {d.stalled && <div style={{ color: T.red }}>Lefulladt</div>}
          {(d.punct || d.align > 0) && <div style={{ color: T.orange }}>{d.punct ? 'Defekt' : ''}{d.punct && d.align > 0 ? ' · ' : ''}{d.align > 0 ? `Futómű ${d.align}/4` : ''}</div>}
          {d.driver && <div>{d.manual ? 'W/S tolás' : 'W/S gáz/fék'} · A/D kormány · E kiszállás</div>}
        </div>
      </div>
    </div>
  );
}
