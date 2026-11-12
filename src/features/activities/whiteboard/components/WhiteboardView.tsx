import React, { useState, useRef, useEffect, type PointerEvent } from 'react';
import { Paintbrush, Plus, Trash2, Download, X, Users } from 'lucide-react';
import type { SocketLike } from '../../../../shared/services/socket/SocketLike';
import { isRecord, stringField } from '../../../../shared/lib/guards';
import type { CurrentUser } from '../../../../shared/types';
import type { Whiteboard } from '../../../voice-room/types';
import {
  VIRTUAL_HEIGHT, VIRTUAL_WIDTH, drawStroke, isShapeTool, parseStroke, toVirtual, toolPen,
  type Point, type Stroke, type WhiteboardTool
} from '../lib/strokes';
import WhiteboardToolbar from './WhiteboardToolbar';
import NewBoardModal from './NewBoardModal';

interface WhiteboardViewProps {
  channelId: string | undefined;
  socket: SocketLike | null | undefined;
  currentUser: CurrentUser | null;
  whiteboards?: Whiteboard[];
  activeBoardId: string | null;
  onSelectBoard: (boardId: string) => void;
  onCreateBoard: (title: string) => void;
  onDeleteBoard: (boardId: string) => void;
  onClose: () => void;
}

export default function WhiteboardView({
  channelId,
  socket,
  currentUser,
  whiteboards = [],
  activeBoardId,
  onSelectBoard,
  onCreateBoard,
  onDeleteBoard,
  onClose
}: WhiteboardViewProps) {
  const [tool, setTool] = useState<WhiteboardTool>('brush');
  const [color, setColor] = useState('#5865F2');
  const [size, setSize] = useState(8);
  const [newBoardTitle, setNewBoardTitle] = useState('');
  const [showNewBoardModal, setShowNewBoardModal] = useState(false);
  const [activeDrawer, setActiveDrawer] = useState<string | null>(null);

  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const startPointRef = useRef<Point>({ x: 0, y: 0 });
  const prevPointRef = useRef<Point>({ x: 0, y: 0 });
  const drawerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mainContext = () => mainCanvasRef.current?.getContext('2d');

  const clearCanvasVisual = () => {
    const ctx = mainContext();
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    }
  };

  // Visszajelzés, hogy ki rajzol / ki törölt
  const showDrawer = (label: string, ms: number) => {
    setActiveDrawer(label);
    if (drawerTimeoutRef.current) clearTimeout(drawerTimeoutRef.current);
    drawerTimeoutRef.current = setTimeout(() => setActiveDrawer(null), ms);
  };

  // Aktív tábla betöltése szerverről
  useEffect(() => {
    if (!activeBoardId || !socket) return undefined;

    clearCanvasVisual();

    // Lekérjük a tábla teljes előzményét
    socket.emit('whiteboard:get', {
      channelId,
      boardId: activeBoardId
    });

    const isActiveBoard = (payload: unknown) => stringField(payload, 'boardId') === activeBoardId;

    const handleBoardData = (payload: unknown) => {
      if (!isActiveBoard(payload) || !isRecord(payload) || !Array.isArray(payload.strokes)) return;
      const ctx = mainContext();
      if (!ctx) return;
      clearCanvasVisual();
      payload.strokes.forEach((raw: unknown) => {
        const stroke = parseStroke(raw);
        if (stroke) drawStroke(ctx, stroke);
      });
    };

    const handleRemoteStroke = (payload: unknown) => {
      const stroke = isRecord(payload) ? parseStroke(payload.stroke) : null;
      if (!isActiveBoard(payload) || !stroke || !mainCanvasRef.current) return;
      drawStroke(mainContext(), stroke);
      showDrawer(stringField(payload, 'senderName') ?? '', 1200);
    };

    const handleBoardCleared = (payload: unknown) => {
      if (!isActiveBoard(payload)) return;
      clearCanvasVisual();
      showDrawer(`${stringField(payload, 'clearedBy')} (törölte a rajzot)`, 1500);
    };

    socket.on('whiteboard:data', handleBoardData);
    socket.on('whiteboard:stroke', handleRemoteStroke);
    socket.on('whiteboard:cleared', handleBoardCleared);

    return () => {
      socket.off('whiteboard:data', handleBoardData);
      socket.off('whiteboard:stroke', handleRemoteStroke);
      socket.off('whiteboard:cleared', handleBoardCleared);
      if (drawerTimeoutRef.current) clearTimeout(drawerTimeoutRef.current);
    };
  }, [activeBoardId, channelId, socket]);

  // Koordináta normalizálás a pointer eseményből
  const getCoordinates = (e: PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    return toVirtual(e.clientX ?? 0, e.clientY ?? 0, canvas.getBoundingClientRect());
  };

  const sendStroke = (stroke: Stroke) => {
    socket?.emit('whiteboard:draw', {
      channelId,
      boardId: activeBoardId,
      stroke
    });
  };

  const shapeFromStart = (shapeType: 'line' | 'rect' | 'circle', end: Point): Stroke => ({
    type: 'shape',
    shapeType,
    x0: startPointRef.current.x,
    y0: startPointRef.current.y,
    x1: end.x,
    y1: end.y,
    ...toolPen(tool, color, size)
  });

  // Rajzolási események (Pointer)
  const handlePointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!activeBoardId) return;
    const coords = getCoordinates(e);
    isDrawingRef.current = true;
    startPointRef.current = coords;
    prevPointRef.current = coords;
  };

  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !activeBoardId) return;
    const currentCoords = getCoordinates(e);

    if (isShapeTool(tool)) {
      // Alakzat előnézet a previewCanvas-on
      const previewCtx = previewCanvasRef.current?.getContext('2d');
      if (previewCtx) {
        previewCtx.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
        drawStroke(previewCtx, shapeFromStart(tool, currentCoords));
      }
      return;
    }

    const stroke: Stroke = {
      type: 'line',
      x0: prevPointRef.current.x,
      y0: prevPointRef.current.y,
      x1: currentCoords.x,
      y1: currentCoords.y,
      ...toolPen(tool, color, size)
    };
    drawStroke(mainContext(), stroke); // helyi kirajzolás azonnal
    sendStroke(stroke);
    prevPointRef.current = currentCoords;
  };

  const handlePointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !activeBoardId) return;
    isDrawingRef.current = false;
    const currentCoords = getCoordinates(e);

    if (isShapeTool(tool)) {
      // Előnézet törlése, majd végleges kirajzolás
      previewCanvasRef.current?.getContext('2d')?.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
      const stroke = shapeFromStart(tool, currentCoords);
      drawStroke(mainContext(), stroke);
      sendStroke(stroke);
    }
  };

  const handleClearBoard = () => {
    if (!activeBoardId) return;
    if (window.confirm('Biztosan törölni szeretnéd a teljes rajzot a tábláról? Mindenkinek törlődni fog.')) {
      clearCanvasVisual();
      socket?.emit('whiteboard:clear', {
        channelId,
        boardId: activeBoardId
      });
    }
  };

  const handleDownload = () => {
    if (!mainCanvasRef.current) return;
    const activeBoard = whiteboards.find((b) => b.id === activeBoardId);
    const link = document.createElement('a');
    link.download = `${activeBoard ? activeBoard.title : 'paint_rajz'}.png`;
    link.href = mainCanvasRef.current.toDataURL('image/png');
    link.click();
  };

  const handleCreate = () => {
    onCreateBoard(newBoardTitle.trim() || `${currentUser?.username} Rajza`);
    setNewBoardTitle('');
    setShowNewBoardModal(false);
  };

  return (
    <div className="flex-1 flex flex-col bg-shark-bg h-full relative select-none">
      {/* 1. Header & Tábla fülek (Tabs) */}
      <div className="bg-shark-card border-b border-shark-bg px-3 py-2 flex items-center justify-between gap-2 flex-shrink-0 z-20">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5 flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-bold text-shark-text mr-2 flex-shrink-0">
            <Paintbrush className="w-4 h-4 text-shark-purple" />
            <span className="hidden sm:inline">Közös Paint</span>
          </div>

          {/* Tábla Fülek */}
          {whiteboards.map((b) => {
            const isActive = b.id === activeBoardId;
            return (
              <div
                key={b.id}
                onClick={() => onSelectBoard(b.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition flex-shrink-0 ${
                  isActive
                    ? 'bg-shark-purple text-white shadow-sm'
                    : 'bg-shark-panel hover:bg-shark-elevated-hover text-shark-muted hover:text-white'
                }`}
              >
                <span className="truncate max-w-[130px]">{b.title}</span>
                {b.creatorName && (
                  <span className="text-[10px] opacity-70 truncate">
                    ({b.creatorName})
                  </span>
                )}
                {/* Bezárás gomb a fülön */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Biztosan törölni szeretnéd a(z) "${b.title}" táblát mindenkitől?`)) {
                      onDeleteBoard(b.id);
                    }
                  }}
                  title="Tábla törlése"
                  className="w-4 h-4 rounded-full hover:bg-black/30 flex items-center justify-center transition ml-1"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}

          {/* Új tábla indítása gomb */}
          <button
            type="button"
            onClick={() => setShowNewBoardModal(true)}
            title="Új Rajztábla Indítása"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-shark-green hover:opacity-90 text-white transition flex-shrink-0 shadow"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Új Rajztábla</span>
          </button>
        </div>

        {/* Jobb oldali műveletek */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {activeDrawer && (
            <div className="hidden md:flex items-center gap-1.5 text-xs text-shark-green bg-shark-green/10 px-2.5 py-1 rounded-full animate-pulse border border-shark-green/30">
              <span className="w-2 h-2 rounded-full bg-shark-green" />
              <span>{activeDrawer} épp rajzol...</span>
            </div>
          )}

          {activeBoardId && (
            <>
              <button
                type="button"
                onClick={handleDownload}
                title="Kép letöltése PNG-ként"
                className="p-1.5 rounded bg-shark-panel hover:bg-shark-elevated-hover text-shark-text transition"
              >
                <Download className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleClearBoard}
                title="Vászon törlése (Mindenkinek törli)"
                className="p-1.5 rounded bg-shark-panel hover:bg-shark-red/80 text-shark-text hover:text-white transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onClose}
            title="Bezárás (Vissza a szoba nézethez)"
            className="p-1.5 rounded bg-shark-panel hover:bg-shark-elevated-hover text-shark-muted hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Paint Eszköztár (Toolbar) */}
      {activeBoardId ? (
        <WhiteboardToolbar tool={tool} setTool={setTool} color={color} setColor={setColor} size={size} setSize={setSize} />
      ) : null}

      {/* 3. Fő Rajzfelület (Interactive Canvas) */}
      <div className="flex-1 min-h-0 p-3 sm:p-5 flex items-center justify-center overflow-hidden relative">
        {activeBoardId ? (
          <div
            className="w-full h-full max-w-[1400px] max-h-[850px] relative bg-white rounded-xl shadow-2xl overflow-hidden border border-shark-card"
            style={{ aspectRatio: `${VIRTUAL_WIDTH} / ${VIRTUAL_HEIGHT}` }}
          >
            {/* Alap vászon (mindenki rajzai) */}
            <canvas
              ref={mainCanvasRef}
              width={VIRTUAL_WIDTH}
              height={VIRTUAL_HEIGHT}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />

            {/* Előnézet vászon (alakzat húzás közben) + eseménykezelő */}
            <canvas
              ref={previewCanvasRef}
              width={VIRTUAL_WIDTH}
              height={VIRTUAL_HEIGHT}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
            />
          </div>
        ) : (
          /* Ha még nincs létrehozott tábla a szobában */
          <div className="text-center p-8 bg-shark-panel rounded-2xl border border-shark-card max-w-md shadow-2xl">
            <div className="w-20 h-20 rounded-3xl bg-shark-purple/20 text-shark-purple flex items-center justify-center mx-auto mb-4">
              <Paintbrush className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold text-shark-text mb-2">
              Közös Paint & Rajztábla
            </h3>
            <p className="text-sm text-shark-muted mb-6 leading-relaxed">
              Még nincs megnyitott rajztábla ebben a hangcsatornában.
              Indíts egy újat, amibe minden szobában lévő társad valós időben belerajzolhat!
            </p>
            <button
              type="button"
              onClick={() => setShowNewBoardModal(true)}
              className="px-6 py-3 rounded-lg bg-shark-purple hover:bg-shark-purple-dim text-white font-semibold text-sm transition shadow-lg flex items-center gap-2 mx-auto"
            >
              <Plus className="w-5 h-5" />
              <span>Első Rajztábla Indítása</span>
            </button>
          </div>
        )}
      </div>

      {/* Új Tábla Modal */}
      {showNewBoardModal && (
        <NewBoardModal
          username={currentUser?.username}
          title={newBoardTitle}
          onTitleChange={setNewBoardTitle}
          onCreate={handleCreate}
          onCancel={() => setShowNewBoardModal(false)}
        />
      )}
    </div>
  );
}
