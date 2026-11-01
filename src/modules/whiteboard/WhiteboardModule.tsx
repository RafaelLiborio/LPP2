import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSocket } from '../../context/SocketContext';
import {
  MousePointer,
  Pencil,
  Square,
  Circle,
  StickyNote,
  MoveRight,
  Type,
  Trash2,
  Download,
  Share2,
  Undo2,
  ZoomIn,
  ZoomOut,
  RotateCcw
} from 'lucide-react';

type Tool = 'select' | 'pencil' | 'rectangle' | 'circle' | 'sticky' | 'arrow' | 'text';

const STICKY_COLORS = ['#fef08a', '#bbf7d0', '#bae6fd', '#fbcfe8', '#fed7aa'];

export const WhiteboardModule: React.FC = () => {
  const {
    currentUser,
    whiteboardElements,
    sendWhiteboardAction,
    sendCursorMove,
    remoteCursors,
    sendMessage
  } = useSocket();

  const [activeTool, setActiveTool] = useState<Tool>('pencil');
  const [color, setColor] = useState<string>('#38bdf8');
  const strokeWidth = 3;
  const [stickyColor, setStickyColor] = useState<string>('#fef08a');

  // Drawing state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isMouseDownRef = useRef(false);
  const isRightClickPanRef = useRef(false);
  const currentPathRef = useRef<{ x: number; y: number }[]>([]);
  const startPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Pan & Zoom
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  // Dialog popover for text / sticky
  const [inputModal, setInputModal] = useState<{
    type: 'sticky' | 'text';
    x: number;
    y: number;
  } | null>(null);
  const [modalText, setModalText] = useState('');

  // Mouse release blur & ghost drawing prevention: Global listeners
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      isMouseDownRef.current = false;
      isRightClickPanRef.current = false;
    };
    const handleGlobalBlur = () => {
      isMouseDownRef.current = false;
      isRightClickPanRef.current = false;
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('blur', handleGlobalBlur);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('blur', handleGlobalBlur);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [whiteboardElements]);

  // Redraw canvas whenever elements, pan or zoom changes
  const renderBoard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Grid dots (Figma / FigJam style)
    const dotSize = 1.2;
    const spacing = 32 * zoom;
    ctx.fillStyle = '#2d3042';
    const offsetX = pan.x % spacing;
    const offsetY = pan.y % spacing;

    for (let x = offsetX; x < canvas.width; x += spacing) {
      for (let y = offsetY; y < canvas.height; y += spacing) {
        ctx.fillRect(x, y, dotSize, dotSize);
      }
    }

    // Draw all stored whiteboard elements
    whiteboardElements.forEach((el) => {
      ctx.strokeStyle = el.color;
      ctx.lineWidth = el.strokeWidth * zoom;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (el.type === 'pencil' && el.points && el.points.length > 0) {
        ctx.beginPath();
        const start = el.points[0];
        ctx.moveTo(start.x * zoom + pan.x, start.y * zoom + pan.y);
        for (let i = 1; i < el.points.length; i++) {
          const pt = el.points[i];
          ctx.lineTo(pt.x * zoom + pan.x, pt.y * zoom + pan.y);
        }
        ctx.stroke();
      } else if (el.type === 'rectangle' && el.width && el.height) {
        ctx.beginPath();
        ctx.strokeRect(el.x * zoom + pan.x, el.y * zoom + pan.y, el.width * zoom, el.height * zoom);
      } else if (el.type === 'circle' && el.width && el.height) {
        ctx.beginPath();
        const radius = Math.abs(el.width) / 2;
        ctx.arc(
          (el.x + el.width / 2) * zoom + pan.x,
          (el.y + el.height / 2) * zoom + pan.y,
          radius * zoom,
          0,
          Math.PI * 2
        );
        ctx.stroke();
      } else if (el.type === 'arrow' && el.width && el.height) {
        const fromX = el.x * zoom + pan.x;
        const fromY = el.y * zoom + pan.y;
        const toX = (el.x + el.width) * zoom + pan.x;
        const toY = (el.y + el.height) * zoom + pan.y;

        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();

        // Arrowhead
        const angle = Math.atan2(toY - fromY, toX - fromX);
        const headLen = 14 * zoom;
        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      } else if (el.type === 'sticky') {
        const w = 160 * zoom;
        const h = 135 * zoom;
        const sx = el.x * zoom + pan.x;
        const sy = el.y * zoom + pan.y;

        // Shadow & Card
        ctx.fillStyle = el.fillColor || '#fef08a';
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = 12;
        ctx.fillRect(sx, sy, w, h);
        ctx.shadowBlur = 0;

        // Sticky text
        ctx.fillStyle = '#1e1e1e';
        ctx.font = `bold ${Math.max(10, Math.floor(13 * zoom))}px sans-serif`;
        ctx.fillText(el.text || 'Nota...', sx + 12 * zoom, sy + 25 * zoom);
        ctx.font = `${Math.max(9, Math.floor(10 * zoom))}px sans-serif`;
        ctx.fillStyle = '#6b7280';
        ctx.fillText(`Por ${el.author}`, sx + 12 * zoom, sy + h - 12 * zoom);
      } else if (el.type === 'text') {
        ctx.fillStyle = el.color;
        ctx.font = `bold ${Math.max(12, Math.floor(16 * zoom))}px sans-serif`;
        ctx.fillText(el.text || 'Texto', el.x * zoom + pan.x, el.y * zoom + pan.y);
      }
    });
  }, [whiteboardElements, pan, zoom]);

  useEffect(() => {
    renderBoard();
  }, [renderBoard]);

  // Window resize handling
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = canvas.parentElement?.clientWidth || 1000;
      canvas.height = canvas.parentElement?.clientHeight || 700;
      renderBoard();
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderBoard]);

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, rawX: 0, rawY: 0 };
    const rect = canvas.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;
    return {
      x: (rawX - pan.x) / zoom,
      y: (rawY - pan.y) / zoom,
      rawX,
      rawY
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Right Click or Middle click: Pan board
    if (e.button === 2 || e.button === 1) {
      isRightClickPanRef.current = true;
      return;
    }

    const { x, y } = getCanvasCoords(e);
    isMouseDownRef.current = true;
    startPosRef.current = { x, y };

    if (activeTool === 'pencil') {
      currentPathRef.current = [{ x, y }];
    } else if (activeTool === 'sticky') {
      setInputModal({ type: 'sticky', x, y });
      setModalText('');
      isMouseDownRef.current = false;
    } else if (activeTool === 'text') {
      setInputModal({ type: 'text', x, y });
      setModalText('');
      isMouseDownRef.current = false;
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y, rawX, rawY } = getCanvasCoords(e);

    // Broadcast cursor position to partners
    sendCursorMove(rawX, rawY);

    // Pan with Right Click or Pan tool
    if (isRightClickPanRef.current || (isMouseDownRef.current && activeTool === 'select')) {
      setPan((prev) => ({
        x: prev.x + e.movementX,
        y: prev.y + e.movementY
      }));
      return;
    }

    if (!isMouseDownRef.current) return;

    if (activeTool === 'pencil') {
      currentPathRef.current.push({ x, y });
      // Live draw preview
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = color;
        ctx.lineWidth = strokeWidth * zoom;
        ctx.lineCap = 'round';
        ctx.beginPath();
        const len = currentPathRef.current.length;
        if (len > 1) {
          const p1 = currentPathRef.current[len - 2];
          const p2 = currentPathRef.current[len - 1];
          ctx.moveTo(p1.x * zoom + pan.x, p1.y * zoom + pan.y);
          ctx.lineTo(p2.x * zoom + pan.x, p2.y * zoom + pan.y);
          ctx.stroke();
        }
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isRightClickPanRef.current) {
      isRightClickPanRef.current = false;
      return;
    }

    if (!isMouseDownRef.current) return;
    const { x, y } = getCanvasCoords(e);
    isMouseDownRef.current = false;

    if (activeTool === 'pencil' && currentPathRef.current.length > 1) {
      sendWhiteboardAction({
        type: 'add',
        element: {
          id: `pencil-${Date.now()}`,
          type: 'pencil',
          x: 0,
          y: 0,
          points: [...currentPathRef.current],
          color,
          strokeWidth,
          author: currentUser.username
        }
      });
      currentPathRef.current = [];
    } else if (activeTool === 'rectangle') {
      const w = x - startPosRef.current.x;
      const h = y - startPosRef.current.y;
      if (Math.abs(w) > 4 && Math.abs(h) > 4) {
        sendWhiteboardAction({
          type: 'add',
          element: {
            id: `rect-${Date.now()}`,
            type: 'rectangle',
            x: startPosRef.current.x,
            y: startPosRef.current.y,
            width: w,
            height: h,
            color,
            strokeWidth,
            author: currentUser.username
          }
        });
      }
    } else if (activeTool === 'circle') {
      const w = x - startPosRef.current.x;
      const h = y - startPosRef.current.y;
      if (Math.abs(w) > 4) {
        sendWhiteboardAction({
          type: 'add',
          element: {
            id: `circle-${Date.now()}`,
            type: 'circle',
            x: startPosRef.current.x,
            y: startPosRef.current.y,
            width: w,
            height: h,
            color,
            strokeWidth,
            author: currentUser.username
          }
        });
      }
    } else if (activeTool === 'arrow') {
      const w = x - startPosRef.current.x;
      const h = y - startPosRef.current.y;
      if (Math.abs(w) > 4 || Math.abs(h) > 4) {
        sendWhiteboardAction({
          type: 'add',
          element: {
            id: `arrow-${Date.now()}`,
            type: 'arrow',
            x: startPosRef.current.x,
            y: startPosRef.current.y,
            width: w,
            height: h,
            color,
            strokeWidth,
            author: currentUser.username
          }
        });
      }
    }
  };

  // Wheel Zoom support
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoom((z) => Math.min(2.5, z + 0.1));
    } else {
      setZoom((z) => Math.max(0.4, z - 0.1));
    }
  };

  // Undo last element
  const handleUndo = () => {
    if (whiteboardElements.length === 0) return;
    sendWhiteboardAction({
      type: 'add',
      element: undefined
    });
    renderBoard();
  };

  const handleModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputModal || !modalText.trim()) {
      setInputModal(null);
      return;
    }

    if (inputModal.type === 'sticky') {
      sendWhiteboardAction({
        type: 'add',
        element: {
          id: `sticky-${Date.now()}`,
          type: 'sticky',
          x: inputModal.x,
          y: inputModal.y,
          fillColor: stickyColor,
          color: '#1f2937',
          strokeWidth: 1,
          text: modalText.trim(),
          author: currentUser.username
        }
      });
    } else if (inputModal.type === 'text') {
      sendWhiteboardAction({
        type: 'add',
        element: {
          id: `txt-${Date.now()}`,
          type: 'text',
          x: inputModal.x,
          y: inputModal.y,
          color,
          strokeWidth: 1,
          text: modalText.trim(),
          author: currentUser.username
        }
      });
    }

    setInputModal(null);
    setModalText('');
  };

  const handleExportPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `quadro_lpp2_${Date.now()}.png`;
    a.click();
  };

  const handleShareToDiscord = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    sendMessage('📐 Quadro Branco compartilhado da reunião:', 'gamedev', url);
    alert('Quadro enviado para o canal #gamedev-prog no chat da equipe!');
  };

  return (
    <div className="flex w-full h-full bg-[#181924] text-gray-200 overflow-hidden relative select-none">
      {/* Top Floating Figma Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-[#161720]/95 backdrop-blur-md border border-gray-700/80 rounded-2xl px-3 py-1.5 flex items-center gap-1 shadow-2xl">
        {[
          { id: 'select', icon: MousePointer, label: 'Mover / Pan (V)' },
          { id: 'pencil', icon: Pencil, label: 'Caneta / Desenho (P)' },
          { id: 'sticky', icon: StickyNote, label: 'Post-it / Nota (S)' },
          { id: 'rectangle', icon: Square, label: 'Retângulo (R)' },
          { id: 'circle', icon: Circle, label: 'Círculo (O)' },
          { id: 'arrow', icon: MoveRight, label: 'Seta Conectora (A)' },
          { id: 'text', icon: Type, label: 'Texto (T)' }
        ].map((t) => {
          const Icon = t.icon;
          const isActive = activeTool === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTool(t.id as Tool)}
              title={t.label}
              className={`p-2 rounded-xl transition ${
                isActive ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <Icon size={17} />
            </button>
          );
        })}

        <div className="w-px h-6 bg-gray-700 mx-1" />

        {/* Color picker */}
        <div className="flex items-center gap-1">
          {['#38bdf8', '#a855f7', '#22c55e', '#ef4444', '#f59e0b', '#ffffff'].map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-5 h-5 rounded-full border transition ${
                color === c ? 'border-white scale-110 shadow-sm' : 'border-transparent'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        {/* Sticky color chooser if sticky tool is selected */}
        {activeTool === 'sticky' && (
          <>
            <div className="w-px h-6 bg-gray-700 mx-1" />
            <div className="flex items-center gap-1">
              {STICKY_COLORS.map((sc) => (
                <button
                  key={sc}
                  onClick={() => setStickyColor(sc)}
                  className={`w-5 h-5 rounded border ${stickyColor === sc ? 'border-black scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: sc }}
                />
              ))}
            </div>
          </>
        )}

        <div className="w-px h-6 bg-gray-700 mx-1" />

        {/* Zoom controls */}
        <div className="flex items-center gap-1 text-xs">
          <button
            onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800"
            title="Zoom Menos"
          >
            <ZoomOut size={15} />
          </button>
          <span className="font-mono text-gray-400 text-[11px] w-9 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.1))}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800"
            title="Zoom Mais"
          >
            <ZoomIn size={15} />
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800"
            title="Resetar Posição"
          >
            <RotateCcw size={14} />
          </button>
        </div>

        <div className="w-px h-6 bg-gray-700 mx-1" />

        {/* Actions */}
        <button
          onClick={handleUndo}
          title="Desfazer (Ctrl+Z)"
          className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition"
        >
          <Undo2 size={16} />
        </button>

        <button
          onClick={() => {
            if (confirm('Deseja realmente limpar todo o quadro compartilhado?')) {
              sendWhiteboardAction({ type: 'clear' });
            }
          }}
          title="Limpar Quadro"
          className="p-2 rounded-xl text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
        >
          <Trash2 size={16} />
        </button>

        <button
          onClick={handleExportPNG}
          title="Exportar Imagem PNG"
          className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition"
        >
          <Download size={16} />
        </button>

        <button
          onClick={handleShareToDiscord}
          title="Enviar para o chat"
          className="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1 transition"
        >
          <Share2 size={14} /> Compartilhar
        </button>
      </div>

      {/* Realtime Multiplayer Cursors (FigJam style) */}
      {Array.from(remoteCursors.entries()).map(([socketId, cursor]) => (
        <div
          key={socketId}
          className="absolute z-10 pointer-events-none transition-all duration-75 flex items-center gap-1"
          style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}
        >
          <MousePointer size={18} className="text-pink-500 fill-pink-500" />
          <span className="bg-pink-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-lg">
            {cursor.username}
          </span>
        </div>
      ))}

      {/* Inline Modal for text / sticky creation without blocking prompt */}
      {inputModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleModalSubmit}
            className="w-full max-w-sm bg-[#1a1b26] border border-gray-700 rounded-2xl p-5 shadow-2xl space-y-4"
          >
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              {inputModal.type === 'sticky' ? <StickyNote size={16} className="text-amber-400" /> : <Type size={16} className="text-indigo-400" />}
              {inputModal.type === 'sticky' ? 'Nova Nota no Quadro' : 'Inserir Texto'}
            </h4>
            <textarea
              autoFocus
              rows={3}
              value={modalText}
              onChange={(e) => setModalText(e.target.value)}
              placeholder={inputModal.type === 'sticky' ? 'Ex: Mecânica de pulo duplo...' : 'Digite o texto...'}
              className="w-full px-3 py-2 rounded-xl bg-gray-900 border border-gray-700 text-white text-xs focus:outline-none focus:border-indigo-500"
            />
            <div className="flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setInputModal(null)}
                className="px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition"
              >
                Adicionar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Canvas with Right-Click Pan and Wheel Zoom */}
      <div
        className="w-full h-full relative cursor-default"
        onContextMenu={(e) => e.preventDefault()}
        onWheel={handleWheel}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className="w-full h-full"
        />
      </div>
    </div>
  );
};
