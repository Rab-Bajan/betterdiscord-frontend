import React, { useState, useRef, useEffect } from 'react';
import {
  Hash,
  Send,
  Smile,
  Users,
  PhoneCall,
  Activity,
  Plus,
  Upload,
  UploadCloud,
  File,
  FileText,
  FileArchive,
  FileCode,
  Image as ImageIcon,
  Film,
  Volume2,
  Download,
  X,
  ExternalLink,
  Loader2,
  Check
} from 'lucide-react';

const QUICK_EMOJIS = ['👋', '🔥', '😂', '🎉', '❤️', '🎮', '👍'];

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(mimeType = '', filename = '') {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
    return <ImageIcon className="w-5 h-5 text-discord-primary" />;
  }
  if (mimeType.startsWith('video/') || ['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(ext)) {
    return <Film className="w-5 h-5 text-rose-400" />;
  }
  if (mimeType.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) {
    return <Volume2 className="w-5 h-5 text-emerald-400" />;
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) || mimeType.includes('zip') || mimeType.includes('archive')) {
    return <FileArchive className="w-5 h-5 text-amber-400" />;
  }
  if (['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'py', 'c', 'cpp', 'java', 'sql', 'sh', 'bat'].includes(ext)) {
    return <FileCode className="w-5 h-5 text-cyan-400" />;
  }
  if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'md'].includes(ext) || mimeType.includes('pdf') || mimeType.includes('document')) {
    return <FileText className="w-5 h-5 text-blue-400" />;
  }
  return <File className="w-5 h-5 text-gray-300" />;
}

export default function ChatArea({
  channel,
  messages = [],
  onSendMessage,
  onToggleUserList,
  showUserList,
  onJoinVoiceChannel,
  activeVoiceChannel,
  onOpenSpeedTest
}) {
  const [inputText, setInputText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragCounterRef = useRef(0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fájlok feltöltése a backend /api/upload végpontjára
  const uploadFiles = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const filesArray = Array.from(fileList);

    setIsUploading(true);
    const formData = new FormData();
    filesArray.forEach((f) => {
      formData.append('files', f);
    });

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Hiba történt a fájlok feltöltésekor.');
      }

      const data = await response.json();
      if (data.ok && Array.isArray(data.files)) {
        setPendingAttachments((prev) => [...prev, ...data.files]);
      }
    } catch (err) {
      console.error('[Upload Hiba]:', err);
      alert('Nem sikerült feltölteni a fájlt: ' + err.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Drag & Drop események kezelése
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  };

  // Csatolmány eltávolítása küldés előtt
  const handleRemoveAttachment = (id) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // Üzenet elküldése
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim() && pendingAttachments.length === 0) return;
    if (isUploading) return;

    onSendMessage(inputText.trim(), pendingAttachments);
    setInputText('');
    setPendingAttachments([]);
    setShowEmojiPicker(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const addEmoji = (emoji) => {
    setInputText((prev) => prev + emoji);
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="flex-1 flex flex-col bg-discord-dark h-full relative min-w-0"
    >
      {/* DRAG & DROP OVERLAY (ÁTHÚZÁSRA MEGJELENŐ DISCORD FELÜLET) */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-[#111214]/90 backdrop-blur-sm border-4 border-dashed border-discord-primary rounded-xl m-2 flex flex-col items-center justify-center pointer-events-none animate-in fade-in duration-150">
          <div className="w-20 h-20 rounded-full bg-discord-primary/20 flex items-center justify-center text-discord-primary mb-4 animate-bounce">
            <UploadCloud className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-extrabold text-white tracking-wide">
            Húzd ide a fájlokat a feltöltéshez!
          </h2>
          <p className="text-discord-textMuted text-xs mt-1">
            Képek, videók, archívumok vagy dokumentumok (max 100 MB)
          </p>
        </div>
      )}

      {/* KÉP NAGYÍTÓ LIGHTBOX MODAL */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-150"
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxImage.url}
              alt={lightboxImage.originalName}
              className="max-w-full max-h-[82vh] object-contain rounded-lg shadow-2xl border border-white/10"
            />
            <div className="mt-3 flex items-center justify-between w-full text-white text-xs px-2">
              <span className="truncate font-semibold">{lightboxImage.originalName}</span>
              <a
                href={lightboxImage.downloadUrl || lightboxImage.url}
                download={lightboxImage.originalName}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-discord-primary hover:bg-discord-primaryHover font-bold shadow transition"
              >
                <Download className="w-4 h-4" />
                <span>Letöltés</span>
              </a>
            </div>
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-discord-darkest text-white hover:bg-discord-red flex items-center justify-center transition border border-white/20 shadow-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Channel Header */}
      <div className="h-12 border-b border-discord-darkest px-4 flex items-center justify-between shadow-sm bg-discord-dark flex-shrink-0 z-10">
        <div className="flex items-center gap-2 truncate">
          <Hash className="w-6 h-6 text-discord-textMuted flex-shrink-0" />
          <span className="font-bold text-discord-textHeader truncate">{channel ? channel.name : 'Csatorna'}</span>
          {channel?.description && (
            <>
              <div className="w-[1px] h-4 bg-discord-textMuted/30 mx-2 hidden sm:block" />
              <span className="text-xs text-discord-textMuted truncate hidden sm:block">
                {channel.description}
              </span>
            </>
          )}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2.5 text-discord-textMuted flex-shrink-0">
          <button
            onClick={onOpenSpeedTest}
            title="Net Sebességteszt futtatása és eredmények"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-discord-darker hover:bg-discord-hover text-discord-primary hover:text-white text-xs font-semibold transition border border-discord-darkest"
          >
            <Activity className="w-3.5 h-3.5 animate-pulse" />
            <span className="hidden sm:inline">Net Teszt</span>
          </button>

          {!activeVoiceChannel && (
            <button
              onClick={() => onJoinVoiceChannel('hang-altalanos')}
              title="Csatlakozás a Hangcsatornához (VoIP)"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-discord-primary hover:bg-discord-primaryHover text-white text-xs font-medium transition"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Hangcsatorna</span>
            </button>
          )}

          <button
            onClick={onToggleUserList}
            title={showUserList ? 'Taglista elrejtése' : 'Taglista mutatása'}
            className={`p-1.5 rounded hover:bg-discord-hover transition ${
              showUserList ? 'text-discord-textHeader bg-discord-hover' : 'hover:text-discord-textHeader'
            }`}
          >
            <Users className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Welcome block */}
        <div className="pt-6 pb-4 border-b border-discord-darkest/60">
          <div className="w-16 h-16 rounded-full bg-discord-darker flex items-center justify-center text-discord-textHeader mb-3 shadow">
            <Hash className="w-8 h-8 text-discord-textHeader" />
          </div>
          <h1 className="text-2xl font-bold text-discord-textHeader">
            Üdv a #{channel ? channel.name : 'csatornában'}!
          </h1>
          <p className="text-discord-textMuted text-sm mt-1">
            Ez a #{channel ? channel.name : 'csatorna'} kezdete. Küldj üzenetet vagy húzz ide fájlokat a megosztáshoz!
          </p>
        </div>

        {/* Message list */}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-4 px-2 py-1.5 rounded hover:bg-discord-hover/40 group transition ${
              msg.isSystem ? 'bg-discord-primary/10 border-l-2 border-discord-primary py-2 px-3' : ''
            }`}
          >
            {/* Avatar */}
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm mt-0.5"
              style={{ backgroundColor: msg.avatarColor || '#5865F2' }}
            >
              {msg.username.charAt(0).toUpperCase()}
            </div>

            {/* Message Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span
                  className="font-semibold text-sm hover:underline cursor-pointer"
                  style={{ color: msg.avatarColor || '#fff' }}
                >
                  {msg.username}
                </span>
                {msg.isSystem && (
                  <span className="text-[10px] font-bold bg-discord-primary px-1.5 py-0.2 rounded text-white uppercase tracking-wider">
                    Rendszer
                  </span>
                )}
                <span className="text-[11px] text-discord-textMuted">{msg.timestamp}</span>
              </div>

              {/* Szöveges tartalom ha van */}
              {msg.text && (
                <p className="text-discord-textNormal text-sm mt-0.5 whitespace-pre-wrap break-words leading-relaxed select-text">
                  {msg.text}
                </p>
              )}

              {/* CSATOLT FÁJLOK MEGJELENÍTÉSE */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="mt-2 space-y-2 max-w-xl">
                  {msg.attachments.map((att) => {
                    const isImg =
                      att.mimeType?.startsWith('image/') ||
                      ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(
                        att.originalName?.split('.').pop()?.toLowerCase() || ''
                      );
                    const isVid = att.mimeType?.startsWith('video/');
                    const isAud = att.mimeType?.startsWith('audio/');

                    if (isImg) {
                      return (
                        <div key={att.id || att.filename} className="relative group/att inline-block max-w-md">
                          <img
                            src={att.url}
                            alt={att.originalName}
                            onClick={() => setLightboxImage(att)}
                            className="max-h-72 max-w-full rounded-xl object-contain bg-black/40 border border-discord-darkest cursor-zoom-in hover:brightness-105 transition shadow-lg"
                            loading="lazy"
                          />
                          <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover/att:opacity-100 transition">
                            <a
                              href={att.downloadUrl || att.url}
                              download={att.originalName}
                              title="Kép letöltése"
                              className="p-1.5 rounded-lg bg-black/75 hover:bg-discord-primary text-white text-xs font-semibold shadow-md transition flex items-center gap-1"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          </div>
                          <div className="text-[11px] text-discord-textMuted mt-1 truncate">
                            {att.originalName} ({formatFileSize(att.size)})
                          </div>
                        </div>
                      );
                    }

                    if (isVid) {
                      return (
                        <div key={att.id || att.filename} className="rounded-xl overflow-hidden bg-black/50 border border-discord-darkest max-w-md">
                          <video src={att.url} controls className="max-h-72 w-full" />
                          <div className="p-2 flex items-center justify-between text-xs text-discord-textMuted bg-discord-darker">
                            <span className="truncate">{att.originalName}</span>
                            <a
                              href={att.downloadUrl || att.url}
                              download={att.originalName}
                              className="text-discord-primary hover:underline flex items-center gap-1 font-semibold"
                            >
                              <Download className="w-3.5 h-3.5" /> Letöltés
                            </a>
                          </div>
                        </div>
                      );
                    }

                    if (isAud) {
                      return (
                        <div key={att.id || att.filename} className="p-2.5 rounded-xl bg-discord-darker border border-discord-darkest max-w-md space-y-1.5">
                          <div className="flex items-center justify-between text-xs text-discord-textHeader">
                            <span className="truncate font-semibold flex items-center gap-1.5">
                              <Volume2 className="w-4 h-4 text-emerald-400" />
                              {att.originalName}
                            </span>
                            <a
                              href={att.downloadUrl || att.url}
                              download={att.originalName}
                              className="text-discord-primary hover:underline flex items-center gap-1 font-semibold"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          </div>
                          <audio src={att.url} controls className="w-full h-8" />
                        </div>
                      );
                    }

                    // Egyéb fájl (Dokumentum, Zip, Kód stb.)
                    return (
                      <div
                        key={att.id || att.filename}
                        className="flex items-center justify-between p-3 rounded-xl bg-discord-darker hover:bg-discord-hover/60 border border-discord-darkest/80 transition group/file shadow-sm"
                      >
                        <div className="flex items-center gap-3 min-w-0 pr-2">
                          <div className="w-10 h-10 rounded-lg bg-discord-darkest flex items-center justify-center flex-shrink-0 shadow-inner">
                            {getFileIcon(att.mimeType, att.originalName)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-discord-textHeader truncate group-hover/file:text-white transition">
                              {att.originalName}
                            </div>
                            <div className="text-xs text-discord-textMuted">
                              {formatFileSize(att.size)}
                            </div>
                          </div>
                        </div>

                        <a
                          href={att.downloadUrl || att.url}
                          download={att.originalName}
                          title={`Letöltés: ${att.originalName}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-discord-darkest hover:bg-discord-primary text-discord-textHeader hover:text-white text-xs font-semibold shadow transition flex-shrink-0 border border-white/5"
                        >
                          <Download className="w-4 h-4" />
                          <span>Letöltés</span>
                        </a>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick emoji drawer */}
      {showEmojiPicker && (
        <div className="absolute bottom-16 right-6 bg-discord-darker border border-discord-darkest rounded-lg p-2 shadow-xl flex gap-1.5 z-20">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => addEmoji(emoji)}
              className="text-xl p-1.5 hover:bg-discord-hover rounded transition transform hover:scale-125"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Bottom Message Input Bar */}
      <div className="px-4 pb-4 flex-shrink-0">
        {/* KÜLDÉS ELŐTTI CSATOLMÁNYOK SÁVJA */}
        {pendingAttachments.length > 0 && (
          <div className="bg-discord-darker border border-discord-darkest rounded-t-lg px-3 py-2 flex items-center gap-2 overflow-x-auto shadow-inner">
            {pendingAttachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-2 bg-discord-dark px-2.5 py-1.5 rounded-md border border-white/10 text-xs text-discord-textHeader flex-shrink-0 relative group"
              >
                {getFileIcon(att.mimeType, att.originalName)}
                <span className="max-w-[140px] truncate font-medium">{att.originalName}</span>
                <span className="text-[10px] text-discord-textMuted font-mono">({formatFileSize(att.size)})</span>
                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(att.id)}
                  title="Csatolmány törlése"
                  className="w-4 h-4 rounded-full bg-discord-darkest hover:bg-discord-red text-discord-textMuted hover:text-white flex items-center justify-center transition"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Feltöltési állapot jelző */}
        {isUploading && (
          <div className="bg-discord-primary/20 text-discord-primary border-t border-x border-discord-primary/40 rounded-t-lg px-3 py-1.5 text-xs flex items-center gap-2 animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Fájl(ok) feltöltése folyamatban a szerverre...</span>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className={`bg-discord-darker ${
            pendingAttachments.length > 0 || isUploading ? 'rounded-b-lg' : 'rounded-lg'
          } px-3 py-2 flex items-center gap-2.5 shadow-inner border border-transparent focus-within:border-discord-primary/40 transition`}
        >
          {/* Rejtett fájlválasztó input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={(e) => uploadFiles(e.target.files)}
            className="hidden"
          />

          {/* Fájlfeltöltő gomb (+) */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Fájl csatolása (vagy húzd ide a fájlokat az ablakba)"
            className="w-8 h-8 rounded-full bg-discord-dark hover:bg-discord-primary text-discord-textMuted hover:text-white flex items-center justify-center transition flex-shrink-0"
          >
            <Plus className="w-5 h-5" />
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              pendingAttachments.length > 0
                ? 'Írj megjegyzést a csatolt fájlhoz (vagy Enter a küldéshez)...'
                : `Üzenet ide: #${channel ? channel.name : 'csatorna'} (Húzz ide fájlt is)...`
            }
            className="flex-1 bg-transparent text-discord-textHeader placeholder-discord-textMuted/60 outline-none text-sm min-w-0"
          />

          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            title="Emoji hozzáadása"
            className="text-discord-textMuted hover:text-discord-yellow transition p-1"
          >
            <Smile className="w-5 h-5" />
          </button>

          <button
            type="submit"
            disabled={(!inputText.trim() && pendingAttachments.length === 0) || isUploading}
            title="Üzenet küldése (Enter)"
            className="w-8 h-8 rounded-full bg-discord-primary disabled:opacity-40 disabled:hover:bg-discord-primary hover:bg-discord-primaryHover text-white flex items-center justify-center transition shadow flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
