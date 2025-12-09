
import React, { useRef, useEffect, useState } from 'react';
import { detectTextRegions } from '../services/geminiService';
import { InpaintMode } from '../services/openaiService';

interface StepMaskingProps {
  imageSrc: string;
  apiKey: string;
  onConfirm: (maskForInpainting: string, mode: InpaintMode) => void;
  onCancel: () => void;
}

type ToolType = 'brush' | 'rect' | 'eraser' | 'eraser-rect';

const StepMasking: React.FC<StepMaskingProps> = ({ imageSrc, apiKey, onConfirm, onCancel }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  
  // Tools state
  const [activeTool, setActiveTool] = useState<ToolType>('brush');
  const [brushSize, setBrushSize] = useState(30);
  const [isDrawing, setIsDrawing] = useState(false);
  const [fillMode, setFillMode] = useState<InpaintMode>('chart');
  
  // History for Undo
  const [history, setHistory] = useState<ImageData[]>([]);
  
  // Auto Detect State
  const [isDetecting, setIsDetecting] = useState(false);

  // Rect tool state
  const startPosRef = useRef<{x: number, y: number} | null>(null);
  const snapshotRef = useRef<ImageData | null>(null);

  // Scaling state for cursor
  const [scaleFactor, setScaleFactor] = useState(1);
  const [isHoveringCanvas, setIsHoveringCanvas] = useState(false);

  const initCanvas = () => {
    if (imageRef.current && canvasRef.current) {
      const { naturalWidth, naturalHeight } = imageRef.current;
      canvasRef.current.width = naturalWidth;
      canvasRef.current.height = naturalHeight;
      updateScaleFactor();
      saveHistory();
    }
  };

  const updateScaleFactor = () => {
    if (imageRef.current) {
        const rect = imageRef.current.getBoundingClientRect();
        const currentScale = rect.width / imageRef.current.naturalWidth;
        setScaleFactor(currentScale);
    }
  };

  useEffect(() => {
    window.addEventListener('resize', updateScaleFactor);
    return () => window.removeEventListener('resize', updateScaleFactor);
  }, []);

  useEffect(() => {
    if (imageRef.current && imageRef.current.complete) {
      initCanvas();
    }
  }, []);

  const saveHistory = () => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
        setHistory(prev => {
           const newHistory = [...prev, imageData];
           if (newHistory.length > 20) return newHistory.slice(newHistory.length - 20);
           return newHistory;
        });
      }
    }
  };

  const handleUndo = () => {
    if (history.length > 0 && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      const newHistory = [...history];
      if (newHistory.length <= 1) {
          if (ctx) ctx.clearRect(0,0, canvasRef.current.width, canvasRef.current.height);
          setHistory([]); 
          return;
      }
      newHistory.pop(); 
      const previousState = newHistory[newHistory.length - 1]; 
      if (ctx && previousState) {
        ctx.putImageData(previousState, 0, 0);
        setHistory(newHistory);
      }
    }
  };

  const handleAutoDetect = async () => {
    if (!imageSrc || !apiKey) return;
    setIsDetecting(true);
    try {
      const regions = await detectTextRegions(apiKey, imageSrc);
      if (canvasRef.current && imageRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        const width = canvasRef.current.width;
        const height = canvasRef.current.height;
        if (ctx) {
          saveHistory();
          ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
          const PADDING = 2; 
          regions.forEach(r => {
            const rawX = (r.xmin / 100) * width;
            const rawY = (r.ymin / 100) * height;
            const rawW = ((r.xmax - r.xmin) / 100) * width;
            const rawH = ((r.ymax - r.ymin) / 100) * height;
            const x = Math.max(0, rawX - PADDING);
            const y = Math.max(0, rawY - PADDING);
            const w = Math.min(width - x, rawW + (PADDING * 2));
            const h = Math.min(height - y, rawH + (PADDING * 2));
            ctx.fillRect(x, y, w, h);
          });
          saveHistory();
        }
      }
    } catch (e) {
      console.error(e);
      alert("自動偵測失敗，請檢查 API Key 是否有效。");
    } finally {
      setIsDetecting(false);
    }
  };

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current || !imageRef.current) return { x: 0, y: 0 };
    const rect = imageRef.current.getBoundingClientRect();
    const scaleX = imageRef.current.naturalWidth / rect.width;
    const scaleY = imageRef.current.naturalHeight / rect.height;

    let clientX, clientY;
    if ('touches' in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = (e as React.MouseEvent).clientX;
        clientY = (e as React.MouseEvent).clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
      clientX,
      clientY
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault(); 
    setIsDrawing(true);
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current?.getContext('2d');
    
    if (!ctx || !canvasRef.current) return;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;

    if (activeTool === 'brush') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else if (activeTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)'; 
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else if (activeTool === 'rect' || activeTool === 'eraser-rect') {
      // For rect tools, we save a snapshot to restore on each frame
      snapshotRef.current = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
      startPosRef.current = { x, y };
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    const { x, y, clientX, clientY } = getCoordinates(e);
    if (cursorRef.current && clientX !== undefined && clientY !== undefined) {
        cursorRef.current.style.transform = `translate(${clientX}px, ${clientY}px)`;
    }

    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    if (activeTool === 'brush' || activeTool === 'eraser') {
      ctx.lineTo(x, y);
      ctx.stroke();
    } else if ((activeTool === 'rect' || activeTool === 'eraser-rect') && startPosRef.current && snapshotRef.current) {
      // Restore the snapshot first to clear previous rect frame
      ctx.putImageData(snapshotRef.current, 0, 0);
      
      const startX = startPosRef.current.x;
      const startY = startPosRef.current.y;
      const width = x - startX;
      const height = y - startY;

      if (activeTool === 'rect') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.fillRect(startX, startY, width, height);
      } else if (activeTool === 'eraser-rect') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.fillRect(startX, startY, width, height);
      }
    }
  };

  const stopDrawing = () => {
    if (isDrawing) {
      const ctx = canvasRef.current?.getContext('2d');
      if ((activeTool === 'brush' || activeTool === 'eraser') && ctx) {
        ctx.closePath();
      }
      setIsDrawing(false);
      startPosRef.current = null;
      snapshotRef.current = null;
      saveHistory();
    }
  };

  const handleConfirm = () => {
    if (!canvasRef.current || !imageRef.current) return;
    const width = canvasRef.current.width;
    const height = canvasRef.current.height;

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext('2d');

    if (maskCtx) {
        maskCtx.fillStyle = '#FFFFFF';
        maskCtx.fillRect(0, 0, width, height);
        maskCtx.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 20; i++) {
           maskCtx.drawImage(canvasRef.current, 0, 0);
        }
    }
    const maskBase64 = maskCanvas.toDataURL('image/png');
    onConfirm(maskBase64, fillMode);
  };
  
  // Logic to clear canvas on Cancel
  const handleLocalCancel = () => {
      // 1. Clear the canvas (Visual Reset)
      if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
              ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          }
      }
      // 2. Clear history
      setHistory([]);
      
      // 3. Notify parent (App) to handle navigation (e.g. Exit Refine Mode)
      onCancel();
  };

  const cursorSizePx = brushSize * scaleFactor;

  return (
    <div className="flex flex-col h-full bg-gray-100 relative">
      {/* Custom Cursor */}
      <div 
        ref={cursorRef}
        className="fixed pointer-events-none z-50 rounded-full border border-gray-800 bg-red-500/20 shadow-sm transition-transform duration-75 ease-out"
        style={{
            width: `${cursorSizePx}px`,
            height: `${cursorSizePx}px`,
            top: 0, 
            left: 0,
            marginTop: `-${cursorSizePx / 2}px`,
            marginLeft: `-${cursorSizePx / 2}px`,
            display: isHoveringCanvas && (activeTool === 'brush' || activeTool === 'eraser') ? 'block' : 'none',
        }}
      >
        <div className="w-full h-full border border-white rounded-full opacity-50"></div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col border-b shadow-sm z-10 shrink-0">
        {/* Main Tools */}
        <div className="flex items-center justify-between bg-white p-3">
          <div className="flex items-center space-x-3 overflow-x-auto">
            <button 
              onClick={handleAutoDetect}
              disabled={isDetecting}
              className="flex items-center space-x-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-200 hover:bg-indigo-100 transition-colors shrink-0"
            >
              <span className="text-sm font-medium">自動偵測</span>
            </button>
            
            <div className="h-6 w-px bg-gray-300 mx-1"></div>

            <div className="flex bg-gray-100 rounded-lg p-1 border shrink-0">
                <button 
                  onClick={() => setActiveTool('brush')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium ${activeTool === 'brush' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600'}`}
                  title="畫筆 (選取區域)"
                >畫筆</button>
                <button 
                  onClick={() => setActiveTool('rect')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium ${activeTool === 'rect' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600'}`}
                  title="矩形選取"
                >框選</button>
                <div className="w-px bg-gray-200 mx-1"></div>
                <button 
                  onClick={() => setActiveTool('eraser')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium ${activeTool === 'eraser' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600'}`}
                  title="橡皮擦 (移除選取)"
                >擦</button>
                 <button 
                  onClick={() => setActiveTool('eraser-rect')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium ${activeTool === 'eraser-rect' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600'}`}
                  title="矩形擦除"
                >框擦</button>
            </div>

            {(activeTool === 'brush' || activeTool === 'eraser') && (
              <input 
                type="range" min="5" max="100" value={brushSize} 
                onChange={(e) => setBrushSize(parseInt(e.target.value))}
                className="w-20 accent-blue-600"
              />
            )}
            
            <button onClick={handleUndo} className="p-2 text-gray-500 hover:bg-gray-100 rounded">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
            </button>
          </div>

          <div className="flex space-x-2 shrink-0">
             <button 
                onClick={handleLocalCancel} 
                className="px-3 py-2 text-gray-600 text-sm hover:text-red-600 transition-colors"
                title="清除畫布 / 取消修補"
             >
                取消
             </button>
             <button onClick={handleConfirm} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">開始處理</button>
          </div>
        </div>

        {/* Fill Mode Settings Bar */}
        <div className="bg-gray-50 px-4 py-2 flex items-center space-x-4 border-t text-sm">
           <span className="font-semibold text-gray-700">修補模式:</span>
           
           <label className="flex items-center space-x-2 cursor-pointer">
             <input 
               type="radio" 
               name="fillMode" 
               checked={fillMode === 'chart'} 
               onChange={() => setFillMode('chart')}
               className="text-blue-600 focus:ring-blue-500"
             />
             <span className={fillMode === 'chart' ? 'text-gray-900 font-medium' : 'text-gray-500'}>
               純色/圖表 (線條清晰)
             </span>
           </label>

           <label className="flex items-center space-x-2 cursor-pointer">
             <input 
               type="radio" 
               name="fillMode" 
               checked={fillMode === 'photo'} 
               onChange={() => setFillMode('photo')}
               className="text-blue-600 focus:ring-blue-500"
             />
             <span className={fillMode === 'photo' ? 'text-gray-900 font-medium' : 'text-gray-500'}>
               真實照片/天空 (Canva 魔法風格)
             </span>
           </label>
           
           <span className="text-xs text-green-600 ml-2">
             *更新：多層次融合技術，無條紋
           </span>
        </div>
      </div>

      <div 
        ref={containerRef} 
        className="flex-1 overflow-hidden flex items-center justify-center p-4 relative w-full h-full select-none"
      >
        <div 
            className="relative inline-block shadow-2xl border border-gray-200"
            onMouseEnter={() => setIsHoveringCanvas(true)}
            onMouseLeave={() => setIsHoveringCanvas(false)}
        >
          <img 
            ref={imageRef}
            src={imageSrc} 
            alt="Original" 
            onLoad={initCanvas}
            className="block max-w-full max-h-[calc(100vh-180px)] object-contain"
            style={{ pointerEvents: 'none' }} 
          />
          <canvas
            ref={canvasRef}
            className={`absolute top-0 left-0 w-full h-full touch-none ${
                (activeTool === 'brush' || activeTool === 'eraser') ? 'cursor-none' : 'cursor-crosshair'
            }`}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
        </div>
      </div>
    </div>
  );
};

export default StepMasking;
