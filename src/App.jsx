import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import ServerSidebar from './components/ServerSidebar';
import ChannelSidebar from './components/ChannelSidebar';
import ChatArea from './components/ChatArea';
import VoiceRoomView from './components/VoiceRoomView';
import UserListSidebar from './components/UserListSidebar';
import LoginModal from './components/LoginModal';
import WhiteboardView from './components/WhiteboardView';
import SpeedTestModal from './components/SpeedTestModal';
import {
  playJoinSound,
  playLeaveSound,
  playMuteSound,
  playMessageSound
} from './sounds';
import { Activity, X } from 'lucide-react';

const SOCKET_URL = window.location.origin;

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const [textChannels, setTextChannels] = useState([
    { id: 'altalanos', name: 'általános', description: 'Általános beszélgetés minden témáról' },
    { id: 'gaming', name: 'gaming', description: 'Játék megbeszélések és tippek' },
    { id: 'zene', name: 'zene-és-klipek', description: 'Kedvenc zenék és videók' }
  ]);
  const [voiceChannels, setVoiceChannels] = useState([
    { id: 'hang-altalanos', name: 'Általános Hang', userLimit: 10 },
    { id: 'hang-gaming-1', name: 'Gaming 1 (Squad)', userLimit: 5 },
    { id: 'hang-chill', name: 'Chill & Dumcsi', userLimit: 15 }
  ]);

  const [activeTextChannel, setActiveTextChannel] = useState('altalanos');
  const [activeVoiceChannel, setActiveVoiceChannel] = useState(null);
  const [messages, setMessages] = useState({});
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [voiceStates, setVoiceStates] = useState({});

  const [viewMode, setViewMode] = useState('chat'); // 'chat' | 'voice'
  const [showUserList, setShowUserList] = useState(true);

  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);

  // Képernyőmegosztás állapotok
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localScreenStream, setLocalScreenStream] = useState(null);
  const [remoteScreenStreams, setRemoteScreenStreams] = useState(new Map()); // peerId -> MediaStream

  // Közös Paint / Rajztábla állapotok
  const [whiteboards, setWhiteboards] = useState([]);
  const [activeWhiteboardId, setActiveWhiteboardId] = useState(null);

  // Net Sebességteszt állapotok
  const [isSpeedTestOpen, setIsSpeedTestOpen] = useState(false);
  const [speedTestRequestToast, setSpeedTestRequestToast] = useState(null);

  // Közös Kód Editor állapotok
  const [codeTreeData, setCodeTreeData] = useState(null);

  // 3D Velvet Room Kaszinó állapotok: channelId -> session
  const [casinoSessions, setCasinoSessions] = useState({});

  // Referenciák
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peersRef = useRef(new Map()); // peerId -> { pc, audioEl }
  const screenSendersRef = useRef(new Map()); // peerId -> RTCRtpSender
  const audioContainerRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const speakingIntervalRef = useRef(null);
  const isSpeakingRef = useRef(false);

  // Audio konténer
  useEffect(() => {
    const div = document.createElement('div');
    div.id = 'webrtc-audio-container';
    div.style.display = 'none';
    document.body.appendChild(div);
    audioContainerRef.current = div;

    return () => {
      div.remove();
    };
  }, []);

  // Socket kapcsolat inicializálása
  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    socket.on('init:data', (data) => {
      setCurrentUser(data.self);
      if (data.textChannels) setTextChannels(data.textChannels);
      if (data.voiceChannels) setVoiceChannels(data.voiceChannels);
      if (data.channelMessages) setMessages(data.channelMessages);
      if (data.voiceStates) setVoiceStates(data.voiceStates);
      if (data.onlineUsers) setOnlineUsers(data.onlineUsers);
      if (data.casinoSessions) setCasinoSessions(data.casinoSessions);
    });

    socket.on('users:updated', (users) => {
      setOnlineUsers(users);
    });

    socket.on('voice:states-updated', (states) => {
      setVoiceStates(states);
    });

    socket.on('chat:new-message', (newMsg) => {
      setMessages((prev) => {
        const chList = prev[newMsg.channelId] || [];
        return {
          ...prev,
          [newMsg.channelId]: [...chList, newMsg]
        };
      });

      if (currentUser && newMsg.senderId !== currentUser.id) {
        playMessageSound();
      }
    });

    // WebRTC Szignálozás és események
    socket.on('voice:joined', async ({ channelId, peers }) => {
      console.log(`[WebRTC] Beléptünk a(z) ${channelId} szobába, meglévő partnerek:`, peers);
      for (const peer of peers) {
        await initiatePeerConnection(peer.id);
      }
    });

    socket.on('voice:peer-joined', ({ peerId, user }) => {
      console.log(`[WebRTC] Új partner csatlakozott a szobához:`, user);
    });

    socket.on('voice:peer-left', ({ peerId }) => {
      console.log(`[WebRTC] Partner kilépett:`, peerId);
      cleanupPeer(peerId);
      setRemoteScreenStreams((prev) => {
        const updated = new Map(prev);
        updated.delete(peerId);
        return updated;
      });
      screenSendersRef.current.delete(peerId);
    });

    socket.on('voice:user-speaking', ({ userId, isSpeaking }) => {
      setVoiceStates((prev) => {
        const updated = { ...prev };
        for (const ch in updated) {
          updated[ch] = updated[ch].map((u) =>
            u.id === userId ? { ...u, isSpeaking } : u
          );
        }
        return updated;
      });
    });

    socket.on('voice:user-screen-sharing', ({ userId, isSharing }) => {
      if (!isSharing) {
        setRemoteScreenStreams((prev) => {
          const updated = new Map(prev);
          updated.delete(userId);
          return updated;
        });
      }
    });

    // Whiteboard socket események
    socket.on('whiteboard:list', (list) => {
      setWhiteboards(list);
      if (list.length > 0) {
        setActiveWhiteboardId((prev) => {
          if (!prev || !list.some((b) => b.id === prev)) {
            return list[0].id;
          }
          return prev;
        });
      } else {
        setActiveWhiteboardId(null);
      }
    });

    socket.on('whiteboard:created', ({ board }) => {
      setActiveWhiteboardId(board.id);
    });

    socket.on('whiteboard:deleted', ({ boardId }) => {
      setWhiteboards((prev) => {
        const updated = prev.filter((b) => b.id !== boardId);
        setActiveWhiteboardId((curr) => {
          if (curr === boardId) {
            return updated[0]?.id || null;
          }
          return curr;
        });
        return updated;
      });
    });

    // Sebességteszt események
    socket.on('speedtest:requested-by', ({ requesterId, requesterName }) => {
      setSpeedTestRequestToast({ requesterName });
    });

    socket.on('speedtest:result-announced', ({ userId, username, result }) => {
      setOnlineUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, speedTest: result } : u))
      );
    });

    // Kód Editor események
    socket.on('code:tree-data', (tree) => {
      setCodeTreeData(tree);
    });

    socket.on('code:file-updated', ({ fileId, content }) => {
      setCodeTreeData((prev) => {
        if (!prev) return prev;
        const updateTree = (node) => {
          if (node.id === fileId && node.type === 'file') {
            return { ...node, content };
          }
          if (node.children) {
            return { ...node, children: node.children.map(updateTree) };
          }
          return node;
        };
        return updateTree(prev);
      });
    });

    // 3D Velvet Room Kaszinó események
    socket.on('casino:session-updated', ({ channelId, session }) => {
      setCasinoSessions((prev) => {
        const next = { ...prev };
        if (session) {
          next[channelId] = session;
        } else {
          delete next[channelId];
        }
        return next;
      });
    });

    socket.on('webrtc:signal', async ({ senderPeerId, signal }) => {
      try {
        if (signal.type === 'offer') {
          await handleReceiveOffer(senderPeerId, signal.sdp);
        } else if (signal.type === 'answer') {
          await handleReceiveAnswer(senderPeerId, signal.sdp);
        } else if (signal.type === 'ice-candidate') {
          await handleReceiveIceCandidate(senderPeerId, signal.candidate);
        }
      } catch (err) {
        console.error('[WebRTC] Szignál hiba:', err);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // WebRTC Kapcsolat kezdeményezése egy peer felé
  const initiatePeerConnection = async (peerId) => {
    try {
      const pc = new RTCPeerConnection(RTC_CONFIG);
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.muted = isDeafened;
      audioContainerRef.current?.appendChild(audioEl);

      peersRef.current.set(peerId, { pc, audioEl });

      // Mikrofon hang hozzáadása
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current);
        });
      }

      // Képernyőmegosztás videó sáv hozzáadása ha épp aktív
      if (screenStreamRef.current) {
        screenStreamRef.current.getVideoTracks().forEach((track) => {
          const sender = pc.addTrack(track, screenStreamRef.current);
          screenSendersRef.current.set(peerId, sender);
        });
      }

      pc.ontrack = (event) => {
        if (event.track.kind === 'audio') {
          console.log(`[WebRTC] Audio stream érkezett peer-től (${peerId})`);
          if (audioEl.srcObject !== event.streams[0]) {
            audioEl.srcObject = event.streams[0];
            audioEl.play().catch(e => console.warn('Audio play warning:', e));
          }
        } else if (event.track.kind === 'video') {
          console.log(`[WebRTC] Video stream (Képernyőmegosztás) érkezett peer-től (${peerId})`);
          const stream = event.streams[0] || new MediaStream([event.track]);
          setRemoteScreenStreams((prev) => new Map(prev).set(peerId, stream));

          event.track.onended = () => {
            setRemoteScreenStreams((prev) => {
              const updated = new Map(prev);
              updated.delete(peerId);
              return updated;
            });
          };
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit('webrtc:signal', {
            targetPeerId: peerId,
            signal: {
              type: 'ice-candidate',
              candidate: event.candidate
            }
          });
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socketRef.current?.emit('webrtc:signal', {
        targetPeerId: peerId,
        signal: {
          type: 'offer',
          sdp: offer
        }
      });
    } catch (err) {
      console.error(`[WebRTC] Hiba kapcsolat kezdeményezésekor (${peerId}):`, err);
    }
  };

  // Érkező Offer kezelése
  const handleReceiveOffer = async (senderPeerId, sdp) => {
    try {
      let peerData = peersRef.current.get(senderPeerId);
      let pc;
      let audioEl;

      if (!peerData) {
        pc = new RTCPeerConnection(RTC_CONFIG);
        audioEl = document.createElement('audio');
        audioEl.autoplay = true;
        audioEl.muted = isDeafened;
        audioContainerRef.current?.appendChild(audioEl);

        peersRef.current.set(senderPeerId, { pc, audioEl });

        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => {
            pc.addTrack(track, localStreamRef.current);
          });
        }

        if (screenStreamRef.current) {
          screenStreamRef.current.getVideoTracks().forEach((track) => {
            const sender = pc.addTrack(track, screenStreamRef.current);
            screenSendersRef.current.set(senderPeerId, sender);
          });
        }

        pc.ontrack = (event) => {
          if (event.track.kind === 'audio') {
            if (audioEl.srcObject !== event.streams[0]) {
              audioEl.srcObject = event.streams[0];
              audioEl.play().catch(e => console.warn('Audio play warning:', e));
            }
          } else if (event.track.kind === 'video') {
            console.log(`[WebRTC] Video stream (Képernyőmegosztás) érkezett offer-ben (${senderPeerId})`);
            const stream = event.streams[0] || new MediaStream([event.track]);
            setRemoteScreenStreams((prev) => new Map(prev).set(senderPeerId, stream));

            event.track.onended = () => {
              setRemoteScreenStreams((prev) => {
                const updated = new Map(prev);
                updated.delete(senderPeerId);
                return updated;
              });
            };
          }
        };

        pc.onicecandidate = (event) => {
          if (event.candidate && socketRef.current) {
            socketRef.current.emit('webrtc:signal', {
              targetPeerId: senderPeerId,
              signal: {
                type: 'ice-candidate',
                candidate: event.candidate
              }
            });
          }
        };
      } else {
        pc = peerData.pc;
      }

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socketRef.current?.emit('webrtc:signal', {
        targetPeerId: senderPeerId,
        signal: {
          type: 'answer',
          sdp: answer
        }
      });
    } catch (err) {
      console.error(`[WebRTC] Hiba offer fogadásakor (${senderPeerId}):`, err);
    }
  };

  const handleReceiveAnswer = async (senderPeerId, sdp) => {
    const peerData = peersRef.current.get(senderPeerId);
    if (peerData && peerData.pc) {
      await peerData.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    }
  };

  const handleReceiveIceCandidate = async (senderPeerId, candidate) => {
    const peerData = peersRef.current.get(senderPeerId);
    if (peerData && peerData.pc) {
      await peerData.pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  };

  const cleanupPeer = (peerId) => {
    const peerData = peersRef.current.get(peerId);
    if (peerData) {
      try {
        peerData.pc.close();
      } catch (e) {}
      if (peerData.audioEl) {
        peerData.audioEl.srcObject = null;
        peerData.audioEl.remove();
      }
      peersRef.current.delete(peerId);
    }
  };

  // Beszédérzékelés (VAD)
  const setupVoiceActivityDetection = (stream) => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.minDecibels = -85;
      analyser.maxDecibels = -10;
      analyser.smoothingTimeConstant = 0.4;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      let speakingCounter = 0;

      speakingIntervalRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;

        const isCurrentlySpeaking = average > 18 && !isMuted;

        if (isCurrentlySpeaking) {
          speakingCounter = 4;
          if (!isSpeakingRef.current) {
            isSpeakingRef.current = true;
            socketRef.current?.emit('voice:speaking', { isSpeaking: true });
          }
        } else {
          if (speakingCounter > 0) {
            speakingCounter--;
          } else if (isSpeakingRef.current) {
            isSpeakingRef.current = false;
            socketRef.current?.emit('voice:speaking', { isSpeaking: false });
          }
        }
      }, 100);
    } catch (e) {
      console.warn('VAD hiba:', e);
    }
  };

  const stopVoiceActivityDetection = () => {
    if (speakingIntervalRef.current) {
      clearInterval(speakingIntervalRef.current);
      speakingIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (isSpeakingRef.current) {
      isSpeakingRef.current = false;
      socketRef.current?.emit('voice:speaking', { isSpeaking: false });
    }
  };

  // KÉPERNYŐMEGOSZTÁS KEZELŐK
  const handleStartScreenShare = async () => {
    if (!activeVoiceChannel) {
      alert('Kérlek előbb lépj be egy hangcsatornába a képernyőmegosztáshoz!');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          frameRate: { ideal: 30, max: 60 }
        },
        audio: true
      });

      screenStreamRef.current = stream;
      setLocalScreenStream(stream);
      setIsScreenSharing(true);
      setViewMode('voice'); // átkapcsolunk a szoba nézetre

      const videoTrack = stream.getVideoTracks()[0];

      // Amikor a felhasználó a böngésző natív felületén leállítja a megosztást
      videoTrack.onended = () => {
        handleStopScreenShare();
      };

      // Továbbítjuk a videó sávot az összes meglévő peer felé és újratárgyalunk
      for (const [peerId, peerData] of peersRef.current.entries()) {
        try {
          const sender = peerData.pc.addTrack(videoTrack, stream);
          screenSendersRef.current.set(peerId, sender);

          const offer = await peerData.pc.createOffer();
          await peerData.pc.setLocalDescription(offer);
          socketRef.current?.emit('webrtc:signal', {
            targetPeerId: peerId,
            signal: { type: 'offer', sdp: offer }
          });
        } catch (e) {
          console.error(`[WebRTC] Hiba képernyő sáv hozzáadásakor (${peerId}):`, e);
        }
      }

      socketRef.current?.emit('voice:screen-share', { isSharing: true });
    } catch (err) {
      console.warn('Képernyőmegosztás megszakítva vagy megtagadva:', err);
    }
  };

  const handleStopScreenShare = async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }
    setLocalScreenStream(null);
    setIsScreenSharing(false);

    // Eltávolítjuk a videó sávokat a peerekből és újratárgyalunk
    for (const [peerId, peerData] of peersRef.current.entries()) {
      const sender = screenSendersRef.current.get(peerId);
      if (sender && peerData.pc && peerData.pc.signalingState !== 'closed') {
        try {
          peerData.pc.removeTrack(sender);
          const offer = await peerData.pc.createOffer();
          await peerData.pc.setLocalDescription(offer);
          socketRef.current?.emit('webrtc:signal', {
            targetPeerId: peerId,
            signal: { type: 'offer', sdp: offer }
          });
        } catch (e) {
          console.warn('[WebRTC] Hiba képernyő sáv visszavonásakor:', e);
        }
      }
      screenSendersRef.current.delete(peerId);
    }

    socketRef.current?.emit('voice:screen-share', { isSharing: false });
  };

  const handleToggleScreenShare = () => {
    if (isScreenSharing) {
      handleStopScreenShare();
    } else {
      handleStartScreenShare();
    }
  };

  // RAJZTÁBLA (PAINT) KEZELŐK
  const handleCreateWhiteboard = (title) => {
    if (socketRef.current && activeVoiceChannel) {
      socketRef.current.emit('whiteboard:create', {
        channelId: activeVoiceChannel,
        title
      });
    }
  };

  const handleDeleteWhiteboard = (boardId) => {
    if (socketRef.current && activeVoiceChannel) {
      socketRef.current.emit('whiteboard:delete', {
        channelId: activeVoiceChannel,
        boardId
      });
    }
  };

  const handleSelectWhiteboard = (boardId) => {
    setActiveWhiteboardId(boardId);
  };

  // 3D KASZINÓ KEZELŐK
  const handleStartCasino = (channelId) => {
    const targetChannel = channelId || activeVoiceChannel;
    if (socketRef.current && targetChannel) {
      socketRef.current.emit('casino:start-session', {
        channelId: targetChannel,
        username: currentUser?.username || 'Felhasználó'
      });
    }
  };

  const handleStopCasino = (channelId) => {
    const targetChannel = channelId || activeVoiceChannel;
    if (socketRef.current && targetChannel) {
      socketRef.current.emit('casino:stop-session', {
        channelId: targetChannel
      });
    }
  };

  // SEBESSÉGTESZT KEZELŐK
  const handleRequestUserSpeedTest = (targetUserId, targetUsername) => {
    if (socketRef.current) {
      socketRef.current.emit('speedtest:request-user', { targetUserId });
      alert(`Sebességteszt kérés sikeresen elküldve ${targetUsername} felhasználónak!`);
    }
  };

  const handleShareSpeedResultToChat = (text) => {
    if (socketRef.current && activeTextChannel) {
      socketRef.current.emit('chat:message', {
        channelId: activeTextChannel,
        text
      });
    }
  };

  // Csatorna és Hang kezelők
  const handleLogin = ({ username, avatarColor }) => {
    if (socketRef.current) {
      socketRef.current.emit('user:join', { username, avatarColor });
      setIsLoggedIn(true);
    }
  };

  const handleSendMessage = (text) => {
    if (socketRef.current && activeTextChannel) {
      socketRef.current.emit('chat:message', {
        channelId: activeTextChannel,
        text
      });
    }
  };

  const handleJoinVoiceChannel = async (channelId) => {
    try {
      playJoinSound();

      if (!localStreamRef.current) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            },
            video: false
          });
          localStreamRef.current = stream;

          stream.getAudioTracks().forEach((track) => {
            track.enabled = !isMuted;
          });

          setupVoiceActivityDetection(stream);
        } catch (micErr) {
          console.warn('Mikrofon nem érhető el vagy megtagadva, csak hallgatási mód aktív.', micErr);
        }
      }

      socketRef.current?.emit('voice:join', { channelId });
      setActiveVoiceChannel(channelId);
    } catch (err) {
      console.error('Hangcsatorna csatlakozási hiba:', err);
    }
  };

  const handleLeaveVoiceChannel = () => {
    playLeaveSound();

    if (isScreenSharing) {
      handleStopScreenShare();
    }

    socketRef.current?.emit('voice:leave');
    setActiveVoiceChannel(null);

    peersRef.current.forEach(({ pc, audioEl }) => {
      try {
        pc.close();
      } catch (e) {}
      if (audioEl) {
        audioEl.srcObject = null;
        audioEl.remove();
      }
    });
    peersRef.current.clear();
    screenSendersRef.current.clear();
    setRemoteScreenStreams(new Map());
    setWhiteboards([]);
    setActiveWhiteboardId(null);
    setCodeTreeData(null);

    stopVoiceActivityDetection();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    if (viewMode === 'voice') {
      setViewMode('chat');
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    playMuteSound(nextMuted);

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = !nextMuted;
      });
    }

    if (nextMuted && isSpeakingRef.current) {
      isSpeakingRef.current = false;
      socketRef.current?.emit('voice:speaking', { isSpeaking: false });
    }

    socketRef.current?.emit('voice:state-change', {
      isMuted: nextMuted,
      isDeafened
    });
  };

  const handleToggleDeafen = () => {
    const nextDeafened = !isDeafened;
    setIsDeafened(nextDeafened);
    playMuteSound(nextDeafened);

    peersRef.current.forEach(({ audioEl }) => {
      if (audioEl) {
        audioEl.muted = nextDeafened;
      }
    });

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = !nextDeafened && !isMuted;
      });
    }

    socketRef.current?.emit('voice:state-change', {
      isMuted: nextDeafened ? true : isMuted,
      isDeafened: nextDeafened
    });
  };

  const handleLogout = () => {
    if (activeVoiceChannel) {
      handleLeaveVoiceChannel();
    }
    setIsLoggedIn(false);
    setCurrentUser(null);
    window.location.reload();
  };

  const currentChannelObj = textChannels.find((ch) => ch.id === activeTextChannel);
  const currentVoiceObj = voiceChannels.find((vc) => vc.id === activeVoiceChannel);
  const currentVoiceParticipants = activeVoiceChannel ? (voiceStates[activeVoiceChannel] || []) : [];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-discord-darkest text-discord-textNormal">
      {/* Login Modal */}
      {!isLoggedIn && <LoginModal onLogin={handleLogin} />}

      {/* 1. Leftmost Server Sidebar */}
      <ServerSidebar />

      {/* 2. Channel Sidebar */}
      {currentUser && (
        <ChannelSidebar
          user={currentUser}
          textChannels={textChannels}
          voiceChannels={voiceChannels}
          activeTextChannel={activeTextChannel}
          onSelectTextChannel={(id) => {
            setActiveTextChannel(id);
            setViewMode('chat');
          }}
          activeVoiceChannel={activeVoiceChannel}
          onJoinVoiceChannel={handleJoinVoiceChannel}
          onLeaveVoiceChannel={handleLeaveVoiceChannel}
          voiceStates={voiceStates}
          isMuted={isMuted}
          isDeafened={isDeafened}
          onToggleMute={handleToggleMute}
          onToggleDeafen={handleToggleDeafen}
          isScreenSharing={isScreenSharing}
          onToggleScreenShare={handleToggleScreenShare}
          onOpenVoiceView={() => setViewMode('voice')}
          casinoSessions={casinoSessions}
          onLogout={handleLogout}
        />
      )}

      {/* 3. Center Main View: Voice Room vagy Chat Area */}
      {viewMode === 'voice' && activeVoiceChannel ? (
        <VoiceRoomView
          channel={currentVoiceObj}
          participants={currentVoiceParticipants}
          currentUserId={currentUser?.id}
          currentUser={currentUser}
          socket={socketRef.current}
          isMuted={isMuted}
          isDeafened={isDeafened}
          isScreenSharing={isScreenSharing}
          localScreenStream={localScreenStream}
          remoteScreenStreams={remoteScreenStreams}
          whiteboards={whiteboards}
          activeWhiteboardId={activeWhiteboardId}
          onSelectWhiteboard={handleSelectWhiteboard}
          onCreateWhiteboard={handleCreateWhiteboard}
          onDeleteWhiteboard={handleDeleteWhiteboard}
          codeTreeData={codeTreeData}
          casinoSession={casinoSessions[activeVoiceChannel]}
          onStartCasino={() => handleStartCasino(activeVoiceChannel)}
          onStopCasino={() => handleStopCasino(activeVoiceChannel)}
          onToggleMute={handleToggleMute}
          onToggleDeafen={handleToggleDeafen}
          onToggleScreenShare={handleToggleScreenShare}
          onOpenSpeedTest={() => setIsSpeedTestOpen(true)}
          onDisconnect={handleLeaveVoiceChannel}
          onClose={() => setViewMode('chat')}
        />
      ) : (
        <ChatArea
          channel={currentChannelObj}
          messages={messages[activeTextChannel] || []}
          onSendMessage={handleSendMessage}
          onToggleUserList={() => setShowUserList(!showUserList)}
          showUserList={showUserList}
          onJoinVoiceChannel={handleJoinVoiceChannel}
          activeVoiceChannel={activeVoiceChannel}
          onOpenSpeedTest={() => setIsSpeedTestOpen(true)}
        />
      )}

      {/* 4. Right User List Sidebar */}
      {showUserList && (
        <UserListSidebar
          users={onlineUsers}
          currentUserId={currentUser?.id}
          onOpenSpeedTest={() => setIsSpeedTestOpen(true)}
        />
      )}

      {/* 5. Net Sebességteszt Modal */}
      <SpeedTestModal
        isOpen={isSpeedTestOpen}
        onClose={() => setIsSpeedTestOpen(false)}
        socket={socketRef.current}
        currentUser={currentUser}
        onlineUsers={onlineUsers}
        onRequestUserTest={handleRequestUserSpeedTest}
        onShareResultToChat={handleShareSpeedResultToChat}
      />

      {/* 6. Értesítés, ha valaki sebességtesztet kért tőlünk */}
      {speedTestRequestToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-discord-darker border-2 border-discord-primary p-4 rounded-xl shadow-2xl flex items-center gap-3 animate-bounce">
          <div className="w-10 h-10 rounded-full bg-discord-primary/20 text-discord-primary flex items-center justify-center flex-shrink-0">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="text-sm font-bold text-discord-textHeader">
              {speedTestRequestToast.requesterName} sebességtesztet kért tőled!
            </div>
            <div className="text-xs text-discord-textMuted">
              Mérd le a netedet és oszd meg az eredményt!
            </div>
          </div>
          <div className="flex items-center gap-2 ml-2">
            <button
              onClick={() => {
                setSpeedTestRequestToast(null);
                setIsSpeedTestOpen(true);
              }}
              className="px-3 py-1.5 rounded-lg bg-discord-primary hover:bg-discord-primaryHover text-white text-xs font-semibold transition"
            >
              Mérés Most
            </button>
            <button
              onClick={() => setSpeedTestRequestToast(null)}
              className="p-1.5 rounded hover:bg-discord-hover text-discord-textMuted hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
