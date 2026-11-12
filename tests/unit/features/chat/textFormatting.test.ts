import { describe, it, expect } from 'vitest';
import { applyStyle, insertLink, prefixLines, shortcutTransform, wrapSelection } from '../../../../src/features/chat/lib/textFormatting';

describe('wrapSelection', () => {
  it('wraps the selection and keeps it selected', () => {
    expect(wrapSelection('hello world', 6, 11, '**', '**')).toEqual({ value: 'hello **world**', start: 8, end: 13 });
  });
  it('unwraps a selection that includes the markers', () => {
    expect(wrapSelection('hello **world**', 6, 15, '**', '**')).toEqual({ value: 'hello world', start: 6, end: 11 });
  });
  it('unwraps when the markers surround the selection', () => {
    expect(wrapSelection('a *b* c', 3, 4, '*', '*')).toEqual({ value: 'a b c', start: 2, end: 3 });
  });
});

describe('prefixLines', () => {
  it('prefixes every touched line, and removes the prefix when all lines have it', () => {
    expect(prefixLines('one\ntwo\nthree', 0, 5, '> ')).toEqual({ value: '> one\n> two\nthree', start: 11, end: 11 });
    expect(prefixLines('> one\n> two', 0, 9, '> ').value).toBe('one\ntwo');
  });
});

describe('applyStyle', () => {
  it('styles the whole text without a selection, replacing an existing style', () => {
    expect(applyStyle('hi', 0, 0, 'red')).toEqual({ value: '{red}hi{/}', start: 10, end: 10 });
    expect(applyStyle('{red}hi{/}', 0, 0, 'blue').value).toBe('{blue}hi{/}');
  });
  it('puts the caret inside the tag for empty text', () => {
    expect(applyStyle('', 0, 0, 'fire')).toEqual({ value: '{fire}{/}', start: 6, end: 6 });
  });
});

describe('insertLink', () => {
  it('turns a selected url into a link with a placeholder label', () => {
    expect(insertLink('see https://x.hu', 4, 16)).toEqual({ value: 'see [szöveg](https://x.hu)', start: 5, end: 11 });
  });
  it('turns selected text into a label and selects after the url placeholder', () => {
    expect(insertLink('docs', 0, 4)).toEqual({ value: '[docs](https://)', start: 15, end: 15 });
  });
});

describe('shortcutTransform', () => {
  it('maps Ctrl+B/I/U and ignores other keys', () => {
    expect(shortcutTransform('B')?.('x', 0, 1).value).toBe('**x**');
    expect(shortcutTransform('i')?.('x', 0, 1).value).toBe('*x*');
    expect(shortcutTransform('u')?.('x', 0, 1).value).toBe('__x__');
    expect(shortcutTransform('k')).toBeNull();
  });
});
