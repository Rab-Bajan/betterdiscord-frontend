import React from 'react';
import { Wifi, PhoneOff, Maximize2, Monitor, MonitorOff } from 'lucide-react';

export default function VoiceConnectedBar({
  channelName,
  onDisconnect,
  onOpenVoiceView,
  isScreenSharing,
  onToggleScreenShare
}) {
  if (!channelName) return null;

  return (
    <div className="bg-discord-darkest border-t border-discord-dark px-3 py-2 flex items-center justify-between text-xs select-none">
      <div
        onClick={onOpenVoiceView}
        className="flex items-center gap-2 cursor-pointer group flex-1 min-w-0 mr-2"
        title="Hang szoba megnyitása"
      >
        <div className="w-2.5 h-2.5 rounded-full bg-discord-green flex-shrink-0 animate-pulse" />
        <div className="truncate">
          <div className="text-discord-green font-semibold flex items-center gap-1 leading-tight group-hover:underline">
            <span>Hang csatlakoztatva</span>
            <Maximize2 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="text-discord-textMuted text-[11px] truncate flex items-center gap-1.5">
            <Wifi className="w-3 h-3 text-discord-green" />
            <span>{channelName}</span>
            <span className="text-discord-textMuted/60">• RTC Csatlakozva</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Screen share button */}
        <button
          onClick={onToggleScreenShare}
          title={isScreenSharing ? 'Képernyőmegosztás leállítása' : 'Képernyő megosztása'}
          className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
            isScreenSharing
              ? 'bg-discord-red text-white hover:bg-red-600'
              : 'hover:bg-discord-hover text-discord-textMuted hover:text-discord-textHeader'
          }`}
        >
          {isScreenSharing ? <MonitorOff className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
        </button>

        {/* Disconnect button */}
        <button
          onClick={onDisconnect}
          title="Kapcsolat bontása (Kilépés a hangból)"
          className="w-7 h-7 rounded-md hover:bg-discord-hover text-discord-textMuted hover:text-discord-red flex items-center justify-center transition-colors"
        >
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
