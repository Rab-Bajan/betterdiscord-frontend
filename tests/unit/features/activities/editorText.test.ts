import { describe, it, expect } from 'vitest';
import { escapeHtml, getLanguageFromFilename, insertIndent } from '../../../../src/features/activities/code-editor/lib/editorText';

describe('code editor text helpers', () => {
  it('maps file extensions to Prism grammars', () => {
    expect(getLanguageFromFilename('app.MJS')).toBe('javascript');
    expect(getLanguageFromFilename('index.html')).toBe('markup');
    expect(getLanguageFromFilename('style.scss')).toBe('css');
    expect(getLanguageFromFilename('main.py')).toBe('python');
    expect(getLanguageFromFilename('README')).toBe('javascript');
    expect(getLanguageFromFilename()).toBe('javascript');
  });

  it('indents with two spaces over the selection', () => {
    expect(insertIndent('abcdef', 2, 4)).toEqual({ value: 'ab  ef', caret: 4 });
    expect(insertIndent('', 0, 0)).toEqual({ value: '  ', caret: 2 });
  });

  it('escapes HTML special characters', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href="x"&gt;&amp;&lt;/a&gt;');
  });
});
