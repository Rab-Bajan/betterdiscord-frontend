import React from 'react';
import { Link, Sparkles } from 'lucide-react';

interface WatchPartyStartPanelProps {
  inputUrl: string;
  setInputUrl: (url: string) => void;
  onStartMedia: (overrideUrl?: string, overrideTitle?: string) => void;
}

// Nincs futó közös nézés: link megadása vagy ajánlott videó indítása
export default function WatchPartyStartPanel({ inputUrl, setInputUrl, onStartMedia }: WatchPartyStartPanelProps) {
  return (
    /* KEZDŐ INDÍTÓ KÉPERNYŐ */
    <div className="flex-1 min-h-0 flex flex-col items-center [justify-content:safe_center] p-6 text-center relative overflow-y-auto bg-[#090A18]">
      <div className="max-w-xl w-full flex flex-col items-center gap-6 p-8 rounded-3xl bg-[#151832]/95 border border-[#7655F5]/20 shadow-2xl backdrop-blur-2xl">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-[#E94B64] to-[#c93a52] flex items-center justify-center text-4xl shadow-xl shadow-[#E94B64]/30 border border-white/20 animate-pulse">
          🔴
        </div>

        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#F4F3FF] to-[#999BBE] tracking-wide">
            YOUTUBE WATCH TOGETHER
          </h2>
          <p className="text-[#999BBE] text-xs sm:text-sm mt-1 max-w-md">
            Nézzetek YouTube videókat és klipeket szinkronban a hangcsatorna tagjaival! Bárki indíthatja vagy megállíthatja a videót.
          </p>
        </div>

        {/* URL Beviteli Mező */}
        <div className="w-full space-y-3">
          <div className="flex items-center bg-[#1B2040] border-2 border-[#7655F5]/30 focus-within:border-[#7655F5]/60 rounded-xl px-3 py-2.5 transition">
            <Link className="w-4 h-4 text-[#E94B64] mr-2 flex-shrink-0" />
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onStartMedia()}
              placeholder="Illeszd be a YouTube videó linkjét (pl. https://www.youtube.com/watch?v=...)"
              className="bg-transparent text-sm text-[#F4F3FF] placeholder-[#999BBE] focus:outline-none flex-1"
            />
          </div>

          <button
            onClick={() => onStartMedia()}
            className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-[#E94B64] to-[#c93a52] hover:brightness-110 text-white font-extrabold text-sm tracking-wide shadow-xl shadow-[#E94B64]/30 transform active:scale-[0.99] transition flex items-center justify-center gap-2 border border-white/20"
          >
            <Sparkles className="w-4 h-4" />
            <span>KÖZÖS LEJÁTSZÁS INDÍTÁSA (1 KATTINTÁS)</span>
          </button>
        </div>

        {/* Ajánlott Gyorsindítók */}
        <div className="w-full space-y-2 pt-2 border-t border-white/10 text-left">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#999BBE]">
            Népszerű YouTube Videók:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <button
              onClick={() =>
                onStartMedia('https://www.youtube.com/watch?v=jfKfPfyJRdk', 'Lofi Girl 24/7 Relax')
              }
              className="p-2.5 rounded-xl bg-[#1B2040] hover:bg-[#242b50] border border-white/5 flex items-center gap-2 text-left transition"
            >
              <span className="text-xl">🎧</span>
              <div className="truncate">
                <strong className="text-white block truncate">Lofi Hip Hop Radio</strong>
                <span className="text-[10px] text-[#999BBE]">24/7 Relax & Study Beats</span>
              </div>
            </button>
            <button
              onClick={() =>
                onStartMedia('https://www.youtube.com/watch?v=aqz-KE-bpKQ', 'Big Buck Bunny 4K')
              }
              className="p-2.5 rounded-xl bg-[#1B2040] hover:bg-[#242b50] border border-white/5 flex items-center gap-2 text-left transition"
            >
              <span className="text-xl">🐰</span>
              <div className="truncate">
                <strong className="text-white block truncate">Big Buck Bunny (4K)</strong>
                <span className="text-[10px] text-[#999BBE]">Animációs rövidfilm</span>
              </div>
            </button>
            <button
              onClick={() =>
                onStartMedia('https://www.youtube.com/watch?v=4xDzrJKXOOY', 'Synthwave Radio Chill')
              }
              className="p-2.5 rounded-xl bg-[#1B2040] hover:bg-[#242b50] border border-white/5 flex items-center gap-2 text-left transition"
            >
              <span className="text-xl">🌆</span>
              <div className="truncate">
                <strong className="text-white block truncate">Synthwave Radio</strong>
                <span className="text-[10px] text-[#999BBE]">Cyberpunk Retro Beats</span>
              </div>
            </button>
            <button
              onClick={() =>
                onStartMedia('https://www.youtube.com/watch?v=TcMBFSGVi1c', 'Marvel Avengers Trailer')
              }
              className="p-2.5 rounded-xl bg-[#1B2040] hover:bg-[#242b50] border border-white/5 flex items-center gap-2 text-left transition"
            >
              <span className="text-xl">🎬</span>
              <div className="truncate">
                <strong className="text-white block truncate">Avengers: Endgame Trailer</strong>
                <span className="text-[10px] text-[#999BBE]">Hivatalos filmelőzetes</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
