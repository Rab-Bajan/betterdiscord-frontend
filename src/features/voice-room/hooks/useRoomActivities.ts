import { useState, useRef, type Dispatch, type SetStateAction } from 'react';
import { useSocketEvents } from '../../../shared/hooks/useSocketEvents';
import { isCodeTreeNode, updateFileInTree, type CodeTreeNode } from '../../../shared/lib/codeTree';
import { isRecord, isString, stringField } from '../../../shared/lib/guards';
import type { SocketLike } from '../../../shared/services/socket/SocketLike';
import type { CurrentUser } from '../../../shared/types';
import { isRoomSession, isWhiteboard, parseRoomSessions, type RoomSession, type RoomSessions, type Whiteboard } from '../types';

type SessionsSetter = Dispatch<SetStateAction<RoomSessions>>;

// A szerver élő időkódját a megérkezés idejével bélyegezzük, hogy visszalépéskor pontosan folytatható legyen
const stamp = (state: RoomSession): RoomSession => ({ ...state, receivedAt: Date.now() });

function setOrDelete(setter: SessionsSetter, channelId: string, value: RoomSession | null): void {
  setter((prev) => {
    const next = { ...prev };
    if (value) next[channelId] = value;
    else delete next[channelId];
    return next;
  });
}

/**
 * `<x>:session-updated`: `{ channelId, <field>: session | null }`. The key is `String(channelId)`
 * like the legacy object key, so a channel-less MiskolcEmpire match is stored under "null".
 */
function sessionUpdate(payload: unknown, field: 'state' | 'session'): { channelId: string; session: RoomSession | null } | null {
  if (!isRecord(payload)) return null;
  const channelId = String(payload.channelId);
  const session = payload[field];
  return { channelId, session: isRoomSession(session) ? session : null };
}

/** `<x>:state`: a full session that carries its channel id. */
const channelState = (payload: unknown): (RoomSession & { channelId: string }) | null =>
  isRoomSession(payload) && isString(payload.channelId) ? { ...payload, channelId: payload.channelId } : null;

export interface ChessMove {
  from: string;
  to: string;
  promotion?: string;
}

export interface RoomActivitiesApi {
  whiteboards: Whiteboard[];
  activeWhiteboardId: string | null;
  selectWhiteboard: (boardId: string | null) => void;
  createWhiteboard: (title: string) => void;
  deleteWhiteboard: (boardId: string) => void;
  codeTreeData: CodeTreeNode | null;
  applyLocalCodeChange: (fileId: string, content: string) => void;
  casinoSessions: RoomSessions;
  watchSessions: RoomSessions;
  chessSessions: RoomSessions;
  empireSessions: RoomSessions;
  browserSessions: RoomSessions;
  gameSessions: RoomSessions;
  phobiaSessions: RoomSessions;
  sweepersSessions: RoomSessions;
  startCasino: () => void;
  stopCasino: () => void;
  startChess: (colorPreference?: string) => void;
  joinChess: () => void;
  moveChess: (move: ChessMove) => void;
  resignChess: () => void;
  rematchChess: () => void;
  stopChess: () => void;
  startBrowser: (initialUrl?: string) => void;
  navigateBrowser: (url: string) => void;
  browserBack: () => void;
  browserForward: () => void;
  browserReload: () => void;
  browserReset: () => void;
  setBrowserMode: (mode: string) => void;
  takeBrowserControl: () => void;
  releaseBrowserControl: () => void;
  stopBrowser: () => void;
  resetRoomState: () => void;
}

// Hangszobán belüli közös tevékenységek: rajztábla, kód editor, kaszinó, YouTube, sakk, közös böngésző
export function useRoomActivities(socket: SocketLike, currentUser: CurrentUser | null, activeVoiceChannel: string | null): RoomActivitiesApi {
  const [whiteboards, setWhiteboards] = useState<Whiteboard[]>([]);
  const [activeWhiteboardId, setActiveWhiteboardId] = useState<string | null>(null);
  const [codeTreeData, setCodeTreeData] = useState<CodeTreeNode | null>(null);
  const [casinoSessions, setCasinoSessions] = useState<RoomSessions>({});
  const [watchSessions, setWatchSessions] = useState<RoomSessions>({});
  const [chessSessions, setChessSessions] = useState<RoomSessions>({});
  const [empireSessions, setEmpireSessions] = useState<RoomSessions>({}); // MiskolcEmpire összefoglaló
  const [browserSessions, setBrowserSessions] = useState<RoomSessions>({});
  const [gameSessions, setGameSessions] = useState<RoomSessions>({});
  const [phobiaSessions, setPhobiaSessions] = useState<RoomSessions>({}); // MiskolcPhobia összefoglaló
  const [sweepersSessions, setSweepersSessions] = useState<RoomSessions>({}); // MiskolcSweepers összefoglaló

  const whiteboardsRef = useRef(whiteboards);
  whiteboardsRef.current = whiteboards;

  const onSessionUpdated = (setter: SessionsSetter, field: 'state' | 'session', transform: (s: RoomSession) => RoomSession = (s) => s) =>
    (payload: unknown) => {
      const update = sessionUpdate(payload, field);
      if (update) setOrDelete(setter, update.channelId, update.session && transform(update.session));
    };

  const onChannelState = (setter: SessionsSetter, transform: (s: RoomSession) => RoomSession = (s) => s) =>
    (payload: unknown) => {
      const state = channelState(payload);
      if (state) setter((prev) => ({ ...prev, [state.channelId]: transform(state) }));
    };

  useSocketEvents(socket, {
    'init:data': (data) => {
      if (!isRecord(data)) return;
      const casino = parseRoomSessions(data.casinoSessions);
      const watch = parseRoomSessions(data.watchSessions);
      const chess = parseRoomSessions(data.chessSessions);
      const empire = parseRoomSessions(data.empireSessions);
      const browser = parseRoomSessions(data.browserSessions);
      const phobia = parseRoomSessions(data.phobiaSessions);
      const sweepers = parseRoomSessions(data.sweepersSessions);
      if (casino) setCasinoSessions(casino);
      if (watch) setWatchSessions(Object.fromEntries(Object.entries(watch).map(([id, s]) => [id, stamp(s)])));
      if (chess) setChessSessions(chess);
      if (empire) setEmpireSessions(empire);
      if (browser) setBrowserSessions(browser);
      if (phobia) setPhobiaSessions(phobia);
      if (sweepers) setSweepersSessions(sweepers);
    },

    'whiteboard:list': (value) => {
      if (!Array.isArray(value)) return;
      const list = value.filter(isWhiteboard);
      setWhiteboards(list);
      setActiveWhiteboardId((prev) =>
        list.length === 0 ? null : prev && list.some((b) => b.id === prev) ? prev : list[0]?.id ?? null
      );
    },
    'whiteboard:created': (payload) => {
      const board = isRecord(payload) ? payload.board : undefined;
      if (isWhiteboard(board)) setActiveWhiteboardId(board.id);
    },
    'whiteboard:deleted': (payload) => {
      const boardId = stringField(payload, 'boardId');
      const remaining = whiteboardsRef.current.filter((b) => b.id !== boardId);
      setWhiteboards(remaining);
      setActiveWhiteboardId((curr) => (curr === boardId ? remaining[0]?.id || null : curr));
    },

    'code:tree-data': (tree) => setCodeTreeData(isCodeTreeNode(tree) ? tree : null),
    'code:file-updated': (payload) => {
      const fileId = stringField(payload, 'fileId');
      const content = stringField(payload, 'content');
      if (fileId !== undefined && content !== undefined) setCodeTreeData((prev) => prev && updateFileInTree(prev, fileId, content));
    },

    'casino:session-updated': onSessionUpdated(setCasinoSessions, 'session'),
    'watch:session-updated': onSessionUpdated(setWatchSessions, 'state', stamp),
    'watch:state': onChannelState(setWatchSessions, stamp),
    'chess:session-updated': onSessionUpdated(setChessSessions, 'state'),
    'chess:state': onChannelState(setChessSessions),
    'empire:session-updated': onSessionUpdated(setEmpireSessions, 'state'),
    'game:session-updated': onSessionUpdated(setGameSessions, 'state'),
    'browser:session-updated': onSessionUpdated(setBrowserSessions, 'state'),
    'browser:state': onChannelState(setBrowserSessions),
    'phobia:session-updated': onSessionUpdated(setPhobiaSessions, 'state'),
    'phobia:state': onChannelState(setPhobiaSessions),
    'miskolc:session-updated': onSessionUpdated(setSweepersSessions, 'state')
  });

  const emitToRoom = (event: string, payload: Record<string, unknown> = {}) => {
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
      setCodeTreeData((prev) => prev && updateFileInTree(prev, fileId, content)),
    // munkamenetek
    casinoSessions,
    watchSessions,
    chessSessions,
    empireSessions,
    browserSessions,
    gameSessions,
    phobiaSessions,
    sweepersSessions,
    // kaszinó
    startCasino: () => emitToRoom('casino:start-session', { username: currentUser?.username || 'Felhasználó' }),
    stopCasino: () => emitToRoom('casino:stop-session'),
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
