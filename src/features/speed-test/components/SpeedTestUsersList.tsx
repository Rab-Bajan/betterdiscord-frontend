import React from 'react';
import { Activity } from 'lucide-react';
import Avatar from '../../../shared/ui/Avatar';
import type { PresenceUser } from '../../../shared/types';

interface SpeedTestUsersListProps {
  onlineUsers: PresenceUser[];
  currentUserId: string | undefined;
  onRequestUserTest: (targetUserId: string, targetUsername: string) => void;
}

// A szerveren lévő felhasználók legutóbb mért sebessége, mérés kérése gombbal
export default function SpeedTestUsersList({ onlineUsers, currentUserId, onRequestUserTest }: SpeedTestUsersListProps) {
  return (
    <div className="space-y-2">
      <div className="text-xs mb-3" style={{ color: '#999BBE' }}>
        Itt láthatod a szerveren tartózkodó többi felhasználó legutóbb mért sebességét, vagy kérhetsz tőlük mérést.
      </div>

      {onlineUsers.map((u) => {
        const isSelf = u.id === currentUserId;
        const { speedTest } = u;

        return (
          <div
            key={u.id}
            className="rounded-xl p-3 flex items-center justify-between gap-3"
            style={{ background: '#151832', border: '1px solid rgba(125, 105, 255, 0.15)' }}
          >
            {/* User infó */}
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar user={u} size="md" badgeBorderColor="#151832" />
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate flex items-center gap-1.5" style={{ color: '#F4F3FF' }}>
                  <span className="truncate" title={u.username}>{u.username}</span>
                  {isSelf && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: '#999BBE', background: '#1B2040' }}>
                      Te
                    </span>
                  )}
                </div>
                <div className="text-[11px] flex flex-wrap items-center gap-x-2" style={{ color: '#999BBE' }}>
                  {speedTest ? (
                    <>
                      <span className="flex items-center gap-0.5 font-medium" style={{ color: '#28C997' }}>
                        <Activity className="w-3 h-3" />
                        {speedTest.ping} ms
                      </span>
                      <span>•</span>
                      <span>DL: {speedTest.download} Mbps</span>
                      <span>•</span>
                      <span>UL: {speedTest.upload} Mbps</span>
                    </>
                  ) : (
                    <span className="italic">Még nem mért sebességet</span>
                  )}
                </div>
              </div>
            </div>

            {/* Mérés kérése gomb */}
            {!isSelf && (
              <button
                type="button"
                onClick={() => onRequestUserTest(u.id, u.username)}
                title="Sebességteszt kérése a felhasználótól"
                className="px-3 py-2 min-h-[36px] rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 flex-shrink-0"
                style={{ background: '#1B2040', color: '#F4F3FF', border: '1px solid rgba(125, 105, 255, 0.2)' }}
                onMouseOver={e => e.currentTarget.style.background = '#242b50'}
                onMouseOut={e => e.currentTarget.style.background = '#1B2040'}
              >
                <Activity className="w-3.5 h-3.5" style={{ color: '#7655F5' }} />
                <span>Mérés kérése</span>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
