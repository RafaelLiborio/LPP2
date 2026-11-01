import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Pencil,
  Eraser,
  PaintBucket,
  Pipette,
  Minus,
  Square,
  Circle,
  Play,
  Pause,
  Plus,
  Trash2,
  Copy,
  Download,
  Share2,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Grid,
  Eye,
  EyeOff,
  Undo2,
  FileSpreadsheet
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext';

// Famous retro palettes
const PALETTES = {
  'PICO-8': [
    '#000000', '#1D2B53', '#7E2553', '#008751', '#AB5236', '#5F574F', '#C2C3C7', '#FFF1E8',
    '#FF004D', '#FFA300', '#FFEC27', '#00E436', '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA'
  ],
  'Game Boy': ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  'DawnBringer 16': [
    '#140c1c', '#442434', '#30346d', '#4e4a4e', '#854c30', '#346524', '#d04648', '#757161',
    '#597dce', '#d27d2c', '#8595a1', '#6daa2c', '#d2a474', '#4992db', '#dad45e', '#66ffe3'
  ],
  'Cyber Neon': [
    '#050505', '#1a0033', '#7100a0', '#b000ff', '#ff007f', '#ff003c', '#00f0ff', '#00ff66',
    '#ffe600', '#ffffff', '#22223b', '#4a4e69', '#9a8c98', '#c9ada7', '#f2e9e4', '#3d5a80'
  ]
};

type ToolType = 'pencil' | 'eraser' | 'bucket' | 'picker' | 'line' | 'rect' | 'circle';

interface Layer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
}

export const AsepriteModule: React.FC = () => {
  const { sendMessage } = useSocket();

  // Canvas Settings
  const [gridSize, setGridSize] = useState<number>(32);
  const [zoom, setZoom] = useState<number>(14);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [onionSkin, setOnionSkin] = useState<boolean>(true);

  // Tools & Colors
  const [activeTool, setActiveTool] = useState<ToolType>('pencil');
  const [brushSize, setBrushSize] = useState<number>(1);
  const [primaryColor, setPrimaryColor] = useState<string>('#ff004d');
  const [secondaryColor, setSecondaryColor] = useState<string>('#ffffff');
  const [paletteName, setPaletteName] = useState<keyof typeof PALETTES>('PICO-8');

  // Layers & Frames
  const [layers, setLayers] = useState<Layer[]>([
    { id: 'l-1', name: 'Camada 1 (Base)', visible: true, opacity: 1 }
  ]);
  const [activeLayerId, setActiveLayerId] = useState<string>('l-1');

  const [frames, setFrames] = useState<number[]>([0]);
  const [activeFrameIndex, setActiveFrameIndex] = useState<number>(0);
  const [framesData, setFramesData] = useState<{ [frameIdx: number]: { [layerId: string]: string[] } }>({
    0: { 'l-1': new Array(32 * 32).fill('') }
  });

  // Undo history stack
  const undoStackRef = useRef<string[][]>([]);

  // Animation Playback
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [fps, setFps] = useState<number>(8);
  const playFrameRef = useRef<number>(0);

  // Interaction Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef<boolean>(false);
  const isPanningRef = useRef<boolean>(false);
  const dragStartPixel = useRef<{ x: number; y: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Right-click layer context menu state
  const [layerMenu, setLayerMenu] = useState<{ x: number; y: number; layerId: string } | null>(null);

  // Prevent Mouse Blur / Ghost Drawing: Global listeners
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      isDrawingRef.current = false;
      dragStartPixel.current = null;
      isPanningRef.current = false;
    };

    const handleGlobalBlur = () => {
      isDrawingRef.current = false;
      dragStartPixel.current = null;
      isPanningRef.current = false;
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
  }, [activeFrameIndex, activeLayerId]);

  // Close context menu on outside click
  useEffect(() => {
    const closeMenu = () => setLayerMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  // Initialize or resize frames buffer if gridSize changes
  useEffect(() => {
    setFramesData((prev) => {
      const next: typeof prev = {};
      frames.forEach((fIdx) => {
        next[fIdx] = {};
        layers.forEach((l) => {
          const oldData = prev[fIdx]?.[l.id];
          const newArr = new Array(gridSize * gridSize).fill('');
          if (oldData) {
            // Keep existing pixels up to new size
            const oldDim = Math.sqrt(oldData.length);
            for (let y = 0; y < Math.min(oldDim, gridSize); y++) {
              for (let x = 0; x < Math.min(oldDim, gridSize); x++) {
                newArr[y * gridSize + x] = oldData[y * oldDim + x] || '';
              }
            }
          }
          next[fIdx][l.id] = newArr;
        });
      });
      return next;
    });
  }, [gridSize]);

  // Animation Loop
  useEffect(() => {
    if (!isPlaying || frames.length <= 1) return;
    const interval = setInterval(() => {
      playFrameRef.current = (playFrameRef.current + 1) % frames.length;
      renderPreview(playFrameRef.current);
    }, 1000 / fps);

    return () => clearInterval(interval);
  }, [isPlaying, fps, frames, framesData, layers]);

  // Draw the preview small animation
  const renderPreview = (frameIdx: number) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const pixelWidth = canvas.width / gridSize;

    layers.forEach((layer) => {
      if (!layer.visible) return;
      const data = framesData[frameIdx]?.[layer.id];
      if (!data) return;

      ctx.globalAlpha = layer.opacity;
      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          const color = data[y * gridSize + x];
          if (color) {
            ctx.fillStyle = color;
            ctx.fillRect(x * pixelWidth, y * pixelWidth, pixelWidth, pixelWidth);
          }
        }
      }
    });
    ctx.globalAlpha = 1;
  };

  // Render Main Interactive Canvas
  const drawMainCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Checkerboard background (transparency)
    const checkSize = Math.max(4, Math.floor(zoom / 2));
    for (let y = 0; y < canvas.height; y += checkSize) {
      for (let x = 0; x < canvas.width; x += checkSize) {
        ctx.fillStyle = (Math.floor(x / checkSize) + Math.floor(y / checkSize)) % 2 === 0 ? '#1b1d28' : '#252837';
        ctx.fillRect(x, y, checkSize, checkSize);
      }
    }

    // 2. Onion Skinning (Previous frame in low opacity)
    if (onionSkin && activeFrameIndex > 0) {
      const prevFrame = activeFrameIndex - 1;
      layers.forEach((layer) => {
        const prevData = framesData[prevFrame]?.[layer.id];
        if (!prevData) return;
        ctx.globalAlpha = 0.25;
        for (let y = 0; y < gridSize; y++) {
          for (let x = 0; x < gridSize; x++) {
            const color = prevData[y * gridSize + x];
            if (color) {
              ctx.fillStyle = color;
              ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
            }
          }
        }
      });
      ctx.globalAlpha = 1;
    }

    // 3. Render Current Frame's Layers
    layers.forEach((layer) => {
      if (!layer.visible) return;
      const data = framesData[activeFrameIndex]?.[layer.id];
      if (!data) return;

      ctx.globalAlpha = layer.opacity;
      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          const color = data[y * gridSize + x];
          if (color) {
            ctx.fillStyle = color;
            ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
          }
        }
      }
    });
    ctx.globalAlpha = 1;

    // 4. Render Grid Lines
    if (showGrid && zoom >= 6) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= gridSize; i++) {
        ctx.beginPath();
        ctx.moveTo(i * zoom, 0);
        ctx.lineTo(i * zoom, gridSize * zoom);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, i * zoom);
        ctx.lineTo(gridSize * zoom, i * zoom);
        ctx.stroke();
      }
    }

    renderPreview(activeFrameIndex);
  }, [gridSize, zoom, showGrid, onionSkin, layers, framesData, activeFrameIndex]);

  useEffect(() => {
    drawMainCanvas();
  }, [drawMainCanvas]);

  // Accurate Pixel Coordinate Calculation
  const getPixelCoord = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;
    const x = Math.floor(rawX / zoom);
    const y = Math.floor(rawY / zoom);
    return {
      x: Math.max(0, Math.min(gridSize - 1, x)),
      y: Math.max(0, Math.min(gridSize - 1, y))
    };
  };

  const pushUndoSnapshot = () => {
    const currentData = framesData[activeFrameIndex]?.[activeLayerId];
    if (currentData) {
      undoStackRef.current.push([...currentData]);
      if (undoStackRef.current.length > 30) {
        undoStackRef.current.shift();
      }
    }
  };

  const handleUndo = () => {
    if (undoStackRef.current.length === 0) return;
    const previous = undoStackRef.current.pop()!;
    setFramesData((prev) => ({
      ...prev,
      [activeFrameIndex]: {
        ...(prev[activeFrameIndex] || {}),
        [activeLayerId]: previous
      }
    }));
  };

  // Tool Action: Flood Fill algorithm
  const floodFill = (startX: number, startY: number, fillColor: string) => {
    pushUndoSnapshot();
    const layerData = [...(framesData[activeFrameIndex]?.[activeLayerId] || [])];
    const targetColor = layerData[startY * gridSize + startX];
    if (targetColor === fillColor) return;

    const queue: [number, number][] = [[startX, startY]];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const [x, y] = queue.pop()!;
      const key = `${x},${y}`;
      if (visited.has(key)) continue;
      visited.add(key);

      const idx = y * gridSize + x;
      if (layerData[idx] === targetColor) {
        layerData[idx] = fillColor;

        if (x > 0) queue.push([x - 1, y]);
        if (x < gridSize - 1) queue.push([x + 1, y]);
        if (y > 0) queue.push([x, y - 1]);
        if (y < gridSize - 1) queue.push([x, y + 1]);
      }
    }

    updateCurrentLayerData(layerData);
  };

  // Draw Bresenham Line
  const drawLine = (x0: number, y0: number, x1: number, y1: number, color: string) => {
    pushUndoSnapshot();
    const layerData = [...(framesData[activeFrameIndex]?.[activeLayerId] || [])];
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let currX = x0;
    let currY = y0;

    while (true) {
      applyBrush(currX, currY, color, layerData);
      if (currX === x1 && currY === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        currX += sx;
      }
      if (e2 < dx) {
        err += dx;
        currY += sy;
      }
    }
    updateCurrentLayerData(layerData);
  };

  // Draw Rectangle
  const drawRect = (x0: number, y0: number, x1: number, y1: number, color: string) => {
    pushUndoSnapshot();
    const layerData = [...(framesData[activeFrameIndex]?.[activeLayerId] || [])];
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);

    for (let x = minX; x <= maxX; x++) {
      applyBrush(x, minY, color, layerData);
      applyBrush(x, maxY, color, layerData);
    }
    for (let y = minY; y <= maxY; y++) {
      applyBrush(minX, y, color, layerData);
      applyBrush(maxX, y, color, layerData);
    }
    updateCurrentLayerData(layerData);
  };

  // Draw Circle (Ellipse Bresenham)
  const drawCircle = (x0: number, y0: number, x1: number, y1: number, color: string) => {
    pushUndoSnapshot();
    const layerData = [...(framesData[activeFrameIndex]?.[activeLayerId] || [])];
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const rx = Math.abs(x1 - x0) / 2;
    const ry = Math.abs(y1 - y0) / 2;

    if (rx === 0 && ry === 0) {
      applyBrush(x0, y0, color, layerData);
      updateCurrentLayerData(layerData);
      return;
    }

    const steps = Math.max(36, Math.floor(Math.max(rx, ry) * 10));
    for (let i = 0; i < steps; i++) {
      const theta = (i * 2 * Math.PI) / steps;
      const px = Math.round(cx + rx * Math.cos(theta));
      const py = Math.round(cy + ry * Math.sin(theta));
      applyBrush(px, py, color, layerData);
    }
    updateCurrentLayerData(layerData);
  };

  const applyBrush = (x: number, y: number, color: string, dataArray: string[]) => {
    for (let by = 0; by < brushSize; by++) {
      for (let bx = 0; bx < brushSize; bx++) {
        const px = x + bx;
        const py = y + by;
        if (px >= 0 && px < gridSize && py >= 0 && py < gridSize) {
          dataArray[py * gridSize + px] = color;
        }
      }
    }
  };

  const updateCurrentLayerData = (newData: string[]) => {
    setFramesData((prev) => ({
      ...prev,
      [activeFrameIndex]: {
        ...(prev[activeFrameIndex] || {}),
        [activeLayerId]: newData
      }
    }));
  };

  // Canvas Mouse Events
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Middle click: Pan canvas
    if (e.button === 1) {
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
      return;
    }

    const { x, y } = getPixelCoord(e);
    isDrawingRef.current = true;
    dragStartPixel.current = { x, y };

    const isRightClick = e.button === 2;
    const colorToUse = isRightClick ? secondaryColor : primaryColor;

    // Eyedropper
    if (activeTool === 'picker' || e.altKey) {
      const currentLayerData = framesData[activeFrameIndex]?.[activeLayerId] || [];
      const color = currentLayerData[y * gridSize + x];
      if (color) {
        if (isRightClick) setSecondaryColor(color);
        else setPrimaryColor(color);
      }
      return;
    }

    if (activeTool === 'bucket') {
      floodFill(x, y, colorToUse);
      return;
    }

    if (activeTool === 'pencil' || activeTool === 'eraser') {
      pushUndoSnapshot();
      const layerData = [...(framesData[activeFrameIndex]?.[activeLayerId] || [])];
      applyBrush(x, y, activeTool === 'eraser' ? '' : colorToUse, layerData);
      updateCurrentLayerData(layerData);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanningRef.current) {
      setPanOffset({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y
      });
      return;
    }

    if (!isDrawingRef.current) return;
    const { x, y } = getPixelCoord(e);
    const isRightClick = (e.buttons & 2) !== 0;
    const colorToUse = isRightClick ? secondaryColor : primaryColor;

    if (activeTool === 'pencil' || activeTool === 'eraser') {
      const layerData = [...(framesData[activeFrameIndex]?.[activeLayerId] || [])];
      applyBrush(x, y, activeTool === 'eraser' ? '' : colorToUse, layerData);
      updateCurrentLayerData(layerData);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      return;
    }

    if (!isDrawingRef.current) return;
    const { x, y } = getPixelCoord(e);
    const isRightClick = e.button === 2;
    const colorToUse = isRightClick ? secondaryColor : primaryColor;

    if (dragStartPixel.current) {
      if (activeTool === 'line') {
        drawLine(dragStartPixel.current.x, dragStartPixel.current.y, x, y, colorToUse);
      } else if (activeTool === 'rect') {
        drawRect(dragStartPixel.current.x, dragStartPixel.current.y, x, y, colorToUse);
      } else if (activeTool === 'circle') {
        drawCircle(dragStartPixel.current.x, dragStartPixel.current.y, x, y, colorToUse);
      }
    }

    isDrawingRef.current = false;
    dragStartPixel.current = null;
  };

  // Wheel Zoom support
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoom((z) => Math.min(36, z + 2));
    } else {
      setZoom((z) => Math.max(4, z - 2));
    }
  };

  // Clear current active layer
  const clearCurrentLayer = () => {
    pushUndoSnapshot();
    updateCurrentLayerData(new Array(gridSize * gridSize).fill(''));
  };

  // Frame operations
  const addFrame = () => {
    const newIdx = frames.length;
    setFrames((prev) => [...prev, newIdx]);
    setFramesData((prev) => ({
      ...prev,
      [newIdx]: Object.fromEntries(layers.map((l) => [l.id, new Array(gridSize * gridSize).fill('')]))
    }));
    setActiveFrameIndex(newIdx);
  };

  const duplicateFrame = () => {
    const newIdx = frames.length;
    const currentData = framesData[activeFrameIndex] || {};
    const clonedData: { [key: string]: string[] } = {};
    layers.forEach((l) => {
      clonedData[l.id] = [...(currentData[l.id] || new Array(gridSize * gridSize).fill(''))];
    });

    setFrames((prev) => [...prev, newIdx]);
    setFramesData((prev) => ({
      ...prev,
      [newIdx]: clonedData
    }));
    setActiveFrameIndex(newIdx);
  };

  const deleteFrame = (idx: number) => {
    if (frames.length <= 1) return;
    const newFrames = frames.filter((f) => f !== idx);
    setFrames(newFrames);
    setActiveFrameIndex(Math.max(0, idx - 1));
  };

  // Export as Single PNG
  const exportPNG = (scale = 8) => {
    const offCanvas = document.createElement('canvas');
    offCanvas.width = gridSize * scale;
    offCanvas.height = gridSize * scale;
    const ctx = offCanvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    layers.forEach((layer) => {
      if (!layer.visible) return;
      const data = framesData[activeFrameIndex]?.[layer.id];
      if (!data) return;

      ctx.globalAlpha = layer.opacity;
      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          const color = data[y * gridSize + x];
          if (color) {
            ctx.fillStyle = color;
            ctx.fillRect(x * scale, y * scale, scale, scale);
          }
        }
      }
    });

    const dataUrl = offCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `lpp2_sprite_f${activeFrameIndex + 1}_${gridSize}x${gridSize}.png`;
    a.click();
  };

  // Export as Horizontal Spritesheet (All Frames)
  const exportSpritesheet = (scale = 4) => {
    const totalFrames = frames.length;
    const offCanvas = document.createElement('canvas');
    offCanvas.width = gridSize * totalFrames * scale;
    offCanvas.height = gridSize * scale;
    const ctx = offCanvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    frames.forEach((frameIdx, fPos) => {
      layers.forEach((layer) => {
        if (!layer.visible) return;
        const data = framesData[frameIdx]?.[layer.id];
        if (!data) return;

        ctx.globalAlpha = layer.opacity;
        for (let y = 0; y < gridSize; y++) {
          for (let x = 0; x < gridSize; x++) {
            const color = data[y * gridSize + x];
            if (color) {
              ctx.fillStyle = color;
              ctx.fillRect((fPos * gridSize + x) * scale, y * scale, scale, scale);
            }
          }
        }
      });
    });

    const dataUrl = offCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `lpp2_spritesheet_${totalFrames}frames_${gridSize}x${gridSize}.png`;
    a.click();
  };

  // Send directly to Discord Chat
  const sendSpriteToDiscord = () => {
    const offCanvas = document.createElement('canvas');
    const scale = 8;
    offCanvas.width = gridSize * scale;
    offCanvas.height = gridSize * scale;
    const ctx = offCanvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    layers.forEach((layer) => {
      if (!layer.visible) return;
      const data = framesData[activeFrameIndex]?.[layer.id];
      if (!data) return;
      ctx.globalAlpha = layer.opacity;
      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          const color = data[y * gridSize + x];
          if (color) {
            ctx.fillStyle = color;
            ctx.fillRect(x * scale, y * scale, scale, scale);
          }
        }
      }
    });

    const dataUrl = offCanvas.toDataURL('image/png');
    sendMessage(`🎨 Novo sprite exportado (${gridSize}x${gridSize}):`, 'pixel-art', dataUrl);
    alert('Sprite enviado para o canal #arte-e-sprites no chat da equipe!');
  };

  return (
    <div className="flex w-full h-full bg-[#12131b] text-gray-200 overflow-hidden select-none">
      {/* 1. Left Toolbar (Aseprite style) */}
      <div className="w-16 bg-[#171822] border-r border-gray-800 flex flex-col items-center py-3 gap-2 shrink-0">
        <span className="text-xs font-mono font-bold text-indigo-400 mb-1">ASE</span>

        {/* Tools */}
        {[
          { id: 'pencil', icon: Pencil, label: 'Lápis (Esq: Primária, Dir: Secundária)' },
          { id: 'eraser', icon: Eraser, label: 'Borracha' },
          { id: 'bucket', icon: PaintBucket, label: 'Balde de Tinta' },
          { id: 'picker', icon: Pipette, label: 'Conta-gotas (Alt + Click)' },
          { id: 'line', icon: Minus, label: 'Linha Reta' },
          { id: 'rect', icon: Square, label: 'Retângulo' },
          { id: 'circle', icon: Circle, label: 'Círculo / Elipse' }
        ].map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id as ToolType)}
              title={tool.label}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <Icon size={18} />
            </button>
          );
        })}

        <div className="w-8 h-px bg-gray-800 my-1" />

        {/* Brush Size */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] text-gray-400 font-semibold">{brushSize}px</span>
          <div className="flex flex-col gap-1">
            {[1, 2, 3, 4].map((size) => (
              <button
                key={size}
                onClick={() => setBrushSize(size)}
                className={`w-6 h-6 rounded text-[11px] font-bold transition ${
                  brushSize === size ? 'bg-indigo-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        {/* Color Swatches Active: Left Click & Right Click */}
        <div className="mt-auto relative w-10 h-10">
          <input
            type="color"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            title="Cor Primária (Botão Esquerdo)"
            className="absolute top-0 left-0 w-6 h-6 rounded border-2 border-white cursor-pointer overflow-hidden p-0 z-10"
          />
          <input
            type="color"
            value={secondaryColor}
            onChange={(e) => setSecondaryColor(e.target.value)}
            title="Cor Secundária (Botão Direito)"
            className="absolute bottom-0 right-0 w-6 h-6 rounded border border-gray-500 cursor-pointer overflow-hidden p-0"
          />
        </div>
      </div>

      {/* 2. Center Area: Canvas & Timeline */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Controls Bar */}
        <div className="h-12 bg-[#171822] border-b border-gray-800 px-4 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            {/* Resolution selector */}
            <div className="flex items-center gap-1.5 bg-gray-900 px-2 py-1 rounded-lg border border-gray-700">
              <span className="text-gray-400 font-medium">Tamanho:</span>
              {[16, 24, 32, 64].map((sz) => (
                <button
                  key={sz}
                  onClick={() => setGridSize(sz)}
                  className={`px-1.5 py-0.5 rounded font-mono font-bold transition ${
                    gridSize === sz ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>

            {/* Grid toggle */}
            <button
              onClick={() => setShowGrid(!showGrid)}
              className={`p-1.5 rounded-lg border flex items-center gap-1 transition ${
                showGrid ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-gray-800 border-gray-700 text-gray-400'
              }`}
            >
              <Grid size={14} />
              <span>Grid</span>
            </button>

            {/* Onion Skin toggle */}
            <button
              onClick={() => setOnionSkin(!onionSkin)}
              className={`p-1.5 rounded-lg border flex items-center gap-1 transition ${
                onionSkin ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-gray-800 border-gray-700 text-gray-400'
              }`}
            >
              <Layers size={14} />
              <span>Onion Skin</span>
            </button>

            {/* Undo Button */}
            <button
              onClick={handleUndo}
              title="Desfazer (Ctrl+Z)"
              className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 flex items-center gap-1 transition"
            >
              <Undo2 size={14} />
              <span>Desfazer</span>
            </button>

            {/* Clear Layer */}
            <button
              onClick={clearCurrentLayer}
              title="Limpar camada atual"
              className="p-1.5 rounded-lg bg-gray-800 hover:bg-rose-500/20 border border-gray-700 hover:border-rose-500/40 text-gray-300 hover:text-rose-400 transition"
            >
              <Trash2 size={14} />
            </button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setZoom((z) => Math.max(4, z - 2))}
              className="p-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
            >
              <ZoomOut size={14} />
            </button>
            <span className="font-mono text-gray-300 w-12 text-center">{zoom * 10}%</span>
            <button
              onClick={() => setZoom((z) => Math.min(36, z + 2))}
              className="p-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
            >
              <ZoomIn size={14} />
            </button>
            <button
              onClick={() => {
                setZoom(14);
                setPanOffset({ x: 0, y: 0 });
              }}
              className="p-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
              title="Resetar Zoom e Centralizar"
            >
              <RotateCcw size={14} />
            </button>
          </div>

          {/* Export Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportPNG(8)}
              className="px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white font-medium flex items-center gap-1.5 transition"
            >
              <Download size={13} />
              PNG
            </button>
            <button
              onClick={() => exportSpritesheet(4)}
              className="px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white font-medium flex items-center gap-1.5 transition"
              title="Exportar todos os frames lado a lado"
            >
              <FileSpreadsheet size={13} />
              Spritesheet
            </button>
            <button
              onClick={sendSpriteToDiscord}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition"
            >
              <Share2 size={13} />
              Enviar pro Chat
            </button>
          </div>
        </div>

        {/* Canvas Workspace Viewport with Wheel Zoom and Middle-Click Pan */}
        <div
          className="flex-1 bg-[#0f1017] overflow-hidden flex items-center justify-center p-8 relative"
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
              transition: isPanningRef.current ? 'none' : 'transform 0.05s ease-out'
            }}
          >
            <canvas
              ref={canvasRef}
              width={gridSize * zoom}
              height={gridSize * zoom}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              className="shadow-2xl rounded border border-gray-700 cursor-crosshair bg-transparent"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
        </div>

        {/* Bottom: Animation Timeline (Frames) */}
        <div className="h-28 bg-[#171822] border-t border-gray-800 flex flex-col p-2 shrink-0">
          <div className="flex items-center justify-between pb-2 border-b border-gray-800/80 text-xs">
            {/* Play / FPS controls */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className={`px-3 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition ${
                  isPlaying ? 'bg-amber-600 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {isPlaying ? <Pause size={13} /> : <Play size={13} />}
                {isPlaying ? 'Pausar' : 'Reproduzir'}
              </button>

              <div className="flex items-center gap-1.5 text-gray-400">
                <span>FPS:</span>
                <input
                  type="range"
                  min="1"
                  max="24"
                  value={fps}
                  onChange={(e) => setFps(Number(e.target.value))}
                  className="w-20 accent-indigo-500"
                />
                <span className="font-mono text-white font-bold">{fps}</span>
              </div>
            </div>

            {/* Frame buttons */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={addFrame}
                className="px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-white font-medium flex items-center gap-1 transition"
              >
                <Plus size={13} /> Novo Frame
              </button>
              <button
                onClick={duplicateFrame}
                className="px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-white font-medium flex items-center gap-1 transition"
              >
                <Copy size={13} /> Duplicar
              </button>
              <button
                onClick={() => deleteFrame(activeFrameIndex)}
                disabled={frames.length <= 1}
                className="px-2 py-1 rounded-lg bg-rose-600/20 text-rose-400 hover:bg-rose-600/40 disabled:opacity-30 transition"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {/* Frames List Track */}
          <div className="flex-1 flex items-center gap-2 overflow-x-auto pt-2">
            {frames.map((frameIdx) => (
              <button
                key={frameIdx}
                onClick={() => setActiveFrameIndex(frameIdx)}
                className={`h-12 min-w-16 rounded-lg border flex flex-col items-center justify-center p-1 transition ${
                  activeFrameIndex === frameIdx
                    ? 'border-indigo-500 bg-indigo-500/20 text-white font-bold'
                    : 'border-gray-800 bg-gray-900/60 text-gray-400 hover:bg-gray-800'
                }`}
              >
                <span className="text-[10px] uppercase">F{frameIdx + 1}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Right Sidebar: Palettes, Preview & Layers */}
      <div className="w-64 bg-[#171822] border-l border-gray-800 flex flex-col shrink-0">
        {/* Animated Preview Box */}
        <div className="p-3 border-b border-gray-800 flex flex-col items-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
            Pré-visualização 1x
          </span>
          <div className="w-24 h-24 rounded-lg bg-[#111219] border border-gray-700 flex items-center justify-center overflow-hidden">
            <canvas
              ref={previewCanvasRef}
              width={gridSize}
              height={gridSize}
              className="w-20 h-20"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
        </div>

        {/* Color Palette */}
        <div className="p-3 border-b border-gray-800 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Paletas de Cores
            </span>
            <select
              value={paletteName}
              onChange={(e) => setPaletteName(e.target.value as keyof typeof PALETTES)}
              className="bg-gray-900 border border-gray-700 text-white text-[11px] rounded px-1.5 py-0.5 outline-none"
            >
              {Object.keys(PALETTES).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {PALETTES[paletteName].map((hex) => (
              <button
                key={hex}
                onClick={() => setPrimaryColor(hex)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setSecondaryColor(hex);
                }}
                title={`${hex}\n(Clique Esquerdo: Primária, Clique Direito: Secundária)`}
                className={`h-7 rounded-md border transition hover:scale-110 ${
                  primaryColor.toLowerCase() === hex.toLowerCase()
                    ? 'border-white scale-105 shadow-md shadow-white/30'
                    : secondaryColor.toLowerCase() === hex.toLowerCase()
                    ? 'border-amber-400 scale-105'
                    : 'border-transparent'
                }`}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
          <p className="text-[10px] text-gray-500 mt-2 text-center">
            Clique Esq: Cor 1 • Clique Dir: Cor 2
          </p>
        </div>

        {/* Layers Section */}
        <div className="h-44 p-3 flex flex-col border-t border-gray-800 relative">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1">
              <Layers size={12} /> Camadas (Layers)
            </span>
            <button
              onClick={() => {
                const newId = `l-${Date.now()}`;
                const newLayer: Layer = { id: newId, name: `Camada ${layers.length + 1}`, visible: true, opacity: 1 };
                setLayers((prev) => [...prev, newLayer]);
                setActiveLayerId(newId);
              }}
              className="p-1 rounded bg-gray-800 hover:bg-gray-700 text-white text-[10px] flex items-center gap-1"
            >
              <Plus size={12} /> Adicionar
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1">
            {layers.map((layer) => (
              <div
                key={layer.id}
                onClick={() => setActiveLayerId(layer.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setLayerMenu({ x: e.clientX, y: e.clientY, layerId: layer.id });
                }}
                className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs cursor-pointer transition ${
                  activeLayerId === layer.id
                    ? 'bg-indigo-600/20 text-white border border-indigo-500/40'
                    : 'text-gray-400 hover:bg-gray-800/60'
                }`}
              >
                <span className="truncate">{layer.name}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setLayers((prev) =>
                        prev.map((l) => (l.id === layer.id ? { ...l, visible: !l.visible } : l))
                      );
                    }}
                    className="p-1 text-gray-400 hover:text-white"
                  >
                    {layer.visible ? <Eye size={13} /> : <EyeOff size={13} className="text-gray-600" />}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Right Click Context Menu on Layer */}
          {layerMenu && (
            <div
              className="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 text-xs text-gray-200"
              style={{ top: layerMenu.y, left: layerMenu.x }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="w-full text-left px-3 py-1.5 hover:bg-gray-800 transition"
                onClick={() => {
                  const newName = prompt('Novo nome para a camada:');
                  if (newName) {
                    setLayers((prev) =>
                      prev.map((l) => (l.id === layerMenu.layerId ? { ...l, name: newName } : l))
                    );
                  }
                  setLayerMenu(null);
                }}
              >
                Renomear Camada
              </button>
              <button
                className="w-full text-left px-3 py-1.5 hover:bg-gray-800 transition"
                onClick={() => {
                  clearCurrentLayer();
                  setLayerMenu(null);
                }}
              >
                Limpar Pixels da Camada
              </button>
              {layers.length > 1 && (
                <button
                  className="w-full text-left px-3 py-1.5 hover:bg-rose-900/50 text-rose-300 transition"
                  onClick={() => {
                    setLayers((prev) => prev.filter((l) => l.id !== layerMenu.layerId));
                    setActiveLayerId(layers[0].id);
                    setLayerMenu(null);
                  }}
                >
                  Excluir Camada
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
