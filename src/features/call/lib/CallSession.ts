// DM hanghívás: valódi WebRTC (RTCPeerConnection) + szignálozás a meglévő Socket.IO kapcsolaton.
// Egy példány egy felhasználó hívásait kezeli: a hívás állapotát (CallState), a mikrofont, a
// peer-kapcsolatot, a hangszintmérőket és a csengőhangokat. A React a subscribe/getSnapshot
// páron keresztül figyeli (useSyncExternalStore). Életciklus: start() köti be a socket- és
// ablak-eseményeket, stop() leköti őket és minden erőforrást felszabadít.
import { RTC_CONFIG } from '../../../config';
import type { SocketLike } from '../../../shared/services/socket/SocketLike';
import { isRecord } from '../../../shared/lib/guards';
import { getCallSettings, QUALITY_PRESETS } from './callSettings';
import { tuneOpusSdp } from './sdp';
import { createLevelMeter, levelStore, type LevelMeter } from './audioLevel';
import {
  startIncomingRingtone, startOutgoingRingback, stopAllCallSounds, unlockCallAudio,
  playCallConnected, playCallEnded, playCallMissed, playCallDeclined
} from './callSounds';
import { notifyIncomingCall, closeIncomingNotification, requestNotificationPermission } from './callNotification';
import { getMic, micErrorCode, type GetUserMedia } from './callMedia';
import { CallStatsAnalyzer, type StatsEntry } from './CallStatsAnalyzer';
import {
  callIdOf, parseAcceptAck, parseCallEnded, parseCallSignal, parseIncomingCall, parseInviteAck, parseSyncAck,
  type CallActionResult, type CallFinishStatus, type CallPartner, type CallPeer, type CallSignal, type CallState
} from '../types';

const TERMINAL_DISPLAY_MS = 3200;
const RECONNECT_GIVE_UP_MS = 25000;
const DEFAULT_BITRATE = 64000;
const lower = (s: string | null | undefined): string => (s || '').toLowerCase();

const FINISH_STATUSES: ReadonlySet<string> = new Set<CallFinishStatus>(
  ['ended', 'declined', 'missed', 'busy', 'failed', 'cancelled', 'handled', 'completed']
);
const isFinishStatus = (s: string): s is CallFinishStatus => FINISH_STATUSES.has(s);

/** Browser APIs the session needs; replaceable in tests. */
export interface CallEnvironment {
  getUserMedia: GetUserMedia;
  createPeerConnection(config: RTCConfiguration): RTCPeerConnection;
}

export const browserCallEnvironment: CallEnvironment = {
  getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
  createPeerConnection: (config) => new RTCPeerConnection(config)
};

export interface CallSessionOptions {
  socket: SocketLike;
  /** The logged-in user, read at call time. */
  getCurrentUser: () => { username: string } | null;
  /** Runs right before a call starts or is accepted (e.g. leave the voice room: one mic at a time). */
  onBeforeCall?: () => void;
  environment?: CallEnvironment;
}

type Timer = ReturnType<typeof setTimeout>;
type CallUpdate = CallState | null | ((current: CallState | null) => CallState | null);

const bitrateCap = (): number => QUALITY_PRESETS[getCallSettings().quality]?.bitrate || DEFAULT_BITRATE;

const stopTracks = (stream: MediaStream): void => {
  stream.getTracks().forEach((t) => { t.onended = null; t.stop(); });
};

export class CallSession {
  readonly #socket: SocketLike;
  readonly #getCurrentUser: () => { username: string } | null;
  readonly #onBeforeCall: () => void;
  readonly #env: CallEnvironment;
  readonly #listeners = new Set<() => void>();
  readonly #stats = new CallStatsAnalyzer();

  #call: CallState | null = null;
  #unbind: (() => void) | null = null;

  #pc: RTCPeerConnection | null = null;
  #localStream: MediaStream | null = null;
  #audioEl: HTMLAudioElement | null = null;
  #iceServers: RTCIceServer[] | null = null;
  #pendingCandidates: RTCIceCandidateInit[] = [];
  #earlySignals: CallSignal[] = [];
  #lastOfferSdp: string | null = null;
  #signalQueue: Promise<void> = Promise.resolve();
  #stopRingSound: (() => void) | null = null;
  #terminalTimer: Timer | undefined;
  #reconnectTimer: Timer | null = null;
  #disconnectTimer: Timer | null = null;
  #statsTimer: Timer | undefined;
  #meterTimer: Timer | undefined;
  #localMeter: LevelMeter | null = null;
  #remoteMeter: LevelMeter | null = null;
  #everConnected = false;
  #currentBitrate = 0;
  #muted = false;

  constructor({ socket, getCurrentUser, onBeforeCall, environment = browserCallEnvironment }: CallSessionOptions) {
    this.#socket = socket;
    this.#getCurrentUser = getCurrentUser;
    this.#onBeforeCall = onBeforeCall ?? (() => {});
    this.#env = environment;
  }

  // ---------- external store ----------

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  };

  readonly getSnapshot = (): CallState | null => this.#call;

  get isInCall(): boolean {
    return !!this.#call && !this.#call.terminal;
  }

  #setCall(update: CallUpdate): void {
    const next = typeof update === 'function' ? update(this.#call) : update;
    if (next === this.#call) return;
    this.#call = next;
    this.#listeners.forEach((l) => l());
  }

  #patch(fields: Partial<CallState>): void {
    this.#setCall((c) => (c ? { ...c, ...fields } : c));
  }

  // ---------- lifecycle ----------

  /** Binds the socket and window events. Idempotent. */
  start(): void {
    if (this.#unbind) return;
    const socketHandlers: Array<[string, (...args: unknown[]) => void]> = [
      ['call:incoming', (p) => this.#onIncoming(p)],
      ['call:accepted', (p) => { void this.#onAccepted(p); }],
      ['call:signal', (p) => this.#onSignal(p)],
      ['call:ended', (p) => this.#onEnded(p)],
      ['call:handled-elsewhere', (p) => this.#onHandledElsewhere(p)],
      ['call:peer-reconnecting', (p) => this.#onPeerReconnecting(p)],
      ['call:peer-reconnected', (p) => this.#onPeerReconnected(p)],
      ['init:data', () => this.#onSocketReinit()]
    ];
    const onNetworkBack = () => this.#onNetworkBack();
    const onPageHide = () => this.#onPageHide();
    socketHandlers.forEach(([event, handler]) => this.#socket.on(event, handler));
    window.addEventListener('online', onNetworkBack);
    window.addEventListener('pagehide', onPageHide);
    this.#unbind = () => {
      socketHandlers.forEach(([event, handler]) => this.#socket.off(event, handler));
      window.removeEventListener('online', onNetworkBack);
      window.removeEventListener('pagehide', onPageHide);
    };
  }

  /** Unbinds all events and releases the microphone, the connection and the sounds. */
  stop(): void {
    this.#unbind?.();
    this.#unbind = null;
    this.#stopSound();
    this.#cleanupMedia();
  }

  // ---------- public actions ----------

  async startCall(partner: CallPartner | null | undefined): Promise<CallActionResult> {
    const me = this.#getCurrentUser();
    if (!me || !partner?.username) return { ok: false, error: 'unauthenticated' };
    if (this.#call && !this.#call.terminal) return { ok: false, error: 'already-in-call' };
    if (lower(partner.username) === lower(me.username)) return { ok: false, error: 'self' };
    clearTimeout(this.#terminalTimer);
    unlockCallAudio(); // kattintás közben: a böngésző engedi a hangot
    requestNotificationPermission();
    this.#onBeforeCall();

    const peer: CallPeer = {
      username: partner.username,
      displayName: partner.displayName || partner.username,
      avatarColor: partner.avatarColor,
      avatarUrl: partner.avatarUrl
    };
    this.#setCall({ id: null, direction: 'outgoing', peer, status: 'calling', muted: false, peerMuted: false });
    this.#muted = false;

    try {
      await this.#acquireMic();
    } catch (err) {
      this.#cleanupMedia();
      const reason = micErrorCode(err);
      this.#setCall({ id: null, direction: 'outgoing', peer, status: 'failed', reason, terminal: true });
      this.#terminalTimer = setTimeout(() => this.#setCall(null), 5000);
      return { ok: false, error: reason };
    }

    return new Promise((resolve) => {
      this.#socket.emit('call:invite', { targetUsername: partner.username }, (raw: unknown) => {
        const res = parseInviteAck(raw);
        if (!res.ok) {
          const reason = res.error || 'generic';
          if (res.peer) peer.avatarColor = res.peer.avatarColor || peer.avatarColor;
          this.#finishLocally(reason === 'busy' ? 'busy' : 'failed', { reason }, { id: null, direction: 'outgoing', peer, status: 'calling' });
          clearTimeout(this.#terminalTimer);
          this.#terminalTimer = setTimeout(() => this.#setCall(null), 4500);
          resolve({ ok: false, error: reason });
          return;
        }
        this.#iceServers = res.iceServers ?? null;
        if (res.peer) Object.assign(peer, { avatarColor: res.peer.avatarColor, avatarUrl: res.peer.avatarUrl });
        this.#setCall((c) => (c ? { ...c, id: res.callId ?? null, peer: { ...peer }, status: 'ringing', turn: res.turnEnabled } : c));
        this.#stopSound();
        this.#stopRingSound = startOutgoingRingback();
        resolve({ ok: true });
      });
    });
  }

  async acceptCall(): Promise<void> {
    const c = this.#call;
    if (!c || c.direction !== 'incoming' || c.status !== 'ringing') return;
    unlockCallAudio();
    this.#stopSound();
    closeIncomingNotification();
    this.#onBeforeCall();
    this.#setCall({ ...c, status: 'connecting' });
    this.#muted = false;

    try {
      await this.#acquireMic();
    } catch (err) {
      this.#socket.emit('call:decline', { callId: c.id });
      this.#cleanupMedia();
      this.#setCall({ ...c, status: 'failed', reason: micErrorCode(err), terminal: true });
      this.#terminalTimer = setTimeout(() => this.#setCall(null), 5000);
      return;
    }

    this.#socket.emit('call:accept', { callId: c.id }, (raw: unknown) => {
      const res = parseAcceptAck(raw);
      if (!res.ok) {
        this.#finishLocally('missed', { reason: 'expired' });
        return;
      }
      // A kapcsolat azonnal felépül, az offer-t a hívó küldi
      this.#createPeerConnection(res.iceServers ?? null);
      const early = this.#earlySignals;
      this.#earlySignals = [];
      early.forEach((signal) => this.#enqueueSignal(signal));
    });
  }

  declineCall(): void {
    const c = this.#call;
    if (!c || c.direction !== 'incoming') return;
    this.#socket.emit('call:decline', { callId: c.id });
    this.#stopSound();
    closeIncomingNotification();
    this.#setCall(null);
  }

  endCall(): void {
    const c = this.#call;
    if (!c || c.terminal) return;
    if (c.id) this.#socket.emit('call:end', { callId: c.id });
    const status: CallFinishStatus = this.#everConnected ? 'completed' : (c.direction === 'outgoing' ? 'cancelled' : 'declined');
    this.#finishLocally(status, { durationSec: c.startedAt ? Math.round((Date.now() - c.startedAt) / 1000) : 0 });
  }

  dismiss(): void {
    clearTimeout(this.#terminalTimer);
    this.#setCall(null);
  }

  toggleMute(): void {
    const track = this.#localStream?.getAudioTracks()[0];
    this.#muted = !this.#muted;
    if (track) track.enabled = !this.#muted; // a némítás a forrásnál történik: semmi nem hagyja el az eszközt
    this.#patch({ muted: this.#muted });
    this.#emitSignal({ type: 'media', muted: this.#muted });
  }

  async setInputDevice(deviceId: string): Promise<void> {
    try { await this.#switchInput(deviceId, false); } catch { this.#patch({ warning: 'mic-lost' }); }
  }

  // Zajszűrés / visszhangcsökkentés / AGC módosítása hívás közben (a mikrofon újraindítása szünet nélkül)
  async reapplyProcessing(): Promise<void> {
    if (!this.#localStream) return;
    try { await this.#switchInput(getCallSettings().inputDeviceId, true); } catch { /* ignore */ }
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    if (this.#audioEl?.setSinkId) {
      try { await this.#audioEl.setSinkId(deviceId === 'default' ? '' : deviceId); } catch { /* nem támogatott */ }
    }
  }

  retryAudio(): void {
    this.#audioEl?.play().then(() => this.#patch({ warning: null })).catch(() => {});
  }

  // ---------- sounds and cleanup ----------

  #stopSound(): void {
    if (this.#stopRingSound) { this.#stopRingSound(); this.#stopRingSound = null; }
    stopAllCallSounds();
  }

  // Erőforrás-takarítás: mikrofon, kapcsolat, mérők
  #cleanupMedia(): void {
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    if (this.#disconnectTimer) clearTimeout(this.#disconnectTimer);
    clearInterval(this.#statsTimer);
    clearInterval(this.#meterTimer);
    this.#reconnectTimer = this.#disconnectTimer = null;
    this.#statsTimer = this.#meterTimer = undefined;

    this.#localMeter?.stop();
    this.#remoteMeter?.stop();
    this.#localMeter = this.#remoteMeter = null;
    levelStore.set({ local: 0, remote: 0 });

    const pc = this.#pc;
    if (pc) {
      pc.ontrack = pc.onicecandidate = null;
      pc.oniceconnectionstatechange = pc.onconnectionstatechange = null;
      try { pc.getSenders().forEach((s) => { s.replaceTrack(null).catch(() => {}); }); } catch { /* ignore */ }
      try { pc.close(); } catch { /* ignore */ }
      this.#pc = null;
    }
    // A mikrofon végleges elengedése (a böngésző felvétel-jelzője is eltűnik)
    if (this.#localStream) {
      stopTracks(this.#localStream);
      this.#localStream = null;
    }
    if (this.#audioEl) {
      this.#audioEl.pause();
      this.#audioEl.srcObject = null;
      this.#audioEl.remove();
      this.#audioEl = null;
    }
    this.#pendingCandidates = [];
    this.#earlySignals = [];
    this.#lastOfferSdp = null;
    this.#iceServers = null;
    this.#everConnected = false;
    this.#stats.reset();
    this.#muted = false;
  }

  // Lezárás: erőforrások felszabadítása, rövid ideig látható végállapot, majd eltűnik
  /** @param base the call to finish; defaults to the current one. */
  #finishLocally(status: CallFinishStatus, info: Partial<CallState> = {}, base: CallState | null = this.#call): void {
    const c = base;
    if (!c) return;
    this.#stopSound();
    closeIncomingNotification();
    this.#cleanupMedia();

    const incomingRinging = c.direction === 'incoming' && c.status === 'ringing';
    if (status === 'missed') playCallMissed();
    else if (status === 'declined') playCallDeclined();
    else if (status === 'completed' || status === 'ended') playCallEnded();
    else if (status === 'failed' || status === 'busy') playCallDeclined();

    clearTimeout(this.#terminalTimer);
    // Elmulasztott bejövő hívásnál nincs mit mutatni (a DM-ben jelzés marad)
    if (incomingRinging && (status === 'missed' || status === 'handled')) {
      this.#setCall(null);
      return;
    }
    this.#setCall({ ...c, status: status === 'completed' ? 'ended' : status, ...info, terminal: true });
    this.#terminalTimer = setTimeout(() => this.#setCall((cur) => (cur && cur.id === c.id ? null : cur)), TERMINAL_DISPLAY_MS);
  }

  // ---------- microphone ----------

  async #acquireMic(): Promise<MediaStream> {
    const stream = await getMic(this.#env.getUserMedia, getCallSettings());
    this.#localStream = stream;
    this.#attachLocalTrackHandlers(stream);
    return stream;
  }

  #attachLocalTrackHandlers(stream: MediaStream): void {
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !this.#muted;
    // Mikrofon lecsatlakoztatása hívás közben: megpróbálunk az alapértelmezettre váltani
    track.onended = async () => {
      if (!this.#call || this.#call.terminal || this.#localStream !== stream) return;
      this.#patch({ warning: 'mic-lost' });
      try {
        await this.#switchInput('default', true);
        this.#patch({ warning: null });
      } catch {
        this.#patch({ warning: 'mic-lost' });
      }
    };
    this.#localMeter?.stop();
    this.#localMeter = createLevelMeter(new MediaStream([track]));
  }

  // Bemeneti eszköz / feldolgozás cseréje hívás közben (replaceTrack: nincs újratárgyalás, nincs szünet)
  async #switchInput(deviceId: string, silent: boolean): Promise<void> {
    const old = this.#localStream;
    const next = await getMic(this.#env.getUserMedia, getCallSettings(), deviceId);
    const track = next.getAudioTracks()[0] ?? null;
    const sender = this.#pc?.getSenders().find((s) => s.track?.kind === 'audio' || s.track === null);
    if (sender) await sender.replaceTrack(track);
    this.#localStream = next;
    this.#attachLocalTrackHandlers(next);
    if (old) stopTracks(old);
    if (!silent) this.#patch({ warning: null });
  }

  // ---------- RTCPeerConnection ----------

  #emitSignal(signal: CallSignal): void {
    const id = this.#call?.id;
    if (id) this.#socket.emit('call:signal', { callId: id, signal });
  }

  async #applySenderBitrate(bitrate: number): Promise<void> {
    const sender = this.#pc?.getSenders().find((s) => s.track?.kind === 'audio');
    if (!sender) return;
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      const encoding = params.encodings[0];
      if (encoding) {
        encoding.maxBitrate = bitrate;
        encoding.networkPriority = 'high';
        encoding.priority = 'high';
      }
      await sender.setParameters(params);
      this.#currentBitrate = bitrate;
    } catch { /* nem minden böngésző támogatja minden mezőjét */ }
  }

  #startMeters(): void {
    clearInterval(this.#meterTimer);
    this.#meterTimer = setInterval(() => {
      levelStore.set({ local: this.#localMeter?.read() || 0, remote: this.#remoteMeter?.read() || 0 });
    }, 70);
  }

  // Statisztika: minőségjelző + adaptív bitráta
  #startStats(): void {
    clearInterval(this.#statsTimer);
    this.#statsTimer = setInterval(() => { void this.#sampleStats(); }, 2000);
  }

  async #sampleStats(): Promise<void> {
    const pc = this.#pc;
    if (!pc) return;
    try {
      const report = await pc.getStats();
      const entries: StatsEntry[] = [];
      report.forEach((s: StatsEntry) => { entries.push(s); });
      // Biztonsági háló: ha a kapcsolat él, de a felület "újracsatlakozás"-t mutat (pl. csendes
      // ICE-újraindítás után nem érkezik állapotváltás-esemény), visszaállítjuk
      if (pc.connectionState === 'connected' && this.#call?.status === 'reconnecting') this.#markConnected();

      const target = bitrateCap();
      const sample = this.#stats.analyze(entries, this.#currentBitrate, target);
      if (sample.wantedBitrate !== this.#currentBitrate) void this.#applySenderBitrate(sample.wantedBitrate);
      this.#patch({
        quality: sample.quality,
        rttMs: sample.rttMs,
        codec: sample.codec,
        bitrateKbps: Math.round((this.#currentBitrate || target) / 1000),
        route: sample.route
      });
    } catch { /* ignore */ }
  }

  // Helyreállítás: a hívó mindig az offerer, ezért ő indítja az ICE-újraindítást; a hívott fél kérést küld
  async #recoverConnection(): Promise<void> {
    const c = this.#call;
    const pc = this.#pc;
    if (!c || !pc || c.terminal) return;
    if (c.direction === 'outgoing') {
      try {
        await this.#sendOffer(pc, { iceRestart: true });
      } catch (e) { console.warn('[Call] ICE újraindítás sikertelen', e); }
    } else {
      this.#emitSignal({ type: 'restart-request' });
    }
  }

  async #sendOffer(pc: RTCPeerConnection, options: RTCOfferOptions): Promise<void> {
    const offer = await pc.createOffer(options);
    offer.sdp = tuneOpusSdp(offer.sdp ?? '', bitrateCap());
    await pc.setLocalDescription(offer);
    this.#emitSignal({ type: 'offer', sdp: pc.localDescription?.sdp ?? '' });
  }

  #markReconnecting(): void {
    const c = this.#call;
    if (!c || c.terminal || c.status === 'reconnecting') return;
    if (c.status === 'connected') this.#patch({ status: 'reconnecting' });
    if (!this.#reconnectTimer) {
      this.#reconnectTimer = setTimeout(() => {
        this.#reconnectTimer = null;
        const cur = this.#call;
        if (cur && !cur.terminal && (cur.status === 'reconnecting' || cur.status === 'connecting')) {
          this.#socket.emit('call:end', { callId: cur.id });
          this.#finishLocally('failed', { reason: 'connection-lost' });
        }
      }, RECONNECT_GIVE_UP_MS);
    }
  }

  #markConnected(): void {
    const c = this.#call;
    if (!c || c.terminal) return;
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    if (this.#disconnectTimer) clearTimeout(this.#disconnectTimer);
    this.#reconnectTimer = this.#disconnectTimer = null;
    if (!this.#everConnected) {
      this.#everConnected = true;
      this.#stopSound();
      playCallConnected();
      this.#socket.emit('call:connected', { callId: c.id });
      void this.#applySenderBitrate(bitrateCap());
      this.#startStats();
      this.#startMeters();
      this.#setCall((cur) => (cur ? { ...cur, status: 'connected', startedAt: Date.now(), warning: cur.warning } : cur));
    } else {
      this.#setCall((cur) => (cur && cur.status === 'reconnecting' ? { ...cur, status: 'connected' } : cur));
    }
  }

  #createPeerConnection(iceServers: RTCIceServer[] | null): RTCPeerConnection {
    const pc = this.#env.createPeerConnection({
      ...RTC_CONFIG,
      iceServers: iceServers || RTC_CONFIG.iceServers,
      iceCandidatePoolSize: 2
    });
    this.#pc = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.#emitSignal({
          type: 'candidate',
          candidate: { candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex }
        });
      }
    };

    pc.ontrack = (e) => this.#playRemoteStream(e.streams[0] || new MediaStream([e.track]));

    const onState = () => this.#onConnectionStateChange(pc);
    pc.onconnectionstatechange = onState;
    pc.oniceconnectionstatechange = onState;
    return pc;
  }

  #playRemoteStream(stream: MediaStream): void {
    let el = this.#audioEl;
    if (!el) {
      el = document.createElement('audio');
      el.autoplay = true;
      el.style.display = 'none';
      document.body.appendChild(el);
      this.#audioEl = el;
      const out = getCallSettings().outputDeviceId;
      if (out && out !== 'default' && el.setSinkId) el.setSinkId(out).catch(() => {});
    }
    el.srcObject = stream;
    el.play().catch(() => this.#patch({ warning: 'autoplay' }));
    this.#remoteMeter?.stop();
    this.#remoteMeter = createLevelMeter(stream);
  }

  #onConnectionStateChange(pc: RTCPeerConnection): void {
    const cs = pc.connectionState;
    const is = pc.iceConnectionState;
    if (cs === 'connected' || is === 'connected' || is === 'completed') {
      this.#markConnected();
    } else if (cs === 'disconnected' || is === 'disconnected') {
      // Rövid zökkenőket kivárunk, tartós megszakadásnál helyreállítást indítunk
      if (this.#disconnectTimer) return;
      this.#disconnectTimer = setTimeout(() => {
        this.#disconnectTimer = null;
        if (this.#pc === pc && (pc.connectionState === 'disconnected' || pc.iceConnectionState === 'disconnected')) {
          this.#markReconnecting();
          void this.#recoverConnection();
        }
      }, 2500);
      if (this.#everConnected) {
        setTimeout(() => {
          if (this.#pc === pc && pc.connectionState === 'disconnected') this.#patch({ status: 'reconnecting' });
        }, 800);
      }
    } else if (cs === 'failed' || is === 'failed') {
      this.#markReconnecting();
      void this.#recoverConnection();
    }
  }

  #addLocalTrack(pc: RTCPeerConnection): void {
    const stream = this.#localStream;
    const track = stream?.getAudioTracks()[0];
    if (stream && track) pc.addTrack(track, stream);
  }

  async #flushCandidates(pc: RTCPeerConnection): Promise<void> {
    const list = this.#pendingCandidates;
    this.#pendingCandidates = [];
    for (const c of list) {
      try { await pc.addIceCandidate(c); } catch { /* elavult jelölt */ }
    }
  }

  // Beérkező szignálok sorosítva, hogy a duplikált/átfedő üzenetek ne ütközzenek
  #enqueueSignal(signal: CallSignal): void {
    this.#signalQueue = this.#signalQueue
      .then(() => this.#handleSignal(signal))
      .catch((e: unknown) => console.warn('[Call] Szignál hiba', signal.type, e));
  }

  async #handleSignal(signal: CallSignal): Promise<void> {
    const pc = this.#pc;
    if (!pc) return;
    switch (signal.type) {
      case 'offer': {
        if (signal.sdp === this.#lastOfferSdp) return; // duplikált offer
        this.#lastOfferSdp = signal.sdp;
        await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
        if (pc.getSenders().every((s) => !s.track)) this.#addLocalTrack(pc);
        await this.#flushCandidates(pc);
        const answer = await pc.createAnswer();
        answer.sdp = tuneOpusSdp(answer.sdp ?? '', bitrateCap());
        await pc.setLocalDescription(answer);
        this.#emitSignal({ type: 'answer', sdp: pc.localDescription?.sdp ?? '' });
        break;
      }
      case 'answer':
        if (pc.signalingState !== 'have-local-offer') return; // duplikált/késői válasz
        await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
        await this.#flushCandidates(pc);
        break;
      case 'candidate':
        if (!signal.candidate) return;
        if (pc.remoteDescription) {
          try { await pc.addIceCandidate(signal.candidate); } catch { /* ignore */ }
        } else {
          this.#pendingCandidates.push(signal.candidate);
        }
        break;
      case 'restart-request':
        if (this.#call?.direction === 'outgoing') await this.#recoverConnection();
        break;
      case 'media':
        this.#patch({ peerMuted: signal.muted });
        break;
    }
  }

  // ---------- server events ----------

  #onIncoming(payload: unknown): void {
    const incoming = parseIncomingCall(payload);
    if (!incoming) return;
    const cur = this.#call;
    if (cur && !cur.terminal) return; // már van hívásunk (a szerver ezt ritkán engedi át)
    const { callId, caller } = incoming;
    clearTimeout(this.#terminalTimer);
    this.#stopSound();
    this.#stopRingSound = startIncomingRingtone();
    this.#setCall({
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
  }

  async #onAccepted(payload: unknown): Promise<void> {
    const callId = callIdOf(payload);
    const c = this.#call;
    if (!c || c.id !== callId || c.direction !== 'outgoing') return;
    this.#stopSound();
    this.#setCall((cur) => (cur ? { ...cur, status: 'connecting' } : cur));
    try {
      const pc = this.#createPeerConnection(this.#iceServers);
      this.#addLocalTrack(pc);
      await this.#sendOffer(pc, { offerToReceiveAudio: true });
    } catch (e) {
      console.error('[Call] Offer hiba', e);
      this.#socket.emit('call:end', { callId });
      this.#finishLocally('failed', { reason: 'generic' });
    }
  }

  #onSignal(payload: unknown): void {
    if (this.#call?.id !== callIdOf(payload)) return;
    const signal = parseCallSignal(isRecord(payload) ? payload.signal : undefined);
    if (!signal) return;
    // A hívott félnél az offer előbb is megérkezhet, mint hogy a kapcsolata létrejönne: megőrizzük
    if (!this.#pc) { this.#earlySignals.push(signal); return; }
    this.#enqueueSignal(signal);
  }

  #onEnded(payload: unknown): void {
    const ended = parseCallEnded(payload);
    const c = this.#call;
    if (!ended || !c || c.id !== ended.callId || c.terminal) return;
    const status = ended.status === 'completed' ? 'ended' : ended.status;
    this.#finishLocally(isFinishStatus(status) ? status : 'ended', { reason: ended.reason, durationSec: ended.durationSec });
  }

  // Másik eszközünk fogadta a hívást
  #onHandledElsewhere(payload: unknown): void {
    const c = this.#call;
    if (!c || c.id !== callIdOf(payload) || c.direction !== 'incoming' || c.status !== 'ringing') return;
    this.#finishLocally('handled');
  }

  #onPeerReconnecting(payload: unknown): void {
    if (this.#call?.id === callIdOf(payload)) this.#patch({ peerOffline: true });
  }

  #onPeerReconnected(payload: unknown): void {
    if (this.#call?.id === callIdOf(payload)) {
      this.#patch({ peerOffline: false });
      void this.#recoverConnection();
    }
  }

  // Socket újracsatlakozás (a hitelesítés után érkező init:data): hívás folytatása / csörgés pótlása
  #onSocketReinit(): void {
    const c = this.#call;
    this.#socket.emit('call:sync', { callId: c && !c.terminal ? c.id : null }, (raw: unknown) => {
      const cur = this.#call;
      if (!cur || cur.terminal) return;
      const res = parseSyncAck(raw);
      if (res.resumed) {
        this.#patch({ peerOffline: false });
        if (this.#pc) void this.#recoverConnection();
      } else if (res.stale) {
        this.#finishLocally('failed', { reason: 'connection-lost' });
      }
    });
  }

  // Csendes ICE-újraindítás: a felület csak akkor jelez, ha a kapcsolat ténylegesen megszakad
  #onNetworkBack(): void {
    const c = this.#call;
    if (c && !c.terminal && this.#pc && this.#everConnected) void this.#recoverConnection();
  }

  // Lap bezárása/frissítése: a hívást tisztán lezárjuk (a hang amúgy sem élné túl)
  #onPageHide(): void {
    const c = this.#call;
    if (c?.id && !c.terminal) this.#socket.emit('call:end', { callId: c.id });
  }
}
