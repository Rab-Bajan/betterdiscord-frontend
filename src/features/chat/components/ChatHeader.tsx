import React from 'react';
import { Hash, Users, PhoneCall, Activity, Menu, History, SlidersHorizontal } from 'lucide-react';
import Avatar from '../../../shared/ui/Avatar';
import DMCallButton from '../../call/components/DMCallButton';
import type { CallPartner } from '../../call/types';
import type { TextChannel } from '../types';

interface ChatHeaderProps {
  channel: TextChannel | null | undefined;
  isDm: boolean;
  dmPartner: CallPartner | null;
  onOpenMobileSidebar?: (() => void) | undefined;
  onStartCall?: ((partner: CallPartner) => void) | undefined;
  callBusy: boolean;
  onOpenCallHistory?: (() => void) | undefined;
  onOpenCallSettings?: (() => void) | undefined;
  onOpenSpeedTest?: (() => void) | undefined;
  activeVoiceChannel: string | null | undefined;
  onJoinVoiceChannel: (channelId: string) => void;
  showUserList: boolean;
  onToggleUserList: () => void;
}

// A csatorna / privát beszélgetés fejléce a műveletgombokkal
export default function ChatHeader({
  channel,
  isDm,
  dmPartner,
  onOpenMobileSidebar,
  onStartCall,
  callBusy,
  onOpenCallHistory,
  onOpenCallSettings,
  onOpenSpeedTest,
  activeVoiceChannel,
  onJoinVoiceChannel,
  showUserList,
  onToggleUserList
}: ChatHeaderProps) {
  return (
    <div className="h-14 px-2 sm:px-5 gap-2 flex items-center justify-between flex-shrink-0 z-10 min-w-0" style={{ background: '#101329', borderBottom: '1px solid rgba(125, 105, 255, 0.12)' }}>
      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
        {onOpenMobileSidebar && (
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            title="Csatornák megnyitása"
            className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl md:hidden transition flex-shrink-0"
            style={{ background: '#1B2040', color: '#7655F5', border: '1px solid rgba(125, 105, 255, 0.2)' }}
          >
            <Menu className="w-4 h-4" />
          </button>
        )}

        {isDm && dmPartner ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar user={dmPartner} size="sm" status="online" badgeBorderColor="#101329" />
            <span className="font-bold truncate text-sm sm:text-base" title={`@${dmPartner.username}`} style={{ color: '#F4F3FF' }}>
              @{dmPartner.username}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#7655F5]/20 text-[#7655F5] border border-[#7655F5]/30 hidden sm:inline flex-shrink-0 whitespace-nowrap">
              Privát Üzenet
            </span>
          </div>
        ) : (
          <>
            <Hash className="w-5 h-5 flex-shrink-0" style={{ color: '#7655F5' }} />
            <span className="font-bold truncate text-sm sm:text-base min-w-0" title={channel ? channel.name : undefined} style={{ color: '#F4F3FF' }}>{channel ? channel.name : 'Csatorna'}</span>
            {channel?.description && (
              <>
                <div className="w-[1px] h-4 mx-2 hidden sm:block flex-shrink-0" style={{ background: 'rgba(125, 105, 255, 0.2)' }} />
                <span className="text-xs truncate min-w-0 hidden sm:block" title={channel.description} style={{ color: '#999BBE' }}>
                  {channel.description}
                </span>
              </>
            )}
          </>
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1 sm:gap-2.5 flex-shrink-0">
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
              className="p-2 rounded-xl transition flex items-center justify-center min-w-[40px] min-h-[40px]"
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
              className="p-2 rounded-xl transition flex items-center justify-center min-w-[40px] min-h-[40px]"
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
          className="flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 min-w-[40px] min-h-[40px] rounded-xl text-xs font-semibold transition"
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
            className="flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 min-w-[40px] min-h-[40px] rounded-xl text-white text-xs font-medium transition shadow-md"
            style={{ background: 'linear-gradient(135deg, #7655F5, #536CFF)' }}
          >
            <PhoneCall className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Hangcsatorna</span>
          </button>
        )}

        <button
          onClick={onToggleUserList}
          title={showUserList ? 'Résztvevők elrejtése' : 'Résztvevők mutatása'}
          className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl transition flex-shrink-0"
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
  );
}
