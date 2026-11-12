import React from 'react';
import { Flag, ShieldOff } from 'lucide-react';
import Avatar from '../../../shared/ui/Avatar';
import CallEventMessage from '../../call/components/CallEventMessage';
import type { CallPartner } from '../../call/types';
import type { Attachment } from '../../../shared/types';
import type { ChatMessage } from '../types';
import MessageContent from './MessageContent';
import CopyButton from './CopyButton';
import MessageAttachment from './MessageAttachment';

interface MessageItemProps {
  msg: ChatMessage;
  isDm: boolean;
  currentUsername: string | null | undefined;
  dmPartner: CallPartner | null;
  onStartCall?: ((partner: CallPartner) => void) | undefined;
  callBusy: boolean;
  /** Set when the user may report messages (DMs only). */
  canReport: boolean;
  onReport: (msg: ChatMessage) => void;
  onOpenImage: (image: Attachment) => void;
}

// Egy csevegőüzenet: szerző, idő, tartalom, csatolmányok és műveletek
export default function MessageItem({
  msg,
  isDm,
  currentUsername,
  dmPartner,
  onStartCall,
  callBusy,
  canReport,
  onReport,
  onOpenImage
}: MessageItemProps) {
  const authorName = msg.username || msg.senderUsername || (msg.isSystem ? 'Rendszer' : 'Felhasználó');
  const authorAvatarColor = msg.avatarColor || msg.senderAvatarColor || '#7655F5';
  const authorAvatarUrl = msg.avatarUrl || msg.senderAvatarUrl || null;

  // Hívás-esemény: rendszerüzenet a beszélgetésben, "Hívás újra" gombbal
  if (msg.callEvent) {
    return (
      <CallEventMessage
        msg={{ callEvent: msg.callEvent, timestamp: msg.timestamp }}
        myUsername={currentUsername}
        partner={dmPartner}
        onCallAgain={onStartCall}
        callDisabled={callBusy}
      />
    );
  }

  return (
    <div
      className="relative flex items-start gap-3 sm:gap-4 px-2 sm:px-4 py-1.5 rounded-xl group transition-all min-w-0"
      style={{
        background: msg.isSystem ? 'rgba(118, 85, 245, 0.08)' : 'transparent',
        borderLeft: msg.isSystem ? '3px solid #7655F5' : '3px solid transparent',
      }}
      onMouseOver={e => { if (!msg.isSystem) e.currentTarget.style.background = 'rgba(125, 105, 255, 0.04)'; }}
      onMouseOut={e => { if (!msg.isSystem) e.currentTarget.style.background = 'transparent'; }}
    >
      {/* Üzenet műveletek */}
      {msg.text && !msg.removedByAdmin && (
        <div
          className="absolute -top-2 right-2 sm:right-3 z-10 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition"
          style={{ background: '#151832', border: '1px solid rgba(125, 105, 255, 0.25)', color: '#999BBE' }}
        >
          <CopyButton text={msg.text} title="Üzenet másolása" className="p-1.5 rounded-lg hover:text-white" />
        </div>
      )}

      {/* Avatar */}
      <Avatar username={authorName} avatarUrl={authorAvatarUrl} avatarColor={authorAvatarColor} size="md" className="mt-0.5" />

      {/* Message Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-x-2 gap-y-0 flex-wrap min-w-0">
          <span
            className="font-semibold text-sm hover:underline cursor-pointer truncate max-w-[60%] sm:max-w-xs"
            title={authorName}
            style={{ color: authorAvatarColor }}
          >
            {authorName}
          </span>
          {msg.isSystem && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white uppercase tracking-wider whitespace-nowrap" style={{ background: '#7655F5' }}>
              Rendszer
            </span>
          )}
          <span className="text-[11px] whitespace-nowrap" style={{ color: '#999BBE' }}>{msg.timestamp}</span>
          {isDm && canReport && !msg.removedByAdmin && !msg.isSystem &&
            authorName.toLowerCase() !== (currentUsername || '').toLowerCase() && (
              <button
                type="button"
                onClick={() => onReport(msg)}
                title="Üzenet jelentése az adminoknak"
                className="ml-1 p-1 rounded opacity-0 group-hover:opacity-100 transition"
                style={{ color: '#999BBE' }}
                onMouseOver={(e) => (e.currentTarget.style.color = '#E94B64')}
                onMouseOut={(e) => (e.currentTarget.style.color = '#999BBE')}
              >
                <Flag className="w-3.5 h-3.5" />
              </button>
          )}
        </div>

        {/* Admin által eltávolított üzenet: látható jelzés a tartalom helyett */}
        {msg.removedByAdmin && (
          <p className="text-sm mt-0.5 italic flex items-center gap-1.5" style={{ color: '#999BBE' }}>
            <ShieldOff className="w-3.5 h-3.5" /> Ezt az üzenetet egy admin eltávolította.
          </p>
        )}

        {/* Szöveges tartalom ha van */}
        {msg.text && (
          <MessageContent text={msg.text} className="text-sm mt-0.5" />
        )}

        {/* CSATOLT FÁJLOK MEGJELENÍTÉSE */}
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="mt-2 space-y-2 max-w-xl min-w-0">
            {msg.attachments.map((att) => (
              <MessageAttachment key={att.id || att.filename} att={att} onOpenImage={onOpenImage} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
