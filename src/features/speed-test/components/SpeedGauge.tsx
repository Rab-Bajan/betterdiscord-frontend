import React from 'react';
import { Wifi } from 'lucide-react';
import type { SpeedTestState } from '../lib/SpeedTestRunner';

interface SpeedGaugeProps {
  testState: SpeedTestState;
  progress: number;
  currentSpeed: number;
  downloadResult: number | null;
}

// Kör alakú sebességmérő (Speedometer Gauge): haladás a körön, középen az aktuális érték
export default function SpeedGauge({ testState, progress, currentSpeed, downloadResult }: SpeedGaugeProps) {
  return (
    <div className="relative w-48 h-48 my-2 flex flex-col items-center justify-center">
      <svg className="w-full h-full transform -rotate-90">
        <circle
          cx="96"
          cy="96"
          r="80"
          stroke="#1B2040"
          strokeWidth="12"
          fill="transparent"
        />
        <circle
          cx="96"
          cy="96"
          r="80"
          stroke="#7655F5"
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
            <Wifi className="w-10 h-10 mb-1" style={{ color: '#7655F5' }} />
            <span className="text-xs font-medium" style={{ color: '#999BBE' }}>Készen áll</span>
          </>
        ) : testState === 'completed' ? (
          <>
            <span className="text-3xl font-extrabold text-white tracking-tight">
              {downloadResult}
            </span>
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#28C997' }}>
              Mbps DL
            </span>
          </>
        ) : (
          <>
            <span className="text-3xl font-extrabold text-white tracking-tight">
              {currentSpeed > 0 ? currentSpeed : '...'}
            </span>
            <span className="text-xs font-bold uppercase tracking-wider animate-pulse" style={{ color: '#7655F5' }}>
              {testState === 'ping' ? 'Pingelés...' : 'Mbps'}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
