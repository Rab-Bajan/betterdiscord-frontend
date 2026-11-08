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
  Check,
  Menu,
  Flag,
  ShieldOff
} from 'lucide-react';
import { History, SlidersHorizontal } from 'lucide-react';
import DMCallButton from './call/DMCallButton';
import CallEventMessage from './call/CallEventMessage';

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
    return <ImageIcon className="w-5 h-5 text-indigo-400" />;
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
}) {
  const [inputText, setInputText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);

  const messagesEndRef = useRef(null);

  const handleReport = async (msg) => {
    const reason = window.prompt('Miért jelented ezt az üzenetet? (Az adminok csak ennek az üzenetnek a környezetét látják.)');
    if (reason === null) return;
    const res = await onReportMessage(msg.id, reason);
    alert(res.ok ? 'Köszönjük, a jelentést elküldtük az adminoknak.' : res.error);
  };
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
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-150"
          style={{ background: 'rgba(9, 10, 24, 0.92)', backdropFilter: 'blur(16px)' }}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxImage.url}
              alt={lightboxImage.originalName}
              className="max-w-full max-h-[82vh] object-contain rounded-2xl shadow-2xl"
              style={{ border: '1px solid rgba(125, 105, 255, 0.25)' }}
            />
            <div className="mt-3 flex items-center justify-between w-full text-white text-xs px-2">
              <span className="truncate font-semibold">{lightboxImage.originalName}</span>
              <a
                href={lightboxImage.downloadUrl || lightboxImage.url}
                download={lightboxImage.originalName}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold shadow transition"
                style={{ background: 'linear-gradient(135deg, #7655F5, #536CFF)' }}
              >
                <Download className="w-4 h-4" />
                <span>Letöltés</span>
              </a>
            </div>
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full flex items-center justify-center transition shadow-lg text-white"
              style={{ background: '#101329', border: '1px solid rgba(125, 105, 255, 0.3)' }}
              onMouseOver={e => e.currentTarget.style.background = '#E94B64'}
              onMouseOut={e => e.currentTarget.style.background = '#101329'}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Channel Header */}
      <div className="h-14 px-3 sm:px-5 flex items-center justify-between flex-shrink-0 z-10" style={{ background: '#101329', borderBottom: '1px solid rgba(125, 105, 255, 0.12)' }}>
        <div className="flex items-center gap-2 sm:gap-2.5 truncate">
          {onOpenMobileSidebar && (
            <button
              type="button"
              onClick={onOpenMobileSidebar}
              title="Csatornák megnyitása"
              className="p-2 rounded-xl md:hidden transition flex-shrink-0"
              style={{ background: '#1B2040', color: '#7655F5', border: '1px solid rgba(125, 105, 255, 0.2)' }}
            >
              <Menu className="w-4 h-4" />
            </button>
          )}

          {isDm && dmPartner ? (
            <div className="flex items-center gap-2.5 truncate">
              <div className="relative flex-shrink-0">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs text-white font-bold overflow-hidden shadow"
                  style={{ backgroundColor: dmPartner.avatarColor || '#7655F5' }}
                >
                  {dmPartner.avatarUrl ? (
                    <img src={dmPartner.avatarUrl} alt={dmPartner.username} className="w-full h-full object-cover" />
                  ) : (
                    dmPartner.username.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#101329] bg-[#28C997]" />
              </div>
              <span className="font-bold truncate text-sm sm:text-base" style={{ color: '#F4F3FF' }}>
                @{dmPartner.username}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#7655F5]/20 text-[#7655F5] border border-[#7655F5]/30 hidden sm:inline">
                Privát Üzenet
              </span>
            </div>
          ) : (
            <>
              <Hash className="w-5 h-5 flex-shrink-0" style={{ color: '#7655F5' }} />
              <span className="font-bold truncate text-sm sm:text-base" style={{ color: '#F4F3FF' }}>{channel ? channel.name : 'Csatorna'}</span>
              {channel?.description && (
                <>
                  <div className="w-[1px] h-4 mx-2 hidden sm:block" style={{ background: 'rgba(125, 105, 255, 0.2)' }} />
                  <span className="text-xs truncate hidden sm:block" style={{ color: '#999BBE' }}>
                    {channel.description}
                  </span>
                </>
              )}
            </>
          )}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          {isDm && dmPartner && onStartCall && (
            <div className="flex items-center gap-1.5">
              <DMCallButton
                partner={dmPartner}
                onCall={onStartCall}
                disabled={callBusy}
                disabledReason="Már van egy aktív hívásod"
              />
              <button
                type="button"
                onClick={onOpenCallHistory}
                title="Híváselőzmények"
                aria-label="Híváselőzmények"
                className="p-2 rounded-xl transition hidden sm:block"
                style={{ background: 'transparent', color: '#999BBE' }}
                onMouseOver={e => e.currentTarget.style.color = '#F4F3FF'}
                onMouseOut={e => e.currentTarget.style.color = '#999BBE'}
              >
                <History className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
              </button>
              <button
                type="button"
                onClick={onOpenCallSettings}
                title="Hívásbeállítások (hang, csengőhang, eszközök)"
                aria-label="Hívásbeállítások"
                className="p-2 rounded-xl transition hidden sm:block"
                style={{ background: 'transparent', color: '#999BBE' }}
                onMouseOver={e => e.currentTarget.style.color = '#F4F3FF'}
                onMouseOut={e => e.currentTarget.style.color = '#999BBE'}
              >
                <SlidersHorizontal style={{ width: 18, height: 18 }} />
              </button>
            </div>
          )}
          <button
            onClick={onOpenSpeedTest}
            title="Net Sebességteszt futtatása és eredmények"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition"
            style={{ background: 'rgba(118, 85, 245, 0.15)', color: '#7655F5', border: '1px solid rgba(118, 85, 245, 0.25)' }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(118, 85, 245, 0.25)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(118, 85, 245, 0.15)'}
          >
            <Activity className="w-3.5 h-3.5 animate-pulse" />
            <span className="hidden sm:inline">Net Teszt</span>
          </button>

          {!activeVoiceChannel && (
            <button
              onClick={() => onJoinVoiceChannel('hang-altalanos')}
              title="Csatlakozás a Hangcsatornához (VoIP)"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-medium transition shadow-md"
              style={{ background: 'linear-gradient(135deg, #7655F5, #536CFF)' }}
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Hangcsatorna</span>
            </button>
          )}

          <button
            onClick={onToggleUserList}
            title={showUserList ? 'Résztvevők elrejtése' : 'Résztvevők mutatása'}
            className="p-2 rounded-xl transition"
            style={{
              background: showUserList ? 'rgba(118, 85, 245, 0.2)' : 'transparent',
              color: showUserList ? '#7655F5' : '#999BBE',
            }}
            onMouseOver={e => { if (!showUserList) e.currentTarget.style.color = '#F4F3FF'; }}
            onMouseOut={e => { if (!showUserList) e.currentTarget.style.color = '#999BBE'; }}
          >
            <Users className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Welcome block */}
        <div className="pt-6 pb-4" style={{ borderBottom: '1px solid rgba(125, 105, 255, 0.12)' }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 shadow-lg" style={{ background: 'rgba(118, 85, 245, 0.15)', border: '1px solid rgba(118, 85, 245, 0.3)', color: '#7655F5' }}>
            {isDm ? <span className="text-2xl">💬</span> : <Hash className="w-7 h-7" />}
          </div>
          <h1 className="text-2xl font-bold" style={{ color: '#F4F3FF' }}>
            {isDm ? `Beszélgetés vele: @${dmPartner?.username || 'Partner'}` : `Üdv a #${channel ? channel.name : 'csatornában'}!`}
          </h1>
          <p className="text-sm mt-1" style={{ color: '#999BBE' }}>
            {isDm 
              ? `Ez a közvetlen, privát beszélgetésed vele: @${dmPartner?.username}. Az itt küldött üzeneteket és csatolmányokat csak ti ketten látjátok.`
              : `Ez a #${channel ? channel.name : 'csatorna'} kezdete. Küldj üzenetet vagy húzz ide fájlokat a megosztáshoz!`}
          </p>
        </div>

        {/* Message list */}
        {messages.map((msg) => {
          const authorName = msg.username || msg.senderUsername || (msg.isSystem ? 'Rendszer' : 'Felhasználó');
          const authorAvatarColor = msg.avatarColor || msg.senderAvatarColor || '#7655F5';
          const authorAvatarUrl = msg.avatarUrl || msg.senderAvatarUrl || null;

          // Hívás-esemény: rendszerüzenet a beszélgetésben, "Hívás újra" gombbal
          if (msg.callEvent) {
            return (
              <CallEventMessage
                key={msg.id}
                msg={msg}
                myUsername={currentUsername}
                partner={dmPartner}
                onCallAgain={onStartCall}
                callDisabled={callBusy}
              />
            );
          }

          return (
            <div
              key={msg.id}
              className="flex items-start gap-4 px-3 py-2 rounded-xl group transition-all"
              style={{
                background: msg.isSystem ? 'rgba(118, 85, 245, 0.08)' : 'transparent',
                borderLeft: msg.isSystem ? '3px solid #7655F5' : '3px solid transparent',
              }}
              onMouseOver={e => { if (!msg.isSystem) e.currentTarget.style.background = 'rgba(125, 105, 255, 0.04)'; }}
              onMouseOut={e => { if (!msg.isSystem) e.currentTarget.style.background = 'transparent'; }}
            >
              {/* Avatar */}
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-md mt-0.5 overflow-hidden"
                style={{ backgroundColor: authorAvatarColor }}
              >
                {authorAvatarUrl ? (
                  <img src={authorAvatarUrl} alt={authorName} className="w-full h-full object-cover" />
                ) : (
                  (authorName.charAt(0) || '?').toUpperCase()
                )}
              </div>

              {/* Message Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span
                    className="font-semibold text-sm hover:underline cursor-pointer"
                    style={{ color: authorAvatarColor }}
                  >
                    {authorName}
                  </span>
                  {msg.isSystem && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white uppercase tracking-wider" style={{ background: '#7655F5' }}>
                      Rendszer
                    </span>
                  )}
                  <span className="text-[11px]" style={{ color: '#999BBE' }}>{msg.timestamp}</span>
                  {isDm && onReportMessage && !msg.removedByAdmin && !msg.isSystem &&
                    authorName.toLowerCase() !== (currentUsername || '').toLowerCase() && (
                      <button
                        type="button"
                        onClick={() => handleReport(msg)}
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
                  <p className="text-sm mt-0.5 whitespace-pre-wrap break-words leading-relaxed select-text" style={{ color: '#F4F3FF' }}>
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
                            className="max-h-72 max-w-full rounded-2xl object-contain cursor-zoom-in hover:brightness-105 transition shadow-xl"
                            style={{ background: '#101329', border: '1px solid rgba(125, 105, 255, 0.2)' }}
                            loading="lazy"
                          />
                          <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover/att:opacity-100 transition">
                            <a
                              href={att.downloadUrl || att.url}
                              download={att.originalName}
                              title="Kép letöltése"
                              className="p-1.5 rounded-xl text-white text-xs font-semibold shadow-md transition flex items-center gap-1"
                              style={{ background: 'rgba(9, 10, 24, 0.85)', border: '1px solid rgba(125, 105, 255, 0.2)' }}
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          </div>
                          <div className="text-[11px] mt-1 truncate" style={{ color: '#999BBE' }}>
                            {att.originalName} ({formatFileSize(att.size)})
                          </div>
                        </div>
                      );
                    }

                    if (isVid) {
                      return (
                        <div key={att.id || att.filename} className="rounded-2xl overflow-hidden max-w-md shadow-xl" style={{ background: '#101329', border: '1px solid rgba(125, 105, 255, 0.2)' }}>
                          <video src={att.url} controls className="max-h-72 w-full" />
                          <div className="p-2.5 flex items-center justify-between text-xs" style={{ background: '#151832', color: '#999BBE' }}>
                            <span className="truncate">{att.originalName}</span>
                            <a
                              href={att.downloadUrl || att.url}
                              download={att.originalName}
                              className="hover:underline flex items-center gap-1 font-semibold"
                              style={{ color: '#7655F5' }}
                            >
                              <Download className="w-3.5 h-3.5" /> Letöltés
                            </a>
                          </div>
                        </div>
                      );
                    }

                    if (isAud) {
                      return (
                        <div key={att.id || att.filename} className="p-3 rounded-2xl max-w-md space-y-2 shadow-xl" style={{ background: '#151832', border: '1px solid rgba(125, 105, 255, 0.2)' }}>
                          <div className="flex items-center justify-between text-xs" style={{ color: '#F4F3FF' }}>
                            <span className="truncate font-semibold flex items-center gap-1.5">
                              <Volume2 className="w-4 h-4 text-emerald-400" />
                              {att.originalName}
                            </span>
                            <a
                              href={att.downloadUrl || att.url}
                              download={att.originalName}
                              className="hover:underline flex items-center gap-1 font-semibold"
                              style={{ color: '#7655F5' }}
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
                        className="flex items-center justify-between p-3 rounded-2xl transition group/file shadow-md"
                        style={{ background: '#151832', border: '1px solid rgba(125, 105, 255, 0.15)' }}
                      >
                        <div className="flex items-center gap-3 min-w-0 pr-2">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#1B2040' }}>
                            {getFileIcon(att.mimeType, att.originalName)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate transition" style={{ color: '#F4F3FF' }}>
                              {att.originalName}
                            </div>
                            <div className="text-xs" style={{ color: '#999BBE' }}>
                              {formatFileSize(att.size)}
                            </div>
                          </div>
                        </div>

                        <a
                          href={att.downloadUrl || att.url}
                          download={att.originalName}
                          title={`Letöltés: ${att.originalName}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shadow transition flex-shrink-0 text-white"
                          style={{ background: '#1B2040', border: '1px solid rgba(125, 105, 255, 0.2)' }}
                          onMouseOver={e => e.currentTarget.style.background = '#7655F5'}
                          onMouseOut={e => e.currentTarget.style.background = '#1B2040'}
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
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick emoji drawer */}
      {showEmojiPicker && (
        <div className="absolute bottom-20 right-6 rounded-2xl p-2 shadow-2xl flex gap-1.5 z-20" style={{ background: '#151832', border: '1px solid rgba(125, 105, 255, 0.25)' }}>
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => addEmoji(emoji)}
              className="text-xl p-2 rounded-xl transition transform hover:scale-125"
              onMouseOver={e => e.currentTarget.style.background = 'rgba(125, 105, 255, 0.15)'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Bottom Message Input Bar */}
      <div className="px-3 pb-3 sm:px-5 sm:pb-5 flex-shrink-0">
        {/* KÜLDÉS ELŐTTI CSATOLMÁNYOK SÁVJA */}
        {pendingAttachments.length > 0 && (
          <div className="rounded-t-2xl px-4 py-2 flex items-center gap-2 overflow-x-auto" style={{ background: '#151832', borderTop: '1px solid rgba(125, 105, 255, 0.2)', borderLeft: '1px solid rgba(125, 105, 255, 0.2)', borderRight: '1px solid rgba(125, 105, 255, 0.2)' }}>
            {pendingAttachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs flex-shrink-0 relative group"
                style={{ background: '#1B2040', color: '#F4F3FF', border: '1px solid rgba(125, 105, 255, 0.2)' }}
              >
                {getFileIcon(att.mimeType, att.originalName)}
                <span className="max-w-[140px] truncate font-medium">{att.originalName}</span>
                <span className="text-[10px] font-mono" style={{ color: '#999BBE' }}>({formatFileSize(att.size)})</span>
                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(att.id)}
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
        {isUploading && (
          <div className="rounded-t-2xl px-4 py-2 text-xs flex items-center gap-2 animate-pulse" style={{ background: 'rgba(118, 85, 245, 0.15)', color: '#7655F5', border: '1px solid rgba(118, 85, 245, 0.3)' }}>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Fájl(ok) feltöltése folyamatban a szerverre...</span>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className={`px-4 py-3 flex items-center gap-3 shadow-lg transition-all ${
            pendingAttachments.length > 0 || isUploading ? 'rounded-b-2xl' : 'rounded-2xl'
          }`}
          style={{
            background: '#151832',
            border: '1px solid rgba(125, 105, 255, 0.2)',
          }}
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
            className="w-9 h-9 rounded-xl flex items-center justify-center transition flex-shrink-0"
            style={{ background: '#1B2040', color: '#999BBE', border: '1px solid rgba(125, 105, 255, 0.15)' }}
            onMouseOver={e => { e.currentTarget.style.background = '#7655F5'; e.currentTarget.style.color = '#fff'; }}
            onMouseOut={e => { e.currentTarget.style.background = '#1B2040'; e.currentTarget.style.color = '#999BBE'; }}
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
                : isDm && dmPartner
                ? `Privát üzenet neki: @${dmPartner.username} (Húzz ide fájlt is)...`
                : `Üzenet ide: #${channel ? channel.name : 'csatorna'} (Húzz ide fájlt is)...`
            }
            className="flex-1 bg-transparent outline-none text-sm min-w-0"
            style={{ color: '#F4F3FF' }}
          />

          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            title="Emoji hozzáadása"
            className="transition p-1.5 rounded-lg"
            style={{ color: '#999BBE' }}
            onMouseOver={e => e.currentTarget.style.color = '#f5b041'}
            onMouseOut={e => e.currentTarget.style.color = '#999BBE'}
          >
            <Smile className="w-5 h-5" />
          </button>

          <button
            type="submit"
            disabled={(!inputText.trim() && pendingAttachments.length === 0) || isUploading}
            title="Üzenet küldése (Enter)"
            className="w-9 h-9 rounded-xl text-white flex items-center justify-center transition shadow-lg flex-shrink-0 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #7655F5, #536CFF)', boxShadow: '0 2px 12px rgba(118, 85, 245, 0.3)' }}
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
