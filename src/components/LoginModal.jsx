import React, { useState } from 'react';
import { User, Sparkles, Headphones } from 'lucide-react';

const AVATAR_COLORS = [
  '#5865F2', // Discord Blurple
  '#57F287', // Green
  '#FEE75C', // Yellow
  '#EB459E', // Fuchsia
  '#ED4245', // Red
  '#3BA55D', // Emerald
  '#00A8FC', // Sky
  '#9B59B6'  // Purple
];

export default function LoginModal({ onLogin }) {
  const [username, setUsername] = useState('');
  const [selectedColor, setSelectedColor] = useState(AVATAR_COLORS[0]);
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) {
      setError('Kérlek adj meg egy felhasználónevet!');
      return;
    }
    if (trimmed.length < 2 || trimmed.length > 24) {
      setError('A név 2 és 24 karakter közötti legyen!');
      return;
    }
    onLogin({ username: trimmed, avatarColor: selectedColor });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-discord-darker border border-discord-dark p-8 rounded-xl shadow-2xl max-w-md w-full">
        {/* Discord logo icon */}
        <div className="flex flex-col items-center mb-6">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center text-white text-3xl font-bold shadow-lg mb-4 transition-all"
            style={{ backgroundColor: selectedColor }}
          >
            {username.trim() ? username.trim().charAt(0).toUpperCase() : <Headphones className="w-10 h-10" />}
          </div>
          <h2 className="text-2xl font-bold text-discord-textHeader">Üdvözlünk újra!</h2>
          <p className="text-discord-textMuted text-sm text-center mt-1">
            Csatlakozz a csevegéshez és VoIP hangcsatornákhoz
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-discord-textMuted mb-2">
              Felhasználónév <span className="text-discord-red">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Pl. Alex, GamerGabi..."
                autoFocus
                className="w-full bg-discord-darkest text-discord-textHeader placeholder-discord-textMuted/50 px-4 py-3 rounded-md outline-none border border-transparent focus:border-discord-primary transition text-sm font-medium"
              />
              <User className="absolute right-3 top-3.5 w-4 h-4 text-discord-textMuted" />
            </div>
            {error && (
              <p className="text-discord-red text-xs mt-1.5 font-medium">{error}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-discord-textMuted mb-2">
              Profil színe
            </label>
            <div className="flex items-center gap-2.5 justify-center py-2">
              {AVATAR_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={`w-8 h-8 rounded-full transition-transform ${
                    selectedColor === color
                      ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-discord-darker'
                      : 'hover:scale-110 opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-discord-primary hover:bg-discord-primaryHover active:scale-[0.99] text-white py-3 px-4 rounded-md font-semibold text-sm transition-all shadow-md flex items-center justify-center gap-2 mt-2"
          >
            <Sparkles className="w-4 h-4" />
            Belépés a Szerverre
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-discord-textMuted/70 border-t border-discord-dark pt-4">
          Node.js • Express • WebRTC VoIP • React + Tailwind
        </div>
      </div>
    </div>
  );
}
