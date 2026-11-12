import React, { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Send, Smile, Plus, X, Loader2 } from 'lucide-react';
import type { Attachment } from '../../../shared/types';
import type { CallPartner } from '../../call/types';
import { hasMarkup } from '../lib/messageMarkup';
import { formatFileSize } from '../lib/fileDisplay';
import type { AttachmentUpload } from '../hooks/useAttachmentUpload';
import type { TextChannel } from '../types';
import MessageContent from './MessageContent';
import FormatToolbar, { runFormatShortcut } from './FormatToolbar';
import FileIcon from './FileIcon';

const QUICK_EMOJIS = ['👋', '🔥', '😂', '🎉', '❤️', '🎮', '👍'];

interface MessageComposerProps {
  channel: TextChannel | null | undefined;
  isDm: boolean;
  dmPartner: CallPartner | null;
  upload: AttachmentUpload;
  onSendMessage: (text: string, attachments: Attachment[]) => void;
}

// Üzenetíró sáv: formázás, előnézet, emojik, csatolmányok és küldés
export default function MessageComposer({ channel, isDm, dmPartner, upload, onSendMessage }: MessageComposerProps) {
  const [inputText, setInputText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // A szövegmező a tartalmával együtt nő, egy határig
  useLayoutEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [inputText]);

  // Üzenet elküldése
  const handleSubmit = (e: FormEvent | KeyboardEvent) => {
    e.preventDefault();
    if (!inputText.trim() && upload.pendingAttachments.length === 0) return;
    if (upload.isUploading) return;

    onSendMessage(inputText.trim(), upload.pendingAttachments);
    setInputText('');
    upload.clearAttachments();
    setShowEmojiPicker(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && runFormatShortcut(e.key, e.currentTarget, inputText, setInputText)) {
      e.preventDefault();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      // Nyitott kódblokkon belül az Enter új sort kezd
      const beforeCaret = inputText.slice(0, e.currentTarget.selectionStart);
      if ((beforeCaret.match(/```/g) || []).length % 2 === 1) return;
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const addEmoji = (emoji: string) => {
    setInputText((prev) => prev + emoji);
  };

  return (
    <>
      {/* Quick emoji drawer */}
      {showEmojiPicker && (
        <div className="absolute bottom-20 right-2 sm:right-6 max-w-[calc(100%-1rem)] overflow-x-auto scrollbar-none rounded-2xl p-2 shadow-2xl flex gap-1 sm:gap-1.5 z-20" style={{ background: '#151832', border: '1px solid rgba(125, 105, 255, 0.25)' }}>
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => addEmoji(emoji)}
              className="text-xl p-2 rounded-xl transition transform hover:scale-125 flex-shrink-0"
              onMouseOver={e => e.currentTarget.style.background = 'rgba(125, 105, 255, 0.15)'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Bottom Message Input Bar */}
      <div className="px-2 pb-2 sm:px-5 sm:pb-5 pb-safe flex-shrink-0 w-full min-w-0">
        {/* KÜLDÉS ELŐTTI CSATOLMÁNYOK SÁVJA */}
        {upload.pendingAttachments.length > 0 && (
          <div className="rounded-t-2xl px-4 py-2 flex items-center gap-2 overflow-x-auto" style={{ background: '#151832', borderTop: '1px solid rgba(125, 105, 255, 0.2)', borderLeft: '1px solid rgba(125, 105, 255, 0.2)', borderRight: '1px solid rgba(125, 105, 255, 0.2)' }}>
            {upload.pendingAttachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs flex-shrink-0 relative group"
                style={{ background: '#1B2040', color: '#F4F3FF', border: '1px solid rgba(125, 105, 255, 0.2)' }}
              >
                <FileIcon mimeType={att.mimeType} filename={att.originalName} />
                <span className="max-w-[140px] truncate font-medium">{att.originalName}</span>
                <span className="text-[10px] font-mono" style={{ color: '#999BBE' }}>({formatFileSize(att.size)})</span>
                <button
                  type="button"
                  onClick={() => upload.removeAttachment(att.id)}
                  title="Csatolmány törlése"
                  className="w-4 h-4 rounded-full flex items-center justify-center transition ml-1"
                  style={{ background: 'rgba(233, 75, 100, 0.2)', color: '#E94B64' }}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Feltöltési állapot jelző */}
        {upload.isUploading && (
          <div className="rounded-t-2xl px-4 py-2 text-xs flex items-center gap-2 animate-pulse" style={{ background: 'rgba(118, 85, 245, 0.15)', color: '#7655F5', border: '1px solid rgba(118, 85, 245, 0.3)' }}>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Fájl(ok) feltöltése folyamatban a szerverre...</span>
          </div>
        )}

        {showPreview && hasMarkup(inputText) && (
          <div
            className="px-4 py-2 mb-2 rounded-2xl max-h-40 overflow-y-auto"
            style={{ background: '#101329', border: '1px solid rgba(125, 105, 255, 0.15)', color: '#F4F3FF' }}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#999BBE' }}>Előnézet</div>
            <MessageContent text={inputText} className="text-sm" />
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className={`px-2 sm:px-4 py-2 flex flex-col gap-1.5 shadow-lg min-w-0 transition-all ${
            upload.pendingAttachments.length > 0 || upload.isUploading ? 'rounded-b-2xl' : 'rounded-2xl'
          }`}
          style={{
            background: '#151832',
            border: '1px solid rgba(125, 105, 255, 0.2)',
          }}
        >
          <FormatToolbar
            textareaRef={inputRef}
            value={inputText}
            onChange={setInputText}
            showPreview={showPreview}
            onTogglePreview={() => setShowPreview((v) => !v)}
          />

          <div className="flex items-end gap-2 sm:gap-3 min-w-0">
          {/* Rejtett fájlválasztó input */}
          <input
            ref={upload.fileInputRef}
            type="file"
            multiple
            onChange={(e) => { void upload.uploadFiles(e.target.files); }}
            className="hidden"
          />

          {/* Fájlfeltöltő gomb (+) */}
          <button
            type="button"
            onClick={() => upload.fileInputRef.current?.click()}
            title="Fájl csatolása (vagy húzd ide a fájlokat az ablakba)"
            className="w-10 h-10 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition flex-shrink-0"
            style={{ background: '#1B2040', color: '#999BBE', border: '1px solid rgba(125, 105, 255, 0.15)' }}
            onMouseOver={e => { e.currentTarget.style.background = '#7655F5'; e.currentTarget.style.color = '#fff'; }}
            onMouseOut={e => { e.currentTarget.style.background = '#1B2040'; e.currentTarget.style.color = '#999BBE'; }}
          >
            <Plus className="w-5 h-5" />
          </button>

          <textarea
            ref={inputRef}
            rows={1}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              upload.pendingAttachments.length > 0
                ? 'Írj megjegyzést a csatolt fájlhoz (vagy Enter a küldéshez)...'
                : isDm && dmPartner
                ? `Privát üzenet neki: @${dmPartner.username} (Húzz ide fájlt is)...`
                : `Üzenet ide: #${channel ? channel.name : 'csatorna'} (Húzz ide fájlt is)...`
            }
            className="flex-1 bg-transparent outline-none text-sm min-w-0 resize-none py-2 leading-5 select-text"
            style={{ color: '#F4F3FF' }}
          />

          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            title="Emoji hozzáadása"
            className="transition p-2 sm:p-1.5 rounded-lg flex-shrink-0 min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 flex items-center justify-center"
            style={{ color: '#999BBE' }}
            onMouseOver={e => e.currentTarget.style.color = '#F5B041'}
            onMouseOut={e => e.currentTarget.style.color = '#999BBE'}
          >
            <Smile className="w-5 h-5" />
          </button>

          <button
            type="submit"
            disabled={(!inputText.trim() && upload.pendingAttachments.length === 0) || upload.isUploading}
            title="Üzenet küldése (Enter)"
            className="w-10 h-10 sm:w-9 sm:h-9 rounded-xl text-white flex items-center justify-center transition shadow-lg flex-shrink-0 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #7655F5, #536CFF)', boxShadow: '0 2px 12px rgba(118, 85, 245, 0.3)' }}
          >
            <Send className="w-4 h-4" />
          </button>
          </div>
        </form>
      </div>
    </>
  );
}
