import { useState, useRef, useEffect, useCallback } from 'react';
import { createStore, applySnapshot, applyTick, addChat, notify, cueAsszonyVoice } from '../components/miskolcEmpire/empireStore';
import { loadMuted } from '../components/miskolcEmpire/empireAudio';
import { normalizeContent } from '../components/miskolcEmpire/empireContent';

const CURRENT_KEY = 'empire:current';
const tokenKey = (roomId) => `empire:token:${roomId}`;
const RESYNC_MIN_MS = 1500;

const ss = {
  get(k) { try { return window.sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { window.sessionStorage.setItem(k, v); } catch { /* storage unavailable */ } },
  del(k) { try { window.sessionStorage.removeItem(k); } catch { /* storage unavailable */ } }
};

// Emit with an ack; resolves with the ack payload, or an error payload on timeout.
function emitAck(socket, event, payload, timeoutMs = 10000) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; resolve({ ok: false, error: 'A szerver nem válaszolt időben.' }); } }, timeoutMs);
    const cb = (res) => { if (done) return; done = true; clearTimeout(timer); resolve(res || { ok: false, error: 'Üres szerverválasz.' }); };
    if (payload === undefined) socket.emit(event, cb); else socket.emit(event, payload, cb);
  });
}

let contentCache = null;

// Socket glue for MiskolcEmpire. Tick data goes straight into the mutable store (no React state per
// tick); React state only changes on lobby/phase transitions.
export function useEmpireMatch(socket) {
  const storeRef = useRef(null);
  if (!storeRef.current) {
    storeRef.current = createStore();
    storeRef.current.ui.muted = loadMuted();
  }
  const store = storeRef.current;

  const [connected, setConnected] = useState(!!socket.connected);
  const [content, setContent] = useState(contentCache);
  const [matches, setMatches] = useState([]);
  const [current, setCurrent] = useState(null); // { roomId, summary }
  const [phase, setPhase] = useState('browse'); // browse | lobby | playing | ended
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const currentRef = useRef(current);
  currentRef.current = current;
  const lastResyncRef = useRef(0);
  const aliveRef = useRef(true);

  const showError = useCallback((msg) => setError(msg || 'Ismeretlen hiba.'), []);

  const loadContent = useCallback(async () => {
    if (contentCache) { store.content = contentCache; setContent(contentCache); return; }
    const res = await emitAck(socket, 'empire:get-content', undefined);
    if (!aliveRef.current) return;
    if (res.ok && res.content) {
      contentCache = normalizeContent(res.content);
      store.content = contentCache;
      setContent(contentCache);
    } else showError(res.error || 'A játéktartalom nem tölthető be.');
  }, [socket, store, showError]);

  const refreshMatches = useCallback(async () => {
    const res = await emitAck(socket, 'empire:list-matches', undefined);
    if (aliveRef.current && res.ok) setMatches(res.matches || []);
  }, [socket]);

  const requestState = useCallback(async () => {
    const roomId = currentRef.current?.roomId || store.roomId;
    if (!roomId) return;
    const now = Date.now();
    if (now - lastResyncRef.current < RESYNC_MIN_MS) return;
    lastResyncRef.current = now;
    const res = await emitAck(socket, 'empire:get-state', { roomId });
    const snap = res.snapshot || res.state;
    if (aliveRef.current && res.ok && snap?.map) applySnapshot(store, snap);
  }, [socket, store]);

  const enterRoom = useCallback((res, fallbackRoomId) => {
    const roomId = res.roomId || fallbackRoomId;
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
  const rejoin = useCallback(async (silent) => {
    const roomId = currentRef.current?.roomId || ss.get(CURRENT_KEY);
    if (!roomId) return;
    const res = await emitAck(socket, 'empire:join-match', { roomId, rejoinToken: ss.get(tokenKey(roomId)) || undefined });
    if (!aliveRef.current) return;
    if (res.ok) enterRoom(res, roomId);
    else {
      if (!silent) showError(res.error);
      if (!currentRef.current || phaseRef.current !== 'ended') clearRoom();
    }
  }, [socket, enterRoom, clearRoom, showError]);

  useEffect(() => {
    aliveRef.current = true;
    const onSnapshot = (snap) => {
      if (!snap?.map) return;
      applySnapshot(store, snap);
      if (snap.status === 'ended') { setPhase('ended'); return; }
      if (!currentRef.current) setCurrent({ roomId: snap.roomId, summary: null });
      ss.set(CURRENT_KEY, snap.roomId);
      setPhase('playing');
    };
    const onTick = (tk) => {
      if (phaseRef.current !== 'playing') return;
      if (applyTick(store, tk) === 'resync') requestState();
    };
    const onMatches = (list) => {
      const arr = Array.isArray(list) ? list : [];
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
    const onEnded = (payload) => {
      if (!payload || payload.roomId !== currentRef.current?.roomId) return;
      setResults(payload);
      setPhase('ended');
    };
    const onConnect = () => {
      setConnected(true);
      loadContent();
      refreshMatches();
      if (currentRef.current || ss.get(CURRENT_KEY)) rejoin(true);
    };
    const onDisconnect = () => setConnected(false);
    const onChat = (msg) => {
      if (!msg || (msg.roomId && msg.roomId !== currentRef.current?.roomId)) return;
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

  const run = useCallback(async (fn) => {
    setBusy(true);
    try { return await fn(); } finally { if (aliveRef.current) setBusy(false); }
  }, []);

  const createMatch = useCallback((opts) => run(async () => {
    const res = await emitAck(socket, 'empire:create-match', opts);
    if (!res.ok) { showError(res.error); return false; }
    enterRoom(res);
    return true;
  }), [socket, run, enterRoom, showError]);

  const joinMatch = useCallback((roomId) => run(async () => {
    const res = await emitAck(socket, 'empire:join-match', { roomId, rejoinToken: ss.get(tokenKey(roomId)) || undefined });
    if (!res.ok) { showError(res.error); return false; }
    enterRoom(res, roomId);
    return true;
  }), [socket, run, enterRoom, showError]);

  const startMatch = useCallback((opts) => run(async () => {
    const roomId = currentRef.current?.roomId;
    if (!roomId) return false;
    const res = await emitAck(socket, 'empire:start-match', { roomId, ...opts });
    if (!res.ok) { showError(res.error); return false; }
    return true;
  }), [socket, run, showError]);

  const leaveMatch = useCallback(async () => {
    const roomId = currentRef.current?.roomId;
    if (roomId && phaseRef.current !== 'ended') {
      const res = await emitAck(socket, 'empire:leave-match', { roomId });
      if (!res.ok) showError(res.error);
    }
    clearRoom();
  }, [socket, clearRoom, showError]);

  const resign = useCallback(async () => {
    const roomId = currentRef.current?.roomId;
    if (!roomId) return;
    const res = await emitAck(socket, 'empire:resign', { roomId });
    if (!res.ok) showError(res.error);
  }, [socket, showError]);

  const command = useCallback((type, payload) => {
    const roomId = currentRef.current?.roomId;
    if (!roomId || phaseRef.current !== 'playing' || store.spectator) return;
    socket.emit('empire:command', { roomId, type, ...payload }, (res) => {
      if (res && res.ok === false) showError(res.error);
    });
    if (Array.isArray(payload?.unitIds)) cueAsszonyVoice(store, payload.unitIds);
  }, [socket, store, showError]);

  // Demolish own buildings; resolves with the summed refund ({ iron, wood, ... }) or null on failure.
  const demolishBuilding = useCallback(async (buildingIds) => {
    const roomId = currentRef.current?.roomId;
    if (!roomId || phaseRef.current !== 'playing' || store.spectator) return null;
    const list = (Array.isArray(buildingIds) ? buildingIds : [buildingIds]).slice(0, 10);
    const refund = {};
    let any = false;
    for (const buildingId of list) {
      const res = await emitAck(socket, 'empire:demolish-building', { roomId, buildingId });
      if (!res.ok) { showError(res.error || 'A bontás nem sikerült.'); continue; }
      any = true;
      for (const [k, v] of Object.entries(res.refund || {})) refund[k] = (refund[k] || 0) + (Number(v) || 0);
    }
    return any ? refund : null;
  }, [socket, store, showError]);

  const sendChat = useCallback(async (text) => {
    const roomId = currentRef.current?.roomId;
    const msg = String(text || '').trim().slice(0, 200);
    if (!roomId || !msg) return false;
    const res = await emitAck(socket, 'empire:chat', { roomId, text: msg });
    if (!res.ok) { notify(store, res.error || 'Az üzenet nem ment el.', 'alert'); return false; }
    return true;
  }, [socket, store]);

  return {
    store, connected, content, matches, current, phase, results, error, busy,
    setError, refreshMatches, createMatch, joinMatch, startMatch, leaveMatch, resign, command, requestState, demolishBuilding, sendChat
  };
}
