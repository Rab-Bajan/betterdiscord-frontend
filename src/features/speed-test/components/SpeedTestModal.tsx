import React, { useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
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
import type { SocketLike } from '../../../shared/services/socket/SocketLike';
import type { CurrentUser, PresenceUser } from '../../../shared/types';
import { SpeedTestRunner, type SpeedTestState } from '../lib/SpeedTestRunner';
import SpeedTestUsersList from './SpeedTestUsersList';
import SpeedGauge from './SpeedGauge';

interface SpeedTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  socket: SocketLike | null | undefined;
  currentUser: CurrentUser | null;
  onlineUsers?: PresenceUser[];
  onRequestUserTest: (targetUserId: string, targetUsername: string) => void;
  onShareResultToChat: (text: string) => void;
}

export default function SpeedTestModal({
  isOpen,
  onClose,
  socket,
  currentUser,
  onlineUsers = [],
  onRequestUserTest,
  onShareResultToChat
}: SpeedTestModalProps) {
  const [activeTab, setActiveTab] = useState<'test' | 'users'>('test');
  const [testState, setTestState] = useState<SpeedTestState>('idle');

  const [currentSpeed, setCurrentSpeed] = useState(0); // Live speed during measurement
  const [pingResult, setPingResult] = useState<number | null>(null);
  const [jitterResult, setJitterResult] = useState<number | null>(null);
  const [downloadResult, setDownloadResult] = useState<number | null>(null);
  const [uploadResult, setUploadResult] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);

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

    try {
      const result = await new SpeedTestRunner(socket).run({
        onPhase: setTestState,
        onProgress: setProgress,
        onPing: (ping, jitter) => {
          setPingResult(ping);
          setJitterResult(jitter);
        },
        onDownload: (mbps) => {
          setDownloadResult(mbps);
          setCurrentSpeed(mbps);
        }
      });
      setUploadResult(result.upload);
      setCurrentSpeed(result.upload);
      setTestState('completed');
    } catch (err) {
      if (!(err instanceof Error && err.name === 'AbortError')) {
        console.error('Sebességteszt hiba:', err);
      }
      setTestState('idle');
    }
  };

  const handleShare = () => {
    if (testState !== 'completed' || !downloadResult) return;
    const msg = `⚡ **SharkVoic Sebességteszt Eredményem:**\n` +
      `🏓 Ping: **${pingResult} ms** (Jitter: ${jitterResult} ms)\n` +
      `⬇️ Letöltés: **${downloadResult} Mbps**\n` +
      `⬆️ Feltöltés: **${uploadResult} Mbps**`;
    onShareResultToChat(msg);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 pt-safe pb-safe select-none bg-black/60 backdrop-blur-md">
      <div className="rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]" style={{ background: '#101329', border: '1px solid rgba(125, 105, 255, 0.25)', boxShadow: '0 12px 40px rgba(0, 0, 0, 0.7)' }}>
        {/* Modal Fejléc */}
        <div className="min-h-[56px] px-4 sm:px-6 py-2 flex items-center justify-between gap-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(125, 105, 255, 0.12)', background: '#101329' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(118, 85, 245, 0.2)', color: '#7655F5' }}>
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold leading-tight" style={{ color: '#F4F3FF' }}>
                Net Sebességteszt
              </h2>
              <p className="text-[11px] leading-tight" style={{ color: '#999BBE' }}>
                Ping, Letöltés és Feltöltés valós idejű mérése
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            title="Bezárás"
            className="p-2 rounded-xl flex-shrink-0 flex items-center justify-center transition-all"
            style={{ color: '#999BBE' }}
            onMouseOver={e => { e.currentTarget.style.background = 'rgba(125, 105, 255, 0.15)'; e.currentTarget.style.color = '#F4F3FF'; }}
            onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#999BBE'; }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Fülek (Tabs) */}
        <div className="flex px-4 sm:px-6 pt-2 flex-shrink-0 gap-4 overflow-x-auto scrollbar-none" style={{ background: 'rgba(9, 10, 24, 0.5)', borderBottom: '1px solid rgba(125, 105, 255, 0.12)' }}>
          <button
            onClick={() => setActiveTab('test')}
            className="pb-2.5 text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap"
            style={{
              borderBottom: activeTab === 'test' ? '2px solid #7655F5' : '2px solid transparent',
              color: activeTab === 'test' ? '#7655F5' : '#999BBE',
            }}
          >
            <Gauge className="w-4 h-4" />
            <span>Saját mérés</span>
          </button>

          <button
            onClick={() => setActiveTab('users')}
            className="pb-2.5 text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap"
            style={{
              borderBottom: activeTab === 'users' ? '2px solid #7655F5' : '2px solid transparent',
              color: activeTab === 'users' ? '#7655F5' : '#999BBE',
            }}
          >
            <Users className="w-4 h-4" />
            <span>Felhasználók sebessége ({onlineUsers.length})</span>
          </button>
        </div>

        {/* Modal Tartalom */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {activeTab === 'test' ? (
            /* TAB 1: SAJÁT SEBESSÉGMÉRŐ */
            <div className="flex flex-col items-center">
              {/* Kör alakú sebességmérő (Speedometer Gauge) */}
              <SpeedGauge testState={testState} progress={progress} currentSpeed={currentSpeed} downloadResult={downloadResult} />

              {/* Fázis szöveges jelzése */}
              <div className="h-6 mb-4 flex items-center justify-center">
                {testState === 'ping' && (
                  <span className="text-xs font-semibold flex items-center gap-1.5 animate-pulse" style={{ color: '#F5B041' }}>
                    <Activity className="w-3.5 h-3.5" /> 1/3: Ping & Jitter mérése...
                  </span>
                )}
                {testState === 'download' && (
                  <span className="text-xs font-semibold flex items-center gap-1.5 animate-pulse" style={{ color: '#7655F5' }}>
                    <ArrowDown className="w-3.5 h-3.5" /> 2/3: Letöltési sebesség mérése...
                  </span>
                )}
                {testState === 'upload' && (
                  <span className="text-xs font-semibold flex items-center gap-1.5 animate-pulse" style={{ color: '#28C997' }}>
                    <ArrowUp className="w-3.5 h-3.5" /> 3/3: Feltöltési sebesség mérése...
                  </span>
                )}
                {testState === 'completed' && (
                  <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: '#28C997' }}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Mérés sikeresen befejeződött!
                  </span>
                )}
              </div>

              {/* 4 Eredmény kártya */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full mb-6">
                {/* Ping */}
                <div className="p-3 rounded-xl flex flex-col items-center" style={{ background: '#151832', border: '1px solid rgba(125, 105, 255, 0.15)' }}>
                  <span className="text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: '#999BBE' }}>
                    <Activity className="w-3 h-3" /> PING
                  </span>
                  <span className="text-base font-bold" style={{
                    color: pingResult !== null
                      ? pingResult < 40 ? '#28C997' : pingResult < 90 ? '#F5B041' : '#E94B64'
                      : '#999BBE'
                  }}>
                    {pingResult !== null ? `${pingResult} ms` : '—'}
                  </span>
                </div>

                {/* Jitter */}
                <div className="p-3 rounded-xl flex flex-col items-center" style={{ background: '#151832', border: '1px solid rgba(125, 105, 255, 0.15)' }}>
                  <span className="text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: '#999BBE' }}>
                    <Clock className="w-3 h-3" /> JITTER
                  </span>
                  <span className="text-base font-bold text-white">
                    {jitterResult !== null ? `${jitterResult} ms` : '—'}
                  </span>
                </div>

                {/* Letöltés */}
                <div className="p-3 rounded-xl flex flex-col items-center" style={{ background: '#151832', border: '1px solid rgba(125, 105, 255, 0.15)' }}>
                  <span className="text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: '#999BBE' }}>
                    <ArrowDown className="w-3 h-3" style={{ color: '#7655F5' }} /> LETÖLTÉS
                  </span>
                  <span className="text-base font-bold" style={{ color: '#7655F5' }}>
                    {downloadResult !== null ? `${downloadResult}` : '—'}
                    {downloadResult !== null && <span className="text-[10px] font-normal ml-0.5" style={{ color: '#999BBE' }}>Mbps</span>}
                  </span>
                </div>

                {/* Feltöltés */}
                <div className="p-3 rounded-xl flex flex-col items-center" style={{ background: '#151832', border: '1px solid rgba(125, 105, 255, 0.15)' }}>
                  <span className="text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: '#999BBE' }}>
                    <ArrowUp className="w-3 h-3" style={{ color: '#28C997' }} /> FELTÖLTÉS
                  </span>
                  <span className="text-base font-bold" style={{ color: '#28C997' }}>
                    {uploadResult !== null ? `${uploadResult}` : '—'}
                    {uploadResult !== null && <span className="text-[10px] font-normal ml-0.5" style={{ color: '#999BBE' }}>Mbps</span>}
                  </span>
                </div>
              </div>

              {/* Akciógombok */}
              <div className="flex items-center gap-3 w-full">
                <button
                  type="button"
                  onClick={runSpeedTest}
                  disabled={testState !== 'idle' && testState !== 'completed'}
                  className="flex-1 py-3 px-4 rounded-xl text-white font-semibold text-sm transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #7655F5, #536CFF)', boxShadow: '0 4px 20px rgba(118, 85, 245, 0.35)' }}
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
                    className="py-3 px-4 rounded-xl font-semibold text-sm transition-all shadow flex items-center justify-center gap-2"
                    style={{ background: '#1B2040', color: '#F4F3FF', border: '1px solid rgba(125, 105, 255, 0.2)' }}
                    onMouseOver={e => e.currentTarget.style.background = '#242b50'}
                    onMouseOut={e => e.currentTarget.style.background = '#1B2040'}
                  >
                    <Share2 className="w-4 h-4" style={{ color: '#F5B041' }} />
                    <span className="hidden sm:inline">Megosztás Chatben</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* TAB 2: ÖSSZES FELHASZNÁLÓ SEBESSÉGE */
            <SpeedTestUsersList onlineUsers={onlineUsers} currentUserId={currentUser?.id} onRequestUserTest={onRequestUserTest} />
          )}
        </div>
      </div>
    </div>
  );
}
