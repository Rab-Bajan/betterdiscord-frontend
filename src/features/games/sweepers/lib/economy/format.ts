// Phase E kijelzések (E.7/E.8): blokk, LED, LME-szalag, áram, ellenőr – csak szöveg és számok, tiszta kód.
import { formatFt } from '../../theme';
import { DISTRICT_NAMES } from '../../types';
import { GRID_STATES, LME_SERIES, MATERIALS, POWER, PROC_NAMES, isJackpotMat, type GridState } from './tables';
import type { GridRow, InspRow, LmeRow, ScaleWeighed } from '../../economyTypes';

const KG = new Intl.NumberFormat('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUM = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 });
const kgOf = (kgDg: number): string => KG.format(kgDg / 100);
export const signedPct = (p: number): string => `${p > 0 ? '+' : p < 0 ? '−' : '±'}${Math.abs(p)} %`;
/** Series name without its article: `alumínium`, `ócskavas`, `vörösréz`. */
const seriesName = (i: number): string => (LME_SERIES[i]?.name ?? '').replace(/^az? /, '');

/** The receipt strip (88), one string per printed line; `lme` adds the LME line when it is the sale's epoch. */
export function receiptLines(w: ScaleWeighed, lme: LmeRow | null): string[] {
  const out = ['BÉLA BÁ MÉH TELEP', w.scale === 0 ? 'Hídmérleg' : 'Darus mérlegplató', `Nettó: ${kgOf(w.kgDg)} kg`];
  for (const l of w.lines) {
    const name = `${MATERIALS[l.mat]?.name ?? '?'}${l.proc > 0 ? ` (${PROC_NAMES[l.proc] ?? ''})` : ''}`;
    // jackpots: ftPerKg is the Ft per piece
    const pieces = l.ftPerKg > 0 ? Math.round(l.ft / l.ftPerKg) : 1;
    out.push(isJackpotMat(l.mat) ? `${name} · ${pieces} db × ${formatFt(l.ftPerKg)} = ${formatFt(l.ft)}` : `${name} · ${kgOf(l.kgDg)} kg × ${formatFt(l.ftPerKg)} = ${formatFt(l.ft)}`);
  }
  if (w.dirtyFt < 0) out.push(`Szennyezettség −15 % · −${formatFt(-w.dirtyFt)}`);
  if (lme && lme.epoch === w.epoch) out.push(`LME: ${LME_SERIES.map((_, i) => `${seriesName(i)} ${signedPct(lme.pct[i] ?? 0)}`).join(' · ')}`);
  out.push(`Összesen: ${formatFt(w.total)}`, `Csapatkassza 80 %: ${formatFt(w.team)}`, `Bér fejenként: ${formatFt(w.each)} (${w.to.length} fő)`);
  return out;
}

/** The toast the other players see (E.8). */
export const weighedToast = (w: ScaleWeighed): string =>
  `Mérlegelve: ${kgOf(w.kgDg)} kg – ${formatFt(w.total)} (csapat ${formatFt(w.team)}, fejenként ${formatFt(w.each)})`;

/** Seven-segment masks, bit 0 = a … bit 6 = g. */
export const SEVEN_SEG: readonly number[] = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];
export const LED_CELLS = 6;

/** The LED (76): kg with one decimal, right-aligned in 6 cells; leading cells blank (mask 0); caps at 99 999,9. */
export function ledCells(kgDg: number): { readonly mask: number; readonly dp: boolean }[] {
  const tenths = Math.min(999_999, Math.max(0, Math.round(kgDg / 10)));
  const digits = String(tenths).padStart(2, '0');
  const cells = digits.split('').map((d, i) => ({ mask: SEVEN_SEG[Number(d)] ?? 0, dp: i === digits.length - 2 }));
  return [...Array.from({ length: Math.max(0, LED_CELLS - cells.length) }, () => ({ mask: 0, dp: false })), ...cells];
}

/** The office window ticker text (87). */
export const tickerText = (lme: LmeRow): string =>
  `${lme.msg}   ·   ${LME_SERIES.map((_, i) => `${seriesName(i).toUpperCase()} ${signedPct(lme.pct[i] ?? 0)}`).join('   ·   ')}   ·   `;

/** HUD chip: the copper %. */
export const copperChip = (lme: LmeRow): string => `Réz ${signedPct(lme.pct[2] ?? 0)}`;

/** What the grid looks like (84): belt speed, light flicker, floodlights. */
export function gridVisual(grid: GridRow): { readonly state: GridState; readonly beltSpeed: number; readonly flicker: boolean; readonly floodlights: boolean } {
  const state = GRID_STATES[grid.st] ?? 'ok';
  return { state, beltSpeed: grid.pf, flicker: state === 'brownout', floodlights: state !== 'blackout' };
}

/** Toast on a state change (E.8); null when nothing to say. */
export function gridToast(prev: GridRow | null, next: GridRow): string | null {
  if (prev && prev.st === next.st) return null;
  if (next.st === 2) return 'Áramszünet!';
  if (next.st === 1) return 'Feszültségesés – lassulnak a gépek.';
  return null;
}

/** The `Áram` tab (E.7). */
export function gridLines(g: GridRow): string[] {
  const kw = (w: number): string => `${NUM.format(w / 1000)} kW`;
  return [
    `Állapot: ${['Rendben', 'Feszültségesés', 'Áramszünet'][g.st] ?? ''}`,
    `Napelem: ${kw(g.solarW)}`,
    `Generátor: ${g.genOn ? `jár, ${kw(g.genW)}` : 'áll'} · gázolaj ${NUM.format(g.dieselL)} / ${POWER.tankL} L`,
    `Akkumulátor: ${NUM.format(g.battWh / 1000)} / ${POWER.batteryWh / 1000} kWh`,
    `Fogyasztás: ${kw(g.demandW)}`
  ];
}
export const batteryPct = (g: GridRow): number => Math.round(Math.min(1, Math.max(0, g.battWh / POWER.batteryWh)) * 100);

/** HUD chip (86): countdown to the next visit and the worst unlocked district (lowest kg / quota); locked ones are never fined. */
export function inspectorChip(insp: InspRow, serverNow: number, unlocked: ReadonlySet<number>): string {
  const s = Math.max(0, Math.ceil((insp.at - serverNow) / 1000));
  const clock = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const ratio = (d: number): number => (insp.kg[d] ?? 0) / (insp.quota[d] ?? 1);
  const d = insp.quota.flatMap((q, i) => (q > 0 && unlocked.has(i) ? [i] : [])).sort((a, b) => ratio(a) - ratio(b) || a - b)[0];
  if (d === undefined) return `Ellenőr: ${clock}`;
  return `Ellenőr: ${clock} · ${DISTRICT_NAMES[d] ?? ''} ${NUM.format(insp.kg[d] ?? 0)}/${NUM.format(insp.quota[d] ?? 0)} kg`;
}

export const inspectionToast = (fine: number): string => (fine > 0 ? `Városházi ellenőr: ${formatFt(fine)} bírság!` : 'Az ellenőr elégedett.');
export const coinToast = (ft: number): string => `Pénzérme a rostából: ${formatFt(ft)}`;
export const SMOKE_TOAST = 'Füstöl a gép – zsírozd meg a 4 kenési pontot!';
export const SCALE_PROMPT = 'Állj meg 2 mp-re a mérlegen';
