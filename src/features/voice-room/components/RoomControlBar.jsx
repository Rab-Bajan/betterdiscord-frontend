import React from 'react';
import { Mic, MicOff, Headphones, PhoneOff, Monitor, MonitorOff, Video, VideoOff, Paintbrush, Activity, Code2, Globe } from 'lucide-react';

const REST_BG = '#1B2040';
const HOVER_BG = '#242b50';
const IDLE_BORDER = '1px solid rgba(125, 105, 255, 0.2)';

// Az alsó sáv egységes gombja. `hoverable`: csak akkor kap hover-színt, ha nincs külön kiemelt állapota.
function ControlButton({
  onClick, title, icon, label, background = REST_BG, border = IDLE_BORDER, color = '#F4F3FF',
  hoverable = true, restBg = REST_BG, hoverBg = HOVER_BG, animation, shadow, padding = 'px-2.5 sm:px-4', extraClass = '', labelClass = 'hidden md:inline'
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1.5 sm:gap-2 ${padding} py-2 sm:py-2.5 min-h-[40px] rounded-xl whitespace-nowrap font-semibold text-xs sm:text-sm transition-all shadow flex-shrink-0 ${extraClass}`}
      style={{ background, border, color, animation, boxShadow: shadow }}
      onMouseOver={(e) => { if (hoverable) e.currentTarget.style.background = hoverBg; }}
      onMouseOut={(e) => { if (hoverable) e.currentTarget.style.background = restBg; }}
    >
      {icon}
      <span className={labelClass}>{label}</span>
    </button>
  );
}

// Egy tevékenység (kaszinó/YouTube/sakk/böngésző) gombjának stílusa: kiválasztva / fut a háttérben / alap
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
  empireActive,
  browserActive,
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
    <div className="p-2 sm:p-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-[max(1rem,env(safe-area-inset-bottom))] flex items-center justify-start [&>*:first-child]:ml-auto [&>*:last-child]:mr-auto [&>*:last-child]:sticky [&>*:last-child]:right-0 [&>*:last-child]:z-10 gap-1.5 sm:gap-2 2xl:gap-3 flex-shrink-0 w-full max-w-full overflow-x-auto scrollbar-none" style={{ background: '#101329', borderTop: '1px solid rgba(125, 105, 255, 0.12)' }}>
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
        labelClass="hidden 2xl:inline"
        onClick={() => onToggleView('browser')}
        title={browserActive ? 'Közös Böngésző megnyitása' : 'Közös Böngésző indítása'}
        icon={<Globe className="w-5 h-5" style={{ color: subView === 'browser' ? 'white' : '#536CFF' }} />}
        label={browserActive ? 'Böngésző (Élő)' : 'Böngésző'}
        extraClass="cursor-pointer"
        {...activityStyle({
          selected: subView === 'browser', live: browserActive,
          selectedBg: 'linear-gradient(135deg, #536CFF, #7655F5)',
          liveBg: 'rgba(83, 108, 255, 0.15)', liveColor: '#536CFF', liveBorder: 'rgba(83, 108, 255, 0.4)'
        })}
      />

      <ControlButton
        labelClass="hidden 2xl:inline"
        onClick={() => onToggleView('whiteboard')}
        title="Közös Paint Rajztábla"
        icon={<Paintbrush className="w-5 h-5" style={{ color: isPaint ? 'white' : '#F5B041' }} />}
        label={`Paint ${whiteboardCount > 0 ? `(${whiteboardCount})` : ''}`}
        background={isPaint ? '#7655F5' : REST_BG}
        border={isPaint ? 'none' : IDLE_BORDER}
        color={isPaint ? 'white' : '#F4F3FF'}
        hoverable={!isPaint}
      />

      <ControlButton
        labelClass="hidden 2xl:inline"
        onClick={() => onToggleView('code')}
        title="Közös Kód Editor"
        icon={<Code2 className="w-5 h-5" style={{ color: isCode ? 'white' : '#28C997' }} />}
        label="Kód Editor"
        background={isCode ? '#7655F5' : REST_BG}
        border={isCode ? 'none' : IDLE_BORDER}
        color={isCode ? 'white' : '#F4F3FF'}
        hoverable={!isCode}
      />

      <ControlButton
        labelClass="hidden 2xl:inline"
        onClick={toggleCasino}
        title={casinoActive ? '3D Velvet Room Kaszinó megnyitása' : '3D Kaszinó indítása'}
        icon={<span className="text-base">🎰</span>}
        label={casinoActive ? 'Kaszinó (Élő)' : 'Kaszinó'}
        {...activityStyle({
          selected: subView === 'casino', live: casinoActive, pulse: false,
          selectedBg: 'linear-gradient(135deg, #F5B041, #d4922a)',
          liveBg: 'rgba(245, 176, 65, 0.15)', liveColor: '#F5B041', liveBorder: 'rgba(245, 176, 65, 0.4)'
        })}
      />

      <ControlButton
        labelClass="hidden 2xl:inline"
        onClick={() => onToggleView('watch')}
        title={watchActive ? 'Közös YouTube megnyitása' : 'Közös YouTube videó indítása'}
        icon={<span className="text-base">🔴</span>}
        label={watchActive ? 'YouTube (Élő)' : 'YouTube'}
        extraClass="cursor-pointer"
        {...activityStyle({
          selected: subView === 'watch', live: watchActive,
          selectedBg: 'linear-gradient(135deg, #E94B64, #c93a52)',
          liveBg: 'rgba(233, 75, 100, 0.15)', liveColor: '#E94B64', liveBorder: 'rgba(233, 75, 100, 0.4)'
        })}
      />

      <ControlButton
        labelClass="hidden 2xl:inline"
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
        labelClass="hidden 2xl:inline"
        onClick={() => onToggleView('empire')}
        title={empireActive ? 'MiskolcEmpire megnyitása' : 'MiskolcEmpire indítása'}
        icon={<span className="text-base">⚔️</span>}
        label={empireActive ? 'Empire (Élő)' : 'Empire'}
        extraClass="cursor-pointer"
        {...activityStyle({
          selected: subView === 'empire', live: empireActive,
          selectedBg: 'linear-gradient(135deg, #7655F5, #536CFF)',
          liveBg: 'rgba(40, 201, 151, 0.15)', liveColor: '#28C997', liveBorder: 'rgba(40, 201, 151, 0.4)'
        })}
      />

      <ControlButton
        labelClass="hidden 2xl:inline"
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
