import React from 'react';
import { Wifi, PhoneOff, Maximize2, Monitor, MonitorOff } from 'lucide-react';

interface VoiceConnectedBarProps {
  channelName: string | undefined;
  onDisconnect: () => void;
  onOpenVoiceView: () => void;
  isScreenSharing: boolean;
  onToggleScreenShare: () => void;
}

export default function VoiceConnectedBar({
  channelName,
  onDisconnect,
  onOpenVoiceView,
  isScreenSharing,
  onToggleScreenShare
}: VoiceConnectedBarProps) {
  if (!channelName) return null;

  return (
    <div className="px-3 py-2 flex items-center justify-between text-xs select-none" style={{ borderTop: '1px solid rgba(125, 105, 255, 0.12)', background: 'rgba(40, 201, 151, 0.05)' }}>
      <div
        onClick={onOpenVoiceView}
        className="flex items-center gap-2 cursor-pointer group flex-1 min-w-0 mr-2"
        title="Hang szoba megnyitása"
      >
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 animate-pulse" style={{ background: '#28C997' }} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold flex items-center gap-1 leading-tight group-hover:underline" style={{ color: '#28C997' }}>
            <span>Hang csatlakoztatva</span>
            <Maximize2 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="text-[11px] flex items-center gap-1.5 min-w-0" style={{ color: '#999BBE' }}>
            <Wifi className="w-3 h-3" style={{ color: '#28C997' }} />
            <span className="truncate" title={channelName}>{channelName}</span>
            <span className="hidden sm:inline whitespace-nowrap" style={{ color: 'rgba(153, 155, 190, 0.5)' }}>• RTC Csatlakozva</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Screen share button */}
        <button
          onClick={onToggleScreenShare}
          title={isScreenSharing ? 'Képernyőmegosztás leállítása' : 'Képernyő megosztása'}
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
          style={{
            background: isScreenSharing ? '#E94B64' : 'transparent',
            color: isScreenSharing ? 'white' : '#999BBE',
          }}
          onMouseOver={e => { if (!isScreenSharing) e.currentTarget.style.background = 'rgba(125, 105, 255, 0.15)'; }}
          onMouseOut={e => { if (!isScreenSharing) e.currentTarget.style.background = 'transparent'; }}
        >
          {isScreenSharing ? <MonitorOff className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
        </button>

        {/* Disconnect button */}
        <button
          onClick={onDisconnect}
          title="Kapcsolat bontása (Kilépés a hangból)"
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
          style={{ color: '#999BBE' }}
          onMouseOver={e => { e.currentTarget.style.background = 'rgba(233, 75, 100, 0.15)'; e.currentTarget.style.color = '#E94B64'; }}
          onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#999BBE'; }}
        >
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
