import React from 'react';
import { Ghost, Eye, Navigation, Wind, Activity, Users } from 'lucide-react';

export default function SpectatorView({
  aliveTeammates = [],
  spectatorTarget = null,
  onCycleTarget
}) {
  return (
    <div className="absolute inset-0 pointer-events-none select-none z-30 flex flex-col justify-between p-6 overflow-hidden">
      {/* 1. Ethereal Blue Ghostly Overlay Filter */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at center, rgba(0, 34, 68, 0.4) 30%, rgba(2, 18, 43, 0.85) 90%, rgba(1, 9, 24, 0.95) 100%)',
          boxShadow: 'inset 0 0 120px rgba(0, 140, 255, 0.35)',
        }}
      />

      {/* Ghostly Scanlines effect */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 255, 255, 0.25) 50%)',
          backgroundSize: '100% 4px',
        }}
      />

      {/* 2. Top Header: Spectator Status Banner */}
      <div className="relative w-full flex items-center justify-between">
        <div className="flex items-center gap-3 p-3.5 px-5 rounded-2xl bg-[#001733]/85 backdrop-blur-md border border-cyan-500/40 shadow-[0_0_30px_rgba(6,182,212,0.25)]">
          <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-400/50 flex items-center justify-center text-cyan-300 shadow">
            <Ghost className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="text-sm sm:text-base font-black tracking-wider text-cyan-200 uppercase flex items-center gap-2">
              <span>ELESTÉL A MÉH TELEPEN</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-900/60 text-cyan-300 font-mono">
                SZELLEM MÓD
              </span>
            </div>
            <p className="text-xs text-cyan-300/80 font-medium">
              Eltávoztál az élők sorából – szellemként segédkezhetsz a megmaradt nyomozóknak!
            </p>
          </div>
        </div>

        {/* Teammates Alive Count */}
        <div className="flex items-center gap-2 p-3 px-4 rounded-2xl bg-[#001733]/85 backdrop-blur-md border border-cyan-500/30 text-xs font-mono text-cyan-300">
          <Users className="w-4 h-4 text-cyan-400" />
          <span>Életben maradt csapattársak:</span>
          <span className="font-bold text-white text-sm bg-cyan-950 px-2 py-0.5 rounded-lg border border-cyan-600/50">
            {aliveTeammates.length}
          </span>
        </div>
      </div>

      {/* 3. Center Crosshair for Prop Interaction */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative flex flex-col items-center">
          <div className="w-4 h-4 rounded-full border border-cyan-400/60 flex items-center justify-center">
            <div className="w-1 h-1 rounded-full bg-cyan-300 shadow-[0_0_8px_#22d3ee]" />
          </div>
          <div className="mt-4 px-3 py-1 rounded-lg bg-[#001229]/90 border border-cyan-500/40 text-[11px] text-cyan-200 font-mono flex items-center gap-1.5 shadow-lg">
            <kbd className="px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-400 text-cyan-300 font-bold">
              [E]
            </kbd>
            <span>Könnyű tárgy meglökése (0.5 m/s lökés a többiek figyelmeztetésére)</span>
          </div>
        </div>
      </div>

      {/* 4. Bottom Section: Controls & Surviving Teammates Tracker */}
      <div className="relative w-full flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Controls Guide */}
        <div className="p-3 px-5 rounded-2xl bg-[#001733]/80 backdrop-blur-md border border-cyan-500/30 text-xs text-cyan-200/90 font-mono space-y-1">
          <div className="font-bold text-cyan-300 text-[11px] uppercase tracking-wider flex items-center gap-1.5 mb-1">
            <Wind className="w-3.5 h-3.5" />
            Szellem Navigáció & Irányítás:
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span><strong className="text-white">[WASD]</strong> Szabad repülés falakon át</span>
            <span><strong className="text-white">[Space]</strong> Felfelé</span>
            <span><strong className="text-white">[Shift]</strong> Lefelé</span>
          </div>
        </div>

        {/* Surviving Teammates List */}
        {aliveTeammates.length > 0 && (
          <div className="p-3 px-4 rounded-2xl bg-[#001733]/80 backdrop-blur-md border border-cyan-500/30 text-xs text-cyan-200 flex items-center gap-3">
            <span className="font-bold text-cyan-300 flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" /> Megfigyelés:
            </span>
            <div className="flex items-center gap-2">
              {aliveTeammates.map((teammate) => (
                <div
                  key={teammate.id || teammate.username}
                  className="px-2.5 py-1 rounded-xl bg-cyan-950/70 border border-cyan-600/40 flex items-center gap-2"
                >
                  <span className="font-bold text-white text-[11px]">
                    {teammate.username || teammate.name || 'Nyomozó'}
                  </span>
                  {teammate.sanity !== undefined && (
                    <span className="text-[10px] font-mono text-emerald-300">
                      {Math.round(teammate.sanity)}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
