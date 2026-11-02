import React, { useState, useEffect, useRef } from 'react';
import {
  Film,
  Play,
  Pause,
  RotateCcw,
  Maximize2,
  Minimize2,
  LogOut,
  PowerOff,
  Link,
  Sparkles,
  Users,
  Compass,
  Tv,
  Check,
  Send,
  Timer,
  Clock,
  Radio,
  ExternalLink
} from 'lucide-react';

export function extractYouTubeId(urlOrId) {
  if (!urlOrId) return '';
  const str = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) {
    return str;
  }
  const regExp =
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/live\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/i;
  const match = str.match(regExp);
  return match ? match[1] : '';
}

export default function WatchPartyView({
  channelId,
  channelName,
  currentUser,
  socket,
  watchState,
  onClose
}) {
  const containerRef = useRef(null);
  const playerContainerRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const isRemoteSyncRef = useRef(false);
  const videoElementRef = useRef(null);

  // Helyi input állapotok
  const [inputUrl, setInputUrl] = useState('');
  const [selectedService, setSelectedService] = useState('youtube'); // 'youtube' | 'cinehd' | 'custom'
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [reactions, setReactions] = useState([]);
  const [countdownNumber, setCountdownNumber] = useState(null);
  const [countdownSender, setCountdownSender] = useState('');
  const [timecodeNotice, setTimecodeNotice] = useState(null);
  const [timecodeInput, setTimecodeInput] = useState('');
  const [cinehdPageUrl, setCinehdPageUrl] = useState('https://cinehd.vc/');
  const [iframeKey, setIframeKey] = useState(0);

  const isSessionActive = watchState && watchState.active;

  // 1. YouTube IFrame API betöltése dinamikusan
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }
  }, []);

  // 2. YouTube lejátszó inicializálása vagy videó váltás
  useEffect(() => {
    if (!isSessionActive || watchState.service !== 'youtube' || !watchState.videoId) {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy?.();
        } catch (e) {}
        ytPlayerRef.current = null;
      }
      return;
    }

    const videoId = watchState.videoId;

    const initPlayer = () => {
      if (!window.YT || !window.YT.Player) {
        setTimeout(initPlayer, 200);
        return;
      }

      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.loadVideoById(videoId, watchState.currentTime || 0);
          if (watchState.isPlaying) {
            ytPlayerRef.current.playVideo();
          } else {
            ytPlayerRef.current.pauseVideo();
          }
          return;
        } catch (e) {
          console.warn('YT loadVideoById error, recreating:', e);
        }
      }

      const playerElement = document.getElementById('youtube-player-iframe');
      if (!playerElement) return;

      ytPlayerRef.current = new window.YT.Player('youtube-player-iframe', {
        videoId: videoId,
        playerVars: {
          autoplay: watchState.isPlaying ? 1 : 0,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          enablejsapi: 1,
          origin: window.location.origin
        },
        events: {
          onReady: (event) => {
            if (watchState.currentTime) {
              event.target.seekTo(watchState.currentTime, true);
            }
            if (watchState.isPlaying) {
              event.target.playVideo();
            }
          },
          onStateChange: (event) => {
            if (isRemoteSyncRef.current) return;

            // 1: PLAYING, 2: PAUSED
            if (event.data === window.YT.PlayerState.PLAYING) {
              const curTime = ytPlayerRef.current?.getCurrentTime() || 0;
              socket?.emit('watch:playback-control', {
                channelId,
                action: 'play',
                currentTime: curTime
              });
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              const curTime = ytPlayerRef.current?.getCurrentTime() || 0;
              socket?.emit('watch:playback-control', {
                channelId,
                action: 'pause',
                currentTime: curTime
              });
            }
          }
        }
      });
    };

    initPlayer();

    return () => {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy?.();
        } catch (e) {}
        ytPlayerRef.current = null;
      }
    };
  }, [isSessionActive, watchState?.service, watchState?.videoId]);

  // 3. Socket szinkron események figyelése
  useEffect(() => {
    if (!socket) return;

    // Lejátszás vezérlés szinkron (Play / Pause / Seek)
    const handleSyncEvent = ({ action, currentTime, triggeredBy }) => {
      isRemoteSyncRef.current = true;

      if (watchState?.service === 'youtube' && ytPlayerRef.current) {
        try {
          if (typeof currentTime === 'number') {
            ytPlayerRef.current.seekTo(currentTime, true);
          }
          if (action === 'play') {
            ytPlayerRef.current.playVideo();
          } else if (action === 'pause') {
            ytPlayerRef.current.pauseVideo();
          }
        } catch (e) {
          console.warn('Sync YouTube error:', e);
        }
      } else if (watchState?.service === 'custom' && videoElementRef.current) {
        const vid = videoElementRef.current;
        if (typeof currentTime === 'number') {
          vid.currentTime = currentTime;
        }
        if (action === 'play') vid.play().catch(() => {});
        else if (action === 'pause') vid.pause();
      }

      setTimeout(() => {
        isRemoteSyncRef.current = false;
      }, 700);
    };

    // Visszaszámláló szinkron (3... 2... 1... Indítás!)
    const handleCountdownStart = ({ timestamp, triggeredBy }) => {
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
        left: Math.random() * 70 + 15 // 15% - 85% között
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
  }, [socket, watchState?.service]);

  // 4. Média indítása / módosítása
  const handleStartMedia = (overrideUrl, overrideService, overrideTitle) => {
    const rawUrl = (overrideUrl || inputUrl).trim();
    if (!rawUrl) return;

    let service = overrideService || selectedService;
    let videoId = '';
    let title = overrideTitle || '';

    // Automatikus felismerés ha YouTube linket illesztettek be
    const ytId = extractYouTubeId(rawUrl);
    if (ytId) {
      service = 'youtube';
      videoId = ytId;
      title = title || 'YouTube Videó';
    } else if (rawUrl.includes('cinehd') || service === 'cinehd') {
      service = 'cinehd';
      title = title || 'CineHD Mozi';
    } else {
      service = 'custom';
      title = title || 'Egyedi Videó / Stream';
    }

    socket?.emit('watch:update-media', {
      channelId,
      service,
      url: rawUrl,
      videoId,
      title
    });

    setInputUrl('');
  };

  // 5. CineHD oldal megosztása a többiekkel
  const handleShareCinehdUrl = (urlToShare) => {
    const target = urlToShare || cinehdPageUrl;
    socket?.emit('watch:update-media', {
      channelId,
      service: 'cinehd',
      url: target,
      title: 'CineHD Film'
    });
  };

  // 6. Szinkron visszaszámláló kérése
  const handleTriggerCountdown = () => {
    socket?.emit('watch:countdown', { channelId });
  };

  // 7. Reakció küldése
  const handleSendReaction = (emoji) => {
    socket?.emit('watch:reaction', { channelId, emoji });
  };

  // 8. Session leállítása
  const handleStopSession = () => {
    if (window.confirm('Biztosan leállítod a közös mozizást ebben a szobában?')) {
      socket?.emit('watch:stop', { channelId });
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

  // CineHD proxy URL
  const cinehdProxyUrl = `/api/proxy/cinehd?url=${encodeURIComponent(
    watchState?.url || cinehdPageUrl || 'https://cinehd.vc/'
  )}`;

  return (
    <div
      ref={containerRef}
      className="flex-1 flex flex-col bg-[#0b0813] overflow-hidden select-none border-t border-discord-dark relative"
    >
      {/* 1. FEJLÉC SÁV */}
      <div className="h-13 bg-[#130d22] border-b border-[#2b1b48] px-4 flex items-center justify-between shadow-md flex-shrink-0 z-20 gap-3">
        <div className="flex items-center gap-2.5 truncate">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-rose-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-rose-500/20 flex-shrink-0">
            <Film className="w-4 h-4" />
          </div>
          <div className="truncate">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-rose-300 via-pink-200 to-indigo-200 text-sm tracking-wide">
                WATCH TOGETHER — KÖZÖS MOZI
              </span>
              {isSessionActive && (
                <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2 py-0.2 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block"></span>
                  {watchState.service === 'youtube'
                    ? '🔴 YOUTUBE ÉLŐ'
                    : watchState.service === 'cinehd'
                    ? '🍿 CINEHD MOZI'
                    : '🌐 EGYEDI STREAM'}
                </span>
              )}
            </div>
            {isSessionActive && (
              <div className="text-[11px] text-discord-textMuted truncate">
                Műsor: <strong className="text-rose-200">{watchState.title || watchState.url}</strong> • Indította: {watchState.startedBy || 'Valaki'}
              </div>
            )}
          </div>
        </div>

        {/* Gyors Média Indító sáv a fejlécben */}
        <div className="hidden lg:flex items-center gap-2 flex-1 max-w-xl mx-4">
          <div className="flex-1 flex items-center bg-[#1c1333] border border-[#3d2763] rounded-lg px-2.5 py-1 focus-within:border-rose-400 transition">
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStartMedia()}
              placeholder="Másolj be YouTube linket vagy CineHD / videó linket..."
              className="bg-transparent text-xs text-white placeholder-gray-400 focus:outline-none flex-1 truncate"
            />
            {inputUrl && (
              <button
                onClick={() => setInputUrl('')}
                className="text-gray-400 hover:text-white text-xs px-1"
              >
                ×
              </button>
            )}
          </div>
          <button
            onClick={() => handleStartMedia()}
            className="px-3 py-1.5 bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white rounded-lg text-xs font-bold shadow transition flex items-center gap-1.5 flex-shrink-0"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Lejátszás</span>
          </button>
        </div>

        {/* Fejléc Művelet Gombok */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isSessionActive && (
            <>
              {/* 3-2-1 Szinkron Visszaszámláló gomb */}
              <button
                onClick={handleTriggerCountdown}
                title="Közös lejátszás szinkronizálása (3-2-1 visszaszámlálás mindenkinek)"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold transition"
              >
                <Timer className="w-3.5 h-3.5 animate-pulse" />
                <span className="hidden sm:inline">3-2-1 Szinkron</span>
              </button>

              <button
                onClick={toggleFullScreen}
                title={isFullScreen ? 'Kilépés a teljes képernyőből' : 'Teljes képernyő'}
                className="p-1.5 rounded bg-[#1e1431] hover:bg-[#2c1d47] text-rose-200 hover:text-white transition border border-[#3b2361]"
              >
                {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>

              <button
                onClick={handleStopSession}
                title="Mozi session leállítása mindenki számára"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-red-950/70 hover:bg-red-900 border border-red-800/60 text-red-300 text-xs font-semibold transition"
              >
                <PowerOff className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Leállítás</span>
              </button>
            </>
          )}

          <button
            onClick={onClose}
            title="Vissza a szobába (Hang és videó a háttérben megmarad)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#23173d] hover:bg-[#312053] text-gray-200 hover:text-white text-xs font-semibold transition border border-[#3f276b]"
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
            <span className="text-xs font-bold uppercase tracking-widest text-amber-300 bg-amber-500/20 px-3 py-1 rounded-full border border-amber-500/30">
              ⏱️ {countdownSender} szinkron visszaszámlálást indított
            </span>
            <div className="text-8xl sm:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-tr from-amber-400 via-rose-400 to-indigo-300 animate-bounce">
              {countdownNumber === 0 ? '▶️ INDÍTÁS!' : countdownNumber}
            </div>
            <span className="text-xs text-gray-300">
              {countdownNumber === 0 ? 'Kattints a lejátszásra most!' : 'Készülj fel a lejátszásra...'}
            </span>
          </div>
        </div>
      )}

      {/* 3. LEBEGŐ REAKCIÓK ZÁPORA (POP-UP EMOJIK) */}
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
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center relative overflow-y-auto bg-radial from-[#1e1035] via-[#10081d] to-[#07040d]">
          <div className="max-w-xl w-full flex flex-col items-center gap-6 p-8 rounded-3xl bg-[#140b25]/90 border border-rose-500/20 shadow-2xl backdrop-blur-2xl">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-rose-500 via-pink-500 to-indigo-600 flex items-center justify-center text-4xl shadow-xl shadow-rose-500/30 border border-white/20 animate-pulse">
              🍿
            </div>

            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-rose-200 via-pink-100 to-indigo-200 tracking-wide">
                KÖZÖS MOZIZÁS (WATCH TOGETHER)
              </h2>
              <p className="text-rose-100/70 text-xs sm:text-sm mt-1 max-w-md">
                Nézzetek filmeket a <b>CineHD</b>-n vagy videókat a <b>YouTube</b>-on szinkronban a hangcsatorna tagjaival!
              </p>
            </div>

            {/* Szolgáltatás választó fülek */}
            <div className="flex items-center gap-2 p-1 bg-[#1d1235] rounded-xl border border-[#3b2361] w-full max-w-md">
              <button
                onClick={() => setSelectedService('youtube')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                  selectedService === 'youtube'
                    ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>🔴</span>
                <span>YouTube</span>
              </button>
              <button
                onClick={() => setSelectedService('cinehd')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                  selectedService === 'cinehd'
                    ? 'bg-gradient-to-r from-amber-600 to-rose-600 text-white shadow-lg'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>🍿</span>
                <span>CineHD.app</span>
              </button>
              <button
                onClick={() => setSelectedService('custom')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                  selectedService === 'custom'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>🌐</span>
                <span>Egyedi Stream</span>
              </button>
            </div>

            {/* URL Beviteli Mező */}
            <div className="w-full space-y-2">
              <div className="flex items-center bg-[#1a0f2e] border-2 border-rose-500/30 focus-within:border-rose-400 rounded-xl px-3 py-2.5 transition">
                <Link className="w-4 h-4 text-rose-300 mr-2 flex-shrink-0" />
                <input
                  type="text"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleStartMedia()}
                  placeholder={
                    selectedService === 'youtube'
                      ? 'Illeszd be a YouTube videó linkjét vagy ID-ját...'
                      : selectedService === 'cinehd'
                      ? 'Illeszd be a CineHD film vagy sorozat linkjét...'
                      : 'Illessz be közvetlen .mp4 videó vagy stream linket...'
                  }
                  className="bg-transparent text-sm text-white placeholder-gray-400 focus:outline-none flex-1"
                />
              </div>

              <button
                onClick={() => handleStartMedia()}
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-rose-600 via-pink-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white font-extrabold text-sm tracking-wide shadow-xl shadow-rose-600/30 transform active:scale-[0.99] transition flex items-center justify-center gap-2 border border-white/20"
              >
                <Sparkles className="w-4 h-4" />
                <span>KÖZÖS LEJÁTSZÁS INDÍTÁSA (1 KATTINTÁS)</span>
              </button>
            </div>

            {/* Ajánlott Gyorsindítók */}
            <div className="w-full space-y-2 pt-2 border-t border-white/10 text-left">
              <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Gyors Média Ajánlatok:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {selectedService === 'youtube' ? (
                  <>
                    <button
                      onClick={() =>
                        handleStartMedia('https://www.youtube.com/watch?v=jfKfPfyJRdk', 'youtube', 'Lofi Girl 24/7 Relax')
                      }
                      className="p-2.5 rounded-xl bg-[#1d1235] hover:bg-[#2a1a4c] border border-white/5 flex items-center gap-2 text-left transition"
                    >
                      <span className="text-xl">🎧</span>
                      <div className="truncate">
                        <strong className="text-white block truncate">Lofi Hip Hop Radio</strong>
                        <span className="text-[10px] text-gray-400">24/7 Relax & Study Beats</span>
                      </div>
                    </button>
                    <button
                      onClick={() =>
                        handleStartMedia('https://www.youtube.com/watch?v=aqz-KE-bpKQ', 'youtube', 'Big Buck Bunny 4K')
                      }
                      className="p-2.5 rounded-xl bg-[#1d1235] hover:bg-[#2a1a4c] border border-white/5 flex items-center gap-2 text-left transition"
                    >
                      <span className="text-xl">🐰</span>
                      <div className="truncate">
                        <strong className="text-white block truncate">Big Buck Bunny (4K)</strong>
                        <span className="text-[10px] text-gray-400">Klasszikus animációs tesztfilm</span>
                      </div>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() =>
                        handleStartMedia('https://cinehd.vc/', 'cinehd', 'CineHD Főoldal')
                      }
                      className="p-2.5 rounded-xl bg-[#1d1235] hover:bg-[#2a1a4c] border border-white/5 flex items-center gap-2 text-left transition"
                    >
                      <span className="text-xl">🍿</span>
                      <div className="truncate">
                        <strong className="text-white block truncate">CineHD Főoldal</strong>
                        <span className="text-[10px] text-gray-400">Böngésszetek és válasszatok együtt filmet</span>
                      </div>
                    </button>
                    <button
                      onClick={() =>
                        handleStartMedia('https://cinehd.vc/filmek', 'cinehd', 'CineHD Filmek')
                      }
                      className="p-2.5 rounded-xl bg-[#1d1235] hover:bg-[#2a1a4c] border border-white/5 flex items-center gap-2 text-left transition"
                    >
                      <span className="text-xl">🎬</span>
                      <div className="truncate">
                        <strong className="text-white block truncate">CineHD Legújabb Filmek</strong>
                        <span className="text-[10px] text-gray-400">Népszerű szinkronos filmek</span>
                      </div>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* AKTÍV KÖZÖS LEJÁTSZÓ NÉZET */
        <div className="flex-1 flex flex-col min-h-0 relative bg-black">
          {/* A: YOUTUBE NÉZET */}
          {watchState.service === 'youtube' && (
            <div className="flex-1 w-full h-full flex items-center justify-center bg-black relative">
              <div
                id="youtube-player-iframe"
                className="w-full h-full max-h-full"
              ></div>
            </div>
          )}

          {/* B: CINEHD NÉZET (Beágyazott Proxy Iframe) */}
          {watchState.service === 'cinehd' && (
            <div className="flex-1 w-full h-full flex flex-col min-h-0 bg-black">
              {/* CineHD Navigációs Fejléc */}
              <div className="h-10 bg-[#160e29] border-b border-[#2d1b4d] px-3 flex items-center justify-between gap-3 text-xs flex-shrink-0 z-10">
                <div className="flex items-center gap-2 flex-1 max-w-md truncate">
                  <span className="text-amber-400 font-bold flex items-center gap-1 flex-shrink-0">
                    🍿 CineHD Link:
                  </span>
                  <input
                    type="text"
                    value={cinehdPageUrl}
                    onChange={(e) => setCinehdPageUrl(e.target.value)}
                    placeholder="https://cinehd.vc/film/..."
                    className="bg-[#24173e] text-white text-[11px] px-2 py-1 rounded border border-[#3f276b] flex-1 focus:outline-none truncate"
                  />
                  <button
                    onClick={() => handleShareCinehdUrl()}
                    title="Ugorjon ide a szoba minden tagja erre a filmre!"
                    className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] transition flex-shrink-0 flex items-center gap-1"
                  >
                    <Send className="w-3 h-3" />
                    <span>Megosztás</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-gray-300 flex-shrink-0">
                  <button
                    onClick={() => setIframeKey((k) => k + 1)}
                    title="CineHD újratöltése"
                    className="p-1 rounded hover:bg-white/10 text-gray-300 hover:text-white"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <a
                    href={watchState.url || 'https://cinehd.vc/'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-rose-300 hover:underline px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20"
                  >
                    <span>Megnyitás külön lapon</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* Iframe */}
              <iframe
                key={iframeKey}
                src={cinehdProxyUrl}
                title="CineHD Mozi"
                className="flex-1 w-full h-full border-0 bg-black"
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}

          {/* C: EGYEDI VIDEÓ STREAM NÉZET (HTML5 Video) */}
          {watchState.service === 'custom' && (
            <div className="flex-1 w-full h-full flex items-center justify-center bg-black relative">
              <video
                ref={videoElementRef}
                src={watchState.url}
                controls
                className="max-w-full max-h-full"
                onPlay={() => {
                  if (isRemoteSyncRef.current) return;
                  socket?.emit('watch:playback-control', {
                    channelId,
                    action: 'play',
                    currentTime: videoElementRef.current?.currentTime || 0
                  });
                }}
                onPause={() => {
                  if (isRemoteSyncRef.current) return;
                  socket?.emit('watch:playback-control', {
                    channelId,
                    action: 'pause',
                    currentTime: videoElementRef.current?.currentTime || 0
                  });
                }}
                onSeeked={() => {
                  if (isRemoteSyncRef.current) return;
                  socket?.emit('watch:playback-control', {
                    channelId,
                    action: 'seek',
                    currentTime: videoElementRef.current?.currentTime || 0
                  });
                }}
              />
            </div>
          )}

          {/* 5. ALSÓ VEZÉRLŐ ÉS REAKCIÓ SÁV */}
          <div className="h-10 bg-[#0d0717] border-t border-[#23153c] px-4 flex items-center justify-between text-xs text-gray-300 z-10 flex-shrink-0">
            {/* Szinkron állapot */}
            <div className="flex items-center gap-2 truncate">
              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                <span>Szinkronban ({channelName || 'Szoba'})</span>
              </span>
              <span className="text-gray-500">•</span>
              <span className="text-gray-400 text-[11px] truncate">
                {watchState.service === 'youtube'
                  ? 'A Play / Pause / Seek parancsok automatikusan szinkronizálódnak mindenkinek'
                  : 'CineHD: Használd a 3-2-1 visszaszámlálót a film indításához!'}
              </span>
            </div>

            {/* Lebegő reakció gombok (🍿 Popcorn, 🔥 Tűz, stb.) */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-[11px] text-gray-400 hidden sm:inline mr-1">Reakciók:</span>
              {['🍿', '🔥', '😂', '❤️', '😱', '👏'].map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleSendReaction(emoji)}
                  className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/20 active:scale-125 transition flex items-center justify-center text-sm"
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
