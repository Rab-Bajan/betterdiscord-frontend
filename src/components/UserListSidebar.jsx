import React from 'react';
import { Volume2, MicOff, Headphones, Tv, Activity } from 'lucide-react';

export default function UserListSidebar({
  users = [],
  currentUserId,
  onOpenSpeedTest
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
        className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-discord-hover/50 group transition cursor-pointer"
      >
        <div className="flex items-center gap-2.5 truncate">
          {/* Avatar with online dot */}
          <div className="relative flex-shrink-0">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: u.avatarColor || '#5865F2' }}
            >
              {u.username.charAt(0).toUpperCase()}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-discord-green border-2 border-discord-darker" />
          </div>

          <div className="truncate">
            <div
              className="text-sm font-medium truncate"
              style={{ color: u.avatarColor || '#dbdee1' }}
            >
              {u.username}
            </div>
            <div className="text-[10px] text-discord-textMuted leading-tight flex items-center gap-1">
              {isSelf && <span>Te</span>}
              {hasSpeed && (
                <span className="text-discord-green font-medium flex items-center gap-0.5">
                  <Activity className="w-2.5 h-2.5" />
                  {u.speedTest.ping}ms • {u.speedTest.download}M
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Status icons if in voice */}
        <div className="flex items-center gap-1.5 text-discord-textMuted flex-shrink-0">
          {u.voiceChannel && (
            <>
              {u.isScreenSharing && (
                <span className="bg-discord-red text-white text-[9px] font-bold px-1 rounded flex items-center gap-0.5" title="Képernyőt oszt meg">
                  <Tv className="w-2.5 h-2.5 animate-pulse" />
                  ÉLŐ
                </span>
              )}
              <Volume2 className="w-3.5 h-3.5 text-discord-green" title="Hangcsatornában" />
              {u.isMuted && <MicOff className="w-3 h-3 text-discord-red" title="Némítva" />}
              {u.isDeafened && <Headphones className="w-3 h-3 text-discord-red" title="Süketítve" />}
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
            className="opacity-0 group-hover:opacity-100 p-1 hover:text-discord-primary transition rounded"
          >
            <Activity className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="w-60 bg-discord-darker hidden lg:flex flex-col h-full border-l border-discord-darkest/40 p-3 select-none flex-shrink-0 overflow-y-auto">
      {/* Fejléc: Sebességteszt gombbal */}
      <div className="mb-3 px-2 flex items-center justify-between border-b border-discord-darkest/60 pb-2">
        <span className="text-xs font-bold text-discord-textHeader">Tagok</span>
        <button
          type="button"
          onClick={onOpenSpeedTest}
          title="Net Sebességteszt megnyitása"
          className="flex items-center gap-1 px-2 py-1 rounded bg-discord-dark hover:bg-discord-hover text-[11px] font-semibold text-discord-primary transition"
        >
          <Activity className="w-3 h-3" />
          <span>Sebesség</span>
        </button>
      </div>

      {/* In Voice Group */}
      {inVoiceUsers.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-discord-green mb-2 px-2 flex items-center gap-1.5">
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
        <div className="text-[11px] font-bold uppercase tracking-wider text-discord-textMuted mb-2 px-2">
          Online — {otherOnlineUsers.length}
        </div>
        <div className="space-y-0.5">
          {otherOnlineUsers.map(renderUser)}
        </div>
      </div>
    </div>
  );
}
