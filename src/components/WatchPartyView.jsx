import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  RotateCcw,
  Maximize2,
  Minimize2,
  LogOut,
  PowerOff,
  Link,
  Sparkles,
  Timer,
  Radio
} from 'lucide-react';
import { extractYouTubeId, getLiveTime } from '../utils/youtube';

export { extractYouTubeId };

export default function WatchPartyView({
  channelId,
  channelName,
  currentUser,
  socket,
  watchState,
  onClose
}) {
  const containerRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const playerHostRef = useRef(null);
  const isRemoteSyncRef = useRef(false);
  const syncTimerRef = useRef(null);
  const watchStateRef = useRef(watchState);
  watchStateRef.current = watchState;

  // Helyi input állapotok
  const [inputUrl, setInputUrl] = useState('');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [reactions, setReactions] = useState([]);
  const [countdownNumber, setCountdownNumber] = useState(null);
  const [countdownSender, setCountdownSender] = useState('');

  const isSessionActive = watchState && watchState.active && watchState.videoId;

  // 1. YouTube IFrame API betöltése dinamikusan
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }
  }, []);

  // A távoli szinkron idejére letiltjuk a kimenő eseményeket, hogy ne vezessünk vissza visszhangot
  const suppressEmit = (ms) => {
    isRemoteSyncRef.current = true;
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      isRemoteSyncRef.current = false;
    }, ms);
  };

  // Belépéskor / visszatéréskor friss állapotot kérünk a szervertől
  useEffect(() => {
    socket?.emit('watch:get-state', { channelId });
  }, [socket, channelId]);

  // 2. YouTube lejátszó létrehozása (videóváltáskor új példány, az ÉLŐ időkódtól indulva)
  useEffect(() => {
    const host = playerHostRef.current;
    if (!isSessionActive || !host) return;

    const videoId = watchState.videoId;
    let cancelled = false;
    let retryTimer = null;

    // Minden lejátszópéldánynak saját elem kell, mert a destroy() eltávolítja a céldiv-et
    const mount = document.createElement('div');
    mount.style.width = '100%';
    mount.style.height = '100%';
    host.appendChild(mount);

    const initPlayer = () => {
      if (cancelled) return;
      if (!window.YT || !window.YT.Player) {
        retryTimer = setTimeout(initPlayer, 150);
        return;
      }

      const startAt = Math.floor(getLiveTime(watchStateRef.current));
      // A kezdeti seek/play ne menjen ki a szobának, különben mindenkit visszaugrasztana
      suppressEmit(4000);

      ytPlayerRef.current = new window.YT.Player(mount, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: watchStateRef.current?.isPlaying ? 1 : 0,
          start: startAt,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          enablejsapi: 1,
          origin: window.location.origin
        },
        events: {
          onReady: (event) => {
            if (cancelled) return;
            const live = getLiveTime(watchStateRef.current);
            suppressEmit(1500);
            event.target.seekTo(live, true);
            if (watchStateRef.current?.isPlaying) event.target.playVideo();
            else event.target.pauseVideo();
          },
          onStateChange: (event) => {
            if (isRemoteSyncRef.current || cancelled) return;
            const player = ytPlayerRef.current;
            if (!player?.getCurrentTime) return;
            // 1: PLAYING, 2: PAUSED
            if (event.data === window.YT.PlayerState.PLAYING) {
              socket?.emit('watch:playback-control', {
                channelId,
                action: 'play',
                currentTime: player.getCurrentTime()
              });
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              socket?.emit('watch:playback-control', {
                channelId,
                action: 'pause',
                currentTime: player.getCurrentTime()
              });
            }
          }
        }
      });
    };

    initPlayer();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      clearTimeout(syncTimerRef.current);
      isRemoteSyncRef.current = false;
      try {
        ytPlayerRef.current?.destroy?.();
      } catch (e) {}
      ytPlayerRef.current = null;
      mount.remove();
    };
  }, [isSessionActive, watchState?.videoId, socket, channelId]);

  // 3. Socket szinkron események figyelése
  useEffect(() => {
    if (!socket) return;

    // Lejátszás vezérlés szinkron (Play / Pause / Seek)
    const handleSyncEvent = ({ action, currentTime }) => {
      const player = ytPlayerRef.current;
      if (!player?.seekTo) return;
      suppressEmit(900);
      try {
        if (typeof currentTime === 'number') {
          // Csak akkor ugrunk, ha érdemben eltér, így nincs felesleges megakadás
          const diff = Math.abs((player.getCurrentTime?.() || 0) - currentTime);
          if (diff > 0.75) player.seekTo(currentTime, true);
        }
        if (action === 'play') player.playVideo();
        else if (action === 'pause') player.pauseVideo();
      } catch (e) {
        console.warn('Sync YouTube error:', e);
      }
    };

    // Visszaszámláló szinkron (3... 2... 1... Indítás!)
    const handleCountdownStart = ({ triggeredBy }) => {
      setCountdownSender(triggeredBy);
      setCountdownNumber(3);

      const interval = setInterval(() => {
        setCountdownNumber((prev) => {
          if (prev === null) return null;
          if (prev <= 1) {
            clearInterval(interval);
            setTimeout(() => setCountdownNumber(null), 1200);
            return 0; // "INDÍTÁS!"
          }
          return prev - 1;
        });
      }, 1000);
    };

    // Lebegő reakciók (🍿 Popcorn, 🔥 Tűz, stb.)
    const handleReactionReceived = ({ emoji, username, id }) => {
      const newReaction = {
        id,
        emoji,
        username,
        left: Math.random() * 70 + 15
      };
      setReactions((prev) => [...prev.slice(-15), newReaction]);

      setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== id));
      }, 2500);
    };

    socket.on('watch:sync-event', handleSyncEvent);
    socket.on('watch:countdown-start', handleCountdownStart);
    socket.on('watch:reaction-received', handleReactionReceived);

    return () => {
      socket.off('watch:sync-event', handleSyncEvent);
      socket.off('watch:countdown-start', handleCountdownStart);
      socket.off('watch:reaction-received', handleReactionReceived);
    };
  }, [socket]);

  // 4. Média indítása / módosítása
  const handleStartMedia = (overrideUrl, overrideTitle) => {
    const rawUrl = (overrideUrl || inputUrl).trim();
    if (!rawUrl) return;

    const ytId = extractYouTubeId(rawUrl);
    if (!ytId) {
      alert('Kérlek érvényes YouTube videó linket vagy ID-t adj meg!');
      return;
    }

    const title = overrideTitle || 'YouTube Videó';

    socket?.emit('watch:update-media', {
      channelId,
      service: 'youtube',
      url: rawUrl,
      videoId: ytId,
      title
    });

    setInputUrl('');
  };

  // 5. Szinkron visszaszámláló kérése
  const handleTriggerCountdown = () => {
    socket?.emit('watch:countdown', { channelId });
  };

  // 6. Reakció küldése
  const handleSendReaction = (emoji) => {
    socket?.emit('watch:reaction', { channelId, emoji });
  };

  // 7. Session leállítása
  const handleStopSession = () => {
    if (window.confirm('Biztosan leállítod a közös YouTube nézést ebben a szobában?')) {
      socket?.emit('watch:stop', { channelId });
    }
  };

  // 8. Kényszerített újraszinkronizálás
  const handleResync = () => {
    if (ytPlayerRef.current?.seekTo && watchState) {
      suppressEmit(900);
      ytPlayerRef.current.seekTo(getLiveTime(watchState), true);
    }
  };

  // Teljes képernyő kezelés
  const toggleFullScreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().then(() => setIsFullScreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullScreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullScreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex-1 flex flex-col bg-[#090A18] overflow-hidden select-none border-t border-[#7655F5]/15 relative"
    >
      {/* 1. FEJLÉC SÁV */}
      <div className="h-13 bg-[#101329] border-b border-[#7655F5]/15 px-4 flex items-center justify-between shadow-md flex-shrink-0 z-20 gap-3">
        <div className="flex items-center gap-2.5 truncate">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#E94B64] to-[#c93a52] flex items-center justify-center text-white shadow-md shadow-[#E94B64]/20 flex-shrink-0">
            <span className="text-base">🔴</span>
          </div>
          <div className="truncate">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[#F4F3FF] to-[#999BBE] text-sm tracking-wide">
                YOUTUBE WATCH TOGETHER
              </span>
              {isSessionActive && (
                <span className="text-[10px] bg-[#E94B64]/20 text-[#E94B64] border border-[#E94B64]/40 px-2 py-0.2 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#E94B64] inline-block"></span>
                  ÉLŐ SZINKRON
                </span>
              )}
            </div>
            {isSessionActive && (
              <div className="text-[11px] text-[#999BBE] truncate">
                Videó: <strong className="text-[#F4F3FF]">{watchState.title || watchState.url}</strong> • Indította: {watchState.startedBy || 'Valaki'}
              </div>
            )}
          </div>
        </div>

        {/* Gyors YouTube link beviteli mező a fejlécben */}
        <div className="hidden lg:flex items-center gap-2 flex-1 max-w-xl mx-4">
          <div className="flex-1 flex items-center bg-[#1B2040] border border-[#7655F5]/20 rounded-lg px-2.5 py-1 focus-within:border-[#7655F5]/60 transition">
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStartMedia()}
              placeholder="Másolj be YouTube videó linket (pl. https://youtu.be/...)"
              className="bg-transparent text-xs text-[#F4F3FF] placeholder-[#999BBE] focus:outline-none flex-1 truncate"
            />
            {inputUrl && (
              <button
                onClick={() => setInputUrl('')}
                className="text-[#999BBE] hover:text-white text-xs px-1"
              >
                ×
              </button>
            )}
          </div>
          <button
            onClick={() => handleStartMedia()}
            className="px-3 py-1.5 bg-gradient-to-r from-[#E94B64] to-[#c93a52] hover:brightness-110 text-white rounded-lg text-xs font-bold shadow transition flex items-center gap-1.5 flex-shrink-0"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Betöltés</span>
          </button>
        </div>

        {/* Fejléc Művelet Gombok */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isSessionActive && (
            <>
              {/* Újraszinkronizálás gomb */}
              <button
                onClick={handleResync}
                title="Videó időkód újraszinkronizálása a szobához"
                className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg bg-[#1B2040] hover:bg-[#242b50] text-[#999BBE] hover:text-white transition border border-[#7655F5]/20"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {/* 3-2-1 Szinkron Visszaszámláló gomb */}
              <button
                onClick={handleTriggerCountdown}
                title="Közös visszaszámlálás indítása (3-2-1)"
                className="flex items-center gap-1 px-2.5 py-2 min-h-[40px] rounded-lg bg-[#F5B041]/10 hover:bg-[#F5B041]/20 text-[#F5B041] border border-[#F5B041]/30 text-xs font-semibold transition"
              >
                <Timer className="w-3.5 h-3.5 animate-pulse" />
                <span className="hidden sm:inline">3-2-1 Szinkron</span>
              </button>

              <button
                onClick={toggleFullScreen}
                title={isFullScreen ? 'Kilépés a teljes képernyőből' : 'Teljes képernyő'}
                className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg bg-[#1B2040] hover:bg-[#242b50] text-[#F4F3FF] transition border border-[#7655F5]/20"
              >
                {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>

              <button
                onClick={handleStopSession}
                title="YouTube session leállítása mindenki számára"
                className="flex items-center gap-1 px-2.5 py-2 min-h-[40px] rounded-lg bg-[#E94B64]/15 hover:bg-[#E94B64]/25 border border-[#E94B64]/30 text-[#E94B64] text-xs font-semibold transition"
              >
                <PowerOff className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Leállítás</span>
              </button>
            </>
          )}

          <button
            onClick={onClose}
            title="Vissza a szobába (Hang és videó a háttérben megmarad)"
            className="flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg bg-[#1B2040] hover:bg-[#242b50] text-[#F4F3FF] text-xs font-semibold transition border border-[#7655F5]/20"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Vissza</span>
          </button>
        </div>
      </div>

      {/* 2. LEBEGŐ SZINKRON VISSZASZÁMLÁLÓ (3... 2... 1... INDÍTÁS!) */}
      {countdownNumber !== null && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md pointer-events-none animate-in fade-in duration-200">
          <div className="flex flex-col items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-widest text-[#F5B041] bg-[#F5B041]/20 px-3 py-1 rounded-full border border-[#F5B041]/30">
              ⏱️ {countdownSender} szinkron visszaszámlálást indított
            </span>
            <div className="text-8xl sm:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-tr from-[#F5B041] to-[#E94B64] animate-bounce">
              {countdownNumber === 0 ? '▶️ INDÍTÁS!' : countdownNumber}
            </div>
            <span className="text-xs text-[#999BBE]">
              {countdownNumber === 0 ? 'Kattints a lejátszásra most!' : 'Készülj fel a lejátszásra...'}
            </span>
          </div>
        </div>
      )}

      {/* 3. LEBEGŐ REAKCIÓK ZÁPORA */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-40">
        {reactions.map((r) => (
          <div
            key={r.id}
            style={{ left: `${r.left}%` }}
            className="absolute bottom-16 flex flex-col items-center animate-reaction-rise"
          >
            <span className="text-3xl filter drop-shadow-lg">{r.emoji}</span>
            <span className="text-[10px] bg-black/70 text-white px-1.5 py-0.2 rounded font-semibold whitespace-nowrap border border-white/10">
              {r.username}
            </span>
          </div>
        ))}
      </div>

      {/* 4. TARTALOM TERÜLET */}
      {!isSessionActive ? (
        /* KEZDŐ INDÍTÓ KÉPERNYŐ */
        <div className="flex-1 min-h-0 flex flex-col items-center [justify-content:safe_center] p-6 text-center relative overflow-y-auto bg-[#090A18]">
          <div className="max-w-xl w-full flex flex-col items-center gap-6 p-8 rounded-3xl bg-[#151832]/95 border border-[#7655F5]/20 shadow-2xl backdrop-blur-2xl">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-[#E94B64] to-[#c93a52] flex items-center justify-center text-4xl shadow-xl shadow-[#E94B64]/30 border border-white/20 animate-pulse">
              🔴
            </div>

            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#F4F3FF] to-[#999BBE] tracking-wide">
                YOUTUBE WATCH TOGETHER
              </h2>
              <p className="text-[#999BBE] text-xs sm:text-sm mt-1 max-w-md">
                Nézzetek YouTube videókat és klipeket szinkronban a hangcsatorna tagjaival! Bárki indíthatja vagy megállíthatja a videót.
              </p>
            </div>

            {/* URL Beviteli Mező */}
            <div className="w-full space-y-3">
              <div className="flex items-center bg-[#1B2040] border-2 border-[#7655F5]/30 focus-within:border-[#7655F5]/60 rounded-xl px-3 py-2.5 transition">
                <Link className="w-4 h-4 text-[#E94B64] mr-2 flex-shrink-0" />
                <input
                  type="text"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleStartMedia()}
                  placeholder="Illeszd be a YouTube videó linkjét (pl. https://www.youtube.com/watch?v=...)"
                  className="bg-transparent text-sm text-[#F4F3FF] placeholder-[#999BBE] focus:outline-none flex-1"
                />
              </div>

              <button
                onClick={() => handleStartMedia()}
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-[#E94B64] to-[#c93a52] hover:brightness-110 text-white font-extrabold text-sm tracking-wide shadow-xl shadow-[#E94B64]/30 transform active:scale-[0.99] transition flex items-center justify-center gap-2 border border-white/20"
              >
                <Sparkles className="w-4 h-4" />
                <span>KÖZÖS LEJÁTSZÁS INDÍTÁSA (1 KATTINTÁS)</span>
              </button>
            </div>

            {/* Ajánlott Gyorsindítók */}
            <div className="w-full space-y-2 pt-2 border-t border-white/10 text-left">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#999BBE]">
                Népszerű YouTube Videók:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <button
                  onClick={() =>
                    handleStartMedia('https://www.youtube.com/watch?v=jfKfPfyJRdk', 'Lofi Girl 24/7 Relax')
                  }
                  className="p-2.5 rounded-xl bg-[#1B2040] hover:bg-[#242b50] border border-white/5 flex items-center gap-2 text-left transition"
                >
                  <span className="text-xl">🎧</span>
                  <div className="truncate">
                    <strong className="text-white block truncate">Lofi Hip Hop Radio</strong>
                    <span className="text-[10px] text-[#999BBE]">24/7 Relax & Study Beats</span>
                  </div>
                </button>
                <button
                  onClick={() =>
                    handleStartMedia('https://www.youtube.com/watch?v=aqz-KE-bpKQ', 'Big Buck Bunny 4K')
                  }
                  className="p-2.5 rounded-xl bg-[#1B2040] hover:bg-[#242b50] border border-white/5 flex items-center gap-2 text-left transition"
                >
                  <span className="text-xl">🐰</span>
                  <div className="truncate">
                    <strong className="text-white block truncate">Big Buck Bunny (4K)</strong>
                    <span className="text-[10px] text-[#999BBE]">Animációs rövidfilm</span>
                  </div>
                </button>
                <button
                  onClick={() =>
                    handleStartMedia('https://www.youtube.com/watch?v=4xDzrJKXOOY', 'Synthwave Radio Chill')
                  }
                  className="p-2.5 rounded-xl bg-[#1B2040] hover:bg-[#242b50] border border-white/5 flex items-center gap-2 text-left transition"
                >
                  <span className="text-xl">🌆</span>
                  <div className="truncate">
                    <strong className="text-white block truncate">Synthwave Radio</strong>
                    <span className="text-[10px] text-[#999BBE]">Cyberpunk Retro Beats</span>
                  </div>
                </button>
                <button
                  onClick={() =>
                    handleStartMedia('https://www.youtube.com/watch?v=TcMBFSGVi1c', 'Marvel Avengers Trailer')
                  }
                  className="p-2.5 rounded-xl bg-[#1B2040] hover:bg-[#242b50] border border-white/5 flex items-center gap-2 text-left transition"
                >
                  <span className="text-xl">🎬</span>
                  <div className="truncate">
                    <strong className="text-white block truncate">Avengers: Endgame Trailer</strong>
                    <span className="text-[10px] text-[#999BBE]">Hivatalos filmelőzetes</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* AKTÍV YOUTUBE LEJÁTSZÓ NÉZET */
        <div className="flex-1 flex flex-col min-h-0 relative bg-black">
          <div className="flex-1 w-full h-full flex items-center justify-center bg-black relative">
            <div ref={playerHostRef} className="w-full h-full max-h-full"></div>
          </div>

          {/* ALSÓ VEZÉRLŐ ÉS REAKCIÓ SÁV */}
          <div className="min-h-[48px] py-1 gap-2 bg-[#101329] border-t border-[#7655F5]/15 px-4 flex items-center justify-between text-xs text-[#999BBE] z-10 flex-shrink-0">
            {/* Szinkron állapot */}
            <div className="flex items-center gap-2 truncate">
              <span className="flex items-center gap-1 text-[#28C997] font-semibold">
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                <span>Szinkronban ({channelName || 'Szoba'})</span>
              </span>
              <span className="text-[#999BBE]">•</span>
              <span className="text-[#999BBE] text-[11px] truncate">
                A Play, Pause és Seek műveletek valós időben szinkronizálódnak mindenkinek!
              </span>
            </div>

            {/* Lebegő reakció gombok */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-[11px] text-[#999BBE] hidden sm:inline mr-1">Reakciók:</span>
              {['🍿', '🔥', '😂', '❤️', '😱', '👏'].map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleSendReaction(emoji)}
                  className="w-9 h-9 sm:w-8 sm:h-8 rounded-full bg-white/5 hover:bg-white/20 active:scale-125 transition flex items-center justify-center text-sm"
                  title={`Reakció küldése: ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
