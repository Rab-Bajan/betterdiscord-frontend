// Az elemzés megjelenítési segédfüggvényei

/** Engine evaluation from White's point of view: centipawns or mate-in-N (negative: Black mates). */
export type Score = { cp: number; mate?: undefined } | { mate: number; cp?: undefined };

export interface FormatScoreOptions {
  terminal?: string | null;
}

// Értékelés szövegesen: +0.35 / -1.20 / #3 (a matt jelzése), fehér szemszögéből
export function formatScore(score: Score | null | undefined, { terminal = null }: FormatScoreOptions = {}): string {
  if (terminal === 'checkmate') return '#';
  if (!score) return '–';
  if (score.mate !== undefined) return `#${Math.abs(score.mate)}`;
  const pawns = score.cp / 100;
  const clipped = Math.max(-99, Math.min(99, pawns));
  return `${clipped > 0 ? '+' : ''}${clipped.toFixed(2)}`;
}

// Fehér nyerési esélye (0..1) – a grafikonhoz és az értékelősávhoz. A matt a szélső érték.
export function whiteShare(score: Score | null | undefined): number {
  if (!score) return 0.5;
  if (score.mate !== undefined) return score.mate > 0 ? 1 : 0;
  const cp = Math.max(-1000, Math.min(1000, score.cp));
  return 0.5 + (2 / (1 + Math.exp(-0.00368208 * cp)) - 1) / 2;
}

// Kijelzéshez: a mattot is számként vesszük a grafikon y tengelyén
export const scoreSign = (score: Score | null | undefined): number =>
  (score?.mate !== undefined ? Math.sign(score.mate) : Math.sign(score?.cp || 0));

export function formatClock(seconds: number | null | undefined): string | null {
  if (seconds == null) return null;
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export const resultLabel = (result: string | null | undefined): string =>
  ({ '1-0': 'Fehér nyert', '0-1': 'Fekete nyert', '1/2-1/2': 'Döntetlen' } as Partial<Record<string, string>>)[String(result)] || 'Eredmény ismeretlen';

export interface LabelledMove {
  moveNumber: number;
  color: 'white' | 'black';
  san: string;
}

// Lépésszám + SAN: "12. Nf3" vagy "12... Nf6"
export const moveLabel = (move: LabelledMove): string => `${move.moveNumber}${move.color === 'white' ? '.' : '...'} ${move.san}`;
