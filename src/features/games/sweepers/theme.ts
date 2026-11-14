// SharkVoic sötét téma tokenek (spec 4).
export const SWEEPERS_THEME = {
  bg0: '#090A18',
  bg1: '#101329',
  bg2: '#151832',
  bg3: '#1B2040',
  violet: '#7655F5',
  blue: '#536CFF',
  green: '#28C997',
  red: '#E94B64',
  orange: '#F5A623',
  text: '#E2E8F0',
  muted: '#94A3B8',
  border: 'rgba(118, 85, 245, 0.25)',
  font: 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif'
} as const;

/** Cleanliness text colour, same thresholds as the hex outlines. */
export function cleanlinessTone(cleanliness: number): string {
  if (cleanliness >= 90) return SWEEPERS_THEME.green;
  if (cleanliness >= 50) return SWEEPERS_THEME.orange;
  return SWEEPERS_THEME.red;
}

const HUF = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0 });
export const formatFt = (amount: number): string => `${HUF.format(amount)} Ft`;
