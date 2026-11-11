import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocketEvents } from './useSocketEvents';
import { RTC_CONFIG } from '../config';
import { playJoinSound, playLeaveSound, playMuteSound } from '../shared/services/audio';

// Hangszoba: WebRTC kapcsolatok, mikrofon + beszédérzékelés, némítás/süketítés, képernyőmegosztás.
// Az összes WebRTC-állapot refben él, így a socket-kezelők sosem látnak elavult értéket.
export function useVoice(socket, { onScreenShareStart, onLeft } = {}) {
  const [activeVoiceChannel, setActiveVoiceChannel] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localScreenStream, setLocalScreenStream] = useState(null);
  const [remoteScreenStreams, setRemoteScreenStreams] = useState(new Map()); // peerId -> MediaStream
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [localCameraStream, setLocalCameraStream] = useState(null);
  const [remoteCameraStreams, setRemoteCameraStreams] = useState(new Map()); // peerId -> MediaStream

  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peersRef = useRef(new Map()); // peerId -> { pc, audioEl, candidateQueue, remoteStream }
  const pendingIceRef = useRef(new Map()); // peerId -> candidate[]
  const screenSendersRef = useRef(new Map()); // peerId -> RTCRtpSender[] (képernyő videó + hang)
  const cameraStreamRef = useRef(null);
  const cameraSendersRef = useRef(new Map()); // peerId -> RTCRtpSender[]
  const audioContainerRef = useRef(null);
  const audioContextRef = useRef(null);
  const spatialCtxRef = useRef(null); // közös AudioContext a térbeli (játékon belüli) hanghoz
  const analyserRef = useRef(null);
  const speakingIntervalRef = useRef(null);
  const isSpeakingRef = useRef(false);

  const activeChannelRef = useRef(null);
  activeChannelRef.current = activeVoiceChannel;
  const isDeafenedRef = useRef(isDeafened);
  isDeafenedRef.current = isDeafened;
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;
  const callbacksRef = useRef({});
  callbacksRef.current = { onScreenShareStart, onLeft };

  const sendSignal = (targetPeerId, signal) => socket.emit('webrtc:signal', { targetPeerId, signal });

  // Offer/answer mellé küldjük, melyik stream a kamera és melyik a képernyő, így a fogadó
  // az ontrack pillanatában már tudja, mire használja a beérkező videót (nincs versenyhelyzet).
  const sendDescription = (peerId, type, sdp) =>
    sendSignal(peerId, {
      type,
      sdp,
      streams: { camera: cameraStreamRef.current?.id || null, screen: screenStreamRef.current?.id || null }
    });

  // ---------- Audio feloldás (böngésző autoplay szabályai) ----------
  const unlockAllAudio = () => {
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
    if (spatialCtxRef.current?.state === 'suspended') {
      spatialCtxRef.current.resume().catch(() => {});
    }
    let allOk = true;
    peersRef.current.forEach(({ audioEl }, peerId) => {
      if (!audioEl) return;
      if (!peersRef.current.get(peerId)?.spatial) audioEl.muted = isDeafenedRef.current;
      audioEl.play()?.catch((err) => {
        console.warn(`[WebRTC] Audio play warning (${peerId}):`, err);
        allOk = false;
      });
    });
    if (allOk) setAutoplayBlocked(false);
  };

  useEffect(() => {
    const unlock = () => unlockAllAudio();
    const events = ['click', 'keydown', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, unlock));
    return () => events.forEach((e) => window.removeEventListener(e, unlock));
  }, []);

  // Rejtett audio konténer (nem display:none, mert a böngésző felfüggesztené a hangot)
  useEffect(() => {
    let div = document.getElementById('webrtc-audio-container');
    if (!div) {
      div = document.createElement('div');
      div.id = 'webrtc-audio-container';
      Object.assign(div.style, {
        position: 'fixed', top: '-9999px', left: '-9999px',
        width: '1px', height: '1px', opacity: '0', pointerEvents: 'none'
      });
      document.body.appendChild(div);
    }
    audioContainerRef.current = div;
    return () => div?.remove();
  }, []);

  // ---------- Peer kapcsolatok ----------
  // ---------- Térbeli hang (MiskolcPhobia) ----------
  // Lánc: MediaStreamSource -> highpass -> lowpass -> HRTF panner -> gain -> süketítés-gain -> kimenet.
  // A MediaStream-nek a (némított) audio elemhez csatolva kell maradnia, különben a Chromium
  // nem ad hangot a WebAudio-nak.
  const SPATIAL_REF = 1.5;
  const SPATIAL_MAX = 25;

  const teardownSpatial = (peerData) => {
    const sp = peerData?.spatial;
    if (!sp) return;
    try { sp.src.disconnect(); } catch (e) {}
    try { sp.out.disconnect(); } catch (e) {}
    peerData.spatial = null;
  };

  const getSpatialCtx = () => {
    let ctx = spatialCtxRef.current;
    if (!ctx || ctx.state === 'closed') {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      ctx = new Ctx();
      spatialCtxRef.current = ctx;
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  };

  const setParam = (param, value, ctx) => {
    if (!param) return;
    try { param.setTargetAtTime(value, ctx.currentTime, 0.04); } catch (e) { param.value = value; }
  };

  const applySpatial = (peerData) => {
    const cfg = peerData.spatialCfg;
    const ctx = getSpatialCtx();
    if (!cfg || !ctx || !peerData.remoteStream) return;

    let sp = peerData.spatial;
    if (sp && sp.stream !== peerData.remoteStream) {
      teardownSpatial(peerData);
      sp = null;
    }
    if (!sp) {
      const src = ctx.createMediaStreamSource(peerData.remoteStream);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 20;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 22050;
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'linear';
      panner.refDistance = SPATIAL_REF;
      panner.maxDistance = SPATIAL_MAX;
      panner.rolloffFactor = 1;
      const gain = ctx.createGain();
      const out = ctx.createGain();
      src.connect(hp); hp.connect(lp); lp.connect(panner); panner.connect(gain); gain.connect(out);
      out.connect(ctx.destination);
      sp = { stream: peerData.remoteStream, src, hp, lp, panner, gain, out };
      peerData.spatial = sp;
    }

    // Normál út némítva, hogy ne szóljon duplán, de a stream csatolva marad
    peerData.audioEl.muted = true;
    peerData.audioEl.play()?.catch(() => {});

    const radio = !!cfg.radio;
    const l = cfg.listener;
    if (l) {
      const L = ctx.listener;
      const fx = -Math.sin(l.yaw || 0);
      const fz = -Math.cos(l.yaw || 0);
      if (L.positionX) {
        setParam(L.positionX, l.x, ctx); setParam(L.positionY, l.y, ctx); setParam(L.positionZ, l.z, ctx);
        setParam(L.forwardX, fx, ctx); setParam(L.forwardY, 0, ctx); setParam(L.forwardZ, fz, ctx);
        setParam(L.upX, 0, ctx); setParam(L.upY, 1, ctx); setParam(L.upZ, 0, ctx);
      } else if (L.setPosition) {
        L.setPosition(l.x, l.y, l.z);
        L.setOrientation(fx, 0, fz, 0, 1, 0);
      }
    }
    // Rádió: nem pozicionális (a panner a hallgatónál ül), sávszűrt hang
    const px = radio && l ? l.x : cfg.x;
    const py = radio && l ? l.y : cfg.y;
    const pz = radio && l ? l.z : cfg.z;
    if (sp.panner.positionX) {
      setParam(sp.panner.positionX, px, ctx); setParam(sp.panner.positionY, py, ctx); setParam(sp.panner.positionZ, pz, ctx);
    } else if (sp.panner.setPosition) {
      sp.panner.setPosition(px, py, pz);
    }
    setParam(sp.hp.frequency, radio ? 450 : 20, ctx);
    setParam(sp.lp.frequency, radio ? 3200 : cfg.muffled ? 700 : 22050, ctx);
    const g = cfg.gain ?? (cfg.muffled ? 0.45 : 1);
    setParam(sp.gain.gain, g, ctx);
    setParam(sp.out.gain, isDeafenedRef.current ? 0 : 1, ctx);
  };

  // cfg: { x, y, z, listener: { x, y, z, yaw } } vagy null (visszaáll a normál hang).
  // Opcionális: muffled (falon át), gain (0 = néma), radio (nem pozicionális, rádiószűrt).
  const setPeerSpatial = useCallback((peerId, cfg) => {
    const peerData = peersRef.current.get(peerId);
    if (!peerData) return;
    if (!cfg) {
      peerData.spatialCfg = null;
      if (peerData.spatial) {
        teardownSpatial(peerData);
        if (peerData.audioEl) {
          peerData.audioEl.muted = isDeafenedRef.current;
          peerData.audioEl.play()?.catch(() => {});
        }
      }
      return;
    }
    peerData.spatialCfg = cfg;
    try { applySpatial(peerData); } catch (e) { console.warn('[WebRTC] Térbeli hang hiba:', e); }
  }, []);

  const cleanupPeer = (peerId) => {
    const peerData = peersRef.current.get(peerId);
    if (peerData) {
      try {
        const { pc } = peerData;
        if (pc) {
          pc.onicecandidate = null;
          pc.ontrack = null;
          pc.oniceconnectionstatechange = null;
          pc.onconnectionstatechange = null;
          pc.close();
        }
      } catch (e) {}
      teardownSpatial(peerData);
      if (peerData.audioEl) {
        try {
          peerData.audioEl.srcObject = null;
          peerData.audioEl.pause();
          peerData.audioEl.remove();
        } catch (e) {}
      }
      peersRef.current.delete(peerId);
    }
    pendingIceRef.current.delete(peerId);
    screenSendersRef.current.delete(peerId);
    cameraSendersRef.current.delete(peerId);
  };

  const cleanupAllPeers = () => {
    [...peersRef.current.keys()].forEach(cleanupPeer);
    peersRef.current.clear();
    if (spatialCtxRef.current) {
      spatialCtxRef.current.close?.().catch?.(() => {});
      spatialCtxRef.current = null;
    }
    pendingIceRef.current.clear();
    screenSendersRef.current.clear();
    cameraSendersRef.current.clear();
  };

  const removeRemoteCamera = (peerId) =>
    setRemoteCameraStreams((prev) => {
      if (!prev.has(peerId)) return prev;
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });

  const removeRemoteScreen = (peerId) =>
    setRemoteScreenStreams((prev) => {
      if (!prev.has(peerId)) return prev;
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });

  // A képernyő videó- ÉS hangsávját is elküldjük, azonos streamben, hogy a fogadó fel tudja ismerni
  const addCameraTracks = (peerId, pc, stream) => {
    const senders = [];
    stream.getVideoTracks().forEach((track) => {
      try {
        senders.push(pc.addTrack(track, stream));
      } catch (e) {
        console.warn('[WebRTC] Camera track hozzáadási hiba:', e);
      }
    });
    cameraSendersRef.current.set(peerId, senders);
  };

  const addScreenTracks = (peerId, pc, stream) => {
    const senders = [];
    stream.getTracks().forEach((track) => {
      try {
        senders.push(pc.addTrack(track, stream));
      } catch (e) {
        console.warn('[WebRTC] Screen track hozzáadási hiba:', e);
      }
    });
    screenSendersRef.current.set(peerId, senders);
  };

  const createPeerConnection = (peerId) => {
    cleanupPeer(peerId);

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const audioEl = document.createElement('audio');
    audioEl.autoplay = true;
    audioEl.playsInline = true;
    audioEl.muted = isDeafenedRef.current;
    audioEl.setAttribute('data-peer-id', peerId);
    audioContainerRef.current?.appendChild(audioEl);

    const peerData = { pc, audioEl, candidateQueue: [], remoteStream: null, streamKinds: {} };
    peersRef.current.set(peerId, peerData);

    // Helyi mikrofon, vagy kötelező fogadó transzceiver ha nincs mikrofon
    const audioTracks = localStreamRef.current?.getAudioTracks() || [];
    if (audioTracks.length > 0) {
      audioTracks.forEach((track) => {
        try { pc.addTrack(track, localStreamRef.current); } catch (e) { console.warn('[WebRTC] addTrack hiba:', e); }
      });
    } else {
      try { pc.addTransceiver('audio', { direction: 'recvonly' }); } catch (e) { console.warn('[WebRTC] addTransceiver hiba:', e); }
    }

    // Már aktív képernyőmegosztás
    if (screenStreamRef.current) addScreenTracks(peerId, pc, screenStreamRef.current);
    if (cameraStreamRef.current) addCameraTracks(peerId, pc, cameraStreamRef.current);

    pc.ontrack = (event) => {
      const stream = event.streams?.[0] || new MediaStream([event.track]);

      // Videót tartalmazó stream: kamera vagy képernyőmegosztás (az offer/answer címkéi alapján).
      // Címke nélkül (régi kliens) képernyőnek tekintjük. A mikrofon audio-only stream.
      if (stream.getVideoTracks().length > 0) {
        if (stream.id === peerData.streamKinds?.camera) {
          setRemoteCameraStreams((prev) => (prev.get(peerId) === stream ? prev : new Map(prev).set(peerId, stream)));
        } else {
          setRemoteScreenStreams((prev) => (prev.get(peerId) === stream ? prev : new Map(prev).set(peerId, stream)));
          event.track.onended = () => {
            if (event.track.kind === 'video') removeRemoteScreen(peerId);
          };
        }
        return;
      }

      if (event.track.kind === 'audio') {
        peerData.remoteStream = stream;
        audioEl.srcObject = stream;
        if (peerData.spatialCfg) applySpatial(peerData);

        const playAudio = () => {
          audioEl.muted = peerData.spatial ? true : isDeafenedRef.current;
          audioEl.play().catch((err) => {
            console.warn(`[WebRTC] Bejövő hang lejátszása blokkolva (${peerId}):`, err);
            setAutoplayBlocked(true);
          });
        };
        playAudio();
        event.track.onunmute = playAudio;
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) sendSignal(peerId, { type: 'ice-candidate', candidate: event.candidate });
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') restartIce(peerId);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected' && audioEl.srcObject) {
        audioEl.muted = peerData.spatial ? true : isDeafenedRef.current;
        audioEl.play().catch(() => setAutoplayBlocked(true));
      }
    };

    return peerData;
  };

  const drainIceQueue = async (peerId, pc) => {
    const peerData = peersRef.current.get(peerId);
    const candidates = [...(peerData?.candidateQueue || []), ...(pendingIceRef.current.get(peerId) || [])];
    if (peerData) peerData.candidateQueue = [];
    pendingIceRef.current.delete(peerId);

    for (const cand of candidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (e) {
        console.warn(`[WebRTC] Hiba tárolt candidate hozzáadásakor (${peerId}):`, e);
      }
    }
  };

  const initiatePeerConnection = async (peerId) => {
    try {
      const { pc } = createPeerConnection(peerId);
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      sendDescription(peerId, 'offer', offer);
    } catch (err) {
      console.error(`[WebRTC] Hiba kapcsolat kezdeményezésekor (${peerId}):`, err);
    }
  };

  const handleOffer = async (peerId, sdp, streams) => {
    try {
      let peerData = peersRef.current.get(peerId);
      if (!peerData?.pc || peerData.pc.signalingState === 'closed') {
        peerData = createPeerConnection(peerId);
      }
      const { pc } = peerData;
      peerData.streamKinds = streams || {};
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await drainIceQueue(peerId, pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendDescription(peerId, 'answer', answer);
    } catch (err) {
      console.error(`[WebRTC] Hiba offer fogadásakor (${peerId}):`, err);
    }
  };

  const handleAnswer = async (peerId, sdp, streams) => {
    try {
      const peerData = peersRef.current.get(peerId);
      const pc = peerData?.pc;
      if (!pc) return;
      if (pc.signalingState === 'have-local-offer') {
        peerData.streamKinds = streams || {};
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        await drainIceQueue(peerId, pc);
      } else {
        console.warn(`[WebRTC] Answer váratlan állapotban: ${pc.signalingState} (${peerId})`);
      }
    } catch (err) {
      console.error(`[WebRTC] Hiba answer fogadásakor (${peerId}):`, err);
    }
  };

  // Az ICE candidate-ek sorba kerülnek, amíg nincs remote description (versenyhelyzet ellen)
  const handleIceCandidate = async (peerId, candidate) => {
    if (!candidate) return;
    try {
      const peerData = peersRef.current.get(peerId);
      if (peerData?.pc?.remoteDescription?.type) {
        await peerData.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else if (peerData) {
        peerData.candidateQueue.push(candidate);
      } else {
        const queue = pendingIceRef.current.get(peerId) || [];
        queue.push(candidate);
        pendingIceRef.current.set(peerId, queue);
      }
    } catch (err) {
      console.warn(`[WebRTC] Hiba candidate hozzáadásakor (${peerId}):`, err);
    }
  };

  const restartIce = async (peerId) => {
    try {
      const pc = peersRef.current.get(peerId)?.pc;
      if (!pc || pc.signalingState === 'closed') return;
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      sendDescription(peerId, 'offer', offer);
    } catch (err) {
      console.warn(`[WebRTC] ICE restart hiba (${peerId}):`, err);
    }
  };

  // Új tárgyalás egy meglévő peerrel (képernyősáv hozzáadása/eltávolítása után)
  const renegotiate = async (peerId, pc) => {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendDescription(peerId, 'offer', offer);
  };

  // ---------- Beszédérzékelés (VAD) ----------
  const setSpeaking = (value) => {
    if (isSpeakingRef.current === value) return;
    isSpeakingRef.current = value;
    socket.emit('voice:speaking', { isSpeaking: value });
  };

  const startVoiceActivityDetection = (stream) => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new Ctx();
      audioContextRef.current = audioCtx;
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.minDecibels = -85;
      analyser.maxDecibels = -10;
      analyser.smoothingTimeConstant = 0.4;
      analyserRef.current = analyser;
      audioCtx.createMediaStreamSource(stream).connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      let holdTicks = 0;

      speakingIntervalRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(data);
        const average = data.reduce((a, b) => a + b, 0) / data.length;

        if (average > 14 && !isMutedRef.current) {
          holdTicks = 4;
          setSpeaking(true);
        } else if (holdTicks > 0) {
          holdTicks--;
        } else {
          setSpeaking(false);
        }
      }, 100);
    } catch (e) {
      console.warn('VAD hiba:', e);
    }
  };

  const stopVoiceActivityDetection = () => {
    clearInterval(speakingIntervalRef.current);
    speakingIntervalRef.current = null;
    analyserRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    setSpeaking(false);
  };

  // ---------- Socket események ----------
  useSocketEvents(socket, {
    'voice:joined': async ({ peers }) => {
      for (const peer of peers) await initiatePeerConnection(peer.id);
    },
    'voice:peer-joined': ({ peerId }) => {
      // Tartalék: ha 3.5 mp-en belül nem épül ki a kapcsolat, mi indítjuk
      setTimeout(() => {
        if (
          activeChannelRef.current &&
          (!peersRef.current.has(peerId) || peersRef.current.get(peerId)?.pc?.connectionState === 'new')
        ) {
          initiatePeerConnection(peerId);
        }
      }, 3500);
    },
    'voice:peer-left': ({ peerId }) => {
      cleanupPeer(peerId);
      removeRemoteScreen(peerId);
      removeRemoteCamera(peerId);
    },
    'voice:user-camera': ({ userId, isOn }) => {
      if (!isOn) removeRemoteCamera(userId);
    },
    'voice:user-screen-sharing': ({ userId, isSharing }) => {
      if (!isSharing) removeRemoteScreen(userId);
    },
    'webrtc:signal': async ({ senderPeerId, signal }) => {
      try {
        if (signal.type === 'offer') await handleOffer(senderPeerId, signal.sdp, signal.streams);
        else if (signal.type === 'answer') await handleAnswer(senderPeerId, signal.sdp, signal.streams);
        else if (signal.type === 'ice-candidate') await handleIceCandidate(senderPeerId, signal.candidate);
      } catch (err) {
        console.error('[WebRTC] Szignál hiba:', err);
      }
    }
  });

  // ---------- Képernyőmegosztás ----------
  const stopScreenShare = async () => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    setLocalScreenStream(null);
    setIsScreenSharing(false);

    for (const [peerId, { pc }] of peersRef.current.entries()) {
      const senders = screenSendersRef.current.get(peerId) || [];
      if (senders.length && pc && pc.signalingState !== 'closed') {
        try {
          senders.forEach((sender) => pc.removeTrack(sender));
          await renegotiate(peerId, pc);
        } catch (e) {
          console.warn('[WebRTC] Hiba képernyő sáv visszavonásakor:', e);
        }
      }
      screenSendersRef.current.delete(peerId);
    }
    socket.emit('voice:screen-share', { isSharing: false });
  };

  const startScreenShare = async () => {
    if (!activeChannelRef.current) {
      alert('Kérlek előbb lépj be egy hangcsatornába a képernyőmegosztáshoz!');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always', frameRate: { ideal: 30, max: 60 } },
        // Feldolgozás nélküli (zene/játék) hang: a zajszűrés és visszhangcsökkentés tönkretenné
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      if (stream.getAudioTracks().length === 0) {
        console.info('[ScreenShare] A böngésző nem adott hangot (Chrome-ban a "Rendszerhang/Fül hang megosztása" jelölőnégyzet kell).');
      }
      screenStreamRef.current = stream;
      setLocalScreenStream(stream);
      setIsScreenSharing(true);
      callbacksRef.current.onScreenShareStart?.();

      const videoTrack = stream.getVideoTracks()[0];
      videoTrack.onended = () => stopScreenShare(); // a böngésző saját leállító gombja

      for (const [peerId, { pc }] of peersRef.current.entries()) {
        try {
          addScreenTracks(peerId, pc, stream);
          await renegotiate(peerId, pc);
        } catch (e) {
          console.error(`[WebRTC] Hiba képernyő sáv hozzáadásakor (${peerId}):`, e);
        }
      }
      socket.emit('voice:screen-share', { isSharing: true });
    } catch (err) {
      console.warn('Képernyőmegosztás megszakítva vagy megtagadva:', err);
    }
  };

  const toggleScreenShare = () => (isScreenSharing ? stopScreenShare() : startScreenShare());

  // ---------- Kamera ----------
  const stopCamera = async () => {
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current = null;
    setLocalCameraStream(null);
    setIsCameraOn(false);

    for (const [peerId, { pc }] of peersRef.current.entries()) {
      const senders = cameraSendersRef.current.get(peerId) || [];
      if (senders.length && pc && pc.signalingState !== 'closed') {
        try {
          senders.forEach((sender) => pc.removeTrack(sender));
          await renegotiate(peerId, pc);
        } catch (e) {
          console.warn('[WebRTC] Hiba kamera sáv visszavonásakor:', e);
        }
      }
      cameraSendersRef.current.delete(peerId);
    }
    socket.emit('voice:camera', { isOn: false });
  };

  const startCamera = async () => {
    if (!activeChannelRef.current) {
      alert('Kérlek előbb lépj be egy hangcsatornába a kamera bekapcsolásához!');
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: false
      });
    } catch (err) {
      console.warn('Kamera nem érhető el:', err);
      alert('A kamera nem érhető el. Ellenőrizd, hogy van-e kamerád, és megadtad-e az engedélyt a böngészőben.');
      return;
    }

    cameraStreamRef.current = stream;
    setLocalCameraStream(stream);
    setIsCameraOn(true);
    stream.getVideoTracks()[0].onended = () => stopCamera(); // pl. kihúzták a kamerát

    for (const [peerId, { pc }] of peersRef.current.entries()) {
      try {
        addCameraTracks(peerId, pc, stream);
        await renegotiate(peerId, pc);
      } catch (e) {
        console.error(`[WebRTC] Hiba kamera sáv hozzáadásakor (${peerId}):`, e);
      }
    }
    socket.emit('voice:camera', { isOn: true });
  };

  const toggleCamera = () => (isCameraOn ? stopCamera() : startCamera());

  // ---------- Csatlakozás / kilépés ----------
  const acquireMicrophone = async () => {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });
    } catch (constraintErr) {
      console.warn('Fejlett audio beállítások sikertelenek, alap mikrofon...', constraintErr);
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
    stream.getAudioTracks().forEach((t) => { t.enabled = !isMutedRef.current; });
    localStreamRef.current = stream;
    startVoiceActivityDetection(stream);
  };

  const joinChannel = async (channelId) => {
    if (activeChannelRef.current === channelId) return;
    try {
      playJoinSound();
      if (activeChannelRef.current) cleanupAllPeers(); // másik szobából váltunk

      if (!localStreamRef.current) {
        try {
          await acquireMicrophone();
        } catch (micErr) {
          console.warn('Mikrofon nem érhető el, csak hallgatási mód aktív.', micErr);
        }
      }

      socket.emit('voice:join', { channelId });
      setActiveVoiceChannel(channelId);
      unlockAllAudio();
    } catch (err) {
      console.error('Hangcsatorna csatlakozási hiba:', err);
    }
  };

  const leaveChannel = () => {
    playLeaveSound();
    if (screenStreamRef.current) stopScreenShare();
    if (cameraStreamRef.current) stopCamera();

    socket.emit('voice:leave');
    setActiveVoiceChannel(null);

    cleanupAllPeers();
    setRemoteScreenStreams(new Map());
    setRemoteCameraStreams(new Map());
    stopVoiceActivityDetection();

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;

    callbacksRef.current.onLeft?.();
  };

  // ---------- Némítás / süketítés ----------
  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    playMuteSound(next);
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next; });
    if (next) setSpeaking(false);
    socket.emit('voice:state-change', { isMuted: next, isDeafened });
  };

  const toggleDeafen = () => {
    const next = !isDeafened;
    setIsDeafened(next);
    playMuteSound(next);
    peersRef.current.forEach((peerData) => {
      if (peerData.spatial) {
        const ctx = spatialCtxRef.current;
        if (ctx) setParam(peerData.spatial.out.gain, next ? 0 : 1, ctx);
      } else if (peerData.audioEl) {
        peerData.audioEl.muted = next;
      }
    });
    localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next && !isMuted; });
    socket.emit('voice:state-change', { isMuted: next ? true : isMuted, isDeafened: next });
  };

  // Csak a már létező bejövő hang hangerejét állítja (játékon belüli csapat- és közelségi hang)
  const setPeerVolume = useCallback((peerId, volume) => {
    const audioEl = peersRef.current.get(peerId)?.audioEl;
    if (audioEl) audioEl.volume = volume;
  }, []);

  return {
    setPeerVolume,
    setPeerSpatial,
    activeVoiceChannel,
    isMuted,
    isDeafened,
    autoplayBlocked,
    isScreenSharing,
    localScreenStream,
    remoteScreenStreams,
    isCameraOn,
    localCameraStream,
    remoteCameraStreams,
    toggleCamera,
    unlockAllAudio,
    joinChannel,
    leaveChannel,
    toggleMute,
    toggleDeafen,
    toggleScreenShare
  };
}
