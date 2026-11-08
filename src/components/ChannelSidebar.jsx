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
  Radio,
  MessageSquare,
  BarChart3,
  X
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
  isAnalysisActive = false,
  onOpenAnalysis,
  casinoSessions = {},
  watchSessions = {},
  chessSessions = {},
  browserSessions = {},
  dmPartners = [],
  activeDmPartnerId = null,
  onSelectDmPartner,
  onOpenProfile,
  onLogout,
  onCloseMobile
}) {
  const currentVoiceObj = voiceChannels.find(vc => vc.id === activeVoiceChannel);

  return (
    <div className="w-64 md:w-60 flex flex-col h-full select-none flex-shrink-0" style={{ background: '#101329', borderRight: '1px solid rgba(125, 105, 255, 0.12)' }}>
      {/* SharkVoic Logo Header */}
      <div className="h-14 px-4 flex items-center justify-between font-bold cursor-pointer transition" style={{ borderBottom: '1px solid rgba(125, 105, 255, 0.12)' }}>
        <div className="flex items-center gap-2.5 truncate">
          {/* Shark fin SVG */}
          <svg width="26" height="26" viewBox="0 0 40 40" fill="none" className="flex-shrink-0">
            <path d="M5 32 L18 8 L22 20 L30 14 L35 32 Z" fill="#7655F5" opacity="0.9"/>
            <path d="M18 8 L22 20 L30 14" fill="none" stroke="#536CFF" strokeWidth="1.5"/>
            <ellipse cx="20" cy="30" rx="15" ry="3" fill="#536CFF" opacity="0.3"/>
          </svg>
          <span className="font-black tracking-tight text-base" style={{ color: '#F4F3FF' }}>SharkVoic</span>
        </div>
        <div className="flex items-center gap-1">
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              title="Menü bezárása"
              className="p-1.5 rounded-lg md:hidden text-shark-muted hover:text-white transition"
              style={{ color: '#999BBE' }}
            >
              <X className="w-5 h-5" />
            </button>
          )}
          <ChevronDown className="w-4 h-4 hidden md:block flex-shrink-0" style={{ color: '#999BBE' }} />
        </div>
      </div>

      {/* Channels List */}
      <div className="flex-1 overflow-y-auto px-2 py-4 space-y-5">
        {/* Eszközök */}
        {onOpenAnalysis && (
          <div>
            <div className="px-2 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: '#999BBE' }}>Eszközök</span>
            </div>
            <button
              onClick={onOpenAnalysis}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all"
              style={{
                background: isAnalysisActive ? 'rgba(118, 85, 245, 0.2)' : 'transparent',
                color: isAnalysisActive ? '#F4F3FF' : '#999BBE',
                borderLeft: isAnalysisActive ? '2px solid #7655F5' : '2px solid transparent'
              }}
              onMouseOver={e => { if (!isAnalysisActive) { e.currentTarget.style.background = 'rgba(125, 105, 255, 0.08)'; e.currentTarget.style.color = '#F4F3FF'; } }}
              onMouseOut={e => { if (!isAnalysisActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#999BBE'; } }}
            >
              <BarChart3 className="w-4 h-4 flex-shrink-0" style={{ color: isAnalysisActive ? '#7655F5' : '#999BBE' }} />
              <span className="truncate font-medium">Játszma elemzés</span>
              <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(125, 105, 255, 0.2)', color: '#999BBE' }}>♟</span>
            </button>
          </div>
        )}

        {/* Szöveges csatornák */}
        <div>
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: '#999BBE' }}>
              Szobák
            </span>
          </div>
          <div className="space-y-0.5">
            {textChannels.map((ch) => {
              const isActive = activeTextChannel === ch.id;
              return (
                <button
                  key={ch.id}
                  onClick={() => onSelectTextChannel(ch.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all group"
                  style={{
                    background: isActive ? 'rgba(118, 85, 245, 0.2)' : 'transparent',
                    color: isActive ? '#F4F3FF' : '#999BBE',
                    borderLeft: isActive ? '2px solid #7655F5' : '2px solid transparent',
                  }}
                  onMouseOver={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(125, 105, 255, 0.08)'; e.currentTarget.style.color = '#F4F3FF'; } }}
                  onMouseOut={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#999BBE'; } }}
                >
                  <Hash className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? '#7655F5' : '#999BBE' }} />
                  <span className="truncate font-medium">{ch.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Hangcsatornák (VoIP) */}
        <div>
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: '#999BBE' }}>
              <Radio className="w-3 h-3" style={{ color: '#28C997' }} />
              Hangcsatornák
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
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-all group"
                    style={{
                      background: isConnectedHere ? 'rgba(40, 201, 151, 0.12)' : 'transparent',
                      color: isConnectedHere ? '#28C997' : '#999BBE',
                    }}
                    onMouseOver={e => { if (!isConnectedHere) { e.currentTarget.style.background = 'rgba(125, 105, 255, 0.08)'; e.currentTarget.style.color = '#F4F3FF'; } }}
                    onMouseOut={e => { if (!isConnectedHere) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#999BBE'; } }}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Volume2 className="w-4 h-4 flex-shrink-0" style={{ color: isConnectedHere ? '#28C997' : '#999BBE' }} />
                      <span className="truncate font-medium">{vc.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">

                      {browserSessions && browserSessions[vc.id]?.active && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1 animate-pulse"
                          style={{ background: 'rgba(83, 108, 255, 0.2)', color: '#536CFF', border: '1px solid rgba(83, 108, 255, 0.4)' }}
                          title={`Közös Böngésző folyamatban (${browserSessions[vc.id].title || 'Böngésző'})`}
                        >
                          <span>🌐</span>
                        </span>
                      )}
                      {watchSessions && watchSessions[vc.id]?.active && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1 animate-pulse"
                          style={{ background: 'rgba(233, 75, 100, 0.2)', color: '#E94B64', border: '1px solid rgba(233, 75, 100, 0.4)' }}
                          title={`Közös YouTube folyamatban (${watchSessions[vc.id].title || 'YouTube'})`}
                        >
                          <span>🔴</span>
                        </span>
                      )}
                      {casinoSessions && casinoSessions[vc.id]?.active && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1 animate-pulse"
                          style={{ background: 'rgba(245, 176, 65, 0.2)', color: '#f5b041', border: '1px solid rgba(245, 176, 65, 0.4)' }}
                          title={`3D Kaszinó folyamatban (${casinoSessions[vc.id].startedBy})`}
                        >
                          <span>🎰</span>
                        </span>
                      )}
                      {chessSessions && chessSessions[vc.id]?.active && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1 animate-pulse"
                          style={{ background: 'rgba(118, 85, 245, 0.2)', color: '#7655F5', border: '1px solid rgba(118, 85, 245, 0.4)' }}
                          title={`1v1 Sakk folyamatban (${chessSessions[vc.id].startedBy})`}
                        >
                          <span>♟️</span>
                        </span>
                      )}
                      {participants.length > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'rgba(125, 105, 255, 0.15)', color: '#999BBE' }}>
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
                            className="flex items-center justify-between py-1 px-1.5 rounded-lg text-xs transition-all"
                            style={{
                              background: p.isSpeaking ? 'rgba(40, 201, 151, 0.08)' : 'transparent',
                              color: p.isSpeaking ? '#F4F3FF' : '#999BBE',
                            }}
                          >
                            <div className="flex items-center gap-2 truncate">
                              {/* Avatar with speaking ring */}
                              <div
                                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white font-bold flex-shrink-0 border-2 transition-all ${
                                  p.isSpeaking ? 'speaking-ring' : ''
                                }`}
                                style={{ backgroundColor: p.avatarColor, borderColor: p.isSpeaking ? '#28C997' : 'transparent' }}
                              >
                                {p.username.charAt(0).toUpperCase()}
                              </div>
                              <span className="truncate font-medium">
                                {p.username} {isSelf && <span className="text-[10px]" style={{ color: '#999BBE' }}>(Te)</span>}
                              </span>
                            </div>

                            {/* Voice Status Badges */}
                            <div className="flex items-center gap-1.5 flex-shrink-0">

                              {p.isScreenSharing && (
                                <span className="text-white text-[9px] font-bold px-1 py-0.5 rounded leading-none flex items-center gap-0.5" style={{ background: '#E94B64' }}>
                                  <Radio className="w-2.5 h-2.5 animate-pulse" />
                                  ÉLŐ
                                </span>
                              )}
                              {p.isMuted && <MicOff className="w-3.5 h-3.5" style={{ color: '#E94B64' }} title="Mikrofon némítva" />}
                              {p.isDeafened && <Headphones className="w-3.5 h-3.5" style={{ color: '#E94B64' }} title="Süketítve" />}
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

          {/* Direct Messages (Privát Üzenetek) Szekció */}
          {dmPartners && dmPartners.length > 0 && (
            <div className="mt-5">
              <div className="px-2 mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider" style={{ color: '#999BBE' }}>
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-[#7655F5]" />
                  <span>Közvetlen Üzenetek</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#1B2040] text-[#999BBE]">
                  {dmPartners.length}
                </span>
              </div>

              <div className="space-y-1">
                {dmPartners.map((partner) => {
                  const isSelected = activeDmPartnerId === partner.id;
                  return (
                    <button
                      key={partner.id}
                      onClick={() => onSelectDmPartner && onSelectDmPartner(partner)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left cursor-pointer group"
                      style={{
                        background: isSelected ? 'linear-gradient(135deg, rgba(118, 85, 245, 0.25), rgba(83, 108, 255, 0.25))' : 'transparent',
                        color: isSelected ? '#F4F3FF' : '#999BBE',
                        border: isSelected ? '1px solid rgba(118, 85, 245, 0.35)' : '1px solid transparent'
                      }}
                      onMouseOver={e => { if (!isSelected) { e.currentTarget.style.background = 'rgba(125, 105, 255, 0.08)'; e.currentTarget.style.color = '#F4F3FF'; } }}
                      onMouseOut={e => { if (!isSelected) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#999BBE'; } }}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <div className="relative flex-shrink-0">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white font-bold shadow overflow-hidden"
                            style={{ backgroundColor: partner.avatarColor || '#7655F5' }}
                          >
                            {partner.avatarUrl ? (
                              <img src={partner.avatarUrl} alt={partner.username} className="w-full h-full object-cover" />
                            ) : (
                              partner.username.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#101329] bg-[#28C997]" />
                        </div>
                        <span className="truncate font-medium">{partner.username}</span>
                      </div>

                      {partner.hasUnread && (
                        <span className="w-2 h-2 rounded-full bg-[#E94B64] animate-pulse flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
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
      <div className="px-3 py-3 flex items-center justify-between" style={{ borderTop: '1px solid rgba(125, 105, 255, 0.12)', background: '#0D1024' }}>
        <div 
          onClick={onOpenProfile}
          title="Kattints a profilod szerkesztéséhez"
          className="flex items-center gap-2.5 truncate mr-1 cursor-pointer group"
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 relative overflow-hidden transition-transform group-hover:scale-105"
            style={{ backgroundColor: user.avatarColor }}
          >
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
            ) : (
              user.username.charAt(0).toUpperCase()
            )}
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2" style={{ background: '#28C997', borderColor: '#0D1024' }} />
          </div>
          <div className="truncate">
            <div className="text-sm font-semibold truncate leading-tight group-hover:text-[#7655F5] transition" style={{ color: '#F4F3FF' }}>
              {user.username}
            </div>
            <div className="text-[11px] leading-tight" style={{ color: '#28C997' }}>
              Online
            </div>
          </div>
        </div>

        {/* User Controls: Mic, Headphones, Settings, Logout */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={onToggleMute}
            title={isMuted ? 'Mikrofon bekapcsolása' : 'Mikrofon némítása'}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer"
            style={{ color: isMuted ? '#E94B64' : '#999BBE' }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(125, 105, 255, 0.15)'}
            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <button
            onClick={onToggleDeafen}
            title={isDeafened ? 'Süketítés feloldása' : 'Süketítés (hangok némítása)'}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer"
            style={{ color: isDeafened ? '#E94B64' : '#999BBE' }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(125, 105, 255, 0.15)'}
            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
          >
            <Headphones className="w-4 h-4" />
          </button>

          <button
            onClick={onOpenProfile}
            title="Profil beállítások / Szerkesztés"
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer"
            style={{ color: '#999BBE' }}
            onMouseOver={e => { e.currentTarget.style.background = 'rgba(125, 105, 255, 0.15)'; e.currentTarget.style.color = '#7655F5'; }}
            onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#999BBE'; }}
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            onClick={onLogout}
            title="Kijelentkezés"
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer"
            style={{ color: '#999BBE' }}
            onMouseOver={e => { e.currentTarget.style.background = 'rgba(125, 105, 255, 0.15)'; e.currentTarget.style.color = '#E94B64'; }}
            onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#999BBE'; }}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
