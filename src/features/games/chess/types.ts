// Sakk: a szoba partijának állapota (chessHandler.js `sanitizeSession`).
import { isRecord, isString } from '../../../shared/lib/guards';

export interface ChessPlayer {
  id: string;
  username: string;
  avatarColor?: string | null;
  avatarUrl?: string | null;
}

export interface ChessHistoryEntry {
  san?: string;
  from?: string;
  to?: string;
  color?: string;
  fen?: string;
}

export type ChessStatus = 'waiting' | 'playing' | 'checkmate' | 'draw' | 'resigned' | 'timeout';

export interface ChessSession {
  channelId?: string;
  active: boolean;
  fen?: string;
  turn?: 'w' | 'b';
  white: ChessPlayer | null;
  black: ChessPlayer | null;
  spectators: ChessPlayer[];
  history: Array<ChessHistoryEntry | string>;
  status: ChessStatus | string;
  winner: 'white' | 'black' | 'draw' | null;
  reason?: string | null;
  inCheck: boolean;
  startedBy?: string;
  lastMove: { from: string; to: string } | null;
}

const isPlayerOrNull = (v: unknown): boolean => v === null || v === undefined || (isRecord(v) && isString(v.id) && isString(v.username));

/** A room session that has the fields of a chess game. */
export const isChessSession = (v: unknown): v is ChessSession =>
  isRecord(v) && typeof v.active === 'boolean' && isPlayerOrNull(v.white) && isPlayerOrNull(v.black)
  && Array.isArray(v.spectators) && Array.isArray(v.history) && isString(v.status)
  && (v.lastMove === null || v.lastMove === undefined || (isRecord(v.lastMove) && isString(v.lastMove.from) && isString(v.lastMove.to)));
