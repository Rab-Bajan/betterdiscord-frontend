import { describe, it, expect } from 'vitest';
import { findNode, updateFileInTree, type CodeTreeNode } from '../../../src/shared/lib/codeTree';

const tree = (): CodeTreeNode => ({
  id: 'root', name: 'Projekt', type: 'folder', children: [
    { id: 'a', name: 'a.js', type: 'file', content: 'A' },
    { id: 'src', name: 'src', type: 'folder', children: [{ id: 'b', name: 'b.py', type: 'file', content: 'B' }] },
    { id: 'empty', name: 'empty', type: 'folder', children: [] }
  ]
});

describe('findNode', () => {
  it('finds the root, files and nested files', () => {
    const t = tree();
    expect(findNode(t, 'root')).toBe(t);
    expect(findNode(t, 'b')?.name).toBe('b.py');
    expect(findNode(t, 'src')?.type).toBe('folder');
  });
  it('returns null for unknown ids or no tree', () => {
    expect(findNode(tree(), 'zz')).toBeNull();
    expect(findNode(null, 'a')).toBeNull();
    expect(findNode(undefined, 'a')).toBeNull();
  });
});

describe('updateFileInTree', () => {
  it('replaces a nested file immutably, sharing untouched subtrees', () => {
    const t = tree();
    const next = updateFileInTree(t, 'b', 'B2');
    expect(next).not.toBe(t);
    expect(findNode(next, 'b')).toMatchObject({ content: 'B2' });
    expect(findNode(t, 'b')).toMatchObject({ content: 'B' }); // original untouched
    if (next.type !== 'folder' || t.type !== 'folder') throw new Error('root must be a folder');
    expect(next.children[0]).toBe(t.children[0]);
    expect(next.children[2]).toBe(t.children[2]);
    expect(next.children[1]).not.toBe(t.children[1]);
  });
  it('returns the same tree when nothing changes', () => {
    const t = tree();
    expect(updateFileInTree(t, 'a', 'A')).toBe(t);
    expect(updateFileInTree(t, 'zz', 'x')).toBe(t);
  });
  it('never writes content into folders', () => {
    const t = tree();
    expect(updateFileInTree(t, 'src', 'x')).toBe(t);
    expect(updateFileInTree(t, 'root', 'x')).toBe(t);
  });
  it('passes null/undefined through', () => {
    expect(updateFileInTree(null, 'a', 'x')).toBeNull();
    expect(updateFileInTree(undefined, 'a', 'x')).toBeUndefined();
  });
});
