import React from 'react';
import {
  Activity,
  Zap,
  Flame,
  ShieldAlert,
  Thermometer,
  Clock,
  Compass,
  Radio,
  Eye,
  Crosshair
} from 'lucide-react';

export default function PhobiaHUD({
  stamina = 100, // 0 - 100%
  sanity = 100, // 0 - 100%
  inventory = [null, null, null], // 3 items
  activeSlot = 0, // 0, 1, 2
  crosshairPrompt = null, // e.g. { action: 'Kinyitás', key: 'E', subText: 'Vasszekrény ajtaja' }
  huntActive = false,
  gracePeriodSeconds = 0, // > 0 if preparation timer is active
  ambientTemp = 15.0, // Celsius
  breakerOn = true,
  activeLightsCount = 0,
  maxLightsCount = 6,
  onOpenJournal
}) {
  // Low sanity vignette intensity: starts below 30%
  const lowSanity = sanity < 30;
  const criticalSanity = sanity < 15;

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-20 flex flex-col justify-between p-4 sm:p-6 overflow-hidden">
      {/* 1. Low Sanity Heartbeat Vignette */}
      {lowSanity && (
        <div
          className={`absolute inset-0 pointer-events-none transition-opacity duration-1000 ${
            criticalSanity ? 'animate-pulse opacity-85' : 'opacity-40 animate-pulse'
          }`}
          style={{
            background: 'radial-gradient(circle at center, transparent 40%, rgba(185, 28, 28, 0.45) 80%, rgba(127, 29, 29, 0.85) 100%)',
            boxShadow: 'inset 0 0 100px rgba(220, 38, 38, 0.7)'
          }}
        />
      )}

      {/* 2. TOP SECTION: Hunt Banner, Grace Timer, System Info */}
      <div className="relative w-full flex items-start justify-between">
        {/* Top-Left: Sanity & Stamina & Temp */}
        <div className="flex flex-col gap-2.5 max-w-xs">
          {/* Sanity Gauge */}
          <div className="p-3 rounded-2xl bg-black/70 backdrop-blur-md border border-gray-800 shadow-xl">
            <div className="flex items-center justify-between text-xs mb-1.5 font-bold">
              <span className="flex items-center gap-1.5 text-gray-300">
                <Activity className={`w-4 h-4 ${lowSanity ? 'text-red-500 animate-bounce' : 'text-purple-400'}`} />
                <span>Épelme (Sanity)</span>
              </span>
              <span
                className={`font-mono text-sm ${
                  sanity > 50 ? 'text-emerald-400' : sanity > 25 ? 'text-amber-400' : 'text-red-400 animate-pulse'
                }`}
              >
                {Math.round(sanity)}%
              </span>
            </div>
            {/* Sanity bar */}
            <div className="w-48 h-2.5 bg-gray-900 rounded-full overflow-hidden border border-gray-700/60 p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  sanity > 50
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                    : sanity > 25
                    ? 'bg-gradient-to-r from-amber-500 to-orange-400'
                    : 'bg-gradient-to-r from-red-600 to-rose-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]'
                }`}
                style={{ width: `${Math.max(0, Math.min(100, sanity))}%` }}
              />
            </div>
          </div>

          {/* Stamina Meter */}
          <div className="p-2.5 px-3 rounded-xl bg-black/60 backdrop-blur-md border border-gray-800/80 shadow-lg flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-400 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              Állóképesség
            </span>
            <div className="w-28 h-2 bg-gray-900 rounded-full overflow-hidden border border-gray-700/60">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-400 rounded-full transition-all duration-100"
                style={{ width: `${Math.max(0, Math.min(100, stamina))}%` }}
              />
            </div>
          </div>

          {/* Ambient Temperature Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md border border-gray-800/80 text-xs font-mono">
            <Thermometer className={`w-3.5 h-3.5 ${ambientTemp <= 0 ? 'text-cyan-400 animate-pulse' : 'text-amber-400'}`} />
            <span className="text-gray-400">Környezet:</span>
            <span className={`font-bold ${ambientTemp <= 0 ? 'text-cyan-300' : 'text-gray-200'}`}>
              {ambientTemp <= 0 ? `❄️ ${ambientTemp.toFixed(1)}°C` : `${ambientTemp.toFixed(1)}°C`}
            </span>
          </div>
        </div>

        {/* Top-Center: HUNT WARNING or Grace Period */}
        <div className="flex flex-col items-center">
          {huntActive && (
            <div className="px-6 py-3 rounded-2xl bg-red-950/90 border-2 border-red-500 shadow-[0_0_40px_rgba(239,68,68,0.7)] animate-pulse flex items-center gap-3 text-white">
              <Flame className="w-7 h-7 text-red-500 animate-spin" />
              <div>
                <div className="text-base sm:text-lg font-black tracking-widest text-red-100 uppercase">
                  ⚠️ VADÁSZAT FOLYAMATBAN! ⚠️
                </div>
                <div className="text-xs text-red-300 font-medium">
                  Bújj el a szekrényekbe, kapcsold le a lámpád és maradj csendben!
                </div>
              </div>
            </div>
          )}

          {!huntActive && gracePeriodSeconds > 0 && (
            <div className="px-5 py-2.5 rounded-2xl bg-purple-950/80 border border-purple-500/50 shadow-lg backdrop-blur-md flex items-center gap-2.5 text-purple-200">
              <Clock className="w-4 h-4 text-purple-400 animate-spin" />
              <span className="text-xs font-bold uppercase tracking-wider">Felkészülési türelmi idő:</span>
              <span className="text-sm font-mono font-black text-white">
                {Math.floor(gracePeriodSeconds / 60)}:
                {String(Math.floor(gracePeriodSeconds % 60)).padStart(2, '0')}
              </span>
            </div>
          )}
        </div>

        {/* Top-Right: Electrical Breaker & Journal Button */}
        <div className="flex flex-col items-end gap-2">
          {/* Breaker status indicator */}
          <div className="px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md border border-gray-800 text-xs font-mono flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${breakerOn ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-red-500'}`} />
            <span className="text-gray-400">Biztosíték:</span>
            <span className={`font-bold ${breakerOn ? 'text-emerald-400' : 'text-red-400'}`}>
              {breakerOn ? `BE (${activeLightsCount}/${maxLightsCount})` : 'LECSAPVA'}
            </span>
          </div>

          {/* Quick Journal Key Helper */}
          <button
            onClick={onOpenJournal}
            className="pointer-events-auto px-3 py-2 rounded-xl bg-purple-900/40 hover:bg-purple-800/60 border border-purple-500/40 text-purple-200 text-xs font-bold transition flex items-center gap-2 shadow-lg cursor-pointer"
            title="Nyomozói jegyzőkönyv megnyitása"
          >
            <span>📖 Napló</span>
            <kbd className="px-1.5 py-0.5 rounded bg-black/60 border border-purple-400/40 text-[10px] font-mono">J</kbd>
          </button>
        </div>
      </div>

      {/* 3. CENTER SECTION: Reticle & Raycast Interaction Prompt */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {/* Center reticle */}
        {crosshairPrompt ? (
          <div className="relative flex flex-col items-center">
            {/* Interactive electric-blue ring */}
            <div className="w-6 h-6 rounded-full border-2 border-cyan-400 bg-cyan-400/20 shadow-[0_0_15px_#22d3ee] animate-ping" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white" />

            {/* Prompt tooltip */}
            <div className="mt-8 px-4 py-2 rounded-xl bg-black/85 backdrop-blur-md border border-cyan-500/60 shadow-2xl flex items-center gap-2 text-white">
              <kbd className="px-2 py-1 rounded-md bg-cyan-950 border border-cyan-400 text-cyan-300 font-mono font-black text-xs shadow">
                [{crosshairPrompt.key || 'E'}]
              </kbd>
              <div className="text-xs font-bold text-gray-100">{crosshairPrompt.action}</div>
              {crosshairPrompt.subText && (
                <div className="text-[11px] text-gray-400 border-l border-gray-700 pl-2">
                  {crosshairPrompt.subText}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Idle subtle crosshair dot */
          <div className="w-1.5 h-1.5 rounded-full bg-white/70 shadow-[0_0_4px_rgba(255,255,255,0.6)]" />
        )}
      </div>

      {/* 4. BOTTOM SECTION: 3-Slot Inventory Dock & Keybinding reminders */}
      <div className="relative w-full flex flex-col items-center gap-2">
        {/* 3-Slot Inventory Bar */}
        <div className="p-2 rounded-2xl bg-black/75 backdrop-blur-md border border-gray-800 shadow-2xl flex items-center gap-2.5">
          {[0, 1, 2].map((slotIndex) => {
            const item = inventory[slotIndex];
            const isActive = activeSlot === slotIndex;

            return (
              <div
                key={slotIndex}
                className={`relative w-20 sm:w-24 h-20 rounded-xl flex flex-col items-center justify-between p-2 transition-all border ${
                  isActive
                    ? 'bg-purple-950/60 border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.4)] scale-105'
                    : 'bg-[#121422]/90 border-gray-800 hover:border-gray-700'
                }`}
              >
                {/* Slot Number Badge */}
                <div className="w-full flex items-center justify-between text-[10px] font-mono">
                  <span className={`font-bold ${isActive ? 'text-purple-300' : 'text-gray-500'}`}>
                    [{slotIndex + 1}]
                  </span>
                  {item?.charges !== undefined && (
                    <span className="px-1 rounded bg-black/60 text-amber-300 font-bold">
                      {item.charges}x
                    </span>
                  )}
                </div>

                {/* Item Icon & Name */}
                {item ? (
                  <>
                    <span className="text-2xl filter drop-shadow">{item.icon || '📦'}</span>
                    <span className="text-[10px] font-bold text-gray-200 truncate w-full text-center">
                      {item.name}
                    </span>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-[10px] text-gray-600 font-mono">
                    Üres
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Quick controls reminder */}
        <div className="px-4 py-1.5 rounded-full bg-black/60 backdrop-blur-sm border border-gray-800/80 text-[11px] text-gray-400 font-mono flex items-center gap-3">
          <span><strong className="text-gray-200">[1, 2, 3]</strong> Tárgyhely</span>
          <span>•</span>
          <span><strong className="text-gray-200">[E]</strong> Használat</span>
          <span>•</span>
          <span><strong className="text-gray-200">[G]</strong> Eldobás</span>
          <span>•</span>
          <span><strong className="text-gray-200">[T]</strong> Lámpa</span>
          <span>•</span>
          <span><strong className="text-gray-200">[V]</strong> Rádió</span>
          <span>•</span>
          <span><strong className="text-purple-300">[J]</strong> Nyomozói Napló</span>
        </div>
      </div>
    </div>
  );
}
