'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getFunctionColor } from '@/lib/graphing/colors';

interface ExpressionWithIndex {
  expression: string;
  originalIndex: number;
}

interface Graph2DProps {
  expressions: ExpressionWithIndex[];
  xRange: [number, number];
  yRange: [number, number];
  onYRangeChange?: (yMin: number, yMax: number) => void;
}

// Create evaluator for y = f(x)
function createEvaluator(expression: string): ((x: number) => number | null) {
  try {
    // Handle implicit multiplication and common patterns
    let processed = expression
      .replace(/(\d)([x])/gi, '$1*$2')
      .replace(/([x])(\d)/gi, '$1*$2')
      .replace(/(\d)\(/g, '$1*(')
      .replace(/\)\(/g, ')*(')
      .replace(/\)(\d)/g, ')*$1')
      .replace(/\)([x])/gi, ')*$1')
      .replace(/([x])\(/gi, '$1*(');

    // Handle trig functions without parentheses: sinx -> sin(x)
    const funcs = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'sqrt', 'exp', 'log', 'log10', 'log2', 'abs'];
    funcs.forEach(fn => {
      processed = processed.replace(new RegExp(`(${fn})x(?![a-z0-9(])`, 'gi'), '$1(x)');
      processed = processed.replace(new RegExp(`(${fn})x([+\\-*/^])`, 'gi'), '$1(x)$2');
      processed = processed.replace(new RegExp(`(${fn})x$`, 'gi'), '$1(x)');
    });

    // Add multiplication before functions
    funcs.forEach(fn => {
      processed = processed.replace(new RegExp(`(\\d)(${fn})\\(`, 'gi'), '$1*$2(');
      processed = processed.replace(new RegExp(`(x)(${fn})\\(`, 'gi'), '$1*$2(');
      processed = processed.replace(new RegExp(`\\)(${fn})\\(`, 'gi'), ')*$1(');
    });

    // Create function using Function constructor
    const fn = new Function('x', `
      const sin = Math.sin, cos = Math.cos, tan = Math.tan;
      const asin = Math.asin, acos = Math.acos, atan = Math.atan;
      const sinh = Math.sinh, cosh = Math.cosh, tanh = Math.tanh;
      const sqrt = Math.sqrt, exp = Math.exp, log = Math.log, ln = Math.log;
      const log10 = Math.log10, log2 = Math.log2;
      const abs = Math.abs, ceil = Math.ceil, floor = Math.floor, round = Math.round;
      const PI = Math.PI, E = Math.E, pi = Math.PI, e = Math.E;
      const pow = Math.pow;
      try {
        const result = ${processed};
        return (typeof result === 'number' && isFinite(result)) ? result : null;
      } catch { return null; }
    `);
    return fn as (x: number) => number | null;
  } catch {
    return () => null;
  }
}

export default function Graph2D({
  expressions,
  xRange,
  yRange,
  onYRangeChange,
}: Graph2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number; screenX: number; screenY: number; exprIndex: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [localXRange, setLocalXRange] = useState<[number, number]>(xRange);
  const [localYRange, setLocalYRange] = useState<[number, number]>(yRange);

  // Sync with props
  useEffect(() => {
    setLocalXRange(xRange);
  }, [xRange]);

  useEffect(() => {
    setLocalYRange(yRange);
  }, [yRange]);

  // Convert screen coords to math coords
  const screenToMath = useCallback((screenX: number, screenY: number, width: number, height: number) => {
    const padding = 50;
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2;

    const x = localXRange[0] + ((screenX - padding) / plotWidth) * (localXRange[1] - localXRange[0]);
    const y = localYRange[1] - ((screenY - padding) / plotHeight) * (localYRange[1] - localYRange[0]);

    return { x, y };
  }, [localXRange, localYRange]);

  // Convert math coords to screen coords
  const mathToScreen = useCallback((mathX: number, mathY: number, width: number, height: number) => {
    const padding = 50;
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2;

    const screenX = padding + ((mathX - localXRange[0]) / (localXRange[1] - localXRange[0])) * plotWidth;
    const screenY = padding + ((localYRange[1] - mathY) / (localYRange[1] - localYRange[0])) * plotHeight;

    return { screenX, screenY };
  }, [localXRange, localYRange]);

  // Draw the graph
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to container size
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = 50;
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2;

    // Clear background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;

    // Vertical grid lines
    const xStep = calculateGridStep(localXRange[1] - localXRange[0]);
    const xStart = Math.ceil(localXRange[0] / xStep) * xStep;
    for (let x = xStart; x <= localXRange[1]; x += xStep) {
      const { screenX } = mathToScreen(x, 0, width, height);
      if (screenX >= padding && screenX <= width - padding) {
        ctx.beginPath();
        ctx.moveTo(screenX, padding);
        ctx.lineTo(screenX, height - padding);
        ctx.stroke();
      }
    }

    // Horizontal grid lines
    const yStep = calculateGridStep(localYRange[1] - localYRange[0]);
    const yStart = Math.ceil(localYRange[0] / yStep) * yStep;
    for (let y = yStart; y <= localYRange[1]; y += yStep) {
      const { screenY } = mathToScreen(0, y, width, height);
      if (screenY >= padding && screenY <= height - padding) {
        ctx.beginPath();
        ctx.moveTo(padding, screenY);
        ctx.lineTo(width - padding, screenY);
        ctx.stroke();
      }
    }

    // Draw axes if in view
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;

    // X axis (y = 0)
    if (localYRange[0] <= 0 && localYRange[1] >= 0) {
      const { screenY } = mathToScreen(0, 0, width, height);
      ctx.beginPath();
      ctx.moveTo(padding, screenY);
      ctx.lineTo(width - padding, screenY);
      ctx.stroke();
    }

    // Y axis (x = 0)
    if (localXRange[0] <= 0 && localXRange[1] >= 0) {
      const { screenX } = mathToScreen(0, 0, width, height);
      ctx.beginPath();
      ctx.moveTo(screenX, padding);
      ctx.lineTo(screenX, height - padding);
      ctx.stroke();
    }

    // Draw axis labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';

    // X axis labels
    for (let x = xStart; x <= localXRange[1]; x += xStep) {
      const { screenX } = mathToScreen(x, 0, width, height);
      if (screenX >= padding && screenX <= width - padding) {
        ctx.fillText(formatNumber(x), screenX, height - padding + 15);
      }
    }

    // Y axis labels
    ctx.textAlign = 'right';
    for (let y = yStart; y <= localYRange[1]; y += yStep) {
      const { screenY } = mathToScreen(0, y, width, height);
      if (screenY >= padding && screenY <= height - padding) {
        ctx.fillText(formatNumber(y), padding - 8, screenY + 4);
      }
    }

    // Draw functions
    const validExpressions = expressions.filter(e => e.expression.trim());

    validExpressions.forEach(({ expression, originalIndex }) => {
      const evaluator = createEvaluator(expression);
      const color = getFunctionColor(originalIndex);

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      let isDrawing = false;
      const numPoints = plotWidth * 2; // 2 points per pixel for smoothness

      for (let i = 0; i <= numPoints; i++) {
        const x = localXRange[0] + (i / numPoints) * (localXRange[1] - localXRange[0]);
        const y = evaluator(x);

        if (y !== null && y >= localYRange[0] && y <= localYRange[1]) {
          const { screenX, screenY } = mathToScreen(x, y, width, height);

          if (!isDrawing) {
            ctx.moveTo(screenX, screenY);
            isDrawing = true;
          } else {
            ctx.lineTo(screenX, screenY);
          }
        } else {
          if (isDrawing) {
            ctx.stroke();
            ctx.beginPath();
            isDrawing = false;
          }
        }
      }

      if (isDrawing) {
        ctx.stroke();
      }
    });

    // Draw hover point
    if (hoverPoint) {
      const { screenX, screenY } = mathToScreen(hoverPoint.x, hoverPoint.y, width, height);
      const color = getFunctionColor(hoverPoint.exprIndex);

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(screenX, screenY, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw border
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.strokeRect(padding, padding, plotWidth, plotHeight);

  }, [expressions, localXRange, localYRange, mathToScreen, hoverPoint]);

  // Calculate nice grid step
  function calculateGridStep(range: number): number {
    const targetSteps = 8;
    const rawStep = range / targetSteps;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const normalized = rawStep / magnitude;

    let step;
    if (normalized <= 1) step = 1;
    else if (normalized <= 2) step = 2;
    else if (normalized <= 5) step = 5;
    else step = 10;

    return step * magnitude;
  }

  // Format number for display
  function formatNumber(n: number): string {
    if (Math.abs(n) < 0.0001 && n !== 0) return n.toExponential(1);
    if (Math.abs(n) >= 10000) return n.toExponential(1);
    if (Number.isInteger(n)) return n.toString();
    return n.toFixed(2);
  }

  // Handle mouse move for hover
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    if (isDragging && dragStart) {
      const dx = screenX - dragStart.x;
      const dy = screenY - dragStart.y;

      const padding = 50;
      const plotWidth = rect.width - padding * 2;
      const plotHeight = rect.height - padding * 2;

      const xDelta = -dx / plotWidth * (localXRange[1] - localXRange[0]);
      const yDelta = dy / plotHeight * (localYRange[1] - localYRange[0]);

      setLocalXRange([localXRange[0] + xDelta, localXRange[1] + xDelta]);
      setLocalYRange([localYRange[0] + yDelta, localYRange[1] + yDelta]);
      setDragStart({ x: screenX, y: screenY });
      return;
    }

    const { x } = screenToMath(screenX, screenY, rect.width, rect.height);

    // Find closest point on any function
    let closestPoint: typeof hoverPoint = null;
    let closestDist = Infinity;

    expressions.filter(e => e.expression.trim()).forEach(({ expression, originalIndex }) => {
      const evaluator = createEvaluator(expression);
      const y = evaluator(x);

      if (y !== null && y >= localYRange[0] && y <= localYRange[1]) {
        const { screenY: pointScreenY } = mathToScreen(x, y, rect.width, rect.height);
        const dist = Math.abs(pointScreenY - screenY);

        if (dist < 20 && dist < closestDist) {
          closestDist = dist;
          closestPoint = {
            x,
            y,
            screenX: e.clientX - rect.left,
            screenY: e.clientY - rect.top,
            exprIndex: originalIndex,
          };
        }
      }
    });

    setHoverPoint(closestPoint);
  }, [expressions, localXRange, localYRange, screenToMath, mathToScreen, isDragging, dragStart]);

  // Handle zoom with scroll
  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const { x: centerX, y: centerY } = screenToMath(mouseX, mouseY, rect.width, rect.height);

    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;

    const newXRange: [number, number] = [
      centerX - (centerX - localXRange[0]) * zoomFactor,
      centerX + (localXRange[1] - centerX) * zoomFactor,
    ];

    const newYRange: [number, number] = [
      centerY - (centerY - localYRange[0]) * zoomFactor,
      centerY + (localYRange[1] - centerY) * zoomFactor,
    ];

    setLocalXRange(newXRange);
    setLocalYRange(newYRange);
    onYRangeChange?.(newYRange[0], newYRange[1]);
  }, [localXRange, localYRange, screenToMath, onYRangeChange]);

  // Mouse down/up for panning
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    setIsDragging(true);
    setDragStart({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragStart(null);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoverPoint(null);
    setIsDragging(false);
    setDragStart(null);
  }, []);

  // Download as PNG
  const downloadPNG = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = 'mathgraph-2d.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, []);

  // Reset view
  const resetView = useCallback(() => {
    setLocalXRange(xRange);
    setLocalYRange(yRange);
  }, [xRange, yRange]);

  // Draw on changes
  useEffect(() => {
    draw();
  }, [draw]);

  // Redraw on resize
  useEffect(() => {
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
      />
      {hoverPoint && (
        <div
          className="absolute pointer-events-none bg-black/80 text-white px-3 py-2 rounded-lg text-xs font-mono backdrop-blur-sm border border-white/20"
          style={{
            left: hoverPoint.screenX + 15,
            top: hoverPoint.screenY - 10,
          }}
        >
          <div className="text-gray-400 text-[10px] mb-1">Coordinates</div>
          <div><span className="text-red-400">x:</span> {hoverPoint.x.toFixed(4)}</div>
          <div><span className="text-green-400">y:</span> {hoverPoint.y.toFixed(4)}</div>
        </div>
      )}
      <div className="absolute bottom-4 left-4 flex items-center gap-2">
        <button
          onClick={resetView}
          className="text-xs text-gray-300 bg-black/50 hover:bg-black/70 px-3 py-1.5 rounded backdrop-blur-sm transition-colors flex items-center gap-1"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Reset View
        </button>
        <button
          onClick={downloadPNG}
          className="text-xs text-gray-300 bg-black/50 hover:bg-black/70 px-3 py-1.5 rounded backdrop-blur-sm transition-colors flex items-center gap-1"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download PNG
        </button>
        <span className="text-xs text-gray-400 bg-black/30 px-2 py-1 rounded backdrop-blur-sm">
          Drag to pan &bull; Scroll to zoom
        </span>
      </div>
    </div>
  );
}
