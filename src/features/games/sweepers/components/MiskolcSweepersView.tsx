// MiskolcSweepers: kooperatív, belső nézetes takarítós játék a hangszobán belül (lazy chunk).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { EMPTY_HUD, SweepersGame, type SweepersBuildHud, type SweepersDebugStats, type SweepersHud, type SweepersPanel, type SweepersPlayerHud, type SweepersRadar } from '../lib/engine/SweepersGame';
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
import BuildPalette from './BuildPalette';
import CranePanel from './CranePanel';
import LogisticsPanel from './LogisticsPanel';
import type { BagRow, Telemetry } from '../logisticsTypes';
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
  /** The panel E opened (D.7): office (MÉH műhely + Logisztika), büfé or crane. */
  const [panel, setPanel] = useState<SweepersPanel | null>(null);
  const panelRef = useRef<SweepersPanel | null>(null);
  panelRef.current = panel;
  const shopOpen = panel !== null;
  const [buildHud, setBuildHud] = useState<SweepersBuildHud | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  /** Join generation with logistics (0: the server has none); keys the Logisztika tab so a re-join re-subscribes. */
  const [logiGen, setLogiGen] = useState(0);
  const [craneBags, setCraneBags] = useState<readonly BagRow[]>([]);
  const [craneBusy, setCraneBusy] = useState(false);
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
    setPanel(null);
    setBuildHud(null);
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
          }
        },
        onPanel: (next) => {
          if (panelRef.current !== null) return;
          setPanel(next);
          gameRef.current?.unlock();
        },
        onBuild: setBuildHud,
        tieBag: (tier, onAck) => net?.tieBag(tier, onAck) ?? false,
        placeStructure: (req, onAck) => net?.placeStructure(req, onAck) ?? false,
        deleteStructure: (id, onAck) => net?.deleteStructure(id, onAck) ?? false,
        logisticsAction: (action, parse, onAck) => net?.logisticsAction(action, parse, onAck) ?? false,
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
        setLogiGen((g) => (state.logistics ? g + 1 : 0));
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
      onStructureSpawned: (row) => game.applyStructureSpawned(row),
      onLogistics: (update) => game.applyLogistics(update),
      onTelemetry: setTelemetry,
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
    setPanel(null);
    setTelemetry(null);
    gameRef.current?.lock();
  }, []);

  const subscribeTelemetry = useCallback((on: boolean) => {
    gameRef.current?.setTelemetry(on);
  }, []);

  // the crane panel lists the bags in the area; refreshed while it is open
  useEffect(() => {
    if (panel !== 'crane') return undefined;
    const refresh = () => {
      const game = gameRef.current;
      setCraneBags(game ? game.craneBags : []);
      setCraneBusy((game?.logistics.job ?? null) !== null);
    };
    refresh();
    const timer = setInterval(refresh, 500);
    return () => clearInterval(timer);
  }, [panel]);

  const sendCrane = useCallback((bag: number, to: number) => {
    gameRef.current?.sendCrane(bag, to);
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
      {ready && (panel === 'office' || panel === 'kiosk') && playerHud && !error && (
        <ShopPanel
          personal={playerHud.personal}
          access={panel === 'kiosk' ? { workbench: false, kiosk: true } : playerHud.shop}
          onBuy={buy}
          onClose={closeShop}
          logistics={panel === 'office' && logiGen > 0 ? <LogisticsPanel key={logiGen} telemetry={telemetry} onSubscribe={subscribeTelemetry} /> : undefined}
        />
      )}
      {ready && panel === 'crane' && !error && <CranePanel bags={craneBags} busy={craneBusy} onSend={sendCrane} onClose={closeShop} />}
      {ready && buildHud && !error && <BuildPalette hud={buildHud} />}

      {ready && !locked && !error && !shopOpen && !buildHud && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4" style={{ background: 'rgba(9, 10, 24, 0.55)' }}>
          <div className="rounded-xl px-6 py-5 max-w-sm text-center space-y-3" style={{ background: T.bg1, border: `1px solid ${T.border}`, color: T.text }}>
            <div className="text-lg font-black">MiskolcSweepers</div>
            <p className="text-xs" style={{ color: T.muted }}>
              WASD mozgás · Shift sprint · Space ugrás · Bal/jobb klikk eszköz · 1–6 eszközváltás · G kiborítás · Q bezsákolás · B építés · E használat · F3 diagnosztika · F11 teljes képernyő · Esc szünet
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
