import React from 'react';
import Avatar from '../../shared/ui/Avatar';
import { Volume2, MicOff, Headphones, Tv, Activity, X, MessageSquare, User, Settings } from 'lucide-react';
import type { PresenceUser } from '../../shared/types';

interface UserListSidebarProps {
  users?: PresenceUser[];
  currentUserId: string | undefined;
  onOpenSpeedTest?: () => void;
  onStartDm?: (user: PresenceUser) => void;
  onOpenProfile?: () => void;
  onClose: () => void;
}

export default function UserListSidebar({
  users = [],
  currentUserId,
  onOpenSpeedTest,
  onStartDm,
  onOpenProfile,
  onClose
}: UserListSidebarProps) {
  const inVoiceUsers = users.filter((u) => !!u.voiceChannel);
  const otherOnlineUsers = users.filter((u) => !u.voiceChannel);

  const renderUser = (u: PresenceUser) => {
    const isSelf = u.id === currentUserId;
    const { speedTest } = u;

    return (
      <div
        key={u.id}
        onClick={() => {
          if (isSelf && onOpenProfile) onOpenProfile();
          else if (!isSelf && onStartDm) onStartDm(u);
        }}
        title={isSelf ? 'Kattints a profilod szerkesztéséhez' : `Kattints a privát üzenethez vele: ${u.username}`}
        className="flex items-center justify-between gap-2 px-2.5 py-2 min-h-[40px] rounded-xl group transition-all cursor-pointer"
        onMouseOver={e => e.currentTarget.style.background = 'rgba(125, 105, 255, 0.08)'}
        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Avatar with online dot */}
          <Avatar user={u} size="sm" status="online" badgeBorderColor="#101329" />

          <div className="min-w-0 flex-1">
            <div
              className="text-sm font-medium truncate flex items-center gap-1.5"
              style={{ color: u.avatarColor || '#F4F3FF' }}
            >
              <span className="truncate" title={u.username}>{u.username}</span>
              {isSelf && (
                <span className="text-[9px] px-1 py-0.2 rounded font-bold" style={{ background: 'rgba(118, 85, 245, 0.25)', color: '#7655F5' }}>
                  Te
                </span>
              )}
            </div>
            <div className="text-[10px] leading-tight flex items-center gap-1" style={{ color: '#999BBE' }}>
              {isSelf ? (
                <span className="text-[#7655F5] hover:underline flex items-center gap-0.5">
                  <Settings className="w-2.5 h-2.5" /> Profil beállítások
                </span>
              ) : (
                <span>Online</span>
              )}
              {speedTest && (
                <span className="flex items-center gap-0.5 font-medium ml-1" style={{ color: '#28C997' }}>
                  <Activity className="w-2.5 h-2.5" />
                  {speedTest.ping}ms
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action icons / Status icons */}
        <div className="flex items-center gap-1 flex-shrink-0" style={{ color: '#999BBE' }}>
          {/* Privát üzenet indító gomb másoknál */}
          {!isSelf && onStartDm && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStartDm(u);
              }}
              title={`Privát üzenet küldése neki: ${u.username}`}
              className="p-2 rounded-xl text-[#999BBE] hover:text-[#7655F5] opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all cursor-pointer"
              onMouseOver={e => e.currentTarget.style.background = 'rgba(118, 85, 245, 0.15)'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </button>
          )}

          {u.voiceChannel && (
            <>
              {u.isScreenSharing && (
                <span className="text-white text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5" style={{ background: '#E94B64' }} title="Képernyőt oszt meg">
                  <Tv className="w-2.5 h-2.5 animate-pulse" />
                  ÉLŐ
                </span>
              )}
              <Volume2 className="w-3.5 h-3.5" style={{ color: '#28C997' }}><title>Hangcsatornában</title></Volume2>
              {u.isMuted && <MicOff className="w-3.5 h-3.5" style={{ color: '#E94B64' }}><title>Némítva</title></MicOff>}
              {u.isDeafened && <Headphones className="w-3.5 h-3.5" style={{ color: '#E94B64' }}><title>Süketítve</title></Headphones>}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="w-72 max-w-full lg:w-64 flex flex-col h-full p-3 select-none flex-shrink-0 overflow-y-auto" style={{ background: '#101329', borderLeft: '1px solid rgba(125, 105, 255, 0.12)' }}>
      {/* Header */}
      <div className="mb-3 px-2 flex items-center justify-between pb-2" style={{ borderBottom: '1px solid rgba(125, 105, 255, 0.12)' }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold" style={{ color: '#F4F3FF' }}>Résztvevők</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenSpeedTest}
            title="Net Sebességteszt megnyitása"
            className="flex items-center gap-1 px-2.5 py-2 min-h-[36px] rounded-xl text-[11px] font-semibold transition-all"
            style={{ background: 'rgba(118, 85, 245, 0.15)', color: '#7655F5', border: '1px solid rgba(118, 85, 245, 0.25)' }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(118, 85, 245, 0.25)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(118, 85, 245, 0.15)'}
          >
            <Activity className="w-3 h-3" />
            <span className="hidden sm:inline">Sebesség</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Panel bezárása"
              className="p-2 rounded-xl text-shark-muted hover:text-white hover:bg-shark-elevated transition"
              style={{ color: '#999BBE' }}
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* In Voice Group */}
      {inVoiceUsers.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-2 px-2 flex items-center gap-1.5" style={{ color: '#28C997' }}>
            <Volume2 className="w-3.5 h-3.5" />
            <span>Hangban — {inVoiceUsers.length}</span>
          </div>
          <div className="space-y-0.5">
            {inVoiceUsers.map(renderUser)}
          </div>
        </div>
      )}

      {/* Online Group */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider mb-2 px-2" style={{ color: '#999BBE' }}>
          Online — {otherOnlineUsers.length}
        </div>
        <div className="space-y-0.5">
          {otherOnlineUsers.map(renderUser)}
        </div>
      </div>
    </div>
  );
}
