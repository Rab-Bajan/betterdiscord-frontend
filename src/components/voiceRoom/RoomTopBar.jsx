import React from 'react';
import { Volume2, Minimize2, Radio, Tv, Paintbrush, LayoutGrid, Code2, Menu } from 'lucide-react';

const idleColor = '#999BBE';

// Nézetváltó fül. `live`: a szobában épp fut az adott tevékenység, de nem azt nézzük.
function ModeTab({ active, live = false, activeBg, liveBg, liveColor, liveBorder, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all flex-shrink-0"
      style={{
        background: active ? activeBg : live ? liveBg : 'transparent',
        color: active ? 'white' : live ? liveColor : idleColor,
        border: live && !active ? `1px solid ${liveBorder}` : 'none'
      }}
    >
      {children}
    </button>
  );
}

export default function RoomTopBar({
  channel,
  participantCount,
  sharerCount,
  subView,
  onChangeView,
  whiteboardCount,
  casinoActive,
  watchActive,
  chessActive,
  onClose,
  onOpenMobileSidebar
}) {
  const stageActive = subView === 'stage';

  return (
    <div className="min-h-14 py-2 px-3 sm:px-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between flex-shrink-0 z-10 gap-2 min-w-0 w-full" style={{ background: '#101329', borderBottom: '1px solid rgba(125, 105, 255, 0.12)' }}>
      <div className="flex items-center justify-between gap-2 min-w-0 w-full sm:w-auto">
        <div className="flex items-center gap-2 min-w-0 truncate">
          {onOpenMobileSidebar && (
            <button
              type="button"
              onClick={onOpenMobileSidebar}
              title="Csatornák megnyitása"
              className="p-1.5 rounded-xl md:hidden transition flex-shrink-0"
              style={{ background: '#1B2040', color: '#7655F5', border: '1px solid rgba(125, 105, 255, 0.2)' }}
            >
              <Menu className="w-4 h-4" />
            </button>
          )}
          <Volume2 className="w-5 h-5 flex-shrink-0" style={{ color: '#28C997' }} />
          <span className="font-bold truncate text-sm sm:text-base" style={{ color: '#F4F3FF' }}>
            {channel ? channel.name : 'Hangcsatorna'}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold hidden xs:flex items-center gap-1 flex-shrink-0" style={{ background: 'rgba(40, 201, 151, 0.15)', color: '#28C997' }}>
            <Radio className="w-3 h-3 animate-pulse" />
            ÉLŐ
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium hidden sm:inline-block flex-shrink-0" style={{ background: 'rgba(125, 105, 255, 0.12)', color: '#999BBE' }}>
            👥 {participantCount}{channel?.userLimit ? `/${channel.userLimit}` : ''}
          </span>
          {sharerCount > 0 && (
            <span className="text-xs px-2.5 py-0.5 rounded-full font-bold hidden md:flex items-center gap-1 flex-shrink-0" style={{ background: 'rgba(233, 75, 100, 0.15)', color: '#E94B64', border: '1px solid rgba(233, 75, 100, 0.3)' }}>
              <Tv className="w-3 h-3 animate-pulse" />
              Közvetítés ({sharerCount})
            </span>
          )}
        </div>

        <button
          onClick={onClose}
          title="Vissza a csevegéshez (Hangkapcsolat megmarad)"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex-shrink-0 sm:hidden"
          style={{ background: '#1B2040', color: '#F4F3FF', border: '1px solid rgba(125, 105, 255, 0.2)' }}
        >
          <Minimize2 className="w-3.5 h-3.5" />
          <span>Csevegés</span>
        </button>
      </div>

      <div className="flex items-center gap-1 p-1 rounded-xl overflow-x-auto min-w-0 max-w-full scrollbar-none flex-nowrap" style={{ background: '#151832', border: '1px solid rgba(125, 105, 255, 0.12)' }}>
        <button
          onClick={() => onChangeView('stage')}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all flex-shrink-0"
          style={{ background: stageActive ? '#1B2040' : 'transparent', color: stageActive ? '#F4F3FF' : idleColor }}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          <span>Szoba</span>
        </button>

        <ModeTab active={subView === 'whiteboard'} activeBg="#7655F5" onClick={() => onChangeView('whiteboard')}>
          <Paintbrush className="w-3.5 h-3.5" style={{ color: subView === 'whiteboard' ? 'white' : '#f0b232' }} />
          <span>Közös Paint</span>
          {whiteboardCount > 0 && (
            <span className="text-white text-[10px] px-1.5 rounded-full font-bold" style={{ background: '#28C997' }}>
              {whiteboardCount}
            </span>
          )}
        </ModeTab>

        <ModeTab active={subView === 'code'} activeBg="#7655F5" onClick={() => onChangeView('code')}>
          <Code2 className="w-3.5 h-3.5" style={{ color: subView === 'code' ? 'white' : '#22d3ee' }} />
          <span>Kód Editor</span>
        </ModeTab>

        <ModeTab
          active={subView === 'casino'}
          live={casinoActive}
          activeBg="linear-gradient(135deg, #b45309, #a16207)"
          liveBg="rgba(245, 176, 65, 0.1)"
          liveColor="#f5b041"
          liveBorder="rgba(245, 176, 65, 0.3)"
          onClick={() => onChangeView('casino')}
        >
          <span className="text-xs">🎰</span>
          <span>3D Kaszinó</span>
          {casinoActive && <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#28C997' }}></span>}
        </ModeTab>

        <ModeTab
          active={subView === 'watch'}
          live={watchActive}
          activeBg="linear-gradient(135deg, #dc2626, #e11d48)"
          liveBg="rgba(233, 75, 100, 0.1)"
          liveColor="#E94B64"
          liveBorder="rgba(233, 75, 100, 0.3)"
          onClick={() => onChangeView('watch')}
        >
          <span className="text-xs">🔴</span>
          <span>YouTube</span>
          {watchActive && <span className="w-2 h-2 rounded-full animate-ping" style={{ background: '#E94B64' }}></span>}
        </ModeTab>

        <ModeTab
          active={subView === 'chess'}
          live={chessActive}
          activeBg="linear-gradient(135deg, #7655F5, #536CFF)"
          liveBg="rgba(118, 85, 245, 0.15)"
          liveColor="#7655F5"
          liveBorder="rgba(118, 85, 245, 0.3)"
          onClick={() => onChangeView('chess')}
        >
          <span className="text-xs">♟️</span>
          <span>Sakk</span>
          {chessActive && <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#28C997' }}></span>}
        </ModeTab>
      </div>

      <button
        onClick={onClose}
        title="Vissza a csevegéshez (Hangkapcsolat megmarad)"
        className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex-shrink-0"
        style={{ background: '#1B2040', color: '#F4F3FF', border: '1px solid rgba(125, 105, 255, 0.2)' }}
        onMouseOver={(e) => (e.currentTarget.style.background = '#242b50')}
        onMouseOut={(e) => (e.currentTarget.style.background = '#1B2040')}
      >
        <Minimize2 className="w-3.5 h-3.5" />
        <span>Csevegés nézet</span>
      </button>
    </div>
  );
}
