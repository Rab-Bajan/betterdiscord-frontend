// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoiceSession, type VoiceEnvironment } from '../../../../src/features/voice-room/lib/VoiceSession';
import type { SocketLike, SocketListener } from '../../../../src/shared/services/socket/SocketLike';

class FakeSocket implements SocketLike {
  readonly listeners = new Map<string, Set<SocketListener>>();
  readonly emitted: Array<[string, unknown]> = [];
  on(event: string, l: SocketListener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)?.add(l);
  }
  off(event: string, l?: SocketListener) {
    if (l) this.listeners.get(event)?.delete(l);
  }
  emit(event: string, payload?: unknown) {
    this.emitted.push([event, payload]);
  }
  serverSends(event: string, payload?: unknown) {
    this.listeners.get(event)?.forEach((l) => l(payload));
  }
  sent(event: string) {
    return this.emitted.filter(([e]) => e === event).map(([, p]) => p);
  }
}

class FakeTrack {
  enabled = true;
  onended: (() => void) | null = null;
  constructor(readonly kind: string) {}
  stop = vi.fn();
}

const fakeStream = (id: string, kinds: string[]) => {
  const tracks = kinds.map((k) => new FakeTrack(k));
  return {
    id,
    tracks,
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video')
  } as unknown as MediaStream & { tracks: FakeTrack[] };
};

class FakePC {
  signalingState = 'stable';
  connectionState = 'new';
  iceConnectionState = 'new';
  remoteDescription: RTCSessionDescriptionInit | null = null;
  ontrack: ((e: unknown) => void) | null = null;
  onicecandidate: ((e: unknown) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  added: unknown[] = [];
  removed: unknown[] = [];
  addIceCandidate = vi.fn(async () => {});
  close = vi.fn(() => { this.signalingState = 'closed'; });
  addTrack(track: unknown) { const sender = { track }; this.added.push(track); return sender; }
  removeTrack(sender: unknown) { this.removed.push(sender); }
  addTransceiver = vi.fn();
  async createOffer() { return { type: 'offer', sdp: 'o' }; }
  async createAnswer() { return { type: 'answer', sdp: 'a' }; }
  async setLocalDescription(d: RTCSessionDescriptionInit) { if (d.type === 'offer') this.signalingState = 'have-local-offer'; }
  async setRemoteDescription(d: RTCSessionDescriptionInit) { this.remoteDescription = d; this.signalingState = 'stable'; }
}

const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe('VoiceSession', () => {
  let socket: FakeSocket;
  let pcs: FakePC[];
  let mic: ReturnType<typeof fakeStream>;
  let env: VoiceEnvironment;
  let session: VoiceSession;
  const onLeft = vi.fn();

  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => {}); // jsdom has no AudioContext for the VAD
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    socket = new FakeSocket();
    pcs = [];
    mic = fakeStream('mic', ['audio']);
    env = {
      createPeerConnection: () => { const pc = new FakePC(); pcs.push(pc); return pc as unknown as RTCPeerConnection; },
      getUserMedia: vi.fn(async (c: MediaStreamConstraints) => (c.video ? fakeStream('cam', ['video']) : mic)),
      getDisplayMedia: vi.fn(async () => fakeStream('screen', ['video', 'audio']))
    };
    session = new VoiceSession(socket, () => ({ onLeft }), env);
    session.start();
  });

  afterEach(() => {
    session.stop();
    vi.restoreAllMocks();
    onLeft.mockReset();
  });

  it('creates the hidden audio container and removes it on stop', () => {
    expect(document.getElementById('webrtc-audio-container')).not.toBeNull();
    session.stop();
    expect(document.getElementById('webrtc-audio-container')).toBeNull();
    expect([...socket.listeners.values()].every((s) => s.size === 0)).toBe(true);
  });

  it('joins with the microphone and offers to every peer already in the room', async () => {
    await session.joinChannel('room1');
    expect(socket.sent('voice:join')).toEqual([{ channelId: 'room1' }]);
    expect(session.getSnapshot().activeVoiceChannel).toBe('room1');

    socket.serverSends('voice:joined', { peers: [{ id: 'p1' }, { id: 'p2' }] });
    await flush();
    expect(pcs).toHaveLength(2);
    expect(pcs[0]?.added).toEqual([mic.tracks[0]]);
    expect(socket.sent('webrtc:signal')).toEqual([
      { targetPeerId: 'p1', signal: { type: 'offer', sdp: { type: 'offer', sdp: 'o' }, streams: { camera: null, screen: null } } },
      { targetPeerId: 'p2', signal: { type: 'offer', sdp: { type: 'offer', sdp: 'o' }, streams: { camera: null, screen: null } } }
    ]);
  });

  it('answers an offer and applies ICE candidates that follow it', async () => {
    socket.serverSends('webrtc:signal', { senderPeerId: 'p9', signal: { type: 'offer', sdp: { type: 'offer', sdp: 'x' }, streams: { camera: 'cam9' } } });
    socket.serverSends('webrtc:signal', { senderPeerId: 'p9', signal: { type: 'ice-candidate', candidate: { candidate: 'c1' } } });
    await flush();
    const pc = pcs[0];
    expect(pc?.remoteDescription).toEqual({ type: 'offer', sdp: 'x' });
    expect(pc?.addIceCandidate).toHaveBeenCalledWith({ candidate: 'c1' });
    expect(socket.sent('webrtc:signal').at(-1)).toMatchObject({ targetPeerId: 'p9', signal: { type: 'answer' } });
  });

  it('ignores malformed signals', async () => {
    socket.serverSends('webrtc:signal', { senderPeerId: 'p9', signal: { type: 'offer' } });
    socket.serverSends('webrtc:signal', null);
    await flush();
    expect(pcs).toHaveLength(0);
  });

  it('routes remote video by the stream labels of the offer', async () => {
    socket.serverSends('webrtc:signal', { senderPeerId: 'p9', signal: { type: 'offer', sdp: { type: 'offer', sdp: 'x' }, streams: { camera: 'cam9' } } });
    await flush();
    const camera = fakeStream('cam9', ['video']);
    const screen = fakeStream('scr9', ['video']);
    pcs[0]?.ontrack?.({ streams: [camera], track: camera.tracks[0] });
    pcs[0]?.ontrack?.({ streams: [screen], track: screen.tracks[0] });
    expect(session.getSnapshot().remoteCameraStreams.get('p9')).toBe(camera);
    expect(session.getSnapshot().remoteScreenStreams.get('p9')).toBe(screen);

    socket.serverSends('voice:user-screen-sharing', { userId: 'p9', isSharing: false });
    expect(session.getSnapshot().remoteScreenStreams.has('p9')).toBe(false);
    socket.serverSends('voice:peer-left', { peerId: 'p9' });
    expect(session.getSnapshot().remoteCameraStreams.has('p9')).toBe(false);
    expect(pcs[0]?.close).toHaveBeenCalled();
  });

  it('mutes and deafens: tracks, state and server notification', async () => {
    await session.joinChannel('room1');
    session.toggleMute();
    expect(mic.tracks[0]?.enabled).toBe(false);
    expect(socket.sent('voice:state-change').at(-1)).toEqual({ isMuted: true, isDeafened: false });
    session.toggleMute();
    session.toggleDeafen();
    expect(session.getSnapshot()).toMatchObject({ isMuted: false, isDeafened: true });
    expect(mic.tracks[0]?.enabled).toBe(false);
    expect(socket.sent('voice:state-change').at(-1)).toEqual({ isMuted: true, isDeafened: true });
  });

  it('shares the screen with existing peers and stops it again', async () => {
    await session.joinChannel('room1');
    socket.serverSends('voice:joined', { peers: [{ id: 'p1' }] });
    await flush();
    await session.toggleScreenShare();
    expect(session.getSnapshot().isScreenSharing).toBe(true);
    expect(pcs[0]?.added).toHaveLength(3); // mic + screen video + screen audio
    expect(socket.sent('voice:screen-share').at(-1)).toEqual({ isSharing: true });

    await session.toggleScreenShare();
    expect(session.getSnapshot()).toMatchObject({ isScreenSharing: false, localScreenStream: null });
    expect(pcs[0]?.removed).toHaveLength(2);
    expect(socket.sent('voice:screen-share').at(-1)).toEqual({ isSharing: false });
  });

  it('leaves: closes peers, stops the mic and calls onLeft', async () => {
    await session.joinChannel('room1');
    socket.serverSends('voice:joined', { peers: [{ id: 'p1' }] });
    await flush();
    session.leaveChannel();
    expect(socket.sent('voice:leave')).toHaveLength(1);
    expect(pcs[0]?.close).toHaveBeenCalled();
    expect(mic.tracks[0]?.stop).toHaveBeenCalled();
    expect(session.getSnapshot().activeVoiceChannel).toBeNull();
    expect(onLeft).toHaveBeenCalledOnce();
  });
});

describe('VoiceSession store', () => {
  it('does not notify subscribers when an update changes nothing (unlock on every click)', () => {
    const socket = new FakeSocket();
    const session = new VoiceSession(socket, () => ({}), {
      createPeerConnection: () => { throw new Error('unused'); },
      getUserMedia: () => Promise.reject(new Error('unused')),
      getDisplayMedia: () => Promise.reject(new Error('unused'))
    });
    session.start();
    const listener = vi.fn();
    session.subscribe(listener);
    const before = session.getSnapshot();
    window.dispatchEvent(new Event('click'));
    session.unlockAllAudio();
    expect(listener).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toBe(before);
    session.stop();
  });

  it('acquires the microphone once when joins overlap', async () => {
    const socket = new FakeSocket();
    const getUserMedia = vi.fn(async () => fakeStream('mic', ['audio']));
    const session = new VoiceSession(socket, () => ({}), {
      createPeerConnection: () => { throw new Error('unused'); },
      getUserMedia,
      getDisplayMedia: () => Promise.reject(new Error('unused'))
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await Promise.all([session.joinChannel('a'), session.joinChannel('b')]);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});
