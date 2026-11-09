import React, { useState } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  EyeOff,
  Eye,
  Code,
  SquareCode,
  TextQuote,
  Heading,
  List,
  Link2,
  Palette,
  CircleHelp
} from 'lucide-react';
import { TEXT_COLORS, parseStyleToken } from '../../utils/messageMarkup';
import MessageContent from './MessageContent';

const EFFECT_OPTIONS = [
  ['rainbow', 'Szivárvány'],
  ['fire', 'Tűz'],
  ['ocean', 'Óceán'],
  ['sunset', 'Naplemente'],
  ['neon', 'Neon'],
  ['glow', 'Ragyogás'],
  ['wave', 'Hullám'],
  ['shake', 'Remegés'],
  ['pulse', 'Pulzálás'],
  ['big', 'Nagy'],
  ['small', 'Kicsi']
];

const HELP_EXAMPLES = [
  '**félkövér** *dőlt* __aláhúzott__ ~~áthúzott~~',
  '||spoiler|| `kód` [link](https://example.com)',
  '# Címsor   ## Kisebb   ### Legkisebb',
  '-# apró szöveg',
  '> idézet   >>> több soros idézet',
  '- lista   1. számozott lista',
  '```js\nconst kod = "blokk";\n```',
  '{red}színes{/} {#ff8800}egyedi szín{/}',
  '{rainbow}szivárvány{/} {gradient:pink,cyan}színátmenet{/}',
  '{wave}hullám{/} {neon}neon{/} {shake}remegés{/}',
  '<t:1800000000:R> :fire: @valaki'
];

// A kijelölés körbevétele jelölőkkel. Ha már körbe van véve, a jelölők lekerülnek.
function wrap(value, start, end, open, close) {
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

function prefixLines(value, start, end, prefix) {
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
function applyStyle(value, rawStart, rawEnd, token) {
  const start = rawStart === rawEnd ? 0 : rawStart;
  const end = rawStart === rawEnd ? value.length : rawEnd;
  const selected = value.slice(start, end);
  const existing = /^\{([^{}\s]+)\}([\s\S]*)\{\/\}$/.exec(selected);
  const inner = existing && parseStyleToken(existing[1]) && !existing[2].includes('{/}') ? existing[2] : selected;
  const open = `{${token}}`;
  const styled = `${open}${inner}{/}`;
  const caret = inner ? start + styled.length : start + open.length;
  return { value: value.slice(0, start) + styled + value.slice(end), start: caret, end: caret };
}

function insertLink(value, start, end) {
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

const iconButtonClass = 'p-2 sm:p-1.5 rounded-lg transition flex-shrink-0 hover:bg-[rgba(125,105,255,0.18)] hover:text-white';

export function runFormatShortcut(key, textarea, value, onChange) {
  const pair = { b: '**', i: '*', u: '__' }[key.toLowerCase()];
  if (!pair) return false;
  commit(textarea, onChange, wrap(value, textarea.selectionStart, textarea.selectionEnd, pair, pair));
  return true;
}

function commit(textarea, onChange, next) {
  onChange(next.value);
  requestAnimationFrame(() => {
    textarea?.focus();
    textarea?.setSelectionRange(next.start, next.end);
  });
}

export default function FormatToolbar({ textareaRef, value, onChange, showPreview, onTogglePreview }) {
  const [panel, setPanel] = useState(null);
  const [customColor, setCustomColor] = useState('#7655F5');

  const apply = (transform) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    commit(textarea, onChange, transform(value, textarea.selectionStart, textarea.selectionEnd));
  };

  const pickStyle = (token) => {
    apply((v, s, e) => applyStyle(v, s, e, token));
    setPanel(null);
  };

  const togglePanel = (name) => setPanel((current) => (current === name ? null : name));

  const buttons = [
    { icon: Bold, title: 'Félkövér (Ctrl+B)', run: (v, s, e) => wrap(v, s, e, '**', '**') },
    { icon: Italic, title: 'Dőlt (Ctrl+I)', run: (v, s, e) => wrap(v, s, e, '*', '*') },
    { icon: Underline, title: 'Aláhúzott (Ctrl+U)', run: (v, s, e) => wrap(v, s, e, '__', '__') },
    { icon: Strikethrough, title: 'Áthúzott', run: (v, s, e) => wrap(v, s, e, '~~', '~~') },
    { icon: EyeOff, title: 'Spoiler', run: (v, s, e) => wrap(v, s, e, '||', '||') },
    { icon: Code, title: 'Kód', run: (v, s, e) => wrap(v, s, e, '`', '`') },
    { icon: SquareCode, title: 'Kódblokk', run: (v, s, e) => wrap(v, s, e, '```\n', '\n```') },
    { icon: TextQuote, title: 'Idézet', run: (v, s, e) => prefixLines(v, s, e, '> ') },
    { icon: Heading, title: 'Címsor', run: (v, s, e) => prefixLines(v, s, e, '# ') },
    { icon: List, title: 'Lista', run: (v, s, e) => prefixLines(v, s, e, '- ') },
    { icon: Link2, title: 'Link', run: insertLink }
  ];

  return (
    <div className="relative">
      {panel === 'style' && (
        <div
          className="absolute bottom-full left-0 mb-2 p-3 rounded-2xl shadow-2xl z-30 w-72 max-w-[calc(100vw-1.5rem)]"
          style={{ background: '#151832', border: '1px solid rgba(125, 105, 255, 0.25)' }}
        >
          <p className="text-[11px] font-semibold mb-2" style={{ color: '#999BBE' }}>
            Szín a kijelölt szövegre, vagy kijelölés nélkül az egész üzenetre
          </p>
          <div className="grid grid-cols-6 gap-1.5 mb-3">
            {Object.entries(TEXT_COLORS).map(([name, color]) => (
              <button
                key={name}
                type="button"
                title={name}
                aria-label={name}
                onClick={() => pickStyle(name)}
                className="h-7 rounded-lg transition hover:scale-110"
                style={{ background: color }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 mb-3">
            <input
              type="color"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              aria-label="Egyedi szín"
              className="w-9 h-7 rounded-lg bg-transparent cursor-pointer flex-shrink-0"
            />
            <button
              type="button"
              onClick={() => pickStyle(customColor)}
              className="flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: '#1B2040', color: customColor }}
            >
              Egyedi szín használata
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {EFFECT_OPTIONS.map(([effect, label]) => (
              <button
                key={effect}
                type="button"
                onClick={() => pickStyle(effect)}
                className="px-2 py-1.5 rounded-lg text-xs font-bold overflow-hidden"
                style={{ background: '#1B2040' }}
              >
                <MessageContent text={`{${effect}}${label}{/}`} />
              </button>
            ))}
          </div>
        </div>
      )}

      {panel === 'help' && (
        <div
          className="absolute bottom-full left-0 mb-2 p-3 rounded-2xl shadow-2xl z-30 w-full max-w-lg max-w-[calc(100vw-1.5rem)] max-h-96 overflow-y-auto"
          style={{ background: '#151832', border: '1px solid rgba(125, 105, 255, 0.25)' }}
        >
          <div className="space-y-2">
            {HELP_EXAMPLES.map((example) => (
              <div key={example} className="grid grid-cols-1 sm:grid-cols-2 gap-1 sm:gap-3 text-xs items-center min-w-0">
                <code className="font-mono whitespace-pre-wrap break-all select-text" style={{ color: '#999BBE' }}>{example}</code>
                <MessageContent text={example} className="text-sm" />
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        className="flex items-center gap-0.5 overflow-x-auto scrollbar-none"
        style={{ color: '#999BBE' }}
        onMouseDown={(e) => e.preventDefault()}
      >
        {buttons.map(({ icon: Icon, title, run }) => (
          <button key={title} type="button" title={title} aria-label={title} onClick={() => apply(run)} className={iconButtonClass}>
            <Icon className="w-4 h-4" />
          </button>
        ))}
        <div className="w-px h-4 mx-1 flex-shrink-0" style={{ background: 'rgba(125, 105, 255, 0.25)' }} />
        <button
          type="button"
          title="Színek és effektek (szivárvány, neon, hullám...)"
          aria-label="Színek és effektek"
          aria-expanded={panel === 'style'}
          onClick={() => togglePanel('style')}
          className={iconButtonClass}
          style={panel === 'style' ? { color: '#fff', background: 'rgba(118, 85, 245, 0.35)' } : undefined}
        >
          <Palette className="w-4 h-4" />
        </button>
        <button
          type="button"
          title={showPreview ? 'Előnézet kikapcsolása' : 'Előnézet bekapcsolása'}
          aria-label="Előnézet"
          aria-pressed={showPreview}
          onClick={onTogglePreview}
          className={iconButtonClass}
          style={showPreview ? { color: '#28C997' } : undefined}
        >
          <Eye className="w-4 h-4" />
        </button>
        <button
          type="button"
          title="Formázási súgó"
          aria-label="Formázási súgó"
          aria-expanded={panel === 'help'}
          onClick={() => togglePanel('help')}
          className={iconButtonClass}
          style={panel === 'help' ? { color: '#fff', background: 'rgba(118, 85, 245, 0.35)' } : undefined}
        >
          <CircleHelp className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
