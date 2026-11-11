// Discord-stílusú üzenetjelölés értelmezője. Tiszta AST-t ad vissza, HTML-t soha nem állít elő,
// így a felhasználói szöveg nem tud kódot vagy stílust injektálni.

// Ennél hosszabb szöveg egyszerű szövegként jelenik meg, hogy ne lehessen vele megakasztani a klienst
const MAX_PARSE_LENGTH = 8000;
const MAX_DEPTH = 8;

export const TEXT_COLORS = {
  red: '#ff5c6c',
  orange: '#ff9f43',
  yellow: '#ffd93d',
  green: '#3ddc84',
  teal: '#2dd4bf',
  cyan: '#38bdf8',
  blue: '#60a5fa',
  purple: '#a78bfa',
  pink: '#f472b6',
  gold: '#f5c542',
  white: '#ffffff',
  gray: '#9ca3af'
};

export const TEXT_EFFECTS = ['rainbow', 'fire', 'ocean', 'sunset', 'neon', 'glow', 'wave', 'shake', 'pulse', 'big', 'small'];

const EMOJI_SHORTCODES = {
  smile: '😄', grin: '😁', joy: '😂', rofl: '🤣', wink: '😉', heart_eyes: '😍', sob: '😭', cry: '😢',
  thinking: '🤔', sunglasses: '😎', skull: '💀', clown: '🤡', eyes: '👀', fire: '🔥', heart: '❤️',
  broken_heart: '💔', star: '⭐', sparkles: '✨', tada: '🎉', rocket: '🚀', shark: '🦈', '100': '💯',
  thumbsup: '👍', '+1': '👍', thumbsdown: '👎', '-1': '👎', clap: '👏', pray: '🙏', wave: '👋', ok_hand: '👌',
  muscle: '💪', poop: '💩', warning: '⚠️', white_check_mark: '✅', x: '❌', question: '❓', exclamation: '❗',
  game_die: '🎲', video_game: '🎮', moneybag: '💰', crown: '👑', zap: '⚡', coffee: '☕', beer: '🍺', pizza: '🍕'
};

const ANSI_FG = { 30: '#4f545c', 31: '#dc322f', 32: '#859900', 33: '#b58900', 34: '#268bd2', 35: '#d33682', 36: '#2aa198', 37: '#ffffff' };
const ANSI_BG = { 40: '#002b36', 41: '#cb4b16', 42: '#586e75', 43: '#657b83', 44: '#839496', 45: '#6c71c4', 46: '#93a1a1', 47: '#fdf6e3' };

const WORD_CHAR = /[\p{L}\p{N}]/u;
const ESCAPABLE = /[!-/:-@[-`{-~]/;
const LINK_RE = /\[([^[\]\n]{1,300})\]\((https?:\/\/[^\s()]+(?:\([^\s()]*\)[^\s()]*)*)\)/iy;
const URL_RE = /https?:\/\/[^\s<]+/iy;
const ANGLE_URL_RE = /<(https?:\/\/[^\s>]+)>/iy;
const TIMESTAMP_RE = /<t:(-?\d{1,13})(?::([tTdDfFR]))?>/y;
const MENTION_RE = /@([\p{L}\p{N}_.-]{1,32})/uy;
const SHORTCODE_RE = /:([a-z0-9_+-]{1,32}):/y;
const STYLE_OPEN_RE = /\{([^{}\s]{1,64})\}/y;
const STYLE_TOKEN_RE = /\{([^{}\s]{1,64})\}/g;
const HEX_COLOR_RE = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;

const resolveColor = (name) => {
  if (HEX_COLOR_RE.test(name)) return name;
  return Object.prototype.hasOwnProperty.call(TEXT_COLORS, name) ? TEXT_COLORS[name] : null;
};

// `{red}`, `{#ff8800}`, `{rainbow}`, `{gradient:red,#00f}` -> stílus leíró, ismeretlen tokenre null
export function parseStyleToken(token) {
  if (token.startsWith('gradient:')) {
    const colors = token.slice('gradient:'.length).split(',').map(resolveColor);
    return colors.length >= 2 && colors.length <= 6 && colors.every(Boolean) ? { kind: 'gradient', colors } : null;
  }
  if (TEXT_EFFECTS.includes(token)) return { kind: 'effect', effect: token };
  const color = resolveColor(token);
  return color ? { kind: 'color', color } : null;
}

const isWordAt = (s, i) => i >= 0 && i < s.length && WORD_CHAR.test(s[i]);

function findClose(s, delim, from) {
  for (let i = from; i <= s.length - delim.length; i += 1) {
    const c = s[i];
    if (c === '\\') {
      i += 1;
    } else if (c === '`' && delim !== '`') {
      let k = 1;
      while (s[i + k] === '`') k += 1;
      const end = s.indexOf('`'.repeat(k), i + k);
      if (end !== -1) i = end + k - 1;
    } else if (delim.length === 1 && c === delim && s[i + 1] === delim) {
      // `*a **b** c*`: a dupla jelölő nem zárja le a szimpla dőlt szöveget
      while (s[i + 1] === delim) i += 1;
    } else if (s.startsWith(delim, i)) {
      return i;
    }
  }
  return -1;
}

function findStyleClose(s, from) {
  STYLE_TOKEN_RE.lastIndex = from;
  let depth = 1;
  let m;
  while ((m = STYLE_TOKEN_RE.exec(s))) {
    if (s[m.index - 1] === '\\') continue;
    if (m[1] === '/') {
      depth -= 1;
      if (depth === 0) return m.index;
    } else if (parseStyleToken(m[1])) {
      depth += 1;
    }
  }
  return -1;
}

function matchAt(re, s, i) {
  re.lastIndex = i;
  return re.exec(s);
}

function hostOf(value) {
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

// Az URL-nek látszó linkszöveg nem mutathat másik domainre (adathalászat ellen)
function isDeceptiveLink(text, href) {
  const looksLikeUrl = /^(https?:\/\/|www\.)/i.test(text) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text.trim());
  return looksLikeUrl && hostOf(text.trim()) !== hostOf(href);
}

function trimUrl(url) {
  let end = url.length;
  while (end > 0) {
    const c = url[end - 1];
    if ('.,:;!?\'"*_~|'.includes(c)) {
      end -= 1;
    } else if (c === ')' && url.slice(0, end).split(')').length > url.slice(0, end).split('(').length) {
      end -= 1;
    } else {
      break;
    }
  }
  return url.slice(0, end);
}

const isValidUrl = (value) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

// Egy pozícióra illeszkedő inline elem: { node(s), end } vagy null
function matchInlineAt(s, i, depth) {
  const c = s[i];
  const inner = (from, to) => parseInline(s.slice(from, to), depth + 1);

  const wrapped = (delim, build) => {
    const start = i + delim.length;
    const close = findClose(s, delim, start);
    return close > start ? { nodes: build(inner(start, close)), end: close + delim.length } : null;
  };

  switch (c) {
    case '`': {
      let k = 1;
      while (s[i + k] === '`') k += 1;
      const close = s.indexOf('`'.repeat(k), i + k);
      if (close <= i + k - 1 || close === i + k) return null;
      let value = s.slice(i + k, close);
      if (k > 1 && value.startsWith(' ') && value.endsWith(' ') && value.length > 2) value = value.slice(1, -1);
      return { nodes: [{ type: 'code', value }], end: close + k };
    }
    case '|':
      return s[i + 1] === '|' ? wrapped('||', (children) => [{ type: 'spoiler', children }]) : null;
    case '~':
      return s[i + 1] === '~' ? wrapped('~~', (children) => [{ type: 'strike', children }]) : null;
    case '*': {
      if (s.startsWith('***', i)) {
        const m = wrapped('***', (children) => [{ type: 'bold', children: [{ type: 'italic', children }] }]);
        if (m) return m;
      }
      if (s[i + 1] === '*') {
        const m = wrapped('**', (children) => [{ type: 'bold', children }]);
        if (m) return m;
      }
      if (/\s/.test(s[i + 1] || ' ')) return null;
      const close = findClose(s, '*', i + 1);
      if (close <= i + 1 || /\s/.test(s[close - 1])) return null;
      return { nodes: [{ type: 'italic', children: inner(i + 1, close) }], end: close + 1 };
    }
    case '_': {
      if (s.startsWith('___', i)) {
        const m = wrapped('___', (children) => [{ type: 'underline', children: [{ type: 'italic', children }] }]);
        if (m) return m;
      }
      if (s[i + 1] === '_') {
        const m = wrapped('__', (children) => [{ type: 'underline', children }]);
        if (m) return m;
      }
      // snake_case_szavak érintetlenek maradnak
      if (isWordAt(s, i - 1)) return null;
      let close = findClose(s, '_', i + 1);
      while (close !== -1 && isWordAt(s, close + 1)) close = findClose(s, '_', close + 1);
      if (close <= i + 1) return null;
      return { nodes: [{ type: 'italic', children: inner(i + 1, close) }], end: close + 1 };
    }
    case '[': {
      const m = matchAt(LINK_RE, s, i);
      if (!m || !isValidUrl(m[2]) || isDeceptiveLink(m[1], m[2])) return null;
      return { nodes: [{ type: 'link', href: m[2], children: parseInline(m[1], depth + 1) }], end: i + m[0].length };
    }
    case '{': {
      const m = matchAt(STYLE_OPEN_RE, s, i);
      const style = m && parseStyleToken(m[1]);
      if (!style) return null;
      const start = i + m[0].length;
      const close = findStyleClose(s, start);
      if (close <= start) return null;
      return { nodes: [{ type: 'style', style, children: inner(start, close) }], end: close + 3 };
    }
    case '<': {
      const time = matchAt(TIMESTAMP_RE, s, i);
      if (time) {
        const ms = Number(time[1]) * 1000;
        if (Math.abs(ms) <= 8.64e15) return { nodes: [{ type: 'timestamp', ms, format: time[2] || 'f' }], end: i + time[0].length };
      }
      const url = matchAt(ANGLE_URL_RE, s, i);
      if (url && isValidUrl(url[1])) {
        return { nodes: [{ type: 'link', href: url[1], children: [{ type: 'text', value: url[1] }] }], end: i + url[0].length };
      }
      return null;
    }
    case 'h':
    case 'H': {
      if (isWordAt(s, i - 1)) return null;
      const m = matchAt(URL_RE, s, i);
      if (!m) return null;
      const url = trimUrl(m[0]);
      if (!isValidUrl(url)) return null;
      return { nodes: [{ type: 'link', href: url, children: [{ type: 'text', value: url }] }], end: i + url.length };
    }
    case '@': {
      if (isWordAt(s, i - 1)) return null;
      const m = matchAt(MENTION_RE, s, i);
      if (!m) return null;
      const name = m[1].replace(/[.-]+$/, '');
      return name ? { nodes: [{ type: 'mention', name }], end: i + 1 + name.length } : null;
    }
    case ':': {
      if (isWordAt(s, i - 1)) return null;
      const m = matchAt(SHORTCODE_RE, s, i);
      if (!m || !Object.prototype.hasOwnProperty.call(EMOJI_SHORTCODES, m[1])) return null;
      return { nodes: [{ type: 'text', value: EMOJI_SHORTCODES[m[1]] }], end: i + m[0].length };
    }
    default:
      return null;
  }
}

export function parseInline(s, depth = 0) {
  if (depth >= MAX_DEPTH) return [{ type: 'text', value: s }];

  const nodes = [];
  let text = '';
  const pushText = (value) => {
    text += value;
  };
  const flush = () => {
    if (text) nodes.push({ type: 'text', value: text });
    text = '';
  };

  let i = 0;
  while (i < s.length) {
    if (s[i] === '\\' && i + 1 < s.length && ESCAPABLE.test(s[i + 1])) {
      pushText(s[i + 1]);
      i += 2;
      continue;
    }
    const match = matchInlineAt(s, i, depth);
    if (match) {
      for (const node of match.nodes) {
        if (node.type === 'text') {
          pushText(node.value);
        } else {
          flush();
          nodes.push(node);
        }
      }
      i = match.end;
    } else {
      pushText(s[i]);
      i += 1;
    }
  }
  flush();
  return nodes;
}

const LIST_RE = /^(\s*)([-*+]|\d{1,9}\.) +(\S.*)$/;

function parseLines(src, inQuote) {
  const lines = src.split('\n');
  const blocks = [];
  let paragraph = [];

  const flush = () => {
    if (paragraph.some((l) => l.trim())) {
      blocks.push({ type: 'paragraph', children: parseInline(paragraph.join('\n')) });
    }
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (!inQuote && line.startsWith('>>> ')) {
      flush();
      const rest = [line.slice(4), ...lines.slice(i + 1)].join('\n');
      blocks.push({ type: 'quote', children: parseLines(rest, true) });
      return blocks;
    }

    if (!inQuote && line.startsWith('> ')) {
      flush();
      const quoted = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoted.push(lines[i].slice(2));
        i += 1;
      }
      i -= 1;
      blocks.push({ type: 'quote', children: parseLines(quoted.join('\n'), true) });
      continue;
    }

    const heading = /^(#{1,3}) +(\S.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', level: heading[1].length, children: parseInline(heading[2]) });
      continue;
    }

    const subtext = /^-# +(\S.*)$/.exec(line);
    if (subtext) {
      flush();
      blocks.push({ type: 'subtext', children: parseInline(subtext[1]) });
      continue;
    }

    if (LIST_RE.test(line)) {
      flush();
      const items = [];
      while (i < lines.length) {
        const m = LIST_RE.exec(lines[i]);
        if (!m) break;
        items.push({
          indent: Math.min(Math.floor(m[1].length / 2), 4),
          marker: /\d/.test(m[2]) ? m[2] : null,
          children: parseInline(m[3])
        });
        i += 1;
      }
      i -= 1;
      blocks.push({ type: 'list', items });
      continue;
    }

    paragraph.push(line);
  }
  flush();
  return blocks;
}

const trimNewlines = (s) => s.replace(/^\n+|\n+$/g, '');

export function parseMessage(src) {
  if (typeof src !== 'string' || !src) return [];
  if (src.length > MAX_PARSE_LENGTH) return [{ type: 'paragraph', children: [{ type: 'text', value: src }] }];

  // A kódblokkok élveznek elsőbbséget, a köztük lévő szöveg soronként értelmeződik
  const fence = /```(?:([\w+#-]{1,20})[ \t]*\n)?([\s\S]*?)```/g;
  const blocks = [];
  let last = 0;
  let m;

  while ((m = fence.exec(src))) {
    if (src[m.index - 1] === '\\' || !m[2].trim()) {
      fence.lastIndex = m.index + 3;
      continue;
    }
    const end = m.index + m[0].length;
    const before = src.slice(last, m.index);
    const spoiler = before.endsWith('||') && src.startsWith('||', end);
    blocks.push(...parseLines(trimNewlines(spoiler ? before.slice(0, -2) : before), false));
    blocks.push({
      type: 'codeblock',
      lang: (m[1] || '').toLowerCase(),
      code: m[2].replace(/\n$/, ''),
      spoiler
    });
    last = spoiler ? end + 2 : end;
    fence.lastIndex = last;
  }
  blocks.push(...parseLines(trimNewlines(src.slice(last)), false));
  return blocks;
}

// ```ansi blokkok: a Discord-kompatibilis színkódokat stílusos szövegdarabokra bontja
export function parseAnsi(code) {
  const runs = [];
  const re = /\u001b\[([\d;]*)m/g;
  let style = {};
  let last = 0;
  let m;

  while ((m = re.exec(code))) {
    if (m.index > last) runs.push({ text: code.slice(last, m.index), style });
    style = { ...style };
    for (const raw of (m[1] || '0').split(';')) {
      const n = Number(raw || 0);
      if (n === 0) style = {};
      else if (n === 1) style.fontWeight = 700;
      else if (n === 4) style.textDecoration = 'underline';
      else if (ANSI_FG[n]) style.color = ANSI_FG[n];
      else if (ANSI_BG[n]) style.backgroundColor = ANSI_BG[n];
    }
    last = m.index + m[0].length;
  }
  if (last < code.length) runs.push({ text: code.slice(last), style });
  return runs;
}

export const stripAnsi = (code) => code.replace(/\u001b\[[\d;]*m/g, '');

// Csak emojikból álló rövid üzenet, amit a Discordhoz hasonlóan nagyban jelenítünk meg
export function isEmojiOnly(text) {
  const compact = (text || '').replace(/\s/g, '');
  return (
    compact.length > 0 &&
    compact.length <= 120 &&
    /\p{Extended_Pictographic}/u.test(compact) &&
    /^(?:\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}️‍])+$/u.test(compact)
  );
}

// A szerkesztő előnézete csak akkor kell, ha van mit formázni
export const hasMarkup = (text) => /[*_~|`{#>[<]|^\s*[-+\d]|:[a-z0-9_+-]+:/m.test(text || '');
