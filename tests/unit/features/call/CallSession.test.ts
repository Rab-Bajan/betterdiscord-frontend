// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CallSession, type CallEnvironment } from '../../../../src/features/call/lib/CallSession';
import type { SocketLike, SocketListener } from '../../../../src/shared/services/socket/SocketLike';

class FakeSocket implements SocketLike {
  readonly listeners = new Map<string, Set<SocketListener>>();
  readonly emitted: Array<{ event: string; args: unknown[] }> = [];
  ackFor: Record<string, unknown> = {};

  on(event: string, listener: SocketListener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)?.add(listener);
  }
  off(event: string, listener?: SocketListener) {
    if (listener) this.listeners.get(event)?.delete(listener);
  }
  emit(event: string, ...args: unknown[]) {
    this.emitted.push({ event, args });
    const ack = args[args.length - 1];
    if (typeof ack === 'function' && event in this.ackFor) ack(this.ackFor[event]);
  }
  serverSends(event: string, payload?: unknown) {
    this.listeners.get(event)?.forEach((l) => l(payload));
  }
  emittedEvents() {
    return this.emitted.map((e) => e.event);
  }
}

class FakeTrack {
  kind = 'audio';
  enabled = true;
  onended: (() => void) | null = null;
  stop = vi.fn();
}

const makeStream = () => {
  const track = new FakeTrack();
  return { track, stream: { getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream };
};

class FakePeerConnection {
  onicecandidate: ((e: unknown) => void) | null = null;
  ontrack: ((e: unknown) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  connectionState = 'new';
  iceConnectionState = 'new';
  signalingState = 'stable';
  remoteDescription: unknown = null;
  localDescription: { sdp: string } | null = null;
  senders: Array<{ track: unknown; replaceTrack: () => Promise<void>; getParameters: () => { encodings: unknown[] }; setParameters: () => Promise<void> }> = [];
  close = vi.fn();
  addTrack(track: unknown) {
    this.senders.push({ track, replaceTrack: () => Promise.resolve(), getParameters: () => ({ encodings: [] }), setParameters: () => Promise.resolve() });
  }
  getSenders() { return this.senders; }
  async createOffer() { return { type: 'offer', sdp: 'v=0' }; }
  async createAnswer() { return { type: 'answer', sdp: 'v=0' }; }
  async setLocalDescription(d: { sdp: string }) { this.localDescription = d; if ((d as { type?: string }).type === 'offer') this.signalingState = 'have-local-offer'; }
  async setRemoteDescription(d: unknown) { this.remoteDescription = d; this.signalingState = 'stable'; }
  addIceCandidate = vi.fn(async () => {});
  getStats = vi.fn(async () => new Map());
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('CallSession', () => {
  let socket: FakeSocket;
  let pcs: FakePeerConnection[];
  let mic: ReturnType<typeof makeStream>;
  let env: CallEnvironment;
  let session: CallSession;
  const onBeforeCall = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('MediaStream', class { constructor(readonly tracks: unknown[]) {} getAudioTracks() { return this.tracks; } });
    socket = new FakeSocket();
    pcs = [];
    mic = makeStream();
    env = {
      getUserMedia: vi.fn(async () => mic.stream),
      createPeerConnection: () => {
        const pc = new FakePeerConnection();
        pcs.push(pc);
        return pc as unknown as RTCPeerConnection;
      }
    };
    session = new CallSession({ socket, getCurrentUser: () => ({ username: 'Anna' }), onBeforeCall, environment: env });
    session.start();
  });

  afterEach(() => {
    session.stop();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    onBeforeCall.mockReset();
  });

  it('rejects calls to oneself and while not logged in', async () => {
    await expect(session.startCall({ username: 'anna' })).resolves.toEqual({ ok: false, error: 'self' });
    const anon = new CallSession({ socket, getCurrentUser: () => null, environment: env });
    await expect(anon.startCall({ username: 'Bela' })).resolves.toEqual({ ok: false, error: 'unauthenticated' });
    expect(session.getSnapshot()).toBeNull();
  });

  it('places an outgoing call: mic, invite, ringing state', async () => {
    socket.ackFor['call:invite'] = { ok: true, callId: 'c1', turnEnabled: true, peer: { avatarColor: '#123456' } };
    const listener = vi.fn();
    session.subscribe(listener);

    await expect(session.startCall({ username: 'Bela' })).resolves.toEqual({ ok: true });

    expect(onBeforeCall).toHaveBeenCalledOnce();
    expect(socket.emitted.find((e) => e.event === 'call:invite')?.args[0]).toEqual({ targetUsername: 'Bela' });
    expect(session.getSnapshot()).toMatchObject({
      id: 'c1', direction: 'outgoing', status: 'ringing', turn: true,
      peer: { username: 'Bela', displayName: 'Bela', avatarColor: '#123456' }
    });
    expect(session.isInCall).toBe(true);
    expect(listener).toHaveBeenCalled();
    await expect(session.startCall({ username: 'Cecil' })).resolves.toEqual({ ok: false, error: 'already-in-call' });
  });

  it('shows a terminal failed state when the microphone is denied', async () => {
    vi.mocked(env.getUserMedia).mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
    await expect(session.startCall({ username: 'Bela' })).resolves.toEqual({ ok: false, error: 'mic-denied' });
    expect(session.getSnapshot()).toMatchObject({ status: 'failed', reason: 'mic-denied', terminal: true });
    expect(session.isInCall).toBe(false);
  });

  it('maps a busy invite to the busy state and releases the mic', async () => {
    socket.ackFor['call:invite'] = { ok: false, error: 'busy' };
    await expect(session.startCall({ username: 'Bela' })).resolves.toEqual({ ok: false, error: 'busy' });
    expect(session.getSnapshot()).toMatchObject({ status: 'busy', reason: 'busy', terminal: true });
    expect(mic.track.stop).toHaveBeenCalled();
  });

  it('sends an offer once the callee accepts, and connects on the answer', async () => {
    socket.ackFor['call:invite'] = { ok: true, callId: 'c1' };
    await session.startCall({ username: 'Bela' });
    socket.serverSends('call:accepted', { callId: 'c1' });
    await flush();

    const pc = pcs[0];
    expect(pc).toBeDefined();
    expect(session.getSnapshot()?.status).toBe('connecting');
    const offer = socket.emitted.find((e) => e.event === 'call:signal');
    expect(offer?.args[0]).toMatchObject({ callId: 'c1', signal: { type: 'offer' } });

    socket.serverSends('call:signal', { callId: 'c1', signal: { type: 'answer', sdp: 'v=0' } });
    await flush();
    expect(pc?.remoteDescription).toEqual({ type: 'answer', sdp: 'v=0' });

    if (pc) pc.connectionState = 'connected';
    pc?.onconnectionstatechange?.();
    expect(session.getSnapshot()).toMatchObject({ status: 'connected' });
    expect(socket.emittedEvents()).toContain('call:connected');
  });

  it('rings on an incoming call, keeps early offers, and answers them after accepting', async () => {
    socket.serverSends('call:incoming', { callId: 'c9', caller: { username: 'Bela', avatarColor: '#abcdef' } });
    expect(session.getSnapshot()).toMatchObject({ id: 'c9', direction: 'incoming', status: 'ringing', peer: { displayName: 'Bela' } });

    socket.serverSends('call:signal', { callId: 'c9', signal: { type: 'offer', sdp: 'remote-offer' } });
    socket.ackFor['call:accept'] = { ok: true };
    await session.acceptCall();
    await flush();

    expect(pcs).toHaveLength(1);
    expect(pcs[0]?.remoteDescription).toEqual({ type: 'offer', sdp: 'remote-offer' });
    expect(socket.emitted.some((e) => e.event === 'call:signal' && (e.args[0] as { signal: { type: string } }).signal.type === 'answer')).toBe(true);
  });

  it('ignores malformed incoming payloads', () => {
    socket.serverSends('call:incoming', { callId: 'c9' });
    socket.serverSends('call:incoming', null);
    expect(session.getSnapshot()).toBeNull();
  });

  it('removes a missed incoming call without a terminal screen', () => {
    socket.serverSends('call:incoming', { callId: 'c9', caller: { username: 'Bela' } });
    socket.serverSends('call:ended', { callId: 'c9', status: 'missed', reason: 'no-answer' });
    expect(session.getSnapshot()).toBeNull();
  });

  it('ends an active call locally with its duration, then clears it after the display time', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    socket.ackFor['call:invite'] = { ok: true, callId: 'c1' };
    await session.startCall({ username: 'Bela' });
    session.endCall();
    expect(socket.emittedEvents()).toContain('call:end');
    expect(session.getSnapshot()).toMatchObject({ status: 'cancelled', terminal: true, durationSec: 0 });
    vi.advanceTimersByTime(3200);
    expect(session.getSnapshot()).toBeNull();
  });

  it('mutes at the source and tells the peer', async () => {
    socket.ackFor['call:invite'] = { ok: true, callId: 'c1' };
    await session.startCall({ username: 'Bela' });
    session.toggleMute();
    expect(mic.track.enabled).toBe(false);
    expect(session.getSnapshot()?.muted).toBe(true);
    expect(socket.emitted.at(-1)?.args[0]).toEqual({ callId: 'c1', signal: { type: 'media', muted: true } });
  });

  it('stop() unbinds all socket listeners', () => {
    session.stop();
    const remaining = [...socket.listeners.values()].reduce((n, set) => n + set.size, 0);
    expect(remaining).toBe(0);
  });
});

describe('call ICE candidate guard', () => {
  it('accepts toJSON-shaped candidates and rejects malformed ones', async () => {
    const { parseCallSignal } = await import('../../../../src/features/call/types');
    const ok = { candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ host', sdpMid: '0', sdpMLineIndex: 0, usernameFragment: null };
    expect(parseCallSignal({ type: 'candidate', candidate: ok })).toEqual({ type: 'candidate', candidate: ok });
    expect(parseCallSignal({ type: 'candidate', candidate: { candidate: 5 } })).toEqual({ type: 'candidate', candidate: null });
    expect(parseCallSignal({ type: 'candidate', candidate: { candidate: 'c', sdpMLineIndex: '0' } })).toEqual({ type: 'candidate', candidate: null });
  });
});
