import React from 'react';
import { Download, X } from 'lucide-react';
import type { Attachment } from '../../../shared/types';

interface ImageLightboxProps {
  image: Attachment;
  onClose: () => void;
}

// Kép nagyító (lightbox): kattintásra bezárul, a képre kattintás nem zárja be
export default function ImageLightbox({ image, onClose }: ImageLightboxProps) {
  return (
    <div
      onClick={() => onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-150"
      style={{ background: 'rgba(9, 10, 24, 0.92)', backdropFilter: 'blur(16px)' }}
    >
      <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <img
          src={image.url}
          alt={image.originalName}
          className="max-w-full max-h-[82vh] object-contain rounded-2xl shadow-2xl"
          style={{ border: '1px solid rgba(125, 105, 255, 0.25)' }}
        />
        <div className="mt-3 flex items-center justify-between w-full text-white text-xs px-2">
          <span className="truncate font-semibold">{image.originalName}</span>
          <a
            href={image.downloadUrl || image.url}
            download={image.originalName}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold shadow transition"
            style={{ background: 'linear-gradient(135deg, #7655F5, #536CFF)' }}
          >
            <Download className="w-4 h-4" />
            <span>Letöltés</span>
          </a>
        </div>
        <button
          onClick={() => onClose()}
          className="absolute -top-3 -right-3 w-8 h-8 rounded-full flex items-center justify-center transition shadow-lg text-white"
          style={{ background: '#101329', border: '1px solid rgba(125, 105, 255, 0.3)' }}
          onMouseOver={e => e.currentTarget.style.background = '#E94B64'}
          onMouseOut={e => e.currentTarget.style.background = '#101329'}
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
