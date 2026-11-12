import React from 'react';
import { File, FileText, FileArchive, FileCode, Image as ImageIcon, Film, Volume2 } from 'lucide-react';

interface FileIconProps {
  mimeType?: string | undefined;
  filename?: string | undefined;
}

/** An icon matching the file type (by MIME type or extension). */
export default function FileIcon({ mimeType = '', filename = '' }: FileIconProps) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
    return <ImageIcon className="w-5 h-5 text-[#7655F5]" />;
  }
  if (mimeType.startsWith('video/') || ['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(ext)) {
    return <Film className="w-5 h-5 text-[#E94B64]" />;
  }
  if (mimeType.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) {
    return <Volume2 className="w-5 h-5 text-[#28C997]" />;
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) || mimeType.includes('zip') || mimeType.includes('archive')) {
    return <FileArchive className="w-5 h-5 text-[#F5B041]" />;
  }
  if (['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'py', 'c', 'cpp', 'java', 'sql', 'sh', 'bat'].includes(ext)) {
    return <FileCode className="w-5 h-5 text-[#536CFF]" />;
  }
  if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'md'].includes(ext) || mimeType.includes('pdf') || mimeType.includes('document')) {
    return <FileText className="w-5 h-5 text-[#536CFF]" />;
  }
  return <File className="w-5 h-5 text-[#999BBE]" />;
}
