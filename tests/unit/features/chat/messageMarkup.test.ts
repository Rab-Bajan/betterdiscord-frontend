import { describe, it, expect } from 'vitest';
import {
  parseMessage,
  parseInline,
  parseStyleToken,
  parseAnsi,
  stripAnsi,
  isEmojiOnly,
  hasMarkup,
  TEXT_COLORS,
  TEXT_EFFECTS,
  type Block,
  type InlineNode
} from '../../../../src/features/chat/lib/messageMarkup';

const text = (value: string): InlineNode => ({ type: 'text', value });
const para = (...children: InlineNode[]): Block => ({ type: 'paragraph', children });

describe('parseMessage: input guards', () => {
  it('returns no blocks for non-strings and the empty string', () => {
    for (const v of [undefined, null, 42, {}, [], '']) expect(parseMessage(v)).toEqual([]);
  });

  it('shows over-long messages (> 8000 chars) as one unparsed paragraph', () => {
    const long = '**bold** '.repeat(1000);
    expect(long.length).toBeGreaterThan(8000);
    expect(parseMessage(long)).toEqual([para(text(long))]);
  });

  it('still parses a message of exactly 8000 chars', () => {
    const s = '**b**' + 'x'.repeat(7995);
    expect(s).toHaveLength(8000);
    expect(parseMessage(s)).toEqual([para({ type: 'bold', children: [text('b')] }, text('x'.repeat(7995)))]);
  });

  it('plain text becomes one paragraph and keeps inner newlines', () => {
    expect(parseMessage('hello\nworld')).toEqual([para(text('hello\nworld'))]);
  });
});

describe('inline formatting', () => {
  it.each([
    ['**b**', { type: 'bold', children: [text('b')] }],
    ['*i*', { type: 'italic', children: [text('i')] }],
    ['_i_', { type: 'italic', children: [text('i')] }],
    ['__u__', { type: 'underline', children: [text('u')] }],
    ['~~s~~', { type: 'strike', children: [text('s')] }],
    ['||sp||', { type: 'spoiler', children: [text('sp')] }],
    ['***bi***', { type: 'bold', children: [{ type: 'italic', children: [text('bi')] }] }],
    ['___ui___', { type: 'underline', children: [{ type: 'italic', children: [text('ui')] }] }]
  ] as const)('%s', (src, node) => {
    expect(parseInline(src)).toEqual([node]);
  });

  it('a double marker inside single-star italic does not close it', () => {
    expect(parseInline('*a **b** c*')).toEqual([
      { type: 'italic', children: [text('a '), { type: 'bold', children: [text('b')] }, text(' c')] }
    ]);
  });

  it('nests formatting', () => {
    expect(parseInline('**a ~~b~~**')).toEqual([
      { type: 'bold', children: [text('a '), { type: 'strike', children: [text('b')] }] }
    ]);
  });

  it('leaves snake_case_words untouched', () => {
    expect(parseInline('snake_case_word')).toEqual([text('snake_case_word')]);
    expect(parseInline('a _b_ c')).toEqual([text('a '), { type: 'italic', children: [text('b')] }, text(' c')]);
  });

  it('single * needs non-space next to both markers', () => {
    expect(parseInline('* x*')).toEqual([text('* x*')]);
    expect(parseInline('*x *')).toEqual([text('*x *')]);
    expect(parseInline('2 * 3 * 4')).toEqual([text('2 * 3 * 4')]);
  });

  it('unclosed or empty markers stay literal', () => {
    expect(parseInline('**open')).toEqual([text('**open')]);
    expect(parseInline('****')).toEqual([text('****')]);
    expect(parseInline('||||')).toEqual([text('||||')]);
  });

  it('inline code is verbatim and wins over other markup', () => {
    expect(parseInline('a `**x**` b')).toEqual([text('a '), { type: 'code', value: '**x**' }, text(' b')]);
    expect(parseInline('**a `**` b**')).toEqual([
      { type: 'bold', children: [text('a '), { type: 'code', value: '**' }, text(' b')] }
    ]);
  });

  it('double-backtick code may contain a backtick; one padding space is stripped', () => {
    expect(parseInline('`` `x` ``')).toEqual([{ type: 'code', value: '`x`' }]);
    expect(parseInline('``a``')).toEqual([{ type: 'code', value: 'a' }]);
  });

  it('empty or unclosed backticks stay literal', () => {
    expect(parseInline('``')).toEqual([text('``')]);
    expect(parseInline('`open')).toEqual([text('`open')]);
  });

  it('backslash escapes ASCII punctuation only', () => {
    expect(parseInline('\\*not italic\\*')).toEqual([text('*not italic*')]);
    expect(parseInline('\\`x\\`')).toEqual([text('`x`')]);
    expect(parseInline('\\a')).toEqual([text('\\a')]);
    expect(parseInline('end\\')).toEqual([text('end\\')]);
  });

  it('stops parsing at the depth limit (8): the innermost content stays verbatim text', () => {
    // style spans track their own nesting, so they can be nested arbitrarily deep
    const deep = '{red}'.repeat(9) + 'x' + '{/}'.repeat(9);
    let node = parseInline(deep)[0];
    let depth = 0;
    while (node && node.type === 'style') {
      depth += 1;
      node = node.children[0];
    }
    expect(depth).toBe(8);
    expect(node).toEqual(text('{red}x{/}'));
  });
});

describe('links', () => {
  it('masked link', () => {
    expect(parseInline('[docs](https://example.com/a)')).toEqual([
      { type: 'link', href: 'https://example.com/a', children: [text('docs')] }
    ]);
  });

  it('masked link label is parsed as inline markup', () => {
    expect(parseInline('[**b**](https://a.io)')).toEqual([
      { type: 'link', href: 'https://a.io', children: [{ type: 'bold', children: [text('b')] }] }
    ]);
  });

  it('balanced parentheses in the href are kept', () => {
    expect(parseInline('[w](https://en.wikipedia.org/wiki/A_(b))')).toEqual([
      { type: 'link', href: 'https://en.wikipedia.org/wiki/A_(b)', children: [text('w')] }
    ]);
  });

  it('rejects a URL-looking label that points to another host (phishing); the real target is then shown as a bare autolink', () => {
    for (const label of ['https://bank.com', 'www.bank.com', 'bank.com/login']) {
      expect(parseInline(`[${label}](https://evil.com)`)).toEqual([
        text(`[${label}](`),
        { type: 'link', href: 'https://evil.com', children: [text('https://evil.com')] },
        text(')')
      ]);
    }
  });

  it('allows a URL-looking label on the same host (www. ignored)', () => {
    expect(parseInline('[www.a.com](https://a.com/x)')).toEqual([
      { type: 'link', href: 'https://a.com/x', children: [text('www.a.com')] }
    ]);
  });

  it('only http(s) masked links: other schemes stay plain text', () => {
    for (const href of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:x', 'file:///etc/passwd', '//evil.com']) {
      expect(parseInline(`[click](${href})`)).toEqual([text(`[click](${href})`)]);
    }
  });

  it('autolinks bare URLs and trims trailing punctuation', () => {
    expect(parseInline('see https://ex.com/a.')).toEqual([
      text('see '),
      { type: 'link', href: 'https://ex.com/a', children: [text('https://ex.com/a')] },
      text('.')
    ]);
    expect(parseInline('HTTP://EX.COM?!')).toEqual([
      { type: 'link', href: 'HTTP://EX.COM', children: [text('HTTP://EX.COM')] },
      text('?!')
    ]);
  });

  it('trims an unbalanced closing parenthesis but keeps a balanced one', () => {
    expect(parseInline('(https://ex.com/a)')).toEqual([
      text('('),
      { type: 'link', href: 'https://ex.com/a', children: [text('https://ex.com/a')] },
      text(')')
    ]);
    expect(parseInline('https://ex.com/a_(b)')).toEqual([
      { type: 'link', href: 'https://ex.com/a_(b)', children: [text('https://ex.com/a_(b)')] }
    ]);
  });

  it('does not autolink inside a word', () => {
    expect(parseInline('xhttps://a.com')).toEqual([text('xhttps://a.com')]);
  });

  it('angle-bracket links', () => {
    expect(parseInline('<https://x.y/z>')).toEqual([
      { type: 'link', href: 'https://x.y/z', children: [text('https://x.y/z')] }
    ]);
  });
});

describe('XSS: the parser only produces an AST of known node types and http(s) hrefs', () => {
  const ALLOWED_INLINE = new Set(['text', 'code', 'spoiler', 'strike', 'bold', 'italic', 'underline', 'link', 'style', 'timestamp', 'mention']);
  const ALLOWED_BLOCK = new Set(['paragraph', 'quote', 'heading', 'subtext', 'list', 'codeblock']);
  const KNOWN_KEYS = new Set(['type', 'value', 'children', 'href', 'style', 'ms', 'format', 'name', 'kind', 'color', 'colors', 'effect', 'level', 'items', 'indent', 'marker', 'lang', 'code', 'spoiler']);

  function walk(node: unknown, isBlock: boolean, out: string[]): void {
    if (Array.isArray(node)) {
      node.forEach((n) => walk(n, isBlock, out));
      return;
    }
    if (!node || typeof node !== 'object') return;
    const rec = node as Record<string, unknown>;
    for (const k of Object.keys(rec)) if (!KNOWN_KEYS.has(k)) out.push(`unknown key ${k}`);
    if (typeof rec.type === 'string' && !(isBlock ? ALLOWED_BLOCK : ALLOWED_INLINE).has(rec.type)) out.push(`bad type ${rec.type}`);
    if (rec.type === 'link' && !(typeof rec.href === 'string' && /^https?:\/\//i.test(rec.href))) out.push(`bad href ${String(rec.href)}`);
    if (rec.type === 'quote') walk(rec.children, true, out);
    else walk(rec.children, false, out);
    if (Array.isArray(rec.items)) rec.items.forEach((it: unknown) => walk((it as { children?: unknown }).children, false, out));
  }

  it('HTML is never interpreted: it stays a text node', () => {
    const evil = '<script>alert(1)</script><img src=x onerror=alert(1)>';
    expect(parseMessage(evil)).toEqual([para(text(evil))]);
    expect(parseInline('<b onclick="x">hi</b>')).toEqual([text('<b onclick="x">hi</b>')]);
  });

  it('style tokens cannot inject CSS: only palette names, hex colours and known effects are accepted', () => {
    for (const tok of ['red;background:url(x)', 'expression(alert(1))', 'url(javascript:x)', '#12345g', 'gradient:red,url(x)', 'constructor', '__proto__']) {
      expect(parseStyleToken(tok)).toBeNull();
    }
    expect(parseInline('{red;x}a{/}')).toEqual([text('{red;x}a{/}')]);
  });

  it('random hostile input never yields unknown node types, unknown keys or non-http(s) links', () => {
    const pieces = ['<script>', '</script>', 'javascript:alert(1)', '[x](', ')', '](https://a.b)', '<https://a.b>', '<javascript:x>', '{red}', '{/}', '{gradient:red,blue}',
      '**', '__', '||', '`', '```', '```html\n', '\n', '> ', '# ', '- ', '@x', ':fire:', '\\', 'https://a.b/c', '"', "'", 'onerror=', '<t:1:R>', '\u001b[31m'];
    let seed = 99;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
    const problems: string[] = [];
    for (let n = 0; n < 3000; n++) {
      const src = Array.from({ length: 1 + Math.floor(rnd() * 12) }, () => pieces[Math.floor(rnd() * pieces.length)]).join('');
      walk(parseMessage(src), true, problems);
    }
    expect(problems).toEqual([]);
  });
});

describe('timestamps, mentions, emoji shortcodes', () => {
  it('timestamp with and without a style', () => {
    expect(parseInline('<t:1700000000:R>')).toEqual([{ type: 'timestamp', ms: 1700000000000, format: 'R' }]);
    expect(parseInline('<t:-5>')).toEqual([{ type: 'timestamp', ms: -5000, format: 'f' }]);
  });

  it('timestamps beyond the Date range stay text', () => {
    expect(parseInline('<t:9999999999999>')).toEqual([text('<t:9999999999999>')]);
    expect(parseInline('<t:8640000000000>')).toEqual([{ type: 'timestamp', ms: 8.64e15, format: 'f' }]);
  });

  it('unknown timestamp style is not a timestamp', () => {
    expect(parseInline('<t:1:x>')).toEqual([text('<t:1:x>')]);
  });

  it('mentions strip trailing dots/dashes and need a word boundary', () => {
    expect(parseInline('hi @Bob.')).toEqual([text('hi '), { type: 'mention', name: 'Bob' }, text('.')]);
    expect(parseInline('@ádám_1')).toEqual([{ type: 'mention', name: 'ádám_1' }]);
    expect(parseInline('mail@host')).toEqual([text('mail@host')]);
    expect(parseInline('@-')).toEqual([text('@-')]);
  });

  it('known shortcodes become emoji text merged into the surrounding text', () => {
    expect(parseInline('a :fire: b :+1:')).toEqual([text('a 🔥 b 👍')]);
  });

  it('unknown shortcodes and prototype keys stay literal', () => {
    expect(parseInline(':nope:')).toEqual([text(':nope:')]);
    expect(parseInline(':constructor:')).toEqual([text(':constructor:')]);
    expect(parseInline('a:fire:')).toEqual([text('a:fire:')]);
  });
});

describe('style tokens', () => {
  it('parseStyleToken', () => {
    expect(parseStyleToken('red')).toEqual({ kind: 'color', color: TEXT_COLORS.red });
    expect(parseStyleToken('#ABC')).toEqual({ kind: 'color', color: '#ABC' });
    expect(parseStyleToken('#a1b2c3')).toEqual({ kind: 'color', color: '#a1b2c3' });
    expect(parseStyleToken('#abcd')).toBeNull();
    expect(parseStyleToken('rainbow')).toEqual({ kind: 'effect', effect: 'rainbow' });
    expect(parseStyleToken('gradient:red,#00f')).toEqual({ kind: 'gradient', colors: [TEXT_COLORS.red, '#00f'] });
    expect(parseStyleToken('gradient:red')).toBeNull();
    expect(parseStyleToken('gradient:red,red,red,red,red,red')).not.toBeNull();
    expect(parseStyleToken('gradient:red,red,red,red,red,red,red')).toBeNull();
    expect(parseStyleToken('gradient:red,nope')).toBeNull();
    expect(parseStyleToken('nope')).toBeNull();
  });

  it('every exported effect and colour name is accepted', () => {
    for (const e of TEXT_EFFECTS) expect(parseStyleToken(e)).toEqual({ kind: 'effect', effect: e });
    for (const [name, hex] of Object.entries(TEXT_COLORS)) expect(parseStyleToken(name)).toEqual({ kind: 'color', color: hex });
  });

  it('styled span, nesting, and unclosed spans', () => {
    expect(parseInline('{red}x{/}')).toEqual([{ type: 'style', style: { kind: 'color', color: TEXT_COLORS.red }, children: [text('x')] }]);
    expect(parseInline('{red}a{blue}b{/}c{/}')).toEqual([
      {
        type: 'style',
        style: { kind: 'color', color: TEXT_COLORS.red },
        children: [text('a'), { type: 'style', style: { kind: 'color', color: TEXT_COLORS.blue }, children: [text('b')] }, text('c')]
      }
    ]);
    expect(parseInline('{red}open')).toEqual([text('{red}open')]);
    expect(parseInline('{red}{/}')).toEqual([text('{red}{/}')]);
    expect(parseInline('{nope}x{/}')).toEqual([text('{nope}x{/}')]);
  });

  it('an escaped closer does not close the span', () => {
    expect(parseInline('{red}a\\{/}b{/}')).toEqual([
      { type: 'style', style: { kind: 'color', color: TEXT_COLORS.red }, children: [text('a{/}b')] }
    ]);
  });
});

describe('code fences', () => {
  it('language-tagged block; the language is lower-cased', () => {
    expect(parseMessage('```JS\nconst a = 1;\n```')).toEqual([{ type: 'codeblock', lang: 'js', code: 'const a = 1;', spoiler: false }]);
  });

  it('block without a language keeps the leading newline of the body', () => {
    expect(parseMessage('```\nhi\n```')).toEqual([{ type: 'codeblock', lang: '', code: '\nhi', spoiler: false }]);
    expect(parseMessage('```hi```')).toEqual([{ type: 'codeblock', lang: '', code: 'hi', spoiler: false }]);
  });

  it('markup inside a block is not parsed', () => {
    expect(parseMessage('```md\n**x** <script>\n```')).toEqual([{ type: 'codeblock', lang: 'md', code: '**x** <script>', spoiler: false }]);
  });

  it('text around blocks becomes paragraphs, with surrounding newlines trimmed', () => {
    expect(parseMessage('before\n```py\nx\n```\nafter')).toEqual([
      para(text('before')),
      { type: 'codeblock', lang: 'py', code: 'x', spoiler: false },
      para(text('after'))
    ]);
  });

  it('a block wrapped in || is a spoiler block', () => {
    expect(parseMessage('||```x```||')).toEqual([{ type: 'codeblock', lang: '', code: 'x', spoiler: true }]);
  });

  it('empty and escaped fences are not blocks', () => {
    expect(parseMessage('``````').some((b) => b.type === 'codeblock')).toBe(false);
    expect(parseMessage('```   ```').some((b) => b.type === 'codeblock')).toBe(false);
    expect(parseMessage('\\```js\nx```').some((b) => b.type === 'codeblock')).toBe(false);
  });

  it('multiple blocks', () => {
    expect(parseMessage('```a```mid```b```')).toEqual([
      { type: 'codeblock', lang: '', code: 'a', spoiler: false },
      para(text('mid')),
      { type: 'codeblock', lang: '', code: 'b', spoiler: false }
    ]);
  });
});

describe('block syntax', () => {
  it('headings 1-3; a fourth # is a paragraph', () => {
    expect(parseMessage('# A\n## B\n### C\n#### D')).toEqual([
      { type: 'heading', level: 1, children: [text('A')] },
      { type: 'heading', level: 2, children: [text('B')] },
      { type: 'heading', level: 3, children: [text('C')] },
      para(text('#### D'))
    ]);
    expect(parseMessage('#nospace')).toEqual([para(text('#nospace'))]);
  });

  it('subtext', () => {
    expect(parseMessage('-# small *print*')).toEqual([
      { type: 'subtext', children: [text('small '), { type: 'italic', children: [text('print')] }] }
    ]);
  });

  it('bullet and numbered lists with indentation (2 spaces per level, max 4)', () => {
    expect(parseMessage('- a\n* b\n  + c\n            - d')).toEqual([
      {
        type: 'list',
        items: [
          { indent: 0, marker: null, children: [text('a')] },
          { indent: 0, marker: null, children: [text('b')] },
          { indent: 1, marker: null, children: [text('c')] },
          { indent: 4, marker: null, children: [text('d')] }
        ]
      }
    ]);
    expect(parseMessage('1. one\n10. ten')).toEqual([
      { type: 'list', items: [{ indent: 0, marker: '1.', children: [text('one')] }, { indent: 0, marker: '10.', children: [text('ten')] }] }
    ]);
  });

  it('a list ends at the first non-item line', () => {
    expect(parseMessage('- a\nplain')).toEqual([
      { type: 'list', items: [{ indent: 0, marker: null, children: [text('a')] }] },
      para(text('plain'))
    ]);
  });

  it('single-line quotes are grouped; quotes do not nest', () => {
    expect(parseMessage('> a\n> > b\nc')).toEqual([
      { type: 'quote', children: [para(text('a\n> b'))] },
      para(text('c'))
    ]);
  });

  it('>>> quotes the rest of the message', () => {
    expect(parseMessage('top\n>>> q1\n# h\nq3')).toEqual([
      para(text('top')),
      { type: 'quote', children: [para(text('q1')), { type: 'heading', level: 1, children: [text('h')] }, para(text('q3'))] }
    ]);
  });

  it('blank-only paragraphs are dropped', () => {
    expect(parseMessage('# h\n\n   \n')).toEqual([{ type: 'heading', level: 1, children: [text('h')] }]);
  });
});

describe('ANSI', () => {
  it('splits coloured runs; 0 resets', () => {
    expect(parseAnsi('\u001b[31mred\u001b[0m plain')).toEqual([
      { text: 'red', style: { color: '#dc322f' } },
      { text: ' plain', style: {} }
    ]);
  });

  it('combines bold, underline, foreground and background; empty params reset', () => {
    expect(parseAnsi('a\u001b[1;4;34;42mb\u001b[mc')).toEqual([
      { text: 'a', style: {} },
      { text: 'b', style: { fontWeight: 700, textDecoration: 'underline', color: '#268bd2', backgroundColor: '#586e75' } },
      { text: 'c', style: {} }
    ]);
  });

  it('styles accumulate across codes and unknown codes are ignored', () => {
    expect(parseAnsi('\u001b[1mA\u001b[32;99mB')).toEqual([
      { text: 'A', style: { fontWeight: 700 } },
      { text: 'B', style: { fontWeight: 700, color: '#859900' } }
    ]);
  });

  it('stripAnsi removes SGR codes only', () => {
    expect(stripAnsi('\u001b[1;31mhi\u001b[0m [x]')).toBe('hi [x]');
  });
});

describe('isEmojiOnly / hasMarkup', () => {
  it('isEmojiOnly', () => {
    expect(isEmojiOnly('😀😀')).toBe(true);
    expect(isEmojiOnly(' 👍🏽 ❤️ ')).toBe(true);
    expect(isEmojiOnly('😀🇭🇺')).toBe(true);
    expect(isEmojiOnly('🇭🇺')).toBe(false); // flags are not Extended_Pictographic
    expect(isEmojiOnly('😀 a')).toBe(false);
    expect(isEmojiOnly('')).toBe(false);
    expect(isEmojiOnly(null)).toBe(false);
    expect(isEmojiOnly('😀'.repeat(61))).toBe(false); // > 120 UTF-16 units
  });

  it('hasMarkup', () => {
    for (const s of ['a *b*', '`x`', '> q', '1. a', '- a', '[l](u)', '<t:1>', ':fire:', '{red}', '#']) expect(hasMarkup(s)).toBe(true);
    for (const s of ['hello', 'abc 5', '', null, undefined, 'a: b']) expect(hasMarkup(s)).toBe(false);
  });
});
