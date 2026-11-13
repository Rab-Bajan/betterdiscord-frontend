// MiskolcSweepers: kooperatív, belső nézetes takarítós játék a hangszobán belül (lazy chunk).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { EMPTY_HUD, SweepersGame, type SweepersDebugStats, type SweepersHud, type SweepersPlayerHud, type SweepersRadar } from '../lib/engine/SweepersGame';
import { DISTRICT_HUD_NAMES } from '../types';
import { SweepersNet } from '../lib/net/SweepersNet';
import { useCallSettings } from '../../../call/lib/callSettings';
import type { SocketLike } from '../../../../shared/services/socket/SocketLike';
import HUDOverlay from './HUDOverlay';
import DebugOverlay from './DebugOverlay';
import LoadingScreen from './LoadingScreen';
import VoicePill, { type SweepersVoiceControls } from './VoicePill';
import ToolHud from './ToolHud';
import ShopPanel, { type ShopOffer } from './ShopPanel';
import { isToastable } from '../debrisTypes';
import { SWEEPERS_THEME as T } from '../theme';

interface MiskolcSweepersViewProps {
  socket: SocketLike;
  channelId: string | undefined;
  voice: SweepersVoiceControls;
  onClose: () => void;
}

/** How long the district-unlock toast stays up. */
const UNLOCK_TOAST_MS = 6000;
/** Player toasts (C.8): each stays this long; the same text again within TOAST_DEDUPE_MS is dropped. */
const TOAST_MS = 3000;
const TOAST_DEDUPE_MS = 1500;
const MAX_TOASTS = 4;

interface Toast {
  readonly id: number;
  readonly text: string;
  readonly at: number;
}

const NO_ROOM_MESSAGE = 'Nem vagy hangszobában.';
const kickedMessage = (reason: string): string =>
  reason === 'displaced' ? 'Egy másik ablakban csatlakoztál a világhoz.' : 'Kikerültél a világból.';

export default function MiskolcSweepersView({ socket, channelId, voice, onClose }: MiskolcSweepersViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<SweepersGame | null>(null);
  const debugVisibleRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  /** Set by `miskolc:kicked`: the game is torn down until the user re-joins. */
  const [kickedReason, setKickedReason] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [hud, setHud] = useState<SweepersHud>(EMPTY_HUD);
  const [radar, setRadar] = useState<SweepersRadar | null>(null);
  // every unlock while the toast is up joins it (d4 and d5 open together); a new array restarts the timer
  const [unlockToast, setUnlockToast] = useState<readonly string[] | null>(null);
  const [debugVisible, setDebugVisible] = useState(false);
  const [debugStats, setDebugStats] = useState<SweepersDebugStats | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playerHud, setPlayerHud] = useState<SweepersPlayerHud | null>(null);
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const [shopOpen, setShopOpen] = useState(false);
  const shopOpenRef = useRef(false);
  shopOpenRef.current = shopOpen;
  const netRef = useRef<SweepersNet | null>(null);
  const toastId = useRef(0);

  const pushToast = useCallback((text: string) => {
    const now = Date.now();
    setToasts((prev) => {
      if (prev.some((t) => t.text === text && now - t.at < TOAST_DEDUPE_MS)) return prev;
      toastId.current += 1;
      return [...prev, { id: toastId.current, text, at: now }].slice(-MAX_TOASTS);
    });
  }, []);
  const { outputDeviceId } = useCallSettings();
  const outputDeviceRef = useRef(outputDeviceId);
  outputDeviceRef.current = outputDeviceId;

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else el.requestFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement && document.fullscreenElement === containerRef.current) document.exitFullscreen?.().catch(() => {});
    };
  }, []);

  // Motor + hálózat életciklusa: lebontáskor mindent felszabadítunk
  useEffect(() => {
    const mount = mountRef.current;
    setReady(false);
    setHud(EMPTY_HUD);
    setRadar(null);
    setPlayerHud(null);
    setShopOpen(false);
    if (!channelId) {
      setError(NO_ROOM_MESSAGE);
      return undefined;
    }
    if (kickedReason !== null) {
      setError(kickedMessage(kickedReason));
      return undefined;
    }
    if (!mount) return undefined;
    setError(null);

    let game: SweepersGame;
    let net: SweepersNet | null = null;
    try {
      game = new SweepersGame(mount, {
        onReady: () => setReady(true),
        onHud: setHud,
        onDebug: (stats) => {
          if (debugVisibleRef.current) setDebugStats(stats);
        },
        onRadar: setRadar,
        onLockChange: setLocked,
        onAction: (action, edge) => {
          if (edge !== 'down') return;
          if (action === 'toggleDebug') {
            debugVisibleRef.current = !debugVisibleRef.current;
            setDebugVisible(debugVisibleRef.current);
          } else if (action === 'toggleFullscreen') {
            toggleFullscreen();
          } else if (action === 'interact' && !shopOpenRef.current) {
            const access = gameRef.current?.shopAccess;
            if (access && (access.workbench || access.kiosk)) {
              setShopOpen(true);
              gameRef.current?.unlock();
            }
          }
        },
        canSend: () => net?.canSend ?? false,
        sendInput: (input) => net?.sendInput(input),
        sendSweep: (hit, onAck) => net?.sendSweep(hit, onAck) ?? false,
        sendAction: (action, onAck) => net?.sendAction(action, onAck) ?? false,
        onPlayer: setPlayerHud,
        onToast: pushToast
      });
    } catch {
      setError('A 3D motor nem indítható (WebGL nem elérhető).');
      return undefined;
    }
    game.audio.setOutputDevice(outputDeviceRef.current);
    gameRef.current = game;

    net = new SweepersNet(socket, channelId, {
      onInit: (state) => {
        setError(null);
        game.applyInit(state);
      },
      onTick: (tick) => game.applyTick(tick),
      onPlayerJoined: (player) => game.addPlayer(player),
      onPlayerLeft: (id) => game.removePlayer(id),
      onJoinError: (message) => setError(message), // the server sends Hungarian refusal text
      onRtt: (ms) => game.setRtt(ms),
      onDistrictUnlocked: (event) => {
        game.applyDistrictUnlocked(event);
        const name = DISTRICT_HUD_NAMES[event.district];
        if (name) setUnlockToast((prev) => (prev ? [...prev.filter((n) => n !== name), name] : [name]));
      },
      onClock: (clock) => game.applyClock(clock),
      onWeather: (weather) => game.applyWeather(weather),
      onDebris: (update) => game.applyDebris(update),
      onPersonal: (personal) => game.applyPersonal(personal),
      onKicked: (reason) => {
        game.unlock();
        setKickedReason(reason); // re-runs this effect: the cleanup stops the net (no leave_room) and disposes the game
      }
    });
    net.start();
    netRef.current = net;

    return () => {
      net?.stop();
      net = null;
      netRef.current = null;
      gameRef.current = null;
      game.dispose();
    };
  }, [socket, channelId, retryNonce, kickedReason, toggleFullscreen, pushToast]);

  useEffect(() => {
    if (toasts.length === 0) return undefined;
    const first = toasts[0];
    if (!first) return undefined;
    const timer = setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== first.id)), Math.max(0, first.at + TOAST_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [toasts]);

  const buy = useCallback((offer: ShopOffer) => {
    if (!offer.buy) return;
    const sent = netRef.current?.buyUpgrade(offer.buy, (ack) => {
      if (ack.ok) pushToast(offer.repair ? `Megjavítva: ${offer.toastName}` : `Megvetted: ${offer.toastName}`);
      else if (isToastable(ack, false)) pushToast(ack.error);
    });
    if (!sent) pushToast('Nincs kapcsolat a szerverrel.');
  }, [pushToast]);

  const closeShop = useCallback(() => {
    setShopOpen(false);
    gameRef.current?.lock();
  }, []);

  useEffect(() => {
    gameRef.current?.audio.setOutputDevice(outputDeviceId);
  }, [outputDeviceId]);

  useEffect(() => {
    if (unlockToast === null) return undefined;
    const timer = setTimeout(() => setUnlockToast(null), UNLOCK_TOAST_MS);
    return () => clearTimeout(timer);
  }, [unlockToast]);

  useEffect(() => {
    gameRef.current?.audio.setMuted(voice.isDeafened);
  }, [voice.isDeafened, ready]);

  return (
    <div ref={containerRef} className="flex-1 relative min-h-0 min-w-0 overflow-hidden select-none" style={{ background: T.bg0, fontFamily: T.font }}>
      <div ref={mountRef} className="absolute inset-0" />

      {ready && <HUDOverlay hud={hud} radar={radar} unlockToast={unlockToast ? unlockToast.join(', ') : null} isFullscreen={isFullscreen} onToggleFullscreen={toggleFullscreen} />}
      {ready && debugVisible && debugStats && <DebugOverlay stats={debugStats} />}
      {ready && playerHud?.debris && <ToolHud hud={playerHud} />}
      {ready && toasts.length > 0 && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1 pointer-events-none" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: 'rgba(16, 19, 41, 0.9)', border: `1px solid ${T.border}`, color: T.text }}>{t.text}</div>
          ))}
        </div>
      )}
      {ready && shopOpen && playerHud && !error && (
        <ShopPanel personal={playerHud.personal} access={playerHud.shop} onBuy={buy} onClose={closeShop} />
      )}

      {ready && !locked && !error && !shopOpen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4" style={{ background: 'rgba(9, 10, 24, 0.55)' }}>
          <div className="rounded-xl px-6 py-5 max-w-sm text-center space-y-3" style={{ background: T.bg1, border: `1px solid ${T.border}`, color: T.text }}>
            <div className="text-lg font-black">MiskolcSweepers</div>
            <p className="text-xs" style={{ color: T.muted }}>
              WASD mozgás · Shift sprint · Space ugrás · Bal/jobb klikk eszköz · 1–6 eszközváltás · G kiborítás · E bolt · F3 diagnosztika · F11 teljes képernyő · Esc szünet
            </p>
            <button
              type="button"
              onClick={() => gameRef.current?.lock()}
              className="w-full px-4 py-2 rounded-lg font-bold text-sm"
              style={{ background: `linear-gradient(135deg, ${T.violet}, ${T.blue})`, color: '#fff' }}
            >
              Takarítás folytatása
            </button>
            <button type="button" onClick={onClose} className="w-full px-4 py-2 rounded-lg font-semibold text-xs flex items-center justify-center gap-1" style={{ background: T.bg3, color: T.text }}>
              <X className="w-3.5 h-3.5" /> Vissza a szobába
            </button>
          </div>
        </div>
      )}

      {(!ready || error) && (
        <LoadingScreen
          error={error}
          retryLabel={kickedReason !== null ? 'Visszacsatlakozás' : 'Újra'}
          onRetry={!channelId ? undefined : kickedReason !== null ? () => setKickedReason(null) : () => setRetryNonce((n) => n + 1)}
        />
      )}
      {isFullscreen && <VoicePill {...voice} />}
    </div>
  );
}
