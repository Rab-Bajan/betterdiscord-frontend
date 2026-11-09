import React from 'react';
import { Volume2, MicOff, Headphones, Activity, Maximize2, Minimize2 } from 'lucide-react';
import VideoRenderer from './VideoRenderer';
import { useTileFullscreen } from '../../hooks/useTileFullscreen';
import Avatar from '../Avatar';

// Alapértelmezett nézet: résztvevők rácsa
export default function ParticipantGrid({ participants, currentUserId, onOpenSpeedTest, getCameraStream }) {
  const solo = participants.length <= 1;
  const fullscreen = useTileFullscreen();
  const count = participants.length;
  const gridCols = count === 2
    ? 'grid-cols-1 sm:grid-cols-2'
    : count <= 4
      ? 'grid-cols-2'
      : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
  const compact = count > 4;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto flex p-3 sm:p-6 w-full min-w-0">
      <div className={`w-full max-w-5xl m-auto ${
        solo ? 'flex justify-center items-center' : `grid ${gridCols} gap-2.5 sm:gap-4 auto-rows-fr`
      }`}>
        {participants.map((p) => {
          const camera = getCameraStream?.(p);
          const isFs = fullscreen.fullscreenId === p.id;
          return (
          <div
            key={p.id}
            data-tile-id={camera ? p.id : undefined}
            onDoubleClick={camera ? fullscreen.toggle : undefined}
            className={`rounded-2xl ${camera ? 'overflow-hidden' : 'p-4 sm:p-6'} flex flex-col items-center justify-center relative shadow-xl group transition-all ${
              camera ? 'aspect-video w-full ' + (solo ? 'max-w-2xl' : 'min-h-[140px] sm:min-h-[190px]') : solo ? 'w-full max-w-md sm:max-w-lg min-h-[200px] sm:min-h-[260px]' : 'min-h-[140px] sm:min-h-[190px]'
            }`}
            style={{
              background: isFs ? '#000' : '#151832',
              ...(isFs ? { aspectRatio: 'auto' } : {}),
              border: p.isSpeaking ? '2px solid #28C997' : '1px solid rgba(125, 105, 255, 0.15)',
              boxShadow: p.isSpeaking ? '0 0 20px rgba(40, 201, 151, 0.2)' : '0 4px 24px rgba(9, 10, 24, 0.6)'
            }}
          >
            {p.speedTest && (
              <div
                className="absolute top-2.5 left-2.5 sm:top-3 sm:left-3 px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-mono flex items-center gap-1 shadow cursor-pointer"
                style={{ background: 'rgba(9, 10, 24, 0.9)', border: '1px solid rgba(125, 105, 255, 0.2)', color: '#28C997' }}
                onClick={onOpenSpeedTest}
                title={`Ping: ${p.speedTest.ping}ms • DL: ${p.speedTest.download} Mbps • UL: ${p.speedTest.upload} Mbps`}
              >
                <Activity className="w-2.5 h-2.5" />
                <span>{p.speedTest.ping}ms</span>
              </div>
            )}

            {camera ? (
              <>
                <VideoRenderer
                  stream={camera}
                  isMuted
                  className={`absolute inset-0 ${isFs ? 'object-contain' : 'object-cover'} ${p.id === currentUserId ? '-scale-x-100' : ''}`}
                />
                <button
                  type="button"
                  onClick={fullscreen.toggle}
                  title={isFs ? 'Kilépés a teljes képernyőből' : 'Teljes képernyő (dupla kattintás)'}
                  className="absolute top-2 right-2 sm:top-3 sm:right-3 p-1.5 sm:p-2 rounded-xl text-white z-10 transition-opacity opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                  style={{ background: 'rgba(9, 10, 24, 0.85)', backdropFilter: 'blur(12px)', border: '1px solid rgba(125, 105, 255, 0.2)' }}
                >
                  {isFs ? <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                </button>
                <div
                  className="absolute bottom-2.5 left-2.5 sm:bottom-3 sm:left-3 flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold text-white max-w-[70%]"
                  style={{ background: 'rgba(9, 10, 24, 0.75)', backdropFilter: 'blur(8px)' }}
                >
                  <span className="truncate">{p.username}</span>
                  {p.id === currentUserId && <span className="font-normal opacity-70">(Te)</span>}
                </div>
              </>
            ) : (
              <>
            <div className="relative mb-2.5 sm:mb-3">
              <Avatar user={p} size={compact ? 'lg' : 'xl'} speaking={p.isSpeaking} />
              {p.isSpeaking && (
                <div className="absolute -bottom-1 -right-1 p-0.5 sm:p-1 rounded-full shadow" style={{ background: '#28C997' }}>
                  <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-bounce text-white" />
                </div>
              )}
            </div>

            <div className="text-center">
              <div className="font-semibold text-xs sm:text-sm flex items-center gap-1 justify-center" style={{ color: '#F4F3FF' }}>
                <span className="truncate max-w-[120px] sm:max-w-none">{p.username}</span>
                {p.id === currentUserId && (
                  <span className="text-[10px] sm:text-[11px] px-1 sm:px-1.5 py-0.5 rounded font-normal" style={{ color: '#999BBE', background: '#1B2040' }}>
                    Te
                  </span>
                )}
              </div>
            </div>

              </>
            )}

            <div className="absolute bottom-2.5 right-2.5 sm:bottom-3 sm:right-3 flex items-center gap-1">
              {p.isMuted && (
                <div className="p-1 rounded-full shadow" style={{ background: 'rgba(233, 75, 100, 0.9)' }} title="Némítva">
                  <MicOff className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-white" />
                </div>
              )}
              {p.isDeafened && (
                <div className="p-1 rounded-full shadow" style={{ background: 'rgba(233, 75, 100, 0.9)' }} title="Süketítve">
                  <Headphones className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-white" />
                </div>
              )}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
