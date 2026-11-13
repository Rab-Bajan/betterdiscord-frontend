// Hex-lámpa jeladók (spec 24): tisztaság szerinti mód és szín, csilingelés a 90 % átlépésekor. Tiszta kód.

export type LampMode = 'strobe' | 'steady' | 'clean';

export const LAMP_COLORS: Readonly<Record<LampMode, number>> = {
  strobe: 0xffd400, // yellow
  steady: 0xff8a00, // orange
  clean: 0x2bff88 // bright green
};

/** Strobe frequency (Hz) of a dirty hex. */
export const STROBE_HZ = 2;

/** < 50 strobing yellow, 50–89 steady orange, ≥ 90 bright green. */
export function lampMode(cleanliness: number): LampMode {
  if (cleanliness >= 90) return 'clean';
  if (cleanliness >= 50) return 'steady';
  return 'strobe';
}

/** Beacon brightness 0..1 at `timeSec` (strobe: 2 Hz, 35 % duty). */
export function lampIntensity(mode: LampMode, timeSec: number, phase = 0): number {
  if (mode !== 'strobe') return 1;
  const t = (timeSec * STROBE_HZ + phase) % 1;
  return t < 0.35 ? 1 : 0.08;
}

/** The chime plays when a hex goes from below 90 to 90 or more. */
export const crossesClean = (previous: number, next: number): boolean => previous < 90 && next >= 90;
