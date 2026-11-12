import React from 'react';
import { FileCode, FileText } from 'lucide-react';

/** An icon by file extension in the code tree and tabs. */
export default function CodeFileIcon({ filename = '' }: { filename?: string }) {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
      return <FileCode className="w-4 h-4 text-shark-gold flex-shrink-0" />;
    case 'py':
      return <FileCode className="w-4 h-4 text-shark-purple flex-shrink-0" />;
    case 'html':
      return <FileCode className="w-4 h-4 text-shark-red flex-shrink-0" />;
    case 'css':
      return <FileCode className="w-4 h-4 text-shark-blue flex-shrink-0" />;
    case 'json':
      return <FileCode className="w-4 h-4 text-shark-green flex-shrink-0" />;
    default:
      return <FileText className="w-4 h-4 text-shark-muted flex-shrink-0" />;
  }
}
