import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Wifi,
  Play,
  RotateCcw,
  Share2,
  X,
  Users,
  Gauge,
  CheckCircle2,
  AlertCircle,
  Clock
} from 'lucide-react';

export default function SpeedTestModal({
  isOpen,
  onClose,
  socket,
  currentUser,
  onlineUsers = [],
  onRequestUserTest,
  onShareResultToChat
}) {
  const [activeTab, setActiveTab] = useState('test'); // 'test' | 'users'
  const [testState, setTestState] = useState('idle'); // 'idle' | 'ping' | 'download' | 'upload' | 'completed'

  const [currentSpeed, setCurrentSpeed] = useState(0); // Live speed during measurement
  const [pingResult, setPingResult] = useState(null);
  const [jitterResult, setJitterResult] = useState(null);
  const [downloadResult, setDownloadResult] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [progress, setProgress] = useState(0);

  const abortControllerRef = useRef(null);

  if (!isOpen) return null;

  // Teszt futtatása
  const runSpeedTest = async () => {
    setTestState('ping');
    setProgress(5);
    setCurrentSpeed(0);
    setPingResult(null);
    setJitterResult(null);
    setDownloadResult(null);
    setUploadResult(null);

    abortControllerRef.current = new AbortController();

    try {
      // 1. PING & JITTER MÉRÉS (Socket.io-n keresztül 6 mérés)
      const rtts = [];
      for (let i = 0; i < 6; i++) {
        const start = performance.now();
        await new Promise((resolve) => {
          socket?.emit('speedtest:ping', { clientTime: Date.now() });
          socket?.once('speedtest:pong', () => {
            const rtt = performance.now() - start;
            rtts.push(rtt);
            resolve();
          });
          // Timeout védelem
          setTimeout(resolve, 600);
        });
        setProgress(5 + i * 4);
      }

      const validRtts = rtts.length > 0 ? rtts : [25];
      const avgPing = Math.round(validRtts.reduce((a, b) => a + b, 0) / validRtts.length);

      // Jitter számítás
      let jitterSum = 0;
      for (let i = 1; i < validRtts.length; i++) {
        jitterSum += Math.abs(validRtts[i] - validRtts[i - 1]);
      }
      const avgJitter = Math.round(jitterSum / Math.max(validRtts.length - 1, 1));

      setPingResult(avgPing);
      setJitterResult(avgJitter);
      setProgress(30);

      // 2. LETÖLTÉSI SEBESSÉG MÉRÉS (Download)
      setTestState('download');
      const dlStart = performance.now();
      const mbToDownload = 4; // 4 MB

      // Időzített gauge animáció letöltés közben
      const speedInterval = setInterval(() => {
        const elapsed = (performance.now() - dlStart) / 1000;
        if (elapsed > 0) {
          // becsült előrehaladás
          const estProgress = Math.min(30 + Math.floor(elapsed * 25), 65);
          setProgress(estProgress);
        }
      }, 100);

      const dlResponse = await fetch(`/api/speedtest/download?mb=${mbToDownload}&t=${Date.now()}`, {
        signal: abortControllerRef.current.signal,
        cache: 'no-store'
      });
      const dlBuffer = await dlResponse.arrayBuffer();
      clearInterval(speedInterval);

      const dlEnd = performance.now();
      const dlDurationSeconds = (dlEnd - dlStart) / 1000;
      const dlBytes = dlBuffer.byteLength;
      const dlBps = (dlBytes * 8) / dlDurationSeconds;
      const dlMbps = Number((dlBps / (1024 * 1024)).toFixed(1));

      setDownloadResult(dlMbps);
      setCurrentSpeed(dlMbps);
      setProgress(68);

      // 3. FELTÖLTÉSI SEBESSÉG MÉRÉS (Upload)
      setTestState('upload');
      const ulStart = performance.now();
      const ulSizeMb = 2; // 2 MB upload
      const dummyData = new Uint8Array(ulSizeMb * 1024 * 1024);

      const ulInterval = setInterval(() => {
        const elapsed = (performance.now() - ulStart) / 1000;
        if (elapsed > 0) {
          const estProgress = Math.min(68 + Math.floor(elapsed * 25), 95);
          setProgress(estProgress);
        }
      }, 100);

      await fetch('/api/speedtest/upload', {
        method: 'POST',
        body: dummyData,
        signal: abortControllerRef.current.signal,
        headers: { 'Content-Type': 'application/octet-stream' }
      });
      clearInterval(ulInterval);

      const ulEnd = performance.now();
      const ulDurationSeconds = (ulEnd - ulStart) / 1000;
      const ulBytes = dummyData.byteLength;
      const ulBps = (ulBytes * 8) / ulDurationSeconds;
      const ulMbps = Number((ulBps / (1024 * 1024)).toFixed(1));

      setUploadResult(ulMbps);
      setCurrentSpeed(ulMbps);
      setProgress(100);
      setTestState('completed');

      // Eredmény mentése szerveren
      socket?.emit('speedtest:save-result', {
        ping: avgPing,
        jitter: avgJitter,
        download: dlMbps,
        upload: ulMbps
      });
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Sebességteszt hiba:', err);
      }
      setTestState('idle');
    }
  };

  const handleShare = () => {
    if (testState !== 'completed' || !downloadResult) return;
    const msg = `⚡ **Net Sebességteszt Eredményem:**\n` +
      `🏓 Ping: **${pingResult} ms** (Jitter: ${jitterResult} ms)\n` +
      `⬇️ Letöltés: **${downloadResult} Mbps**\n` +
      `⬆️ Feltöltés: **${uploadResult} Mbps**`;
    onShareResultToChat(msg);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none">
      <div className="bg-discord-darker border border-discord-dark rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Fejléc */}
        <div className="h-14 border-b border-discord-dark px-6 flex items-center justify-between bg-discord-darker flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-discord-primary/20 text-discord-primary flex items-center justify-center">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold text-discord-textHeader leading-tight">
                Net Sebességteszt (Speed Test)
              </h2>
              <p className="text-[11px] text-discord-textMuted leading-tight">
                Ping, Letöltés és Feltöltés valós idejű mérése
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-discord-hover text-discord-textMuted hover:text-white flex items-center justify-center transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Fülek (Tabs) */}
        <div className="flex border-b border-discord-dark bg-discord-darkest/50 px-6 pt-2 flex-shrink-0 gap-4">
          <button
            onClick={() => setActiveTab('test')}
            className={`pb-2.5 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition ${
              activeTab === 'test'
                ? 'border-discord-primary text-discord-primary'
                : 'border-transparent text-discord-textMuted hover:text-discord-textHeader'
            }`}
          >
            <Gauge className="w-4 h-4" />
            <span>Saját mérés</span>
          </button>

          <button
            onClick={() => setActiveTab('users')}
            className={`pb-2.5 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition ${
              activeTab === 'users'
                ? 'border-discord-primary text-discord-primary'
                : 'border-transparent text-discord-textMuted hover:text-discord-textHeader'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Felhasználók sebessége ({onlineUsers.length})</span>
          </button>
        </div>

        {/* Modal Tartalom */}
        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'test' ? (
            /* TAB 1: SAJÁT SEBESSÉGMÉRŐ */
            <div className="flex flex-col items-center">
              {/* Kör alakú sebességmérő (Speedometer Gauge) */}
              <div className="relative w-48 h-48 my-2 flex flex-col items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="96"
                    cy="96"
                    r="80"
                    stroke="#2b2d31"
                    strokeWidth="12"
                    fill="transparent"
                  />
                  <circle
                    cx="96"
                    cy="96"
                    r="80"
                    stroke="#5865F2"
                    strokeWidth="12"
                    fill="transparent"
                    strokeDasharray={2 * Math.PI * 80}
                    strokeDashoffset={2 * Math.PI * 80 * (1 - progress / 100)}
                    strokeLinecap="round"
                    className="transition-all duration-300"
                  />
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  {testState === 'idle' ? (
                    <>
                      <Wifi className="w-10 h-10 text-discord-primary mb-1" />
                      <span className="text-xs text-discord-textMuted font-medium">Készen áll</span>
                    </>
                  ) : testState === 'completed' ? (
                    <>
                      <span className="text-3xl font-extrabold text-white tracking-tight">
                        {downloadResult}
                      </span>
                      <span className="text-xs text-discord-green font-bold uppercase tracking-wider">
                        Mbps DL
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-3xl font-extrabold text-white tracking-tight">
                        {currentSpeed > 0 ? currentSpeed : '...'}
                      </span>
                      <span className="text-xs text-discord-primary font-bold uppercase tracking-wider animate-pulse">
                        {testState === 'ping' ? 'Pingelés...' : 'Mbps'}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Fázis szöveges jelzése */}
              <div className="h-6 mb-4 flex items-center justify-center">
                {testState === 'ping' && (
                  <span className="text-xs font-semibold text-discord-yellow flex items-center gap-1.5 animate-pulse">
                    <Activity className="w-3.5 h-3.5" /> 1/3: Ping & Jitter mérése...
                  </span>
                )}
                {testState === 'download' && (
                  <span className="text-xs font-semibold text-discord-primary flex items-center gap-1.5 animate-pulse">
                    <ArrowDown className="w-3.5 h-3.5" /> 2/3: Letöltési sebesség mérése...
                  </span>
                )}
                {testState === 'upload' && (
                  <span className="text-xs font-semibold text-discord-green flex items-center gap-1.5 animate-pulse">
                    <ArrowUp className="w-3.5 h-3.5" /> 3/3: Feltöltési sebesség mérése...
                  </span>
                )}
                {testState === 'completed' && (
                  <span className="text-xs font-semibold text-discord-green flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Mérés sikeresen befejeződött!
                  </span>
                )}
              </div>

              {/* 4 Eredmény kártya */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full mb-6">
                {/* Ping */}
                <div className="bg-discord-darkest border border-discord-dark/60 p-3 rounded-xl flex flex-col items-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-discord-textMuted mb-1 flex items-center gap-1">
                    <Activity className="w-3 h-3" /> PING
                  </span>
                  <span className={`text-base font-bold ${
                    pingResult !== null
                      ? pingResult < 40 ? 'text-discord-green' : pingResult < 90 ? 'text-discord-yellow' : 'text-discord-red'
                      : 'text-discord-textMuted'
                  }`}>
                    {pingResult !== null ? `${pingResult} ms` : '—'}
                  </span>
                </div>

                {/* Jitter */}
                <div className="bg-discord-darkest border border-discord-dark/60 p-3 rounded-xl flex flex-col items-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-discord-textMuted mb-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> JITTER
                  </span>
                  <span className="text-base font-bold text-discord-textHeader">
                    {jitterResult !== null ? `${jitterResult} ms` : '—'}
                  </span>
                </div>

                {/* Letöltés */}
                <div className="bg-discord-darkest border border-discord-dark/60 p-3 rounded-xl flex flex-col items-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-discord-textMuted mb-1 flex items-center gap-1">
                    <ArrowDown className="w-3 h-3 text-discord-primary" /> LETÖLTÉS
                  </span>
                  <span className="text-base font-bold text-discord-primary">
                    {downloadResult !== null ? `${downloadResult}` : '—'}
                    {downloadResult !== null && <span className="text-[10px] font-normal text-discord-textMuted ml-0.5">Mbps</span>}
                  </span>
                </div>

                {/* Feltöltés */}
                <div className="bg-discord-darkest border border-discord-dark/60 p-3 rounded-xl flex flex-col items-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-discord-textMuted mb-1 flex items-center gap-1">
                    <ArrowUp className="w-3 h-3 text-discord-green" /> FELTÖLTÉS
                  </span>
                  <span className="text-base font-bold text-discord-green">
                    {uploadResult !== null ? `${uploadResult}` : '—'}
                    {uploadResult !== null && <span className="text-[10px] font-normal text-discord-textMuted ml-0.5">Mbps</span>}
                  </span>
                </div>
              </div>

              {/* Akciógombok */}
              <div className="flex items-center gap-3 w-full">
                <button
                  type="button"
                  onClick={runSpeedTest}
                  disabled={testState !== 'idle' && testState !== 'completed'}
                  className="flex-1 py-3 px-4 rounded-xl bg-discord-primary hover:bg-discord-primaryHover disabled:opacity-50 text-white font-semibold text-sm transition shadow-lg flex items-center justify-center gap-2"
                >
                  {testState === 'completed' ? (
                    <>
                      <RotateCcw className="w-4 h-4" />
                      <span>Újramérés</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      <span>{testState === 'idle' ? 'Mérés Indítása' : 'Mérés folyamatban...'}</span>
                    </>
                  )}
                </button>

                {testState === 'completed' && (
                  <button
                    type="button"
                    onClick={handleShare}
                    title="Eredmény megosztása a szöveges csevegőben"
                    className="py-3 px-4 rounded-xl bg-discord-dark hover:bg-discord-hover text-discord-textHeader font-semibold text-sm transition shadow flex items-center justify-center gap-2 border border-discord-dark/80"
                  >
                    <Share2 className="w-4 h-4 text-discord-yellow" />
                    <span className="hidden sm:inline">Megosztás Chatben</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* TAB 2: ÖSSZES FELHASZNÁLÓ SEBESSÉGE */
            <div className="space-y-2">
              <div className="text-xs text-discord-textMuted mb-3">
                Itt láthatod a szerveren tartózkodó többi felhasználó legutóbb mért sebességét, vagy kérhetsz tőlük mérést.
              </div>

              {onlineUsers.map((u) => {
                const isSelf = u.id === currentUser?.id;
                const hasResult = !!u.speedTest;

                return (
                  <div
                    key={u.id}
                    className="bg-discord-darkest border border-discord-dark/60 rounded-xl p-3 flex items-center justify-between gap-3"
                  >
                    {/* User infó */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: u.avatarColor || '#5865F2' }}
                      >
                        {u.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-discord-textHeader truncate flex items-center gap-1.5">
                          <span>{u.username}</span>
                          {isSelf && (
                            <span className="text-[10px] text-discord-textMuted bg-discord-dark px-1.5 py-0.2 rounded">
                              Te
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-discord-textMuted flex items-center gap-2">
                          {hasResult ? (
                            <>
                              <span className="flex items-center gap-0.5 text-discord-green font-medium">
                                <Activity className="w-3 h-3" />
                                {u.speedTest.ping} ms
                              </span>
                              <span>•</span>
                              <span>DL: {u.speedTest.download} Mbps</span>
                              <span>•</span>
                              <span>UL: {u.speedTest.upload} Mbps</span>
                            </>
                          ) : (
                            <span className="italic">Még nem mért sebességet</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Mérés kérése gomb */}
                    {!isSelf && (
                      <button
                        type="button"
                        onClick={() => onRequestUserTest(u.id, u.username)}
                        title="Sebességteszt kérése a felhasználótól"
                        className="px-3 py-1.5 rounded-lg bg-discord-dark hover:bg-discord-hover text-discord-textHeader text-xs font-semibold transition flex items-center gap-1.5 border border-discord-darkest flex-shrink-0"
                      >
                        <Activity className="w-3.5 h-3.5 text-discord-primary" />
                        <span>Mérés kérése</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
