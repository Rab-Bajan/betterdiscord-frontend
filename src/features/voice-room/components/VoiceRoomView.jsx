import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import WhiteboardView from '../../activities/whiteboard/components/WhiteboardView';
import CodeEditorView from '../../activities/code-editor/components/CodeEditorView';
import CasinoView from '../../games/casino/components/CasinoView';
import WatchPartyView from '../../activities/watch-party/components/WatchPartyView';
import ChessView from '../../games/chess/components/ChessView';
import BrowserView from '../../activities/browser/components/BrowserView';

// A 3D motor csak a játék megnyitásakor töltődik le
const GameView = lazy(() => import('../../games/arena/components/GameView'));
const MiskolcEmpireView = lazy(() => import('../../games/empire/components/MiskolcEmpireView'));
const MiskolcPhobiaView = lazy(() => import('../../games/phobia/components/MiskolcPhobiaView'));
import RoomTopBar from './RoomTopBar';
import RoomControlBar from './RoomControlBar';
import ActivityBanners from './ActivityBanners';
import ParticipantGrid from './ParticipantGrid';
import ScreenShareStage from './ScreenShareStage';
import { useScreenSharers } from '../hooks/useScreenSharers';

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
  isCameraOn,
  localCameraStream,
  remoteCameraStreams = new Map(),
  onToggleCamera,
  whiteboards = [],
  activeWhiteboardId,
  onSelectWhiteboard,
  onCreateWhiteboard,
  onDeleteWhiteboard,
  codeTreeData,
  onCodeLocalChange,
  casinoSession,
  onStartCasino,
  onStopCasino,
  watchState,
  chessSession,
  empireSession,
  phobiaSession,
  onStartChess,
  onJoinChess,
  onMoveChess,
  onResignChess,
  onRematchChess,
  onStopChess,
  gameSession,
  setPeerVolume,
  setPeerSpatial,
  browserSession,
  onStartBrowser,
  onNavigateBrowser,
  onBrowserBack,
  onBrowserForward,
  onBrowserReload,
  onBrowserReset,
  onSetBrowserMode,
  onTakeBrowserControl,
  onReleaseBrowserControl,
  onStopBrowser,
  onToggleMute,
  onToggleDeafen,
  onToggleScreenShare,
  onOpenSpeedTest,
  onDisconnect,
  onClose,
  onOpenMobileSidebar
}) {
  // 'stage' | 'whiteboard' | 'code' | 'casino' | 'watch' | 'chess' | 'empire' | 'browser'
  const [subView, setSubView] = useState('stage');
  const backToStage = () => setSubView('stage');

  // Teljes képernyő a játékokhoz / aktivitásokhoz (a böngészőnek saját gombja van)
  const mainRef = useRef(null);
  const [isMainFullscreen, setIsMainFullscreen] = useState(false);
  const canFullscreen = subView !== 'stage' && subView !== 'browser';

  useEffect(() => {
    const onChange = () => setIsMainFullscreen(document.fullscreenElement === mainRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleMainFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else mainRef.current?.requestFullscreen?.().catch(() => {});
  };

  // Ha elhagyjuk a nézetet, kilépünk a teljes képernyőből
  useEffect(() => {
    if (!canFullscreen && document.fullscreenElement === mainRef.current) {
      document.exitFullscreen?.().catch(() => {});
    }
  }, [canFullscreen]);

  // A MiskolcPhobia megnyitásakor megpróbálunk teljes képernyőre váltani (a böngésző elutasíthatja)
  useEffect(() => {
    if (subView === 'phobia' && !document.fullscreenElement) {
      mainRef.current?.requestFullscreen?.().catch(() => {});
    }
  }, [subView]);
  const toggleView = (view) => setSubView((current) => (current === view ? 'stage' : view));

  const sharers = useScreenSharers({
    participants,
    currentUserId,
    isScreenSharing,
    localScreenStream,
    remoteScreenStreams
  });

  // A saját kamera tükrözve, a többieké a beérkező stream
  const getCameraStream = (p) =>
    p.id === currentUserId ? (isCameraOn ? localCameraStream : null) : remoteCameraStreams.get(p.id) || null;

  const channelId = channel?.id;
  const channelName = channel?.name;

  const renderMain = () => {
    switch (subView) {
      case 'game':
        return (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-sm" style={{ color: '#999BBE' }}>Játék betöltése...</div>}>
            <GameView socket={socket} channelId={channelId} isAdmin={currentUser?.isAdmin === true} participants={participants} setPeerVolume={setPeerVolume} />
          </Suspense>
        );
      case 'browser':
        return (
          <BrowserView
            channelId={channelId}
            channelName={channelName}
            currentUser={currentUser}
            socket={socket}
            session={browserSession}
            onClose={backToStage}
            onStart={onStartBrowser}
            onNavigate={onNavigateBrowser}
            onBack={onBrowserBack}
            onForward={onBrowserForward}
            onReload={onBrowserReload}
            onReset={onBrowserReset}
            onSetMode={onSetBrowserMode}
            onTakeControl={onTakeBrowserControl}
            onReleaseControl={onReleaseBrowserControl}
            onStop={onStopBrowser}
          />
        );
      case 'empire':
        return (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-sm" style={{ color: '#999BBE' }}>MiskolcEmpire betöltése...</div>}>
            <MiskolcEmpireView socket={socket} currentUser={currentUser} channelId={channelId} channelSession={empireSession} onClose={backToStage} />
          </Suspense>
        );
      case 'phobia':
        return (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-sm" style={{ color: '#999BBE' }}>A MÉH Telep betöltése (MiskolcPhobia)...</div>}>
            <MiskolcPhobiaView
              socket={socket}
              channelId={channelId}
              currentUser={currentUser}
              session={phobiaSession}
              setPeerSpatial={setPeerSpatial}
              onClose={backToStage}
            />
          </Suspense>
        );
      case 'chess':
        return (
          <ChessView
            session={chessSession}
            currentUser={currentUser}
            channelId={channelId}
            channelName={channelName}
            onStart={onStartChess}
            onJoin={onJoinChess}
            onMove={onMoveChess}
            onResign={onResignChess}
            onRematch={onRematchChess}
            onStop={onStopChess}
            onClose={backToStage}
          />
        );
      case 'watch':
        return (
          <WatchPartyView
            channelId={channelId}
            channelName={channelName}
            currentUser={currentUser}
            socket={socket}
            watchState={watchState}
            onClose={backToStage}
          />
        );
      case 'casino':
        return (
          <CasinoView
            channelId={channelId}
            channelName={channelName}
            currentUser={currentUser}
            session={casinoSession}
            onStartSession={onStartCasino}
            onStopSession={onStopCasino}
            onClose={backToStage}
          />
        );
      case 'code':
        return (
          <CodeEditorView
            channelId={channelId}
            socket={socket}
            currentUser={currentUser}
            treeData={codeTreeData}
            onLocalChange={onCodeLocalChange}
            onClose={backToStage}
          />
        );
      case 'whiteboard':
        return (
          <WhiteboardView
            channelId={channelId}
            socket={socket}
            currentUser={currentUser}
            whiteboards={whiteboards}
            activeBoardId={activeWhiteboardId}
            onSelectBoard={onSelectWhiteboard}
            onCreateBoard={onCreateWhiteboard}
            onDeleteBoard={onDeleteWhiteboard}
            onClose={backToStage}
          />
        );
      default:
        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden p-2 sm:p-4">
            {sharers.activeStream ? (
              <ScreenShareStage
                participants={participants}
                currentUserId={currentUserId}
                stream={sharers.activeStream}
                sharer={sharers.activeSharer}
                selectedSharerId={sharers.selectedSharerId}
                onSelectSharer={sharers.setSelectedSharerId}
                isSharing={sharers.isSharing}
                isDeafened={isDeafened}
                getCameraStream={getCameraStream}
              />
            ) : (
              <ParticipantGrid
                participants={participants}
                currentUserId={currentUserId}
                onOpenSpeedTest={onOpenSpeedTest}
                getCameraStream={getCameraStream}
              />
            )}
          </div>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full relative select-none min-w-0 max-w-full overflow-hidden" style={{ background: '#090A18' }}>
      <RoomTopBar
        channel={channel}
        participantCount={participants.length}
        sharerCount={sharers.screenSharers.length}
        subView={subView}
        onChangeView={setSubView}
        whiteboardCount={whiteboards.length}
        casinoActive={!!casinoSession?.active}
        watchActive={!!watchState?.active}
        chessActive={!!chessSession?.active}
        empireActive={!!empireSession?.active}
        phobiaActive={!!phobiaSession?.active}
        browserActive={!!browserSession?.active}
        gameActive={!!gameSession}
        onClose={onClose}
        onOpenMobileSidebar={onOpenMobileSidebar}
      />

      <ActivityBanners
        subView={subView}
        phobiaSession={phobiaSession}
        watchState={watchState}
        casinoSession={casinoSession}
        chessSession={chessSession}
        empireSession={empireSession}
        browserSession={browserSession}
        gameSession={gameSession}
        onOpen={setSubView}
      />

      <div
        ref={mainRef}
        className="flex-1 flex flex-col min-h-0 min-w-0 relative overflow-hidden"
        style={{ background: '#090A18' }}
      >
        {renderMain()}
        {canFullscreen && (
          <button
            type="button"
            onClick={toggleMainFullscreen}
            title={isMainFullscreen ? 'Kilépés a teljes képernyőből' : 'Teljes képernyő'}
            aria-label={isMainFullscreen ? 'Kilépés a teljes képernyőből' : 'Teljes képernyő'}
            className="absolute top-2 right-2 z-[70] p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white/80 hover:text-white border border-white/10 transition"
          >
            {isMainFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        )}
      </div>

      <RoomControlBar
        subView={subView}
        onToggleView={toggleView}
        isMuted={isMuted}
        isDeafened={isDeafened}
        isScreenSharing={isScreenSharing}
        isCameraOn={isCameraOn}
        onToggleCamera={onToggleCamera}
        whiteboardCount={whiteboards.length}
        casinoActive={!!casinoSession?.active}
        watchActive={!!watchState?.active}
        chessActive={!!chessSession?.active}
        empireActive={!!empireSession?.active}
        browserActive={!!browserSession?.active}
        gameActive={!!gameSession}
        onToggleMute={onToggleMute}
        onToggleDeafen={onToggleDeafen}
        onToggleScreenShare={onToggleScreenShare}
        onStartCasino={onStartCasino}
        onOpenSpeedTest={onOpenSpeedTest}
        onDisconnect={onDisconnect}
      />
    </div>
  );
}
