import React, { useEffect, useState } from 'react';
import { Minimize2, Maximize2, MicOff, Mic, PhoneOff, Volume2, Wifi, ShieldCheck } from 'lucide-react';
import CallAvatar from './CallAvatar';
import CallControls from './CallControls';
import { useCallLevels } from '../../call/audioLevel';
import { CALL_ERRORS } from '../../hooks/useCall';

export const formatDuration = (sec) => {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(r).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

function useElapsed(startedAt) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [startedAt]);
  return startedAt ? (now - startedAt) / 1000 : 0;
}

const STATUS_TEXT = {
  calling: 'Hívás indítása',
  ringing: 'Csörög',
  connecting: 'Kapcsolódás',
  connected: 'Csatlakozva',
  reconnecting: 'Újracsatlakozás',
  ended: 'A hívás véget ért',
  declined: 'A hívást elutasították',
  missed: 'Nem fogadta a hívást',
  cancelled: 'Hívás lemondva',
  busy: 'A felhasználó foglalt',
  failed: 'A hívás nem sikerült'
};

const isLive = (s) => ['calling', 'ringing', 'connecting', 'reconnecting'].includes(s);

// Animált hangaktivitás-sávok
function ActivityBars({ level, color, muted }) {
  const bars = [0.55, 0.85, 1, 0.8, 0.5];
  return (
    <div className="flex items-end gap-[3px] h-5" aria-hidden="true">
      {bars.map((w, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full transition-all duration-100"
          style={{
            height: muted ? 4 : Math.max(4, Math.min(20, 4 + level * 22 * w)),
            background: muted ? '#242b50' : color,
            opacity: muted ? 0.6 : 0.5 + level * 0.5
          }}
        />
      ))}
    </div>
  );
}

function QualityChip({ call }) {
  if (call.status !== 'connected' && call.status !== 'reconnecting') return null;
  const q = call.quality || 'good';
  const color = { good: '#28C997', fair: '#F5B041', poor: '#E94B64' }[q];
  const label = { good: 'Kiváló kapcsolat', fair: 'Közepes kapcsolat', poor: 'Gyenge kapcsolat' }[q];
  const bars = { good: 3, fair: 2, poor: 1 }[q];
  const details = [
    call.codec,
    call.bitrateKbps ? `${call.bitrateKbps} kbps` : null,
    call.rttMs != null ? `${call.rttMs} ms` : null,
    call.route === 'relay' ? 'TURN relé' : call.route === 'direct' ? 'közvetlen' : null
  ].filter(Boolean).join(' · ');
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-2 text-xs font-medium" style={{ color }}>
        <span className="flex items-end gap-[2px] h-3.5" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <span key={n} className="w-[3px] rounded-sm" style={{ height: 4 + n * 3, background: n <= bars ? color : '#242b50' }} />
          ))}
        </span>
        {label}
      </div>
      {details && <div className="text-[10px]" style={{ color: '#999BBE' }}>{details}</div>}
    </div>
  );
}

function statusLine(call, elapsed) {
  if (call.terminal) {
    if (call.status === 'failed' && call.reason) return CALL_ERRORS[call.reason] || CALL_ERRORS.generic;
    if (call.status === 'busy') return CALL_ERRORS.busy;
    if (call.status === 'ended' && call.durationSec > 0) return `${STATUS_TEXT.ended} · ${formatDuration(call.durationSec)}`;
    return STATUS_TEXT[call.status] || '';
  }
  if (call.status === 'connected') return formatDuration(elapsed);
  return STATUS_TEXT[call.status] || '';
}

// Kimenő hívás (csörgés), aktív hívás és lezárt állapotok egyetlen, prémium felületen.
// A kicsinyített változat egy lebegő sáv, hogy a hívás közben is lehessen böngészni.
export default function CallScreen({ call, controls, minimized, onToggleMinimize, onOpenSettings, onDismiss }) {
  const levels = useCallLevels();
  const elapsed = useElapsed(call.status === 'connected' || call.status === 'reconnecting' ? call.startedAt : null);
  const live = isLive(call.status) || call.status === 'connected';
  const dots = ['calling', 'ringing', 'connecting', 'reconnecting'].includes(call.status);
  const line = statusLine(call, elapsed);
  const speaking = call.status === 'connected' && levels.remote > 0.08;
  const accent = call.terminal && call.status !== 'ended' ? '#E94B64' : '#28C997';

  if (minimized && !call.terminal) {
    return (
      <div
        className="call-pop fixed left-1/2 -translate-x-1/2 z-[95] flex items-center gap-2 sm:gap-3 pl-2 pr-2 sm:pr-3 py-2 rounded-full max-w-[calc(100vw-1rem)]"
        style={{ top: 'max(0.75rem, env(safe-area-inset-top))', background: 'rgba(21, 24, 50, 0.92)', border: '1px solid rgba(125,105,255,0.3)', backdropFilter: 'blur(14px)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}
      >
        <CallAvatar peer={call.peer} size={34} level={levels.remote} speaking={speaking} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-sm font-semibold truncate max-w-[26vw] sm:max-w-[160px]" title={call.peer.username} style={{ color: '#F4F3FF' }}>{call.peer.username}</div>
          <div className="text-[11px] tabular-nums" style={{ color: accent }}>{line}{dots && '…'}</div>
        </div>
        <button type="button" onClick={controls.onToggleMute} aria-label={call.muted ? 'Némítás feloldása' : 'Némítás'}
          className="w-10 h-10 flex-shrink-0 rounded-full flex items-center justify-center transition active:scale-90"
          style={{ background: call.muted ? '#F4F3FF' : 'rgba(255,255,255,0.1)', color: call.muted ? '#101329' : '#F4F3FF' }}>
          {call.muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>
        <button type="button" onClick={controls.onEnd} aria-label="Hívás befejezése"
          className="w-10 h-10 flex-shrink-0 rounded-full flex items-center justify-center text-white transition active:scale-90"
          style={{ background: 'linear-gradient(135deg, #E94B64, #E94B64)' }}>
          <PhoneOff className="w-4 h-4" />
        </button>
        <button type="button" onClick={onToggleMinimize} aria-label="Hívás megnyitása"
          className="w-10 h-10 flex-shrink-0 rounded-full flex items-center justify-center transition active:scale-90"
          style={{ background: 'rgba(255,255,255,0.1)', color: '#F4F3FF' }}>
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-label={`Hanghívás: ${call.peer.username}`}
      className="fixed inset-0 z-[95] flex flex-col call-fade overflow-hidden"
      style={{ background: 'radial-gradient(120% 90% at 50% 0%, #151832 0%, #101329 55%, #090A18 100%)' }}
    >
      <div className="call-aurora absolute -top-40 left-1/2 -translate-x-1/2 w-[640px] h-[640px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(118,85,245,0.28), transparent 65%)' }} />
      <div className="call-aurora absolute bottom-[-220px] right-[-120px] w-[520px] h-[520px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(83,108,255,0.2), transparent 65%)', animationDelay: '-6s' }} />

      <div className="relative flex items-center justify-between gap-2 px-4 sm:px-6 pt-4" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-2 text-xs min-w-0" style={{ color: '#999BBE' }}>
          <ShieldCheck className="w-4 h-4 flex-shrink-0" style={{ color: '#28C997' }} />
          <span className="truncate">Titkosított hang (DTLS-SRTP)</span>
        </div>
        {live && (
          <button type="button" onClick={onToggleMinimize} aria-label="Hívás kicsinyítése"
            className="p-2.5 min-w-[40px] min-h-[40px] flex items-center justify-center flex-shrink-0 rounded-xl transition hover:bg-white/10" style={{ color: '#F4F3FF' }}>
            <Minimize2 className="w-5 h-5" />
          </button>
        )}
        {call.terminal && (
          <button type="button" onClick={onDismiss} className="text-xs px-3 py-2 min-h-[40px] flex-shrink-0 rounded-xl hover:bg-white/10" style={{ color: '#F4F3FF' }}>
            Bezárás
          </button>
        )}
      </div>

      <div className="relative flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center px-4 sm:px-6 py-2 text-center">
        <CallAvatar
          peer={call.peer}
          size={typeof window !== 'undefined' && window.innerHeight < 640 ? 96 : 136}
          rings={call.status === 'ringing' || call.status === 'calling'}
          level={call.status === 'connected' ? levels.remote : 0}
          speaking={speaking}
        />
        <h2 className="mt-7 text-2xl sm:text-3xl font-bold truncate max-w-full" title={call.peer.displayName} style={{ color: '#F4F3FF' }}>{call.peer.displayName}</h2>
        <p className="text-sm mt-1 truncate max-w-full" style={{ color: '#999BBE' }}>@{call.peer.username}</p>

        <div
          aria-live="polite"
          className={`mt-5 font-semibold tabular-nums ${call.status === 'connected' ? 'text-3xl' : 'text-base'}`}
          style={{ color: call.status === 'connected' ? '#F4F3FF' : accent, maxWidth: '28rem' }}
        >
          {line}
          {dots && [0, 0.2, 0.4].map((d) => <span key={d} className="call-dot" style={{ animationDelay: `${d}s` }}>.</span>)}
        </div>
        {call.status === 'connected' && <div className="mt-1 text-xs" style={{ color: '#999BBE' }}>{STATUS_TEXT.connected}</div>}
        {call.status === 'reconnecting' && (
          <div className="mt-1 text-xs" style={{ color: '#F5B041' }}>Instabil hálózat – a kapcsolat automatikusan helyreáll</div>
        )}
        {call.peerOffline && call.status !== 'reconnecting' && (
          <div className="mt-1 text-xs" style={{ color: '#F5B041' }}>A másik fél újracsatlakozik…</div>
        )}

        {(call.status === 'connected' || call.status === 'reconnecting') && (
          <div className="mt-6 flex flex-col items-center gap-4 max-w-full">
            <QualityChip call={call} />
            <div className="flex items-center gap-5 sm:gap-10 max-w-full">
              <div className="flex flex-col items-center gap-1.5">
                <ActivityBars level={levels.local} color="#7655F5" muted={call.muted} />
                <span className="flex items-center gap-1 text-[11px]" style={{ color: call.muted ? '#E94B64' : '#999BBE' }}>
                  {call.muted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}{call.muted ? 'Te · némítva' : 'Te'}
                </span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <ActivityBars level={levels.remote} color="#28C997" muted={call.peerMuted} />
                <span className="flex items-center gap-1 text-[11px]" style={{ color: call.peerMuted ? '#E94B64' : '#999BBE' }}>
                  {call.peerMuted ? <MicOff className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}{call.peerMuted ? `${call.peer.username} némítva` : call.peer.username}
                </span>
              </div>
            </div>
          </div>
        )}

        {call.warning === 'mic-lost' && (
          <div className="mt-5 text-xs px-3 py-2 rounded-xl max-w-full" style={{ background: 'rgba(233,75,100,0.15)', color: '#E94B64', border: '1px solid rgba(233,75,100,0.3)' }}>
            A mikrofon megszakadt. Válassz másik eszközt az „Eszközök” menüben.
          </div>
        )}
        {call.warning === 'autoplay' && (
          <button type="button" onClick={controls.onRetryAudio} className="mt-5 text-xs px-3 py-2 min-h-[40px] rounded-xl max-w-full"
            style={{ background: 'rgba(118,85,245,0.2)', color: '#F4F3FF', border: '1px solid rgba(118,85,245,0.4)' }}>
            <Wifi className="inline w-3.5 h-3.5 mr-1" /> A böngésző blokkolta a lejátszást – koppints ide a hang bekapcsolásához
          </button>
        )}
      </div>

      {!call.terminal && (
        <div className="relative flex-shrink-0 pb-6 sm:pb-9 px-3" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
          <CallControls
            call={controls.callApi}
            muted={!!call.muted}
            onToggleMute={controls.onToggleMute}
            onEnd={controls.onEnd}
            onOpenSettings={onOpenSettings}
            showDevices={call.status === 'connected' || call.status === 'connecting' || call.status === 'reconnecting'}
          />
        </div>
      )}
    </div>
  );
}
