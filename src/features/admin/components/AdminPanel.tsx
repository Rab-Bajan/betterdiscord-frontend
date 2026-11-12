import React, { useMemo, useState, type ReactNode } from 'react';
import { X, ShieldCheck, Dices, Crown, Flag } from 'lucide-react';
import type { SocketLike } from '../../../shared/services/socket/SocketLike';
import type { CurrentUser } from '../../../shared/types';
import { AdminClient } from '../lib/AdminClient';
import CasinoAdminTab from './CasinoAdminTab';
import ChessAdminTab from './ChessAdminTab';
import ModerationTab from './ModerationTab';

type AdminTab = 'casino' | 'chess' | 'moderation';

interface AdminPanelProps {
  socket: SocketLike;
  channelId: string | null | undefined;
  currentUser: CurrentUser | null;
  onClose: () => void;
}

export default function AdminPanel({ socket, channelId, currentUser, onClose }: AdminPanelProps) {
  const [tab, setTab] = useState<AdminTab>('casino');
  const admin = useMemo(() => new AdminClient(socket), [socket]);

  const tabBtn = (id: AdminTab, icon: ReactNode, label: string) => (
    <button
      onClick={() => setTab(id)}
      className="px-3 py-2 min-h-[36px] rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 transition"
      style={{ background: tab === id ? '#7655F5' : 'transparent', color: tab === id ? 'white' : '#999BBE' }}
    >
      {icon}{label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md p-3 pt-safe pb-safe" onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden select-text"
        style={{ background: '#101329', border: '1px solid rgba(125, 105, 255, 0.3)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid rgba(125, 105, 255, 0.12)' }}>
          <ShieldCheck className="w-5 h-5" style={{ color: '#F5B041' }} />
          <strong style={{ color: '#F4F3FF' }}>Admin menü</strong>
          <span className="text-xs truncate min-w-0" style={{ color: '#999BBE' }}>({currentUser?.username})</span>
          <button onClick={onClose} title="Bezárás" className="ml-auto p-2 rounded-xl hover:bg-[#1B2040] transition" style={{ color: '#999BBE' }}><X className="w-5 h-5" /></button>
        </div>

        <div className="flex gap-1 p-2 overflow-x-auto scrollbar-none" style={{ borderBottom: '1px solid rgba(125, 105, 255, 0.12)' }}>
          {tabBtn('casino', <Dices className="w-3.5 h-3.5" />, 'Kaszinó')}
          {tabBtn('chess', <Crown className="w-3.5 h-3.5" />, 'Sakk')}
          {tabBtn('moderation', <Flag className="w-3.5 h-3.5" />, 'Moderáció')}
        </div>

        <div className="p-3 sm:p-4 overflow-y-auto">
          {tab === 'casino' && <CasinoAdminTab admin={admin} />}
          {tab === 'chess' && <ChessAdminTab admin={admin} channelId={channelId} />}
          {tab === 'moderation' && <ModerationTab admin={admin} />}
        </div>
      </div>
    </div>
  );
}
