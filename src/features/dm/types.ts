// Privát üzenetek: a beszélgetőpartner és a DM üzenetek típusai, szerver-üzenetek ellenőrzése.
import { isRecord, isString, optionalString, stringField } from '../../shared/lib/guards';
import { isChatMessage, type ChatMessage } from '../chat/types';

/**
 * A DM conversation partner. `id` is the partner's socket id; it is missing when the partner was
 * offline when the message was sent, and DMs are then addressed by username.
 */
export interface DmPartner {
  id?: string | undefined;
  username: string;
  avatarColor?: string | null | undefined;
  avatarUrl?: string | null | undefined;
  hasUnread?: boolean;
  lastMessage?: string;
  lastTimestamp?: string | null;
}

/** A direct message (`dm:new-message`, `dm:history`). */
export interface DirectMessage extends ChatMessage {
  dmKey: string;
  recipientId?: string | null;
  recipientUsername?: string | null;
  recipientAvatarColor?: string | null;
  recipientAvatarUrl?: string | null;
}

/** dmKey -> messages. */
export type DmMessages = Record<string, ChatMessage[]>;

export function parseDirectMessage(value: unknown): DirectMessage | null {
  if (!isChatMessage(value)) return null;
  const dmKey = stringField(value, 'dmKey');
  return dmKey === undefined ? null : { ...value, dmKey };
}

export interface DmHistoryPayload {
  partnerUsername: string | undefined;
  dmKey: string | undefined;
  messages: ChatMessage[];
}

export function parseDmHistory(value: unknown): DmHistoryPayload | null {
  if (!isRecord(value)) return null;
  return {
    partnerUsername: optionalString(value.partnerUsername),
    dmKey: optionalString(value.dmKey),
    messages: Array.isArray(value.messages) ? value.messages.filter(isChatMessage) : []
  };
}

export const isDmPartner = (value: unknown): value is DmPartner => isRecord(value) && isString(value.username);
