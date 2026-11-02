import React from 'react';
import {
  Hash,
  Volume2,
  Mic,
  MicOff,
  Headphones,
  LogOut,
  ChevronDown,
  Settings,
  Radio
} from 'lucide-react';
import VoiceConnectedBar from './VoiceConnectedBar';

export default function ChannelSidebar({
  user,
  textChannels,
  voiceChannels,
  activeTextChannel,
  onSelectTextChannel,
  activeVoiceChannel,
  onJoinVoiceChannel,
  onLeaveVoiceChannel,
  voiceStates,
  isMuted,
  isDeafened,
  onToggleMute,
  onToggleDeafen,
  isScreenSharing,
  onToggleScreenShare,
  onOpenVoiceView,
  casinoSessions = {},
  watchSessions = {},
  onLogout
}) {
  const currentVoiceObj = voiceChannels.find(vc => vc.id === activeVoiceChannel);

  return (
    <div className="w-60 bg-discord-darker flex flex-col h-full select-none flex-shrink-0 border-r border-discord-darkest/50">
      {/* Server Header */}
      <div className="h-12 border-b border-discord-darkest px-4 flex items-center justify-between font-bold text-discord-textHeader shadow-sm hover:bg-discord-hover/50 cursor-pointer transition">
        <div className="flex items-center gap-2 truncate">
          <div className="w-2.5 h-2.5 rounded-full bg-discord-green flex-shrink-0 animate-pulse" />
          <span className="truncate">Közösségi VoIP Szerver</span>
        </div>
        <ChevronDown className="w-4 h-4 text-discord-textMuted flex-shrink-0" />
      </div>

      {/* Channels List */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {/* Szöveges csatornák */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-discord-textMuted">
              Szöveges Csatornák
            </span>
          </div>
          <div className="space-y-0.5">
            {textChannels.map((ch) => {
              const isActive = activeTextChannel === ch.id;
              return (
                <button
                  key={ch.id}
                  onClick={() => onSelectTextChannel(ch.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition group ${
                    isActive
                      ? 'bg-discord-active text-white font-medium'
                      : 'text-discord-channel hover:bg-discord-hover hover:text-discord-channelHover'
                  }`}
                >
                  <Hash className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-discord-textMuted group-hover:text-discord-channelHover'}`} />
                  <span className="truncate">{ch.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Hangcsatornák (VoIP) */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-discord-textMuted flex items-center gap-1">
              <Radio className="w-3 h-3 text-discord-green" />
              Hangcsatornák (VoIP)
            </span>
          </div>
          <div className="space-y-1">
            {voiceChannels.map((vc) => {
              const isConnectedHere = activeVoiceChannel === vc.id;
              const participants = voiceStates[vc.id] || [];

              return (
                <div key={vc.id} className="space-y-0.5">
                  <button
                    onClick={() => {
                      if (isConnectedHere) {
                        onOpenVoiceView();
                      } else {
                        onJoinVoiceChannel(vc.id);
                      }
                    }}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition group ${
                      isConnectedHere
                        ? 'bg-discord-active text-discord-green font-medium'
                        : 'text-discord-channel hover:bg-discord-hover hover:text-discord-channelHover'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Volume2 className={`w-4 h-4 flex-shrink-0 ${isConnectedHere ? 'text-discord-green' : 'text-discord-textMuted group-hover:text-discord-channelHover'}`} />
                      <span className="truncate">{vc.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {watchSessions && watchSessions[vc.id]?.active && (
                        <span
                          className="text-[10px] bg-red-500/20 text-red-300 border border-red-500/40 px-1.5 py-0.2 rounded-full font-bold flex items-center gap-1 animate-pulse"
                          title={`Közös YouTube folyamatban (${watchSessions[vc.id].title || 'YouTube'})`}
                        >
                          <span>🔴</span>
                        </span>
                      )}
                      {casinoSessions && casinoSessions[vc.id]?.active && (
                        <span
                          className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.2 rounded-full font-bold flex items-center gap-1 animate-pulse"
                          title={`3D Kaszinó folyamatban (${casinoSessions[vc.id].startedBy})`}
                        >
                          <span>🎰</span>
                        </span>
                      )}
                      {participants.length > 0 && (
                        <span className="text-xs bg-discord-darkest px-1.5 py-0.5 rounded-full text-discord-textMuted">
                          {participants.length}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Connected users under voice channel */}
                  {participants.length > 0 && (
                    <div className="pl-6 pr-2 py-0.5 space-y-1">
                      {participants.map((p) => {
                        const isSelf = p.id === user.id;
                        return (
                          <div
                            key={p.id}
                            className={`flex items-center justify-between py-1 px-1.5 rounded text-xs transition ${
                              p.isSpeaking
                                ? 'bg-discord-green/10 text-white'
                                : 'text-discord-textNormal hover:bg-discord-hover/50'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              {/* Avatar with speaking ring */}
                              <div
                                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white font-bold flex-shrink-0 border transition-all ${
                                  p.isSpeaking ? 'speaking-ring border-discord-green' : 'border-transparent'
                                }`}
                                style={{ backgroundColor: p.avatarColor }}
                              >
                                {p.username.charAt(0).toUpperCase()}
                              </div>
                              <span className="truncate font-medium">
                                {p.username} {isSelf && <span className="text-[10px] text-discord-textMuted">(Te)</span>}
                              </span>
                            </div>

                            {/* Voice Status Badges */}
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {p.isScreenSharing && (
                                <span className="bg-discord-red text-white text-[9px] font-bold px-1 py-0.5 rounded leading-none flex items-center gap-0.5">
                                  <Radio className="w-2.5 h-2.5 animate-pulse" />
                                  ÉLŐ
                                </span>
                              )}
                              {p.isMuted && <MicOff className="w-3.5 h-3.5 text-discord-red" title="Mikrofon némítva" />}
                              {p.isDeafened && <Headphones className="w-3.5 h-3.5 text-discord-red" title="Süketítve" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Voice Connection Bar (if connected) */}
      {activeVoiceChannel && (
        <VoiceConnectedBar
          channelName={currentVoiceObj ? currentVoiceObj.name : 'Hang'}
          onDisconnect={onLeaveVoiceChannel}
          onOpenVoiceView={onOpenVoiceView}
          isScreenSharing={isScreenSharing}
          onToggleScreenShare={onToggleScreenShare}
        />
      )}

      {/* Bottom User Bar */}
      <div className="h-[52px] bg-discord-darkest px-2 flex items-center justify-between border-t border-discord-dark/40">
        <div className="flex items-center gap-2 truncate mr-1">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 relative"
            style={{ backgroundColor: user.avatarColor }}
          >
            {user.username.charAt(0).toUpperCase()}
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-discord-green border-2 border-discord-darkest" />
          </div>
          <div className="truncate">
            <div className="text-sm font-semibold text-discord-textHeader truncate leading-tight">
              {user.username}
            </div>
            <div className="text-[11px] text-discord-textMuted leading-tight">
              Online
            </div>
          </div>
        </div>

        {/* User Controls: Mic, Headphones, Logout */}
        <div className="flex items-center gap-0.5 text-discord-textMuted">
          <button
            onClick={onToggleMute}
            title={isMuted ? 'Mikrofon bekapcsolása' : 'Mikrofon némítása'}
            className={`w-7 h-7 rounded flex items-center justify-center hover:bg-discord-hover transition ${
              isMuted ? 'text-discord-red hover:text-discord-red' : 'hover:text-discord-textHeader'
            }`}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <button
            onClick={onToggleDeafen}
            title={isDeafened ? 'Süketítés feloldása' : 'Süketítés (hangok némítása)'}
            className={`w-7 h-7 rounded flex items-center justify-center hover:bg-discord-hover transition ${
              isDeafened ? 'text-discord-red hover:text-discord-red' : 'hover:text-discord-textHeader'
            }`}
          >
            <Headphones className="w-4 h-4" />
          </button>

          <button
            onClick={onLogout}
            title="Kijelentkezés"
            className="w-7 h-7 rounded flex items-center justify-center hover:bg-discord-hover hover:text-discord-red transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
