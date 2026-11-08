import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, PhoneOff, AudioLines, SlidersHorizontal, Headphones, ChevronUp } from 'lucide-react';
import { useCallSettings, updateCallSettings } from '../../call/callSettings';
import { useAudioDevices } from '../../call/useAudioDevices';

function RoundButton({ onClick, active, danger, accent, label, children, size = 'md' }) {
  const dim = size === 'lg' ? 'w-16 h-16' : 'w-12 h-12 sm:w-14 sm:h-14';
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        className={`${dim} rounded-full flex items-center justify-center transition active:scale-90 hover:scale-105`}
        style={
          danger
            ? { background: 'linear-gradient(135deg, #F0556E, #D63A54)', color: '#fff', boxShadow: '0 10px 28px rgba(233, 75, 100, 0.45)' }
            : accent
              ? { background: 'linear-gradient(135deg, #7655F5, #536CFF)', color: '#fff', boxShadow: '0 6px 20px rgba(118, 85, 245, 0.35)' }
              : active
              ? { background: '#F4F3FF', color: '#101329' }
              : { background: 'rgba(255, 255, 255, 0.08)', color: '#F4F3FF', border: '1px solid rgba(255,255,255,0.1)' }
        }
      >
        {children}
      </button>
      <span className="text-[10px] sm:text-[11px] font-medium" style={{ color: '#999BBE' }}>{label}</span>
    </div>
  );
}

// Gyors eszközválasztó (hangkimenet + mikrofon) a vezérlők fölött
function DeviceMenu({ call, onOpenSettings, onClose }) {
  const settings = useCallSettings();
  const devices = useAudioDevices();
  const ref = useRef(null);

  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [onClose]);

  const row = (active, label, onPick) => (
    <button
      key={label}
      type="button"
      onClick={onPick}
      className="w-full text-left text-sm px-3 py-2 rounded-lg truncate transition"
      style={{ background: active ? 'rgba(118,85,245,0.22)' : 'transparent', color: active ? '#F4F3FF' : '#C9C7F5' }}
    >
      {active ? '● ' : '○ '}{label}
    </button>
  );

  return (
    <div
      ref={ref}
      className="call-pop absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-72 max-w-[88vw] rounded-2xl p-2 text-left"
      style={{ background: '#161A38', border: '1px solid rgba(125,105,255,0.25)', boxShadow: '0 20px 50px rgba(0,0,0,0.55)' }}
    >
      <div className="px-3 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#9B8BFF' }}>
        <Headphones className="inline w-3 h-3 mr-1" />Hangkimenet
      </div>
      {devices.supportsOutputSelection ? (
        <>
          {row(settings.outputDeviceId === 'default', 'Rendszer alapértelmezett', () => { updateCallSettings({ outputDeviceId: 'default' }); call.setOutputDevice('default'); })}
          {devices.outputs.filter((d) => d.deviceId && d.deviceId !== 'default').map((d, i) =>
            row(settings.outputDeviceId === d.deviceId, d.label || `Kimenet ${i + 1}`, () => { updateCallSettings({ outputDeviceId: d.deviceId }); call.setOutputDevice(d.deviceId); }))}
        </>
      ) : (
        <p className="px-3 pb-2 text-xs" style={{ color: '#999BBE' }}>Ez a böngésző nem engedi a kimenet váltását.</p>
      )}
      <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#9B8BFF' }}>
        <Mic className="inline w-3 h-3 mr-1" />Mikrofon
      </div>
      {row(settings.inputDeviceId === 'default', 'Rendszer alapértelmezett', () => { updateCallSettings({ inputDeviceId: 'default' }); call.setInputDevice('default'); })}
      {devices.inputs.filter((d) => d.deviceId && d.deviceId !== 'default').map((d, i) =>
        row(settings.inputDeviceId === d.deviceId, d.label || `Mikrofon ${i + 1}`, () => { updateCallSettings({ inputDeviceId: d.deviceId }); call.setInputDevice(d.deviceId); }))}
      <button
        type="button"
        onClick={() => { onClose(); onOpenSettings(); }}
        className="w-full mt-1 text-xs font-semibold px-3 py-2 rounded-lg"
        style={{ background: 'rgba(118,85,245,0.15)', color: '#C9C7F5' }}
      >
        További hangbeállítások…
      </button>
    </div>
  );
}

export default function CallControls({ call, muted, onToggleMute, onEnd, onOpenSettings, showDevices = true }) {
  const settings = useCallSettings();
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleNoise = () => {
    updateCallSettings({ noiseSuppression: !settings.noiseSuppression });
    call.reapplyProcessing();
  };

  return (
    <div className="relative flex items-end justify-center gap-3 sm:gap-5">
      <RoundButton onClick={onToggleMute} active={muted} label={muted ? 'Némítva' : 'Mikrofon'}>
        {muted ? <MicOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Mic className="w-5 h-5 sm:w-6 sm:h-6" />}
      </RoundButton>

      <RoundButton onClick={toggleNoise} accent={settings.noiseSuppression} label={settings.noiseSuppression ? 'Zajszűrés be' : 'Zajszűrés ki'}>
        <AudioLines className="w-5 h-5 sm:w-6 sm:h-6" />
      </RoundButton>

      {showDevices && (
        <div className="relative">
          {menuOpen && <DeviceMenu call={call} onOpenSettings={onOpenSettings} onClose={() => setMenuOpen(false)} />}
          <RoundButton onClick={() => setMenuOpen((v) => !v)} active={menuOpen} label="Eszközök">
            <ChevronUp className="w-5 h-5 sm:w-6 sm:h-6" />
          </RoundButton>
        </div>
      )}

      <RoundButton onClick={onOpenSettings} label="Beállítások">
        <SlidersHorizontal className="w-5 h-5 sm:w-6 sm:h-6" />
      </RoundButton>

      <RoundButton onClick={onEnd} danger size="lg" label="Befejezés">
        <PhoneOff className="w-7 h-7" />
      </RoundButton>
    </div>
  );
}
