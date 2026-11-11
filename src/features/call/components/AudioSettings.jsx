import React from 'react';
import { X, Bell, Mic, Headphones, AudioLines, Gauge } from 'lucide-react';
import RingtoneSelector from './RingtoneSelector';
import { useCallSettings, updateCallSettings, QUALITY_PRESETS } from '../lib/callSettings';
import { useAudioDevices } from '../hooks/useAudioDevices';
import { previewRingtone } from '../lib/callSounds';

const card = { background: '#151832', border: '1px solid rgba(125, 105, 255, 0.12)' };

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex items-center justify-between gap-4 py-2 cursor-pointer">
      <span className="min-w-0">
        <span className="block text-sm font-medium" style={{ color: '#F4F3FF' }}>{label}</span>
        {hint && <span className="block text-[11px]" style={{ color: '#999BBE' }}>{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative w-11 h-6 rounded-full flex-shrink-0 transition"
        style={{ background: checked ? 'linear-gradient(135deg, #7655F5, #536CFF)' : '#242b50' }}
      >
        <span
          className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
          style={{ left: checked ? '22px' : '2px' }}
        />
      </button>
    </label>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <section className="rounded-2xl p-4" style={card}>
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#7655F5' }}>
        <Icon className="w-3.5 h-3.5" /> {title}
      </h3>
      {children}
    </section>
  );
}

const selectStyle = { background: '#101329', color: '#F4F3FF', border: '1px solid rgba(125, 105, 255, 0.35)' };

// Haladó hang- és hívásbeállítások. Hívás közben a módosítások azonnal érvényesülnek.
export default function AudioSettings({ onClose, call }) {
  const settings = useCallSettings();
  const devices = useAudioDevices();
  const inCall = !!call?.isInCall;
  const notifSupported = typeof Notification !== 'undefined';

  const processing = (patch) => {
    updateCallSettings(patch);
    if (inCall) setTimeout(() => call.reapplyProcessing(), 0);
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md call-fade"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Hívásbeállítások"
        onClick={(e) => e.stopPropagation()}
        className="call-pop w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl"
        style={{ background: '#101329', border: '1px solid rgba(125, 105, 255, 0.15)', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)' }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 sm:px-5 py-3" style={{ background: '#101329', borderBottom: '1px solid rgba(125, 105, 255, 0.12)' }}>
          <h2 className="text-lg font-bold" style={{ color: '#F4F3FF' }}>Hívásbeállítások</h2>
          <button type="button" onClick={onClose} aria-label="Bezárás" className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl flex-shrink-0 transition hover:bg-[#1B2040]" style={{ color: '#999BBE' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <Section icon={Bell} title="Hívás-hangok">
            <Toggle
              checked={settings.soundsEnabled}
              onChange={(v) => updateCallSettings({ soundsEnabled: v })}
              label="Hívás-hangok engedélyezése"
              hint="Csengőhang, kicsengés, kapcsolódás, befejezés. Beszélgetés közben nem szól semmi zavaró."
            />
            <div className="py-2">
              <div className="flex items-center justify-between text-sm mb-1.5" style={{ color: '#F4F3FF' }}>
                <span className="font-medium">Értesítési hangerő</span>
                <span style={{ color: '#999BBE' }}>{Math.round(settings.volume * 100)}%</span>
              </div>
              <input
                type="range" min="0" max="1" step="0.01" value={settings.volume}
                aria-label="Értesítési hangerő"
                onChange={(e) => updateCallSettings({ volume: Number(e.target.value) })}
                onPointerUp={() => previewRingtone(settings.ringtone)}
                onKeyUp={() => previewRingtone(settings.ringtone)}
                className="w-full accent-[#7655F5]"
              />
            </div>
            <div className="pt-1">
              <div className="text-sm font-medium mb-2" style={{ color: '#F4F3FF' }}>Csengőhang</div>
              <RingtoneSelector />
            </div>
            {notifSupported && Notification.permission !== 'granted' && (
              <button
                type="button"
                disabled={Notification.permission === 'denied'}
                onClick={() => Notification.requestPermission().then(() => updateCallSettings({}))}
                className="mt-3 w-full min-h-[40px] text-xs font-semibold py-2 px-3 rounded-xl transition disabled:opacity-50"
                style={{ background: 'rgba(118,85,245,0.18)', color: '#F4F3FF', border: '1px solid rgba(118,85,245,0.35)' }}
              >
                {Notification.permission === 'denied'
                  ? 'Az értesítések le vannak tiltva a böngészőben'
                  : 'Asztali értesítések engedélyezése bejövő híváshoz'}
              </button>
            )}
          </Section>

          <Section icon={Mic} title="Eszközök">
            <label className="block text-xs mb-1" style={{ color: '#999BBE' }}>Mikrofon</label>
            <select
              value={settings.inputDeviceId}
              onChange={(e) => {
                updateCallSettings({ inputDeviceId: e.target.value });
                if (inCall) call.setInputDevice(e.target.value);
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl text-sm mb-3 outline-none"
              style={selectStyle}
            >
              <option value="default">Rendszer alapértelmezett</option>
              {devices.inputs.filter((d) => d.deviceId && d.deviceId !== 'default').map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || `Mikrofon ${i + 1}`}</option>
              ))}
            </select>

            <label className="block text-xs mb-1" style={{ color: '#999BBE' }}>
              <Headphones className="inline w-3 h-3 mr-1" />Hangkimenet
            </label>
            {devices.supportsOutputSelection ? (
              <select
                value={settings.outputDeviceId}
                onChange={(e) => {
                  updateCallSettings({ outputDeviceId: e.target.value });
                  if (inCall) call.setOutputDevice(e.target.value);
                }}
                className="w-full min-h-[40px] px-3 py-2 rounded-xl text-sm outline-none"
                style={selectStyle}
              >
                <option value="default">Rendszer alapértelmezett</option>
                {devices.outputs.filter((d) => d.deviceId && d.deviceId !== 'default').map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || `Kimenet ${i + 1}`}</option>
                ))}
              </select>
            ) : (
              <p className="text-xs" style={{ color: '#999BBE' }}>
                Ez a böngésző nem támogatja a hangkimenet választását – a rendszer alapértelmezett kimenete szól.
              </p>
            )}
          </Section>

          <Section icon={AudioLines} title="Hangfeldolgozás">
            <Toggle checked={settings.noiseSuppression} onChange={(v) => processing({ noiseSuppression: v })}
              label="Zajszűrés" hint="Csökkenti a háttérzajt (ventilátor, billentyűzet)." />
            <Toggle checked={settings.echoCancellation} onChange={(v) => processing({ echoCancellation: v })}
              label="Visszhangszűrés" hint="Megakadályozza, hogy a hangszóró hangja visszajusson a mikrofonba. Fejhallgató nélkül érdemes bekapcsolva hagyni." />
            <Toggle checked={settings.autoGainControl} onChange={(v) => processing({ autoGainControl: v })}
              label="Automatikus mikrofonszint" hint="Egyenletes hangerő, torzítás nélkül." />
          </Section>

          <Section icon={Gauge} title="Hangminőség">
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(QUALITY_PRESETS).map(([id, q]) => {
                const active = settings.quality === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => updateCallSettings({ quality: id })}
                    className="px-2 py-2.5 rounded-xl text-center transition"
                    style={{
                      background: active ? 'rgba(118, 85, 245, 0.2)' : '#101329',
                      border: `1px solid ${active ? 'rgba(118, 85, 245, 0.65)' : 'rgba(125, 105, 255, 0.12)'}`
                    }}
                  >
                    <div className="text-sm font-semibold" style={{ color: '#F4F3FF' }}>{q.label}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: '#999BBE' }}>{q.hint}</div>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] mt-2" style={{ color: '#999BBE' }}>
              Opus kodek, hálózatfüggő adaptív bitrátával. A beállítás a következő hívástól érvényes teljesen;
              a hívás közbeni sávszélesség-szabályozás automatikus.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
