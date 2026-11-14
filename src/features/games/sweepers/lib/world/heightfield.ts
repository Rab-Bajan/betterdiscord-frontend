// Domborzat-mintavételezés: a szerver heightfieldje (cm-es egész rács) bilineárisan, mint a szerveren.
import type { Heightfield } from '../../worldTypes';

/** Ground height in metres at world (x, z); clamped to the grid edge outside it. */
export function sampleHeight(hf: Heightfield, x: number, z: number): number {
  const max = hf.size - 1;
  const fx = Math.min(max, Math.max(0, (x - hf.origin) / hf.cell));
  const fz = Math.min(max, Math.max(0, (z - hf.origin) / hf.cell));
  const ix = Math.min(max - 1, Math.floor(fx));
  const iz = Math.min(max - 1, Math.floor(fz));
  const tx = fx - ix;
  const tz = fz - iz;
  const at = (cx: number, cz: number): number => hf.heightsCm[cz * hf.size + cx] ?? 0;
  const h00 = at(ix, iz);
  const h10 = at(ix + 1, iz);
  const h01 = at(ix, iz + 1);
  const h11 = at(ix + 1, iz + 1);
  const top = h00 + (h10 - h00) * tx;
  const bottom = h01 + (h11 - h01) * tx;
  return (top + (bottom - top) * tz) / 100;
}

/** Flat ground (no layout): the Phase A plane at y = 0. */
export const FLAT_GROUND = (): number => 0;
