import React from 'react';
import { Volume2, MicOff, Headphones, Radio } from 'lucide-react';
import Avatar from '../../shared/ui/Avatar';
import type { PresenceUser } from '../../shared/types';
import type { VoiceChannel } from '../../features/chat/types';
import type { RoomSession } from '../../features/voice-room/types';

/** The sessions running in one voice channel. */
export interface ChannelActivitySessions {
  browser?: RoomSession | undefined;
  watch?: RoomSession | undefined;
  casino?: RoomSession | undefined;
  chess?: RoomSession | undefined;
  empire?: RoomSession | undefined;
  phobia?: RoomSession | undefined;
}

interface VoiceChannelItemProps {
  vc: VoiceChannel;
  isConnectedHere: boolean;
  participants: PresenceUser[];
  currentUserId: string;
  sessions: ChannelActivitySessions;
  onOpenVoiceView: () => void;
  onJoinVoiceChannel: (channelId: string) => void;
}

// Egy hangcsatorna a listában: futó tevékenységek jelzése és a bent lévők
export default function VoiceChannelItem({
  vc,
  isConnectedHere,
  participants,
  currentUserId,
  sessions,
  onOpenVoiceView,
  onJoinVoiceChannel
}: VoiceChannelItemProps) {
  return (
    <div className="space-y-0.5">
      <button
        onClick={() => {
          if (isConnectedHere) {
            onOpenVoiceView();
          } else {
            onJoinVoiceChannel(vc.id);
          }
        }}
        className="w-full flex items-center justify-between px-3 py-2.5 md:py-2 rounded-xl text-sm transition-all group"
        style={{
          background: isConnectedHere ? 'rgba(40, 201, 151, 0.12)' : 'transparent',
          color: isConnectedHere ? '#28C997' : '#999BBE',
        }}
        onMouseOver={e => { if (!isConnectedHere) { e.currentTarget.style.background = 'rgba(125, 105, 255, 0.08)'; e.currentTarget.style.color = '#F4F3FF'; } }}
        onMouseOut={e => { if (!isConnectedHere) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#999BBE'; } }}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
          <Volume2 className="w-4 h-4 flex-shrink-0" style={{ color: isConnectedHere ? '#28C997' : '#999BBE' }} />
          <span className="truncate font-medium" title={vc.name}>{vc.name}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-1.5">

          {sessions.browser?.active && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1 animate-pulse"
              style={{ background: 'rgba(83, 108, 255, 0.2)', color: '#536CFF', border: '1px solid rgba(83, 108, 255, 0.4)' }}
              title={`Közös Böngésző folyamatban (${sessions.browser?.title || 'Böngésző'})`}
            >
              <span>🌐</span>
            </span>
          )}
          {sessions.watch?.active && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1 animate-pulse"
              style={{ background: 'rgba(233, 75, 100, 0.2)', color: '#E94B64', border: '1px solid rgba(233, 75, 100, 0.4)' }}
              title={`Közös YouTube folyamatban (${sessions.watch?.title || 'YouTube'})`}
            >
              <span>🔴</span>
            </span>
          )}
          {sessions.casino?.active && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1 animate-pulse"
              style={{ background: 'rgba(245, 176, 65, 0.2)', color: '#F5B041', border: '1px solid rgba(245, 176, 65, 0.4)' }}
              title={`3D Kaszinó folyamatban (${sessions.casino?.startedBy})`}
            >
              <span>🎰</span>
            </span>
          )}
          {sessions.chess?.active && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1 animate-pulse"
              style={{ background: 'rgba(118, 85, 245, 0.2)', color: '#7655F5', border: '1px solid rgba(118, 85, 245, 0.4)' }}
              title={`1v1 Sakk folyamatban (${sessions.chess?.startedBy})`}
            >
              <span>♟️</span>
            </span>
          )}
          {sessions.empire?.active && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1 animate-pulse"
              style={{ background: 'rgba(40, 201, 151, 0.2)', color: '#28C997', border: '1px solid rgba(40, 201, 151, 0.4)' }}
              title={`MiskolcEmpire folyamatban (${sessions.empire?.startedBy})`}
            >
              <span>⚔️</span>
            </span>
          )}
          {sessions.phobia?.active && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1 animate-pulse"
              style={{ background: 'rgba(245, 176, 65, 0.2)', color: '#F5B041', border: '1px solid rgba(245, 176, 65, 0.4)' }}
              title={`MiskolcPhobia folyamatban (${sessions.phobia?.startedBy || 'Szellemvadászat'})`}
            >
              <span>🔦</span>
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
            const isSelf = p.id === currentUserId;
            return (
              <div
                key={p.id}
                className="flex items-center justify-between py-1 px-1.5 rounded-lg text-xs transition-all"
                style={{
                  background: p.isSpeaking ? 'rgba(40, 201, 151, 0.08)' : 'transparent',
                  color: p.isSpeaking ? '#F4F3FF' : '#999BBE',
                }}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {/* Avatar with speaking ring */}
                  <Avatar user={p} size="xs" speaking={p.isSpeaking} />
                  <span className="truncate font-medium" title={p.username}>
                    {p.username} {isSelf && <span className="text-[10px]" style={{ color: '#999BBE' }}>(Te)</span>}
                  </span>
                </div>

                {/* Voice Status Badges */}
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">

                  {p.isScreenSharing && (
                    <span className="text-white text-[9px] font-bold px-1 py-0.5 rounded leading-none flex items-center gap-0.5" style={{ background: '#E94B64' }}>
                      <Radio className="w-2.5 h-2.5 animate-pulse" />
                      ÉLŐ
                    </span>
                  )}
                  {p.isMuted && <MicOff className="w-3.5 h-3.5" style={{ color: '#E94B64' }}><title>Mikrofon némítva</title></MicOff>}
                  {p.isDeafened && <Headphones className="w-3.5 h-3.5" style={{ color: '#E94B64' }}><title>Süketítve</title></Headphones>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
