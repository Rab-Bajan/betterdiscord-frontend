// A formázó eszköztár szövegátalakításai. Tiszta függvények: a szövegből és a kijelölésből
// kiszámolják az új szöveget és az új kijelölést; a textarea-hoz nem nyúlnak.
import { parseStyleToken } from './messageMarkup';

/** Text plus the selection to restore after an edit. */
export interface TextEdit {
  value: string;
  start: number;
  end: number;
}

export type TextTransform = (value: string, start: number, end: number) => TextEdit;

// A kijelölés körbevétele jelölőkkel. Ha már körbe van véve, a jelölők lekerülnek.
export function wrapSelection(value: string, start: number, end: number, open: string, close: string): TextEdit {
  const selected = value.slice(start, end);

  if (selected.length >= open.length + close.length && selected.startsWith(open) && selected.endsWith(close)) {
    const inner = selected.slice(open.length, selected.length - close.length);
    return { value: value.slice(0, start) + inner + value.slice(end), start, end: start + inner.length };
  }
  if (value.slice(start - open.length, start) === open && value.slice(end, end + close.length) === close) {
    return {
      value: value.slice(0, start - open.length) + selected + value.slice(end + close.length),
      start: start - open.length,
      end: end - open.length
    };
  }
  return {
    value: value.slice(0, start) + open + selected + close + value.slice(end),
    start: start + open.length,
    end: end + open.length
  };
}

export function prefixLines(value: string, start: number, end: number, prefix: string): TextEdit {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const nextBreak = value.indexOf('\n', end);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const lines = value.slice(lineStart, lineEnd).split('\n');
  const remove = lines.every((line) => line.startsWith(prefix));
  const block = lines.map((line) => (remove ? line.slice(prefix.length) : prefix + line)).join('\n');
  const result = value.slice(0, lineStart) + block + value.slice(lineEnd);
  return { value: result, start: lineStart + block.length, end: lineStart + block.length };
}

// Kijelölés nélkül a teljes üzenetet formázza. Meglévő stílust lecserél, nem halmoz.
export function applyStyle(value: string, rawStart: number, rawEnd: number, token: string): TextEdit {
  const start = rawStart === rawEnd ? 0 : rawStart;
  const end = rawStart === rawEnd ? value.length : rawEnd;
  const selected = value.slice(start, end);
  const existing = /^\{([^{}\s]+)\}([\s\S]*)\{\/\}$/.exec(selected);
  const existingToken = existing?.[1];
  const existingInner = existing?.[2];
  const inner =
    existingToken !== undefined && existingInner !== undefined && parseStyleToken(existingToken) && !existingInner.includes('{/}')
      ? existingInner
      : selected;
  const open = `{${token}}`;
  const styled = `${open}${inner}{/}`;
  const caret = inner ? start + styled.length : start + open.length;
  return { value: value.slice(0, start) + styled + value.slice(end), start: caret, end: caret };
}

export function insertLink(value: string, start: number, end: number): TextEdit {
  const selected = value.slice(start, end);
  if (/^https?:\/\//i.test(selected)) {
    const label = 'szöveg';
    return { value: `${value.slice(0, start)}[${label}](${selected})${value.slice(end)}`, start: start + 1, end: start + 1 + label.length };
  }
  const urlStart = start + selected.length + 3;
  const placeholder = 'https://';
  return {
    value: `${value.slice(0, start)}[${selected}](${placeholder})${value.slice(end)}`,
    start: selected ? urlStart + placeholder.length : start + 1,
    end: selected ? urlStart + placeholder.length : start + 1
  };
}

const SHORTCUT_MARKERS: Readonly<Record<string, string>> = { b: '**', i: '*', u: '__' };

/** The Ctrl/Cmd+key formatting shortcut as a transform, or null when `key` has none. */
export function shortcutTransform(key: string): TextTransform | null {
  const marker = SHORTCUT_MARKERS[key.toLowerCase()];
  if (!marker) return null;
  return (value, start, end) => wrapSelection(value, start, end, marker, marker);
}
