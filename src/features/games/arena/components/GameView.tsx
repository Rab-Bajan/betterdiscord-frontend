import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useSocketEvents } from '../../../../shared/hooks/useSocketEvents';
import { isRecord, isString, stringField } from '../../../../shared/lib/guards';
import type { SocketLike } from '../../../../shared/services/socket/SocketLike';
import type { PresenceUser } from '../../../../shared/types';
import GameClient, { QUALITY_PRESETS } from '../lib/GameClient';
import type { ArenaSocket } from '../lib/GameRpc';
import { IS_TOUCH } from '../lib/arenaLabels';
import {
  isArenaProfile, isCatalog, isGameEventList, isLobby, isMatchEnd, isMatchInfo, isSnapshot,
  type ArenaProfile, type Catalog, type HudState, type Lobby, type MatchInfo, type MatchResult
} from '../types';
import ArenaHud from './ArenaHud';
import ArenaLobby from './ArenaLobby';
import GameMenu, { MENU_TABS } from './GameMenu';
import MatchResults from './MatchResults';
import TouchControls from './TouchControls';

const QUALITY_KEY = 'sudswar_quality';
const VOICE_KEY = 'sudswar_voice';
const PROXIMITY_FULL = 8;
const PROXIMITY_ZERO = 45;
const readStored = (key: string, fallback: string): string => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };

const readQuality = (): string => {
  try {
    const value = localStorage.getItem(QUALITY_KEY);
    return value !== null && Object.hasOwn(QUALITY_PRESETS, value) ? value : 'medium';
  } catch {
    return 'medium';
  }
};

/** `game:notify`: a toast, optionally with a lobby to join. */
interface Toast {
  text: string;
  lobbyId: string | undefined;
}

export interface GameViewProps {
  socket: ArenaSocket & SocketLike;
  channelId: string | undefined;
  isAdmin?: boolean;
  participants?: PresenceUser[];
  setPeerVolume?: (peerId: string, volume: number) => void;
}

export default function GameView({ socket, channelId, isAdmin = false, participants = [], setPeerVolume }: GameViewProps) {
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [profile, setProfile] = useState<ArenaProfile | null>(null);
  const [matchInfo, setMatchInfo] = useState<MatchInfo | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [quality, setQuality] = useState(readQuality);
  const [voiceMode, setVoiceMode] = useState(() => readStored(VOICE_KEY, 'all'));
  const [tab, setTab] = useState('play');
  const [otherLobby, setOtherLobby] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const activeLobby = otherLobby || channelId;
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<GameClient | null>(null);
  const matchRef = useRef<MatchInfo | null>(null);
  matchRef.current = matchInfo;

  const showError = (message: string) => {
    setError(message);
    setTimeout(() => setError(null), 5000);
  };

  useEffect(() => {
    const join = () => {
      socket.emit('game:lobby-join', { channelId: activeLobby });
      socket.emit('game:get-profile');
    };
    if (socket.connected) join();
    socket.on('connect', join);
    return () => {
      socket.off('connect', join);
      socket.emit('game:lobby-leave');
    };
  }, [socket, activeLobby]);

  useSocketEvents(socket, {
    connect: () => setConnected(true),
    disconnect: () => setConnected(false),
    'game:lobby': (l) => { if (isLobby(l)) setLobby(l); },
    'game:catalog': (c) => { if (isCatalog(c)) setCatalog(c); },
    // vendégeknek a szerver null-t küld
    'game:profile': (p) => setProfile(isArenaProfile(p) ? p : null),
    'game:private-created': (payload) => {
      const id = stringField(payload, 'channelId');
      if (id !== undefined) setOtherLobby(id);
    },
    'game:notify': (n) => {
      if (!isRecord(n) || !isString(n.text) || !n.text) return;
      setToast({ text: n.text, lobbyId: stringField(n, 'lobbyId') });
      setTimeout(() => setToast(null), 8000);
    },
    'game:error': (payload) => {
      const message = stringField(payload, 'message');
      if (message === undefined) return;
      showError(message);
      if (message.includes('privát lobbi')) setOtherLobby(null);
    },
    'game:notice': (payload) => {
      const message = stringField(payload, 'message');
      if (message === undefined) return;
      setNotice(message);
      setTimeout(() => setNotice(null), 4000);
    },
    'game:match-start': (info) => {
      if (!isMatchInfo(info)) return;
      setResult(null);
      setHud(null);
      setMatchInfo(info);
    },
    'game:snapshot': (snapshot) => { if (isSnapshot(snapshot)) clientRef.current?.onSnapshot(snapshot); },
    'game:events': (events) => { if (isGameEventList(events)) clientRef.current?.onEvents(events); },
    'game:match-end': (end) => {
      if (!isMatchEnd(end)) return;
      const info = matchRef.current;
      setResult({ ...end, youIndex: info?.you, factions: info?.factions });
      setMatchInfo(null);
      socket.emit('game:get-profile');
    },
    'game:match-aborted': (payload) => {
      setMatchInfo(null);
      const message = stringField(payload, 'message');
      if (message !== undefined) showError(message);
    }
  });

  // Egy futó meccshez egy renderelő tartozik, kilépéskor minden GPU erőforrás felszabadul
  useEffect(() => {
    if (!matchInfo || !canvasHostRef.current) return undefined;
    let client: GameClient;
    try {
      client = new GameClient(canvasHostRef.current, socket, matchInfo, setHud, quality);
    } catch (err) {
      console.error('[Game] WebGL indítási hiba:', err);
      showError('A 3D megjelenítést nem sikerült elindítani ezen az eszközön.');
      setMatchInfo(null);
      return undefined;
    }
    clientRef.current = client;
    return () => {
      clientRef.current = null;
      client.dispose();
    };
  }, [matchInfo, socket]);

  // Csapat- és közelségi hang: csak a már meglévő hangkapcsolat hangerejét állítja, a kapcsolathoz nem nyúl
  useEffect(() => {
    if (!matchInfo || !setPeerVolume) return undefined;
    const peerSids = matchInfo.players.flatMap((p) => (p.sid && p.i !== matchInfo.you ? [p.sid] : []));
    const timer = setInterval(() => {
      const list = clientRef.current?.voiceDistances() || [];
      const mine = list[matchInfo.you];
      for (const entry of list) {
        if (!entry.sid || entry === mine) continue;
        let volume = 1;
        if (voiceMode === 'team' && !matchInfo.flags.ffa) volume = entry.side === mine?.side ? 1 : 0;
        if (voiceMode === 'proximity') volume = Math.max(0, Math.min(1, 1 - (entry.distance - PROXIMITY_FULL) / (PROXIMITY_ZERO - PROXIMITY_FULL)));
        setPeerVolume(entry.sid, volume);
      }
    }, 250);
    return () => {
      clearInterval(timer);
      peerSids.forEach((sid) => setPeerVolume(sid, 1));
    };
  }, [matchInfo, voiceMode, setPeerVolume]);

  const changeQuality = (value: string) => {
    setQuality(value);
    try {
      localStorage.setItem(QUALITY_KEY, value);
    } catch {
      // csak kényelmi beállítás
    }
  };
  const changeVoice = (value: string) => {
    setVoiceMode(value);
    try {
      localStorage.setItem(VOICE_KEY, value);
    } catch {
      // csak kényelmi beállítás
    }
  };

  const joinBattle = (battleId: string) => {
    setTab('play');
    socket.emit('game:set-mode', { mode: 'team_deathmatch', options: { battleId } });
  };

  const speaking = matchInfo ? participants.filter((p) => p.isSpeaking).map((p) => p.username) : [];

  if (matchInfo) {
    return (
      <div className="flex-1 relative min-h-0 overflow-hidden" style={{ background: '#101329' }}>
        <div ref={canvasHostRef} className="absolute inset-0" />
        <ArenaHud hud={hud} info={matchInfo} speaking={speaking} />
        {IS_TOUCH && <TouchControls clientRef={clientRef} />}
        {!connected && (
          <div className="absolute inset-x-0 top-14 flex justify-center pointer-events-none">
            <div className="px-4 py-2 rounded-xl text-xs font-bold text-white" style={{ background: '#E94B64' }}>Megszakadt a kapcsolat, újracsatlakozás...</div>
          </div>
        )}
      </div>
    );
  }

  if (result?.factions) return <MatchResults result={result} factions={result.factions} onBack={() => setResult(null)} />;

  if (!lobby || !catalog) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2">
        {error ? <p className="text-sm" style={{ color: '#E94B64' }}>{error}</p> : <Loader2 className="w-6 h-6 animate-spin text-[#7655F5]" />}
      </div>
    );
  }

  const adminTab: readonly [string, string] = ['admin', 'Admin'];
  const tabs = [['play', 'Játék'] as const, ...MENU_TABS, ...(isAdmin ? [adminTab] : [])];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex gap-1 p-2 overflow-x-auto flex-shrink-0" style={{ background: '#101329' }}>
        {tabs.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className="px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap" style={{ background: tab === id ? '#7655F5' : 'transparent', color: tab === id ? '#fff' : '#999BBE' }}>{label}</button>
        ))}
      </div>
      {toast && (
        <div className="mx-3 mt-2 px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between gap-2" style={{ background: 'rgba(118,85,245,0.2)', color: '#F4F3FF' }}>
          <span>{toast.text}</span>
          {toast.lobbyId && <button type="button" onClick={() => { setOtherLobby(toast.lobbyId ?? null); setToast(null); setTab('play'); }} className="px-2 py-1 rounded-lg font-bold text-white" style={{ background: '#7655F5' }}>Csatlakozás</button>}
        </div>
      )}
      {tab === 'play' ? (
        <ArenaLobby lobby={lobby} catalog={catalog} socket={socket} profile={profile} error={error} notice={notice} onSwitchLobby={setOtherLobby} />
      ) : (
        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          <div className="max-w-4xl mx-auto">
            <GameMenu tab={tab} socket={socket} factions={catalog.factions} lobbyId={activeLobby} onJoinBattle={joinBattle} quality={quality} onQuality={changeQuality} voiceMode={voiceMode} onVoiceMode={changeVoice} />
          </div>
        </div>
      )}
    </div>
  );
}
