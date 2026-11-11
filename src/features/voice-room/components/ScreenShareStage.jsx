import React, { useState, useRef, useEffect } from 'react';
import { Maximize2, MicOff, Headphones } from 'lucide-react';
import VideoRenderer from './VideoRenderer';
import { useTileFullscreen } from '../hooks/useTileFullscreen';
import Avatar from '../../../shared/ui/Avatar';

// Képernyőmegosztás nézet: nagy videó + résztvevő-kártyák alul
export default function ScreenShareStage({
  participants,
  currentUserId,
  stream,
  sharer,
  selectedSharerId,
  onSelectSharer,
  isSharing,
  isDeafened,
  getCameraStream
}) {
  const stageRef = useRef(null);
  const cameraFs = useTileFullscreen();
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullScreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullScreen = () => {
    if (!stageRef.current) return;
    if (!document.fullscreenElement) stageRef.current.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-2 sm:gap-3">
      <div
        ref={stageRef}
        className="flex-1 w-full min-h-[40vh] sm:min-h-0 overflow-hidden relative flex items-center justify-center group rounded-xl sm:rounded-2xl"
        style={{ background: '#090A18', border: '1px solid rgba(125, 105, 255, 0.2)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)' }}
      >
        <VideoRenderer stream={stream} isMuted={selectedSharerId === currentUserId || !!isDeafened} className="max-h-full max-w-full" />

        <div className="absolute top-2 left-2 sm:top-3 sm:left-3 flex items-center gap-1.5 sm:gap-2 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl z-10" style={{ background: 'rgba(9, 10, 24, 0.85)', backdropFilter: 'blur(12px)', border: '1px solid rgba(125, 105, 255, 0.2)' }}>
          <Avatar user={sharer} size="xs" />
          <span className="text-white text-[11px] sm:text-xs font-semibold truncate max-w-[120px] sm:max-w-none">
            {sharer?.username} képernyője
          </span>
          <span className="text-white text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded uppercase flex-shrink-0" style={{ background: '#E94B64' }}>
            ÉLŐ
          </span>
        </div>

        <div className="absolute top-2 right-2 sm:top-3 sm:right-3 flex items-center gap-1.5 z-10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button
            onClick={toggleFullScreen}
            title={isFullScreen ? 'Kilépés a teljes képernyőből' : 'Teljes képernyő'}
            className="p-1.5 sm:p-2 rounded-xl text-white transition-all shadow"
            style={{ background: 'rgba(9, 10, 24, 0.85)', backdropFilter: 'blur(12px)', border: '1px solid rgba(125, 105, 255, 0.2)' }}
          >
            <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      </div>

      <div className="h-20 sm:h-28 flex-shrink-0 flex items-center gap-2 sm:gap-3 overflow-x-auto py-1 scrollbar-none">
        {participants.map((p) => {
          const sharing = isSharing(p);
          const selected = selectedSharerId === p.id;
          const camera = getCameraStream?.(p);
          return (
            <div
              key={p.id}
              onClick={() => sharing && onSelectSharer(p.id)}
              className="h-full min-w-[95px] sm:min-w-[130px] max-w-[110px] sm:max-w-[150px] p-1.5 sm:p-2 flex flex-col items-center justify-center relative cursor-pointer transition-all rounded-xl sm:rounded-2xl flex-shrink-0"
              style={{
                background: '#151832',
                border: selected ? '2px solid #7655F5' : sharing ? '2px solid #E94B64' : '1px solid rgba(125, 105, 255, 0.15)',
                boxShadow: selected ? '0 0 16px rgba(118, 85, 245, 0.3)' : 'none'
              }}
            >
              {camera ? (
                <div
                  data-tile-id={`cam-${p.id}`}
                  onDoubleClick={cameraFs.toggle}
                  title="Dupla kattintás: teljes képernyő"
                  className={`w-full flex-1 min-h-0 rounded-lg overflow-hidden border-2 transition ${p.isSpeaking ? 'speaking-ring' : ''}`}
                  style={{ borderColor: p.isSpeaking ? '#28C997' : 'transparent', background: cameraFs.fullscreenId === `cam-${p.id}` ? '#000' : undefined }}
                >
                  <VideoRenderer
                    stream={camera}
                    isMuted
                    className={`${cameraFs.fullscreenId === `cam-${p.id}` ? 'object-contain' : 'object-cover'} ${p.id === currentUserId ? '-scale-x-100' : ''}`}
                  />
                </div>
              ) : (
                <Avatar user={p} size="sm" speaking={p.isSpeaking} />
              )}
              <span className="text-[11px] sm:text-xs font-medium truncate mt-1 max-w-[85px] sm:max-w-[120px]" style={{ color: '#F4F3FF' }}>
                {p.username} {p.id === currentUserId && '(Te)'}
              </span>

              {sharing && (
                <span className="absolute top-1 sm:top-1.5 right-1 sm:right-1.5 text-white text-[7px] sm:text-[8px] font-bold px-1 rounded" style={{ background: '#E94B64' }}>
                  ÉLŐ
                </span>
              )}

              <div className="absolute bottom-1 right-1 flex items-center gap-0.5 sm:gap-1">
                {p.isMuted && <MicOff className="w-2.5 h-2.5 sm:w-3 sm:h-3" style={{ color: '#E94B64' }} />}
                {p.isDeafened && <Headphones className="w-2.5 h-2.5 sm:w-3 sm:h-3" style={{ color: '#E94B64' }} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
