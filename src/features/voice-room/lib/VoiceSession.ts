// Hangszoba: WebRTC mesh (minden résztvevővel külön RTCPeerConnection), mikrofon +
// beszédérzékelés, némítás/süketítés, képernyőmegosztás, kamera és térbeli hang.
// A React a subscribe/getSnapshot páron át figyeli (useSyncExternalStore).
// Életciklus: start() köti be a socket- és ablak-eseményeket és a rejtett audio konténert,
// stop() leköti őket; leaveChannel() bont minden kapcsolatot.
import { RTC_CONFIG } from '../../../config';
import { playJoinSound, playLeaveSound, playMuteSound } from '../../../shared/services/audio';
import { stringField, isRecord } from '../../../shared/lib/guards';
import type { SocketLike } from '../../../shared/services/socket/SocketLike';
import { parseJoinedPeers, parseVoiceSignal, type StreamKinds, type VoiceSignal } from '../types';
import { SpatialVoiceMixer, type SpatialChain, type SpatialConfig } from './SpatialVoiceMixer';
import { VoiceActivityDetector } from './VoiceActivityDetector';

const AUDIO_CONTAINER_ID = 'webrtc-audio-container';
const PEER_FALLBACK_CONNECT_MS = 3500;
const UNLOCK_EVENTS = ['click', 'keydown', 'touchstart'] as const;

export interface VoiceState {
  activeVoiceChannel: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  autoplayBlocked: boolean;
  isScreenSharing: boolean;
  localScreenStream: MediaStream | null;
  /** peerId -> screen share stream */
  remoteScreenStreams: ReadonlyMap<string, MediaStream>;
  isCameraOn: boolean;
  localCameraStream: MediaStream | null;
  /** peerId -> camera stream */
  remoteCameraStreams: ReadonlyMap<string, MediaStream>;
}

const INITIAL_STATE: VoiceState = {
  activeVoiceChannel: null,
  isMuted: false,
  isDeafened: false,
  autoplayBlocked: false,
  isScreenSharing: false,
  localScreenStream: null,
  remoteScreenStreams: new Map(),
  isCameraOn: false,
  localCameraStream: null,
  remoteCameraStreams: new Map()
};

/** Browser APIs the session needs; replaceable in tests. */
export interface VoiceEnvironment {
  createPeerConnection(config: RTCConfiguration): RTCPeerConnection;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  getDisplayMedia(constraints: DisplayMediaStreamOptions): Promise<MediaStream>;
}

export const browserVoiceEnvironment: VoiceEnvironment = {
  createPeerConnection: (config) => new RTCPeerConnection(config),
  getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
  getDisplayMedia: (constraints) => navigator.mediaDevices.getDisplayMedia(constraints)
};

export interface VoiceSessionCallbacks {
  onScreenShareStart?: () => void;
  onLeft?: () => void;
}

interface VoicePeer {
  pc: RTCPeerConnection;
  audioEl: HTMLAudioElement;
  candidateQueue: RTCIceCandidateInit[];
  remoteStream: MediaStream | null;
  streamKinds: StreamKinds;
  spatial: SpatialChain | null;
  spatialCfg: SpatialConfig | null;
}

type StreamMapKey = 'remoteScreenStreams' | 'remoteCameraStreams';

const stopAllTracks = (stream: MediaStream | null): void => stream?.getTracks().forEach((t) => t.stop());

export class VoiceSession {
  readonly #socket: SocketLike;
  readonly #env: VoiceEnvironment;
  readonly #callbacks: () => VoiceSessionCallbacks;
  readonly #listeners = new Set<() => void>();
  readonly #mixer = new SpatialVoiceMixer();
  readonly #vad: VoiceActivityDetector;

  #state: VoiceState = INITIAL_STATE;
  #unbind: (() => void) | null = null;
  #audioContainer: HTMLElement | null = null;

  #localStream: MediaStream | null = null;
  #micRequest: Promise<void> | null = null;
  #screenStream: MediaStream | null = null;
  #cameraStream: MediaStream | null = null;
  readonly #peers = new Map<string, VoicePeer>();
  readonly #pendingIce = new Map<string, RTCIceCandidateInit[]>();
  readonly #screenSenders = new Map<string, RTCRtpSender[]>();
  readonly #cameraSenders = new Map<string, RTCRtpSender[]>();

  constructor(socket: SocketLike, callbacks: () => VoiceSessionCallbacks, environment: VoiceEnvironment = browserVoiceEnvironment) {
    this.#socket = socket;
    this.#callbacks = callbacks;
    this.#env = environment;
    this.#vad = new VoiceActivityDetector({
      onSpeakingChange: (isSpeaking) => this.#socket.emit('voice:speaking', { isSpeaking }),
      isMuted: () => this.#state.isMuted
    });
  }

  // ---------- external store ----------

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  };

  readonly getSnapshot = (): VoiceState => this.#state;

  // Csak valódi változáskor értesít (pl. az unlockAllAudio minden kattintásnál fut)
  #update(patch: Partial<VoiceState>): void {
    const keys = Object.keys(patch) as Array<keyof VoiceState>;
    if (keys.every((key) => Object.is(this.#state[key], patch[key]))) return;
    this.#state = { ...this.#state, ...patch };
    this.#listeners.forEach((l) => l());
  }

  #setRemoteStream(key: StreamMapKey, peerId: string, stream: MediaStream): void {
    const current = this.#state[key];
    if (current.get(peerId) === stream) return;
    this.#update({ [key]: new Map(current).set(peerId, stream) });
  }

  #removeRemoteStream(key: StreamMapKey, peerId: string): void {
    const current = this.#state[key];
    if (!current.has(peerId)) return;
    const next = new Map(current);
    next.delete(peerId);
    this.#update({ [key]: next });
  }

  // ---------- lifecycle ----------

  /** Binds socket and window events and creates the hidden audio container. Idempotent. */
  start(): void {
    if (this.#unbind) return;
    // Rejtett audio konténer (nem display:none, mert a böngésző felfüggesztené a hangot)
    let div = document.getElementById(AUDIO_CONTAINER_ID);
    if (!div) {
      div = document.createElement('div');
      div.id = AUDIO_CONTAINER_ID;
      Object.assign(div.style, {
        position: 'fixed', top: '-9999px', left: '-9999px',
        width: '1px', height: '1px', opacity: '0', pointerEvents: 'none'
      });
      document.body.appendChild(div);
    }
    this.#audioContainer = div;

    const unlock = () => this.unlockAllAudio();
    UNLOCK_EVENTS.forEach((e) => window.addEventListener(e, unlock));

    const handlers: Array<[string, (payload: unknown) => void]> = [
      ['voice:joined', (p) => { void this.#onJoined(p); }],
      ['voice:peer-joined', (p) => this.#onPeerJoined(p)],
      ['voice:peer-left', (p) => this.#onPeerLeft(p)],
      ['voice:user-camera', (p) => { if (isRecord(p) && !p.isOn) this.#removeRemoteStream('remoteCameraStreams', stringField(p, 'userId') ?? ''); }],
      ['voice:user-screen-sharing', (p) => { if (isRecord(p) && !p.isSharing) this.#removeRemoteStream('remoteScreenStreams', stringField(p, 'userId') ?? ''); }],
      ['webrtc:signal', (p) => { void this.#onSignal(p); }]
    ];
    handlers.forEach(([event, handler]) => this.#socket.on(event, handler));

    this.#unbind = () => {
      handlers.forEach(([event, handler]) => this.#socket.off(event, handler));
      UNLOCK_EVENTS.forEach((e) => window.removeEventListener(e, unlock));
      div?.remove();
      this.#audioContainer = null;
    };
  }

  stop(): void {
    this.#unbind?.();
    this.#unbind = null;
  }

  // ---------- join / leave ----------

  async joinChannel(channelId: string): Promise<void> {
    if (this.#state.activeVoiceChannel === channelId) return;
    try {
      playJoinSound();
      if (this.#state.activeVoiceChannel) this.#cleanupAllPeers(); // másik szobából váltunk

      if (!this.#localStream) {
        try {
          // Gyors egymás utáni csatlakozáskor is csak egy mikrofon-kérés fut
          this.#micRequest ??= this.#acquireMicrophone().finally(() => { this.#micRequest = null; });
          await this.#micRequest;
        } catch (micErr) {
          console.warn('Mikrofon nem érhető el, csak hallgatási mód aktív.', micErr);
        }
      }

      this.#socket.emit('voice:join', { channelId });
      this.#update({ activeVoiceChannel: channelId });
      this.unlockAllAudio();
    } catch (err) {
      console.error('Hangcsatorna csatlakozási hiba:', err);
    }
  }

  leaveChannel(): void {
    playLeaveSound();
    if (this.#screenStream) void this.#stopScreenShare();
    if (this.#cameraStream) void this.#stopCamera();

    this.#socket.emit('voice:leave');
    this.#update({ activeVoiceChannel: null });

    this.#cleanupAllPeers();
    this.#update({ remoteScreenStreams: new Map(), remoteCameraStreams: new Map() });
    this.#vad.stop();

    stopAllTracks(this.#localStream);
    this.#localStream = null;

    this.#callbacks().onLeft?.();
  }

  async #acquireMicrophone(): Promise<void> {
    let stream: MediaStream;
    try {
      stream = await this.#env.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });
    } catch (constraintErr) {
      console.warn('Fejlett audio beállítások sikertelenek, alap mikrofon...', constraintErr);
      stream = await this.#env.getUserMedia({ audio: true, video: false });
    }
    stream.getAudioTracks().forEach((t) => { t.enabled = !this.#state.isMuted; });
    this.#localStream = stream;
    this.#vad.start(stream);
  }

  // ---------- mute / deafen / volume ----------

  toggleMute(): void {
    const { isMuted, isDeafened } = this.#state;
    const next = !isMuted;
    this.#update({ isMuted: next });
    playMuteSound(next);
    this.#localStream?.getAudioTracks().forEach((t) => { t.enabled = !next; });
    if (next) this.#vad.setSpeaking(false);
    this.#socket.emit('voice:state-change', { isMuted: next, isDeafened });
  }

  toggleDeafen(): void {
    const { isMuted, isDeafened } = this.#state;
    const next = !isDeafened;
    this.#update({ isDeafened: next });
    playMuteSound(next);
    this.#peers.forEach((peer) => {
      if (peer.spatial) this.#mixer.setDeafened(peer.spatial, next);
      else peer.audioEl.muted = next;
    });
    this.#localStream?.getAudioTracks().forEach((t) => { t.enabled = !next && !isMuted; });
    this.#socket.emit('voice:state-change', { isMuted: next ? true : isMuted, isDeafened: next });
  }

  // Csak a már létező bejövő hang hangerejét állítja (játékon belüli csapat- és közelségi hang)
  setPeerVolume(peerId: string, volume: number): void {
    const audioEl = this.#peers.get(peerId)?.audioEl;
    if (audioEl) audioEl.volume = volume;
  }

  // cfg null: visszaáll a normál (nem térbeli) hang
  setPeerSpatial(peerId: string, cfg: SpatialConfig | null): void {
    const peer = this.#peers.get(peerId);
    if (!peer) return;
    if (!cfg) {
      peer.spatialCfg = null;
      if (peer.spatial) {
        SpatialVoiceMixer.teardown(peer.spatial);
        peer.spatial = null;
        peer.audioEl.muted = this.#state.isDeafened;
        peer.audioEl.play()?.catch(() => {});
      }
      return;
    }
    peer.spatialCfg = cfg;
    try { this.#applySpatial(peer); } catch (e) { console.warn('[WebRTC] Térbeli hang hiba:', e); }
  }

  #applySpatial(peer: VoicePeer): void {
    const cfg = peer.spatialCfg;
    if (!cfg || !peer.remoteStream) return;
    const chain = this.#mixer.apply(peer.spatial, peer.remoteStream, cfg, this.#state.isDeafened);
    if (!chain) return;
    peer.spatial = chain;
    // Normál út némítva, hogy ne szóljon duplán, de a stream csatolva marad
    peer.audioEl.muted = true;
    peer.audioEl.play()?.catch(() => {});
  }

  // ---------- autoplay ----------

  unlockAllAudio(): void {
    const vadCtx = this.#vad.context;
    if (vadCtx?.state === 'suspended') vadCtx.resume().catch(() => {});
    this.#mixer.resume();
    let allOk = true;
    this.#peers.forEach((peer, peerId) => {
      if (!peer.spatial) peer.audioEl.muted = this.#state.isDeafened;
      peer.audioEl.play()?.catch((err: unknown) => {
        console.warn(`[WebRTC] Audio play warning (${peerId}):`, err);
        allOk = false;
      });
    });
    if (allOk) this.#update({ autoplayBlocked: false });
  }

  // ---------- screen share ----------

  toggleScreenShare(): Promise<void> {
    return this.#state.isScreenSharing ? this.#stopScreenShare() : this.#startScreenShare();
  }

  async #startScreenShare(): Promise<void> {
    if (!this.#state.activeVoiceChannel) {
      alert('Kérlek előbb lépj be egy hangcsatornába a képernyőmegosztáshoz!');
      return;
    }
    try {
      // A `cursor` a Screen Capture megkötése; a DOM típusokban nem szerepel
      const video: MediaTrackConstraints & { cursor: string } = { cursor: 'always', frameRate: { ideal: 30, max: 60 } };
      const stream = await this.#env.getDisplayMedia({
        video,
        // Feldolgozás nélküli (zene/játék) hang: a zajszűrés és visszhangcsökkentés tönkretenné
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      if (stream.getAudioTracks().length === 0) {
        console.info('[ScreenShare] A böngésző nem adott hangot (Chrome-ban a "Rendszerhang/Fül hang megosztása" jelölőnégyzet kell).');
      }
      this.#screenStream = stream;
      this.#update({ localScreenStream: stream, isScreenSharing: true });
      this.#callbacks().onScreenShareStart?.();

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) videoTrack.onended = () => { void this.#stopScreenShare(); }; // a böngésző saját leállító gombja

      await this.#addTracksToAllPeers(stream, this.#screenSenders, 'all', 'képernyő');
      this.#socket.emit('voice:screen-share', { isSharing: true });
    } catch (err) {
      console.warn('Képernyőmegosztás megszakítva vagy megtagadva:', err);
    }
  }

  async #stopScreenShare(): Promise<void> {
    stopAllTracks(this.#screenStream);
    this.#screenStream = null;
    this.#update({ localScreenStream: null, isScreenSharing: false });
    await this.#removeSendersFromAllPeers(this.#screenSenders, 'képernyő');
    this.#socket.emit('voice:screen-share', { isSharing: false });
  }

  // ---------- camera ----------

  toggleCamera(): Promise<void> {
    return this.#state.isCameraOn ? this.#stopCamera() : this.#startCamera();
  }

  async #startCamera(): Promise<void> {
    if (!this.#state.activeVoiceChannel) {
      alert('Kérlek előbb lépj be egy hangcsatornába a kamera bekapcsolásához!');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await this.#env.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: false
      });
    } catch (err) {
      console.warn('Kamera nem érhető el:', err);
      alert('A kamera nem érhető el. Ellenőrizd, hogy van-e kamerád, és megadtad-e az engedélyt a böngészőben.');
      return;
    }

    this.#cameraStream = stream;
    this.#update({ localCameraStream: stream, isCameraOn: true });
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) videoTrack.onended = () => { void this.#stopCamera(); }; // pl. kihúzták a kamerát

    await this.#addTracksToAllPeers(stream, this.#cameraSenders, 'video', 'kamera');
    this.#socket.emit('voice:camera', { isOn: true });
  }

  async #stopCamera(): Promise<void> {
    stopAllTracks(this.#cameraStream);
    this.#cameraStream = null;
    this.#update({ localCameraStream: null, isCameraOn: false });
    await this.#removeSendersFromAllPeers(this.#cameraSenders, 'kamera');
    this.#socket.emit('voice:camera', { isOn: false });
  }

  // ---------- tracks and renegotiation ----------

  // A képernyő videó- ÉS hangsávját is elküldjük, azonos streamben, hogy a fogadó fel tudja ismerni.
  // A kamerából csak a videó megy.
  #addTracks(peerId: string, pc: RTCPeerConnection, stream: MediaStream, registry: Map<string, RTCRtpSender[]>, kinds: 'all' | 'video'): void {
    const senders: RTCRtpSender[] = [];
    const tracks = kinds === 'video' ? stream.getVideoTracks() : stream.getTracks();
    tracks.forEach((track) => {
      try {
        senders.push(pc.addTrack(track, stream));
      } catch (e) {
        console.warn(`[WebRTC] ${kinds === 'video' ? 'Camera' : 'Screen'} track hozzáadási hiba:`, e);
      }
    });
    registry.set(peerId, senders);
  }

  async #addTracksToAllPeers(stream: MediaStream, registry: Map<string, RTCRtpSender[]>, kinds: 'all' | 'video', label: string): Promise<void> {
    for (const [peerId, { pc }] of this.#peers.entries()) {
      try {
        this.#addTracks(peerId, pc, stream, registry, kinds);
        await this.#renegotiate(peerId, pc);
      } catch (e) {
        console.error(`[WebRTC] Hiba ${label} sáv hozzáadásakor (${peerId}):`, e);
      }
    }
  }

  async #removeSendersFromAllPeers(registry: Map<string, RTCRtpSender[]>, label: string): Promise<void> {
    for (const [peerId, { pc }] of this.#peers.entries()) {
      const senders = registry.get(peerId) || [];
      if (senders.length && pc.signalingState !== 'closed') {
        try {
          senders.forEach((sender) => pc.removeTrack(sender));
          await this.#renegotiate(peerId, pc);
        } catch (e) {
          console.warn(`[WebRTC] Hiba ${label} sáv visszavonásakor:`, e);
        }
      }
      registry.delete(peerId);
    }
  }

  // Új tárgyalás egy meglévő peerrel (sáv hozzáadása/eltávolítása után)
  async #renegotiate(peerId: string, pc: RTCPeerConnection): Promise<void> {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.#sendDescription(peerId, 'offer', offer);
  }

  // ---------- signalling ----------

  #sendSignal(targetPeerId: string, signal: unknown): void {
    this.#socket.emit('webrtc:signal', { targetPeerId, signal });
  }

  // Offer/answer mellé küldjük, melyik stream a kamera és melyik a képernyő, így a fogadó
  // az ontrack pillanatában már tudja, mire használja a beérkező videót (nincs versenyhelyzet).
  #sendDescription(peerId: string, type: 'offer' | 'answer', sdp: RTCSessionDescriptionInit): void {
    this.#sendSignal(peerId, {
      type,
      sdp,
      streams: { camera: this.#cameraStream?.id || null, screen: this.#screenStream?.id || null }
    });
  }

  async #onSignal(payload: unknown): Promise<void> {
    const parsed = parseVoiceSignal(payload);
    if (!parsed) return;
    const { senderPeerId, signal } = parsed;
    try {
      await this.#handleSignal(senderPeerId, signal);
    } catch (err) {
      console.error('[WebRTC] Szignál hiba:', err);
    }
  }

  async #handleSignal(peerId: string, signal: VoiceSignal): Promise<void> {
    if (signal.type === 'ice-candidate') await this.#handleIceCandidate(peerId, signal.candidate);
    else if (signal.type === 'offer') await this.#handleOffer(peerId, signal.sdp, signal.streams);
    else await this.#handleAnswer(peerId, signal.sdp, signal.streams);
  }

  async #initiatePeerConnection(peerId: string): Promise<void> {
    try {
      const { pc } = this.#createPeerConnection(peerId);
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      this.#sendDescription(peerId, 'offer', offer);
    } catch (err) {
      console.error(`[WebRTC] Hiba kapcsolat kezdeményezésekor (${peerId}):`, err);
    }
  }

  async #handleOffer(peerId: string, sdp: RTCSessionDescriptionInit, streams: StreamKinds | undefined): Promise<void> {
    try {
      let peer = this.#peers.get(peerId);
      if (!peer || peer.pc.signalingState === 'closed') peer = this.#createPeerConnection(peerId);
      const { pc } = peer;
      peer.streamKinds = streams || {};
      await pc.setRemoteDescription(sdp);
      await this.#drainIceQueue(peerId, pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.#sendDescription(peerId, 'answer', answer);
    } catch (err) {
      console.error(`[WebRTC] Hiba offer fogadásakor (${peerId}):`, err);
    }
  }

  async #handleAnswer(peerId: string, sdp: RTCSessionDescriptionInit, streams: StreamKinds | undefined): Promise<void> {
    try {
      const peer = this.#peers.get(peerId);
      if (!peer) return;
      const { pc } = peer;
      if (pc.signalingState === 'have-local-offer') {
        peer.streamKinds = streams || {};
        await pc.setRemoteDescription(sdp);
        await this.#drainIceQueue(peerId, pc);
      } else {
        console.warn(`[WebRTC] Answer váratlan állapotban: ${pc.signalingState} (${peerId})`);
      }
    } catch (err) {
      console.error(`[WebRTC] Hiba answer fogadásakor (${peerId}):`, err);
    }
  }

  // Az ICE candidate-ek sorba kerülnek, amíg nincs remote description (versenyhelyzet ellen)
  async #handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit | null): Promise<void> {
    if (!candidate) return;
    try {
      const peer = this.#peers.get(peerId);
      if (peer?.pc.remoteDescription?.type) {
        await peer.pc.addIceCandidate(candidate);
      } else if (peer) {
        peer.candidateQueue.push(candidate);
      } else {
        const queue = this.#pendingIce.get(peerId) || [];
        queue.push(candidate);
        this.#pendingIce.set(peerId, queue);
      }
    } catch (err) {
      console.warn(`[WebRTC] Hiba candidate hozzáadásakor (${peerId}):`, err);
    }
  }

  async #drainIceQueue(peerId: string, pc: RTCPeerConnection): Promise<void> {
    const peer = this.#peers.get(peerId);
    const candidates = [...(peer?.candidateQueue || []), ...(this.#pendingIce.get(peerId) || [])];
    if (peer) peer.candidateQueue = [];
    this.#pendingIce.delete(peerId);
    for (const cand of candidates) {
      try {
        await pc.addIceCandidate(cand);
      } catch (e) {
        console.warn(`[WebRTC] Hiba tárolt candidate hozzáadásakor (${peerId}):`, e);
      }
    }
  }

  async #restartIce(peerId: string): Promise<void> {
    try {
      const pc = this.#peers.get(peerId)?.pc;
      if (!pc || pc.signalingState === 'closed') return;
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      this.#sendDescription(peerId, 'offer', offer);
    } catch (err) {
      console.warn(`[WebRTC] ICE restart hiba (${peerId}):`, err);
    }
  }

  // ---------- peer connections ----------

  #createPeerConnection(peerId: string): VoicePeer {
    this.#cleanupPeer(peerId);

    const pc = this.#env.createPeerConnection(RTC_CONFIG);
    const audioEl = document.createElement('audio');
    audioEl.autoplay = true;
    audioEl.muted = this.#state.isDeafened;
    audioEl.setAttribute('data-peer-id', peerId);
    this.#audioContainer?.appendChild(audioEl);

    const peer: VoicePeer = { pc, audioEl, candidateQueue: [], remoteStream: null, streamKinds: {}, spatial: null, spatialCfg: null };
    this.#peers.set(peerId, peer);

    // Helyi mikrofon, vagy kötelező fogadó transzceiver ha nincs mikrofon
    const local = this.#localStream;
    const audioTracks = local?.getAudioTracks() || [];
    if (local && audioTracks.length > 0) {
      audioTracks.forEach((track) => {
        try { pc.addTrack(track, local); } catch (e) { console.warn('[WebRTC] addTrack hiba:', e); }
      });
    } else {
      try { pc.addTransceiver('audio', { direction: 'recvonly' }); } catch (e) { console.warn('[WebRTC] addTransceiver hiba:', e); }
    }

    // Már aktív képernyőmegosztás / kamera
    if (this.#screenStream) this.#addTracks(peerId, pc, this.#screenStream, this.#screenSenders, 'all');
    if (this.#cameraStream) this.#addTracks(peerId, pc, this.#cameraStream, this.#cameraSenders, 'video');

    pc.ontrack = (event) => this.#onTrack(peerId, peer, event);
    pc.onicecandidate = (event) => {
      if (event.candidate) this.#sendSignal(peerId, { type: 'ice-candidate', candidate: event.candidate });
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') void this.#restartIce(peerId);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected' && audioEl.srcObject) {
        audioEl.muted = peer.spatial ? true : this.#state.isDeafened;
        audioEl.play().catch(() => this.#update({ autoplayBlocked: true }));
      }
    };
    return peer;
  }

  #onTrack(peerId: string, peer: VoicePeer, event: RTCTrackEvent): void {
    const stream = event.streams?.[0] || new MediaStream([event.track]);

    // Videót tartalmazó stream: kamera vagy képernyőmegosztás (az offer/answer címkéi alapján).
    // Címke nélkül (régi kliens) képernyőnek tekintjük. A mikrofon audio-only stream.
    if (stream.getVideoTracks().length > 0) {
      if (stream.id === peer.streamKinds.camera) {
        this.#setRemoteStream('remoteCameraStreams', peerId, stream);
      } else {
        this.#setRemoteStream('remoteScreenStreams', peerId, stream);
        event.track.onended = () => {
          if (event.track.kind === 'video') this.#removeRemoteStream('remoteScreenStreams', peerId);
        };
      }
      return;
    }

    if (event.track.kind === 'audio') {
      peer.remoteStream = stream;
      peer.audioEl.srcObject = stream;
      if (peer.spatialCfg) this.#applySpatial(peer);

      const playAudio = () => {
        peer.audioEl.muted = peer.spatial ? true : this.#state.isDeafened;
        peer.audioEl.play().catch((err: unknown) => {
          console.warn(`[WebRTC] Bejövő hang lejátszása blokkolva (${peerId}):`, err);
          this.#update({ autoplayBlocked: true });
        });
      };
      playAudio();
      event.track.onunmute = playAudio;
    }
  }

  #cleanupPeer(peerId: string): void {
    const peer = this.#peers.get(peerId);
    if (peer) {
      try {
        const { pc } = peer;
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.oniceconnectionstatechange = null;
        pc.onconnectionstatechange = null;
        pc.close();
      } catch { /* ignore */ }
      if (peer.spatial) SpatialVoiceMixer.teardown(peer.spatial);
      peer.spatial = null;
      try {
        peer.audioEl.srcObject = null;
        peer.audioEl.pause();
        peer.audioEl.remove();
      } catch { /* ignore */ }
      this.#peers.delete(peerId);
    }
    this.#pendingIce.delete(peerId);
    this.#screenSenders.delete(peerId);
    this.#cameraSenders.delete(peerId);
  }

  #cleanupAllPeers(): void {
    [...this.#peers.keys()].forEach((id) => this.#cleanupPeer(id));
    this.#mixer.close();
    this.#pendingIce.clear();
    this.#screenSenders.clear();
    this.#cameraSenders.clear();
  }

  // ---------- server events ----------

  async #onJoined(payload: unknown): Promise<void> {
    for (const peerId of parseJoinedPeers(payload)) await this.#initiatePeerConnection(peerId);
  }

  // Tartalék: ha 3.5 mp-en belül nem épül ki a kapcsolat, mi indítjuk
  #onPeerJoined(payload: unknown): void {
    const peerId = stringField(payload, 'peerId');
    if (peerId === undefined) return;
    setTimeout(() => {
      if (this.#state.activeVoiceChannel && (!this.#peers.has(peerId) || this.#peers.get(peerId)?.pc.connectionState === 'new')) {
        void this.#initiatePeerConnection(peerId);
      }
    }, PEER_FALLBACK_CONNECT_MS);
  }

  #onPeerLeft(payload: unknown): void {
    const peerId = stringField(payload, 'peerId');
    if (peerId === undefined) return;
    this.#cleanupPeer(peerId);
    this.#removeRemoteStream('remoteScreenStreams', peerId);
    this.#removeRemoteStream('remoteCameraStreams', peerId);
  }
}
