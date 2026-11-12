// Fájlfa segédfüggvények a közös kód editorhoz

export interface CodeFileNode {
  id: string;
  name: string;
  type: 'file';
  content: string;
  children?: undefined;
}

export interface CodeFolderNode {
  id: string;
  name: string;
  type: 'folder';
  children: CodeTreeNode[];
  content?: undefined;
}

export type CodeTreeNode = CodeFileNode | CodeFolderNode;

export function findNode(node: CodeTreeNode | null | undefined, id: string): CodeTreeNode | null {
  if (!node) return null;
  if (node.id === id) return node;
  for (const child of node.children || []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

// Immutábilisan lecseréli egy fájl tartalmát; ha nem változott, ugyanazt a fát adja vissza
export function updateFileInTree(node: CodeTreeNode, fileId: string, content: string): CodeTreeNode;
export function updateFileInTree<T extends null | undefined>(node: T, fileId: string, content: string): T;
export function updateFileInTree(node: CodeTreeNode | null | undefined, fileId: string, content: string): CodeTreeNode | null | undefined;
export function updateFileInTree(node: CodeTreeNode | null | undefined, fileId: string, content: string): CodeTreeNode | null | undefined {
  if (!node) return node;
  if (node.id === fileId && node.type === 'file') {
    return node.content === content ? node : { ...node, content };
  }
  if (!node.children) return node;
  let changed = false;
  const children = node.children.map((child) => {
    const next = updateFileInTree(child, fileId, content);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? { ...node, children } : node;
}

/** A code tree as sent by the server (`code:tree-data`): checked at the root, children trusted. */
export const isCodeTreeNode = (value: unknown): value is CodeTreeNode =>
  typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string'
  && 'type' in value && (value.type === 'file' || value.type === 'folder');
