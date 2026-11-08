// Fájlfa segédfüggvények a közös kód editorhoz

export function findNode(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  for (const child of node.children || []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

// Immutábilisan lecseréli egy fájl tartalmát; ha nem változott, ugyanazt a fát adja vissza
export function updateFileInTree(node, fileId, content) {
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
