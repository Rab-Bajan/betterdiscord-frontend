// DM hanghívás: valódi WebRTC (RTCPeerConnection) + szignálozás a meglévő Socket.IO kapcsolaton.
//
// Állapotok (call.status):
//   calling      kimenő: a hívás kérése úton van a szerver felé
//   ringing      kimenő: a másik fél eszköze csörög  |  bejövő: a felhasználónál csörög
//   connecting   elfogadva, a hangkapcsolat épül
//   connected    él a hang
//   reconnecting a kapcsolat megszakadt, automatikus helyreállítás folyik
//   ended | declined | missed | busy | failed   (lezárt állapotok, rövid ideig látszanak)
import { useState, useRef, useEffect, useCallback } from 'react';
import { RTC_CONFIG } from '../config';
import { getCallSettings, QUALITY_PRESETS } from '../call/callSettings';
import { tuneOpusSdp } from '../call/sdp';
import { createLevelMeter, levelStore } from '../call/audioLevel';
import {
  startIncomingRingtone, startOutgoingRingback, stopAllCallSounds, unlockCallAudio,
  playCallConnected, playCallEnded, playCallMissed, playCallDeclined
} from '../call/callSounds';
import { notifyIncomingCall, closeIncomingNotification, requestNotificationPermission } from '../components/call/CallNotification';

const TERMINAL_DISPLAY_MS = 3200;
const RECONNECT_GIVE_UP_MS = 25000;
const lower = (s) => (s || '').toLowerCase();

export const CALL_ERRORS = {
  'mic-denied': 'A mikrofon használata le van tiltva. Engedélyezd a böngésző címsorában, majd próbáld újra.',
  'mic-missing': 'Nem található mikrofon. Csatlakoztass egyet, és próbáld újra.',
  'mic-busy': 'A mikrofont egy másik alkalmazás használja, vagy nem érhető el.',
  offline: 'A felhasználó jelenleg nem elérhető. A nem fogadott hívás megjelenik a beszélgetésben.',
  busy: 'A felhasználó éppen egy másik hívásban van.',
  'not-found': 'Csak regisztrált felhasználót lehet felhívni.',
  self: 'Saját magadat nem hívhatod.',
  'already-in-call': 'Már van egy aktív hívásod.',
  'rate-limited': 'Túl sok hívási kísérlet. Várj egy kicsit.',
  unauthenticated: 'Hívásokhoz be kell jelentkezned fiókkal (vendégként nem lehetséges).',
  'connection-lost': 'A kapcsolat megszakadt, és nem sikerült helyreállítani.',
  'connect-timeout': 'Nem sikerült létrehozni a hangkapcsolatot (tűzfal vagy hálózati korlátozás?).',
  generic: 'A hívás nem sikerült.'
};

function micErrorCode(err) {
  const n = err?.name;
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'mic-denied';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'mic-missing';
  return 'mic-busy';
}

function buildAudioConstraints(settings, deviceId) {
  const dev = deviceId ?? settings.inputDeviceId;
  return {
    audio: {
      ...(dev && dev !== 'default' ? { deviceId: { exact: dev } } : {}),
      echoCancellation: settings.echoCancellation,
      noiseSuppression: settings.noiseSuppression,
      autoGainControl: settings.autoGainControl,
      channelCount: { ideal: 1 },
      sampleRate: { ideal: 48000 },
      sampleSize: { ideal: 16 }
    },
    video: false
  };
}

async function getMic(settings, deviceId) {
  try {
    return await navigator.mediaDevices.getUserMedia(buildAudioConstraints(settings, deviceId));
  } catch (err) {
    // Eltűnt/ismeretlen eszköz: visszaesés az alapértelmezett mikrofonra
    if ((err?.name === 'OverconstrainedError' || err?.name === 'NotFoundError') && (deviceId ?? settings.inputDeviceId) !== 'default') {
      return navigator.mediaDevices.getUserMedia(buildAudioConstraints(settings, 'default'));
    }
    throw err;
  }
}

export function useCall(socket, currentUserRef, { onBeforeCall } = {}) {
  const [call, setCall] = useState(null);
  const callRef = useRef(null);
  callRef.current = call;

  const R = useRef({
    pc: null,
    localStream: null,
    remoteStream: null,
    audioEl: null,
    iceServers: null,
    pendingCandidates: [],
    earlySignals: [],
    lastOfferSdp: null,
    queue: Promise.resolve(),
    stopSound: null,
    terminalTimer: null,
    reconnectTimer: null,
    disconnectTimer: null,
    statsTimer: null,
    meterTimer: null,
    localMeter: null,
    remoteMeter: null,
    everConnected: false,
    currentBitrate: 0,
    cleanTicks: 0,
    prevStats: null,
    muted: false
  }).current;

  const patch = useCallback((p) => setCall((c) => (c ? { ...c, ...p } : c)), []);

  // ---------- hangok ----------
  const stopSound = () => {
    if (R.stopSound) { R.stopSound(); R.stopSound = null; }
    stopAllCallSounds();
  };

  // ---------- erőforrás-takarítás: mikrofon, kapcsolat, mérők ----------
  const cleanupMedia = useCallback(() => {
    clearTimeout(R.reconnectTimer); clearTimeout(R.disconnectTimer);
    clearInterval(R.statsTimer); clearInterval(R.meterTimer);
    R.reconnectTimer = R.disconnectTimer = R.statsTimer = R.meterTimer = null;

    R.localMeter?.stop(); R.remoteMeter?.stop();
    R.localMeter = R.remoteMeter = null;
    levelStore.set({ local: 0, remote: 0 });

    if (R.pc) {
      const pc = R.pc;
      pc.ontrack = pc.onicecandidate = pc.oniceconnectionstatechange = pc.onconnectionstatechange = null;
      try { pc.getSenders().forEach((s) => { try { s.replaceTrack(null); } catch (e) { /* ignore */ } }); } catch (e) { /* ignore */ }
      try { pc.close(); } catch (e) { /* ignore */ }
      R.pc = null;
    }
    // A mikrofon végleges elengedése (a böngésző felvétel-jelzője is eltűnik)
    if (R.localStream) {
      R.localStream.getTracks().forEach((t) => { t.onended = null; t.stop(); });
      R.localStream = null;
    }
    if (R.audioEl) {
      R.audioEl.pause();
      R.audioEl.srcObject = null;
      R.audioEl.remove();
      R.audioEl = null;
    }
    R.remoteStream = null;
    R.pendingCandidates = [];
    R.earlySignals = [];
    R.lastOfferSdp = null;
    R.iceServers = null;
    R.everConnected = false;
    R.prevStats = null;
    R.cleanTicks = 0;
    R.muted = false;
  }, [R]);

  // Lezárás: erőforrások felszabadítása, rövid ideig látható végállapot, majd eltűnik
  const finishLocally = useCallback((status, info = {}) => {
    const c = callRef.current;
    if (!c) return;
    stopSound();
    closeIncomingNotification();
    cleanupMedia();

    const incomingRinging = c.direction === 'incoming' && (c.status === 'ringing');
    if (status === 'missed') playCallMissed();
    else if (status === 'declined') playCallDeclined();
    else if (status === 'completed' || status === 'ended') playCallEnded();
    else if (status === 'failed' || status === 'busy') playCallDeclined();

    clearTimeout(R.terminalTimer);
    // Elmulasztott bejövő hívásnál nincs mit mutatni (a DM-ben jelzés marad)
    if (incomingRinging && (status === 'missed' || status === 'handled')) {
      setCall(null);
      return;
    }
    setCall({ ...c, status: status === 'completed' ? 'ended' : status, ...info, terminal: true });
    R.terminalTimer = setTimeout(() => setCall((cur) => (cur && cur.id === c.id ? null : cur)), TERMINAL_DISPLAY_MS);
  }, [R, cleanupMedia]);

  // ---------- mikrofon ----------
  const acquireMic = useCallback(async () => {
    const stream = await getMic(getCallSettings());
    R.localStream = stream;
    attachLocalTrackHandlers(stream);
    return stream;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function attachLocalTrackHandlers(stream) {
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !R.muted;
    // Mikrofon lecsatlakoztatása hívás közben: megpróbálunk az alapértelmezettre váltani
    track.onended = async () => {
      if (!callRef.current || callRef.current.terminal || R.localStream !== stream) return;
      patch({ warning: 'mic-lost' });
      try {
        await switchInput('default', { silent: true });
        patch({ warning: null });
      } catch (e) {
        patch({ warning: 'mic-lost' });
      }
    };
    R.localMeter?.stop();
    R.localMeter = createLevelMeter(new MediaStream([track]));
  }

  // Bemeneti eszköz / feldolgozás cseréje hívás közben (replaceTrack: nincs újratárgyalás, nincs szünet)
  async function switchInput(deviceId, { silent } = {}) {
    const settings = getCallSettings();
    const old = R.localStream;
    const next = await getMic(settings, deviceId);
    const track = next.getAudioTracks()[0];
    const sender = R.pc?.getSenders().find((s) => s.track?.kind === 'audio' || s.track === null);
    if (sender) await sender.replaceTrack(track);
    R.localStream = next;
    attachLocalTrackHandlers(next);
    if (old) old.getTracks().forEach((t) => { t.onended = null; t.stop(); });
    if (!silent) patch({ warning: null });
  }

  // ---------- RTCPeerConnection ----------
  const emitSignal = useCallback((signal) => {
    const c = callRef.current;
    if (c?.id) socket.emit('call:signal', { callId: c.id, signal });
  }, [socket]);

  const applySenderParams = useCallback(async (bitrate) => {
    const sender = R.pc?.getSenders().find((s) => s.track?.kind === 'audio');
    if (!sender) return;
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      params.encodings[0].maxBitrate = bitrate;
      params.encodings[0].networkPriority = 'high';
      params.encodings[0].priority = 'high';
      await sender.setParameters(params);
      R.currentBitrate = bitrate;
    } catch (e) { /* nem minden böngésző támogatja minden mezőjét */ }
  }, [R]);

  const startMeters = () => {
    clearInterval(R.meterTimer);
    R.meterTimer = setInterval(() => {
      levelStore.set({ local: R.localMeter?.read() || 0, remote: R.remoteMeter?.read() || 0 });
    }, 70);
  };

  // Statisztika: minőségjelző + adaptív bitráta (csomagvesztés/RTT alapján)
  const startStats = () => {
    clearInterval(R.statsTimer);
    R.statsTimer = setInterval(async () => {
      const pc = R.pc;
      if (!pc) return;
      try {
        const report = await pc.getStats();
        let inbound = null; let pair = null; let codec = null;
        const byId = {};
        report.forEach((s) => { byId[s.id] = s; });
        report.forEach((s) => {
          if (s.type === 'inbound-rtp' && s.kind === 'audio') inbound = s;
          if (s.type === 'candidate-pair' && (s.nominated || s.state === 'succeeded') && s.selected !== false && s.currentRoundTripTime != null) pair = s;
        });
        if (inbound?.codecId && byId[inbound.codecId]) codec = byId[inbound.codecId].mimeType;

        let lossFrac = 0;
        if (inbound) {
          const prev = R.prevStats;
          if (prev) {
            const dLost = inbound.packetsLost - prev.lost;
            const dRecv = inbound.packetsReceived - prev.recv;
            const total = dLost + dRecv;
            if (total > 0) lossFrac = Math.max(0, dLost) / total;
          }
          R.prevStats = { lost: inbound.packetsLost, recv: inbound.packetsReceived };
        }
        // Biztonsági háló: ha a kapcsolat él, de a felület "újracsatlakozás"-t mutat (pl. csendes
        // ICE-újraindítás után nem érkezik állapotváltás-esemény), visszaállítjuk
        if (pc.connectionState === 'connected' && callRef.current?.status === 'reconnecting') markConnected();

        const rtt = pair ? pair.currentRoundTripTime * 1000 : null;
        const jitterMs = inbound?.jitter != null ? inbound.jitter * 1000 : null;

        let quality = 'good';
        if (lossFrac > 0.12 || (rtt && rtt > 500) || (jitterMs && jitterMs > 80)) quality = 'poor';
        else if (lossFrac > 0.04 || (rtt && rtt > 250) || (jitterMs && jitterMs > 35)) quality = 'fair';

        // Adaptív bitráta: romló hálózatnál lejjebb, tartósan jó hálózatnál vissza a beállított célra
        const target = QUALITY_PRESETS[getCallSettings().quality]?.bitrate || 64000;
        let want = R.currentBitrate || target;
        if (lossFrac > 0.15 || (rtt && rtt > 700)) { want = 16000; R.cleanTicks = 0; }
        else if (lossFrac > 0.06 || (rtt && rtt > 400)) { want = Math.min(target, 24000); R.cleanTicks = 0; }
        else if (quality === 'fair') { want = Math.min(target, 40000); R.cleanTicks = 0; }
        else if (++R.cleanTicks >= 4) { want = target; }
        if (want !== R.currentBitrate) applySenderParams(want);

        let route = null;
        if (pair) {
          const local = byId[pair.localCandidateId]; const remote = byId[pair.remoteCandidateId];
          route = local?.candidateType === 'relay' || remote?.candidateType === 'relay' ? 'relay' : 'direct';
        }
        patch({
          quality,
          rttMs: rtt != null ? Math.round(rtt) : null,
          codec: codec ? codec.replace('audio/', '') : null,
          bitrateKbps: Math.round((R.currentBitrate || target) / 1000),
          route
        });
      } catch (e) { /* ignore */ }
    }, 2000);
  };

  // Helyreállítás: a hívó mindig az offerer, ezért ő indítja az ICE-újraindítást;
  // a hívott fél kérést küld
  const recoverConnection = useCallback(async () => {
    const c = callRef.current;
    const pc = R.pc;
    if (!c || !pc || c.terminal) return;
    if (c.direction === 'outgoing') {
      try {
        const offer = await pc.createOffer({ iceRestart: true });
        offer.sdp = tuneOpusSdp(offer.sdp, getBitrateCap());
        await pc.setLocalDescription(offer);
        emitSignal({ type: 'offer', sdp: pc.localDescription.sdp });
      } catch (e) { console.warn('[Call] ICE újraindítás sikertelen', e); }
    } else {
      emitSignal({ type: 'restart-request' });
    }
  }, [R, emitSignal]);

  const getBitrateCap = () => QUALITY_PRESETS[getCallSettings().quality]?.bitrate || 64000;

  const markReconnecting = useCallback(() => {
    const c = callRef.current;
    if (!c || c.terminal || c.status === 'reconnecting') return;
    if (c.status === 'connected') patch({ status: 'reconnecting' });
    if (!R.reconnectTimer) {
      R.reconnectTimer = setTimeout(() => {
        R.reconnectTimer = null;
        const cur = callRef.current;
        if (cur && !cur.terminal && (cur.status === 'reconnecting' || cur.status === 'connecting')) {
          socket.emit('call:end', { callId: cur.id });
          finishLocally('failed', { reason: 'connection-lost' });
        }
      }, RECONNECT_GIVE_UP_MS);
    }
  }, [R, patch, socket, finishLocally]);

  const markConnected = useCallback(() => {
    const c = callRef.current;
    if (!c || c.terminal) return;
    clearTimeout(R.reconnectTimer); R.reconnectTimer = null;
    clearTimeout(R.disconnectTimer); R.disconnectTimer = null;
    if (!R.everConnected) {
      R.everConnected = true;
      stopSound();
      playCallConnected();
      socket.emit('call:connected', { callId: c.id });
      applySenderParams(getBitrateCap());
      startStats();
      startMeters();
      setCall((cur) => (cur ? { ...cur, status: 'connected', startedAt: Date.now(), warning: cur.warning } : cur));
    } else {
      setCall((cur) => (cur && cur.status === 'reconnecting' ? { ...cur, status: 'connected' } : cur));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createPeerConnection = useCallback((iceServers) => {
    const pc = new RTCPeerConnection({
      ...RTC_CONFIG,
      iceServers: iceServers || RTC_CONFIG.iceServers,
      iceCandidatePoolSize: 2
    });
    R.pc = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        emitSignal({
          type: 'candidate',
          candidate: { candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex }
        });
      }
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0] || new MediaStream([e.track]);
      R.remoteStream = stream;
      if (!R.audioEl) {
        const el = document.createElement('audio');
        el.autoplay = true;
        el.playsInline = true;
        el.style.display = 'none';
        document.body.appendChild(el);
        R.audioEl = el;
        const out = getCallSettings().outputDeviceId;
        if (out && out !== 'default' && el.setSinkId) el.setSinkId(out).catch(() => {});
      }
      R.audioEl.srcObject = stream;
      R.audioEl.play().catch(() => patch({ warning: 'autoplay' }));
      R.remoteMeter?.stop();
      R.remoteMeter = createLevelMeter(stream);
    };

    const onState = () => {
      const cs = pc.connectionState;
      const is = pc.iceConnectionState;
      if (cs === 'connected' || is === 'connected' || is === 'completed') {
        markConnected();
      } else if (cs === 'disconnected' || is === 'disconnected') {
        // Rövid zökkenőket kivárunk, tartós megszakadásnál helyreállítást indítunk
        if (R.disconnectTimer) return;
        R.disconnectTimer = setTimeout(() => {
          R.disconnectTimer = null;
          if (R.pc === pc && (pc.connectionState === 'disconnected' || pc.iceConnectionState === 'disconnected')) {
            markReconnecting();
            recoverConnection();
          }
        }, 2500);
        if (R.everConnected) setTimeout(() => {
          if (R.pc === pc && pc.connectionState === 'disconnected') patch({ status: 'reconnecting' });
        }, 800);
      } else if (cs === 'failed' || is === 'failed') {
        markReconnecting();
        recoverConnection();
      }
    };
    pc.onconnectionstatechange = onState;
    pc.oniceconnectionstatechange = onState;
    return pc;
  }, [R, emitSignal, markConnected, markReconnecting, recoverConnection, patch]);

  const addLocalTrack = (pc) => {
    const track = R.localStream?.getAudioTracks()[0];
    if (track) pc.addTrack(track, R.localStream);
  };

  const flushCandidates = async (pc) => {
    const list = R.pendingCandidates;
    R.pendingCandidates = [];
    for (const c of list) {
      try { await pc.addIceCandidate(c); } catch (e) { /* elavult jelölt */ }
    }
  };

  // A hívó: offer létrehozása az elfogadás után
  const makeOffer = useCallback(async () => {
    const pc = R.pc;
    if (!pc) return;
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    offer.sdp = tuneOpusSdp(offer.sdp, getBitrateCap());
    await pc.setLocalDescription(offer);
    emitSignal({ type: 'offer', sdp: pc.localDescription.sdp });
  }, [R, emitSignal]);

  // Beérkező szignál feldolgozása: sorosítva, hogy a duplikált/átfedő üzenetek ne ütközzenek
  const handleSignal = useCallback(async (signal) => {
    const pc = R.pc;
    if (!pc || !signal) return;
    switch (signal.type) {
      case 'offer': {
        if (signal.sdp === R.lastOfferSdp) return; // duplikált offer
        R.lastOfferSdp = signal.sdp;
        await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
        if (pc.getSenders().every((s) => !s.track)) addLocalTrack(pc);
        await flushCandidates(pc);
        const answer = await pc.createAnswer();
        answer.sdp = tuneOpusSdp(answer.sdp, getBitrateCap());
        await pc.setLocalDescription(answer);
        emitSignal({ type: 'answer', sdp: pc.localDescription.sdp });
        break;
      }
      case 'answer':
        if (pc.signalingState !== 'have-local-offer') return; // duplikált/késői válasz
        await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
        await flushCandidates(pc);
        break;
      case 'candidate':
        if (!signal.candidate) return;
        if (pc.remoteDescription) {
          try { await pc.addIceCandidate(signal.candidate); } catch (e) { /* ignore */ }
        } else {
          R.pendingCandidates.push(signal.candidate);
        }
        break;
      case 'restart-request':
        if (callRef.current?.direction === 'outgoing') await recoverConnection();
        break;
      case 'media':
        patch({ peerMuted: !!signal.muted });
        break;
      default:
    }
  }, [R, emitSignal, recoverConnection, patch]);

  // ---------- nyilvános műveletek ----------
  const startCall = useCallback(async (partner) => {
    const me = currentUserRef.current;
    if (!me || !partner?.username) return { ok: false, error: 'unauthenticated' };
    if (callRef.current && !callRef.current.terminal) return { ok: false, error: 'already-in-call' };
    if (lower(partner.username) === lower(me.username)) {
      return { ok: false, error: 'self' };
    }
    clearTimeout(R.terminalTimer);
    unlockCallAudio(); // kattintás közben: a böngésző engedi a hangot
    requestNotificationPermission();
    onBeforeCall?.();

    const peer = {
      username: partner.username,
      displayName: partner.displayName || partner.username,
      avatarColor: partner.avatarColor,
      avatarUrl: partner.avatarUrl
    };
    setCall({ id: null, direction: 'outgoing', peer, status: 'calling', muted: false, peerMuted: false });
    R.muted = false;

    try {
      await acquireMic();
    } catch (err) {
      cleanupMedia();
      setCall({ id: null, direction: 'outgoing', peer, status: 'failed', reason: micErrorCode(err), terminal: true });
      R.terminalTimer = setTimeout(() => setCall(null), 5000);
      return { ok: false, error: micErrorCode(err) };
    }

    return new Promise((resolve) => {
      socket.emit('call:invite', { targetUsername: partner.username }, (res) => {
        if (!res?.ok) {
          const reason = res?.error || 'generic';
          const status = reason === 'busy' ? 'busy' : 'failed';
          if (res?.peer) peer.avatarColor = res.peer.avatarColor || peer.avatarColor;
          callRef.current = { id: null, direction: 'outgoing', peer, status: 'calling' };
          finishLocally(status, { reason });
          R.terminalTimer && clearTimeout(R.terminalTimer);
          R.terminalTimer = setTimeout(() => setCall(null), 4500);
          return resolve({ ok: false, error: reason });
        }
        R.iceServers = res.iceServers;
        if (res.peer) Object.assign(peer, { avatarColor: res.peer.avatarColor, avatarUrl: res.peer.avatarUrl });
        setCall((c) => (c ? { ...c, id: res.callId, peer: { ...peer }, status: 'ringing', turn: res.turnEnabled } : c));
        stopSound();
        R.stopSound = startOutgoingRingback();
        resolve({ ok: true });
      });
    });
  }, [socket, currentUserRef, onBeforeCall, acquireMic, cleanupMedia, finishLocally, R]);

  const acceptCall = useCallback(async () => {
    const c = callRef.current;
    if (!c || c.direction !== 'incoming' || c.status !== 'ringing') return;
    unlockCallAudio();
    stopSound();
    closeIncomingNotification();
    onBeforeCall?.();
    setCall({ ...c, status: 'connecting' });
    R.muted = false;

    try {
      await acquireMic();
    } catch (err) {
      socket.emit('call:decline', { callId: c.id });
      cleanupMedia();
      setCall({ ...c, status: 'failed', reason: micErrorCode(err), terminal: true });
      R.terminalTimer = setTimeout(() => setCall(null), 5000);
      return;
    }

    socket.emit('call:accept', { callId: c.id }, (res) => {
      if (!res?.ok) {
        finishLocally('missed', { reason: 'expired' });
        return;
      }
      // A kapcsolat azonnal felépül, az offer-t a hívó küldi
      createPeerConnection(res.iceServers);
      const early = R.earlySignals;
      R.earlySignals = [];
      early.forEach((sig) => {
        R.queue = R.queue.then(() => handleSignal(sig)).catch((e) => console.warn('[Call] Szignál hiba', e));
      });
    });
  }, [socket, onBeforeCall, acquireMic, cleanupMedia, createPeerConnection, handleSignal, finishLocally, R]);

  const declineCall = useCallback(() => {
    const c = callRef.current;
    if (!c || c.direction !== 'incoming') return;
    socket.emit('call:decline', { callId: c.id });
    stopSound();
    closeIncomingNotification();
    setCall(null);
  }, [socket]);

  const endCall = useCallback(() => {
    const c = callRef.current;
    if (!c || c.terminal) return;
    if (c.id) socket.emit('call:end', { callId: c.id });
    const connected = R.everConnected;
    finishLocally(connected ? 'completed' : (c.direction === 'outgoing' ? 'cancelled' : 'declined'),
      { durationSec: c.startedAt ? Math.round((Date.now() - c.startedAt) / 1000) : 0 });
  }, [socket, finishLocally, R]);

  const toggleMute = useCallback(() => {
    const track = R.localStream?.getAudioTracks()[0];
    R.muted = !R.muted;
    if (track) track.enabled = !R.muted; // a némítás a forrásnál történik: semmi nem hagyja el az eszközt
    patch({ muted: R.muted });
    emitSignal({ type: 'media', muted: R.muted });
  }, [R, patch, emitSignal]);

  const setInputDevice = useCallback(async (deviceId) => {
    try { await switchInput(deviceId); } catch (err) { patch({ warning: 'mic-lost' }); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patch]);

  // Zajszűrés / visszhangcsökkentés / AGC módosítása hívás közben (a mikrofon újraindítása szünet nélkül)
  const reapplyProcessing = useCallback(async () => {
    if (!R.localStream) return;
    try { await switchInput(getCallSettings().inputDeviceId, { silent: true }); } catch (e) { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setOutputDevice = useCallback(async (deviceId) => {
    if (R.audioEl?.setSinkId) {
      try { await R.audioEl.setSinkId(deviceId === 'default' ? '' : deviceId); } catch (e) { /* nem támogatott */ }
    }
  }, [R]);

  const retryAudio = useCallback(() => {
    R.audioEl?.play().then(() => patch({ warning: null })).catch(() => {});
  }, [R, patch]);

  const dismiss = useCallback(() => {
    clearTimeout(R.terminalTimer);
    setCall(null);
  }, [R]);

  // ---------- szerver-események ----------
  useEffect(() => {
    if (!socket) return undefined;

    const onIncoming = ({ callId, caller }) => {
      const cur = callRef.current;
      if (cur && !cur.terminal) return; // már van hívásunk (a szerver ezt ritkán engedi át)
      clearTimeout(R.terminalTimer);
      stopSound();
      R.stopSound = startIncomingRingtone();
      setCall({
        id: callId,
        direction: 'incoming',
        peer: {
          username: caller.username,
          displayName: caller.displayName || caller.username,
          avatarColor: caller.avatarColor,
          avatarUrl: caller.avatarUrl
        },
        status: 'ringing',
        muted: false,
        peerMuted: false
      });
      if (document.hidden || !document.hasFocus()) notifyIncomingCall(caller, callId);
    };

    const onAccepted = async ({ callId }) => {
      const c = callRef.current;
      if (!c || c.id !== callId || c.direction !== 'outgoing') return;
      stopSound();
      setCall((cur) => (cur ? { ...cur, status: 'connecting' } : cur));
      try {
        const pc = createPeerConnection(R.iceServers);
        addLocalTrack(pc);
        await makeOffer();
      } catch (e) {
        console.error('[Call] Offer hiba', e);
        socket.emit('call:end', { callId });
        finishLocally('failed', { reason: 'generic' });
      }
    };

    const onSignal = ({ callId, signal }) => {
      if (callRef.current?.id !== callId) return;
      // A hívott félnél az offer előbb is megérkezhet, mint hogy a kapcsolata létrejönne: megőrizzük
      if (!R.pc) { R.earlySignals.push(signal); return; }
      R.queue = R.queue
        .then(() => handleSignal(signal))
        .catch((e) => console.warn('[Call] Szignál hiba', signal?.type, e));
    };

    const onEnded = ({ callId, status, reason, durationSec }) => {
      const c = callRef.current;
      if (!c || c.id !== callId || c.terminal) return;
      let uiStatus = status;
      if (status === 'completed') uiStatus = 'ended';
      if (status === 'missed') uiStatus = c.direction === 'outgoing' ? 'missed' : 'missed';
      finishLocally(uiStatus, { reason, durationSec });
    };

    // Másik eszközünk fogadta a hívást
    const onElsewhere = ({ callId }) => {
      const c = callRef.current;
      if (!c || c.id !== callId || c.direction !== 'incoming' || c.status !== 'ringing') return;
      finishLocally('handled');
    };

    const onPeerReconnecting = ({ callId }) => {
      if (callRef.current?.id === callId) patch({ peerOffline: true });
    };
    const onPeerReconnected = ({ callId }) => {
      if (callRef.current?.id === callId) {
        patch({ peerOffline: false });
        recoverConnection();
      }
    };

    // Socket újracsatlakozás (a hitelesítés után érkező init:data): hívás folytatása / csörgés pótlása
    const onInit = () => {
      const c = callRef.current;
      socket.emit('call:sync', { callId: c && !c.terminal ? c.id : null }, (res) => {
        const cur = callRef.current;
        if (!cur || cur.terminal) return;
        if (res?.resumed) {
          patch({ peerOffline: false });
          if (R.pc) recoverConnection();
        } else if (res?.stale) {
          finishLocally('failed', { reason: 'connection-lost' });
        }
      });
    };

    const onNetworkBack = () => {
      const c = callRef.current;
      // Csendes ICE-újraindítás: a felület csak akkor jelez, ha a kapcsolat ténylegesen megszakad
      if (c && !c.terminal && R.pc && R.everConnected) recoverConnection();
    };

    // Lap bezárása/frissítése: a hívást tisztán lezárjuk (a hang amúgy sem élné túl)
    const onPageHide = () => {
      const c = callRef.current;
      if (c?.id && !c.terminal) socket.emit('call:end', { callId: c.id });
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:accepted', onAccepted);
    socket.on('call:signal', onSignal);
    socket.on('call:ended', onEnded);
    socket.on('call:handled-elsewhere', onElsewhere);
    socket.on('call:peer-reconnecting', onPeerReconnecting);
    socket.on('call:peer-reconnected', onPeerReconnected);
    socket.on('init:data', onInit);
    window.addEventListener('online', onNetworkBack);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:accepted', onAccepted);
      socket.off('call:signal', onSignal);
      socket.off('call:ended', onEnded);
      socket.off('call:handled-elsewhere', onElsewhere);
      socket.off('call:peer-reconnecting', onPeerReconnecting);
      socket.off('call:peer-reconnected', onPeerReconnected);
      socket.off('init:data', onInit);
      window.removeEventListener('online', onNetworkBack);
      window.removeEventListener('pagehide', onPageHide);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  // Böngészőfül címe: bejövő hívásnál látszik a minimalizált ablakban is
  useEffect(() => {
    if (call?.direction === 'incoming' && call.status === 'ringing') {
      const original = document.title;
      let on = true;
      const t = setInterval(() => {
        document.title = on ? `📞 Bejövő hívás – ${call.peer.username}` : original;
        on = !on;
      }, 1000);
      return () => { clearInterval(t); document.title = original; };
    }
    return undefined;
  }, [call?.direction, call?.status, call?.peer?.username]);

  // Komponens lebontásakor semmi sem maradhat nyitva
  useEffect(() => () => { stopSound(); cleanupMedia(); }, [cleanupMedia]);

  return {
    call,
    isInCall: !!call && !call.terminal,
    startCall, acceptCall, declineCall, endCall, dismiss,
    toggleMute, setInputDevice, setOutputDevice, reapplyProcessing, retryAudio
  };
}
