import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Headphones,
  PhoneOff,
  Volume2,
  Minimize2,
  Maximize2,
  Radio,
  Monitor,
  MonitorOff,
  Tv,
  Paintbrush,
  LayoutGrid,
  Activity,
  Code2,
  Menu
} from 'lucide-react';
import WhiteboardView from './WhiteboardView';
import CodeEditorView from './CodeEditorView';
import CasinoView from './CasinoView';
import WatchPartyView from './WatchPartyView';

function VideoRenderer({ stream, isMuted = false, className = '' }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream || null;
      if (stream) {
        videoRef.current.play().catch(e => console.warn('Video play error:', e));
      }
    }
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={isMuted}
      className={`w-full h-full object-contain ${className}`}
    />
  );
}

export default function VoiceRoomView({
  channel,
  participants = [],
  currentUserId,
  currentUser,
  socket,
  isMuted,
  isDeafened,
  isScreenSharing,
  localScreenStream,
  remoteScreenStreams = new Map(),
  whiteboards = [],
  activeWhiteboardId,
  onSelectWhiteboard,
  onCreateWhiteboard,
  onDeleteWhiteboard,
  codeTreeData,
  casinoSession,
  onStartCasino,
  onStopCasino,
  watchState,
  onToggleMute,
  onToggleDeafen,
  onToggleScreenShare,
  onOpenSpeedTest,
  onDisconnect,
  onClose,
  onOpenMobileSidebar
}) {
  const [subView, setSubView] = useState('stage'); // 'stage' | 'whiteboard'

  const screenSharers = participants.filter((p) => {
    if (p.id === currentUserId) return isScreenSharing && localScreenStream;
    return p.isScreenSharing && remoteScreenStreams.has(p.id);
  });

  const [selectedSharerId, setSelectedSharerId] = useState(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const stageRef = useRef(null);

  useEffect(() => {
    if (screenSharers.length > 0) {
      if (!selectedSharerId || !screenSharers.some(s => s.id === selectedSharerId)) {
        setSelectedSharerId(screenSharers[0].id);
      }
    } else {
      setSelectedSharerId(null);
    }
  }, [screenSharers.length, selectedSharerId]);

  const activeSharer = participants.find(p => p.id === selectedSharerId);
  const activeStream = selectedSharerId === currentUserId
    ? localScreenStream
    : (selectedSharerId ? remoteScreenStreams.get(selectedSharerId) : null);

  const toggleFullScreen = () => {
    if (!stageRef.current) return;
    if (!document.fullscreenElement) {
      stageRef.current.requestFullscreen?.().then(() => setIsFullScreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullScreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full relative select-none min-w-0 max-w-full overflow-hidden" style={{ background: '#090A18' }}>
      {/* Top Bar */}
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
              👥 {participants.length}{channel?.userLimit ? `/${channel.userLimit}` : ''}
            </span>
            {screenSharers.length > 0 && (
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold hidden md:flex items-center gap-1 flex-shrink-0" style={{ background: 'rgba(233, 75, 100, 0.15)', color: '#E94B64', border: '1px solid rgba(233, 75, 100, 0.3)' }}>
                <Tv className="w-3 h-3 animate-pulse" />
                Közvetítés ({screenSharers.length})
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

        {/* Módváltó tab gombok */}
        <div className="flex items-center gap-1 p-1 rounded-xl overflow-x-auto min-w-0 max-w-full scrollbar-none flex-nowrap" style={{ background: '#151832', border: '1px solid rgba(125, 105, 255, 0.12)' }}>
          <button
            onClick={() => setSubView('stage')}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all flex-shrink-0"
            style={{
              background: subView === 'stage' ? '#1B2040' : 'transparent',
              color: subView === 'stage' ? '#F4F3FF' : '#999BBE',
            }}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Szoba</span>
          </button>
          <button
            onClick={() => setSubView('whiteboard')}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all flex-shrink-0"
            style={{
              background: subView === 'whiteboard' ? '#7655F5' : 'transparent',
              color: subView === 'whiteboard' ? 'white' : '#999BBE',
            }}
          >
            <Paintbrush className="w-3.5 h-3.5" style={{ color: subView === 'whiteboard' ? 'white' : '#f0b232' }} />
            <span>Közös Paint</span>
            {whiteboards.length > 0 && (
              <span className="text-white text-[10px] px-1.5 rounded-full font-bold" style={{ background: '#28C997' }}>
                {whiteboards.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setSubView('code')}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all flex-shrink-0"
            style={{
              background: subView === 'code' ? '#7655F5' : 'transparent',
              color: subView === 'code' ? 'white' : '#999BBE',
            }}
          >
            <Code2 className="w-3.5 h-3.5" style={{ color: subView === 'code' ? 'white' : '#22d3ee' }} />
            <span>Kód Editor</span>
          </button>
          <button
            onClick={() => setSubView('casino')}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all flex-shrink-0"
            style={{
              background: subView === 'casino'
                ? 'linear-gradient(135deg, #b45309, #a16207)'
                : casinoSession?.active
                ? 'rgba(245, 176, 65, 0.1)'
                : 'transparent',
              color: subView === 'casino' ? 'white' : casinoSession?.active ? '#f5b041' : '#999BBE',
              border: casinoSession?.active && subView !== 'casino' ? '1px solid rgba(245, 176, 65, 0.3)' : 'none',
            }}
          >
            <span className="text-xs">🎰</span>
            <span>3D Kaszinó</span>
            {casinoSession?.active && (
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#28C997' }}></span>
            )}
          </button>
          <button
            onClick={() => setSubView('watch')}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all flex-shrink-0"
            style={{
              background: subView === 'watch'
                ? 'linear-gradient(135deg, #dc2626, #e11d48)'
                : watchState?.active
                ? 'rgba(233, 75, 100, 0.1)'
                : 'transparent',
              color: subView === 'watch' ? 'white' : watchState?.active ? '#E94B64' : '#999BBE',
              border: watchState?.active && subView !== 'watch' ? '1px solid rgba(233, 75, 100, 0.3)' : 'none',
            }}
          >
            <span className="text-xs">🔴</span>
            <span>YouTube</span>
            {watchState?.active && (
              <span className="w-2 h-2 rounded-full animate-ping" style={{ background: '#E94B64' }}></span>
            )}
          </button>
        </div>

        <button
          onClick={onClose}
          title="Vissza a csevegéshez (Hangkapcsolat megmarad)"
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex-shrink-0"
          style={{ background: '#1B2040', color: '#F4F3FF', border: '1px solid rgba(125, 105, 255, 0.2)' }}
          onMouseOver={e => e.currentTarget.style.background = '#242b50'}
          onMouseOut={e => e.currentTarget.style.background = '#1B2040'}
        >
          <Minimize2 className="w-3.5 h-3.5" />
          <span>Csevegés nézet</span>
        </button>
      </div>

      {/* Watch Party aktív értesítés ha másik nézetben vagyunk */}
      {watchState?.active && subView !== 'watch' && (
        <div className="px-3 py-2 flex items-center justify-between text-xs flex-shrink-0 gap-2 min-w-0" style={{ background: 'linear-gradient(90deg, rgba(44, 16, 21, 0.9), rgba(29, 13, 18, 0.9))', borderBottom: '1px solid rgba(233, 75, 100, 0.3)' }}>
          <div className="flex items-center gap-2 truncate min-w-0">
            <span className="text-base animate-bounce flex-shrink-0">🔴</span>
            <span className="truncate" style={{ color: '#fca5a5' }}>
              <strong style={{ color: '#E94B64' }}>{watchState.startedBy || 'Valaki'}</strong> elindította a közös YouTube videót!
            </span>
          </div>
          <button
            onClick={() => setSubView('watch')}
            className="px-2.5 py-1 rounded-lg text-white font-extrabold text-xs shadow transition transform active:scale-95 flex-shrink-0 ml-1 whitespace-nowrap"
            style={{ background: 'linear-gradient(135deg, #dc2626, #e11d48)' }}
          >
            Megnyitás ▶️
          </button>
        </div>
      )}

      {/* Kaszinó session aktív értesítés ha másik nézetben vagyunk */}
      {casinoSession?.active && subView !== 'casino' && (
        <div className="px-3 py-2 flex items-center justify-between text-xs flex-shrink-0 gap-2 min-w-0" style={{ background: 'linear-gradient(90deg, rgba(41, 23, 66, 0.9), rgba(27, 17, 45, 0.9))', borderBottom: '1px solid rgba(245, 176, 65, 0.3)' }}>
          <div className="flex items-center gap-2 truncate min-w-0" style={{ color: '#fde68a' }}>
            <span className="text-base animate-bounce flex-shrink-0">🎰</span>
            <span className="truncate">
              <strong style={{ color: '#f5b041' }}>{casinoSession.startedBy}</strong> elindította a 3D Kaszinót!
            </span>
          </div>
          <button
            onClick={() => setSubView('casino')}
            className="px-2.5 py-1 rounded-lg text-black font-extrabold text-xs shadow transition transform active:scale-95 flex-shrink-0 whitespace-nowrap"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #eab308)' }}
          >
            Belépés 🎲
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {subView === 'watch' ? (
        <WatchPartyView
          channelId={channel?.id}
          channelName={channel?.name}
          currentUser={currentUser}
          socket={socket}
          watchState={watchState}
          onClose={() => setSubView('stage')}
        />
      ) : subView === 'casino' ? (
        <CasinoView
          channelId={channel?.id}
          channelName={channel?.name}
          currentUser={currentUser}
          session={casinoSession}
          onStartSession={onStartCasino}
          onStopSession={onStopCasino}
          onClose={() => setSubView('stage')}
        />
      ) : subView === 'code' ? (
        <CodeEditorView
          channelId={channel?.id}
          socket={socket}
          currentUser={currentUser}
          treeData={codeTreeData}
          onClose={() => setSubView('stage')}
        />
      ) : subView === 'whiteboard' ? (
        <WhiteboardView
          channelId={channel?.id}
          socket={socket}
          currentUser={currentUser}
          whiteboards={whiteboards}
          activeBoardId={activeWhiteboardId}
          onSelectBoard={onSelectWhiteboard}
          onCreateBoard={onCreateWhiteboard}
          onDeleteBoard={onDeleteWhiteboard}
          onClose={() => setSubView('stage')}
        />
      ) : (
        /* HANG / KÉPERNYŐMEGOSZTÁS NÉZET */
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-2 sm:p-4">
          {activeStream ? (
            /* A: KÉPERNYŐMEGOSZTÁS NÉZET */
            <div className="flex-1 flex flex-col min-h-0 gap-2 sm:gap-3">
              <div
                ref={stageRef}
                className="flex-1 w-full min-h-0 overflow-hidden relative flex items-center justify-center group rounded-xl sm:rounded-2xl"
                style={{ background: '#070814', border: '1px solid rgba(125, 105, 255, 0.2)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)' }}
              >
                <VideoRenderer
                  stream={activeStream}
                  isMuted={selectedSharerId === currentUserId}
                  className="max-h-full max-w-full"
                />

                <div className="absolute top-2 left-2 sm:top-3 sm:left-3 flex items-center gap-1.5 sm:gap-2 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl z-10" style={{ background: 'rgba(9, 10, 24, 0.85)', backdropFilter: 'blur(12px)', border: '1px solid rgba(125, 105, 255, 0.2)' }}>
                  <div
                    className="w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center text-white text-[9px] sm:text-[10px] font-bold flex-shrink-0"
                    style={{ backgroundColor: activeSharer?.avatarColor || '#7655F5' }}
                  >
                    {activeSharer?.username?.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-white text-[11px] sm:text-xs font-semibold truncate max-w-[120px] sm:max-w-none">
                    {activeSharer?.username} képernyője
                  </span>
                  <span className="text-white text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded uppercase flex-shrink-0" style={{ background: '#E94B64' }}>
                    ÉLŐ
                  </span>
                </div>

                <div className="absolute top-2 right-2 sm:top-3 sm:right-3 flex items-center gap-1.5 z-10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={toggleFullScreen}
                    title={isFullScreen ? 'Kilépés a teljes képernyőből' : 'Teljes képernyő'}
                    className="p-1.5 sm:p-2 rounded-xl text-white transition-all shadow"
                    style={{ background: 'rgba(9, 10, 24, 0.85)', backdropFilter: 'blur(12px)', border: '1px solid rgba(125, 105, 255, 0.2)' }}
                  >
                    <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                </div>
              </div>

              {/* Alsó résztvevő kártyák strip */}
              <div className="h-20 sm:h-28 flex-shrink-0 flex items-center gap-2 sm:gap-3 overflow-x-auto py-1 scrollbar-none">
                {participants.map((p) => {
                  const isSelf = p.id === currentUserId;
                  const isSharingThis = (isSelf && isScreenSharing) || (p.isScreenSharing && remoteScreenStreams.has(p.id));
                  const isSelected = selectedSharerId === p.id;

                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        if (isSharingThis) setSelectedSharerId(p.id);
                      }}
                      className="h-full min-w-[95px] sm:min-w-[130px] max-w-[110px] sm:max-w-[150px] p-1.5 sm:p-2 flex flex-col items-center justify-center relative cursor-pointer transition-all rounded-xl sm:rounded-2xl flex-shrink-0"
                      style={{
                        background: '#151832',
                        border: isSelected
                          ? '2px solid #7655F5'
                          : isSharingThis
                          ? '2px solid #E94B64'
                          : '1px solid rgba(125, 105, 255, 0.15)',
                        boxShadow: isSelected ? '0 0 16px rgba(118, 85, 245, 0.3)' : 'none',
                      }}
                    >
                      <div
                        className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-white text-xs sm:text-sm font-bold border-2 transition ${
                          p.isSpeaking ? 'speaking-ring' : ''
                        }`}
                        style={{ backgroundColor: p.avatarColor || '#7655F5', borderColor: p.isSpeaking ? '#28C997' : 'transparent' }}
                      >
                        {p.username.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-[11px] sm:text-xs font-medium truncate mt-1 max-w-[85px] sm:max-w-[120px]" style={{ color: '#F4F3FF' }}>
                        {p.username} {isSelf && '(Te)'}
                      </span>

                      {isSharingThis && (
                        <span className="absolute top-1 sm:top-1.5 right-1 sm:right-1.5 text-white text-[7px] sm:text-[8px] font-bold px-1 rounded" style={{ background: '#E94B64' }}>
                          ÉLŐ
                        </span>
                      )}

                      <div className="absolute bottom-1 right-1 flex items-center gap-0.5 sm:gap-1">
                        {p.isMuted && <MicOff className="w-2.5 h-2.5 sm:w-3 sm:h-3" style={{ color: '#E94B64' }} />}
                        {p.isDeafened && <Headphones className="w-2.5 h-2.5 sm:w-3 sm:h-3" style={{ color: '#E94B64' }} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* B: ALAPÉRTELMEZETT RÉSZTVEVŐ RÁCS */
            <div className="flex-1 overflow-y-auto flex items-center justify-center p-3 sm:p-6 w-full min-w-0">
              <div className={`w-full max-w-5xl ${
                participants.length <= 1
                  ? 'flex justify-center items-center'
                  : 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4 auto-rows-fr'
              }`}>
                {participants.map((p) => {
                  const isSelf = p.id === currentUserId;
                  return (
                    <div
                      key={p.id}
                      className={`rounded-2xl p-4 sm:p-6 flex flex-col items-center justify-center relative shadow-xl group transition-all ${
                        participants.length <= 1 ? 'w-full max-w-sm sm:max-w-md min-h-[170px] sm:min-h-[220px]' : 'min-h-[140px] sm:min-h-[190px]'
                      }`}
                      style={{
                        background: '#151832',
                        border: p.isSpeaking ? '2px solid #28C997' : '1px solid rgba(125, 105, 255, 0.15)',
                        boxShadow: p.isSpeaking ? '0 0 20px rgba(40, 201, 151, 0.2)' : '0 4px 24px rgba(9, 10, 24, 0.6)',
                      }}
                    >
                      {/* Speed badge if available */}
                      {p.speedTest && (
                        <div
                          className="absolute top-2.5 left-2.5 sm:top-3 sm:left-3 px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-mono flex items-center gap-1 shadow cursor-pointer"
                          style={{ background: 'rgba(9, 10, 24, 0.9)', border: '1px solid rgba(125, 105, 255, 0.2)', color: '#28C997' }}
                          onClick={onOpenSpeedTest}
                          title={`Ping: ${p.speedTest.ping}ms • DL: ${p.speedTest.download} Mbps • UL: ${p.speedTest.upload} Mbps`}
                        >
                          <Activity className="w-2.5 h-2.5" />
                          <span>{p.speedTest.ping}ms</span>
                        </div>
                      )}

                      <div className="relative mb-2.5 sm:mb-3">
                        <div
                          className={`w-16 h-16 sm:w-24 sm:h-24 rounded-full flex items-center justify-center text-white text-2xl sm:text-3xl font-bold shadow-xl border-2 sm:border-4 transition-all duration-150 ${
                            p.isSpeaking ? 'speaking-ring' : ''
                          }`}
                          style={{ backgroundColor: p.avatarColor || '#7655F5', borderColor: p.isSpeaking ? '#28C997' : 'transparent' }}
                        >
                          {p.username.charAt(0).toUpperCase()}
                        </div>

                        {p.isSpeaking && (
                          <div className="absolute -bottom-1 -right-1 p-0.5 sm:p-1 rounded-full shadow" style={{ background: '#28C997' }}>
                            <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-bounce text-white" />
                          </div>
                        )}
                      </div>

                      <div className="text-center">
                        <div className="font-semibold text-xs sm:text-sm flex items-center gap-1 justify-center" style={{ color: '#F4F3FF' }}>
                          <span className="truncate max-w-[120px] sm:max-w-none">{p.username}</span>
                          {isSelf && (
                            <span className="text-[10px] sm:text-[11px] px-1 sm:px-1.5 py-0.5 rounded font-normal" style={{ color: '#999BBE', background: '#1B2040' }}>
                              Te
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="absolute bottom-2.5 right-2.5 sm:bottom-3 sm:right-3 flex items-center gap-1">
                        {p.isMuted && (
                          <div className="p-1 rounded-full shadow" style={{ background: 'rgba(233, 75, 100, 0.9)' }} title="Némítva">
                            <MicOff className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-white" />
                          </div>
                        )}
                        {p.isDeafened && (
                          <div className="p-1 rounded-full shadow" style={{ background: 'rgba(233, 75, 100, 0.9)' }} title="Süketítve">
                            <Headphones className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-white" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating Bottom Voice Control Bar */}
      <div className="p-2 sm:p-4 flex items-center justify-center gap-1.5 sm:gap-3 flex-shrink-0 w-full overflow-x-auto scrollbar-none" style={{ background: '#101329', borderTop: '1px solid rgba(125, 105, 255, 0.12)' }}>
        {/* Mute button */}
        <button
          onClick={onToggleMute}
          title={isMuted ? 'Mikrofon bekapcsolása' : 'Mikrofon némítása'}
          className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-all shadow text-white flex-shrink-0"
          style={{
            background: isMuted ? '#E94B64' : '#1B2040',
            border: isMuted ? 'none' : '1px solid rgba(125, 105, 255, 0.2)',
          }}
          onMouseOver={e => { if (!isMuted) e.currentTarget.style.background = '#242b50'; }}
          onMouseOut={e => { if (!isMuted) e.currentTarget.style.background = '#1B2040'; }}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" style={{ color: '#28C997' }} />}
          <span className="hidden md:inline" style={{ color: isMuted ? 'white' : '#F4F3FF' }}>{isMuted ? 'Némítva' : 'Mikrofon'}</span>
        </button>

        {/* Deafen button */}
        <button
          onClick={onToggleDeafen}
          title={isDeafened ? 'Süketítés feloldása' : 'Süketítés'}
          className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-all shadow flex-shrink-0"
          style={{
            background: isDeafened ? '#E94B64' : '#1B2040',
            border: isDeafened ? 'none' : '1px solid rgba(125, 105, 255, 0.2)',
            color: isDeafened ? 'white' : '#F4F3FF',
          }}
          onMouseOver={e => { if (!isDeafened) e.currentTarget.style.background = '#242b50'; }}
          onMouseOut={e => { if (!isDeafened) e.currentTarget.style.background = '#1B2040'; }}
        >
          <Headphones className="w-5 h-5" style={{ color: isDeafened ? 'white' : '#999BBE' }} />
          <span className="hidden md:inline">{isDeafened ? 'Süketítve' : 'Hangszóró'}</span>
        </button>

        {/* Screen Share button */}
        <button
          onClick={onToggleScreenShare}
          title={isScreenSharing ? 'Képernyőmegosztás leállítása' : 'Képernyő megosztása (Go Live)'}
          className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-all shadow flex-shrink-0"
          style={{
            background: isScreenSharing ? '#E94B64' : '#1B2040',
            border: isScreenSharing ? 'none' : '1px solid rgba(125, 105, 255, 0.2)',
            color: isScreenSharing ? 'white' : '#F4F3FF',
          }}
          onMouseOver={e => { if (!isScreenSharing) e.currentTarget.style.background = '#242b50'; }}
          onMouseOut={e => { if (!isScreenSharing) e.currentTarget.style.background = '#1B2040'; }}
        >
          {isScreenSharing ? (
            <MonitorOff className="w-5 h-5" />
          ) : (
            <Monitor className="w-5 h-5" style={{ color: '#7655F5' }} />
          )}
          <span className="hidden md:inline">{isScreenSharing ? 'Megosztás leállítása' : 'Képernyő'}</span>
        </button>

        {/* Whiteboard / Paint button */}
        <button
          onClick={() => setSubView(subView === 'whiteboard' ? 'stage' : 'whiteboard')}
          title="Közös Paint Rajztábla"
          className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-all shadow flex-shrink-0"
          style={{
            background: subView === 'whiteboard' ? '#7655F5' : '#1B2040',
            border: subView === 'whiteboard' ? 'none' : '1px solid rgba(125, 105, 255, 0.2)',
            color: 'white',
          }}
          onMouseOver={e => { if (subView !== 'whiteboard') e.currentTarget.style.background = '#242b50'; }}
          onMouseOut={e => { if (subView !== 'whiteboard') e.currentTarget.style.background = '#1B2040'; }}
        >
          <Paintbrush className="w-5 h-5" style={{ color: subView === 'whiteboard' ? 'white' : '#f0b232' }} />
          <span className="hidden md:inline" style={{ color: subView === 'whiteboard' ? 'white' : '#F4F3FF' }}>Paint {whiteboards.length > 0 ? `(${whiteboards.length})` : ''}</span>
        </button>

        {/* Code Editor button */}
        <button
          onClick={() => setSubView(subView === 'code' ? 'stage' : 'code')}
          title="Közös Kód Editor"
          className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-all shadow flex-shrink-0"
          style={{
            background: subView === 'code' ? '#7655F5' : '#1B2040',
            border: subView === 'code' ? 'none' : '1px solid rgba(125, 105, 255, 0.2)',
            color: 'white',
          }}
          onMouseOver={e => { if (subView !== 'code') e.currentTarget.style.background = '#242b50'; }}
          onMouseOut={e => { if (subView !== 'code') e.currentTarget.style.background = '#1B2040'; }}
        >
          <Code2 className="w-5 h-5" style={{ color: subView === 'code' ? 'white' : '#22d3ee' }} />
          <span className="hidden md:inline" style={{ color: subView === 'code' ? 'white' : '#F4F3FF' }}>Kód Editor</span>
        </button>

        {/* 3D Kaszinó button */}
        <button
          onClick={() => {
            if (subView === 'casino') {
              setSubView('stage');
            } else {
              setSubView('casino');
              if (!casinoSession?.active && onStartCasino) {
                onStartCasino();
              }
            }
          }}
          title={casinoSession?.active ? '3D Velvet Room Kaszinó megnyitása' : '3D Kaszinó indítása'}
          className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-all shadow flex-shrink-0"
          style={{
            background: subView === 'casino'
              ? 'linear-gradient(135deg, #b45309, #a16207)'
              : casinoSession?.active
              ? 'rgba(245, 176, 65, 0.15)'
              : '#1B2040',
            border: casinoSession?.active && subView !== 'casino'
              ? '1px solid rgba(245, 176, 65, 0.4)'
              : subView !== 'casino'
              ? '1px solid rgba(125, 105, 255, 0.2)'
              : 'none',
            color: subView === 'casino' ? 'white' : casinoSession?.active ? '#f5b041' : '#F4F3FF',
          }}
          onMouseOver={e => { if (subView !== 'casino' && !casinoSession?.active) e.currentTarget.style.background = '#242b50'; }}
          onMouseOut={e => { if (subView !== 'casino' && !casinoSession?.active) e.currentTarget.style.background = '#1B2040'; }}
        >
          <span className="text-base">🎰</span>
          <span className="hidden md:inline">{casinoSession?.active ? 'Kaszinó (Élő)' : 'Kaszinó'}</span>
        </button>

        {/* Watch Together (YouTube) button */}
        <button
          onClick={() => setSubView(subView === 'watch' ? 'stage' : 'watch')}
          title={watchState?.active ? 'Közös YouTube megnyitása' : 'Közös YouTube videó indítása'}
          className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-all shadow flex-shrink-0"
          style={{
            background: subView === 'watch'
              ? 'linear-gradient(135deg, #dc2626, #e11d48)'
              : watchState?.active
              ? 'rgba(233, 75, 100, 0.15)'
              : '#1B2040',
            border: watchState?.active && subView !== 'watch'
              ? '1px solid rgba(233, 75, 100, 0.4)'
              : subView !== 'watch'
              ? '1px solid rgba(125, 105, 255, 0.2)'
              : 'none',
            color: subView === 'watch' ? 'white' : watchState?.active ? '#E94B64' : '#F4F3FF',
            animation: watchState?.active && subView !== 'watch' ? 'pulse 2s infinite' : 'none',
          }}
          onMouseOver={e => { if (subView !== 'watch' && !watchState?.active) e.currentTarget.style.background = '#242b50'; }}
          onMouseOut={e => { if (subView !== 'watch' && !watchState?.active) e.currentTarget.style.background = '#1B2040'; }}
        >
          <span className="text-base">🔴</span>
          <span className="hidden md:inline">{watchState?.active ? 'YouTube (Élő)' : 'YouTube'}</span>
        </button>

        {/* Speed Test button */}
        <button
          onClick={onOpenSpeedTest}
          title="Net Sebességteszt (Speed Test)"
          className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-all shadow flex-shrink-0"
          style={{ background: '#1B2040', border: '1px solid rgba(125, 105, 255, 0.2)', color: '#F4F3FF' }}
          onMouseOver={e => e.currentTarget.style.background = '#242b50'}
          onMouseOut={e => e.currentTarget.style.background = '#1B2040'}
        >
          <Activity className="w-5 h-5 animate-pulse" style={{ color: '#7655F5' }} />
          <span className="hidden md:inline">Net Teszt</span>
        </button>

        {/* Disconnect button */}
        <button
          onClick={onDisconnect}
          title="Kapcsolat bontása (Kilépés)"
          className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-all shadow text-white flex-shrink-0"
          style={{ background: '#E94B64', boxShadow: '0 4px 16px rgba(233, 75, 100, 0.35)' }}
          onMouseOver={e => e.currentTarget.style.background = '#d43a53'}
          onMouseOut={e => e.currentTarget.style.background = '#E94B64'}
        >
          <PhoneOff className="w-5 h-5" />
          <span className="hidden md:inline">Kilépés</span>
        </button>
      </div>
    </div>
  );
}
