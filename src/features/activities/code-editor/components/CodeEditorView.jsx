import React, { useState, useEffect, useRef, useMemo } from 'react';
import Prism from 'prismjs';
import { findNode } from '../../../../shared/lib/codeTree';
import 'prismjs/themes/prism-tomorrow.css';

// Prism nyelvi komponensek
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-sql';

import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  FilePlus,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  Trash2,
  Edit2,
  Download,
  X,
  Code2,
  Copy,
  Check,
  CheckCircle2,
  Info
} from 'lucide-react';

function getLanguageFromFilename(filename = '') {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'jsx':
      return 'jsx';
    case 'ts':
      return 'typescript';
    case 'tsx':
      return 'tsx';
    case 'html':
    case 'htm':
    case 'svg':
    case 'xml':
      return 'markup';
    case 'css':
    case 'scss':
    case 'less':
      return 'css';
    case 'py':
      return 'python';
    case 'json':
      return 'json';
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'c':
    case 'h':
      return 'c';
    case 'cpp':
    case 'cc':
    case 'hpp':
      return 'cpp';
    case 'java':
      return 'java';
    case 'sql':
      return 'sql';
    default:
      return 'javascript';
  }
}

function getFileIcon(filename = '') {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
      return <FileCode className="w-4 h-4 text-shark-gold flex-shrink-0" />;
    case 'py':
      return <FileCode className="w-4 h-4 text-shark-purple flex-shrink-0" />;
    case 'html':
      return <FileCode className="w-4 h-4 text-shark-red flex-shrink-0" />;
    case 'css':
      return <FileCode className="w-4 h-4 text-shark-blue flex-shrink-0" />;
    case 'json':
      return <FileCode className="w-4 h-4 text-shark-green flex-shrink-0" />;
    default:
      return <FileText className="w-4 h-4 text-shark-muted flex-shrink-0" />;
  }
}

export default function CodeEditorView({
  channelId,
  socket,
  currentUser,
  treeData,
  onLocalChange,
  onClose
}) {
  const [openFiles, setOpenFiles] = useState([]); // Array of fileIds
  const [showTree, setShowTree] = useState(false); // Fájlfa kapcsoló kis képernyőn (csak megjelenítés)
  const [activeFileId, setActiveFileId] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState({ root: true, 'folder-src': true });
  const [activeEditorNotification, setActiveEditorNotification] = useState(null);
  const [copied, setCopied] = useState(false);

  // Modals for Create/Rename
  const [createModal, setCreateModal] = useState({ isOpen: false, type: 'file', parentId: 'root' });
  const [renameModal, setRenameModal] = useState({ isOpen: false, nodeId: null, currentName: '' });
  const [modalInput, setModalInput] = useState('');

  const textareaRef = useRef(null);
  const preRef = useRef(null);
  const lineNumbersRef = useRef(null);
  const notificationTimeoutRef = useRef(null);

  const activeFileNode = useMemo(() => {
    return activeFileId ? findNode(treeData, activeFileId) : null;
  }, [treeData, activeFileId]);

  // Első fájl automatikus megnyitása (csak egyszer, hogy az utolsó fül is bezárható legyen)
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current || !treeData?.children) return;
    autoOpenedRef.current = true;
    const firstFile = treeData.children.find((c) => c.type === 'file');
    if (firstFile) {
      setActiveFileId(firstFile.id);
      setOpenFiles([firstFile.id]);
    }
  }, [treeData]);

  // Más által törölt fájlok fülei és az aktív fájl takarítása
  useEffect(() => {
    if (!treeData) return;
    setOpenFiles((prev) => {
      const alive = prev.filter((id) => findNode(treeData, id));
      return alive.length === prev.length ? prev : alive;
    });
    setActiveFileId((prev) => (prev && !findNode(treeData, prev) ? null : prev));
  }, [treeData]);

  // Távoli fájlmódosítás figyelése
  useEffect(() => {
    if (!socket) return;

    const handleFileUpdated = ({ fileId, content, senderName }) => {
      // Értesítés megjelenítése
      setActiveEditorNotification(`${senderName} épp szerkeszt...`);
      if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
      notificationTimeoutRef.current = setTimeout(() => {
        setActiveEditorNotification(null);
      }, 1500);
    };

    socket.on('code:file-updated', handleFileUpdated);

    return () => {
      socket.off('code:file-updated', handleFileUpdated);
      if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
    };
  }, [socket]);

  // Szinkronizált görgetés
  const handleScroll = (e) => {
    const { scrollTop, scrollLeft } = e.target;
    if (preRef.current) {
      preRef.current.scrollTop = scrollTop;
      preRef.current.scrollLeft = scrollLeft;
    }
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = scrollTop;
    }
  };

  // Kódszerkesztés esemény
  const handleCodeChange = (e) => {
    if (!activeFileId || !activeFileNode) return;
    const newContent = e.target.value;

    // Először helyben frissítjük a fát (különben a vezérelt textarea visszaugrana), majd továbbítjuk
    onLocalChange?.(activeFileId, newContent);
    socket?.emit('code:file-change', {
      channelId,
      fileId: activeFileId,
      content: newContent
    });
  };

  // Tab billentyű (2 szóköz behúzás)
  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;

      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      textarea.value = newValue;
      textarea.selectionStart = textarea.selectionEnd = start + 2;

      handleCodeChange({ target: textarea });
    }
  };

  // Fájl megnyitása
  const handleOpenFile = (file) => {
    if (!openFiles.includes(file.id)) {
      setOpenFiles((prev) => [...prev, file.id]);
    }
    setActiveFileId(file.id);
  };

  // Fül bezárása
  const handleCloseTab = (fileId, e) => {
    e.stopPropagation();
    const updated = openFiles.filter((id) => id !== fileId);
    setOpenFiles(updated);
    if (activeFileId === fileId) {
      setActiveFileId(updated[updated.length - 1] || null);
    }
  };

  // Mappa lenyitás / becsukás
  const toggleFolder = (folderId) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  // Létrehozás (Fájl vagy Mappa)
  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!modalInput.trim()) return;

    socket?.emit('code:create-node', {
      channelId,
      parentId: createModal.parentId,
      name: modalInput.trim(),
      type: createModal.type
    });

    setCreateModal({ isOpen: false, type: 'file', parentId: 'root' });
    setModalInput('');
  };

  // Átnevezés
  const handleRenameSubmit = (e) => {
    e.preventDefault();
    if (!modalInput.trim() || !renameModal.nodeId) return;

    socket?.emit('code:rename-node', {
      channelId,
      nodeId: renameModal.nodeId,
      newName: modalInput.trim()
    });

    setRenameModal({ isOpen: false, nodeId: null, currentName: '' });
    setModalInput('');
  };

  // Törlés
  const handleDeleteNode = (node, e) => {
    e.stopPropagation();
    if (window.confirm(`Biztosan törölni szeretnéd a(z) "${node.name}" ${node.type === 'folder' ? 'mappát és tartalmát' : 'fájlt'}?`)) {
      socket?.emit('code:delete-node', {
        channelId,
        nodeId: node.id
      });
      if (openFiles.includes(node.id)) {
        handleCloseTab(node.id, e);
      }
    }
  };

  // Másolás vágólapra
  const handleCopyCode = () => {
    if (!activeFileNode?.content) return;
    navigator.clipboard.writeText(activeFileNode.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Letöltés
  const handleDownloadFile = () => {
    if (!activeFileNode) return;
    const blob = new Blob([activeFileNode.content || ''], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = activeFileNode.name;
    link.click();
  };

  // Prism szintaxis színezés
  const highlightedCode = useMemo(() => {
    if (!activeFileNode) return '';
    const code = activeFileNode.content || '';
    const lang = getLanguageFromFilename(activeFileNode.name);
    try {
      if (Prism.languages[lang]) {
        return Prism.highlight(code, Prism.languages[lang], lang);
      }
    } catch (e) {
      console.warn('Prism highlight hiba:', e);
    }
    return code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }, [activeFileNode?.content, activeFileNode?.name]);

  const lineCount = useMemo(() => {
    if (!activeFileNode?.content) return 1;
    return activeFileNode.content.split('\n').length;
  }, [activeFileNode?.content]);

  // Rekurzív Fájlfa Rajzoló
  const renderTree = (node, depth = 0) => {
    if (!node) return null;

    if (node.type === 'folder') {
      const isExpanded = !!expandedFolders[node.id];
      const isRoot = node.id === 'root';

      return (
        <div key={node.id} className="w-full">
          {!isRoot && (
            <div
              className={`flex items-center justify-between py-1 px-2 rounded-md hover:bg-shark-elevated-hover/60 cursor-pointer group text-xs text-shark-text transition`}
              style={{ paddingLeft: `${depth * 12 + 6}px` }}
              onClick={() => toggleFolder(node.id)}
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
                    setCreateModal({ isOpen: true, type: 'file', parentId: node.id });
                    setModalInput('');
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
                    setCreateModal({ isOpen: true, type: 'folder', parentId: node.id });
                    setModalInput('');
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
                    setRenameModal({ isOpen: true, nodeId: node.id, currentName: node.name });
                    setModalInput(node.name);
                  }}
                  className="p-1 hover:text-white rounded transition"
                >
                  <Edit2 className="w-3 h-3 text-shark-muted" />
                </button>
                <button
                  type="button"
                  title="Törlés"
                  onClick={(e) => handleDeleteNode(node, e)}
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
              {node.children?.map((child) => renderTree(child, isRoot ? 0 : depth + 1))}
            </div>
          )}
        </div>
      );
    }

    // Fájl elem
    const isActive = node.id === activeFileId;
    return (
      <div
        key={node.id}
        className={`flex items-center justify-between py-1 px-2 rounded-md cursor-pointer group text-xs transition ${
          isActive
            ? 'bg-shark-elevated text-white font-medium'
            : 'text-shark-muted hover:bg-shark-elevated-hover/50 hover:text-shark-text'
        }`}
        style={{ paddingLeft: `${depth * 12 + 18}px` }}
        onClick={() => handleOpenFile(node)}
      >
        <div className="flex items-center gap-2 truncate">
          {getFileIcon(node.name)}
          <span className="truncate">{node.name}</span>
        </div>

        {/* Fájl műveletek hover-re */}
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            title="Átnevezés"
            onClick={(e) => {
              e.stopPropagation();
              setRenameModal({ isOpen: true, nodeId: node.id, currentName: node.name });
              setModalInput(node.name);
            }}
            className="p-1 hover:text-white rounded transition"
          >
            <Edit2 className="w-3 h-3 text-shark-muted" />
          </button>
          <button
            type="button"
            title="Törlés"
            onClick={(e) => handleDeleteNode(node, e)}
            className="p-1 hover:text-shark-red rounded transition"
          >
            <Trash2 className="w-3 h-3 text-shark-muted" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-shark-bg h-full relative select-none overflow-hidden">
      {/* 1. Felső Fejléc */}
      <div className="h-12 border-b border-shark-card px-4 flex items-center justify-between shadow-sm bg-shark-bg flex-shrink-0 z-20">
        <div className="flex items-center gap-2 truncate min-w-0">
          <button
            type="button"
            onClick={() => setShowTree((v) => !v)}
            title="Fájlfa megjelenítése / elrejtése"
            className="md:hidden p-2 -ml-2 rounded-xl bg-shark-elevated text-shark-text flex-shrink-0"
          >
            <Folder className="w-4 h-4" />
          </button>
          <Code2 className="w-5 h-5 text-shark-purple flex-shrink-0" />
          <span className="font-bold text-shark-text truncate">
            Közös Kód Editor (Valós idejű megosztás)
          </span>
          <span className="text-xs bg-shark-purple/20 text-shark-purple px-2 py-0.5 rounded-full font-semibold hidden sm:inline-block">
            Szerkesztő Mód
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {activeEditorNotification && (
            <div className="flex items-center gap-1.5 text-xs text-shark-green bg-shark-green/10 px-2.5 py-1 rounded-full animate-pulse border border-shark-green/30">
              <span className="w-2 h-2 rounded-full bg-shark-green" />
              <span>{activeEditorNotification}</span>
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            title="Bezárás (Vissza a szoba nézethez)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-shark-panel hover:bg-shark-elevated-hover text-shark-text text-xs font-semibold transition"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Bezárás</span>
          </button>
        </div>
      </div>

      {/* 2. Fő Munkaterület: Bal oldalon Fájlfa, Jobb oldalon Kódszerkesztő */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Bal Oldal: Fájlkezelő Explorer */}
        <div className={`${showTree ? 'flex absolute inset-y-0 left-0 z-30 shadow-2xl' : 'hidden'} md:flex md:static w-60 max-w-[80%] bg-shark-panel border-r border-shark-card flex-col flex-shrink-0 select-none`}>
          <div className="p-2.5 border-b border-shark-card flex items-center justify-between text-xs font-bold text-shark-muted uppercase tracking-wider">
            <span>Fájlok & Mappák</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setCreateModal({ isOpen: true, type: 'file', parentId: 'root' });
                  setModalInput('');
                }}
                title="Új fájl létrehozása a gyökérben"
                className="p-1 hover:bg-shark-elevated-hover text-shark-muted hover:text-white rounded transition"
              >
                <FilePlus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreateModal({ isOpen: true, type: 'folder', parentId: 'root' });
                  setModalInput('');
                }}
                title="Új mappa létrehozása a gyökérben"
                className="p-1 hover:bg-shark-elevated-hover text-shark-muted hover:text-white rounded transition"
              >
                <FolderPlus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Fájlfa lista */}
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {renderTree(treeData)}
          </div>

          <div className="p-2 border-t border-shark-card/50 text-[11px] text-shark-muted flex items-center gap-1">
            <Info className="w-3.5 h-3.5 flex-shrink-0 text-shark-purple" />
            <span>Kód futtatás letiltva</span>
          </div>
        </div>

        {/* Jobb Oldal: Szerkesztő Felület */}
        <div className="flex-1 flex flex-col min-w-0 bg-shark-bg overflow-hidden">
          {/* Fülek sávja (Open Tabs) */}
          <div className="h-10 bg-shark-panel/60 border-b border-shark-card flex items-center px-2 gap-1 overflow-x-auto scrollbar-none flex-shrink-0">
            {openFiles.map((fileId) => {
              const fileNode = findNode(treeData, fileId);
              if (!fileNode) return null;
              const isActive = fileId === activeFileId;

              return (
                <div
                  key={fileId}
                  onClick={() => setActiveFileId(fileId)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-t-md text-xs font-medium cursor-pointer transition flex-shrink-0 border-t-2 ${
                    isActive
                      ? 'bg-shark-bg text-shark-text border-shark-purple'
                      : 'text-shark-muted hover:bg-shark-panel hover:text-shark-text border-transparent'
                  }`}
                >
                  {getFileIcon(fileNode.name)}
                  <span className="truncate max-w-[140px]">{fileNode.name}</span>
                  <button
                    type="button"
                    onClick={(e) => handleCloseTab(fileId, e)}
                    className="p-0.5 rounded hover:bg-shark-elevated-hover text-shark-muted hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}

            {activeFileNode && (
              <div className="ml-auto flex items-center gap-1.5 pr-2">
                <button
                  type="button"
                  onClick={handleCopyCode}
                  title="Kód másolása"
                  className="p-1 rounded hover:bg-shark-elevated-hover text-shark-muted hover:text-white transition flex items-center gap-1 text-xs"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-shark-green" /> : <Copy className="w-3.5 h-3.5" />}
                  <span className="hidden md:inline">{copied ? 'Másolva!' : 'Másolás'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadFile}
                  title="Fájl letöltése gépre"
                  className="p-1 rounded hover:bg-shark-elevated-hover text-shark-muted hover:text-white transition flex items-center gap-1 text-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Letöltés</span>
                </button>
              </div>
            )}
          </div>

          {/* Kódszerkesztő Törzs */}
          {activeFileNode ? (
            <div className="flex-1 flex flex-col min-h-0 relative">
              <div className="flex-1 flex min-h-0 overflow-hidden relative font-mono text-sm">
                {/* Sorszámok oszlopa */}
                <div
                  ref={lineNumbersRef}
                  className="w-12 bg-shark-bg/90 border-r border-shark-card/50 py-3 text-right pr-3 text-shark-muted/40 select-none overflow-hidden leading-6"
                >
                  {Array.from({ length: lineCount }, (_, i) => (
                    <div key={i + 1}>{i + 1}</div>
                  ))}
                </div>

                {/* Kódréteg és Textarea réteg szinkronban */}
                <div className="flex-1 relative overflow-hidden bg-[#2d2d2d]">
                  {/* Szintaxis kiemelt háttérréteg */}
                  <pre
                    ref={preRef}
                    aria-hidden="true"
                    className="absolute inset-0 m-0 p-3 overflow-hidden pointer-events-none leading-6 whitespace-pre font-mono"
                    dangerouslySetInnerHTML={{ __html: highlightedCode + '<br/>' }}
                  />

                  {/* Interaktív láthatatlan szövegbeviteli mező pontosan rajta */}
                  <textarea
                    ref={textareaRef}
                    value={activeFileNode.content || ''}
                    onChange={handleCodeChange}
                    onKeyDown={handleKeyDown}
                    onScroll={handleScroll}
                    spellCheck="false"
                    autoCapitalize="off"
                    autoComplete="off"
                    autoCorrect="off"
                    className="absolute inset-0 w-full h-full m-0 p-3 bg-transparent text-transparent caret-white outline-none resize-none leading-6 whitespace-pre font-mono selection:bg-shark-purple/40 overflow-auto"
                  />
                </div>
              </div>

              {/* Alsó Státusz Sáv */}
              <div className="h-7 bg-shark-panel border-t border-shark-card px-3 flex items-center justify-between gap-4 text-xs text-shark-muted flex-shrink-0 select-none overflow-x-auto scrollbar-none whitespace-nowrap [&>*]:flex-shrink-0">
                <div className="flex items-center gap-3">
                  <span>Nyelv: <strong className="text-shark-text capitalize">{getLanguageFromFilename(activeFileNode.name)}</strong></span>
                  <span>•</span>
                  <span>Sorok: {lineCount}</span>
                  <span>•</span>
                  <span>Karakterek: {(activeFileNode.content || '').length}</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] bg-shark-purple/20 text-shark-purple px-1.5 py-0.2 rounded font-semibold">
                    UTF-8
                  </span>
                  <span>Valós idejű szinkronizáció aktív</span>
                </div>
              </div>
            </div>
          ) : (
            /* Üres állapot */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none">
              <div className="w-16 h-16 rounded-2xl bg-shark-panel flex items-center justify-center text-shark-purple mb-3 shadow">
                <Code2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-shark-text mb-1">
                Közös Kód Editor
              </h3>
              <p className="text-xs text-shark-muted max-w-sm mb-4">
                Válassz ki egy fájlt a bal oldali fájlfából a szerkesztéshez, vagy hozz létre egy újat a <strong>+</strong> gombokkal!
              </p>
              <button
                type="button"
                onClick={() => {
                  setCreateModal({ isOpen: true, type: 'file', parentId: 'root' });
                  setModalInput('uj_script.js');
                }}
                className="px-4 py-2 rounded-lg bg-shark-purple hover:bg-shark-purple-dim text-white text-xs font-semibold transition shadow flex items-center gap-1.5"
              >
                <FilePlus className="w-4 h-4" />
                <span>Új Fájl Létrehozása</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Létrehozási Modal (Fájl vagy Mappa) */}
      {createModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-3 sm:p-4">
          <div className="bg-shark-panel border border-shark-card p-6 rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-shark-text mb-2">
              Új {createModal.type === 'folder' ? 'Mappa' : 'Fájl'} Létrehozása
            </h3>
            <p className="text-xs text-shark-muted mb-4">
              {createModal.type === 'folder'
                ? 'Add meg a létrehozandó mappa nevét (pl. utils, components).'
                : 'Add meg a fájl nevét kiterjesztéssel (pl. app.js, script.py, style.css).'}
            </p>
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <input
                type="text"
                value={modalInput}
                onChange={(e) => setModalInput(e.target.value)}
                placeholder={createModal.type === 'folder' ? 'Mappa neve...' : 'fajlnev.js'}
                autoFocus
                className="w-full bg-shark-panel text-shark-text px-3.5 py-2.5 rounded-lg outline-none border border-shark-purple/30 focus:border-shark-purple text-sm font-medium"
              />
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateModal({ isOpen: false, type: 'file', parentId: 'root' })}
                  className="px-4 py-2 rounded text-xs font-semibold text-shark-muted hover:text-white transition"
                >
                  Mégse
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-shark-purple hover:bg-shark-purple-dim text-white text-xs font-semibold transition shadow"
                >
                  Létrehozás
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Átnevezési Modal */}
      {renameModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-3 sm:p-4">
          <div className="bg-shark-panel border border-shark-card p-6 rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-shark-text mb-2">
              Elem Átnevezése
            </h3>
            <form onSubmit={handleRenameSubmit} className="space-y-4">
              <input
                type="text"
                value={modalInput}
                onChange={(e) => setModalInput(e.target.value)}
                autoFocus
                className="w-full bg-shark-panel text-shark-text px-3.5 py-2.5 rounded-lg outline-none border border-shark-purple/30 focus:border-shark-purple text-sm font-medium"
              />
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRenameModal({ isOpen: false, nodeId: null, currentName: '' })}
                  className="px-4 py-2 rounded text-xs font-semibold text-shark-muted hover:text-white transition"
                >
                  Mégse
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-shark-purple hover:bg-shark-purple-dim text-white text-xs font-semibold transition shadow"
                >
                  Mentés
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
