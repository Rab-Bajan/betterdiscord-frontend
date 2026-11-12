import React, { type MouseEvent } from 'react';
import { Folder, FolderOpen, FilePlus, FolderPlus, ChevronRight, ChevronDown, Trash2, Edit2 } from 'lucide-react';
import type { CodeFileNode, CodeTreeNode } from '../../../../shared/lib/codeTree';
import CodeFileIcon from './CodeFileIcon';

export type CodeNodeType = CodeTreeNode['type'];

export interface CodeFileTreeHandlers {
  expandedFolders: Readonly<Record<string, boolean>>;
  activeFileId: string | null;
  onToggleFolder: (folderId: string) => void;
  onOpenFile: (file: CodeFileNode) => void;
  onCreate: (type: CodeNodeType, parentId: string) => void;
  onRename: (node: CodeTreeNode) => void;
  onDelete: (node: CodeTreeNode, e: MouseEvent) => void;
}

interface CodeFileTreeProps extends CodeFileTreeHandlers {
  node: CodeTreeNode | null;
  depth?: number;
}

// Rekurzív fájlfa: mappák lenyitható ágakkal, fájlok megnyitással; műveletek hover-re
export default function CodeFileTree({ node, depth = 0, ...handlers }: CodeFileTreeProps) {
  const { expandedFolders, activeFileId, onToggleFolder, onOpenFile, onCreate, onRename, onDelete } = handlers;
  if (!node) return null;

  if (node.type === 'folder') {
    const isExpanded = !!expandedFolders[node.id];
    const isRoot = node.id === 'root';

    return (
      <div className="w-full">
        {!isRoot && (
          <div
            className={`flex items-center justify-between py-1 px-2 rounded-md hover:bg-shark-elevated-hover/60 cursor-pointer group text-xs text-shark-text transition`}
            style={{ paddingLeft: `${depth * 12 + 6}px` }}
            onClick={() => onToggleFolder(node.id)}
          >
            <div className="flex items-center gap-1.5 truncate">
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-shark-muted flex-shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-shark-muted flex-shrink-0" />
              )}
              {isExpanded ? (
                <FolderOpen className="w-4 h-4 text-shark-purple flex-shrink-0" />
              ) : (
                <Folder className="w-4 h-4 text-shark-purple flex-shrink-0" />
              )}
              <span className="truncate font-medium">{node.name}</span>
            </div>

            {/* Műveletek a mappán */}
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                title="Új fájl ide"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreate('file', node.id);
                }}
                className="p-1 hover:text-white rounded transition"
              >
                <FilePlus className="w-3 h-3 text-shark-muted" />
              </button>
              <button
                type="button"
                title="Új almappa ide"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreate('folder', node.id);
                }}
                className="p-1 hover:text-white rounded transition"
              >
                <FolderPlus className="w-3 h-3 text-shark-muted" />
              </button>
              <button
                type="button"
                title="Átnevezés"
                onClick={(e) => {
                  e.stopPropagation();
                  onRename(node);
                }}
                className="p-1 hover:text-white rounded transition"
              >
                <Edit2 className="w-3 h-3 text-shark-muted" />
              </button>
              <button
                type="button"
                title="Törlés"
                onClick={(e) => onDelete(node, e)}
                className="p-1 hover:text-shark-red rounded transition"
              >
                <Trash2 className="w-3 h-3 text-shark-muted" />
              </button>
            </div>
          </div>
        )}

        {/* Mappa gyermekei */}
        {(isRoot || isExpanded) && (
          <div className="space-y-0.5">
            {node.children?.map((child) => <CodeFileTree key={child.id} {...handlers} node={child} depth={isRoot ? 0 : depth + 1} />)}
          </div>
        )}
      </div>
    );
  }

  // Fájl elem
  const isActive = node.id === activeFileId;
  return (
    <div
      className={`flex items-center justify-between py-1 px-2 rounded-md cursor-pointer group text-xs transition ${
        isActive
          ? 'bg-shark-elevated text-white font-medium'
          : 'text-shark-muted hover:bg-shark-elevated-hover/50 hover:text-shark-text'
      }`}
      style={{ paddingLeft: `${depth * 12 + 18}px` }}
      onClick={() => onOpenFile(node)}
    >
      <div className="flex items-center gap-2 truncate">
        <CodeFileIcon filename={node.name} />
        <span className="truncate">{node.name}</span>
      </div>

      {/* Fájl műveletek hover-re */}
      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          title="Átnevezés"
          onClick={(e) => {
            e.stopPropagation();
            onRename(node);
          }}
          className="p-1 hover:text-white rounded transition"
        >
          <Edit2 className="w-3 h-3 text-shark-muted" />
        </button>
        <button
          type="button"
          title="Törlés"
          onClick={(e) => onDelete(node, e)}
          className="p-1 hover:text-shark-red rounded transition"
        >
          <Trash2 className="w-3 h-3 text-shark-muted" />
        </button>
      </div>
    </div>
  );
}
