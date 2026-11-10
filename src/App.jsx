import React, { useState, useEffect, lazy, Suspense } from 'react';
import { socket } from './socket';
import ChannelSidebar from './components/ChannelSidebar';
import ChatArea from './components/ChatArea';
import VoiceRoomView from './components/VoiceRoomView';
import UserListSidebar from './components/UserListSidebar';
import LoginModal from './components/LoginModal';
import EditProfileModal from './components/EditProfileModal';
import SpeedTestModal from './components/SpeedTestModal';
import AutoplayBanner from './components/AutoplayBanner';
import SpeedTestRequestToast from './components/SpeedTestRequestToast';
import AdminPanel from './components/AdminPanel';
import GameAnalysisView from './components/GameAnalysisView';
const MiskolcEmpireView = lazy(() => import('./components/miskolcEmpire/MiskolcEmpireView'));
const MiskolcPhobiaView = lazy(() => import('./components/phobia/MiskolcPhobiaView'));
import { ShieldCheck } from 'lucide-react';
import { useAuth } from './hooks/useAuth';
import { useServerData } from './hooks/useServerData';
import { useDirectMessages, dmKeyFor } from './hooks/useDirectMessages';
import { useVoice } from './hooks/useVoice';
import { useRoomActivities } from './hooks/useRoomActivities';
import { useSpeedTest } from './hooks/useSpeedTest';
import { useCall } from './hooks/useCall';
import IncomingCallModal from './components/call/IncomingCallModal';
import CallScreen from './components/call/CallScreen';
import AudioSettings from './components/call/AudioSettings';
import CallHistory from './components/call/CallHistory';

export default function App() {
  const [viewMode, setViewMode] = useState('chat'); // 'chat' | 'voice' | 'analysis' | 'empire' | 'phobia'
  const [showUserList, setShowUserList] = useState(window.innerWidth >= 1024);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [callMinimized, setCallMinimized] = useState(false);
  const [showCallSettings, setShowCallSettings] = useState(false);
  const [showCallHistory, setShowCallHistory] = useState(false);

  const auth = useAuth(socket);
  const { currentUser } = auth;
  const server = useServerData(socket, auth.currentUserRef);
  const dm = useDirectMessages(socket, auth.currentUserRef);
  const speedTest = useSpeedTest(socket);

  const voice = useVoice(socket, {
    onScreenShareStart: () => setViewMode('voice'),
    onLeft: () => {
      activities.resetRoomState();
      setViewMode((mode) => (mode === 'voice' ? 'chat' : mode));
    }
  });
  const { activeVoiceChannel } = voice;

  // DM hanghívás. A hangszobából automatikusan kilépünk, mert egyszerre csak egy mikrofon-munkamenet él.
  const callApi = useCall(socket, auth.currentUserRef, {
    onBeforeCall: () => { if (activeVoiceChannel) voice.leaveChannel(); }
  });
  const { call } = callApi;
  // Hívás közben nem lehet hangszobába lépni (egy mikrofon, egy aktív hangkapcsolat)
  const joinVoiceChannel = (id) => {
    if (callApi.isInCall) {
      window.alert('Hívás közben nem csatlakozhatsz hangcsatornához. Fejezd be a hívást először.');
      return;
    }
    voice.joinChannel(id);
  };
  useEffect(() => { if (!call) setCallMinimized(false); }, [call]);
  const activities = useRoomActivities(socket, currentUser, activeVoiceChannel);

  // Minden eseménykezelő bekötése UTÁN csatlakozunk, így nem veszhet el az első üzenet
  useEffect(() => {
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, []);

  const handleLogout = () => {
    if (activeVoiceChannel) voice.leaveChannel();
    auth.logout();
  };

  const handleStartDm = (partner) => {
    if (!partner) return;
    dm.startDm(partner);
    setViewMode('chat');
  };

  const closeMobileSidebar = () => setMobileSidebarOpen(false);
  const openSpeedTest = () => speedTest.setIsOpen(true);

  const currentChannel = server.textChannels.find((ch) => ch.id === server.activeTextChannel);
  const currentVoiceChannel = server.voiceChannels.find((vc) => vc.id === activeVoiceChannel);
  const voiceParticipants = activeVoiceChannel ? server.voiceStates[activeVoiceChannel] || [] : [];

  const chatMessages =
    dm.activeDmPartner && currentUser
      ? dm.dmMessages[dmKeyFor(currentUser.username, dm.activeDmPartner.username)] || []
      : server.messages[server.activeTextChannel] || [];

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden select-none" style={{ background: '#090A18', color: '#F4F3FF' }}>
      {voice.autoplayBlocked && <AutoplayBanner onUnlock={voice.unlockAllAudio} />}

      <div className="flex flex-1 w-full overflow-hidden relative">
        {!auth.isLoggedIn && <LoginModal onLogin={auth.login} authError={auth.authError} />}

        {auth.isProfileModalOpen && (
          <EditProfileModal
            currentUser={currentUser}
            onSave={auth.updateProfile}
            onClose={() => auth.setIsProfileModalOpen(false)}
            error={auth.profileError}
          />
        )}

        {/* Mobil háttér a bal oldali sávhoz */}
        {mobileSidebarOpen && (
          <div
            onClick={closeMobileSidebar}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden transition-opacity animate-in fade-in"
          />
        )}

        {/* Csatornasáv (mobilon kicsúszó, asztali nézetben oszlop) */}
        {currentUser && (
          <div style={{ background: '#101329' }} className={`fixed inset-y-0 left-0 z-40 max-w-[85vw] pt-safe pb-safe md:pt-0 md:pb-0 md:max-w-none transform transition-transform duration-200 ease-in-out shadow-2xl md:shadow-none md:relative md:translate-x-0 ${
            mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}>
            <ChannelSidebar
              user={currentUser}
              textChannels={server.textChannels}
              voiceChannels={server.voiceChannels}
              activeTextChannel={dm.activeDmPartner ? null : server.activeTextChannel}
              onSelectTextChannel={(id) => {
                server.setActiveTextChannel(id);
                dm.setActiveDmPartner(null);
                setViewMode('chat');
                closeMobileSidebar();
              }}
              activeVoiceChannel={activeVoiceChannel}
              onJoinVoiceChannel={(id) => {
                joinVoiceChannel(id);
                closeMobileSidebar();
              }}
              onLeaveVoiceChannel={voice.leaveChannel}
              voiceStates={server.voiceStates}
              isMuted={voice.isMuted}
              isDeafened={voice.isDeafened}
              onToggleMute={voice.toggleMute}
              onToggleDeafen={voice.toggleDeafen}
              isScreenSharing={voice.isScreenSharing}
              onToggleScreenShare={voice.toggleScreenShare}
              onOpenVoiceView={() => {
                setViewMode('voice');
                closeMobileSidebar();
              }}
              isAnalysisActive={viewMode === 'analysis'}
              onOpenAnalysis={() => {
                setViewMode('analysis');
                closeMobileSidebar();
              }}
              isEmpireActive={viewMode === 'empire'}
              onOpenEmpire={() => {
                setViewMode('empire');
                closeMobileSidebar();
              }}
              empireSessions={activities.empireSessions}
              isPhobiaActive={viewMode === 'phobia'}
              onOpenPhobia={() => {
                setViewMode('phobia');
                closeMobileSidebar();
              }}
              phobiaSessions={activities.phobiaSessions}
              casinoSessions={activities.casinoSessions}
              watchSessions={activities.watchSessions}
              chessSessions={activities.chessSessions}
              browserSessions={activities.browserSessions}
              dmPartners={dm.dmPartners}
              activeDmPartnerId={dm.activeDmPartner?.id}
              onSelectDmPartner={handleStartDm}
              onOpenProfile={() => auth.setIsProfileModalOpen(true)}
              onLogout={handleLogout}
              onCloseMobile={closeMobileSidebar}
            />
          </div>
        )}

        {/* Központi nézet: hangszoba vagy csevegés */}
        {viewMode === 'analysis' ? (
          <GameAnalysisView onClose={() => setViewMode('chat')} />
        ) : viewMode === 'empire' ? (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-sm" style={{ color: '#999BBE' }}>MiskolcEmpire betöltése...</div>}>
            <MiskolcEmpireView socket={socket} currentUser={currentUser} onClose={() => setViewMode('chat')} />
          </Suspense>
        ) : viewMode === 'phobia' ? (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-sm" style={{ color: '#999BBE' }}>A MÉH Telep betöltése (MiskolcPhobia)...</div>}>
            <MiskolcPhobiaView
              socket={socket}
              channelId={activeVoiceChannel || 'phobia_lobby'}
              currentUser={currentUser}
              session={activities.phobiaSessions[activeVoiceChannel || 'phobia_lobby']}
              onClose={() => setViewMode(activeVoiceChannel ? 'voice' : 'chat')}
            />
          </Suspense>
        ) : viewMode === 'voice' && activeVoiceChannel ? (
          <VoiceRoomView
            channel={currentVoiceChannel}
            participants={voiceParticipants}
            currentUserId={currentUser?.id}
            currentUser={currentUser}
            socket={socket}
            isMuted={voice.isMuted}
            isDeafened={voice.isDeafened}
            isScreenSharing={voice.isScreenSharing}
            localScreenStream={voice.localScreenStream}
            remoteScreenStreams={voice.remoteScreenStreams}
            isCameraOn={voice.isCameraOn}
            localCameraStream={voice.localCameraStream}
            remoteCameraStreams={voice.remoteCameraStreams}
            onToggleCamera={voice.toggleCamera}
            whiteboards={activities.whiteboards}
            activeWhiteboardId={activities.activeWhiteboardId}
            onSelectWhiteboard={activities.selectWhiteboard}
            onCreateWhiteboard={activities.createWhiteboard}
            onDeleteWhiteboard={activities.deleteWhiteboard}
            codeTreeData={activities.codeTreeData}
            onCodeLocalChange={activities.applyLocalCodeChange}
            casinoSession={activities.casinoSessions[activeVoiceChannel]}
            onStartCasino={activities.startCasino}
            onStopCasino={activities.stopCasino}
            watchState={activities.watchSessions[activeVoiceChannel]}
            chessSession={activities.chessSessions[activeVoiceChannel]}
            empireSession={activities.empireSessions[activeVoiceChannel]}
            phobiaSession={activities.phobiaSessions[activeVoiceChannel]}
            onStartPhobia={activities.startPhobia}
            onStopPhobia={activities.stopPhobia}
            onStartChess={activities.startChess}
            onJoinChess={activities.joinChess}
            onMoveChess={activities.moveChess}
            onResignChess={activities.resignChess}
            onRematchChess={activities.rematchChess}
            onStopChess={activities.stopChess}
            gameSession={activities.gameSessions[activeVoiceChannel]}
            setPeerVolume={voice.setPeerVolume}
            browserSession={activities.browserSessions[activeVoiceChannel]}
            onStartBrowser={activities.startBrowser}
            onNavigateBrowser={activities.navigateBrowser}
            onBrowserBack={activities.browserBack}
            onBrowserForward={activities.browserForward}
            onBrowserReload={activities.browserReload}
            onBrowserReset={activities.browserReset}
            onSetBrowserMode={activities.setBrowserMode}
            onTakeBrowserControl={activities.takeBrowserControl}
            onReleaseBrowserControl={activities.releaseBrowserControl}
            onStopBrowser={activities.stopBrowser}
            onToggleMute={voice.toggleMute}
            onToggleDeafen={voice.toggleDeafen}
            onToggleScreenShare={voice.toggleScreenShare}
            onOpenSpeedTest={openSpeedTest}
            onDisconnect={voice.leaveChannel}
            onClose={() => setViewMode('chat')}
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          />
        ) : (
          <ChatArea
            isDm={!!dm.activeDmPartner}
            dmPartner={dm.activeDmPartner}
            channel={dm.activeDmPartner ? null : currentChannel}
            messages={chatMessages}
            onSendMessage={dm.activeDmPartner ? dm.sendDmMessage : server.sendMessage}
            onReportMessage={dm.activeDmPartner ? dm.reportMessage : undefined}
            currentUsername={currentUser?.username}
            onToggleUserList={() => setShowUserList((v) => !v)}
            showUserList={showUserList}
            onJoinVoiceChannel={joinVoiceChannel}
            activeVoiceChannel={activeVoiceChannel}
            onOpenSpeedTest={openSpeedTest}
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
            onStartCall={dm.activeDmPartner ? callApi.startCall : undefined}
            callBusy={callApi.isInCall}
            onOpenCallSettings={() => setShowCallSettings(true)}
            onOpenCallHistory={() => setShowCallHistory(true)}
          />
        )}

        {/* Jobb oldali felhasználólista */}
        {showUserList && (
          <>
            <div
              onClick={() => setShowUserList(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden transition-opacity animate-in fade-in"
            />
            <div className="fixed inset-y-0 right-0 z-40 max-w-[85vw] pt-safe pb-safe lg:pt-0 lg:pb-0 lg:max-w-none lg:relative lg:translate-x-0 shadow-2xl lg:shadow-none animate-in slide-in-from-right duration-200"
              style={{ background: '#101329' }}>
              <UserListSidebar
                users={server.onlineUsers}
                currentUserId={currentUser?.id}
                onStartDm={handleStartDm}
                onOpenProfile={() => auth.setIsProfileModalOpen(true)}
                onOpenSpeedTest={openSpeedTest}
                onClose={() => setShowUserList(false)}
              />
            </div>
          </>
        )}

        {/* Admin menü: a gomb csak admin jogú felhasználónak jelenik meg (a szerver is ellenőrzi) */}
        {currentUser?.isAdmin && (
          <>
            <button
              onClick={() => setIsAdminOpen(true)}
              title="Admin menü"
              className="fixed bottom-3 right-3 z-50 p-2.5 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full shadow-lg transition active:scale-95"
              style={{ background: '#1B2040', color: '#F5B041', border: '1px solid rgba(245, 176, 65, 0.4)' }}
            >
              <ShieldCheck className="w-5 h-5" />
            </button>
            {isAdminOpen && (
              <AdminPanel
                socket={socket}
                channelId={activeVoiceChannel}
                currentUser={currentUser}
                onClose={() => setIsAdminOpen(false)}
              />
            )}
          </>
        )}

        {/* DM hanghívás: bejövő hívás, kimenő/aktív hívás, beállítások, előzmények */}
        {call && call.direction === 'incoming' && call.status === 'ringing' && (
          <IncomingCallModal call={call} onAccept={callApi.acceptCall} onDecline={callApi.declineCall} />
        )}
        {call && !(call.direction === 'incoming' && call.status === 'ringing') && (
          <CallScreen
            call={call}
            minimized={callMinimized}
            onToggleMinimize={() => setCallMinimized((v) => !v)}
            onOpenSettings={() => setShowCallSettings(true)}
            onDismiss={callApi.dismiss}
            controls={{
              callApi,
              onToggleMute: callApi.toggleMute,
              onEnd: callApi.endCall,
              onRetryAudio: callApi.retryAudio
            }}
          />
        )}
        {showCallSettings && <AudioSettings call={callApi} onClose={() => setShowCallSettings(false)} />}
        {showCallHistory && dm.activeDmPartner && (
          <CallHistory
            socket={socket}
            partner={dm.activeDmPartner}
            myUsername={currentUser?.username}
            onCallAgain={callApi.startCall}
            callDisabled={callApi.isInCall}
            onClose={() => setShowCallHistory(false)}
          />
        )}

        <SpeedTestModal
          isOpen={speedTest.isOpen}
          onClose={() => speedTest.setIsOpen(false)}
          socket={socket}
          currentUser={currentUser}
          onlineUsers={server.onlineUsers}
          onRequestUserTest={speedTest.requestUserTest}
          onShareResultToChat={(text) => server.sendMessage(text)}
        />

        {speedTest.requestToast && (
          <SpeedTestRequestToast
            requesterName={speedTest.requestToast.requesterName}
            onAccept={() => {
              speedTest.setRequestToast(null);
              openSpeedTest();
            }}
            onDismiss={() => speedTest.setRequestToast(null)}
          />
        )}
      </div>
    </div>
  );
}
