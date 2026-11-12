import React, { type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Gamepad2, Keyboard, Lock, Maximize2, Minimize2, Power, RotateCcw, RotateCw, Users } from 'lucide-react';
import type { BrowserControlMode, BrowserSession } from '../types';

interface BrowserToolbarProps {
  session: BrowserSession | null;
  isController: boolean;
  canInteract: boolean;
  addressInput: string;
  setAddressInput: (value: string) => void;
  onAddressSubmit: (e: FormEvent) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenTextInput: () => void;
  onBack?: (() => void) | undefined;
  onForward?: (() => void) | undefined;
  onReload?: (() => void) | undefined;
  onReset?: (() => void) | undefined;
  onSetMode?: ((mode: BrowserControlMode) => void) | undefined;
  onTakeControl?: (() => void) | undefined;
  onReleaseControl?: (() => void) | undefined;
  onStop?: (() => void) | undefined;
}

// Böngésző fejléc: navigáció, címsor, irányítási mód, nézők, teljes képernyő, leállítás
export default function BrowserToolbar({
  session,
  isController,
  canInteract,
  addressInput,
  setAddressInput,
  onAddressSubmit,
  isFullscreen,
  onToggleFullscreen,
  onOpenTextInput,
  onBack,
  onForward,
  onReload,
  onReset,
  onSetMode,
  onTakeControl,
  onReleaseControl,
  onStop
}: BrowserToolbarProps) {
  const isActive = !!session?.active;

  return (
    <div
      className="rounded-2xl p-2 sm:p-3 mb-2 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 flex-shrink-0 shadow-lg"
      style={{
        background: '#151832',
        border: '1px solid rgba(125, 105, 255, 0.18)'
      }}
    >
      {/* Navigációs gombok és Címsor */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 flex-1 min-w-0">
        <button
          onClick={onBack}
          disabled={!isActive || !canInteract}
          title="Vissza"
          className="p-2 rounded-xl transition disabled:opacity-40 flex-shrink-0"
          style={{ background: '#1B2040', color: '#F4F3FF', border: '1px solid rgba(125, 105, 255, 0.15)' }}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <button
          onClick={onForward}
          disabled={!isActive || !canInteract}
          title="Előre"
          className="p-2 rounded-xl transition disabled:opacity-40 flex-shrink-0"
          style={{ background: '#1B2040', color: '#F4F3FF', border: '1px solid rgba(125, 105, 255, 0.15)' }}
        >
          <ArrowRight className="w-4 h-4" />
        </button>
        <button
          onClick={onReload}
          disabled={!isActive || !canInteract}
          title="Újratöltés"
          className="p-2 rounded-xl transition disabled:opacity-40 flex-shrink-0"
          style={{ background: '#1B2040', color: '#F4F3FF', border: '1px solid rgba(125, 105, 255, 0.15)' }}
        >
          <RotateCw className={`w-4 h-4 ${session?.isLoading ? 'animate-spin text-[#7655F5]' : ''}`} />
        </button>
        <button
          onClick={onReset}
          disabled={!isActive || !canInteract}
          title="Alaphelyzet (Wikipedia)"
          className="p-2 rounded-xl transition disabled:opacity-40 flex-shrink-0"
          style={{ background: '#1B2040', color: '#F4F3FF', border: '1px solid rgba(125, 105, 255, 0.15)' }}
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        {/* Címsor Űrlap */}
        <form onSubmit={onAddressSubmit} className="flex-1 basis-full sm:basis-0 flex items-center min-w-0 relative">
          <div className="absolute left-3 flex items-center pointer-events-none">
            <Lock className="w-3.5 h-3.5 text-[#28C997]" />
          </div>
          <input
            type="text"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            placeholder="Írj be egy URL-t (pl. https://en.wikipedia.org vagy github.com)..."
            disabled={isActive && !canInteract}
            className="w-full pl-9 pr-20 py-2 rounded-xl text-xs sm:text-sm font-medium transition outline-none disabled:opacity-60"
            style={{
              background: '#101329',
              color: '#F4F3FF',
              border: '1px solid rgba(125, 105, 255, 0.2)'
            }}
          />
          <button
            type="submit"
            disabled={isActive && !canInteract}
            className="absolute right-1.5 px-3 py-1 rounded-lg text-xs font-semibold text-white transition"
            style={{ background: 'linear-gradient(135deg, #7655F5, #536CFF)' }}
          >
            Ugrás
          </button>
        </form>
      </div>

      {/* Módváltó és vezérlő ikonok */}
      <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 md:flex-shrink-0 min-w-0">
        {/* Mód kapcsoló (Szabad / Irányítós) */}
        {isActive && (
          <div className="flex items-center gap-1.5 bg-[#101329] p-1 rounded-xl border border-[rgba(125,105,255,0.15)]">
            <button
              onClick={() => onSetMode?.(session.controlMode === 'free' ? 'controller' : 'free')}
              title={session.controlMode === 'free' ? 'Átváltás kijelölt irányító módra' : 'Átváltás szabad interakciós módra'}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
              style={{
                background: session.controlMode === 'free' ? '#7655F5' : 'transparent',
                color: session.controlMode === 'free' ? 'white' : '#999BBE'
              }}
            >
              <Users className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Szabad</span>
            </button>
            <button
              onClick={() => onSetMode?.(session.controlMode === 'controller' ? 'free' : 'controller')}
              title={session.controlMode === 'controller' ? 'Átváltás szabad módra' : 'Csak kijelölt személy irányíthat'}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
              style={{
                background: session.controlMode === 'controller' ? '#536CFF' : 'transparent',
                color: session.controlMode === 'controller' ? 'white' : '#999BBE'
              }}
            >
              <Gamepad2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Irányító</span>
            </button>
          </div>
        )}

        {/* Ha Irányító mód van, ki az irányító? */}
        {isActive && session.controlMode === 'controller' && (
          <div className="flex items-center gap-1.5">
            {session.controller ? (
              <div
                className="px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                style={{
                  background: 'rgba(118, 85, 245, 0.15)',
                  border: '1px solid rgba(118, 85, 245, 0.3)',
                  color: '#F4F3FF'
                }}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: session.controller.color || '#7655F5' }} />
                <span className="max-w-[80px] sm:max-w-[120px] truncate">{session.controller.username}</span>
              </div>
            ) : (
              <span className="text-xs text-[#999BBE] italic">Nincs irányító</span>
            )}

            {isController ? (
              <button
                onClick={onReleaseControl}
                className="px-2.5 py-1 rounded-xl text-xs font-bold text-white transition"
                style={{ background: '#E94B64' }}
              >
                Leadás
              </button>
            ) : (
              <button
                onClick={onTakeControl}
                className="px-2.5 py-1 rounded-xl text-xs font-bold text-white transition shadow"
                style={{ background: 'linear-gradient(135deg, #7655F5, #536CFF)' }}
              >
                Átvétel
              </button>
            )}
          </div>
        )}

        {/* Szövegbeviteli segédgomb */}
        {isActive && canInteract && (
          <button
            onClick={onOpenTextInput}
            title="Szöveg beillesztése / gépelés modálból"
            className="p-2 rounded-xl text-xs transition flex-shrink-0"
            style={{ background: '#1B2040', color: '#999BBE', border: '1px solid rgba(125, 105, 255, 0.15)' }}
          >
            <Keyboard className="w-4 h-4" />
          </button>
        )}

        {/* Nézőszám */}
        {isActive && (
          <div
            className="px-2.5 py-1 rounded-xl text-xs font-medium flex items-center gap-1.5 flex-shrink-0"
            style={{ background: '#1B2040', color: '#999BBE', border: '1px solid rgba(125, 105, 255, 0.15)' }}
            title={`Csatlakozott nézők: ${session.viewerCount || 1}`}
          >
            <Users className="w-3.5 h-3.5 text-[#28C997]" />
            <span>{session.viewerCount || 1}</span>
          </div>
        )}

        {/* Teljes képernyő */}
        <button
          onClick={onToggleFullscreen}
          title={isFullscreen ? 'Kilépés a teljes képernyőből' : 'Teljes képernyő'}
          className="p-2 rounded-xl transition flex-shrink-0"
          style={{ background: '#1B2040', color: '#F4F3FF', border: '1px solid rgba(125, 105, 255, 0.15)' }}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        {/* Leállítás */}
        {isActive && (
          <button
            onClick={onStop}
            title="Közös böngésző bezárása mindenkinek"
            className="p-2 rounded-xl transition flex-shrink-0 text-white"
            style={{ background: '#E94B64' }}
          >
            <Power className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
