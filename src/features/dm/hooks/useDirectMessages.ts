import { useState, useRef, type RefObject } from 'react';
import { useSocketEvents } from '../../../shared/hooks/useSocketEvents';
import { playPrivateMessageSound } from '../../../shared/services/audio';
import { isRecord, stringField } from '../../../shared/lib/guards';
import type { SocketLike } from '../../../shared/services/socket/SocketLike';
import type { Ack, Attachment, UserSummary } from '../../../shared/types';
import { isDmPartner, parseDirectMessage, parseDmHistory, type DirectMessage, type DmMessages, type DmPartner } from '../types';

const lower = (s: string | null | undefined): string => (s || '').toLowerCase();
export const dmKeyFor = (a: string | null | undefined, b: string | null | undefined): string => [lower(a), lower(b)].sort().join('::');

export interface DirectMessagesApi {
  activeDmPartner: DmPartner | null;
  setActiveDmPartner: (partner: DmPartner | null) => void;
  dmMessages: DmMessages;
  dmPartners: DmPartner[];
  startDm: (partner: DmPartner | null | undefined) => void;
  sendDmMessage: (text: string, attachments?: Attachment[]) => void;
  reportMessage: (messageId: string, reason: string) => Promise<Ack>;
}

const parseAck = (res: unknown): Ack => {
  if (isRecord(res) && res.ok === true) return { ok: true };
  if (isRecord(res)) return { ok: false, error: stringField(res, 'error') ?? '' };
  return { ok: false, error: 'Nincs válasz a szervertől.' };
};

/** The other party of a DM, seen from the current user. */
function partnerOf(dmMsg: DirectMessage, isFromMe: boolean): DmPartner {
  return isFromMe
    ? { id: dmMsg.recipientId ?? undefined, username: dmMsg.recipientUsername ?? '', avatarColor: dmMsg.recipientAvatarColor, avatarUrl: dmMsg.recipientAvatarUrl }
    : { id: dmMsg.senderId ?? undefined, username: dmMsg.senderUsername ?? '', avatarColor: dmMsg.senderAvatarColor, avatarUrl: dmMsg.senderAvatarUrl };
}

export function useDirectMessages(socket: SocketLike, currentUserRef: RefObject<UserSummary | null>): DirectMessagesApi {
  const [activeDmPartner, setActiveDmPartner] = useState<DmPartner | null>(null);
  const [dmMessages, setDmMessages] = useState<DmMessages>({});
  const [dmPartners, setDmPartners] = useState<DmPartner[]>([]);

  const activeDmPartnerRef = useRef(activeDmPartner);
  activeDmPartnerRef.current = activeDmPartner;

  useSocketEvents(socket, {
    'init:data': () => socket.emit('dm:get-conversations'),

    'dm:new-message': (value) => {
      const dmMsg = parseDirectMessage(value);
      if (!dmMsg) return;
      // Hívás-esemény: a küldőt felhasználónév alapján azonosítjuk (több eszköz/fül is lehet)
      const isFromMe = dmMsg.callEvent
        ? lower(dmMsg.senderUsername) === lower(currentUserRef.current?.username)
        : dmMsg.senderId === currentUserRef.current?.id;
      const partner = partnerOf(dmMsg, isFromMe);

      setDmMessages((prev) => ({
        ...prev,
        [dmMsg.dmKey]: [...(prev[dmMsg.dmKey] || []), dmMsg]
      }));

      const isActive = lower(activeDmPartnerRef.current?.username) === lower(partner.username);
      const hasUnread = !isFromMe && !isActive;
      setDmPartners((prev) =>
        prev.some((p) => lower(p.username) === lower(partner.username))
          ? prev.map((p) =>
              lower(p.username) === lower(partner.username)
                ? { ...p, ...partner, hasUnread: hasUnread || p.hasUnread }
                : p
            )
          : [...prev, { ...partner, hasUnread }]
      );

      if (!isFromMe && !dmMsg.callEvent) playPrivateMessageSound();
    },

    'dm:history': (value) => {
      const history = parseDmHistory(value);
      if (!history) return;
      const me = currentUserRef.current;
      const key = history.dmKey || (me && history.partnerUsername ? dmKeyFor(me.username, history.partnerUsername) : null);
      if (key) setDmMessages((prev) => ({ ...prev, [key]: history.messages }));
    },

    // Az admin eltávolított egy üzenetet: a helyén jelzés marad mindkét félnél
    'dm:message-removed': (value) => {
      const id = stringField(value, 'id');
      const dmKey = stringField(value, 'dmKey');
      if (dmKey === undefined) return;
      setDmMessages((prev) => {
        const list = prev[dmKey];
        if (!list) return prev;
        return {
          ...prev,
          [dmKey]: list.map((m) => (m.id === id ? { ...m, text: '', attachments: [], removedByAdmin: true } : m))
        };
      });
    },

    'dm:conversations': (convs) => {
      if (!Array.isArray(convs)) return;
      setDmPartners((prev) => {
        const map = new Map<string, DmPartner>();
        convs.filter(isDmPartner).forEach((c) => map.set(lower(c.username), c));
        prev.forEach((p) => map.set(lower(p.username), { ...map.get(lower(p.username)), ...p }));
        return Array.from(map.values());
      });
    }
  });

  const startDm = (partner: DmPartner | null | undefined) => {
    if (!partner) return;
    setActiveDmPartner(partner);
    setDmPartners((prev) =>
      prev.some((p) => lower(p.username) === lower(partner.username))
        ? prev.map((p) => (lower(p.username) === lower(partner.username) ? { ...p, hasUnread: false } : p))
        : [...prev, { ...partner, hasUnread: false }]
    );
    socket.emit('dm:get-history', { targetUserId: partner.id, targetUsername: partner.username });
  };

  const sendDmMessage = (text: string, attachments: Attachment[] = []) => {
    if (!activeDmPartner) return;
    socket.emit('dm:send-message', {
      targetUserId: activeDmPartner.id,
      targetUsername: activeDmPartner.username,
      text,
      attachments
    });
  };

  // Üzenet jelentése az adminoknak (csak a partner üzenete jelenthető)
  const reportMessage = (messageId: string, reason: string) =>
    new Promise<Ack>((resolve) =>
      socket.emit('dm:report-message', { messageId, reason }, (res: unknown) => resolve(parseAck(res)))
    );

  return { activeDmPartner, setActiveDmPartner, dmMessages, dmPartners, startDm, sendDmMessage, reportMessage };
}
