// A /api/analysis végpontok hívása. Hálózati vagy formátumhiba esetén is { ok: false, error } választ ad.
import { isRecord, isString, type UnknownRecord } from '../../../../shared/lib/guards';

const API = '/api/analysis';

export type ApiReply = { ok: true; body: UnknownRecord } | { ok: false; error: string | undefined; body: UnknownRecord };

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export class AnalysisApi {
  readonly #fetch: Fetch;

  constructor(fetchFn: Fetch = (input, init) => fetch(input, init)) {
    this.#fetch = fetchFn;
  }

  get(path: string): Promise<ApiReply> {
    return this.#request(path);
  }

  post(path: string, body: unknown): Promise<ApiReply> {
    return this.#request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  delete(path: string): Promise<ApiReply> {
    return this.#request(path, { method: 'DELETE' });
  }

  async #request(path: string, options?: RequestInit): Promise<ApiReply> {
    let response: Response;
    try {
      response = await this.#fetch(`${API}${path}`, options);
    } catch {
      return { ok: false, error: 'A szerver nem érhető el. Ellenőrizd a kapcsolatot.', body: {} };
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { ok: false, error: 'Váratlan válasz a szervertől.', body: {} };
    }
    if (!isRecord(body)) return { ok: false, error: undefined, body: {} };
    return body.ok ? { ok: true, body } : { ok: false, error: isString(body.error) ? body.error : undefined, body };
  }
}
