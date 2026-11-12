import React, { useState, useRef, useEffect, type DragEvent } from 'react';
import { Hash, UploadCloud } from 'lucide-react';
import type { CallPartner } from '../../call/types';
import type { Ack, Attachment } from '../../../shared/types';
import { useAttachmentUpload } from '../hooks/useAttachmentUpload';
import type { ChatMessage, TextChannel } from '../types';
import ChatHeader from './ChatHeader';
import ImageLightbox from './ImageLightbox';
import MessageItem from './MessageItem';
import MessageComposer from './MessageComposer';

interface ChatAreaProps {
  channel: TextChannel | null | undefined;
  messages?: ChatMessage[];
  onSendMessage: (text: string, attachments: Attachment[]) => void;
  onToggleUserList: () => void;
  showUserList: boolean;
  onJoinVoiceChannel: (channelId: string) => void;
  activeVoiceChannel: string | null | undefined;
  onOpenSpeedTest?: () => void;
  onOpenMobileSidebar?: () => void;
  isDm?: boolean;
  dmPartner?: CallPartner | null;
  onReportMessage?: ((messageId: string, reason: string) => Promise<Ack>) | undefined;
  currentUsername: string | null | undefined;
  onStartCall?: ((partner: CallPartner) => void) | undefined;
  callBusy?: boolean;
  onOpenCallSettings?: () => void;
  onOpenCallHistory?: () => void;
}

export default function ChatArea({
  channel,
  messages = [],
  onSendMessage,
  onToggleUserList,
  showUserList,
  onJoinVoiceChannel,
  activeVoiceChannel,
  onOpenSpeedTest,
  onOpenMobileSidebar,
  isDm = false,
  dmPartner = null,
  onReportMessage,
  currentUsername,
  onStartCall,
  callBusy = false,
  onOpenCallSettings,
  onOpenCallHistory
}: ChatAreaProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<Attachment | null>(null);
  const upload = useAttachmentUpload();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);

  const handleReport = async (msg: ChatMessage) => {
    if (!onReportMessage) return;
    const reason = window.prompt('Miért jelented ezt az üzenetet? (Az adminok csak ennek az üzenetnek a környezetét látják.)');
    if (reason === null) return;
    const res = await onReportMessage(msg.id, reason);
    alert(res.ok ? 'Köszönjük, a jelentést elküldtük az adminoknak.' : res.error);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Drag & Drop események kezelése
  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void upload.uploadFiles(e.dataTransfer.files);
    }
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="flex-1 flex flex-col h-full relative min-w-0"
      style={{ background: '#090A18' }}
    >
      {/* DRAG & DROP OVERLAY */}
      {isDragging && (
        <div className="absolute inset-0 z-50 backdrop-blur-md border-4 border-dashed rounded-2xl m-3 flex flex-col items-center justify-center pointer-events-none animate-in fade-in duration-150" style={{ background: 'rgba(9, 10, 24, 0.9)', borderColor: '#7655F5' }}>
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4 animate-bounce" style={{ background: 'rgba(118, 85, 245, 0.2)', color: '#7655F5' }}>
            <UploadCloud className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-extrabold text-white tracking-wide">
            Húzd ide a fájlokat a feltöltéshez!
          </h2>
          <p className="text-xs mt-1" style={{ color: '#999BBE' }}>
            Képek, videók, archívumok vagy dokumentumok (max 100 MB)
          </p>
        </div>
      )}

      {/* KÉP NAGYÍTÓ LIGHTBOX MODAL */}
      {lightboxImage && <ImageLightbox image={lightboxImage} onClose={() => setLightboxImage(null)} />}

      <ChatHeader
        channel={channel}
        isDm={isDm}
        dmPartner={dmPartner}
        onOpenMobileSidebar={onOpenMobileSidebar}
        onStartCall={onStartCall}
        callBusy={callBusy}
        onOpenCallHistory={onOpenCallHistory}
        onOpenCallSettings={onOpenCallSettings}
        onOpenSpeedTest={onOpenSpeedTest}
        activeVoiceChannel={activeVoiceChannel}
        onJoinVoiceChannel={onJoinVoiceChannel}
        showUserList={showUserList}
        onToggleUserList={onToggleUserList}
      />

      {/* Messages Scroll Area */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 sm:px-5 py-4 space-y-1">
        {/* Welcome block */}
        <div className="pt-6 pb-4" style={{ borderBottom: '1px solid rgba(125, 105, 255, 0.12)' }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 shadow-lg" style={{ background: 'rgba(118, 85, 245, 0.15)', border: '1px solid rgba(118, 85, 245, 0.3)', color: '#7655F5' }}>
            {isDm ? <span className="text-2xl">💬</span> : <Hash className="w-7 h-7" />}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold break-words" style={{ color: '#F4F3FF' }}>
            {isDm ? `Beszélgetés vele: @${dmPartner?.username || 'Partner'}` : `Üdv a #${channel ? channel.name : 'csatornában'}!`}
          </h1>
          <p className="text-sm mt-1" style={{ color: '#999BBE' }}>
            {isDm 
              ? `Ez a közvetlen, privát beszélgetésed vele: @${dmPartner?.username}. Az itt küldött üzeneteket és csatolmányokat csak ti ketten látjátok.`
              : `Ez a #${channel ? channel.name : 'csatorna'} kezdete. Küldj üzenetet vagy húzz ide fájlokat a megosztáshoz!`}
          </p>
        </div>

        {messages.map((msg) => (
          <MessageItem
            key={msg.id}
            msg={msg}
            isDm={isDm}
            currentUsername={currentUsername}
            dmPartner={dmPartner}
            onStartCall={onStartCall}
            callBusy={callBusy}
            canReport={!!onReportMessage}
            onReport={handleReport}
            onOpenImage={setLightboxImage}
          />
        ))}

        <div ref={messagesEndRef} />
      </div>

      <MessageComposer channel={channel} isDm={isDm} dmPartner={dmPartner} upload={upload} onSendMessage={onSendMessage} />
    </div>
  );
}
