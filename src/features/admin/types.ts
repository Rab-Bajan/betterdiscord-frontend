// Admin menü: a szerver admin-eseményeinek válaszai.
import type { ChatMessage } from '../chat/types';

/** A forced slot result for a casino player's next spins. */
export interface SlotRig {
  mode: string;
  symbols?: string[];
  spins: number;
}

export interface CasinoPlayer {
  playerId: string;
  name?: string | null;
  online?: boolean;
  balance: number;
  freeSpins: number;
  rig?: SlotRig | null;
}

export interface ChessAdminResult {
  turn?: string;
  status?: string;
}

export interface DmReportSummary {
  id: string;
  reporter: string;
  reportedUser: string;
  reason: string | null;
  createdAt: number | null;
}

/** A reported DM with the messages around it. */
export interface DmReportContext {
  report: { id: string; reporter: string; reason: string | null; reportedMessageId: string };
  messages: ChatMessage[];
}

/** Server reply of an admin event: success with data, or a Hungarian error text. */
export type AdminResult<T> = { ok: true; value: T } | { ok: false; error: string };
