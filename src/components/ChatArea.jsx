import React, { useState, useRef, useEffect } from 'react';
import {
  Hash,
  Send,
  Smile,
  Users,
  Volume2,
  Sparkles,
  PhoneCall,
  Activity
} from 'lucide-react';

const QUICK_EMOJIS = ['👋', '🔥', '😂', '🎉', '❤️', '🎮', '👍'];

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
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText('');
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
    <div className="flex-1 flex flex-col bg-discord-dark h-full relative min-w-0">
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
            Ez a #{channel ? channel.name : 'csatorna'} kezdete. Küldj egy üzenetet a beszélgetés indításához!
          </p>
        </div>

        {/* Message list */}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-4 px-2 py-1 rounded hover:bg-discord-hover/40 group transition ${
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
              <p className="text-discord-textNormal text-sm mt-0.5 whitespace-pre-wrap break-words leading-relaxed select-text">
                {msg.text}
              </p>
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
        <form
          onSubmit={handleSubmit}
          className="bg-discord-darker rounded-lg px-4 py-2.5 flex items-center gap-3 shadow-inner border border-transparent focus-within:border-discord-primary/40 transition"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Üzenet ide: #${channel ? channel.name : 'csatorna'}...`}
            className="flex-1 bg-transparent text-discord-textHeader placeholder-discord-textMuted/60 outline-none text-sm"
          />

          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            title="Emoji hozzáadása"
            className="text-discord-textMuted hover:text-discord-yellow transition"
          >
            <Smile className="w-5 h-5" />
          </button>

          <button
            type="submit"
            disabled={!inputText.trim()}
            title="Üzenet küldése (Enter)"
            className="w-8 h-8 rounded-full bg-discord-primary disabled:opacity-40 disabled:hover:bg-discord-primary hover:bg-discord-primaryHover text-white flex items-center justify-center transition shadow"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
