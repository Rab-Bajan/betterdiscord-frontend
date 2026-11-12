import React, { useState, type RefObject } from 'react';
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
  CircleHelp,
  type LucideIcon
} from 'lucide-react';
import { TEXT_COLORS, type TextEffect } from '../lib/messageMarkup';
import { applyStyle, insertLink, prefixLines, shortcutTransform, wrapSelection, type TextEdit, type TextTransform } from '../lib/textFormatting';
import MessageContent from './MessageContent';

const EFFECT_OPTIONS: ReadonlyArray<readonly [TextEffect, string]> = [
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

const iconButtonClass = 'p-2 sm:p-1.5 rounded-lg transition flex-shrink-0 hover:bg-[rgba(125,105,255,0.18)] hover:text-white';

type OnTextChange = (value: string) => void;

/** Applies a Ctrl/Cmd formatting shortcut; returns false when `key` is not one. */
export function runFormatShortcut(key: string, textarea: HTMLTextAreaElement, value: string, onChange: OnTextChange): boolean {
  const shortcut = shortcutTransform(key);
  if (!shortcut) return false;
  commit(textarea, onChange, shortcut(value, textarea.selectionStart, textarea.selectionEnd));
  return true;
}

function commit(textarea: HTMLTextAreaElement, onChange: OnTextChange, next: TextEdit): void {
  onChange(next.value);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(next.start, next.end);
  });
}

type Panel = 'style' | 'help';

interface ToolbarButton {
  icon: LucideIcon;
  title: string;
  run: TextTransform;
}

interface FormatToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: OnTextChange;
  showPreview: boolean;
  onTogglePreview: () => void;
}

export default function FormatToolbar({ textareaRef, value, onChange, showPreview, onTogglePreview }: FormatToolbarProps) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [customColor, setCustomColor] = useState('#7655F5');

  const apply = (transform: TextTransform) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    commit(textarea, onChange, transform(value, textarea.selectionStart, textarea.selectionEnd));
  };

  const pickStyle = (token: string) => {
    apply((v, s, e) => applyStyle(v, s, e, token));
    setPanel(null);
  };

  const togglePanel = (name: Panel) => setPanel((current) => (current === name ? null : name));

  const buttons: ToolbarButton[] = [
    { icon: Bold, title: 'Félkövér (Ctrl+B)', run: (v, s, e) => wrapSelection(v, s, e, '**', '**') },
    { icon: Italic, title: 'Dőlt (Ctrl+I)', run: (v, s, e) => wrapSelection(v, s, e, '*', '*') },
    { icon: Underline, title: 'Aláhúzott (Ctrl+U)', run: (v, s, e) => wrapSelection(v, s, e, '__', '__') },
    { icon: Strikethrough, title: 'Áthúzott', run: (v, s, e) => wrapSelection(v, s, e, '~~', '~~') },
    { icon: EyeOff, title: 'Spoiler', run: (v, s, e) => wrapSelection(v, s, e, '||', '||') },
    { icon: Code, title: 'Kód', run: (v, s, e) => wrapSelection(v, s, e, '`', '`') },
    { icon: SquareCode, title: 'Kódblokk', run: (v, s, e) => wrapSelection(v, s, e, '```\n', '\n```') },
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
