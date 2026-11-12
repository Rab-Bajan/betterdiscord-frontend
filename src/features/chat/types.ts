// Csatornák és csevegőüzenetek: típusok és a szerver-üzenetek ellenőrzése.
import { isRecord, isString } from '../../shared/lib/guards';
import type { Attachment } from '../../shared/types';
import type { CallEvent } from '../call/types';

export interface TextChannel {
  id: string;
  name: string;
  description?: string;
}

export interface VoiceChannel {
  id: string;
  name: string;
  userLimit?: number;
}

/**
 * A message as shown in the chat view. Channel messages carry `username`/`avatarColor`; DMs also
 * carry the `sender*` fields; call outcomes in DMs carry `callEvent`.
 */
export interface ChatMessage {
  id: string;
  channelId?: string;
  senderId?: string | null;
  username?: string | null;
  senderUsername?: string | null;
  avatarColor?: string | null;
  senderAvatarColor?: string | null;
  avatarUrl?: string | null;
  senderAvatarUrl?: string | null;
  text?: string | null;
  attachments?: Attachment[] | null;
  timestamp?: string | null;
  isSystem?: boolean;
  removedByAdmin?: boolean;
  callEvent?: CallEvent | null;
}

/** Channel id -> messages. */
export type ChannelMessages = Record<string, ChatMessage[]>;

export const isChatMessage = (value: unknown): value is ChatMessage => isRecord(value) && isString(value.id);

const isTextChannel = (value: unknown): value is TextChannel => isRecord(value) && isString(value.id) && isString(value.name);
const isVoiceChannel = (value: unknown): value is VoiceChannel => isRecord(value) && isString(value.id) && isString(value.name);

export const parseTextChannels = (value: unknown): TextChannel[] | null =>
  Array.isArray(value) ? value.filter(isTextChannel) : null;

export const parseVoiceChannels = (value: unknown): VoiceChannel[] | null =>
  Array.isArray(value) ? value.filter(isVoiceChannel) : null;

export function parseChannelMessages(value: unknown): ChannelMessages | null {
  if (!isRecord(value)) return null;
  const result: ChannelMessages = {};
  for (const [channelId, list] of Object.entries(value)) {
    result[channelId] = Array.isArray(list) ? list.filter(isChatMessage) : [];
  }
  return result;
}

/** `chat:new-message`: a message with the channel it belongs to. */
export const parseChannelMessage = (value: unknown): (ChatMessage & { channelId: string }) | null =>
  isChatMessage(value) && isString(value.channelId) ? { ...value, channelId: value.channelId } : null;
