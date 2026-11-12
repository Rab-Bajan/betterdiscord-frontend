import { useState, useRef, useEffect, useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { arrayOrEmpty, isRecord, optionalString } from '../../../../shared/lib/guards';
import type { UnknownRecord } from '../../../../shared/lib/guards';
import type { SocketEventTarget } from '../../../../shared/hooks/useSocketEvents';
import { createStore, applySnapshot, applyTick, addChat, notify, cueAsszonyVoice } from '../lib/empireStore';
import { loadMuted } from '../lib/empireAudio';
import { normalizeContent } from '../lib/empireContent';
import { isChatPayload, isEmpireSnapshot, isEmpireTick, isMatchResults, isMatchSummary } from '../types';
import type { CommandPayload, EmpireContent, EmpireStore, MatchResults, MatchSummary } from '../types';

const CURRENT_KEY = 'empire:current';
const tokenKey = (roomId: string): string => `empire:token:${roomId}`;
const RESYNC_MIN_MS = 1500;

const ss = {
  get(k: string): string | null { try { return window.sessionStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string): void { try { window.sessionStorage.setItem(k, v); } catch { /* storage unavailable */ } },
  del(k: string): void { try { window.sessionStorage.removeItem(k); } catch { /* storage unavailable */ } }
};

/** The part of a socket.io client socket the match needs: events plus emit with an ack callback. */
export type EmpireSocket = SocketEventTarget & {
  readonly connected: boolean;
  emit(event: string, ...args: unknown[]): unknown;
};

/** An ack reply; the fields are read through the helpers below. */
type AckReply = UnknownRecord;

const EMPTY_REPLY: AckReply = Object.freeze({ ok: false, error: 'Üres szerverválasz.' });

// Emit with an ack; resolves with the ack payload, or an error payload on timeout.
function emitAck(socket: EmpireSocket, event: string, payload: unknown, timeoutMs = 10000): Promise<AckReply> {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; resolve({ ok: false, error: 'A szerver nem válaszolt időben.' }); } }, timeoutMs);
    const cb = (res: unknown): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(res ? (isRecord(res) ? res : {}) : EMPTY_REPLY);
    };
    if (payload === undefined) socket.emit(event, cb); else socket.emit(event, payload, cb);
  });
}

const errorOf = (res: AckReply): string | undefined => optionalString(res.error);

interface JoinReply {
  roomId: string | undefined;
  rejoinToken: string | undefined;
  summary: MatchSummary | null;
}

const joinReplyOf = (res: AckReply): JoinReply => ({
  roomId: optionalString(res.roomId),
  rejoinToken: optionalString(res.rejoinToken),
  summary: isMatchSummary(res.summary) ? res.summary : null
});

const matchListOf = (value: unknown): MatchSummary[] => arrayOrEmpty(value).filter(isMatchSummary);

export type EmpirePhase = 'browse' | 'lobby' | 'playing' | 'ended';

export interface CurrentRoom {
  roomId: string;
  summary: MatchSummary | null;
}

export interface CreateMatchOptions {
  name?: string | undefined;
  channelId?: string | null | undefined;
  mode: string;
  difficulty?: string;
  maxPlayers?: number;
  mapSize?: string;
}

export interface StartMatchOptions {
  fillWithAi: boolean;
  difficulty: string;
}

export type Refund = Record<string, number>;

export interface EmpireMatch {
  store: EmpireStore;
  connected: boolean;
  content: EmpireContent | null;
  matches: MatchSummary[];
  current: CurrentRoom | null;
  phase: EmpirePhase;
  results: MatchResults | null;
  error: string | null;
  busy: boolean;
  setError: Dispatch<SetStateAction<string | null>>;
  refreshMatches: () => Promise<void>;
  createMatch: (opts: CreateMatchOptions) => Promise<boolean>;
  joinMatch: (roomId: string) => Promise<boolean>;
  startMatch: (opts: StartMatchOptions) => Promise<boolean>;
  leaveMatch: () => Promise<void>;
  resign: () => Promise<void>;
  command: (type: string, payload: CommandPayload) => void;
  requestState: () => Promise<void>;
  demolishBuilding: (buildingIds: number | readonly number[]) => Promise<Refund | null>;
  sendChat: (text: string) => Promise<boolean>;
}

let contentCache: EmpireContent | null = null;

// Socket glue for MiskolcEmpire. Tick data goes straight into the mutable store (no React state per
// tick); React state only changes on lobby/phase transitions.
export function useEmpireMatch(socket: EmpireSocket): EmpireMatch {
  const storeRef = useRef<EmpireStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createStore();
    storeRef.current.ui.muted = loadMuted();
  }
  const store = storeRef.current;

  const [connected, setConnected] = useState(!!socket.connected);
  const [content, setContent] = useState<EmpireContent | null>(contentCache);
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [current, setCurrent] = useState<CurrentRoom | null>(null);
  const [phase, setPhase] = useState<EmpirePhase>('browse');
  const [results, setResults] = useState<MatchResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const currentRef = useRef(current);
  currentRef.current = current;
  const lastResyncRef = useRef(0);
  const aliveRef = useRef(true);

  const showError = useCallback((msg?: string | null) => setError(msg || 'Ismeretlen hiba.'), []);

  const loadContent = useCallback(async () => {
    if (contentCache) { store.content = contentCache; setContent(contentCache); return; }
    const res = await emitAck(socket, 'empire:get-content', undefined);
    if (!aliveRef.current) return;
    if (res.ok && res.content) {
      const loaded = normalizeContent(res.content);
      contentCache = loaded;
      store.content = loaded;
      setContent(loaded);
    } else showError(errorOf(res) || 'A játéktartalom nem tölthető be.');
  }, [socket, store, showError]);

  const refreshMatches = useCallback(async () => {
    const res = await emitAck(socket, 'empire:list-matches', undefined);
    if (aliveRef.current && res.ok) setMatches(matchListOf(res.matches));
  }, [socket]);

  const requestState = useCallback(async () => {
    const roomId = currentRef.current?.roomId || store.roomId;
    if (!roomId) return;
    const now = Date.now();
    if (now - lastResyncRef.current < RESYNC_MIN_MS) return;
    lastResyncRef.current = now;
    const res = await emitAck(socket, 'empire:get-state', { roomId });
    const snap = res.snapshot || res.state;
    if (aliveRef.current && res.ok && isEmpireSnapshot(snap)) applySnapshot(store, snap);
  }, [socket, store]);

  const enterRoom = useCallback((res: JoinReply, fallbackRoomId?: string) => {
    const roomId = res.roomId || fallbackRoomId || '';
    if (res.rejoinToken) ss.set(tokenKey(roomId), res.rejoinToken);
    ss.set(CURRENT_KEY, roomId);
    setCurrent({ roomId, summary: res.summary || null });
    setResults(null);
    const status = res.summary?.status;
    setPhase(status === 'lobby' ? 'lobby' : 'playing');
    // The snapshot normally follows on its own; ask for it if it does not show up
    if (status !== 'lobby') setTimeout(() => { if (aliveRef.current && !store.map.w) requestState(); }, 800);
  }, [store, requestState]);

  const clearRoom = useCallback(() => {
    const id = currentRef.current?.roomId;
    if (id) ss.del(tokenKey(id));
    ss.del(CURRENT_KEY);
    setCurrent(null);
    setPhase('browse');
    setResults(null);
    const content0 = store.content;
    const muted = store.ui.muted;
    Object.assign(store, createStore(), { content: content0 });
    store.ui.muted = muted;
  }, [store]);

  // Rejoin (page reload or socket reconnect) using the stored per-room token
  const rejoin = useCallback(async (silent: boolean) => {
    const roomId = currentRef.current?.roomId || ss.get(CURRENT_KEY);
    if (!roomId) return;
    const res = await emitAck(socket, 'empire:join-match', { roomId, rejoinToken: ss.get(tokenKey(roomId)) || undefined });
    if (!aliveRef.current) return;
    if (res.ok) enterRoom(joinReplyOf(res), roomId);
    else {
      if (!silent) showError(errorOf(res));
      if (!currentRef.current || phaseRef.current !== 'ended') clearRoom();
    }
  }, [socket, enterRoom, clearRoom, showError]);

  useEffect(() => {
    aliveRef.current = true;
    const onSnapshot = (snap: unknown): void => {
      if (!isEmpireSnapshot(snap)) return;
      applySnapshot(store, snap);
      if (snap.status === 'ended') { setPhase('ended'); return; }
      if (!currentRef.current) setCurrent({ roomId: snap.roomId, summary: null });
      ss.set(CURRENT_KEY, snap.roomId);
      setPhase('playing');
    };
    const onTick = (tk: unknown): void => {
      if (phaseRef.current !== 'playing') return;
      if (applyTick(store, isEmpireTick(tk) ? tk : null) === 'resync') requestState();
    };
    const onMatches = (list: unknown): void => {
      const arr = matchListOf(list);
      setMatches(arr);
      const cur = currentRef.current;
      if (!cur) return;
      const mine = arr.find((m) => m.roomId === cur.roomId);
      if (mine) setCurrent({ roomId: cur.roomId, summary: mine });
      else if (phaseRef.current === 'lobby') {
        showError('A szoba megszűnt.');
        clearRoom();
      }
    };
    const onEnded = (payload: unknown): void => {
      if (!isMatchResults(payload) || payload.roomId !== currentRef.current?.roomId) return;
      setResults(payload);
      setPhase('ended');
    };
    const onConnect = (): void => {
      setConnected(true);
      loadContent();
      refreshMatches();
      if (currentRef.current || ss.get(CURRENT_KEY)) rejoin(true);
    };
    const onDisconnect = (): void => setConnected(false);
    const onChat = (msg: unknown): void => {
      if (!isChatPayload(msg) || (msg.roomId && msg.roomId !== currentRef.current?.roomId)) return;
      addChat(store, msg);
    };

    socket.on('empire:snapshot', onSnapshot);
    socket.on('empire:tick', onTick);
    socket.on('empire:matches', onMatches);
    socket.on('empire:match-ended', onEnded);
    socket.on('empire:chat', onChat);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) onConnect();

    return () => {
      aliveRef.current = false;
      socket.off('empire:snapshot', onSnapshot);
      socket.off('empire:tick', onTick);
      socket.off('empire:matches', onMatches);
      socket.off('empire:match-ended', onEnded);
      socket.off('empire:chat', onChat);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
    // handlers read everything through refs / stable callbacks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setBusy(true);
    try { return await fn(); } finally { if (aliveRef.current) setBusy(false); }
  }, []);

  const createMatch = useCallback((opts: CreateMatchOptions) => run(async () => {
    const res = await emitAck(socket, 'empire:create-match', opts);
    if (!res.ok) { showError(errorOf(res)); return false; }
    enterRoom(joinReplyOf(res));
    return true;
  }), [socket, run, enterRoom, showError]);

  const joinMatch = useCallback((roomId: string) => run(async () => {
    const res = await emitAck(socket, 'empire:join-match', { roomId, rejoinToken: ss.get(tokenKey(roomId)) || undefined });
    if (!res.ok) { showError(errorOf(res)); return false; }
    enterRoom(joinReplyOf(res), roomId);
    return true;
  }), [socket, run, enterRoom, showError]);

  const startMatch = useCallback((opts: StartMatchOptions) => run(async () => {
    const roomId = currentRef.current?.roomId;
    if (!roomId) return false;
    const res = await emitAck(socket, 'empire:start-match', { roomId, ...opts });
    if (!res.ok) { showError(errorOf(res)); return false; }
    return true;
  }), [socket, run, showError]);

  const leaveMatch = useCallback(async () => {
    const roomId = currentRef.current?.roomId;
    if (roomId && phaseRef.current !== 'ended') {
      const res = await emitAck(socket, 'empire:leave-match', { roomId });
      if (!res.ok) showError(errorOf(res));
    }
    clearRoom();
  }, [socket, clearRoom, showError]);

  const resign = useCallback(async () => {
    const roomId = currentRef.current?.roomId;
    if (!roomId) return;
    const res = await emitAck(socket, 'empire:resign', { roomId });
    if (!res.ok) showError(errorOf(res));
  }, [socket, showError]);

  const command = useCallback((type: string, payload: CommandPayload) => {
    const roomId = currentRef.current?.roomId;
    if (!roomId || phaseRef.current !== 'playing' || store.spectator) return;
    socket.emit('empire:command', { roomId, type, ...payload }, (res: unknown) => {
      if (isRecord(res) && res.ok === false) showError(errorOf(res));
    });
    if (Array.isArray(payload?.unitIds)) cueAsszonyVoice(store, payload.unitIds);
  }, [socket, store, showError]);

  // Demolish own buildings; resolves with the summed refund ({ iron, wood, ... }) or null on failure.
  const demolishBuilding = useCallback(async (buildingIds: number | readonly number[]) => {
    const roomId = currentRef.current?.roomId;
    if (!roomId || phaseRef.current !== 'playing' || store.spectator) return null;
    const list = (typeof buildingIds === 'number' ? [buildingIds] : buildingIds).slice(0, 10);
    const refund: Refund = {};
    let any = false;
    for (const buildingId of list) {
      const res = await emitAck(socket, 'empire:demolish-building', { roomId, buildingId });
      if (!res.ok) { showError(errorOf(res) || 'A bontás nem sikerült.'); continue; }
      any = true;
      for (const [k, v] of Object.entries(isRecord(res.refund) ? res.refund : {})) refund[k] = (refund[k] || 0) + (Number(v) || 0);
    }
    return any ? refund : null;
  }, [socket, store, showError]);

  const sendChat = useCallback(async (text: string) => {
    const roomId = currentRef.current?.roomId;
    const msg = String(text || '').trim().slice(0, 200);
    if (!roomId || !msg) return false;
    const res = await emitAck(socket, 'empire:chat', { roomId, text: msg });
    if (!res.ok) { notify(store, errorOf(res) || 'Az üzenet nem ment el.', 'alert'); return false; }
    return true;
  }, [socket, store]);

  return {
    store, connected, content, matches, current, phase, results, error, busy,
    setError, refreshMatches, createMatch, joinMatch, startMatch, leaveMatch, resign, command, requestState, demolishBuilding, sendChat
  };
}
