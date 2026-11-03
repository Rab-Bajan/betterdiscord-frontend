import React from 'react';
import { Volume2, MicOff, Headphones, Tv, Activity, X } from 'lucide-react';

export default function UserListSidebar({
  users = [],
  currentUserId,
  onOpenSpeedTest,
  onClose
}) {
  const inVoiceUsers = users.filter((u) => !!u.voiceChannel);
  const otherOnlineUsers = users.filter((u) => !u.voiceChannel);

  const renderUser = (u) => {
    const isSelf = u.id === currentUserId;
    const hasSpeed = !!u.speedTest;

    return (
      <div
        key={u.id}
        onClick={() => onOpenSpeedTest && onOpenSpeedTest()}
        title={hasSpeed ? `Ping: ${u.speedTest.ping}ms • DL: ${u.speedTest.download} Mbps • UL: ${u.speedTest.upload} Mbps` : 'Kattints a sebességteszthez'}
        className="flex items-center justify-between px-2.5 py-2 rounded-xl group transition-all cursor-pointer"
        onMouseOver={e => e.currentTarget.style.background = 'rgba(125, 105, 255, 0.08)'}
        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
      >
        <div className="flex items-center gap-2.5 truncate">
          {/* Avatar with online dot */}
          <div className="relative flex-shrink-0">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md"
              style={{ backgroundColor: u.avatarColor || '#7655F5' }}
            >
              {u.username.charAt(0).toUpperCase()}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2" style={{ background: '#28C997', borderColor: '#101329' }} />
          </div>

          <div className="truncate">
            <div
              className="text-sm font-medium truncate"
              style={{ color: u.avatarColor || '#F4F3FF' }}
            >
              {u.username}
            </div>
            <div className="text-[10px] leading-tight flex items-center gap-1" style={{ color: '#999BBE' }}>
              {isSelf && <span>Te</span>}
              {hasSpeed && (
                <span className="flex items-center gap-0.5 font-medium" style={{ color: '#28C997' }}>
                  <Activity className="w-2.5 h-2.5" />
                  {u.speedTest.ping}ms • {u.speedTest.download}M
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Status icons if in voice */}
        <div className="flex items-center gap-1.5 flex-shrink-0" style={{ color: '#999BBE' }}>
          {u.voiceChannel && (
            <>
              {u.isScreenSharing && (
                <span className="text-white text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5" style={{ background: '#E94B64' }} title="Képernyőt oszt meg">
                  <Tv className="w-2.5 h-2.5 animate-pulse" />
                  ÉLŐ
                </span>
              )}
              <Volume2 className="w-3.5 h-3.5" style={{ color: '#28C997' }} title="Hangcsatornában" />
              {u.isMuted && <MicOff className="w-3.5 h-3.5" style={{ color: '#E94B64' }} title="Némítva" />}
              {u.isDeafened && <Headphones className="w-3.5 h-3.5" style={{ color: '#E94B64' }} title="Süketítve" />}
            </>
          )}

          {/* Hover speedtest button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSpeedTest && onOpenSpeedTest();
            }}
            title="Net Sebességteszt megnyitása"
            className="opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-all"
            style={{ color: '#7655F5' }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(118, 85, 245, 0.15)'}
            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
          >
            <Activity className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="w-64 md:w-60 flex flex-col h-full p-3 select-none flex-shrink-0 overflow-y-auto" style={{ background: '#101329', borderLeft: '1px solid rgba(125, 105, 255, 0.12)' }}>
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
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all"
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
              className="p-1 rounded-lg lg:hidden text-shark-muted hover:text-white transition"
              style={{ color: '#999BBE' }}
            >
              <X className="w-4 h-4" />
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
