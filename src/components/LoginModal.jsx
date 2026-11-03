import React, { useState } from 'react';
import { User, Sparkles, Headphones } from 'lucide-react';

const AVATAR_COLORS = [
  '#5865F2', // Blurple
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(9, 10, 24, 0.95)', backdropFilter: 'blur(12px)' }}>
      <div className="p-8 rounded-2xl shadow-2xl max-w-md w-full" style={{ background: '#101329', border: '1px solid rgba(125, 105, 255, 0.25)' }}>
        {/* SharkVoic Logo */}
        <div className="flex flex-col items-center mb-8">
          {/* Shark fin SVG logo */}
          <div className="mb-4 flex items-center gap-3">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <path d="M5 32 L18 8 L22 20 L30 14 L35 32 Z" fill="#7655F5" opacity="0.9"/>
              <path d="M18 8 L22 20 L30 14" fill="none" stroke="#536CFF" strokeWidth="1.5"/>
              <ellipse cx="20" cy="30" rx="15" ry="3" fill="#536CFF" opacity="0.3"/>
            </svg>
            <div>
              <div className="text-2xl font-black tracking-tight" style={{ color: '#F4F3FF' }}>SharkVoic</div>
              <div className="text-xs font-medium" style={{ color: '#999BBE' }}>Premium Voice Platform</div>
            </div>
          </div>
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center text-white text-3xl font-bold shadow-lg mb-4 transition-all"
            style={{ backgroundColor: selectedColor, boxShadow: `0 0 24px ${selectedColor}40` }}
          >
            {username.trim() ? username.trim().charAt(0).toUpperCase() : <Headphones className="w-10 h-10" />}
          </div>
          <h2 className="text-2xl font-bold" style={{ color: '#F4F3FF' }}>Üdvözlünk újra!</h2>
          <p className="text-sm text-center mt-1" style={{ color: '#999BBE' }}>
            Csatlakozz a csevegéshez és VoIP hangcsatornákhoz
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#999BBE' }}>
              Felhasználónév <span style={{ color: '#E94B64' }}>*</span>
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
                className="w-full px-4 py-3 rounded-xl outline-none text-sm font-medium transition-all"
                style={{
                  background: '#151832',
                  color: '#F4F3FF',
                  border: '1px solid rgba(125, 105, 255, 0.2)',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(118, 85, 245, 0.6)'}
                onBlur={e => e.target.style.borderColor = 'rgba(125, 105, 255, 0.2)'}
              />
              <User className="absolute right-3 top-3.5 w-4 h-4" style={{ color: '#999BBE' }} />
            </div>
            {error && (
              <p className="text-xs mt-1.5 font-medium" style={{ color: '#E94B64' }}>{error}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#999BBE' }}>
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
                      ? 'scale-125'
                      : 'hover:scale-110 opacity-80 hover:opacity-100'
                  }`}
                  style={{
                    backgroundColor: color,
                    ...(selectedColor === color ? { boxShadow: `0 0 0 2px #101329, 0 0 0 4px ${color}` } : {})
                  }}
                />
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all shadow-lg flex items-center justify-center gap-2 mt-2 text-white"
            style={{ background: 'linear-gradient(135deg, #7655F5, #536CFF)', boxShadow: '0 4px 20px rgba(118, 85, 245, 0.35)' }}
            onMouseOver={e => e.currentTarget.style.opacity = '0.9'}
            onMouseOut={e => e.currentTarget.style.opacity = '1'}
          >
            <Sparkles className="w-4 h-4" />
            Belépés a SharkVoic-ba
          </button>
        </form>

        <div className="mt-6 text-center text-xs border-t pt-4" style={{ color: 'rgba(153, 155, 190, 0.5)', borderColor: 'rgba(125, 105, 255, 0.12)' }}>
          Node.js • Express • WebRTC VoIP • React + Tailwind
        </div>
      </div>
    </div>
  );
}
