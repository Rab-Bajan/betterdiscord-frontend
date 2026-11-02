import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Paintbrush,
  Eraser,
  Minus,
  Square,
  Circle,
  Plus,
  Trash2,
  Download,
  X,
  Palette,
  Check,
  Users
} from 'lucide-react';

const VIRTUAL_WIDTH = 1600;
const VIRTUAL_HEIGHT = 1000;

const PRESET_COLORS = [
  '#000000',
  '#ffffff',
  '#5865F2', // Discord blurple
  '#22c55e', // green
  '#ef4444', // red
  '#eab308', // yellow
  '#f97316', // orange
  '#a855f7', // purple
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#64748b'  // slate
];

const PRESET_SIZES = [
  { label: 'Vékony', size: 3 },
  { label: 'Közepes', size: 8 },
  { label: 'Vastag', size: 18 },
  { label: 'Extra', size: 32 }
];

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
}) {
  const [tool, setTool] = useState('brush'); // 'brush' | 'eraser' | 'line' | 'rect' | 'circle'
  const [color, setColor] = useState('#5865F2');
  const [size, setSize] = useState(8);
  const [newBoardTitle, setNewBoardTitle] = useState('');
  const [showNewBoardModal, setShowNewBoardModal] = useState(false);
  const [activeDrawer, setActiveDrawer] = useState(null);

  const mainCanvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const startPointRef = useRef({ x: 0, y: 0 });
  const prevPointRef = useRef({ x: 0, y: 0 });
  const drawerTimeoutRef = useRef(null);

  // Tábla rajzoló segédfüggvény
  const drawStrokeOnCanvas = useCallback((ctx, stroke) => {
    if (!ctx) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (stroke.type === 'line') {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.beginPath();
      ctx.moveTo(stroke.x0, stroke.y0);
      ctx.lineTo(stroke.x1, stroke.y1);
      ctx.stroke();
    } else if (stroke.type === 'shape') {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.beginPath();

      if (stroke.shapeType === 'line') {
        ctx.moveTo(stroke.x0, stroke.y0);
        ctx.lineTo(stroke.x1, stroke.y1);
        ctx.stroke();
      } else if (stroke.shapeType === 'rect') {
        const x = Math.min(stroke.x0, stroke.x1);
        const y = Math.min(stroke.y0, stroke.y1);
        const w = Math.abs(stroke.x1 - stroke.x0);
        const h = Math.abs(stroke.y1 - stroke.y0);
        ctx.strokeRect(x, y, w, h);
      } else if (stroke.shapeType === 'circle') {
        const rx = Math.abs(stroke.x1 - stroke.x0) / 2;
        const ry = Math.abs(stroke.y1 - stroke.y0) / 2;
        const cx = Math.min(stroke.x0, stroke.x1) + rx;
        const cy = Math.min(stroke.y0, stroke.y1) + ry;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }, []);

  const clearCanvasVisual = () => {
    const canvas = mainCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    }
  };

  // Aktív tábla betöltése szerverről
  useEffect(() => {
    if (!activeBoardId || !socket) return;

    clearCanvasVisual();

    // Lekérjük a tábla teljes előzményét
    socket.emit('whiteboard:get', {
      channelId,
      boardId: activeBoardId
    });

    const handleBoardData = ({ boardId, strokes }) => {
      if (boardId === activeBoardId && mainCanvasRef.current) {
        clearCanvasVisual();
        const ctx = mainCanvasRef.current.getContext('2d');
        strokes.forEach((s) => drawStrokeOnCanvas(ctx, s));
      }
    };

    const handleRemoteStroke = ({ boardId, stroke, senderName }) => {
      if (boardId === activeBoardId && mainCanvasRef.current) {
        const ctx = mainCanvasRef.current.getContext('2d');
        drawStrokeOnCanvas(ctx, stroke);

        // Visszajelzés, hogy ki rajzol
        setActiveDrawer(senderName);
        if (drawerTimeoutRef.current) clearTimeout(drawerTimeoutRef.current);
        drawerTimeoutRef.current = setTimeout(() => setActiveDrawer(null), 1200);
      }
    };

    const handleBoardCleared = ({ boardId, clearedBy }) => {
      if (boardId === activeBoardId) {
        clearCanvasVisual();
        setActiveDrawer(`${clearedBy} (törölte a rajzot)`);
        if (drawerTimeoutRef.current) clearTimeout(drawerTimeoutRef.current);
        drawerTimeoutRef.current = setTimeout(() => setActiveDrawer(null), 1500);
      }
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
  }, [activeBoardId, channelId, socket, drawStrokeOnCanvas]);

  // Koordináta normalizálás az egér/érintés eseményből
  const getCoordinates = (e) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0;
    const clientY = e.clientY ?? (e.touches && e.touches[0]?.clientY) ?? 0;

    const scaleX = VIRTUAL_WIDTH / rect.width;
    const scaleY = VIRTUAL_HEIGHT / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  // Rajzolási események (Pointer / Touch)
  const handlePointerDown = (e) => {
    if (!activeBoardId) return;
    const coords = getCoordinates(e);
    isDrawingRef.current = true;
    startPointRef.current = coords;
    prevPointRef.current = coords;
  };

  const handlePointerMove = (e) => {
    if (!isDrawingRef.current || !activeBoardId) return;
    const currentCoords = getCoordinates(e);

    const currentColor = tool === 'eraser' ? '#ffffff' : color;
    const currentSize = tool === 'eraser' ? size * 2.5 : size;

    if (tool === 'brush' || tool === 'eraser') {
      const stroke = {
        type: 'line',
        x0: prevPointRef.current.x,
        y0: prevPointRef.current.y,
        x1: currentCoords.x,
        y1: currentCoords.y,
        color: currentColor,
        size: currentSize
      };

      // Helyi kirajzolás azonnal
      const ctx = mainCanvasRef.current?.getContext('2d');
      drawStrokeOnCanvas(ctx, stroke);

      // Továbbítás szerverre
      socket?.emit('whiteboard:draw', {
        channelId,
        boardId: activeBoardId,
        stroke
      });

      prevPointRef.current = currentCoords;
    } else {
      // Alakzat előnézet a previewCanvas-on
      const previewCtx = previewCanvasRef.current?.getContext('2d');
      if (previewCtx) {
        previewCtx.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
        drawStrokeOnCanvas(previewCtx, {
          type: 'shape',
          shapeType: tool,
          x0: startPointRef.current.x,
          y0: startPointRef.current.y,
          x1: currentCoords.x,
          y1: currentCoords.y,
          color: currentColor,
          size: currentSize
        });
      }
    }
  };

  const handlePointerUp = (e) => {
    if (!isDrawingRef.current || !activeBoardId) return;
    isDrawingRef.current = false;
    const currentCoords = getCoordinates(e);

    const currentColor = tool === 'eraser' ? '#ffffff' : color;
    const currentSize = tool === 'eraser' ? size * 2.5 : size;

    if (tool === 'line' || tool === 'rect' || tool === 'circle') {
      // Előnézet törlése
      const previewCtx = previewCanvasRef.current?.getContext('2d');
      previewCtx?.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);

      const stroke = {
        type: 'shape',
        shapeType: tool,
        x0: startPointRef.current.x,
        y0: startPointRef.current.y,
        x1: currentCoords.x,
        y1: currentCoords.y,
        color: currentColor,
        size: currentSize
      };

      // Végleges kirajzolás
      const ctx = mainCanvasRef.current?.getContext('2d');
      drawStrokeOnCanvas(ctx, stroke);

      socket?.emit('whiteboard:draw', {
        channelId,
        boardId: activeBoardId,
        stroke
      });
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
    const activeBoard = whiteboards.find(b => b.id === activeBoardId);
    const link = document.createElement('a');
    link.download = `${activeBoard ? activeBoard.title : 'paint_rajz'}.png`;
    link.href = mainCanvasRef.current.toDataURL('image/png');
    link.click();
  };

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    onCreateBoard(newBoardTitle.trim() || `${currentUser.username} Rajza`);
    setNewBoardTitle('');
    setShowNewBoardModal(false);
  };

  return (
    <div className="flex-1 flex flex-col bg-discord-darkest h-full relative select-none">
      {/* 1. Header & Tábla fülek (Tabs) */}
      <div className="bg-discord-dark border-b border-discord-darkest px-3 py-2 flex items-center justify-between gap-2 flex-shrink-0 z-20">
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-bold text-discord-textHeader mr-2 flex-shrink-0">
            <Paintbrush className="w-4 h-4 text-discord-primary" />
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
                    ? 'bg-discord-primary text-white shadow-sm'
                    : 'bg-discord-darker hover:bg-discord-hover text-discord-textMuted hover:text-white'
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
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-discord-green hover:bg-green-600 text-white transition flex-shrink-0 shadow"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Új Rajztábla</span>
          </button>
        </div>

        {/* Jobb oldali műveletek */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {activeDrawer && (
            <div className="hidden md:flex items-center gap-1.5 text-xs text-discord-green bg-discord-green/10 px-2.5 py-1 rounded-full animate-pulse border border-discord-green/30">
              <span className="w-2 h-2 rounded-full bg-discord-green" />
              <span>{activeDrawer} épp rajzol...</span>
            </div>
          )}

          {activeBoardId && (
            <>
              <button
                type="button"
                onClick={handleDownload}
                title="Kép letöltése PNG-ként"
                className="p-1.5 rounded bg-discord-darker hover:bg-discord-hover text-discord-textHeader transition"
              >
                <Download className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleClearBoard}
                title="Vászon törlése (Mindenkinek törli)"
                className="p-1.5 rounded bg-discord-darker hover:bg-discord-red/80 text-discord-textHeader hover:text-white transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onClose}
            title="Bezárás (Vissza a szoba nézethez)"
            className="p-1.5 rounded bg-discord-darker hover:bg-discord-hover text-discord-textMuted hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Paint Eszköztár (Toolbar) */}
      {activeBoardId ? (
        <div className="bg-discord-darker/95 border-b border-discord-dark px-4 py-2 flex items-center justify-between gap-4 flex-wrap z-10 shadow">
          {/* Eszközök: Ecset, Radír, Vonal, Téglalap, Kör */}
          <div className="flex items-center gap-1 bg-discord-darkest/70 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setTool('brush')}
              title="Szabadkézi Ecset"
              className={`p-2 rounded-md transition ${
                tool === 'brush' ? 'bg-discord-primary text-white shadow' : 'text-discord-textMuted hover:text-white'
              }`}
            >
              <Paintbrush className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setTool('eraser')}
              title="Radír"
              className={`p-2 rounded-md transition ${
                tool === 'eraser' ? 'bg-discord-primary text-white shadow' : 'text-discord-textMuted hover:text-white'
              }`}
            >
              <Eraser className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setTool('line')}
              title="Egyenes vonal"
              className={`p-2 rounded-md transition ${
                tool === 'line' ? 'bg-discord-primary text-white shadow' : 'text-discord-textMuted hover:text-white'
              }`}
            >
              <Minus className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setTool('rect')}
              title="Téglalap"
              className={`p-2 rounded-md transition ${
                tool === 'rect' ? 'bg-discord-primary text-white shadow' : 'text-discord-textMuted hover:text-white'
              }`}
            >
              <Square className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setTool('circle')}
              title="Kör"
              className={`p-2 rounded-md transition ${
                tool === 'circle' ? 'bg-discord-primary text-white shadow' : 'text-discord-textMuted hover:text-white'
              }`}
            >
              <Circle className="w-4 h-4" />
            </button>
          </div>

          {/* Színpaletta */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setColor(c);
                  if (tool === 'eraser') setTool('brush');
                }}
                className={`w-6 h-6 rounded-full transition-transform border border-black/40 flex items-center justify-center ${
                  color === c && tool !== 'eraser'
                    ? 'scale-125 ring-2 ring-white ring-offset-1 ring-offset-discord-dark'
                    : 'hover:scale-110 opacity-90'
                }`}
                style={{ backgroundColor: c }}
              >
                {color === c && tool !== 'eraser' && (
                  <Check className={`w-3 h-3 ${c === '#ffffff' || c === '#eab308' ? 'text-black' : 'text-white'}`} />
                )}
              </button>
            ))}

            {/* Egyedi színválasztó */}
            <label className="relative cursor-pointer flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-tr from-pink-500 via-purple-500 to-indigo-500 border border-white/30 hover:scale-110 transition-transform">
              <input
                type="color"
                value={color}
                onChange={(e) => {
                  setColor(e.target.value);
                  if (tool === 'eraser') setTool('brush');
                }}
                className="opacity-0 absolute inset-0 cursor-pointer w-full h-full"
                title="Egyedi szín választása"
              />
              <Palette className="w-3 h-3 text-white pointer-events-none" />
            </label>
          </div>

          {/* Vonal vastagság választó */}
          <div className="flex items-center gap-1 bg-discord-darkest/70 px-2 py-1 rounded-lg">
            {PRESET_SIZES.map((s) => (
              <button
                key={s.size}
                type="button"
                onClick={() => setSize(s.size)}
                title={`${s.label} (${s.size}px)`}
                className={`px-2 py-1 text-xs rounded transition font-medium ${
                  size === s.size
                    ? 'bg-discord-active text-white font-bold'
                    : 'text-discord-textMuted hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* 3. Fő Rajzfelület (Interactive Canvas) */}
      <div className="flex-1 min-h-0 p-3 sm:p-5 flex items-center justify-center overflow-hidden relative">
        {activeBoardId ? (
          <div
            className="w-full h-full max-w-[1400px] max-h-[850px] relative bg-white rounded-xl shadow-2xl overflow-hidden border border-discord-dark"
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
          <div className="text-center p-8 bg-discord-darker rounded-2xl border border-discord-dark max-w-md shadow-2xl">
            <div className="w-20 h-20 rounded-3xl bg-discord-primary/20 text-discord-primary flex items-center justify-center mx-auto mb-4">
              <Paintbrush className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold text-discord-textHeader mb-2">
              Közös Paint & Rajztábla
            </h3>
            <p className="text-sm text-discord-textMuted mb-6 leading-relaxed">
              Még nincs megnyitott rajztábla ebben a hangcsatornában.
              Indíts egy újat, amibe minden szobában lévő társad valós időben belerajzolhat!
            </p>
            <button
              type="button"
              onClick={() => setShowNewBoardModal(true)}
              className="px-6 py-3 rounded-lg bg-discord-primary hover:bg-discord-primaryHover text-white font-semibold text-sm transition shadow-lg flex items-center gap-2 mx-auto"
            >
              <Plus className="w-5 h-5" />
              <span>Első Rajztábla Indítása</span>
            </button>
          </div>
        )}
      </div>

      {/* Új Tábla Modal */}
      {showNewBoardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-discord-darker border border-discord-dark p-6 rounded-xl shadow-2xl max-w-sm w-full">
            <h3 className="text-lg font-bold text-discord-textHeader mb-2">
              Új Rajztábla Indítása
            </h3>
            <p className="text-xs text-discord-textMuted mb-4">
              Adj meg egy nevet a rajztáblának. Mindenki látni fogja és bele tud rajzolni.
            </p>
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <input
                type="text"
                value={newBoardTitle}
                onChange={(e) => setNewBoardTitle(e.target.value)}
                placeholder={`Pl. ${currentUser?.username} Rajza, Skribbl, Tervezés...`}
                autoFocus
                className="w-full bg-discord-darkest text-white px-3.5 py-2.5 rounded-lg outline-none border border-transparent focus:border-discord-primary text-sm font-medium"
              />
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewBoardModal(false)}
                  className="px-4 py-2 rounded text-xs font-semibold text-discord-textMuted hover:text-white transition"
                >
                  Mégse
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-discord-green hover:bg-green-600 text-white text-xs font-semibold transition shadow"
                >
                  Indítás
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
