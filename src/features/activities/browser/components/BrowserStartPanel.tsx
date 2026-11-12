import React, { type FormEvent } from 'react';
import { Globe } from 'lucide-react';

const SUGGESTED_SITES = [
  { name: 'Wikipedia', url: 'https://en.wikipedia.org', icon: '📖' },
  { name: 'GitHub', url: 'https://github.com', icon: '🐙' },
  { name: 'Hacker News', url: 'https://news.ycombinator.com', icon: '⚡' },
  { name: 'DuckDuckGo', url: 'https://duckduckgo.com', icon: '🦆' },
  { name: 'Reddit', url: 'https://old.reddit.com', icon: '🤖' }
];

interface BrowserStartPanelProps {
  addressInput: string;
  setAddressInput: (value: string) => void;
  onAddressSubmit: (e: FormEvent) => void;
  isStarting: boolean;
  onStartSession: (url?: string) => void;
}

// Kezdőképernyő: még nem indult böngésző
export default function BrowserStartPanel({ addressInput, setAddressInput, onAddressSubmit, isStarting, onStartSession }: BrowserStartPanelProps) {
  return (
    /* Kezdőképernyő: még nem indult böngésző */
    <div className="max-w-xl w-full min-h-0 overflow-y-auto p-6 sm:p-8 flex flex-col items-center text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-xl"
        style={{
          background: 'linear-gradient(135deg, rgba(118, 85, 245, 0.2), rgba(83, 108, 255, 0.2))',
          border: '1px solid rgba(125, 105, 255, 0.3)'
        }}
      >
        <Globe className="w-8 h-8 text-[#7655F5]" />
      </div>

      <h2 className="text-xl sm:text-2xl font-bold mb-2 text-[#F4F3FF]">
        Közös Böngésző (Shared Browser)
      </h2>
      <p className="text-xs sm:text-sm text-[#999BBE] mb-6 max-w-md">
        Böngésszetek együtt bármilyen nyilvános weboldalt valós időben! Mindenki ugyanazt látja, és közösen irányíthatjátok.
      </p>

      {/* Kezdő URL mező */}
      <form onSubmit={onAddressSubmit} className="w-full mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            placeholder="https://en.wikipedia.org"
            className="flex-1 min-w-0 px-4 py-3 rounded-xl text-sm font-medium outline-none transition"
            style={{
              background: '#151832',
              color: '#F4F3FF',
              border: '1px solid rgba(125, 105, 255, 0.25)'
            }}
          />
          <button
            type="submit"
            disabled={isStarting}
            className="flex-shrink-0 px-4 sm:px-6 py-3 rounded-xl font-bold text-sm text-white shadow-lg transition active:scale-95 disabled:opacity-60"
            style={{
              background: 'linear-gradient(135deg, #7655F5, #536CFF)'
            }}
          >
            {isStarting ? 'Indítás...' : 'Indítás'}
          </button>
        </div>
      </form>

      {/* Ajánlott weboldalak */}
      <div className="w-full">
        <p className="text-xs font-semibold text-[#999BBE] uppercase tracking-wider mb-3">
          Gyors indítás
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {SUGGESTED_SITES.map((site) => (
            <button
              key={site.name}
              disabled={isStarting}
              onClick={() => {
                setAddressInput(site.url);
                onStartSession(site.url);
              }}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition hover:scale-105"
              style={{
                background: '#151832',
                color: '#F4F3FF',
                border: '1px solid rgba(125, 105, 255, 0.15)'
              }}
            >
              <span>{site.icon}</span>
              <span>{site.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
