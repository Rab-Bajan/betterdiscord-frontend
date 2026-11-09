import { useState, useRef } from 'react';
import { useSocketEvents } from './useSocketEvents';
import { updateFileInTree } from '../utils/codeTree';

// A szerver élő időkódját a megérkezés idejével bélyegezzük, hogy visszalépéskor pontosan folytatható legyen
const stamp = (state) => (state ? { ...state, receivedAt: Date.now() } : state);

function setOrDelete(setter, channelId, value) {
  setter((prev) => {
    const next = { ...prev };
    if (value) next[channelId] = value;
    else delete next[channelId];
    return next;
  });
}

// Hangszobán belüli közös tevékenységek: rajztábla, kód editor, kaszinó, YouTube, sakk, közös böngésző
export function useRoomActivities(socket, currentUser, activeVoiceChannel) {
  const [whiteboards, setWhiteboards] = useState([]);
  const [activeWhiteboardId, setActiveWhiteboardId] = useState(null);
  const [codeTreeData, setCodeTreeData] = useState(null);
  const [casinoSessions, setCasinoSessions] = useState({}); // channelId -> session
  const [watchSessions, setWatchSessions] = useState({}); // channelId -> state
  const [chessSessions, setChessSessions] = useState({}); // channelId -> state
  const [empireSessions, setEmpireSessions] = useState({}); // channelId -> MiskolcEmpire összefoglaló
  const [browserSessions, setBrowserSessions] = useState({}); // channelId -> state
  const [gameSessions, setGameSessions] = useState({}); // channelId -> összefoglaló
  const [phobiaSessions, setPhobiaSessions] = useState({}); // channelId -> MiskolcPhobia összefoglaló

  const whiteboardsRef = useRef(whiteboards);
  whiteboardsRef.current = whiteboards;

  useSocketEvents(socket, {
    'init:data': (data) => {
      if (data.casinoSessions) setCasinoSessions(data.casinoSessions);
      if (data.watchSessions) {
        setWatchSessions(
          Object.fromEntries(Object.entries(data.watchSessions).map(([id, s]) => [id, stamp(s)]))
        );
      }
      if (data.chessSessions) setChessSessions(data.chessSessions);
      if (data.empireSessions) setEmpireSessions(data.empireSessions);
      if (data.browserSessions) setBrowserSessions(data.browserSessions);
      if (data.phobiaSessions) setPhobiaSessions(data.phobiaSessions);
    },

    'whiteboard:list': (list) => {
      setWhiteboards(list);
      setActiveWhiteboardId((prev) =>
        list.length === 0 ? null : prev && list.some((b) => b.id === prev) ? prev : list[0].id
      );
    },
    'whiteboard:created': ({ board }) => setActiveWhiteboardId(board.id),
    'whiteboard:deleted': ({ boardId }) => {
      const remaining = whiteboardsRef.current.filter((b) => b.id !== boardId);
      setWhiteboards(remaining);
      setActiveWhiteboardId((curr) => (curr === boardId ? remaining[0]?.id || null : curr));
    },

    'code:tree-data': setCodeTreeData,
    'code:file-updated': ({ fileId, content }) =>
      setCodeTreeData((prev) => updateFileInTree(prev, fileId, content)),

    'casino:session-updated': ({ channelId, session }) =>
      setOrDelete(setCasinoSessions, channelId, session),

    'watch:session-updated': ({ channelId, state }) =>
      setOrDelete(setWatchSessions, channelId, stamp(state)),
    'watch:state': (state) => {
      if (state?.channelId) {
        setWatchSessions((prev) => ({ ...prev, [state.channelId]: stamp(state) }));
      }
    },

    'chess:session-updated': ({ channelId, state }) =>
      setOrDelete(setChessSessions, channelId, state),
    'chess:state': (state) => {
      if (state?.channelId) {
        setChessSessions((prev) => ({ ...prev, [state.channelId]: state }));
      }
    },

    'empire:session-updated': ({ channelId, state }) =>
      setOrDelete(setEmpireSessions, channelId, state),

    'game:session-updated': ({ channelId, state }) =>
      setOrDelete(setGameSessions, channelId, state),

    'browser:session-updated': ({ channelId, state }) =>
      setOrDelete(setBrowserSessions, channelId, state),
    'browser:state': (state) => {
      if (state?.channelId) {
        setBrowserSessions((prev) => ({ ...prev, [state.channelId]: state }));
      }
    },

    'phobia:session-updated': ({ channelId, state }) =>
      setOrDelete(setPhobiaSessions, channelId, state),
    'phobia:state': (state) => {
      if (state?.channelId) {
        setPhobiaSessions((prev) => ({ ...prev, [state.channelId]: state }));
      }
    }
  });

  const emitToRoom = (event, payload = {}) => {
    if (activeVoiceChannel) socket.emit(event, { channelId: activeVoiceChannel, ...payload });
  };

  // Szobából kilépéskor a szobához kötött állapotok törlése
  const resetRoomState = () => {
    setWhiteboards([]);
    setActiveWhiteboardId(null);
    setCodeTreeData(null);
  };

  return {
    // rajztábla
    whiteboards,
    activeWhiteboardId,
    selectWhiteboard: setActiveWhiteboardId,
    createWhiteboard: (title) => emitToRoom('whiteboard:create', { title }),
    deleteWhiteboard: (boardId) => emitToRoom('whiteboard:delete', { boardId }),
    // kód editor
    codeTreeData,
    applyLocalCodeChange: (fileId, content) =>
      setCodeTreeData((prev) => updateFileInTree(prev, fileId, content)),
    // munkamenetek
    casinoSessions,
    watchSessions,
    chessSessions,
    empireSessions,
    browserSessions,
    gameSessions,
    phobiaSessions,
    // kaszinó
    startCasino: () => emitToRoom('casino:start-session', { username: currentUser?.username || 'Felhasználó' }),
    stopCasino: () => emitToRoom('casino:stop-session'),
    // miskolc phobia
    startPhobia: () => emitToRoom('phobia:start-session', { username: currentUser?.username || 'Nyomozó' }),
    stopPhobia: () => emitToRoom('phobia:stop-session'),
    // sakk
    startChess: (colorPreference = 'white') => emitToRoom('chess:start', { colorPreference }),
    joinChess: () => emitToRoom('chess:join'),
    moveChess: ({ from, to, promotion = 'q' }) => emitToRoom('chess:move', { from, to, promotion }),
    resignChess: () => emitToRoom('chess:resign'),
    rematchChess: () => emitToRoom('chess:rematch'),
    stopChess: () => emitToRoom('chess:stop'),
    // közös böngésző
    startBrowser: (initialUrl) => emitToRoom('browser:start', { initialUrl }),
    navigateBrowser: (url) => emitToRoom('browser:navigate', { url }),
    browserBack: () => emitToRoom('browser:back'),
    browserForward: () => emitToRoom('browser:forward'),
    browserReload: () => emitToRoom('browser:reload'),
    browserReset: () => emitToRoom('browser:reset'),
    setBrowserMode: (mode) => emitToRoom('browser:set-mode', { mode }),
    takeBrowserControl: () => emitToRoom('browser:take-control'),
    releaseBrowserControl: () => emitToRoom('browser:release-control'),
    stopBrowser: () => emitToRoom('browser:stop'),
    resetRoomState
  };
}
