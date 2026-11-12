// Narrowing of the user lists the server broadcasts (`users:updated`, `voice:states-updated`).
import { isRecord, isString } from './guards';
import type { PresenceUser, SpeedTestResult, VoiceStates } from '../types';

export const isPresenceUser = (value: unknown): value is PresenceUser =>
  isRecord(value) && isString(value.id) && isString(value.username);

/** The valid users of a list; a non-array gives null. */
export function parsePresenceList(value: unknown): PresenceUser[] | null {
  return Array.isArray(value) ? value.filter(isPresenceUser) : null;
}

/** Channel id -> users; a non-object gives null. */
export function parseVoiceStates(value: unknown): VoiceStates | null {
  if (!isRecord(value)) return null;
  const states: VoiceStates = {};
  for (const [channelId, users] of Object.entries(value)) {
    states[channelId] = parsePresenceList(users) ?? [];
  }
  return states;
}

const SPEED_TEST_FIELDS = ['ping', 'download', 'upload', 'jitter', 'testedAt'] as const;

export function parseSpeedTestResult(value: unknown): SpeedTestResult | null {
  if (!isRecord(value) || !SPEED_TEST_FIELDS.every((k) => typeof value[k] === 'number')) return null;
  const { ping, download, upload, jitter, testedAt } = value as Record<(typeof SPEED_TEST_FIELDS)[number], number>;
  return { ping, download, upload, jitter, testedAt };
}
