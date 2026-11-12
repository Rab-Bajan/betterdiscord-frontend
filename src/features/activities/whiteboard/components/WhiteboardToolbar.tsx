import React from 'react';
import { Paintbrush, Eraser, Minus, Square, Circle, Check, Palette } from 'lucide-react';
import type { WhiteboardTool } from '../lib/strokes';

const PRESET_COLORS = [
  '#000000',
  '#ffffff',
  '#5865F2', // Discord blurple
  '#22c55e', // green
  '#ef4444', // red
  '#eab308', // yellow
  '#f97316', // orange
  '#a855f7', // purple
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#64748b'  // slate
];

const PRESET_SIZES = [
  { label: 'Vékony', size: 3 },
  { label: 'Közepes', size: 8 },
  { label: 'Vastag', size: 18 },
  { label: 'Extra', size: 32 }
];

interface WhiteboardToolbarProps {
  tool: WhiteboardTool;
  setTool: (tool: WhiteboardTool) => void;
  color: string;
  setColor: (color: string) => void;
  size: number;
  setSize: (size: number) => void;
}

// Paint eszköztár: eszközök, színpaletta, vonalvastagság
export default function WhiteboardToolbar({ tool, setTool, color, setColor, size, setSize }: WhiteboardToolbarProps) {
  return (
    <div className="bg-shark-panel/95 border-b border-shark-card px-3 sm:px-4 py-2 flex items-center justify-between gap-3 sm:gap-4 flex-nowrap overflow-x-auto scrollbar-none sm:flex-wrap sm:overflow-visible z-10 shadow">
      {/* Eszközök: Ecset, Radír, Vonal, Téglalap, Kör */}
      <div className="flex items-center gap-1 bg-shark-bg/70 p-1 rounded-lg flex-shrink-0">
        <button
          type="button"
          onClick={() => setTool('brush')}
          title="Szabadkézi Ecset"
          className={`p-2 rounded-md transition ${
            tool === 'brush' ? 'bg-shark-purple text-white shadow' : 'text-shark-muted hover:text-white'
          }`}
        >
          <Paintbrush className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => setTool('eraser')}
          title="Radír"
          className={`p-2 rounded-md transition ${
            tool === 'eraser' ? 'bg-shark-purple text-white shadow' : 'text-shark-muted hover:text-white'
          }`}
        >
          <Eraser className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => setTool('line')}
          title="Egyenes vonal"
          className={`p-2 rounded-md transition ${
            tool === 'line' ? 'bg-shark-purple text-white shadow' : 'text-shark-muted hover:text-white'
          }`}
        >
          <Minus className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => setTool('rect')}
          title="Téglalap"
          className={`p-2 rounded-md transition ${
            tool === 'rect' ? 'bg-shark-purple text-white shadow' : 'text-shark-muted hover:text-white'
          }`}
        >
          <Square className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => setTool('circle')}
          title="Kör"
          className={`p-2 rounded-md transition ${
            tool === 'circle' ? 'bg-shark-purple text-white shadow' : 'text-shark-muted hover:text-white'
          }`}
        >
          <Circle className="w-4 h-4" />
        </button>
      </div>

      {/* Színpaletta */}
      <div className="flex items-center gap-1.5 flex-nowrap sm:flex-wrap flex-shrink-0">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              setColor(c);
              if (tool === 'eraser') setTool('brush');
            }}
            className={`w-6 h-6 rounded-full transition-transform border border-black/40 flex items-center justify-center ${
              color === c && tool !== 'eraser'
                ? 'scale-125 ring-2 ring-white ring-offset-1 ring-offset-shark-card'
                : 'hover:scale-110 opacity-90'
            }`}
            style={{ backgroundColor: c }}
          >
            {color === c && tool !== 'eraser' && (
              <Check className={`w-3 h-3 ${c === '#ffffff' || c === '#eab308' ? 'text-black' : 'text-white'}`} />
            )}
          </button>
        ))}

        {/* Egyedi színválasztó */}
        <label className="relative cursor-pointer flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-tr from-shark-red via-shark-purple to-shark-blue border border-white/30 hover:scale-110 transition-transform">
          <input
            type="color"
            value={color}
            onChange={(e) => {
              setColor(e.target.value);
              if (tool === 'eraser') setTool('brush');
            }}
            className="opacity-0 absolute inset-0 cursor-pointer w-full h-full"
            title="Egyedi szín választása"
          />
          <Palette className="w-3 h-3 text-white pointer-events-none" />
        </label>
      </div>

      {/* Vonal vastagság választó */}
      <div className="flex items-center gap-1 bg-shark-bg/70 px-2 py-1 rounded-lg flex-shrink-0">
        {PRESET_SIZES.map((s) => (
          <button
            key={s.size}
            type="button"
            onClick={() => setSize(s.size)}
            title={`${s.label} (${s.size}px)`}
            className={`px-2 py-1 text-xs rounded transition font-medium ${
              size === s.size
                ? 'bg-shark-elevated text-white font-bold'
                : 'text-shark-muted hover:text-white'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
