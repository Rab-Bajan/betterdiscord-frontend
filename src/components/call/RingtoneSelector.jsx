import React from 'react';
import { Play, Check } from 'lucide-react';
import { RINGTONES, previewRingtone } from '../../call/callSounds';
import { useCallSettings, updateCallSettings } from '../../call/callSettings';

// Csengőhang kiválasztása meghallgatással
export default function RingtoneSelector() {
  const settings = useCallSettings();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Csengőhang">
      {RINGTONES.map((r) => {
        const active = settings.ringtone === r.id;
        return (
          <div
            key={r.id}
            role="radio"
            aria-checked={active}
            tabIndex={0}
            onClick={() => updateCallSettings({ ringtone: r.id })}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); updateCallSettings({ ringtone: r.id }); } }}
            className="flex items-center gap-3 px-3 py-2.5 min-h-[40px] min-w-0 rounded-xl cursor-pointer transition"
            style={{
              background: active ? 'rgba(118, 85, 245, 0.18)' : '#151832',
              border: `1px solid ${active ? 'rgba(118, 85, 245, 0.6)' : 'rgba(125, 105, 255, 0.12)'}`
            }}
          >
            <button
              type="button"
              aria-label={`${r.label} meghallgatása`}
              onClick={(e) => { e.stopPropagation(); previewRingtone(r.id); }}
              className="w-10 h-10 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0 transition active:scale-90"
              style={{ background: 'linear-gradient(135deg, #7655F5, #536CFF)', color: '#fff' }}
            >
              <Play className="w-3.5 h-3.5 ml-0.5" />
            </button>
            <div className="min-w-0 flex-1 text-left">
              <div className="text-sm font-semibold truncate" style={{ color: '#F4F3FF' }}>{r.label}</div>
              <div className="text-[11px] truncate" style={{ color: '#999BBE' }}>{r.hint}</div>
            </div>
            {active && <Check className="w-4 h-4 flex-shrink-0" style={{ color: '#28C997' }} />}
          </div>
        );
      })}
    </div>
  );
}
