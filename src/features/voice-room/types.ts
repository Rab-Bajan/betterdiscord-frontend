// Hangszoba: a WebRTC mesh szignálozásának és a szerver hangszoba-eseményeinek típusai.
import { isRecord, isString } from '../../shared/lib/guards';
import { isIceCandidateInit } from '../../shared/lib/iceCandidate';

/** Which of the sender's stream ids is the camera and which the screen share. */
export interface StreamKinds {
  camera?: string | null;
  screen?: string | null;
}

export type VoiceSignal =
  | { type: 'offer' | 'answer'; sdp: RTCSessionDescriptionInit; streams: StreamKinds | undefined }
  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit | null };

const streamKindsOf = (value: unknown): StreamKinds | undefined =>
  isRecord(value)
    ? { camera: isString(value.camera) ? value.camera : null, screen: isString(value.screen) ? value.screen : null }
    : undefined;

const isDescription = (value: unknown): value is RTCSessionDescriptionInit =>
  isRecord(value) && (value.type === 'offer' || value.type === 'answer' || value.type === 'pranswer' || value.type === 'rollback');

/** `webrtc:signal`: the sender's peer id and its signal; null when malformed. */
export function parseVoiceSignal(value: unknown): { senderPeerId: string; signal: VoiceSignal } | null {
  if (!isRecord(value) || !isString(value.senderPeerId) || !isRecord(value.signal)) return null;
  const { senderPeerId, signal } = value;
  if ((signal.type === 'offer' || signal.type === 'answer') && isDescription(signal.sdp)) {
    return { senderPeerId, signal: { type: signal.type, sdp: signal.sdp, streams: streamKindsOf(signal.streams) } };
  }
  if (signal.type === 'ice-candidate') {
    return { senderPeerId, signal: { type: 'ice-candidate', candidate: isIceCandidateInit(signal.candidate) ? signal.candidate : null } };
  }
  return null;
}

/** The ids of the peers already in the room (`voice:joined`). */
export function parseJoinedPeers(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.peers)) return [];
  return value.peers.flatMap((p: unknown) => (isRecord(p) && isString(p.id) ? [p.id] : []));
}

/** What the main area of the voice room shows. */
export type RoomSubView = 'stage' | 'whiteboard' | 'code' | 'casino' | 'watch' | 'chess' | 'empire' | 'phobia' | 'browser' | 'game';

/**
 * A per-room activity or game session as broadcast by the server. The room only reads the
 * common fields below; each activity view reads its own.
 */
export interface RoomSession {
  readonly active?: boolean;
  readonly startedBy?: string;
  readonly playerCount?: number;
  readonly channelId?: string;
  readonly [field: string]: unknown;
}

const optionalOf = (value: unknown, type: 'boolean' | 'string' | 'number'): boolean => value === undefined || value === null || typeof value === type;

export const isRoomSession = (value: unknown): value is RoomSession =>
  isRecord(value) && optionalOf(value.active, 'boolean') && optionalOf(value.startedBy, 'string')
  && optionalOf(value.playerCount, 'number') && optionalOf(value.channelId, 'string');

/** Channel id -> session. */
export type RoomSessions = Readonly<Record<string, RoomSession>>;

export function parseRoomSessions(value: unknown): Record<string, RoomSession> | null {
  if (!isRecord(value)) return null;
  const sessions: Record<string, RoomSession> = {};
  for (const [channelId, session] of Object.entries(value)) {
    if (isRoomSession(session)) sessions[channelId] = session;
  }
  return sessions;
}

export interface Whiteboard {
  id: string;
  title: string;
  creatorName?: string;
}

export const isWhiteboard = (value: unknown): value is Whiteboard => isRecord(value) && isString(value.id) && isString(value.title);
