import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import ServerSidebar from './components/ServerSidebar';
import ChannelSidebar from './components/ChannelSidebar';
import ChatArea from './components/ChatArea';
import VoiceRoomView from './components/VoiceRoomView';
import UserListSidebar from './components/UserListSidebar';
import LoginModal from './components/LoginModal';
import EditProfileModal from './components/EditProfileModal';
import WhiteboardView from './components/WhiteboardView';
import SpeedTestModal from './components/SpeedTestModal';
import {
  playJoinSound,
  playLeaveSound,
  playMuteSound,
  playMessageSound,
  playPrivateMessageSound
} from './sounds';
import { Activity, X, Volume2 } from 'lucide-react';

const SOCKET_URL = window.location.port === '3000'
  ? `https://${window.location.hostname}:5000`
  : window.location.origin;

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.services.mozilla.com' }
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
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
  const [showUserList, setShowUserList] = useState(typeof window !== 'undefined' ? window.innerWidth >= 1024 : false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

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

  // Watch Together (YouTube Közös Videónézés) állapotok: channelId -> state
  const [watchSessions, setWatchSessions] = useState({});

  // 1v1 Sakk és Spectator állapotok: channelId -> state
  const [chessSessions, setChessSessions] = useState({});

  // Authentikáció és Profil Szerkesztés
  const [authError, setAuthError] = useState(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileError, setProfileError] = useState(null);

  // Közvetlen Üzenetek (Direct Messages - DM)
  const [activeDmPartner, setActiveDmPartner] = useState(null);
  const [dmMessages, setDmMessages] = useState({}); // dmKey -> Array of messages
  const [dmPartners, setDmPartners] = useState([]); // Array of { id, username, avatarColor, avatarUrl, hasUnread }

  // Referenciák
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peersRef = useRef(new Map()); // peerId -> { pc, audioEl, candidateQueue, remoteStream }
  const pendingIceCandidatesRef = useRef(new Map()); // peerId -> Array of candidate
  const screenSendersRef = useRef(new Map()); // peerId -> RTCRtpSender
  const audioContainerRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const speakingIntervalRef = useRef(null);
  const isSpeakingRef = useRef(false);

  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  const activeDmPartnerRef = useRef(activeDmPartner);
  activeDmPartnerRef.current = activeDmPartner;

  const activeVoiceChannelRef = useRef(null);
  activeVoiceChannelRef.current = activeVoiceChannel;

  const isDeafenedRef = useRef(isDeafened);
  isDeafenedRef.current = isDeafened;

  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  // Globális audio feloldó (Autoplay Policy kezelése böngészőkben)
  const unlockAllAudio = () => {
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }

    let allOk = true;
    peersRef.current.forEach(({ audioEl }, peerId) => {
      if (audioEl) {
        audioEl.muted = isDeafenedRef.current;
        const p = audioEl.play();
        if (p !== undefined) {
          p.catch((err) => {
            console.warn(`[WebRTC] Audio play warning (${peerId}):`, err);
            allOk = false;
          });
        }
      }
    });

    if (allOk) {
      setAutoplayBlocked(false);
    }
  };

  useEffect(() => {
    const handleUserInteraction = () => {
      unlockAllAudio();
    };

    window.addEventListener('click', handleUserInteraction);
    window.addEventListener('keydown', handleUserInteraction);
    window.addEventListener('touchstart', handleUserInteraction);

    return () => {
      window.removeEventListener('click', handleUserInteraction);
      window.removeEventListener('keydown', handleUserInteraction);
      window.removeEventListener('touchstart', handleUserInteraction);
    };
  }, []);

  // Audio konténer (nem display:none a böngészős hangfelfüggesztés elkerülésére!)
  useEffect(() => {
    let div = document.getElementById('webrtc-audio-container');
    if (!div) {
      div = document.createElement('div');
      div.id = 'webrtc-audio-container';
      div.style.position = 'fixed';
      div.style.top = '-9999px';
      div.style.left = '-9999px';
      div.style.width = '1px';
      div.style.height = '1px';
      div.style.opacity = '0';
      div.style.pointerEvents = 'none';
      document.body.appendChild(div);
    }
    audioContainerRef.current = div;

    return () => {
      div?.remove();
    };
  }, []);

  // Socket kapcsolat inicializálása
  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    // Automatikus belépés mentett token alapján
    socket.on('connect', () => {
      try {
        const savedToken = localStorage.getItem('sharkvoic_token');
        if (savedToken) {
          socket.emit('auth:verify-token', { token: savedToken });
        }
      } catch (e) {}
    });

    socket.on('init:data', (data) => {
      setCurrentUser(data.self);
      if (data.textChannels) setTextChannels(data.textChannels);
      if (data.voiceChannels) setVoiceChannels(data.voiceChannels);
      if (data.channelMessages) setMessages(data.channelMessages);
      if (data.voiceStates) setVoiceStates(data.voiceStates);
      if (data.onlineUsers) setOnlineUsers(data.onlineUsers);
      if (data.casinoSessions) setCasinoSessions(data.casinoSessions);
      if (data.watchSessions) setWatchSessions(data.watchSessions);
      if (data.chessSessions) setChessSessions(data.chessSessions);

      // Korábbi DM beszélgetések lekérése
      socket.emit('dm:get-conversations');
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
        try {
          await initiatePeerConnection(peer.id);
        } catch (e) {
          console.error(`[WebRTC] Hiba kapcsolat kezdeményezésekor (${peer.id}):`, e);
        }
      }
    });

    socket.on('voice:peer-joined', ({ peerId, user }) => {
      console.log(`[WebRTC] Új partner csatlakozott a szobához:`, user);
      // Biztonsági tartalék: ha 3.5 másodpercen belül nem épül ki a kapcsolat az új partnertől, mi indítjuk
      setTimeout(() => {
        if (
          activeVoiceChannelRef.current &&
          (!peersRef.current.has(peerId) || peersRef.current.get(peerId)?.pc?.connectionState === 'new')
        ) {
          console.log(`[WebRTC] Backup kapcsolat indítása partner felé (${peerId})...`);
          initiatePeerConnection(peerId);
        }
      }, 3500);
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

    // Watch Together (YouTube Közös Videónézés) események
    socket.on('watch:session-updated', ({ channelId, state }) => {
      setWatchSessions((prev) => {
        const next = { ...prev };
        if (state) next[channelId] = state;
        else delete next[channelId];
        return next;
      });
    });

    socket.on('watch:state', (state) => {
      if (state && state.channelId) {
        setWatchSessions((prev) => ({
          ...prev,
          [state.channelId]: state
        }));
      }
    });

    // 1v1 Sakk és Spectator események
    socket.on('chess:session-updated', ({ channelId, state }) => {
      setChessSessions((prev) => {
        const next = { ...prev };
        if (state) next[channelId] = state;
        else delete next[channelId];
        return next;
      });
    });

    socket.on('chess:state', (state) => {
      if (state && state.channelId) {
        setChessSessions((prev) => ({
          ...prev,
          [state.channelId]: state
        }));
      }
    });

    // Authentikáció események
    socket.on('auth:success', ({ user, token }) => {
      setCurrentUser(user);
      setIsLoggedIn(true);
      setAuthError(null);
      if (token) {
        try {
          localStorage.setItem('sharkvoic_token', token);
        } catch (e) {}
      }
    });

    socket.on('auth:error', ({ error }) => {
      setAuthError(error);
    });

    socket.on('auth:token-invalid', () => {
      try {
        localStorage.removeItem('sharkvoic_token');
      } catch (e) {}
      setIsLoggedIn(false);
    });

    socket.on('user:profile-updated', (user) => {
      setCurrentUser((prev) => ({ ...prev, ...user }));
      setIsProfileModalOpen(false);
      setProfileError(null);
      try {
        localStorage.setItem('sharkvoic_user', JSON.stringify(user));
      } catch (e) {}
    });

    socket.on('profile:error', ({ error }) => {
      setProfileError(error);
    });

    // Privát Üzenetek (Direct Messages) események
    socket.on('dm:new-message', (dmMsg) => {
      const myId = currentUserRef.current?.id;
      const isFromMe = dmMsg.senderId === myId;
      const partner = isFromMe
        ? { id: dmMsg.recipientId, username: dmMsg.recipientUsername, avatarColor: dmMsg.recipientAvatarColor, avatarUrl: dmMsg.recipientAvatarUrl }
        : { id: dmMsg.senderId, username: dmMsg.senderUsername, avatarColor: dmMsg.senderAvatarColor, avatarUrl: dmMsg.senderAvatarUrl };

      // DM üzenetek mentése
      setDmMessages((prev) => {
        const key = dmMsg.dmKey;
        const list = prev[key] || [];
        return {
          ...prev,
          [key]: [...list, dmMsg]
        };
      });

      // DM partnerek listájának frissítése
      setDmPartners((prev) => {
        const exists = prev.find(p => p.username.toLowerCase() === partner.username.toLowerCase());
        const isCurrentActive = activeDmPartnerRef.current?.username.toLowerCase() === partner.username.toLowerCase();
        const hasUnread = !isFromMe && !isCurrentActive;

        if (exists) {
          return prev.map(p => p.username.toLowerCase() === partner.username.toLowerCase()
            ? { ...p, ...partner, hasUnread: hasUnread || p.hasUnread }
            : p
          );
        } else {
          return [...prev, { ...partner, hasUnread }];
        }
      });

      // Különálló HANGEFFEKT privát üzenethez!
      if (!isFromMe) {
        playPrivateMessageSound();
      }
    });

    socket.on('dm:history', ({ partnerId, partnerUsername, dmKey, messages }) => {
      const key = dmKey || (currentUserRef.current && partnerUsername ? [currentUserRef.current.username.toLowerCase(), partnerUsername.toLowerCase()].sort().join('::') : null);
      if (key) {
        setDmMessages((prev) => ({
          ...prev,
          [key]: messages || []
        }));
      }
    });

    socket.on('dm:conversations', (convs) => {
      if (Array.isArray(convs)) {
        setDmPartners((prev) => {
          // Összefésülés a meglévőkkel
          const map = new Map();
          convs.forEach(c => map.set(c.username.toLowerCase(), c));
          prev.forEach(p => {
            if (map.has(p.username.toLowerCase())) {
              map.set(p.username.toLowerCase(), { ...map.get(p.username.toLowerCase()), ...p });
            } else {
              map.set(p.username.toLowerCase(), p);
            }
          });
          return Array.from(map.values());
        });
      }
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

  // Peer kapcsolat teljes és tiszta lezárása
  const cleanupPeer = (peerId) => {
    const peerData = peersRef.current.get(peerId);
    if (peerData) {
      console.log(`[WebRTC] Peer lezárása és takarítása: ${peerId}`);
      try {
        if (peerData.pc) {
          peerData.pc.onicecandidate = null;
          peerData.pc.ontrack = null;
          peerData.pc.oniceconnectionstatechange = null;
          peerData.pc.onconnectionstatechange = null;
          peerData.pc.close();
        }
      } catch (e) {}
      if (peerData.audioEl) {
        try {
          peerData.audioEl.srcObject = null;
          peerData.audioEl.pause();
          peerData.audioEl.remove();
        } catch (e) {}
      }
      peersRef.current.delete(peerId);
    }
    pendingIceCandidatesRef.current.delete(peerId);
    screenSendersRef.current.delete(peerId);
  };

  // Új RTCPeerConnection létrehozása és eseménykezelők bekötése
  const createPeerConnection = (peerId) => {
    cleanupPeer(peerId);

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const audioEl = document.createElement('audio');
    audioEl.autoplay = true;
    audioEl.playsInline = true;
    audioEl.muted = isDeafenedRef.current;
    audioEl.setAttribute('data-peer-id', peerId);
    audioContainerRef.current?.appendChild(audioEl);

    const peerData = {
      pc,
      audioEl,
      candidateQueue: [],
      remoteStream: null
    };
    peersRef.current.set(peerId, peerData);

    // 1. Helyi mikrofon audio sáv hozzáadása
    if (localStreamRef.current && localStreamRef.current.getAudioTracks().length > 0) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        try {
          pc.addTrack(track, localStreamRef.current);
          console.log(`[WebRTC] Mikrofon track hozzáadva (${peerId})`);
        } catch (e) {
          console.warn('[WebRTC] addTrack hiba:', e);
        }
      });
    } else {
      // Ha nincs mikrofonunk vagy még nem engedélyezett, akkor is kötelező a fogadó transzceiver
      try {
        pc.addTransceiver('audio', { direction: 'recvonly' });
        console.log(`[WebRTC] Audio recvonly transzceiver hozzáadva (${peerId})`);
      } catch (e) {
        console.warn('[WebRTC] addTransceiver hiba:', e);
      }
    }

    // 2. Képernyőmegosztás videó sáv hozzáadása ha épp aktív
    if (screenStreamRef.current) {
      screenStreamRef.current.getVideoTracks().forEach((track) => {
        try {
          const sender = pc.addTrack(track, screenStreamRef.current);
          screenSendersRef.current.set(peerId, sender);
        } catch (e) {
          console.warn('[WebRTC] Screen track hozzáadási hiba:', e);
        }
      });
    }

    // 3. Bejövő sávok (hang / videó) kezelése
    pc.ontrack = (event) => {
      console.log(`[WebRTC] ontrack esemény érkezett peer-től (${peerId}), kind: ${event.track.kind}`);

      if (event.track.kind === 'audio') {
        const stream = (event.streams && event.streams[0])
          ? event.streams[0]
          : new MediaStream([event.track]);

        peerData.remoteStream = stream;
        audioEl.srcObject = stream;

        const playAudio = () => {
          audioEl.muted = isDeafenedRef.current;
          audioEl.play().catch((err) => {
            console.warn(`[WebRTC] Bejövő hang automatikus lejátszása blokkolva (${peerId}):`, err);
            setAutoplayBlocked(true);
          });
        };

        playAudio();

        event.track.onunmute = () => {
          console.log(`[WebRTC] Audio sáv aktívvá vált (onunmute) (${peerId})`);
          playAudio();
        };
      } else if (event.track.kind === 'video') {
        console.log(`[WebRTC] Video stream (Képernyőmegosztás) érkezett peer-től (${peerId})`);
        const stream = (event.streams && event.streams[0])
          ? event.streams[0]
          : new MediaStream([event.track]);

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

    // 4. ICE candidate generálás és továbbítás
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

    // 5. Kapcsolati állapotok monitorozása és újraindítás hiba esetén
    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE Connection State (${peerId}): ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        console.warn(`[WebRTC] ICE állapot sikertelen (${peerId}), ICE újraindítás próbálkozás...`);
        handleIceRestart(peerId);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection State (${peerId}): ${pc.connectionState}`);
      if (pc.connectionState === 'connected') {
        if (audioEl && audioEl.srcObject) {
          audioEl.muted = isDeafenedRef.current;
          audioEl.play().catch(() => setAutoplayBlocked(true));
        }
      }
    };

    return peerData;
  };

  // Várakozó ICE candidate-ek kiürítése a remote description beállítása után
  const drainIceCandidateQueue = async (peerId, pc) => {
    const peerData = peersRef.current.get(peerId);
    const candidates = [];

    if (peerData && peerData.candidateQueue && peerData.candidateQueue.length > 0) {
      candidates.push(...peerData.candidateQueue);
      peerData.candidateQueue = [];
    }

    if (pendingIceCandidatesRef.current.has(peerId)) {
      candidates.push(...pendingIceCandidatesRef.current.get(peerId));
      pendingIceCandidatesRef.current.delete(peerId);
    }

    if (candidates.length > 0) {
      console.log(`[WebRTC] ${candidates.length} db tárolt ICE candidate hozzáadása (${peerId})...`);
      for (const cand of candidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.warn(`[WebRTC] Hiba tárolt candidate hozzáadásakor (${peerId}):`, e);
        }
      }
    }
  };

  // WebRTC Kapcsolat kezdeményezése egy peer felé (Offer küldés)
  const initiatePeerConnection = async (peerId) => {
    try {
      console.log(`[WebRTC] Kapcsolat kezdeményezése (${peerId})...`);
      const peerData = createPeerConnection(peerId);
      const { pc } = peerData;

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
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

  // Érkező Offer kezelése (Answer küldés)
  const handleReceiveOffer = async (senderPeerId, sdp) => {
    try {
      console.log(`[WebRTC] Offer érkezett peer-től (${senderPeerId})`);
      let peerData = peersRef.current.get(senderPeerId);

      if (!peerData || !peerData.pc || peerData.pc.signalingState === 'closed') {
        peerData = createPeerConnection(senderPeerId);
      }

      const { pc } = peerData;
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await drainIceCandidateQueue(senderPeerId, pc);

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

  // Érkező Answer kezelése
  const handleReceiveAnswer = async (senderPeerId, sdp) => {
    try {
      console.log(`[WebRTC] Answer érkezett peer-től (${senderPeerId})`);
      const peerData = peersRef.current.get(senderPeerId);
      if (!peerData || !peerData.pc) {
        console.warn(`[WebRTC] Answer érkezett de nincs peerData (${senderPeerId})`);
        return;
      }

      const { pc } = peerData;
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        await drainIceCandidateQueue(senderPeerId, pc);
      } else {
        console.warn(`[WebRTC] Answer érkezett váratlan állapotban: ${pc.signalingState} (${senderPeerId})`);
      }
    } catch (err) {
      console.error(`[WebRTC] Hiba answer fogadásakor (${senderPeerId}):`, err);
    }
  };

  // Érkező ICE candidate kezelése (várakozási sorral a versenyhelyzet elkerülésére!)
  const handleReceiveIceCandidate = async (senderPeerId, candidate) => {
    if (!candidate) return;
    try {
      const peerData = peersRef.current.get(senderPeerId);
      if (peerData && peerData.pc && peerData.pc.remoteDescription && peerData.pc.remoteDescription.type) {
        await peerData.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        if (peerData) {
          peerData.candidateQueue.push(candidate);
        } else {
          if (!pendingIceCandidatesRef.current.has(senderPeerId)) {
            pendingIceCandidatesRef.current.set(senderPeerId, []);
          }
          pendingIceCandidatesRef.current.get(senderPeerId).push(candidate);
        }
        console.log(`[WebRTC] ICE candidate sorba állítva (${senderPeerId})`);
      }
    } catch (err) {
      console.warn(`[WebRTC] Hiba candidate hozzáadásakor (${senderPeerId}):`, err);
    }
  };

  // ICE újraindítás hálózati megszakadás esetén
  const handleIceRestart = async (peerId) => {
    try {
      const peerData = peersRef.current.get(peerId);
      if (!peerData || !peerData.pc || peerData.pc.signalingState === 'closed') return;

      console.log(`[WebRTC] ICE újraindítás kezdeményezése (${peerId})...`);
      const offer = await peerData.pc.createOffer({ iceRestart: true });
      await peerData.pc.setLocalDescription(offer);

      socketRef.current?.emit('webrtc:signal', {
        targetPeerId: peerId,
        signal: {
          type: 'offer',
          sdp: offer
        }
      });
    } catch (err) {
      console.warn(`[WebRTC] ICE restart hiba (${peerId}):`, err);
    }
  };

  // Beszédérzékelés (VAD)
  const setupVoiceActivityDetection = (stream) => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;

      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

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

        const isCurrentlySpeaking = average > 14 && !isMutedRef.current;

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

  // 1v1 SAKK KEZELŐK
  const handleStartChess = (channelId, colorPreference = 'white') => {
    const targetChannel = channelId || activeVoiceChannel;
    if (socketRef.current && targetChannel) {
      socketRef.current.emit('chess:start', {
        channelId: targetChannel,
        colorPreference
      });
    }
  };

  const handleJoinChess = (channelId) => {
    const targetChannel = channelId || activeVoiceChannel;
    if (socketRef.current && targetChannel) {
      socketRef.current.emit('chess:join', { channelId: targetChannel });
    }
  };

  const handleMoveChess = (channelId, from, to, promotion = 'q') => {
    const targetChannel = channelId || activeVoiceChannel;
    if (socketRef.current && targetChannel) {
      socketRef.current.emit('chess:move', { channelId: targetChannel, from, to, promotion });
    }
  };

  const handleResignChess = (channelId) => {
    const targetChannel = channelId || activeVoiceChannel;
    if (socketRef.current && targetChannel) {
      socketRef.current.emit('chess:resign', { channelId: targetChannel });
    }
  };

  const handleRematchChess = (channelId) => {
    const targetChannel = channelId || activeVoiceChannel;
    if (socketRef.current && targetChannel) {
      socketRef.current.emit('chess:rematch', { channelId: targetChannel });
    }
  };

  const handleStopChess = (channelId) => {
    const targetChannel = channelId || activeVoiceChannel;
    if (socketRef.current && targetChannel) {
      socketRef.current.emit('chess:stop', { channelId: targetChannel });
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

  // Authentikáció kezelők
  const handleLogin = ({ type, username, password, avatarColor }) => {
    setAuthError(null);
    if (!socketRef.current) return;

    if (type === 'register') {
      socketRef.current.emit('auth:register', { username, password, avatarColor });
    } else if (type === 'login') {
      socketRef.current.emit('auth:login', { username, password });
    } else {
      // Guest
      socketRef.current.emit('user:join', { username, avatarColor });
      setIsLoggedIn(true);
    }
  };

  const handleUpdateProfile = ({ username, avatarColor, avatarUrl }) => {
    setProfileError(null);
    if (socketRef.current) {
      socketRef.current.emit('user:update-profile', { username, avatarColor, avatarUrl });
    }
  };

  // Privát Üzenet kezelők (Direct Messages)
  const handleStartDm = (partner) => {
    if (!partner) return;
    setActiveDmPartner(partner);
    setViewMode('chat'); // Biztosítjuk, hogy a csevegés nézet legyen aktív

    // Olvasatlanság törlése
    setDmPartners((prev) => {
      const exists = prev.find(p => p.username.toLowerCase() === partner.username.toLowerCase());
      if (exists) {
        return prev.map(p => p.username.toLowerCase() === partner.username.toLowerCase()
          ? { ...p, hasUnread: false }
          : p
        );
      } else {
        return [...prev, { ...partner, hasUnread: false }];
      }
    });

    if (socketRef.current) {
      socketRef.current.emit('dm:get-history', {
        targetUserId: partner.id,
        targetUsername: partner.username
      });
    }
  };

  const handleSendDmMessage = (text, attachments = []) => {
    if (!socketRef.current || !activeDmPartner) return;
    socketRef.current.emit('dm:send-message', {
      targetUserId: activeDmPartner.id,
      targetUsername: activeDmPartner.username,
      text,
      attachments
    });
  };

  const handleSendMessage = (text, attachments = []) => {
    if (socketRef.current && activeTextChannel) {
      socketRef.current.emit('chat:message', {
        channelId: activeTextChannel,
        text,
        attachments
      });
    }
  };

  const handleJoinVoiceChannel = async (channelId) => {
    try {
      if (activeVoiceChannel === channelId) return;

      playJoinSound();

      // Ha már másik hangcsatornában voltunk, tisztítsuk meg a korábbi kapcsolatokat
      if (activeVoiceChannel) {
        peersRef.current.forEach(({ pc, audioEl }) => {
          try { pc.close(); } catch (e) {}
          if (audioEl) {
            audioEl.srcObject = null;
            audioEl.remove();
          }
        });
        peersRef.current.clear();
        pendingIceCandidatesRef.current.clear();
      }

      if (!localStreamRef.current) {
        try {
          let stream;
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
              },
              video: false
            });
          } catch (constraintErr) {
            console.warn('Fejlett audio beállítások sikertelenek, próbálkozás alap mikrofonnal...', constraintErr);
            stream = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: false
            });
          }

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

      // Feloldjuk az audio kontextust
      unlockAllAudio();
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
    pendingIceCandidatesRef.current.clear();
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
    try {
      const savedToken = localStorage.getItem('sharkvoic_token');
      if (socketRef.current && savedToken) {
        socketRef.current.emit('auth:logout', { token: savedToken });
      }
      localStorage.removeItem('sharkvoic_token');
    } catch (e) {}

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
    <div className="flex flex-col h-screen w-screen overflow-hidden select-none" style={{ background: '#090A18', color: '#F4F3FF' }}>
      {/* Autoplay unblock banner ha a böngésző letiltotta a hangot */}
      {autoplayBlocked && (
        <div
          onClick={unlockAllAudio}
          className="px-4 py-2 flex items-center justify-between text-xs font-bold cursor-pointer transition shadow-md z-50 flex-shrink-0 animate-bounce select-none text-white"
          style={{ background: 'linear-gradient(135deg, #7655F5, #536CFF)' }}
        >
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4" />
            <span>A böngésződ blokkolta a hangot. Kattints ide (vagy bárhová az ablakban) az élő hang engedélyezéséhez!</span>
          </div>
          <span className="bg-white/20 px-2.5 py-1 rounded text-[11px] font-bold">Hang Bekapcsolása 🔊</span>
        </div>
      )}

      <div className="flex flex-1 w-full overflow-hidden relative">
        {/* Login Modal */}
        {!isLoggedIn && <LoginModal onLogin={handleLogin} authError={authError} />}

        {/* Profil Szerkesztése Modal */}
        {isProfileModalOpen && (
          <EditProfileModal
            currentUser={currentUser}
            onSave={handleUpdateProfile}
            onClose={() => setIsProfileModalOpen(false)}
            error={profileError}
          />
        )}

      {/* Mobil Backdrop a bal oldali ChannelSidebar-hoz */}
      {mobileSidebarOpen && (
        <div
          onClick={() => setMobileSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden transition-opacity animate-in fade-in"
        />
      )}

      {/* 2. Channel Sidebar (Slide-over mobilon, normál oszlop asztali nézetben) */}
      {currentUser && (
        <div className={`fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}>
          <ChannelSidebar
            user={currentUser}
            textChannels={textChannels}
            voiceChannels={voiceChannels}
            activeTextChannel={activeDmPartner ? null : activeTextChannel}
            onSelectTextChannel={(id) => {
              setActiveTextChannel(id);
              setActiveDmPartner(null);
              setViewMode('chat');
              setMobileSidebarOpen(false);
            }}
            activeVoiceChannel={activeVoiceChannel}
            onJoinVoiceChannel={(id) => {
              handleJoinVoiceChannel(id);
              setMobileSidebarOpen(false);
            }}
            onLeaveVoiceChannel={handleLeaveVoiceChannel}
            voiceStates={voiceStates}
            isMuted={isMuted}
            isDeafened={isDeafened}
            onToggleMute={handleToggleMute}
            onToggleDeafen={handleToggleDeafen}
            isScreenSharing={isScreenSharing}
            onToggleScreenShare={handleToggleScreenShare}
            onOpenVoiceView={() => {
              setViewMode('voice');
              setMobileSidebarOpen(false);
            }}
            casinoSessions={casinoSessions}
            watchSessions={watchSessions}
            chessSessions={chessSessions}
            dmPartners={dmPartners}
            activeDmPartnerId={activeDmPartner?.id}
            onSelectDmPartner={(partner) => handleStartDm(partner)}
            onOpenProfile={() => setIsProfileModalOpen(true)}
            onLogout={handleLogout}
            onCloseMobile={() => setMobileSidebarOpen(false)}
          />
        </div>
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
          watchState={watchSessions[activeVoiceChannel]}
          chessSession={chessSessions[activeVoiceChannel]}
          onStartChess={(color) => handleStartChess(activeVoiceChannel, color)}
          onJoinChess={() => handleJoinChess(activeVoiceChannel)}
          onMoveChess={(move) => handleMoveChess(activeVoiceChannel, move.from, move.to, move.promotion)}
          onResignChess={() => handleResignChess(activeVoiceChannel)}
          onRematchChess={() => handleRematchChess(activeVoiceChannel)}
          onStopChess={() => handleStopChess(activeVoiceChannel)}
          onToggleMute={handleToggleMute}
          onToggleDeafen={handleToggleDeafen}
          onToggleScreenShare={handleToggleScreenShare}
          onOpenSpeedTest={() => setIsSpeedTestOpen(true)}
          onDisconnect={handleLeaveVoiceChannel}
          onClose={() => setViewMode('chat')}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
        />
      ) : (
        <ChatArea
          isDm={!!activeDmPartner}
          dmPartner={activeDmPartner}
          channel={activeDmPartner ? null : currentChannelObj}
          messages={
            activeDmPartner && currentUser
              ? (dmMessages[[currentUser.username.toLowerCase(), activeDmPartner.username.toLowerCase()].sort().join('::')] || [])
              : (messages[activeTextChannel] || [])
          }
          onSendMessage={activeDmPartner ? handleSendDmMessage : handleSendMessage}
          onToggleUserList={() => setShowUserList(!showUserList)}
          showUserList={showUserList}
          onJoinVoiceChannel={handleJoinVoiceChannel}
          activeVoiceChannel={activeVoiceChannel}
          onOpenSpeedTest={() => setIsSpeedTestOpen(true)}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
        />
      )}

      {/* 4. Right User List Sidebar (Slide-over mobilon/tableten, normál oszlop asztali nézetben) */}
      {showUserList && (
        <>
          <div
            onClick={() => setShowUserList(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden transition-opacity animate-in fade-in"
          />
          <div className="fixed inset-y-0 right-0 z-40 lg:relative lg:translate-x-0 shadow-2xl lg:shadow-none animate-in slide-in-from-right duration-200">
            <UserListSidebar
              users={onlineUsers}
              currentUserId={currentUser?.id}
              onStartDm={(partner) => handleStartDm(partner)}
              onOpenProfile={() => setIsProfileModalOpen(true)}
              onOpenSpeedTest={() => setIsSpeedTestOpen(true)}
              onClose={() => setShowUserList(false)}
            />
          </div>
        </>
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
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce" style={{ background: '#101329', border: '1px solid #7655F5', boxShadow: '0 8px 30px rgba(118, 85, 245, 0.3)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(118, 85, 245, 0.2)', color: '#7655F5' }}>
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="text-sm font-bold" style={{ color: '#F4F3FF' }}>
              {speedTestRequestToast.requesterName} sebességtesztet kért tőled!
            </div>
            <div className="text-xs" style={{ color: '#999BBE' }}>
              Mérd le a netedet és oszd meg az eredményt!
            </div>
          </div>
          <div className="flex items-center gap-2 ml-2">
            <button
              onClick={() => {
                setSpeedTestRequestToast(null);
                setIsSpeedTestOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl text-white text-xs font-semibold transition"
              style={{ background: 'linear-gradient(135deg, #7655F5, #536CFF)' }}
            >
              Mérés Most
            </button>
            <button
              onClick={() => setSpeedTestRequestToast(null)}
              className="p-1.5 rounded-lg text-xs transition"
              style={{ color: '#999BBE' }}
              onMouseOver={e => e.currentTarget.style.color = '#F4F3FF'}
              onMouseOut={e => e.currentTarget.style.color = '#999BBE'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
