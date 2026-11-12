// Domain shapes the server sends and two or more features use. Ids are strings (socket ids or
// account ids). Server payloads are checked with the guards in lib/guards.ts before they get these types.

/** The identity fields shown wherever a user appears (avatar, name). */
export interface UserSummary {
  id: string;
  username: string;
  avatarColor?: string | null;
  avatarUrl?: string | null;
}

/** The logged-in user (`init:data.self`, `auth:success.user`). */
export interface CurrentUser extends UserSummary {
  isAdmin?: boolean;
  authenticated?: boolean;
  accountId?: string | null;
  createdAt?: number | null;
}

/** Network speed-test result attached to a user. */
export interface SpeedTestResult {
  ping: number;
  download: number;
  upload: number;
  jitter: number;
  testedAt: number;
}

/** A connected user as broadcast in `users:updated` and listed per voice channel in `voice:states-updated`. */
export interface PresenceUser extends UserSummary {
  voiceChannel?: string | null;
  isMuted?: boolean;
  isDeafened?: boolean;
  isSpeaking?: boolean;
  isScreenSharing?: boolean;
  isCameraOn?: boolean;
  isAdmin?: boolean;
  speedTest?: SpeedTestResult | null;
}

/** Voice channel id -> users in it. */
export type VoiceStates = Record<string, PresenceUser[]>;

/** An uploaded file as returned by `/api/upload` and embedded in messages. */
export interface Attachment {
  id?: string;
  filename?: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
  url?: string;
  downloadUrl?: string;
}

/** Server acknowledgement of a request (socket.io ack callback). */
export type Ack = { ok: true } | { ok: false; error: string };
