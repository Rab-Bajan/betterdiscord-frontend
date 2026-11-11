import { useState, useRef } from 'react';
import { useSocketEvents } from './useSocketEvents';
import { playPrivateMessageSound } from '../shared/services/audio';

const lower = (s) => (s || '').toLowerCase();
export const dmKeyFor = (a, b) => [lower(a), lower(b)].sort().join('::');

export function useDirectMessages(socket, currentUserRef) {
  const [activeDmPartner, setActiveDmPartner] = useState(null);
  const [dmMessages, setDmMessages] = useState({}); // dmKey -> üzenetek
  const [dmPartners, setDmPartners] = useState([]); // { id, username, avatarColor, avatarUrl, hasUnread }

  const activeDmPartnerRef = useRef(activeDmPartner);
  activeDmPartnerRef.current = activeDmPartner;

  useSocketEvents(socket, {
    'init:data': () => socket.emit('dm:get-conversations'),

    'dm:new-message': (dmMsg) => {
      // Hívás-esemény: a küldőt felhasználónév alapján azonosítjuk (több eszköz/fül is lehet)
      const isFromMe = dmMsg.callEvent
        ? lower(dmMsg.senderUsername) === lower(currentUserRef.current?.username)
        : dmMsg.senderId === currentUserRef.current?.id;
      const partner = isFromMe
        ? { id: dmMsg.recipientId, username: dmMsg.recipientUsername, avatarColor: dmMsg.recipientAvatarColor, avatarUrl: dmMsg.recipientAvatarUrl }
        : { id: dmMsg.senderId, username: dmMsg.senderUsername, avatarColor: dmMsg.senderAvatarColor, avatarUrl: dmMsg.senderAvatarUrl };

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

    'dm:history': ({ partnerUsername, dmKey, messages }) => {
      const me = currentUserRef.current;
      const key = dmKey || (me && partnerUsername ? dmKeyFor(me.username, partnerUsername) : null);
      if (key) setDmMessages((prev) => ({ ...prev, [key]: messages || [] }));
    },

    // Az admin eltávolított egy üzenetet: a helyén jelzés marad mindkét félnél
    'dm:message-removed': ({ id, dmKey }) => {
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
        const map = new Map();
        convs.forEach((c) => map.set(lower(c.username), c));
        prev.forEach((p) => map.set(lower(p.username), { ...map.get(lower(p.username)), ...p }));
        return Array.from(map.values());
      });
    }
  });

  const startDm = (partner) => {
    if (!partner) return;
    setActiveDmPartner(partner);
    setDmPartners((prev) =>
      prev.some((p) => lower(p.username) === lower(partner.username))
        ? prev.map((p) => (lower(p.username) === lower(partner.username) ? { ...p, hasUnread: false } : p))
        : [...prev, { ...partner, hasUnread: false }]
    );
    socket.emit('dm:get-history', { targetUserId: partner.id, targetUsername: partner.username });
  };

  const sendDmMessage = (text, attachments = []) => {
    if (!activeDmPartner) return;
    socket.emit('dm:send-message', {
      targetUserId: activeDmPartner.id,
      targetUsername: activeDmPartner.username,
      text,
      attachments
    });
  };

  // Üzenet jelentése az adminoknak (csak a partner üzenete jelenthető)
  const reportMessage = (messageId, reason) =>
    new Promise((resolve) =>
      socket.emit('dm:report-message', { messageId, reason }, (res) =>
        resolve(res || { ok: false, error: 'Nincs válasz a szervertől.' })
      )
    );

  return { activeDmPartner, setActiveDmPartner, dmMessages, dmPartners, startDm, sendDmMessage, reportMessage };
}
