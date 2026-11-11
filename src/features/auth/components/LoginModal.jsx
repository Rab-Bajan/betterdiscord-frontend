import React, { useState } from 'react';
import Avatar from '../../../shared/ui/Avatar';
import { User, Lock, Sparkles, LogIn, UserPlus, Shield, Eye, EyeOff } from 'lucide-react';

const AVATAR_COLORS = [
  '#7655F5', // SharkVoic Purple
  '#536CFF', // Indigo Blue
  '#28C997', // Emerald Green
  '#E94B64', // Crimson Red
  '#F5A623', // Amber Gold
  '#00D2D3', // Cyan
  '#FF7675', // Coral
  '#9B59B6'  // Purple
];

export default function LoginModal({ onLogin, authError }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'guest'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedColor, setSelectedColor] = useState(AVATAR_COLORS[0]);
  const [localError, setLocalError] = useState('');

  const displayError = authError || localError;

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) {
      setLocalError('Kérlek adj meg egy felhasználónevet!');
      return;
    }
    if (trimmed.length < 2 || trimmed.length > 24) {
      setLocalError('A név 2 és 24 karakter közötti legyen!');
      return;
    }

    if (mode === 'login') {
      if (!password) {
        setLocalError('Kérlek add meg a jelszót!');
        return;
      }
      onLogin({
        type: 'login',
        username: trimmed,
        password
      });
    } else if (mode === 'register') {
      if (!password || password.length < 4) {
        setLocalError('A jelszó legalább 4 karakter hosszú legyen!');
        return;
      }
      onLogin({
        type: 'register',
        username: trimmed,
        password,
        avatarColor: selectedColor
      });
    } else {
      // Guest
      onLogin({
        type: 'guest',
        username: trimmed,
        avatarColor: selectedColor
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 pt-safe pb-safe bg-black/60 backdrop-blur-md select-none">
      <div 
        className="p-6 sm:p-8 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto overflow-x-hidden bg-[#151832] border border-[#7655F5]/30 relative"
        style={{ boxShadow: '0 25px 60px rgba(9, 10, 24, 0.9), 0 0 40px rgba(118, 85, 245, 0.2)' }}
      >
        {/* Háttér fényeffekt */}
        <div className="absolute -top-16 -right-16 w-44 h-44 bg-[#7655F5]/15 rounded-full blur-3xl pointer-events-none" />

        {/* SharkVoic Logó Fejléc */}
        <div className="flex flex-col items-center mb-6">
          <div className="mb-3 flex items-center gap-3">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <path d="M5 32 L18 8 L22 20 L30 14 L35 32 Z" fill="#7655F5" opacity="0.9"/>
              <path d="M18 8 L22 20 L30 14" fill="none" stroke="#536CFF" strokeWidth="1.5"/>
              <ellipse cx="20" cy="30" rx="15" ry="3" fill="#536CFF" opacity="0.3"/>
            </svg>
            <div>
              <div className="text-2xl font-black tracking-tight text-[#F4F3FF]">SharkVoic</div>
              <div className="text-[11px] font-semibold text-[#999BBE]">Premium Voice & Chat Platform</div>
            </div>
          </div>

          {username.trim() ? (
            <div className="mb-2 rounded-full transition-all" style={{ boxShadow: `0 0 24px ${selectedColor}50` }}>
              <Avatar username={username.trim()} avatarColor={selectedColor} size="xl" />
            </div>
          ) : (
            <div
              className="w-[72px] h-[72px] rounded-full flex items-center justify-center text-white text-3xl font-black shadow-lg mb-2 transition-all border border-white/20"
              style={{ backgroundColor: selectedColor, boxShadow: `0 0 24px ${selectedColor}50` }}
            >
              🦈
            </div>
          )}
          
          <h2 className="text-xl font-bold text-[#F4F3FF]">
            {mode === 'login' ? 'Üdvözlünk újra!' : mode === 'register' ? 'Fiók Regisztráció' : 'Vendég Belépés'}
          </h2>
          <p className="text-xs text-[#999BBE] text-center mt-1">
            {mode === 'login' 
              ? 'Jelentkezz be a meglévő fiókoddal' 
              : mode === 'register' 
              ? 'Hozz létre egy biztonságos saját fiókot' 
              : 'Lépj be gyorsan jelszó nélkül'}
          </p>
        </div>

        {/* Módváltó fülek: Bejelentkezés | Regisztráció */}
        <div className="flex p-1 bg-[#101329] rounded-xl border border-[#7655F5]/20 mb-5">
          <button
            type="button"
            onClick={() => { setMode('login'); setLocalError(''); }}
            className={`flex-1 py-2.5 min-h-[40px] text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              mode === 'login' 
                ? 'bg-gradient-to-r from-[#7655F5] to-[#536CFF] text-white shadow' 
                : 'text-[#999BBE] hover:text-[#F4F3FF]'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Bejelentkezés</span>
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setLocalError(''); }}
            className={`flex-1 py-2.5 min-h-[40px] text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              mode === 'register' 
                ? 'bg-gradient-to-r from-[#7655F5] to-[#536CFF] text-white shadow' 
                : 'text-[#999BBE] hover:text-[#F4F3FF]'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Regisztráció</span>
          </button>
        </div>

        {/* Hibaüzenet */}
        {displayError && (
          <div className="mb-4 p-2.5 rounded-xl bg-[#E94B64]/15 border border-[#E94B64]/40 text-[#E94B64] text-xs font-semibold flex items-center gap-2" role="alert">
            <span>⚠️</span>
            <span className="min-w-0 break-words">{displayError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Felhasználónév */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-1.5 text-[#999BBE]">
              Felhasználónév <span className="text-[#E94B64]">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setLocalError('');
                }}
                placeholder="Pl. Alex, GamerGabi..."
                autoFocus
                className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-[#101329] border border-[#7655F5]/30 focus:border-[#7655F5] outline-none text-sm text-[#F4F3FF] font-medium transition"
              />
              <User className="absolute right-3 top-3 w-4 h-4 text-[#999BBE]" />
            </div>
          </div>

          {/* Jelszó (ha nem vendég) */}
          {mode !== 'guest' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1.5 text-[#999BBE]">
                Jelszó <span className="text-[#E94B64]">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setLocalError('');
                  }}
                  placeholder={mode === 'register' ? 'Legalább 4 karakter...' : 'Jelszavad...'}
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-[#101329] border border-[#7655F5]/30 focus:border-[#7655F5] outline-none text-sm text-[#F4F3FF] font-medium transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-1 top-0 h-full px-2.5 flex items-center text-[#999BBE] hover:text-white transition cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {/* Színválasztó (Regisztrációnál vagy vendégnél) */}
          {mode !== 'login' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1.5 text-[#999BBE]">
                Profil Szín
              </label>
              <div className="flex flex-wrap items-center gap-2.5 justify-center py-1">
                {AVATAR_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setSelectedColor(color)}
                    className={`w-8 h-8 rounded-full transition-transform cursor-pointer ${
                      selectedColor === color
                        ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-[#101329]'
                        : 'hover:scale-110 opacity-75 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Fő gomb */}
          <button
            type="submit"
            className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-[#7655F5] to-[#536CFF] hover:brightness-110 shadow-lg transition-all flex items-center justify-center gap-2 mt-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-[#F5B041]" />
            <span>
              {mode === 'login' ? 'Bejelentkezés' : mode === 'register' ? 'Fiók Létrehozása' : 'Belépés Vendégként'}
            </span>
          </button>

          {/* Vendég opció váltó */}
          <div className="text-center pt-2">
            {mode !== 'guest' ? (
              <button
                type="button"
                onClick={() => { setMode('guest'); setLocalError(''); }}
                className="text-xs text-[#999BBE] hover:text-[#7655F5] transition underline cursor-pointer"
              >
                Vagy folytatás jelszó nélkül (Vendégként)
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { setMode('login'); setLocalError(''); }}
                className="text-xs text-[#999BBE] hover:text-[#7655F5] transition underline cursor-pointer"
              >
                Vissza a jelszavas bejelentkezéshez
              </button>
            )}
          </div>
        </form>

        <div className="mt-5 text-center text-[11px] border-t border-[#7655F5]/15 pt-3 text-[#999BBE]/60 flex items-center justify-center gap-2">
          <Shield className="w-3.5 h-3.5 text-[#28C997]" />
          <span>Biztonságos kapcsolat és titkosított jelszavak</span>
        </div>
      </div>
    </div>
  );
}
