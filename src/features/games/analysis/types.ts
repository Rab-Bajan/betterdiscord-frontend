// Játszma-elemzés: a /api/analysis REST végpontok válaszainak típusai (betterdiscord/analysis).
import { isRecord, isString } from '../../../shared/lib/guards';
import type { Score } from './lib/analysisFormat';

export type PlayerColor = 'white' | 'black';

export interface PlayerInfo {
  name: string;
  rating: number | null;
}

/** Short summary of an imported game (`describeGame`). */
export interface ImportedGameInfo {
  white: PlayerInfo;
  black: PlayerInfo;
  result: string;
  termination: string | null;
  date: string | null;
  time: string | null;
  timeControl: string | null;
  eco: string | null;
  plies: number;
  moves: string[];
}

export interface ImportedGame {
  pgn: string;
  game: ImportedGameInfo;
  source: string | undefined;
  link: string | undefined;
}

export interface AnalysisPosition {
  ply: number;
  fen: string;
  eval: Score | null;
  terminal: string | null;
}

export interface MoveSuggestion {
  uci: string;
  san: string | null;
  score: Score;
}

export interface MissedTactic {
  type: 'mate' | 'material';
  mateIn?: number;
  gain?: number;
}

export interface AnalyzedMove {
  ply: number;
  moveNumber: number;
  color: PlayerColor;
  san: string;
  uci: string;
  from: string;
  to: string;
  piece: string;
  captured: string | null;
  fen: string;
  classification: string;
  symbol: string;
  cpl: number;
  winLoss: number;
  accuracy: number;
  winBefore: number;
  winAfter: number;
  evalBefore: Score;
  evalAfter: Score;
  playedScore: Score;
  best: MoveSuggestion & { line: string[] };
  alternatives: MoveSuggestion[];
  isRecapture: boolean;
  sacrifice: number;
  missedTactic: MissedTactic | null;
  clock: number | null;
}

export interface SideSummary {
  accuracy: number | null;
  averageCpl: number | null;
  counts: Record<string, number>;
}

export interface AnalysisResult {
  players: Record<PlayerColor, PlayerInfo>;
  result: string;
  termination: string | null;
  date: string | null;
  time: string | null;
  timeControl: string | null;
  opening: { eco: string; name: string; lastBookPly: number } | null;
  startFen: string;
  positions: AnalysisPosition[];
  moves: AnalyzedMove[];
  summary: Record<PlayerColor, SideSummary>;
  engine: { name: string; depth: number | null; movetimeMs: number | null; multipv: number; reachedDepth: number };
}

export interface AnalysisProgressInfo {
  done: number;
  total: number;
  percent: number;
  etaSeconds: number | null;
  queuePosition: number | null;
}

export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

export interface AnalysisSettings {
  depth?: number | undefined;
  movetimeMs?: number | undefined;
  multipv?: number | undefined;
  engine: string;
}

const isPlayer = (v: unknown): v is PlayerInfo => isRecord(v) && isString(v.name);

export const isImportedGameInfo = (v: unknown): v is ImportedGameInfo =>
  isRecord(v) && isPlayer(v.white) && isPlayer(v.black) && typeof v.plies === 'number';

/** The analysis result is produced by our own server; the top-level shape is checked. */
export const isAnalysisResult = (v: unknown): v is AnalysisResult =>
  isRecord(v) && isRecord(v.players) && isPlayer(v.players.white) && isPlayer(v.players.black)
  && Array.isArray(v.positions) && v.positions.length > 0 && Array.isArray(v.moves) && isRecord(v.summary) && isRecord(v.engine);
