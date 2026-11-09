import React, { useState, lazy, Suspense } from 'react';
import WhiteboardView from './WhiteboardView';
import CodeEditorView from './CodeEditorView';
import CasinoView from './CasinoView';
import WatchPartyView from './WatchPartyView';
import ChessView from './ChessView';
import BrowserView from './BrowserView';

// A 3D motor csak a játék megnyitásakor töltődik le
const GameView = lazy(() => import('./game/GameView'));
const MiskolcEmpireView = lazy(() => import('./miskolcEmpire/MiskolcEmpireView'));
import RoomTopBar from './voiceRoom/RoomTopBar';
import RoomControlBar from './voiceRoom/RoomControlBar';
import ActivityBanners from './voiceRoom/ActivityBanners';
import ParticipantGrid from './voiceRoom/ParticipantGrid';
import ScreenShareStage from './voiceRoom/ScreenShareStage';
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
  onStartChess,
  onJoinChess,
  onMoveChess,
  onResignChess,
  onRematchChess,
  onStopChess,
  gameSession,
  setPeerVolume,
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
        browserActive={!!browserSession?.active}
        gameActive={!!gameSession}
        onClose={onClose}
        onOpenMobileSidebar={onOpenMobileSidebar}
      />

      <ActivityBanners
        subView={subView}
        watchState={watchState}
        casinoSession={casinoSession}
        chessSession={chessSession}
        empireSession={empireSession}
        browserSession={browserSession}
        gameSession={gameSession}
        onOpen={setSubView}
      />

      {renderMain()}

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
