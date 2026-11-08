import React from 'react';
import { Mic, MicOff, Headphones, PhoneOff, Monitor, MonitorOff, Video, VideoOff, Paintbrush, Activity, Code2 } from 'lucide-react';

const REST_BG = '#1B2040';
const HOVER_BG = '#242b50';
const IDLE_BORDER = '1px solid rgba(125, 105, 255, 0.2)';

// Az alsó sáv egységes gombja. `hoverable`: csak akkor kap hover-színt, ha nincs külön kiemelt állapota.
function ControlButton({
  onClick, title, icon, label, background = REST_BG, border = IDLE_BORDER, color = '#F4F3FF',
  hoverable = true, restBg = REST_BG, hoverBg = HOVER_BG, animation, shadow, padding = 'px-2.5 sm:px-4', extraClass = ''
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1.5 sm:gap-2 ${padding} py-2 sm:py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-all shadow flex-shrink-0 ${extraClass}`}
      style={{ background, border, color, animation, boxShadow: shadow }}
      onMouseOver={(e) => { if (hoverable) e.currentTarget.style.background = hoverBg; }}
      onMouseOut={(e) => { if (hoverable) e.currentTarget.style.background = restBg; }}
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}

// Egy tevékenység (kaszinó/YouTube/sakk) gombjának stílusa: kiválasztva / fut a háttérben / alap
function activityStyle({ selected, live, selectedBg, liveBg, liveColor, liveBorder, pulse = true }) {
  return {
    background: selected ? selectedBg : live ? liveBg : REST_BG,
    border: live && !selected ? `1px solid ${liveBorder}` : !selected ? IDLE_BORDER : 'none',
    color: selected ? 'white' : live ? liveColor : '#F4F3FF',
    animation: pulse && live && !selected ? 'pulse 2s infinite' : 'none',
    hoverable: !selected && !live
  };
}

export default function RoomControlBar({
  subView,
  onToggleView,
  isMuted,
  isDeafened,
  isScreenSharing,
  isCameraOn,
  onToggleCamera,
  whiteboardCount,
  casinoActive,
  watchActive,
  chessActive,
  onToggleMute,
  onToggleDeafen,
  onToggleScreenShare,
  onStartCasino,
  onOpenSpeedTest,
  onDisconnect
}) {
  const isPaint = subView === 'whiteboard';
  const isCode = subView === 'code';

  const toggleCasino = () => {
    onToggleView('casino');
    if (subView !== 'casino' && !casinoActive) onStartCasino?.();
  };

  return (
    <div className="p-2 sm:p-4 flex items-center justify-center gap-1.5 sm:gap-3 flex-shrink-0 w-full overflow-x-auto scrollbar-none" style={{ background: '#101329', borderTop: '1px solid rgba(125, 105, 255, 0.12)' }}>
      <ControlButton
        onClick={onToggleMute}
        title={isMuted ? 'Mikrofon bekapcsolása' : 'Mikrofon némítása'}
        icon={isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" style={{ color: '#28C997' }} />}
        label={isMuted ? 'Némítva' : 'Mikrofon'}
        background={isMuted ? '#E94B64' : REST_BG}
        border={isMuted ? 'none' : IDLE_BORDER}
        color={isMuted ? 'white' : '#F4F3FF'}
        hoverable={!isMuted}
      />

      <ControlButton
        onClick={onToggleDeafen}
        title={isDeafened ? 'Süketítés feloldása' : 'Süketítés'}
        icon={<Headphones className="w-5 h-5" style={{ color: isDeafened ? 'white' : '#999BBE' }} />}
        label={isDeafened ? 'Süketítve' : 'Hangszóró'}
        background={isDeafened ? '#E94B64' : REST_BG}
        border={isDeafened ? 'none' : IDLE_BORDER}
        color={isDeafened ? 'white' : '#F4F3FF'}
        hoverable={!isDeafened}
      />

      <ControlButton
        onClick={onToggleCamera}
        title={isCameraOn ? 'Kamera kikapcsolása' : 'Kamera bekapcsolása'}
        icon={isCameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" style={{ color: '#999BBE' }} />}
        label={isCameraOn ? 'Kamera (Be)' : 'Kamera'}
        background={isCameraOn ? '#28C997' : REST_BG}
        border={isCameraOn ? 'none' : IDLE_BORDER}
        color={isCameraOn ? 'white' : '#F4F3FF'}
        hoverable={!isCameraOn}
      />

      <ControlButton
        onClick={onToggleScreenShare}
        title={isScreenSharing ? 'Képernyőmegosztás leállítása' : 'Képernyő megosztása (Go Live)'}
        icon={isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" style={{ color: '#7655F5' }} />}
        label={isScreenSharing ? 'Megosztás leállítása' : 'Képernyő'}
        background={isScreenSharing ? '#E94B64' : REST_BG}
        border={isScreenSharing ? 'none' : IDLE_BORDER}
        color={isScreenSharing ? 'white' : '#F4F3FF'}
        hoverable={!isScreenSharing}
      />

      <ControlButton
        onClick={() => onToggleView('whiteboard')}
        title="Közös Paint Rajztábla"
        icon={<Paintbrush className="w-5 h-5" style={{ color: isPaint ? 'white' : '#f0b232' }} />}
        label={`Paint ${whiteboardCount > 0 ? `(${whiteboardCount})` : ''}`}
        background={isPaint ? '#7655F5' : REST_BG}
        border={isPaint ? 'none' : IDLE_BORDER}
        color={isPaint ? 'white' : '#F4F3FF'}
        hoverable={!isPaint}
      />

      <ControlButton
        onClick={() => onToggleView('code')}
        title="Közös Kód Editor"
        icon={<Code2 className="w-5 h-5" style={{ color: isCode ? 'white' : '#22d3ee' }} />}
        label="Kód Editor"
        background={isCode ? '#7655F5' : REST_BG}
        border={isCode ? 'none' : IDLE_BORDER}
        color={isCode ? 'white' : '#F4F3FF'}
        hoverable={!isCode}
      />

      <ControlButton
        onClick={toggleCasino}
        title={casinoActive ? '3D Velvet Room Kaszinó megnyitása' : '3D Kaszinó indítása'}
        icon={<span className="text-base">🎰</span>}
        label={casinoActive ? 'Kaszinó (Élő)' : 'Kaszinó'}
        {...activityStyle({
          selected: subView === 'casino', live: casinoActive, pulse: false,
          selectedBg: 'linear-gradient(135deg, #b45309, #a16207)',
          liveBg: 'rgba(245, 176, 65, 0.15)', liveColor: '#f5b041', liveBorder: 'rgba(245, 176, 65, 0.4)'
        })}
      />

      <ControlButton
        onClick={() => onToggleView('watch')}
        title={watchActive ? 'Közös YouTube megnyitása' : 'Közös YouTube videó indítása'}
        icon={<span className="text-base">🔴</span>}
        label={watchActive ? 'YouTube (Élő)' : 'YouTube'}
        extraClass="cursor-pointer"
        {...activityStyle({
          selected: subView === 'watch', live: watchActive,
          selectedBg: 'linear-gradient(135deg, #dc2626, #e11d48)',
          liveBg: 'rgba(233, 75, 100, 0.15)', liveColor: '#E94B64', liveBorder: 'rgba(233, 75, 100, 0.4)'
        })}
      />

      <ControlButton
        onClick={() => onToggleView('chess')}
        title={chessActive ? 'Sakk aréna megnyitása' : '1v1 Sakk parti indítása'}
        icon={<span className="text-base">♟️</span>}
        label={chessActive ? 'Sakk (Élő)' : 'Sakk'}
        extraClass="cursor-pointer"
        {...activityStyle({
          selected: subView === 'chess', live: chessActive,
          selectedBg: 'linear-gradient(135deg, #7655F5, #536CFF)',
          liveBg: 'rgba(118, 85, 245, 0.15)', liveColor: '#7655F5', liveBorder: 'rgba(118, 85, 245, 0.4)'
        })}
      />

      <ControlButton
        onClick={onOpenSpeedTest}
        title="Net Sebességteszt (Speed Test)"
        icon={<Activity className="w-5 h-5 animate-pulse" style={{ color: '#7655F5' }} />}
        label="Net Teszt"
      />

      <ControlButton
        onClick={onDisconnect}
        title="Kapcsolat bontása (Kilépés)"
        icon={<PhoneOff className="w-5 h-5" />}
        label="Kilépés"
        background="#E94B64"
        border="none"
        color="white"
        restBg="#E94B64"
        hoverBg="#d43a53"
        shadow="0 4px 16px rgba(233, 75, 100, 0.35)"
        padding="px-3 sm:px-5"
      />
    </div>
  );
}
