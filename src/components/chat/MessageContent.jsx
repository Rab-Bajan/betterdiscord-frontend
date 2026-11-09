import React, { memo, useMemo, useState } from 'react';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-diff';
import { isEmojiOnly, parseAnsi, parseMessage, stripAnsi } from '../../utils/messageMarkup';
import CopyButton from './CopyButton';

const EMOJI_SPLIT = /(\p{Extended_Pictographic}(?:️|[\u{1F3FB}-\u{1F3FF}]|‍\p{Extended_Pictographic})*)/gu;
const MAX_ANIMATED_CHARS = 300;

const graphemes = (text) =>
  typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment)
    : Array.from(text);

function formatTimestamp(ms, format) {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return String(ms);

  if (format === 'R') {
    const seconds = Math.round((ms - Date.now()) / 1000);
    const rtf = new Intl.RelativeTimeFormat('hu', { numeric: 'auto' });
    const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
    for (const [unit, size] of units) {
      if (Math.abs(seconds) >= size) return rtf.format(Math.trunc(seconds / size), unit);
    }
    return rtf.format(seconds, 'second');
  }

  const options = {
    t: { timeStyle: 'short' },
    T: { timeStyle: 'medium' },
    d: { dateStyle: 'short' },
    D: { dateStyle: 'long' },
    f: { dateStyle: 'long', timeStyle: 'short' },
    F: { dateStyle: 'full', timeStyle: 'short' }
  }[format];
  return new Intl.DateTimeFormat('hu-HU', options).format(date);
}

function Spoiler({ children }) {
  const [revealed, setRevealed] = useState(false);
  if (revealed) return <span className="md-spoiler md-spoiler-open">{children}</span>;

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label="Spoiler megjelenítése"
      title="Kattints a megjelenítéshez"
      className="md-spoiler"
      onClick={(e) => {
        e.stopPropagation();
        setRevealed(true);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setRevealed(true);
        }
      }}
    >
      {children}
    </span>
  );
}

function renderPrismTokens(tokens) {
  return tokens.map((token, i) => {
    if (typeof token === 'string') return token;
    const alias = Array.isArray(token.alias) ? token.alias.join(' ') : token.alias || '';
    const content = Array.isArray(token.content)
      ? renderPrismTokens(token.content)
      : renderPrismTokens([token.content]);
    return (
      <span key={i} className={`token ${token.type} ${alias}`}>
        {content}
      </span>
    );
  });
}

function CodeBlock({ node }) {
  const [revealed, setRevealed] = useState(!node.spoiler);
  const isAnsi = node.lang === 'ansi';
  const copyText = isAnsi ? stripAnsi(node.code) : node.code;
  const grammar = !isAnsi && node.lang ? Prism.languages[node.lang] : null;

  const body = useMemo(() => {
    if (isAnsi) {
      return parseAnsi(node.code).map((run, i) => (
        <span key={i} style={run.style}>
          {run.text}
        </span>
      ));
    }
    return grammar ? renderPrismTokens(Prism.tokenize(node.code, grammar)) : node.code;
  }, [node.code, isAnsi, grammar]);

  return (
    <div className="md-codeblock group/code">
      {node.lang && <div className="md-codeblock-lang">{node.lang}</div>}
      <pre
        className={revealed ? undefined : 'md-codeblock-hidden'}
        aria-hidden={!revealed}
      >
        <code>{body}</code>
      </pre>
      {revealed ? (
        <CopyButton
          text={copyText}
          title="Kód másolása"
          label="Másolás"
          className="md-codeblock-copy opacity-0 group-hover/code:opacity-100 focus:opacity-100"
        />
      ) : (
        <button type="button" className="md-codeblock-reveal" onClick={() => setRevealed(true)}>
          SPOILER
        </button>
      )}
    </div>
  );
}

// A színátmenetes szöveg átlátszó betűi az emojikat is eltüntetnék, ezért azokat külön jelöljük
function renderGradientText(value) {
  return value
    .split(EMOJI_SPLIT)
    .map((part, i) => (i % 2 === 1 ? <span key={i} className="md-emoji">{part}</span> : part));
}

function renderWaveText(value) {
  const chars = graphemes(value);
  if (chars.length > MAX_ANIMATED_CHARS) return value;
  return chars.map((char, i) =>
    /\s/.test(char) ? (
      char
    ) : (
      <span key={i} className="md-wave-char" style={{ animationDelay: `${(i % 24) * 70}ms` }}>
        {char}
      </span>
    )
  );
}

const GRADIENT_EFFECTS = new Set(['rainbow', 'fire', 'ocean', 'sunset']);

function renderStyle(node, key, ctx) {
  const { style } = node;

  if (style.kind === 'color') {
    return (
      <span key={key} style={{ color: style.color }}>
        {renderInline(node.children, { ...ctx, gradient: false, wave: false })}
      </span>
    );
  }

  if (style.kind === 'gradient') {
    return (
      <span
        key={key}
        className="md-gradient"
        style={{ backgroundImage: `linear-gradient(90deg, ${style.colors.join(', ')})` }}
      >
        {renderInline(node.children, { ...ctx, gradient: true })}
      </span>
    );
  }

  const { effect } = style;
  const childCtx = {
    ...ctx,
    gradient: ctx.gradient || GRADIENT_EFFECTS.has(effect),
    wave: ctx.wave || effect === 'wave'
  };
  return (
    <span key={key} className={`md-fx-${effect} ${GRADIENT_EFFECTS.has(effect) ? 'md-gradient' : ''}`}>
      {renderInline(node.children, childCtx)}
    </span>
  );
}

function renderText(value, ctx) {
  if (ctx.wave) return renderWaveText(value);
  if (ctx.gradient) return renderGradientText(value);
  return value;
}

function renderInline(nodes, ctx = {}) {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'text':
        return <React.Fragment key={i}>{renderText(node.value, ctx)}</React.Fragment>;
      case 'bold':
        return <strong key={i} className="font-bold">{renderInline(node.children, ctx)}</strong>;
      case 'italic':
        return <em key={i} className="italic">{renderInline(node.children, ctx)}</em>;
      case 'underline':
        return <u key={i} className="underline">{renderInline(node.children, ctx)}</u>;
      case 'strike':
        return <s key={i} className="line-through">{renderInline(node.children, ctx)}</s>;
      case 'code':
        return <code key={i} className="md-inline-code">{node.value}</code>;
      case 'spoiler':
        return <Spoiler key={i}>{renderInline(node.children, ctx)}</Spoiler>;
      case 'link':
        return (
          <a
            key={i}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            title={node.href}
            className="md-link"
          >
            {renderInline(node.children, ctx)}
          </a>
        );
      case 'mention':
        return <span key={i} className="md-mention">@{node.name}</span>;
      case 'timestamp':
        return (
          <time key={i} className="md-timestamp" dateTime={new Date(node.ms).toISOString()} title={formatTimestamp(node.ms, 'F')}>
            {formatTimestamp(node.ms, node.format)}
          </time>
        );
      case 'style':
        return renderStyle(node, i, ctx);
      default:
        return null;
    }
  });
}

const HEADING_CLASS = { 1: 'md-h1', 2: 'md-h2', 3: 'md-h3' };

function renderBlocks(blocks) {
  return blocks.map((block, i) => {
    switch (block.type) {
      case 'paragraph':
        return <div key={i}>{renderInline(block.children)}</div>;
      case 'heading':
        return <div key={i} role="heading" aria-level={block.level} className={HEADING_CLASS[block.level]}>{renderInline(block.children)}</div>;
      case 'subtext':
        return <div key={i} className="md-subtext">{renderInline(block.children)}</div>;
      case 'quote':
        return <blockquote key={i} className="md-quote">{renderBlocks(block.children)}</blockquote>;
      case 'codeblock':
        return <CodeBlock key={i} node={block} />;
      case 'list':
        return (
          <div key={i} role="list" className="md-list">
            {block.items.map((item, j) => (
              <div key={j} role="listitem" className="flex gap-2" style={{ marginLeft: item.indent * 20 }}>
                <span className="flex-shrink-0 select-none" style={{ color: '#999BBE' }}>{item.marker || '•'}</span>
                <span className="min-w-0">{renderInline(item.children)}</span>
              </div>
            ))}
          </div>
        );
      default:
        return null;
    }
  });
}

function MessageContent({ text, className = '' }) {
  const blocks = useMemo(() => parseMessage(text), [text]);
  const jumbo = useMemo(() => isEmojiOnly(text), [text]);
  return <div className={`md-root ${jumbo ? 'md-jumbo' : ''} ${className}`}>{renderBlocks(blocks)}</div>;
}

export default memo(MessageContent);
