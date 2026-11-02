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
  Code2
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
  onClose
}) {
  const [subView, setSubView] = useState('stage'); // 'stage' | 'whiteboard'

  // Megkeressük azokat a résztvevőket, akik épp képernyőt osztanak meg
  const screenSharers = participants.filter((p) => {
    if (p.id === currentUserId) return isScreenSharing && localScreenStream;
    return p.isScreenSharing && remoteScreenStreams.has(p.id);
  });

  // Fókuszált közvetítés (alapértelmezetten az első képernyőmegosztó)
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
    <div className="flex-1 flex flex-col bg-discord-darkest h-full relative select-none">
      {/* Top Bar */}
      <div className="h-12 border-b border-discord-dark px-4 flex items-center justify-between shadow-sm bg-discord-darkest flex-shrink-0 z-10 gap-2">
        <div className="flex items-center gap-2 truncate">
          <Volume2 className="w-5 h-5 text-discord-green flex-shrink-0" />
          <span className="font-bold text-discord-textHeader truncate">
            {channel ? channel.name : 'Hangcsatorna'}
          </span>
          <span className="text-xs bg-discord-green/20 text-discord-green px-2 py-0.5 rounded-full font-semibold hidden sm:flex items-center gap-1">
            <Radio className="w-3 h-3 animate-pulse" />
            VoIP Élő
          </span>
          {screenSharers.length > 0 && (
            <span className="text-xs bg-discord-red/20 text-discord-red border border-discord-red/40 px-2 py-0.5 rounded-full font-bold hidden md:flex items-center gap-1">
              <Tv className="w-3 h-3 animate-pulse" />
              Közvetítés ({screenSharers.length})
            </span>
          )}
        </div>

        {/* Módváltó: Hang/Képernyő vs Közös Paint */}
        <div className="flex items-center gap-1 bg-discord-darker p-1 rounded-lg">
          <button
            onClick={() => setSubView('stage')}
            className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition ${
              subView === 'stage' ? 'bg-discord-active text-white' : 'text-discord-textMuted hover:text-white'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Szoba</span>
          </button>
          <button
            onClick={() => setSubView('whiteboard')}
            className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition ${
              subView === 'whiteboard' ? 'bg-discord-primary text-white shadow' : 'text-discord-textMuted hover:text-white'
            }`}
          >
            <Paintbrush className="w-3.5 h-3.5 text-discord-yellow" />
            <span>Közös Paint</span>
            {whiteboards.length > 0 && (
              <span className="bg-discord-green text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {whiteboards.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setSubView('code')}
            className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition ${
              subView === 'code' ? 'bg-discord-primary text-white shadow' : 'text-discord-textMuted hover:text-white'
            }`}
          >
            <Code2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Kód Editor</span>
          </button>
          <button
            onClick={() => setSubView('casino')}
            className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition ${
              subView === 'casino'
                ? 'bg-gradient-to-r from-amber-600 to-yellow-600 text-white shadow'
                : casinoSession?.active
                ? 'text-amber-300 hover:text-amber-200 bg-amber-500/10 border border-amber-500/30'
                : 'text-discord-textMuted hover:text-white'
            }`}
          >
            <span className="text-xs">🎰</span>
            <span>3D Kaszinó</span>
            {casinoSession?.active && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            )}
          </button>
          <button
            onClick={() => setSubView('watch')}
            className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition ${
              subView === 'watch'
                ? 'bg-gradient-to-r from-rose-600 to-indigo-600 text-white shadow'
                : watchState?.active
                ? 'text-rose-300 hover:text-rose-200 bg-rose-500/10 border border-rose-500/30'
                : 'text-discord-textMuted hover:text-white'
            }`}
          >
            <span className="text-xs">🍿</span>
            <span>Közös Mozi</span>
            {watchState?.active && (
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping"></span>
            )}
          </button>
        </div>

        <button
          onClick={onClose}
          title="Vissza a csevegéshez (Hangkapcsolat megmarad)"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-discord-darker hover:bg-discord-hover text-discord-textHeader text-xs font-semibold transition flex-shrink-0"
        >
          <Minimize2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Csevegés nézet</span>
        </button>
      </div>

      {/* Watch Party (Mozi) aktív értesítés ha másik nézetben vagyunk */}
      {watchState?.active && subView !== 'watch' && (
        <div className="bg-gradient-to-r from-[#2c1032] via-[#1d0d2b] to-[#120820] border-b border-rose-500/40 px-4 py-2 flex items-center justify-between shadow-md text-xs text-rose-200 flex-shrink-0">
          <div className="flex items-center gap-2 truncate">
            <span className="text-base animate-bounce">🍿</span>
            <span className="truncate">
              <strong className="text-rose-300">{watchState.startedBy || 'Valaki'}</strong> elindította a közös mozizást: <span className="font-semibold text-white">{watchState.title || watchState.url}</span>!
            </span>
          </div>
          <button
            onClick={() => setSubView('watch')}
            className="px-3 py-1 rounded-lg bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow transition transform active:scale-95 flex-shrink-0 ml-2"
          >
            Csatlakozás a Mozihoz 🎬
          </button>
        </div>
      )}

      {/* Kaszinó session aktív értesítés ha másik nézetben vagyunk */}
      {casinoSession?.active && subView !== 'casino' && (
        <div className="bg-gradient-to-r from-[#291742] via-[#1b112d] to-[#120b1e] border-b border-amber-500/30 px-4 py-2 flex items-center justify-between shadow-md text-xs text-amber-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-base animate-bounce">🎰</span>
            <span>
              <strong className="text-amber-300">{casinoSession.startedBy}</strong> elindította a 3D Velvet Room Kaszinót ebben a csatornában!
            </span>
          </div>
          <button
            onClick={() => setSubView('casino')}
            className="px-3 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-extrabold text-xs shadow transition transform active:scale-95"
          >
            Belépés a Kaszinóba 🎲
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {subView === 'watch' ? (
        /* KÖZÖS MOZI & YOUTUBE (WATCH TOGETHER) NÉZET */
        <WatchPartyView
          channelId={channel?.id}
          channelName={channel?.name}
          currentUser={currentUser}
          socket={socket}
          watchState={watchState}
          onClose={() => setSubView('stage')}
        />
      ) : subView === 'casino' ? (
        /* VELVET ROOM 3D KASZINÓ NÉZET */
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
        /* KÖZÖS KÓD EDITOR NÉZET */
        <CodeEditorView
          channelId={channel?.id}
          socket={socket}
          currentUser={currentUser}
          treeData={codeTreeData}
          onClose={() => setSubView('stage')}
        />
      ) : subView === 'whiteboard' ? (
        /* KÖZÖS PAINT RAJZTÁBLA NÉZET */
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
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-4">
          {activeStream ? (
            /* A: KÉPERNYŐMEGOSZTÁS NÉZET (Stage / Színház mód) */
            <div className="flex-1 flex flex-col min-h-0 gap-3">
              <div
                ref={stageRef}
                className="flex-1 bg-black rounded-xl overflow-hidden relative flex items-center justify-center border border-discord-dark shadow-2xl group"
              >
                <VideoRenderer
                  stream={activeStream}
                  isMuted={selectedSharerId === currentUserId}
                  className="max-h-full"
                />

                <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 z-10">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                    style={{ backgroundColor: activeSharer?.avatarColor || '#5865F2' }}
                  >
                    {activeSharer?.username?.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-white text-xs font-semibold">
                    {activeSharer?.username} képernyője
                  </span>
                  <span className="bg-discord-red text-white text-[10px] font-bold px-1.5 py-0.2 rounded uppercase">
                    ÉLŐ
                  </span>
                </div>

                <button
                  onClick={toggleFullScreen}
                  title={isFullScreen ? 'Kilépés a teljes képernyőből' : 'Teljes képernyő'}
                  className="absolute top-3 right-3 bg-black/60 hover:bg-black/90 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-10 border border-white/10"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>

              {/* Alsó résztvevő sáv */}
              <div className="h-28 flex-shrink-0 flex items-center gap-3 overflow-x-auto py-1">
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
                      className={`h-full min-w-[130px] max-w-[150px] bg-discord-darker border rounded-lg p-2 flex flex-col items-center justify-center relative cursor-pointer transition ${
                        isSelected
                          ? 'border-discord-primary ring-2 ring-discord-primary'
                          : isSharingThis
                          ? 'border-discord-red hover:border-discord-red'
                          : 'border-discord-dark hover:border-discord-channel'
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold border-2 transition ${
                          p.isSpeaking ? 'speaking-ring border-discord-green' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: p.avatarColor || '#5865F2' }}
                      >
                        {p.username.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs text-discord-textHeader font-medium truncate mt-1">
                        {p.username} {isSelf && '(Te)'}
                      </span>

                      {isSharingThis && (
                        <span className="absolute top-1.5 right-1.5 bg-discord-red text-white text-[8px] font-bold px-1 rounded">
                          ÉLŐ
                        </span>
                      )}

                      <div className="absolute bottom-1 right-1 flex items-center gap-1">
                        {p.isMuted && <MicOff className="w-3 h-3 text-discord-red" />}
                        {p.isDeafened && <Headphones className="w-3 h-3 text-discord-red" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* B: ALAPÉRTELMEZETT RÉSZTVEVŐ RÁCS */
            <div className="flex-1 overflow-y-auto flex items-center justify-center">
              <div className="w-full max-w-5xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-fr">
                {participants.map((p) => {
                  const isSelf = p.id === currentUserId;
                  return (
                    <div
                      key={p.id}
                      className="bg-discord-darker border border-discord-dark/50 rounded-xl p-6 flex flex-col items-center justify-center relative min-h-[190px] shadow-lg group transition-all"
                    >
                      {/* Speed badge if available */}
                      {p.speedTest && (
                        <div
                          className="absolute top-3 left-3 bg-discord-darkest/90 border border-discord-dark/60 px-2 py-0.5 rounded-full text-[10px] text-discord-green font-mono flex items-center gap-1 shadow cursor-pointer hover:border-discord-primary"
                          onClick={onOpenSpeedTest}
                          title={`Ping: ${p.speedTest.ping}ms • DL: ${p.speedTest.download} Mbps • UL: ${p.speedTest.upload} Mbps`}
                        >
                          <Activity className="w-2.5 h-2.5" />
                          <span>{p.speedTest.ping}ms</span>
                        </div>
                      )}

                      <div className="relative mb-3">
                        <div
                          className={`w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-bold shadow-xl border-4 transition-all duration-150 ${
                            p.isSpeaking
                              ? 'speaking-ring border-discord-green'
                              : 'border-transparent'
                          }`}
                          style={{ backgroundColor: p.avatarColor || '#5865F2' }}
                        >
                          {p.username.charAt(0).toUpperCase()}
                        </div>

                        {p.isSpeaking && (
                          <div className="absolute -bottom-1 -right-1 bg-discord-green text-white p-1 rounded-full shadow">
                            <Volume2 className="w-4 h-4 animate-bounce" />
                          </div>
                        )}
                      </div>

                      <div className="text-center">
                        <div className="text-discord-textHeader font-semibold text-sm flex items-center gap-1 justify-center">
                          <span>{p.username}</span>
                          {isSelf && (
                            <span className="text-[11px] text-discord-textMuted bg-discord-darkest px-1.5 py-0.5 rounded">
                              Te
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
                        {p.isMuted && (
                          <div className="bg-discord-red/90 text-white p-1 rounded-full shadow" title="Némítva">
                            <MicOff className="w-3.5 h-3.5" />
                          </div>
                        )}
                        {p.isDeafened && (
                          <div className="bg-discord-red/90 text-white p-1 rounded-full shadow" title="Süketítve">
                            <Headphones className="w-3.5 h-3.5" />
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

      {/* Floating Bottom Voice Control Bar (Discord style) */}
      <div className="p-4 bg-discord-darker border-t border-discord-dark flex items-center justify-center gap-3 sm:gap-4 flex-shrink-0 flex-wrap">
        {/* Mute button */}
        <button
          onClick={onToggleMute}
          title={isMuted ? 'Mikrofon bekapcsolása' : 'Mikrofon némítása'}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-sm transition shadow ${
            isMuted
              ? 'bg-discord-red text-white hover:bg-red-600'
              : 'bg-discord-dark hover:bg-discord-hover text-discord-textHeader'
          }`}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5 text-discord-green" />}
          <span className="hidden sm:inline">{isMuted ? 'Némítva' : 'Mikrofon'}</span>
        </button>

        {/* Deafen button */}
        <button
          onClick={onToggleDeafen}
          title={isDeafened ? 'Süketítés feloldása' : 'Süketítés'}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-sm transition shadow ${
            isDeafened
              ? 'bg-discord-red text-white hover:bg-red-600'
              : 'bg-discord-dark hover:bg-discord-hover text-discord-textHeader'
          }`}
        >
          <Headphones className={`w-5 h-5 ${isDeafened ? 'text-white' : 'text-discord-channel'}`} />
          <span className="hidden sm:inline">{isDeafened ? 'Süketítve' : 'Hangszóró'}</span>
        </button>

        {/* Screen Share button */}
        <button
          onClick={onToggleScreenShare}
          title={isScreenSharing ? 'Képernyőmegosztás leállítása' : 'Képernyő megosztása (Go Live)'}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-sm transition shadow ${
            isScreenSharing
              ? 'bg-discord-red hover:bg-red-600 text-white animate-pulse'
              : 'bg-discord-dark hover:bg-discord-hover text-discord-textHeader'
          }`}
        >
          {isScreenSharing ? (
            <MonitorOff className="w-5 h-5" />
          ) : (
            <Monitor className="w-5 h-5 text-discord-primary" />
          )}
          <span className="hidden sm:inline">{isScreenSharing ? 'Megosztás leállítása' : 'Képernyő'}</span>
        </button>

        {/* Whiteboard / Paint button */}
        <button
          onClick={() => setSubView(subView === 'whiteboard' ? 'stage' : 'whiteboard')}
          title="Közös Paint Rajztábla"
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-sm transition shadow ${
            subView === 'whiteboard'
              ? 'bg-discord-primary text-white shadow-lg'
              : 'bg-discord-dark hover:bg-discord-hover text-discord-textHeader'
          }`}
        >
          <Paintbrush className="w-5 h-5 text-discord-yellow" />
          <span>Paint {whiteboards.length > 0 ? `(${whiteboards.length})` : ''}</span>
        </button>

        {/* Code Editor button */}
        <button
          onClick={() => setSubView(subView === 'code' ? 'stage' : 'code')}
          title="Közös Kód Editor"
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-sm transition shadow ${
            subView === 'code'
              ? 'bg-discord-primary text-white shadow-lg'
              : 'bg-discord-dark hover:bg-discord-hover text-discord-textHeader'
          }`}
        >
          <Code2 className="w-5 h-5 text-cyan-400" />
          <span>Kód Editor</span>
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
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-sm transition shadow ${
            subView === 'casino'
              ? 'bg-gradient-to-r from-amber-600 to-yellow-600 text-white shadow-lg shadow-amber-600/30'
              : casinoSession?.active
              ? 'bg-amber-600/20 border border-amber-500/50 text-amber-300 hover:bg-amber-600/30'
              : 'bg-discord-dark hover:bg-discord-hover text-discord-textHeader'
          }`}
        >
          <span className="text-base">🎰</span>
          <span>{casinoSession?.active ? 'Kaszinó (Élő)' : 'Kaszinó'}</span>
        </button>

        {/* Watch Together (Közös Mozi) button */}
        <button
          onClick={() => setSubView(subView === 'watch' ? 'stage' : 'watch')}
          title={watchState?.active ? 'Közös Mozi megnyitása' : 'Közös Mozi (YouTube & CineHD) indítása'}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-sm transition shadow ${
            subView === 'watch'
              ? 'bg-gradient-to-r from-rose-600 to-indigo-600 text-white shadow-lg shadow-rose-600/30'
              : watchState?.active
              ? 'bg-rose-600/20 border border-rose-500/50 text-rose-300 hover:bg-rose-600/30 animate-pulse'
              : 'bg-discord-dark hover:bg-discord-hover text-discord-textHeader'
          }`}
        >
          <span className="text-base">🍿</span>
          <span>{watchState?.active ? 'Mozi (Élő)' : 'Mozi'}</span>
        </button>

        {/* Speed Test button */}
        <button
          onClick={onOpenSpeedTest}
          title="Net Sebességteszt (Speed Test)"
          className="flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-sm transition shadow bg-discord-dark hover:bg-discord-hover text-discord-textHeader"
        >
          <Activity className="w-5 h-5 text-discord-primary animate-pulse" />
          <span>Net Teszt</span>
        </button>

        {/* Disconnect button */}
        <button
          onClick={onDisconnect}
          title="Kapcsolat bontása (Kilépés)"
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-discord-red hover:bg-red-600 text-white font-semibold text-sm transition shadow"
        >
          <PhoneOff className="w-5 h-5" />
          <span>Kilépés</span>
        </button>
      </div>
    </div>
  );
}
