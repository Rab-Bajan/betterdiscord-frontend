import React, { useRef, useEffect } from 'react';

interface VideoRendererProps {
  stream: MediaStream | null | undefined;
  isMuted?: boolean;
  className?: string;
}

export default function VideoRenderer({ stream, isMuted = false, className = '' }: VideoRendererProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream || null;
    if (stream) el.play().catch((e) => console.warn('Video play error:', e));
  }, [stream]);

  // A React nem frissíti megbízhatóan a `muted` attribútumot, ezért közvetlenül állítjuk
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = isMuted;
  }, [isMuted]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={isMuted}
      className={`w-full h-full object-contain ${className}`}
    />
  );
}
