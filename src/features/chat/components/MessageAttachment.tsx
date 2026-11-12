import React from 'react';
import { Download, Volume2 } from 'lucide-react';
import type { Attachment } from '../../../shared/types';
import { formatFileSize } from '../lib/fileDisplay';
import FileIcon from './FileIcon';

interface MessageAttachmentProps {
  att: Attachment;
  onOpenImage: (image: Attachment) => void;
}

// Csatolt fájl egy üzenetben: kép (nagyítható), videó, hang vagy letölthető fájl
export default function MessageAttachment({ att, onOpenImage }: MessageAttachmentProps) {
  const isImg =
     att.mimeType?.startsWith('image/') ||
    ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(
      att.originalName?.split('.').pop()?.toLowerCase() || ''
    );
  const isVid = att.mimeType?.startsWith('video/');
  const isAud = att.mimeType?.startsWith('audio/');

  if (isImg) {
    return (
      <div className="relative group/att inline-block max-w-md max-w-full">
        <img
          src={att.url}
          alt={att.originalName}
          onClick={() => onOpenImage(att)}
          className="max-h-72 max-w-full rounded-xl object-contain cursor-zoom-in hover:brightness-105 transition shadow-xl"
          style={{ background: '#101329', border: '1px solid rgba(125, 105, 255, 0.2)' }}
          loading="lazy"
        />
        <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-100 sm:opacity-0 sm:group-hover/att:opacity-100 transition">
          <a
            href={att.downloadUrl || att.url}
            download={att.originalName}
            title="Kép letöltése"
            className="p-1.5 rounded-xl text-white text-xs font-semibold shadow-md transition flex items-center gap-1"
            style={{ background: 'rgba(9, 10, 24, 0.85)', border: '1px solid rgba(125, 105, 255, 0.2)' }}
          >
            <Download className="w-3.5 h-3.5" />
          </a>
        </div>
        <div className="text-[11px] mt-1 truncate" style={{ color: '#999BBE' }}>
          {att.originalName} ({formatFileSize(att.size)})
        </div>
      </div>
    );
  }

  if (isVid) {
    return (
      <div className="rounded-xl overflow-hidden max-w-md w-full shadow-xl" style={{ background: '#101329', border: '1px solid rgba(125, 105, 255, 0.2)' }}>
        <video src={att.url} controls className="max-h-72 w-full" />
        <div className="p-2.5 flex items-center justify-between text-xs" style={{ background: '#151832', color: '#999BBE' }}>
          <span className="truncate">{att.originalName}</span>
          <a
            href={att.downloadUrl || att.url}
            download={att.originalName}
            className="hover:underline flex items-center gap-1 font-semibold"
            style={{ color: '#7655F5' }}
          >
            <Download className="w-3.5 h-3.5" /> Letöltés
          </a>
        </div>
      </div>
    );
  }

  if (isAud) {
    return (
      <div className="p-3 rounded-xl max-w-md w-full space-y-2 shadow-xl" style={{ background: '#151832', border: '1px solid rgba(125, 105, 255, 0.2)' }}>
        <div className="flex items-center justify-between text-xs" style={{ color: '#F4F3FF' }}>
          <span className="truncate min-w-0 font-semibold flex items-center gap-1.5">
            <Volume2 className="w-4 h-4 text-[#28C997]" />
            {att.originalName}
          </span>
          <a
            href={att.downloadUrl || att.url}
            download={att.originalName}
            className="hover:underline flex items-center gap-1 font-semibold"
            style={{ color: '#7655F5' }}
          >
            <Download className="w-3.5 h-3.5" />
          </a>
        </div>
        <audio src={att.url} controls className="w-full h-8" />
      </div>
    );
  }

  // Egyéb fájl (Dokumentum, Zip, Kód stb.)
  return (
    <div
     
      className="flex items-center justify-between gap-2 p-3 rounded-xl transition group/file shadow-md max-w-md w-full"
      style={{ background: '#151832', border: '1px solid rgba(125, 105, 255, 0.15)' }}
    >
      <div className="flex items-center gap-3 min-w-0 pr-2">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#1B2040' }}>
          <FileIcon mimeType={att.mimeType} filename={att.originalName} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate transition" style={{ color: '#F4F3FF' }}>
            {att.originalName}
          </div>
          <div className="text-xs" style={{ color: '#999BBE' }}>
            {formatFileSize(att.size)}
          </div>
        </div>
      </div>

      <a
        href={att.downloadUrl || att.url}
        download={att.originalName}
        title={`Letöltés: ${att.originalName}`}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shadow transition flex-shrink-0 text-white"
        style={{ background: '#1B2040', border: '1px solid rgba(125, 105, 255, 0.2)' }}
        onMouseOver={e => e.currentTarget.style.background = '#7655F5'}
        onMouseOut={e => e.currentTarget.style.background = '#1B2040'}
      >
        <Download className="w-4 h-4" />
        <span>Letöltés</span>
      </a>
    </div>
  );
}
