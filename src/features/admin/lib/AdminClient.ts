// Az admin műveletek socket-hívásai, Promise-ként és típusos válaszokkal. A szerver minden
// eseményt ellenőriz (csak admin futtathatja); itt csak a válaszok alakját ellenőrizzük.
import { isRecord, isString, type UnknownRecord } from '../../../shared/lib/guards';
import type { SocketLike } from '../../../shared/services/socket/SocketLike';
import { isChatMessage } from '../../chat/types';
import type { AdminResult, CasinoPlayer, ChessAdminResult, DmReportContext, DmReportSummary, SlotRig } from '../types';

const NO_REPLY = 'Nincs válasz a szervertől.';

const isCasinoPlayer = (v: unknown): v is CasinoPlayer => isRecord(v) && isString(v.playerId);
const isReportSummary = (v: unknown): v is DmReportSummary => isRecord(v) && isString(v.id);

export class AdminClient {
  readonly #socket: SocketLike;

  constructor(socket: SocketLike) {
    this.#socket = socket;
  }

  listCasinoPlayers(): Promise<AdminResult<CasinoPlayer[]>> {
    return this.#request('admin:casino-list', {}, (r) => (Array.isArray(r.players) ? r.players.filter(isCasinoPlayer) : []));
  }

  setCasinoBalance(playerId: string, balance: number, freeSpins: number): Promise<AdminResult<null>> {
    return this.#request('admin:casino-set-balance', { playerId, balance, freeSpins }, () => null);
  }

  setCasinoRig(playerId: string, rig: SlotRig | null): Promise<AdminResult<null>> {
    return this.#request('admin:casino-set-rig', { playerId, rig }, () => null);
  }

  /** chess events: `admin:chess-force-move`, `admin:chess-put`, `admin:chess-set-turn` */
  chess(event: string, channelId: string, payload: Record<string, unknown>): Promise<AdminResult<ChessAdminResult>> {
    return this.#request(event, { channelId, ...payload }, (r) => ({
      turn: isString(r.turn) ? r.turn : undefined,
      status: isString(r.status) ? r.status : undefined
    }));
  }

  listDmReports(): Promise<AdminResult<DmReportSummary[]>> {
    return this.#request('admin:dm-reports', {}, (r) => (Array.isArray(r.reports) ? r.reports.filter(isReportSummary) : []));
  }

  openDmReport(reportId: string): Promise<AdminResult<DmReportContext>> {
    return this.#request('admin:dm-report-context', { reportId }, (r) => {
      const report = isRecord(r.report) ? r.report : {};
      return {
        report: {
          id: isString(report.id) ? report.id : '',
          reporter: isString(report.reporter) ? report.reporter : '',
          reason: isString(report.reason) ? report.reason : null,
          reportedMessageId: isString(report.reportedMessageId) ? report.reportedMessageId : ''
        },
        messages: Array.isArray(r.messages) ? r.messages.filter(isChatMessage) : []
      };
    });
  }

  removeDmMessage(reportId: string, messageId: string): Promise<AdminResult<null>> {
    return this.#request('admin:dm-remove-message', { reportId, messageId }, () => null);
  }

  resolveDmReport(reportId: string): Promise<AdminResult<null>> {
    return this.#request('admin:dm-resolve', { reportId }, () => null);
  }

  // socket.emit ack-kel, Promise-ként
  #request<T>(event: string, payload: object, read: (reply: UnknownRecord) => T): Promise<AdminResult<T>> {
    return new Promise((resolve) => {
      this.#socket.emit(event, payload, (reply: unknown) => {
        if (!isRecord(reply)) resolve({ ok: false, error: NO_REPLY });
        else if (reply.ok) resolve({ ok: true, value: read(reply) });
        else resolve({ ok: false, error: isString(reply.error) ? reply.error : '' });
      });
    });
  }
}
