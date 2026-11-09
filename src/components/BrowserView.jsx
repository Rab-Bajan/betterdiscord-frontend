import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  RotateCcw,
  Lock,
  Globe,
  Maximize2,
  Minimize2,
  Power,
  Users,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  Keyboard,
  Gamepad2,
  UserCheck,
  Sparkles
} from 'lucide-react';

const SUGGESTED_SITES = [
  { name: 'Wikipedia', url: 'https://en.wikipedia.org', icon: '📖' },
  { name: 'GitHub', url: 'https://github.com', icon: '🐙' },
  { name: 'Hacker News', url: 'https://news.ycombinator.com', icon: '⚡' },
  { name: 'DuckDuckGo', url: 'https://duckduckgo.com', icon: '🦆' },
  { name: 'Reddit', url: 'https://old.reddit.com', icon: '🤖' }
];

export default function BrowserView({
  channelId,
  channelName,
  currentUser,
  socket,
  session,
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
}) {
  const [frameData, setFrameData] = useState(null);
  const [addressInput, setAddressInput] = useState('');
  const [remoteCursors, setRemoteCursors] = useState({});
  const [errorMessage, setErrorMessage] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [customText, setCustomText] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const containerRef = useRef(null);
  const viewportRef = useRef(null);
  const lastMoveSentRef = useRef(0);
  const startTimerRef = useRef(null);

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
  const startSession = (url) => {
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
    if (!channelId || !socket) return;

    socket.emit('browser:view-enter', { channelId });

    const handleFrame = (frame) => {
      if (frame?.data) {
        setFrameData(`data:image/jpeg;base64,${frame.data}`);
      }
    };

    const handleCursor = ({ userId, username, color, x, y }) => {
      if (userId === socket.id) return;
      setRemoteCursors((prev) => ({
        ...prev,
        [userId]: { username, color, x, y, lastSeen: Date.now() }
      }));
    };

    const handleError = ({ message }) => {
      setIsStarting(false);
      clearTimeout(startTimerRef.current);
      setErrorMessage(message || 'Hiba történt a böngészőben');
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
      setRemoteCursors((prev) => {
        let changed = false;
        const next = {};
        for (const [id, c] of Object.entries(prev)) {
          if (now - c.lastSeen < 3000) {
            next[id] = c;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
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
  const getCoordinates = (e) => {
    if (!viewportRef.current) return null;
    const rect = viewportRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const scaleX = 1280 / rect.width;
    const scaleY = 720 / rect.height;
    const x = Math.min(1280, Math.max(0, (e.clientX - rect.left) * scaleX));
    const y = Math.min(720, Math.max(0, (e.clientY - rect.top) * scaleY));
    return { x, y };
  };

  // Egérmozgás
  const handleMouseMove = (e) => {
    const coords = getCoordinates(e);
    if (!coords) return;

    const now = Date.now();
    if (now - lastMoveSentRef.current > 35) {
      lastMoveSentRef.current = now;
      socket?.emit('browser:mouse-move', { channelId, x: coords.x, y: coords.y });
    }
  };

  // Egérkattintás
  const handleMouseDown = (e) => {
    if (!canInteract) return;
    if (e.button === 1) e.preventDefault(); // a középső gomb ne indítson automatikus görgetést
    viewportRef.current?.focus();
    setIsFocused(true);

    const coords = getCoordinates(e);
    if (!coords) return;

    const button = e.button === 2 ? 'right' : (e.button === 1 ? 'middle' : 'left');
    socket?.emit('browser:mouse-click', {
      channelId,
      x: coords.x,
      y: coords.y,
      button,
      clickCount: e.detail || 1
    });
  };

  // Egérgörgő: a React passzív wheel figyelője nem tudná megakadályozni az oldal görgetését
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !isActive || !canInteract) return undefined;

    const handleWheel = (e) => {
      e.preventDefault();
      const coords = getCoordinates(e) || { x: 640, y: 360 };
      socket?.emit('browser:scroll', {
        channelId,
        x: coords.x,
        y: coords.y,
        deltaX: e.deltaX,
        deltaY: e.deltaY
      });
    };

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [isActive, canInteract, channelId, socket]);

  // Billentyűzet kezelés
  const handleKeyDown = (e) => {
    if (!canInteract || !isFocused) return;

    // Az AltGr több billentyűzeten Ctrl+Alt-ként érkezik, de karaktert ír (pl. @ a magyar kiosztáson)
    const altGraph = e.getModifierState?.('AltGraph');
    const ctrlKey = e.ctrlKey && !altGraph;
    const altKey = e.altKey && !altGraph;

    // A Ctrl+V-t a paste esemény kezeli, így a helyi vágólap tartalma kerül a böngészőbe
    if (ctrlKey && !altKey && !e.metaKey && e.key.toLowerCase() === 'v') return;

    // Speciális böngésző funkcióbillentyűk engedése / megelőzése
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Backspace', 'Enter'].includes(e.code)) {
      e.preventDefault();
    }

    const modifiers = (altKey ? 1 : 0) | (ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);

    socket?.emit('browser:key', {
      channelId,
      type: 'keydown',
      key: e.key,
      code: e.code,
      keyCode: e.keyCode,
      modifiers
    });

    // Az Enter csak char eseménnyel küld el űrlapot vagy kezd új sort a CDP-n keresztül
    const text = e.key === 'Enter' ? '\r' : e.key.length === 1 && !ctrlKey && !altKey && !e.metaKey ? e.key : null;
    if (text) {
      socket?.emit('browser:key', { channelId, type: 'char', text });
    }
  };

  const handleKeyUp = (e) => {
    if (!canInteract || !isFocused) return;
    socket?.emit('browser:key', {
      channelId,
      type: 'keyup',
      key: e.key,
      code: e.code,
      keyCode: e.keyCode
    });
  };

  const handlePaste = (e) => {
    if (!canInteract) return;
    const text = e.clipboardData?.getData('text');
    if (!text) return;
    e.preventDefault();
    socket?.emit('browser:insert-text', { channelId, text });
  };

  // Címsor Enter
  const handleAddressSubmit = (e) => {
    e.preventDefault();
    if (!addressInput.trim()) return;
    if (!isActive) {
      startSession(addressInput.trim());
    } else {
      onNavigate?.(addressInput.trim());
    }
  };

  // Kényelmi szövegküldés modálból
  const handleSendCustomText = (e) => {
    e.preventDefault();
    if (!customText) return;
    socket?.emit('browser:insert-text', { channelId, text: customText });
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
      <div
        className="rounded-2xl p-2 sm:p-3 mb-2 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 flex-shrink-0 shadow-lg"
        style={{
          background: '#151832',
          border: '1px solid rgba(125, 105, 255, 0.18)'
        }}
      >
        {/* Navigációs gombok és Címsor */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 flex-1 min-w-0">
          <button
            onClick={onBack}
            disabled={!isActive || !canInteract}
            title="Vissza"
            className="p-2 rounded-xl transition disabled:opacity-40 flex-shrink-0"
            style={{ background: '#1B2040', color: '#F4F3FF', border: '1px solid rgba(125, 105, 255, 0.15)' }}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={onForward}
            disabled={!isActive || !canInteract}
            title="Előre"
            className="p-2 rounded-xl transition disabled:opacity-40 flex-shrink-0"
            style={{ background: '#1B2040', color: '#F4F3FF', border: '1px solid rgba(125, 105, 255, 0.15)' }}
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={onReload}
            disabled={!isActive || !canInteract}
            title="Újratöltés"
            className="p-2 rounded-xl transition disabled:opacity-40 flex-shrink-0"
            style={{ background: '#1B2040', color: '#F4F3FF', border: '1px solid rgba(125, 105, 255, 0.15)' }}
          >
            <RotateCw className={`w-4 h-4 ${session?.isLoading ? 'animate-spin text-[#7655F5]' : ''}`} />
          </button>
          <button
            onClick={onReset}
            disabled={!isActive || !canInteract}
            title="Alaphelyzet (Wikipedia)"
            className="p-2 rounded-xl transition disabled:opacity-40 flex-shrink-0"
            style={{ background: '#1B2040', color: '#F4F3FF', border: '1px solid rgba(125, 105, 255, 0.15)' }}
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Címsor Űrlap */}
          <form onSubmit={handleAddressSubmit} className="flex-1 basis-full sm:basis-0 flex items-center min-w-0 relative">
            <div className="absolute left-3 flex items-center pointer-events-none">
              <Lock className="w-3.5 h-3.5 text-[#28C997]" />
            </div>
            <input
              type="text"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              placeholder="Írj be egy URL-t (pl. https://en.wikipedia.org vagy github.com)..."
              disabled={isActive && !canInteract}
              className="w-full pl-9 pr-20 py-2 rounded-xl text-xs sm:text-sm font-medium transition outline-none disabled:opacity-60"
              style={{
                background: '#101329',
                color: '#F4F3FF',
                border: '1px solid rgba(125, 105, 255, 0.2)'
              }}
            />
            <button
              type="submit"
              disabled={isActive && !canInteract}
              className="absolute right-1.5 px-3 py-1 rounded-lg text-xs font-semibold text-white transition"
              style={{ background: 'linear-gradient(135deg, #7655F5, #536CFF)' }}
            >
              Ugrás
            </button>
          </form>
        </div>

        {/* Módváltó és vezérlő ikonok */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 md:flex-shrink-0 min-w-0">
          {/* Mód kapcsoló (Szabad / Irányítós) */}
          {isActive && (
            <div className="flex items-center gap-1.5 bg-[#101329] p-1 rounded-xl border border-[rgba(125,105,255,0.15)]">
              <button
                onClick={() => onSetMode?.(session.controlMode === 'free' ? 'controller' : 'free')}
                title={session.controlMode === 'free' ? 'Átváltás kijelölt irányító módra' : 'Átváltás szabad interakciós módra'}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                style={{
                  background: session.controlMode === 'free' ? '#7655F5' : 'transparent',
                  color: session.controlMode === 'free' ? 'white' : '#999BBE'
                }}
              >
                <Users className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Szabad</span>
              </button>
              <button
                onClick={() => onSetMode?.(session.controlMode === 'controller' ? 'free' : 'controller')}
                title={session.controlMode === 'controller' ? 'Átváltás szabad módra' : 'Csak kijelölt személy irányíthat'}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                style={{
                  background: session.controlMode === 'controller' ? '#536CFF' : 'transparent',
                  color: session.controlMode === 'controller' ? 'white' : '#999BBE'
                }}
              >
                <Gamepad2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Irányító</span>
              </button>
            </div>
          )}

          {/* Ha Irányító mód van, ki az irányító? */}
          {isActive && session.controlMode === 'controller' && (
            <div className="flex items-center gap-1.5">
              {session.controller ? (
                <div
                  className="px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                  style={{
                    background: 'rgba(118, 85, 245, 0.15)',
                    border: '1px solid rgba(118, 85, 245, 0.3)',
                    color: '#F4F3FF'
                  }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: session.controller.color || '#7655F5' }} />
                  <span className="max-w-[80px] sm:max-w-[120px] truncate">{session.controller.username}</span>
                </div>
              ) : (
                <span className="text-xs text-[#999BBE] italic">Nincs irányító</span>
              )}

              {isController ? (
                <button
                  onClick={onReleaseControl}
                  className="px-2.5 py-1 rounded-xl text-xs font-bold text-white transition"
                  style={{ background: '#E94B64' }}
                >
                  Leadás
                </button>
              ) : (
                <button
                  onClick={onTakeControl}
                  className="px-2.5 py-1 rounded-xl text-xs font-bold text-white transition shadow"
                  style={{ background: 'linear-gradient(135deg, #7655F5, #536CFF)' }}
                >
                  Átvétel
                </button>
              )}
            </div>
          )}

          {/* Szövegbeviteli segédgomb */}
          {isActive && canInteract && (
            <button
              onClick={() => setShowTextInput(true)}
              title="Szöveg beillesztése / gépelés modálból"
              className="p-2 rounded-xl text-xs transition flex-shrink-0"
              style={{ background: '#1B2040', color: '#999BBE', border: '1px solid rgba(125, 105, 255, 0.15)' }}
            >
              <Keyboard className="w-4 h-4" />
            </button>
          )}

          {/* Nézőszám */}
          {isActive && (
            <div
              className="px-2.5 py-1 rounded-xl text-xs font-medium flex items-center gap-1.5 flex-shrink-0"
              style={{ background: '#1B2040', color: '#999BBE', border: '1px solid rgba(125, 105, 255, 0.15)' }}
              title={`Csatlakozott nézők: ${session.viewerCount || 1}`}
            >
              <Users className="w-3.5 h-3.5 text-[#28C997]" />
              <span>{session.viewerCount || 1}</span>
            </div>
          )}

          {/* Teljes képernyő */}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Kilépés a teljes képernyőből' : 'Teljes képernyő'}
            className="p-2 rounded-xl transition flex-shrink-0"
            style={{ background: '#1B2040', color: '#F4F3FF', border: '1px solid rgba(125, 105, 255, 0.15)' }}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Leállítás */}
          {isActive && (
            <button
              onClick={onStop}
              title="Közös böngésző bezárása mindenkinek"
              className="p-2 rounded-xl transition flex-shrink-0 text-white"
              style={{ background: '#E94B64' }}
            >
              <Power className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

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
          /* Kezdőképernyő: még nem indult böngésző */
          <div className="max-w-xl w-full min-h-0 overflow-y-auto p-6 sm:p-8 flex flex-col items-center text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-xl"
              style={{
                background: 'linear-gradient(135deg, rgba(118, 85, 245, 0.2), rgba(83, 108, 255, 0.2))',
                border: '1px solid rgba(125, 105, 255, 0.3)'
              }}
            >
              <Globe className="w-8 h-8 text-[#7655F5]" />
            </div>

            <h2 className="text-xl sm:text-2xl font-bold mb-2 text-[#F4F3FF]">
              Közös Böngésző (Shared Browser)
            </h2>
            <p className="text-xs sm:text-sm text-[#999BBE] mb-6 max-w-md">
              Böngésszetek együtt bármilyen nyilvános weboldalt valós időben! Mindenki ugyanazt látja, és közösen irányíthatjátok.
            </p>

            {/* Kezdő URL mező */}
            <form onSubmit={handleAddressSubmit} className="w-full mb-6">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={addressInput}
                  onChange={(e) => setAddressInput(e.target.value)}
                  placeholder="https://en.wikipedia.org"
                  className="flex-1 min-w-0 px-4 py-3 rounded-xl text-sm font-medium outline-none transition"
                  style={{
                    background: '#151832',
                    color: '#F4F3FF',
                    border: '1px solid rgba(125, 105, 255, 0.25)'
                  }}
                />
                <button
                  type="submit"
                  disabled={isStarting}
                  className="flex-shrink-0 px-4 sm:px-6 py-3 rounded-xl font-bold text-sm text-white shadow-lg transition active:scale-95 disabled:opacity-60"
                  style={{
                    background: 'linear-gradient(135deg, #7655F5, #536CFF)'
                  }}
                >
                  {isStarting ? 'Indítás...' : 'Indítás'}
                </button>
              </div>
            </form>

            {/* Ajánlott weboldalak */}
            <div className="w-full">
              <p className="text-xs font-semibold text-[#999BBE] uppercase tracking-wider mb-3">
                Gyors indítás
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {SUGGESTED_SITES.map((site) => (
                  <button
                    key={site.name}
                    disabled={isStarting}
                    onClick={() => {
                      setAddressInput(site.url);
                      startSession(site.url);
                    }}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition hover:scale-105"
                    style={{
                      background: '#151832',
                      color: '#F4F3FF',
                      border: '1px solid rgba(125, 105, 255, 0.15)'
                    }}
                  >
                    <span>{site.icon}</span>
                    <span>{site.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Szövegbeviteli modál (vágólap vagy kényelmi gépelés) */}
      {showTextInput && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4">
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 rounded-2xl shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95"
            style={{ background: '#151832', border: '1px solid rgba(125, 105, 255, 0.25)' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-[#7655F5]" />
                <h3 className="font-bold text-sm text-[#F4F3FF]">Szöveg beillesztése a böngészőbe</h3>
              </div>
              <button onClick={() => setShowTextInput(false)} className="p-2 rounded-xl text-[#999BBE] hover:text-white">✕</button>
            </div>
            <p className="text-xs text-[#999BBE]">
              A beírt vagy beillesztett szöveg közvetlenül a fókuszban lévő beviteli mezőbe kerül.
            </p>
            <form onSubmit={handleSendCustomText} className="flex flex-col gap-3">
              <textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Írd be vagy másold be ide a szöveget..."
                rows={3}
                autoFocus
                className="w-full p-3 rounded-xl text-sm outline-none resize-none font-medium"
                style={{ background: '#101329', color: '#F4F3FF', border: '1px solid rgba(125, 105, 255, 0.2)' }}
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTextInput(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#999BBE]"
                >
                  Mégse
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white shadow"
                  style={{ background: 'linear-gradient(135deg, #7655F5, #536CFF)' }}
                >
                  Beillesztés
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
