import React, { useState, useRef, useEffect } from 'react';
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
  Share2
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
  const currentPathRef = useRef<{ x: number; y: number }[]>([]);
  const startPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Pan & Zoom
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom] = useState(1);

  // Redraw canvas whenever elements or pan changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Grid dots (Figma style)
    const dotSize = 1;
    const spacing = 30 * zoom;
    ctx.fillStyle = '#262836';
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
      ctx.lineWidth = el.strokeWidth;
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
        const headLen = 12;
        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      } else if (el.type === 'sticky') {
        const w = 150 * zoom;
        const h = 130 * zoom;
        const sx = el.x * zoom + pan.x;
        const sy = el.y * zoom + pan.y;

        // Shadow & Card
        ctx.fillStyle = el.fillColor || '#fef08a';
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 10;
        ctx.fillRect(sx, sy, w, h);
        ctx.shadowBlur = 0;

        // Sticky text
        ctx.fillStyle = '#1e1e1e';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(el.text || 'Nota...', sx + 10, sy + 25);
        ctx.font = '9px sans-serif';
        ctx.fillStyle = '#6b7280';
        ctx.fillText(`Por ${el.author}`, sx + 10, sy + h - 10);
      } else if (el.type === 'text') {
        ctx.fillStyle = el.color;
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(el.text || 'Texto', el.x * zoom + pan.x, el.y * zoom + pan.y);
      }
    });
  }, [whiteboardElements, pan, zoom]);

  // Handle Resize of Window
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = canvas.parentElement?.clientWidth || 1000;
      canvas.height = canvas.parentElement?.clientHeight || 700;
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
    const { x, y } = getCanvasCoords(e);
    isMouseDownRef.current = true;
    startPosRef.current = { x, y };

    if (activeTool === 'pencil') {
      currentPathRef.current = [{ x, y }];
    } else if (activeTool === 'sticky') {
      const text = prompt('Digite o conteúdo da nota de brainstorming:', 'Nova mecânica de jogo');
      if (text) {
        sendWhiteboardAction({
          type: 'add',
          element: {
            id: `sticky-${Date.now()}`,
            type: 'sticky',
            x,
            y,
            fillColor: stickyColor,
            color: '#1f2937',
            strokeWidth: 1,
            text,
            author: currentUser.username
          }
        });
      }
      isMouseDownRef.current = false;
    } else if (activeTool === 'text') {
      const text = prompt('Texto do quadro:', 'Fase 1: Floresta Sombria');
      if (text) {
        sendWhiteboardAction({
          type: 'add',
          element: {
            id: `txt-${Date.now()}`,
            type: 'text',
            x,
            y,
            color,
            strokeWidth: 1,
            text,
            author: currentUser.username
          }
        });
      }
      isMouseDownRef.current = false;
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y, rawX, rawY } = getCanvasCoords(e);

    // Broadcast cursor position to partners
    sendCursorMove(rawX, rawY);

    if (!isMouseDownRef.current) return;

    if (activeTool === 'select') {
      // Pan canvas
      setPan((prev) => ({
        x: prev.x + e.movementX,
        y: prev.y + e.movementY
      }));
    } else if (activeTool === 'pencil') {
      currentPathRef.current.push({ x, y });
      // Live draw preview
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = color;
        ctx.lineWidth = strokeWidth;
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
      if (Math.abs(w) > 5 && Math.abs(h) > 5) {
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
      if (Math.abs(w) > 5) {
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
      if (Math.abs(w) > 5 || Math.abs(h) > 5) {
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
    alert('Quadro enviado para o canal #gamedev no chat da equipe!');
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

        {/* Actions */}
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

      {/* Main Canvas */}
      <div className="w-full h-full relative cursor-default">
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
