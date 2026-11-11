import React, { useRef, useState, useEffect } from 'react';
import {
  Sparkles,
  Maximize2,
  Minimize2,
  RotateCcw,
  LogOut,
  PowerOff,
  Dices,
  Users,
  Gamepad2
} from 'lucide-react';

export default function CasinoView({
  channelId,
  channelName,
  currentUser,
  session,
  onStartSession,
  onStopSession,
  onClose
}) {
  const containerRef = useRef(null);
  const iframeRef = useRef(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  const isSessionActive = session && session.active;

  // Iframe URL a csatorna és játékos adataival
  const casinoUrl = channelId
    ? `/casino/?channelId=${encodeURIComponent(channelId)}&name=${encodeURIComponent(
        currentUser?.username || 'Játékos'
      )}&autoJoin=true`
    : '/casino/';

  const toggleFullScreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current
        .requestFullscreen?.()
        .then(() => setIsFullScreen(true))
        .catch(() => {});
    } else {
      document
        .exitFullscreen?.()
        .then(() => setIsFullScreen(false))
        .catch(() => {});
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const handleRefresh = () => {
    setIframeKey((prev) => prev + 1);
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 flex flex-col bg-[#090A18] overflow-hidden select-none border-t border-[#7655F5]/15"
    >
      {/* Kaszinó Fejléc */}
      <div className="min-h-[48px] bg-[#101329] border-b border-[#7655F5]/15 px-4 flex items-center justify-between shadow-md flex-shrink-0 z-10 gap-3">
        <div className="flex items-center gap-2.5 truncate">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#F5B041] to-[#d4922a] flex items-center justify-center text-white shadow-md shadow-[#F5B041]/20 flex-shrink-0">
            <span className="text-base">🎰</span>
          </div>
          <div className="truncate">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-[#F5B041] text-sm tracking-wide">
                VELVET ROOM 3D KASZINÓ
              </span>
              {isSessionActive && (
                <span className="text-[10px] bg-[#E94B64]/20 text-[#E94B64] border border-[#E94B64]/30 px-2 py-0.2 rounded-full font-bold uppercase tracking-wider animate-pulse flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#E94B64] inline-block"></span>
                  ÉLŐ CSATORNA SESSION
                </span>
              )}
            </div>
            {isSessionActive && session.startedBy && (
              <div className="text-[11px] text-[#F5B041]/60 truncate">
                Indította: <strong className="text-[#F5B041]">{session.startedBy}</strong> • Szoba: {channelName || channelId}
              </div>
            )}
          </div>
        </div>

        {/* Műveletek */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isSessionActive && (
            <>
              <button
                onClick={handleRefresh}
                title="Kaszinó újratöltése"
                className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg bg-[#1B2040] hover:bg-[#242b50] text-[#F5B041] transition border border-[#7655F5]/20"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={toggleFullScreen}
                title={isFullScreen ? 'Kilépés a teljes képernyőből' : 'Teljes képernyő'}
                className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg bg-[#1B2040] hover:bg-[#242b50] text-[#F5B041] transition border border-[#7655F5]/20"
              >
                {isFullScreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>

              <button
                onClick={onStopSession}
                title="Kaszinó session bezárása mindenki számára"
                className="flex items-center gap-1 px-2.5 py-2 min-h-[40px] rounded-lg bg-[#E94B64]/15 hover:bg-[#E94B64]/25 border border-[#E94B64]/30 text-[#E94B64] text-xs font-semibold transition"
              >
                <PowerOff className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Session leállítása</span>
              </button>
            </>
          )}

          <button
            onClick={onClose}
            title="Kilépés a kaszinó nézetből (vissza a hangszobába)"
            className="flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg bg-[#1B2040] hover:bg-[#242b50] text-[#F4F3FF] text-xs font-semibold transition border border-[#7655F5]/20"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Vissza a szobába</span>
          </button>
        </div>
      </div>

      {/* Tartalom: Ha nincs aktív session, 1-kattintásos indító képernyő, egyébként az Iframe */}
      {!isSessionActive ? (
        <div className="flex-1 min-h-0 flex flex-col items-center [justify-content:safe_center] p-6 text-center relative bg-[#090A18] overflow-y-auto">
          {/* Háttér díszítés */}
          <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#d8a851_1px,transparent_1px)] [background-size:24px_24px]"></div>

          <div className="relative z-10 max-w-lg flex flex-col items-center gap-5 p-8 rounded-2xl bg-[#151832]/95 border border-[#F5B041]/30 shadow-2xl backdrop-blur-xl">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#F5B041] to-[#d4922a] flex items-center justify-center text-4xl shadow-xl shadow-[#F5B041]/30 border border-[#F5B041]/40 animate-bounce">
              🎰
            </div>

            <div>
              <h2 className="text-2xl font-black text-[#F5B041] tracking-wider">
                VELVET ROOM CASINO
              </h2>
              <p className="text-[#F5B041]/70 text-xs mt-1">
                3D Többjátékos Hangcsatorna Kaszinó Élmény
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full my-1 text-left text-xs">
              <div className="bg-[#1B2040] p-3 rounded-xl border border-[#F5B041]/20 flex flex-col gap-1">
                <span className="text-xl">🍒</span>
                <strong className="text-[#F5B041] font-bold">Félkarú Rabló</strong>
                <span className="text-[11px] text-[#F5B041]/60 leading-tight">
                  Klasszikus 3-tárcsás slots ingyenes pörgetésekkel
                </span>
              </div>
              <div className="bg-[#1B2040] p-3 rounded-xl border border-[#F5B041]/20 flex flex-col gap-1">
                <span className="text-xl">🃏</span>
                <strong className="text-[#F5B041] font-bold">21-es Blackjack</strong>
                <span className="text-[11px] text-[#F5B041]/60 leading-tight">
                  Többjátékos zöld posztós asztal a dealer ellen
                </span>
              </div>
              <div className="bg-[#1B2040] p-3 rounded-xl border border-[#F5B041]/20 flex flex-col gap-1">
                <span className="text-xl">💎</span>
                <strong className="text-[#F5B041] font-bold">Videópóker</strong>
                <span className="text-[11px] text-[#F5B041]/60 leading-tight">
                  Jacks or Better gép akár 250x-es nyereménnyel
                </span>
              </div>
            </div>

            <div className="text-xs text-[#F5B041]/80 bg-[#F5B041]/10 px-4 py-2.5 rounded-lg border border-[#F5B041]/20 w-full flex items-center justify-center gap-2">
              <Users className="w-4 h-4 text-[#F5B041] flex-shrink-0" />
              <span>
                Ebben a csatornában bárki elindíthatja, és a bent lévők valós időben együtt sétálhatnak a 3D teremben!
              </span>
            </div>

            <button
              onClick={onStartSession}
              className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-[#F5B041] to-[#d4922a] hover:brightness-110 text-[#090A18] font-extrabold text-sm tracking-wide shadow-lg shadow-[#F5B041]/30 transform active:scale-[0.99] transition duration-150 flex items-center justify-center gap-2 border border-[#F5B041]/50"
            >
              <Sparkles className="w-5 h-5 text-[#090A18]" />
              <span>3D KASZINÓ INDÍTÁSA (1 KATTINTÁS)</span>
            </button>
          </div>
        </div>
      ) : (
        /* 3D Kaszinó Iframe és alsó vezérlő tippek */
        <div className="flex-1 flex flex-col min-h-0 relative">
          <iframe
            key={iframeKey}
            ref={iframeRef}
            src={casinoUrl}
            title="Velvet Room 3D Kaszinó"
            className="flex-1 w-full h-full border-0 bg-black"
            allow="fullscreen; pointer-lock; autoplay"
          />

          {/* Alsó navigációs sáv / Tippek */}
          <div className="min-h-[32px] bg-[#101329] border-t border-[#7655F5]/15 px-4 flex items-center justify-between text-[11px] text-[#F5B041]/70 select-none">
            <div className="flex items-center gap-3 truncate">
              <span className="flex items-center gap-1 font-semibold text-[#F5B041]">
                <Gamepad2 className="w-3.5 h-3.5" /> Irányítás:
              </span>
              <span className="truncate">
                Kattints a 3D nézetbe • <b>W, A, S, D</b>: Mozgás • <b>Egér</b>: Kamera • <b>E</b>: Játékgép aktiválása • <b>ESC</b>: Kurzormozgatás
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 text-[10px] text-[#F5B041]/50">
              <span>Velvet Room 3D Three.js</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
