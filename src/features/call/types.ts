// DM hanghívás: a hívás állapota és a szerverrel váltott socket-üzenetek típusai.
import { isRecord, isString, optionalString } from '../../shared/lib/guards';
import { isIceCandidateInit } from '../../shared/lib/iceCandidate';

/**
 * calling      outgoing: the invite is on its way to the server
 * ringing      outgoing: the other device rings | incoming: it rings here
 * connecting   accepted, the audio link is being built
 * connected    audio is live
 * reconnecting the link dropped, automatic recovery is running
 * the rest are terminal states, shown briefly
 */
export type CallStatus =
  | 'calling'
  | 'ringing'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'ended'
  | 'declined'
  | 'missed'
  | 'busy'
  | 'failed'
  | 'cancelled'
  | 'handled';

/** Status passed to the local finish step; `completed` is shown as `ended`. */
export type CallFinishStatus = Exclude<CallStatus, 'calling' | 'ringing' | 'connecting' | 'connected' | 'reconnecting'> | 'completed';

export type CallDirection = 'incoming' | 'outgoing';
export type CallQualityLevel = 'good' | 'fair' | 'poor';
export type CallRoute = 'relay' | 'direct';
export type CallWarning = 'mic-lost' | 'autoplay';

/** The other party as shown on the call screen. */
export interface CallPeer {
  username: string;
  displayName: string;
  avatarColor?: string | null | undefined;
  avatarUrl?: string | null | undefined;
}

/** A user the current user can call. */
export interface CallPartner {
  username: string;
  displayName?: string | null;
  avatarColor?: string | null;
  avatarUrl?: string | null;
}

/** Everything the UI shows about the current (or just finished) call. */
export interface CallState {
  id: string | null;
  direction: CallDirection;
  peer: CallPeer;
  status: CallStatus;
  muted?: boolean;
  peerMuted?: boolean;
  peerOffline?: boolean;
  terminal?: boolean;
  /** Error code, a key of CALL_ERRORS (or a server reason such as `expired`). */
  reason?: string | undefined;
  warning?: CallWarning | null;
  startedAt?: number;
  durationSec?: number | undefined;
  turn?: boolean | undefined;
  quality?: CallQualityLevel;
  rttMs?: number | null;
  codec?: string | null;
  bitrateKbps?: number;
  route?: CallRoute | null;
}

export type CallActionResult = { ok: true } | { ok: false; error: string };

/** Call outcome stored as a DM system message (`msg.callEvent`) and in the call history. */
export interface CallEvent {
  callId?: string;
  status?: string;
  durationSec?: number;
  callerUsername?: string;
  calleeUsername?: string;
  endReason?: string | null;
}

export const CALL_ERRORS = {
  'mic-denied': 'A mikrofon használata le van tiltva. Engedélyezd a böngésző címsorában, majd próbáld újra.',
  'mic-missing': 'Nem található mikrofon. Csatlakoztass egyet, és próbáld újra.',
  'mic-busy': 'A mikrofont egy másik alkalmazás használja, vagy nem érhető el.',
  offline: 'A felhasználó jelenleg nem elérhető. A nem fogadott hívás megjelenik a beszélgetésben.',
  busy: 'A felhasználó éppen egy másik hívásban van.',
  'not-found': 'Csak regisztrált felhasználót lehet felhívni.',
  self: 'Saját magadat nem hívhatod.',
  'already-in-call': 'Már van egy aktív hívásod.',
  'rate-limited': 'Túl sok hívási kísérlet. Várj egy kicsit.',
  unauthenticated: 'Hívásokhoz be kell jelentkezned fiókkal (vendégként nem lehetséges).',
  'connection-lost': 'A kapcsolat megszakadt, és nem sikerült helyreállítani.',
  'connect-timeout': 'Nem sikerült létrehozni a hangkapcsolatot (tűzfal vagy hálózati korlátozás?).',
  generic: 'A hívás nem sikerült.'
} as const satisfies Record<string, string>;

/** The user-facing text of an error code; unknown codes get the generic text. */
export const callErrorText = (code: string): string =>
  (CALL_ERRORS as Readonly<Partial<Record<string, string>>>)[code] || CALL_ERRORS.generic;

// ---------- signalling (peer <-> peer through `call:signal`) ----------

export type CallSignal =
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'candidate'; candidate: RTCIceCandidateInit | null }
  | { type: 'restart-request' }
  | { type: 'media'; muted: boolean };

export function parseCallSignal(value: unknown): CallSignal | null {
  if (!isRecord(value)) return null;
  switch (value.type) {
    case 'offer':
    case 'answer':
      return isString(value.sdp) ? { type: value.type, sdp: value.sdp } : null;
    case 'candidate':
      return { type: 'candidate', candidate: isIceCandidateInit(value.candidate) ? value.candidate : null };
    case 'restart-request':
      return { type: 'restart-request' };
    case 'media':
      return { type: 'media', muted: !!value.muted };
    default:
      return null;
  }
}

// ---------- server -> client payloads ----------

/** Peer data the server may return about the callee. */
export interface ServerPeerInfo {
  avatarColor?: string | undefined;
  avatarUrl?: string | undefined;
}

/** `call:invite` acknowledgement. */
export interface InviteAck {
  ok: boolean;
  error?: string;
  callId?: string;
  iceServers?: RTCIceServer[];
  turnEnabled?: boolean;
  peer?: ServerPeerInfo;
}

/** `call:accept` acknowledgement. */
export interface AcceptAck {
  ok: boolean;
  iceServers?: RTCIceServer[];
}

/** `call:sync` acknowledgement. */
export interface SyncAck {
  resumed?: boolean;
  stale?: boolean;
}

export interface IncomingCallPayload {
  callId: string;
  caller: CallPartner;
}

export interface CallEndedPayload {
  callId: string;
  status: string;
  reason?: string | undefined;
  durationSec?: number | undefined;
}

const isIceServer = (value: unknown): value is RTCIceServer =>
  isRecord(value) && (isString(value.urls) || (Array.isArray(value.urls) && value.urls.every(isString)));

const iceServersOf = (value: unknown): RTCIceServer[] | undefined =>
  Array.isArray(value) ? value.filter(isIceServer) : undefined;

const peerInfoOf = (value: unknown): ServerPeerInfo | undefined =>
  isRecord(value) ? { avatarColor: optionalString(value.avatarColor), avatarUrl: optionalString(value.avatarUrl) } : undefined;

export function parseInviteAck(value: unknown): InviteAck {
  if (!isRecord(value)) return { ok: false };
  return {
    ok: !!value.ok,
    error: optionalString(value.error),
    callId: optionalString(value.callId),
    iceServers: iceServersOf(value.iceServers),
    turnEnabled: typeof value.turnEnabled === 'boolean' ? value.turnEnabled : undefined,
    peer: peerInfoOf(value.peer)
  };
}

export function parseAcceptAck(value: unknown): AcceptAck {
  if (!isRecord(value)) return { ok: false };
  return { ok: !!value.ok, iceServers: iceServersOf(value.iceServers) };
}

export function parseSyncAck(value: unknown): SyncAck {
  if (!isRecord(value)) return {};
  return { resumed: !!value.resumed, stale: !!value.stale };
}

/** The `callId` of any call event payload. */
export const callIdOf = (value: unknown): string | undefined => (isRecord(value) ? optionalString(value.callId) : undefined);

export function parseIncomingCall(value: unknown): IncomingCallPayload | null {
  if (!isRecord(value) || !isString(value.callId) || !isRecord(value.caller) || !isString(value.caller.username)) return null;
  const { caller } = value;
  return {
    callId: value.callId,
    caller: {
      username: caller.username as string,
      displayName: optionalString(caller.displayName),
      avatarColor: optionalString(caller.avatarColor),
      avatarUrl: optionalString(caller.avatarUrl)
    }
  };
}

export function parseCallEnded(value: unknown): CallEndedPayload | null {
  if (!isRecord(value) || !isString(value.callId) || !isString(value.status)) return null;
  return {
    callId: value.callId,
    status: value.status,
    reason: optionalString(value.reason),
    durationSec: typeof value.durationSec === 'number' ? value.durationSec : undefined
  };
}

/** One row of the `call:history` acknowledgement. */
export interface CallHistoryEntry extends CallEvent {
  id: string;
  createdAt: number;
}

/** The calls of a `call:history` acknowledgement; empty on error. */
export function parseCallHistoryAck(value: unknown): CallHistoryEntry[] {
  if (!isRecord(value) || !value.ok || !Array.isArray(value.calls)) return [];
  return value.calls.filter((c): c is CallHistoryEntry => isRecord(c) && isString(c.id));
}
