import React, { useState, useEffect, useMemo, useRef, type ClipboardEvent, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { RotateCw, AlertCircle } from 'lucide-react';
import { isRecord, isString, stringField } from '../../../../shared/lib/guards';
import type { SocketLike } from '../../../../shared/services/socket/SocketLike';
import type { CurrentUser } from '../../../../shared/types';
import type { RoomSession } from '../../../voice-room/types';
import { RemoteBrowserInput, VIEWPORT_HEIGHT, VIEWPORT_WIDTH, toViewport, type ViewportPoint } from '../lib/RemoteBrowserInput';
import { isBrowserSession, type BrowserControlMode } from '../types';
import BrowserStartPanel from './BrowserStartPanel';
import BrowserToolbar from './BrowserToolbar';
import BrowserTextInputModal from './BrowserTextInputModal';

interface RemoteCursor {
  username: string | undefined;
  color: string | undefined;
  x: number;
  y: number;
  lastSeen: number;
}

const CURSOR_TIMEOUT_MS = 3000;

/** Cursors seen in the last 3 s; the same object when none expired. */
function pruneCursors(cursors: Record<string, RemoteCursor>, now: number): Record<string, RemoteCursor> {
  let changed = false;
  const next: Record<string, RemoteCursor> = {};
  for (const [id, c] of Object.entries(cursors)) {
    if (now - c.lastSeen < CURSOR_TIMEOUT_MS) next[id] = c;
    else changed = true;
  }
  return changed ? next : cursors;
}

interface BrowserViewProps {
  channelId: string | undefined;
  channelName: string | undefined;
  currentUser: CurrentUser | null;
  socket: SocketLike | null | undefined;
  session: RoomSession | undefined;
  onClose: () => void;
  onStart?: (url?: string) => void;
  onNavigate?: (url: string) => void;
  onBack?: () => void;
  onForward?: () => void;
  onReload?: () => void;
  onReset?: () => void;
  onSetMode?: (mode: BrowserControlMode) => void;
  onTakeControl?: () => void;
  onReleaseControl?: () => void;
  onStop?: () => void;
}

export default function BrowserView({
  channelId,
  channelName,
  currentUser,
  socket,
  session: roomSession,
  onClose,
  onStart,
  onNavigate,
  onBack,
  onForward,
  onReload,
  onReset,
  onSetMode,
  onTakeControl,
  onReleaseControl,
  onStop
}: BrowserViewProps) {
  const session = isBrowserSession(roomSession) ? roomSession : null;
  const [frameData, setFrameData] = useState<string | null>(null);
  const [addressInput, setAddressInput] = useState('');
  const [remoteCursors, setRemoteCursors] = useState<Record<string, RemoteCursor>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [customText, setCustomText] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const startTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const input = useMemo(() => new RemoteBrowserInput(socket, channelId), [socket, channelId]);

  const isActive = !!session?.active;
  const isController = session?.controller?.id === socket?.id;
  const canInteract = session?.controlMode === 'free' || isController;

  // Címke beállítása, ha a munkamenet URL-je változik
  useEffect(() => {
    if (session?.currentUrl) {
      setAddressInput(session.currentUrl);
    }
  }, [session?.currentUrl]);

  // Leállítás után ne a régi munkamenet utolsó képkockája látszódjon
  useEffect(() => {
    if (isActive) {
      setIsStarting(false);
      clearTimeout(startTimerRef.current);
    } else {
      setFrameData(null);
    }
  }, [isActive]);

  useEffect(() => () => clearTimeout(startTimerRef.current), []);

  // A szerver hiánya vagy hibája esetén se maradjon válasz nélkül az indítás
  const startSession = (url?: string) => {
    setIsStarting(true);
    clearTimeout(startTimerRef.current);
    startTimerRef.current = setTimeout(() => {
      setIsStarting(false);
      setErrorMessage('A szerver nem indította el a böngészőt. Ellenőrizd, hogy fut-e a böngésző modul a szerveren.');
    }, 20000);
    onStart?.(url);
  };

  // View enter és leave értesítés a szervernek
  useEffect(() => {
    if (!channelId || !socket) return undefined;

    socket.emit('browser:view-enter', { channelId });

    const handleFrame = (frame: unknown) => {
      const data = stringField(frame, 'data');
      if (data) {
        setFrameData(`data:image/jpeg;base64,${data}`);
      }
    };

    const handleCursor = (payload: unknown) => {
      if (!isRecord(payload) || !isString(payload.userId) || typeof payload.x !== 'number' || typeof payload.y !== 'number') return;
      const { userId, x, y } = payload;
      if (userId === socket.id) return;
      setRemoteCursors((prev) => ({
        ...prev,
        [userId]: { username: stringField(payload, 'username'), color: stringField(payload, 'color'), x, y, lastSeen: Date.now() }
      }));
    };

    const handleError = (payload: unknown) => {
      setIsStarting(false);
      clearTimeout(startTimerRef.current);
      setErrorMessage(stringField(payload, 'message') || 'Hiba történt a böngészőben');
      setTimeout(() => setErrorMessage(null), 5000);
    };

    socket.on('browser:frame', handleFrame);
    socket.on('browser:cursor-moved', handleCursor);
    socket.on('browser:error', handleError);

    // Kérjük le a kezdeti állapotot és kockát
    socket.emit('browser:get-state', { channelId });

    // Régi inaktív kurzorok takarítása másodpercenként
    const cursorInterval = setInterval(() => {
      const now = Date.now();
      setRemoteCursors((prev) => pruneCursors(prev, now));
    }, 1000);

    return () => {
      socket.emit('browser:view-leave', { channelId });
      socket.off('browser:frame', handleFrame);
      socket.off('browser:cursor-moved', handleCursor);
      socket.off('browser:error', handleError);
      clearInterval(cursorInterval);
    };
  }, [channelId, socket]);

  // Teljes képernyős mód kezelése
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // A viewport a pontos 16:9-es képterület, így a koordináták és a kurzorok nem csúsznak el
  const getCoordinates = (e: { clientX: number; clientY: number }): ViewportPoint | null => {
    if (!viewportRef.current) return null;
    return toViewport(e.clientX, e.clientY, viewportRef.current.getBoundingClientRect());
  };

  // Egérmozgás
  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const coords = getCoordinates(e);
    if (coords) input.move(coords);
  };

  // Egérkattintás
  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (!canInteract) return;
    if (e.button === 1) e.preventDefault(); // a középső gomb ne indítson automatikus görgetést
    viewportRef.current?.focus();
    setIsFocused(true);

    const coords = getCoordinates(e);
    if (coords) input.click(coords, e.button, e.detail);
  };

  // Egérgörgő: a React passzív wheel figyelője nem tudná megakadályozni az oldal görgetését
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !isActive || !canInteract) return undefined;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      input.scroll(getCoordinates(e) || { x: VIEWPORT_WIDTH / 2, y: VIEWPORT_HEIGHT / 2 }, e.deltaX, e.deltaY);
    };

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [isActive, canInteract, input]);

  // Billentyűzet kezelés
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!canInteract || !isFocused) return;
    input.keyDown(e);
  };

  const handleKeyUp = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!canInteract || !isFocused) return;
    input.keyUp(e);
  };

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    if (!canInteract) return;
    const text = e.clipboardData?.getData('text');
    if (!text) return;
    e.preventDefault();
    input.insertText(text);
  };

  // Címsor Enter
  const handleAddressSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!addressInput.trim()) return;
    if (!isActive) {
      startSession(addressInput.trim());
    } else {
      onNavigate?.(addressInput.trim());
    }
  };

  // Kényelmi szövegküldés modálból
  const handleSendCustomText = (e: FormEvent) => {
    e.preventDefault();
    if (!customText) return;
    input.insertText(customText);
    setCustomText('');
    setShowTextInput(false);
  };

  return (
    <div
      ref={containerRef}
      className={`flex-1 flex flex-col min-h-0 h-full overflow-hidden select-none ${
        isFullscreen ? 'p-0 bg-[#090A18] fixed inset-0 z-50' : 'p-2 sm:p-4'
      }`}
      style={{ background: '#090A18' }}
    >
      {/* Hibaüzenet sáv */}
      {errorMessage && (
        <div
          className="mb-2 px-4 py-2.5 rounded-xl flex items-center justify-between text-xs font-semibold animate-in fade-in flex-shrink-0"
          style={{ background: 'rgba(233, 75, 100, 0.15)', border: '1px solid rgba(233, 75, 100, 0.4)', color: '#F4F3FF' }}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#E94B64] flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="p-2 rounded-xl text-white hover:text-white/80 flex-shrink-0">✕</button>
        </div>
      )}

      {/* Böngésző fejléc / Címsor és vezérlők */}
      <BrowserToolbar
        session={session}
        isController={isController}
        canInteract={canInteract}
        addressInput={addressInput}
        setAddressInput={setAddressInput}
        onAddressSubmit={handleAddressSubmit}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        onOpenTextInput={() => setShowTextInput(true)}
        onBack={onBack}
        onForward={onForward}
        onReload={onReload}
        onReset={onReset}
        onSetMode={onSetMode}
        onTakeControl={onTakeControl}
        onReleaseControl={onReleaseControl}
        onStop={onStop}
      />

      {/* Fő Viewport terület */}
      <div
        className="flex-1 flex flex-col items-center justify-center min-h-0 relative overflow-hidden rounded-2xl shadow-2xl"
        style={{
          background: '#101329',
          border: '1px solid rgba(125, 105, 255, 0.18)'
        }}
      >
        {/* Betöltési folyamatjelző csík */}
        {session?.isLoading && (
          <div className="absolute top-0 left-0 right-0 h-1 z-30 overflow-hidden bg-transparent">
            <div
              className="h-full w-full animate-pulse"
              style={{ background: 'linear-gradient(90deg, #7655F5, #536CFF, #28C997)' }}
            />
          </div>
        )}

        {isActive ? (
          <div className="w-full h-full flex items-center justify-center overflow-hidden" style={{ containerType: 'size' }}>
          <div
            ref={viewportRef}
            tabIndex={0}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            onPaste={handlePaste}
            onContextMenu={(e) => e.preventDefault()}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className="relative flex items-center justify-center outline-none cursor-crosshair overflow-hidden"
            style={{ touchAction: 'none', aspectRatio: '16 / 9', width: 'min(100cqw, calc(100cqh * 16 / 9))' }}
          >
            {frameData ? (
              <img
                src={frameData}
                alt="Shared Browser Screen"
                draggable={false}
                className="w-full h-full object-fill pointer-events-none select-none rounded-lg"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-center p-6">
                <RotateCw className="w-8 h-8 text-[#7655F5] animate-spin" />
                <p className="text-sm font-semibold text-[#F4F3FF]">Böngésző képkocka betöltése...</p>
                <p className="text-xs text-[#999BBE]">Kérjük várj, a szerver generálja a böngésző képet.</p>
              </div>
            )}

            {/* Többfelhasználós kurzor réteg */}
            {Object.entries(remoteCursors).map(([id, cursor]) => {
              const leftPercent = (cursor.x / 1280) * 100;
              const topPercent = (cursor.y / 720) * 100;
              return (
                <div
                  key={id}
                  className="absolute pointer-events-none z-20 flex flex-col items-start transition-all duration-75"
                  style={{
                    left: `${leftPercent}%`,
                    top: `${topPercent}%`,
                    transform: 'translate(-2px, -2px)'
                  }}
                >
                  <svg
                    className="w-5 h-5 drop-shadow-md"
                    viewBox="0 0 24 24"
                    fill={cursor.color || '#7655F5'}
                    stroke="white"
                    strokeWidth="1.5"
                  >
                    <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                  </svg>
                  <span
                    className="mt-0.5 px-2 py-0.5 rounded-md text-[10px] font-bold text-white shadow-md truncate max-w-[100px]"
                    style={{ background: cursor.color || '#7655F5' }}
                  >
                    {cursor.username}
                  </span>
                </div>
              );
            })}

            {/* Fókusz és irányítási értesítő felirat */}
            {!canInteract && (
              <div
                className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-xs font-semibold backdrop-blur-md pointer-events-none z-30"
                style={{
                  background: 'rgba(21, 24, 50, 0.85)',
                  border: '1px solid rgba(125, 105, 255, 0.25)',
                  color: '#999BBE'
                }}
              >
                🎮 Kijelölt irányítási mód aktív. Csak az irányító vezérelheti a böngészőt.
              </div>
            )}

            {canInteract && !isFocused && (
              <div
                className="absolute top-4 right-4 px-3 py-1.5 rounded-xl text-xs font-medium backdrop-blur-md pointer-events-none z-30 animate-pulse"
                style={{
                  background: 'rgba(21, 24, 50, 0.75)',
                  border: '1px solid rgba(125, 105, 255, 0.2)',
                  color: '#F4F3FF'
                }}
              >
                💡 Kattints a felületre a billentyűzet fókuszálásához!
              </div>
            )}
          </div>
          </div>
        ) : (
          <BrowserStartPanel
            addressInput={addressInput}
            setAddressInput={setAddressInput}
            onAddressSubmit={handleAddressSubmit}
            isStarting={isStarting}
            onStartSession={startSession}
          />
        )}
      </div>

      {/* Szövegbeviteli modál (vágólap vagy kényelmi gépelés) */}
      {showTextInput && (
        <BrowserTextInputModal
          customText={customText}
          setCustomText={setCustomText}
          onSubmit={handleSendCustomText}
          onClose={() => setShowTextInput(false)}
        />
      )}
    </div>
  );
}
