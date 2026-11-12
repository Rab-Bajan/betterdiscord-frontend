// A közös kódszerkesztő szövegkezelése: nyelvfelismerés, behúzás, HTML-escape.

/** The Prism grammar name for a file; unknown extensions are highlighted as JavaScript. */
export function getLanguageFromFilename(filename = ''): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'jsx':
      return 'jsx';
    case 'ts':
      return 'typescript';
    case 'tsx':
      return 'tsx';
    case 'html':
    case 'htm':
    case 'svg':
    case 'xml':
      return 'markup';
    case 'css':
    case 'scss':
    case 'less':
      return 'css';
    case 'py':
      return 'python';
    case 'json':
      return 'json';
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'c':
    case 'h':
      return 'c';
    case 'cpp':
    case 'cc':
    case 'hpp':
      return 'cpp';
    case 'java':
      return 'java';
    case 'sql':
      return 'sql';
    default:
      return 'javascript';
  }
}

/** Replaces the selection with two spaces (Tab key) and returns the new text and caret. */
export function insertIndent(value: string, start: number, end: number): { value: string; caret: number } {
  return { value: value.substring(0, start) + '  ' + value.substring(end), caret: start + 2 };
}

/** Plain code as HTML text, for when no grammar applies. */
export const escapeHtml = (code: string): string =>
  code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
