import React, { useState, useRef, type FormEvent } from 'react';
import Avatar from '../../../shared/ui/Avatar';
import { 
  X, 
  Upload, 
  Link as LinkIcon, 
  Check, 
  User, 
  Sparkles, 
  Camera, 
  Palette,
  Image as ImageIcon
} from 'lucide-react';
import type { CurrentUser } from '../../../shared/types';
import { avatarFileError, uploadAvatar } from '../lib/avatarUpload';
import type { ProfileUpdate } from '../types';

const DEFAULT_AVATAR_COLOR = '#7655F5';

const PRESET_COLORS = [
  DEFAULT_AVATAR_COLOR, // SharkVoic Purple
  '#536CFF', // Indigo Blue
  '#28C997', // Emerald Mint
  '#E94B64', // Crimson Danger
  '#F5A623', // Amber Gold
  '#00D2D3', // Cyan
  '#FF7675', // Coral
  '#6C5CE7'  // Violet
];

// Menő SVG vagy beépített avatár minták
const PRESET_AVATARS = [
  { id: 'shark', name: 'Cápa', emoji: '🦈' },
  { id: 'gaming', name: 'Gamer', emoji: '🎮' },
  { id: 'cyber', name: 'Cyber', emoji: '👾' },
  { id: 'fire', name: 'Láng', emoji: '🔥' },
  { id: 'lightning', name: 'Villám', emoji: '⚡' },
  { id: 'crown', name: 'Király', emoji: '👑' },
  { id: 'dj', name: 'DJ', emoji: '🎧' },
  { id: 'ninja', name: 'Ninja', emoji: '🥷' }
];

interface EditProfileModalProps {
  currentUser: CurrentUser | null;
  onSave: (update: ProfileUpdate) => void;
  onClose: () => void;
  error: string | null;
}

export default function EditProfileModal({
  currentUser,
  onSave,
  onClose,
  error
}: EditProfileModalProps) {
  const [username, setUsername] = useState(currentUser?.username || '');
  const [avatarColor, setAvatarColor] = useState(currentUser?.avatarColor || DEFAULT_AVATAR_COLOR);
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatarUrl || '');
  const [selectedEmoji, setSelectedEmoji] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [localError, setLocalError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Képfájl feltöltése a szerverre
  const handleFileUpload = async (file: File) => {
    const invalid = avatarFileError(file);
    if (invalid) {
      setLocalError(invalid);
      return;
    }

    setIsUploading(true);
    setLocalError('');
    const result = await uploadAvatar(file);
    if (result.ok) {
      setAvatarUrl(result.url ?? '');
      setSelectedEmoji('');
    } else {
      setLocalError(result.error);
    }
    setIsUploading(false);
  };

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    const cleanName = username.trim();
    if (!cleanName || cleanName.length < 2 || cleanName.length > 24) {
      setLocalError('A felhasználónév 2 és 24 karakter közötti legyen!');
      return;
    }

    onSave({
      username: cleanName,
      avatarColor,
      avatarUrl: avatarUrl.trim() || null
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 pt-safe pb-safe bg-black/60 backdrop-blur-md select-none">
      <div 
        className="w-full max-w-lg bg-[#101329] border border-[#7655F5]/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        style={{ boxShadow: '0 25px 60px rgba(9, 10, 24, 0.8), 0 0 35px rgba(118, 85, 245, 0.2)' }}
      >
        {/* Fejléc */}
        <div className="px-4 sm:px-6 py-4 border-b border-[#7655F5]/20 flex items-center justify-between bg-[#151832]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg flex-shrink-0 bg-gradient-to-tr from-[#7655F5] to-[#536CFF] flex items-center justify-center text-white">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#F4F3FF]">Profil Szerkesztése</h2>
              <p className="text-xs text-[#999BBE]">Módosítsd a megjelenített neved és profilképed</p>
            </div>
          </div>
          <button
            onClick={onClose}
            title="Bezárás"
            className="p-2 rounded-xl flex-shrink-0 text-[#999BBE] hover:text-white hover:bg-[#1B2040] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Űrlap törzs */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {(error || localError) && (
            <div role="alert" className="p-3 rounded-xl bg-[#E94B64]/15 border border-[#E94B64]/40 text-[#E94B64] text-xs font-semibold flex items-center gap-2">
              <span>⚠️</span>
              <span className="min-w-0 break-words">{error || localError}</span>
            </div>
          )}

          {/* Profil Előnézet Kártya */}
          <div className="p-3 sm:p-4 rounded-xl bg-[#151832] border border-[#7655F5]/20 flex items-center gap-3 sm:gap-4">
            <div className="relative group flex-shrink-0">
              {!avatarUrl && selectedEmoji ? (
                <div
                  className="w-[104px] h-[104px] rounded-full flex items-center justify-center shadow-xl border-2 border-[#7655F5]/40"
                  style={{ backgroundColor: avatarColor }}
                >
                  <span className="text-5xl">{selectedEmoji}</span>
                </div>
              ) : (
                <Avatar
                  username={username.trim() || '?'}
                  avatarUrl={avatarUrl}
                  avatarColor={avatarColor}
                  size="2xl"
                  className="shadow-xl"
                />
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Kép feltöltése"
                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 focus:opacity-100 rounded-full flex flex-col items-center justify-center text-white text-[10px] font-bold transition-opacity cursor-pointer"
              >
                <Camera className="w-4 h-4 mb-0.5" />
                Csere
              </button>
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-[#999BBE] uppercase tracking-wider mb-0.5">Előnézet</div>
              <div className="text-lg font-bold text-[#F4F3FF] truncate">
                {username.trim() || 'Felhasználónév'}
              </div>
              <div className="text-xs text-[#28C997] flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-[#28C997] animate-pulse" />
                <span>Online a SharkVoic-on</span>
              </div>
            </div>
          </div>

          {/* 1. Megjelenített Név */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#999BBE] mb-2">
              Felhasználónév <span className="text-[#E94B64]">*</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setLocalError('');
              }}
              placeholder="Pl. Alex, Bence..."
              className="w-full px-4 py-2.5 rounded-xl bg-[#101329] border border-[#7655F5]/30 focus:border-[#7655F5] outline-none text-sm text-[#F4F3FF] font-medium transition"
            />
          </div>

          {/* 2. Avatár Színválasztó */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#999BBE] mb-2 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-[#7655F5]" />
              Profil Szín
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {PRESET_COLORS.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setAvatarColor(col)}
                  className={`h-9 rounded-xl transition-transform flex items-center justify-center shadow-md cursor-pointer ${
                    avatarColor === col ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-[#101329]' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: col }}
                >
                  {avatarColor === col && <Check className="w-4 h-4 text-white drop-shadow" />}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Menő Avatár Emojik */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#999BBE] mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#F5B041]" />
              Gyors Avatár Ikonok
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {PRESET_AVATARS.map((av) => (
                <button
                  key={av.id}
                  type="button"
                  onClick={() => {
                    setSelectedEmoji(av.emoji);
                    setAvatarUrl('');
                  }}
                  title={av.name}
                  className={`h-10 rounded-xl bg-[#101329] border text-xl flex items-center justify-center transition-all cursor-pointer ${
                    selectedEmoji === av.emoji && !avatarUrl
                      ? 'border-[#7655F5] bg-[#7655F5]/20 scale-105'
                      : 'border-[#7655F5]/20 hover:bg-[#1B2040]'
                  }`}
                >
                  <span>{av.emoji}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 4. Egyedi Kép Feltöltése vagy Kép URL */}
          <div className="space-y-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#999BBE] flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-[#536CFF]" />
              Saját Profilkép Feltöltése vagy Kép URL
            </label>

            {/* Fájl feltöltés gomb és dropzone */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileUpload(file);
              }}
            />

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <button
                type="button"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="w-full sm:w-auto px-4 py-2.5 min-h-[40px] rounded-xl bg-[#1B2040] hover:bg-[#242b50] border border-dashed border-[#7655F5]/50 text-xs font-bold text-[#F4F3FF] transition flex items-center justify-center gap-2 cursor-pointer flex-shrink-0"
              >
                <Upload className="w-4 h-4 text-[#7655F5]" />
                <span>{isUploading ? 'Feltöltés...' : 'Kép tallózása a gépről'}</span>
              </button>

              <div className="w-full flex-1 relative">
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => {
                    setAvatarUrl(e.target.value);
                    if (e.target.value) setSelectedEmoji('');
                  }}
                  placeholder="Vagy illessz be egy kép URL-t..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#101329] border border-[#7655F5]/20 focus:border-[#7655F5] outline-none text-xs text-[#F4F3FF] transition"
                />
                <LinkIcon className="w-3.5 h-3.5 text-[#999BBE] absolute left-3 top-3" />
              </div>
            </div>

            {avatarUrl && (
              <div className="flex items-center justify-between gap-2 text-xs text-[#28C997] bg-[#28C997]/10 px-3 py-2 rounded-lg border border-[#28C997]/20">
                <span>Egyedi kép beállítva!</span>
                <button
                  type="button"
                  onClick={() => setAvatarUrl('')}
                  className="text-xs text-[#E94B64] hover:underline cursor-pointer flex-shrink-0"
                >
                  Kép eltávolítása
                </button>
              </div>
            )}
          </div>

          {/* Gombok */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#7655F5]/20">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 min-h-[40px] rounded-xl text-xs font-semibold bg-[#1B2040] hover:bg-[#242b50] text-[#999BBE] hover:text-white transition cursor-pointer"
            >
              Mégse
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 min-h-[40px] rounded-xl text-xs font-bold bg-gradient-to-r from-[#7655F5] to-[#536CFF] hover:brightness-110 text-white shadow-lg transition cursor-pointer"
            >
              Módosítások mentése
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
