// A lépéslista párokba rendezése (fehér, fekete) a megjelenítéshez.
import type { ChessHistoryEntry } from '../types';

export interface HistoryRow {
  white: string | null;
  black: string | null;
}

export const historyLabel = (entry: ChessHistoryEntry | string | undefined): string | null =>
  entry === undefined ? null : typeof entry === 'string' ? entry : entry.san || null;

export function formatHistory(history: Array<ChessHistoryEntry | string>): HistoryRow[] {
  const rows: HistoryRow[] = [];
  for (let i = 0; i < history.length; i += 2) {
    rows.push({
      white: historyLabel(history[i]),
      black: historyLabel(history[i + 1])
    });
  }
  return rows;
}
