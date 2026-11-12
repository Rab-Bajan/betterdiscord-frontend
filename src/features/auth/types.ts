// Belépés és profil: a felületről érkező kérések és a szerver válaszainak ellenőrzése.
import { isRecord, isString, stringField } from '../../shared/lib/guards';
import type { CurrentUser } from '../../shared/types';

export type LoginRequest =
  | { type: 'login'; username: string; password: string }
  | { type: 'register'; username: string; password: string; avatarColor: string }
  | { type: 'guest'; username: string; avatarColor: string };

export interface ProfileUpdate {
  username: string;
  avatarColor: string;
  avatarUrl: string | null;
}

export const isCurrentUser = (value: unknown): value is CurrentUser =>
  isRecord(value) && isString(value.id) && isString(value.username);

/** `auth:success`: the user and (for accounts) a session token. */
export function parseAuthSuccess(value: unknown): { user: CurrentUser; token: string | undefined } | null {
  if (!isRecord(value) || !isCurrentUser(value.user)) return null;
  return { user: value.user, token: stringField(value, 'token') };
}

/** The `error` text of `auth:error` / `profile:error`. */
export const errorTextOf = (value: unknown): string | null => stringField(value, 'error') ?? null;
