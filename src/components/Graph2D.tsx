'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { getFunctionColor } from '@/lib/graphing/colors';

interface ExpressionWithIndex {
  expression: string;
  originalIndex: number;
}

interface InterestPoint {
  x: number;
  y: number;
  type: 'zero' | 'intersection' | 'maximum' | 'minimum';
  label: string;
  exprIndex: number;
}

interface Graph2DProps {
  expressions: ExpressionWithIndex[];
  xRange: [number, number];
  yRange: [number, number];
  onYRangeChange?: (yMin: number, yMax: number) => void;
  mini?: boolean; // Hide controls for embedded/mini mode
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

    // Handle implicit multiplication for constants e and pi
    // Use negative lookahead to avoid matching 'e' in 'exp'
    // e( -> e*( , pi( -> pi*( , ex -> e*x, pix -> pi*x, e3 -> e*3, 3e -> 3*e
    processed = processed.replace(/\be(?!xp)\(/g, 'e*(');
    processed = processed.replace(/\be(?!xp)x/gi, 'e*x');
    processed = processed.replace(/\be(?!xp)(\d)/gi, 'e*$1'); // e3 -> e*3
    processed = processed.replace(/(\d)(e)(?!xp)\b/gi, '$1*$2'); // 3e -> 3*e
    processed = processed.replace(/\bpi\(/gi, 'pi*(');
    processed = processed.replace(/\bpix/gi, 'pi*x');
    processed = processed.replace(/\bpi(\d)/gi, 'pi*$1'); // pi3 -> pi*3
    processed = processed.replace(/(\d)(pi)\b/gi, '$1*$2'); // 3pi -> 3*pi
    processed = processed.replace(/x(e)(?!xp)\b/gi, 'x*$1');
    processed = processed.replace(/x(pi)\b/gi, 'x*$1');

    // Handle power operator - convert ^ to **
    processed = processed.replace(/\^/g, '**');
    // Fix unary minus before exponentiation: JavaScript doesn't allow unary minus before **
    // -x**2 -> -(x**2)
    processed = processed.replace(/-([\w]+)\*\*(\d+|\w+)/g, '-($1**$2)');
    // -(x)**2 -> -((x)**2) - handle simple parenthesized bases (no nested parens)
    processed = processed.replace(/-(\([^()]+\))\*\*(\d+|\w+|\([^()]+\))/g, '-($1**$2)');

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

// Calculate grid steps - minor (finer) and major (coarser with labels)
function calculateGridSteps(range: number): { minorStep: number; majorStep: number } {
  const magnitude = Math.pow(10, Math.floor(Math.log10(range)));
  let minorStep: number;
  let majorStep: number;
  const normalized = range / magnitude;

  if (normalized <= 2) {
    minorStep = magnitude * 0.1;
    majorStep = magnitude * 0.5;
  } else if (normalized <= 5) {
    minorStep = magnitude * 0.2;
    majorStep = magnitude * 1;
  } else if (normalized <= 10) {
    minorStep = magnitude * 0.5;
    majorStep = magnitude * 2;
  } else if (normalized <= 20) {
    minorStep = magnitude * 1;
    majorStep = magnitude * 5;
  } else {
    minorStep = magnitude * 2;
    majorStep = magnitude * 10;
  }
  return { minorStep, majorStep };
}

// Format number for grid label display
function formatNumber(n: number): string {
  if (Math.abs(n) < 0.0001 && n !== 0) return n.toExponential(1);
  if (Math.abs(n) >= 10000) return n.toExponential(1);
  const str = n.toPrecision(4);
  return parseFloat(str).toString();
}

export default function Graph2D({
  expressions,
  xRange,
  yRange,
  onYRangeChange,
  mini = false,
}: Graph2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number; screenX: number; screenY: number; exprIndex: number; label?: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [localXRange, setLocalXRange] = useState<[number, number]>(xRange);
  const [localYRange, setLocalYRange] = useState<[number, number]>(yRange);
  // Debounced range for expensive calculations (interest points)
  const [debouncedXRange, setDebouncedXRange] = useState<[number, number]>(xRange);

  // Store initial ranges for reset (only set once on mount, never updated)
  const initialXRange = useRef<[number, number]>(xRange);
  const initialYRange = useRef<[number, number]>(yRange);
  const hasInitialized = useRef(false);

  // Only set initial ranges once on first mount
  useEffect(() => {
    if (!hasInitialized.current) {
      initialXRange.current = xRange;
      initialYRange.current = yRange;
      hasInitialized.current = true;
    }
  }, [xRange, yRange]);

  // Sync local state when parent props change (e.g., from range controls)
  useEffect(() => {
    setLocalXRange(xRange);
  }, [xRange]);

  useEffect(() => {
    setLocalYRange(yRange);
  }, [yRange]);

  // Debounce localXRange for expensive calculations
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedXRange(localXRange);
    }, 150);
    return () => clearTimeout(timer);
  }, [localXRange]);

  // Calculate interest points (zeros, intersections, extrema) - uses debounced range
  const interestPoints = useMemo(() => {
    const points: InterestPoint[] = [];
    const validExpressions = expressions.filter(e => e.expression.trim());

    validExpressions.forEach(({ expression, originalIndex }) => {
      const evaluator = createEvaluator(expression);

      // Find zeros (y = 0) and extrema using sampling
      const numSamples = 500;
      let prevY: number | null = null;
      let prevPrevY: number | null = null;
      const rangeWidth = debouncedXRange[1] - debouncedXRange[0];

      for (let i = 0; i <= numSamples; i++) {
        const x = debouncedXRange[0] + (i / numSamples) * rangeWidth;
        const y = evaluator(x);

        if (y !== null && prevY !== null) {
          // Check for zero crossing
          if ((prevY > 0 && y < 0) || (prevY < 0 && y > 0)) {
            // Binary search for exact zero
            let lo = x - rangeWidth / numSamples;
            let hi = x;
            for (let j = 0; j < 15; j++) {
              const mid = (lo + hi) / 2;
              const midY = evaluator(mid);
              if (midY === null) break;
              if ((prevY > 0 && midY > 0) || (prevY < 0 && midY < 0)) {
                lo = mid;
              } else {
                hi = mid;
              }
            }
            const zeroX = (lo + hi) / 2;
            points.push({ x: zeroX, y: 0, type: 'zero', label: `Zero: (${zeroX.toFixed(2)}, 0)`, exprIndex: originalIndex });
          }

          // Check for local extrema
          if (prevPrevY !== null) {
            if (prevY > prevPrevY && prevY > y) {
              // Local maximum
              const maxX = x - rangeWidth / numSamples;
              points.push({ x: maxX, y: prevY, type: 'maximum', label: `Max: (${maxX.toFixed(2)}, ${prevY.toFixed(2)})`, exprIndex: originalIndex });
            } else if (prevY < prevPrevY && prevY < y) {
              // Local minimum
              const minX = x - rangeWidth / numSamples;
              points.push({ x: minX, y: prevY, type: 'minimum', label: `Min: (${minX.toFixed(2)}, ${prevY.toFixed(2)})`, exprIndex: originalIndex });
            }
          }
        }

        prevPrevY = prevY;
        prevY = y;
      }
    });

    // Find intersections between pairs of functions
    const intRangeWidth = debouncedXRange[1] - debouncedXRange[0];
    for (let i = 0; i < validExpressions.length; i++) {
      for (let j = i + 1; j < validExpressions.length; j++) {
        const eval1 = createEvaluator(validExpressions[i].expression);
        const eval2 = createEvaluator(validExpressions[j].expression);

        const numSamples = 300;
        let prevDiff: number | null = null;

        for (let k = 0; k <= numSamples; k++) {
          const x = debouncedXRange[0] + (k / numSamples) * intRangeWidth;
          const y1 = eval1(x);
          const y2 = eval2(x);

          if (y1 !== null && y2 !== null) {
            const diff = y1 - y2;

            if (prevDiff !== null && ((prevDiff > 0 && diff < 0) || (prevDiff < 0 && diff > 0))) {
              // Binary search for intersection
              let lo = x - intRangeWidth / numSamples;
              let hi = x;
              for (let iter = 0; iter < 15; iter++) {
                const mid = (lo + hi) / 2;
                const midY1 = eval1(mid);
                const midY2 = eval2(mid);
                if (midY1 === null || midY2 === null) break;
                const midDiff = midY1 - midY2;
                if ((prevDiff > 0 && midDiff > 0) || (prevDiff < 0 && midDiff < 0)) {
                  lo = mid;
                } else {
                  hi = mid;
                }
              }
              const intX = (lo + hi) / 2;
              const intY = eval1(intX);
              if (intY !== null) {
                points.push({ x: intX, y: intY, type: 'intersection', label: `Intersection: (${intX.toFixed(2)}, ${intY.toFixed(2)})`, exprIndex: validExpressions[i].originalIndex });
              }
            }

            prevDiff = diff;
          }
        }
      }
    }

    return points;
  }, [expressions, debouncedXRange]);

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

  // Clip line segment to visible area and return clipped points
  const clipLine = useCallback((x1: number, y1: number, x2: number, y2: number): [number, number, number, number] | null => {
    const yMin = localYRange[0];
    const yMax = localYRange[1];

    // If both points are outside on same side, skip
    if ((y1 < yMin && y2 < yMin) || (y1 > yMax && y2 > yMax)) {
      return null;
    }

    let clippedX1 = x1, clippedY1 = y1, clippedX2 = x2, clippedY2 = y2;

    // Clip first point
    if (y1 < yMin) {
      clippedX1 = x1 + (x2 - x1) * (yMin - y1) / (y2 - y1);
      clippedY1 = yMin;
    } else if (y1 > yMax) {
      clippedX1 = x1 + (x2 - x1) * (yMax - y1) / (y2 - y1);
      clippedY1 = yMax;
    }

    // Clip second point
    if (y2 < yMin) {
      clippedX2 = x1 + (x2 - x1) * (yMin - y1) / (y2 - y1);
      clippedY2 = yMin;
    } else if (y2 > yMax) {
      clippedX2 = x1 + (x2 - x1) * (yMax - y1) / (y2 - y1);
      clippedY2 = yMax;
    }

    return [clippedX1, clippedY1, clippedX2, clippedY2];
  }, [localYRange]);

  // Draw the graph
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to container size with device pixel ratio
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

    // Calculate grid steps - minor (every integer) and major (every 5)
    const xRange = localXRange[1] - localXRange[0];
    const yRange = localYRange[1] - localYRange[0];

    // Calculate minor step (finer grid) and major step (coarser grid)
    const { minorStep: xMinorStep, majorStep: xMajorStep } = calculateGridSteps(xRange);
    const { minorStep: yMinorStep, majorStep: yMajorStep } = calculateGridSteps(yRange);

    // Draw minor grid lines first (lighter)
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.5;

    // Minor vertical grid lines
    const xMinorStart = Math.ceil(localXRange[0] / xMinorStep) * xMinorStep;
    for (let x = xMinorStart; x <= localXRange[1]; x += xMinorStep) {
      // Skip if this is a major line (will draw it thicker later)
      if (Math.abs(x % xMajorStep) < 0.0001 || Math.abs((x % xMajorStep) - xMajorStep) < 0.0001) continue;
      const { screenX } = mathToScreen(x, 0, width, height);
      if (screenX >= padding && screenX <= width - padding) {
        ctx.beginPath();
        ctx.moveTo(screenX, padding);
        ctx.lineTo(screenX, height - padding);
        ctx.stroke();
      }
    }

    // Minor horizontal grid lines
    const yMinorStart = Math.ceil(localYRange[0] / yMinorStep) * yMinorStep;
    for (let y = yMinorStart; y <= localYRange[1]; y += yMinorStep) {
      // Skip if this is a major line
      if (Math.abs(y % yMajorStep) < 0.0001 || Math.abs((y % yMajorStep) - yMajorStep) < 0.0001) continue;
      const { screenY } = mathToScreen(0, y, width, height);
      if (screenY >= padding && screenY <= height - padding) {
        ctx.beginPath();
        ctx.moveTo(padding, screenY);
        ctx.lineTo(width - padding, screenY);
        ctx.stroke();
      }
    }

    // Draw major grid lines (slightly more visible)
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;

    // Major vertical grid lines
    const xMajorStart = Math.ceil(localXRange[0] / xMajorStep) * xMajorStep;
    for (let x = xMajorStart; x <= localXRange[1]; x += xMajorStep) {
      const { screenX } = mathToScreen(x, 0, width, height);
      if (screenX >= padding && screenX <= width - padding) {
        ctx.beginPath();
        ctx.moveTo(screenX, padding);
        ctx.lineTo(screenX, height - padding);
        ctx.stroke();
      }
    }

    // Major horizontal grid lines
    const yMajorStart = Math.ceil(localYRange[0] / yMajorStep) * yMajorStep;
    for (let y = yMajorStart; y <= localYRange[1]; y += yMajorStep) {
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

    // X axis labels (at major grid lines)
    for (let x = xMajorStart; x <= localXRange[1]; x += xMajorStep) {
      const { screenX } = mathToScreen(x, 0, width, height);
      if (screenX >= padding && screenX <= width - padding) {
        ctx.fillText(formatNumber(x), screenX, height - padding + 15);
      }
    }

    // Y axis labels (at major grid lines)
    ctx.textAlign = 'right';
    for (let y = yMajorStart; y <= localYRange[1]; y += yMajorStep) {
      const { screenY } = mathToScreen(0, y, width, height);
      if (screenY >= padding && screenY <= height - padding) {
        ctx.fillText(formatNumber(y), padding - 8, screenY + 4);
      }
    }

    // Draw functions with proper clipping
    const validExpressions = expressions.filter(e => e.expression.trim());

    validExpressions.forEach(({ expression, originalIndex }) => {
      const evaluator = createEvaluator(expression);
      const color = getFunctionColor(originalIndex);

      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Use more points for smoother curves
      const numPoints = Math.max(plotWidth * 4, 2000);
      const points: { x: number; y: number | null }[] = [];

      for (let i = 0; i <= numPoints; i++) {
        const x = localXRange[0] + (i / numPoints) * (localXRange[1] - localXRange[0]);
        const y = evaluator(x);
        points.push({ x, y });
      }

      // Draw line segments with clipping
      ctx.beginPath();
      let isDrawing = false;
      let lastValidX: number | null = null;
      let lastValidY: number | null = null;

      for (let i = 0; i < points.length; i++) {
        const { x, y } = points[i];

        if (y === null) {
          // Discontinuity - end current path
          if (isDrawing) {
            ctx.stroke();
            ctx.beginPath();
            isDrawing = false;
          }
          lastValidX = null;
          lastValidY = null;
          continue;
        }

        // Check for large jumps (discontinuities like tan(x))
        if (lastValidY !== null && lastValidX !== null) {
          const dy = Math.abs(y - lastValidY);
          const yRange = localYRange[1] - localYRange[0];

          // If jump is more than half the visible range, treat as discontinuity
          if (dy > yRange * 0.5) {
            if (isDrawing) {
              ctx.stroke();
              ctx.beginPath();
              isDrawing = false;
            }
            lastValidX = x;
            lastValidY = y;
            continue;
          }
        }

        // Clip and draw
        if (lastValidX !== null && lastValidY !== null) {
          const clipped = clipLine(lastValidX, lastValidY, x, y);

          if (clipped) {
            const [cx1, cy1, cx2, cy2] = clipped;
            const screen1 = mathToScreen(cx1, cy1, width, height);
            const screen2 = mathToScreen(cx2, cy2, width, height);

            if (!isDrawing) {
              ctx.moveTo(screen1.screenX, screen1.screenY);
              isDrawing = true;
            }
            ctx.lineTo(screen2.screenX, screen2.screenY);
          } else {
            // Both points outside visible area
            if (isDrawing) {
              ctx.stroke();
              ctx.beginPath();
              isDrawing = false;
            }
          }
        } else {
          // First point or after discontinuity
          if (y >= localYRange[0] && y <= localYRange[1]) {
            const { screenX, screenY } = mathToScreen(x, y, width, height);
            ctx.moveTo(screenX, screenY);
            isDrawing = true;
          }
        }

        lastValidX = x;
        lastValidY = y;
      }

      if (isDrawing) {
        ctx.stroke();
      }
    });

    // Draw interest points (zeros, intersections, extrema)
    interestPoints.forEach(point => {
      if (point.y < localYRange[0] || point.y > localYRange[1]) return;

      const { screenX, screenY } = mathToScreen(point.x, point.y, width, height);

      // Draw small marker
      ctx.fillStyle = point.type === 'zero' ? '#22c55e' :
                      point.type === 'intersection' ? '#f59e0b' :
                      point.type === 'maximum' ? '#ef4444' : '#3b82f6';
      ctx.beginPath();
      ctx.arc(screenX, screenY, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw hover point
    if (hoverPoint) {
      const { screenX, screenY } = mathToScreen(hoverPoint.x, hoverPoint.y, width, height);
      const color = getFunctionColor(hoverPoint.exprIndex);

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(screenX, screenY, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw border
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.strokeRect(padding, padding, plotWidth, plotHeight);

  }, [expressions, localXRange, localYRange, mathToScreen, clipLine, hoverPoint, interestPoints]);

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

    const { x: mouseX, y: mouseY } = screenToMath(screenX, screenY, rect.width, rect.height);

    // First check if we're near any interest point
    let closestInterest: InterestPoint | null = null;
    let closestInterestDist = Infinity;
    const snapRadius = 30; // pixels

    interestPoints.forEach(point => {
      if (point.y < localYRange[0] || point.y > localYRange[1]) return;

      const { screenX: pointScreenX, screenY: pointScreenY } = mathToScreen(point.x, point.y, rect.width, rect.height);
      const dist = Math.sqrt((screenX - pointScreenX) ** 2 + (screenY - pointScreenY) ** 2);

      if (dist < snapRadius && dist < closestInterestDist) {
        closestInterestDist = dist;
        closestInterest = point;
      }
    });

    if (closestInterest !== null) {
      const interest = closestInterest as InterestPoint;
      setHoverPoint({
        x: interest.x,
        y: interest.y,
        screenX,
        screenY,
        exprIndex: interest.exprIndex,
        label: interest.label,
      });
      return;
    }

    // Check for axis snapping (y-intercept at x=0, x-intercept at y=0)
    const axisSnapRadius = 40; // pixels
    const { screenX: yAxisScreenX } = mathToScreen(0, 0, rect.width, rect.height);
    const { screenY: xAxisScreenY } = mathToScreen(0, 0, rect.width, rect.height);

    // Check if near y-axis (x=0) for y-intercept snapping
    if (Math.abs(screenX - yAxisScreenX) < axisSnapRadius && localXRange[0] <= 0 && localXRange[1] >= 0) {
      let closestYIntercept: typeof hoverPoint = null;
      let closestYInterceptDist = Infinity;

      expressions.filter(e => e.expression.trim()).forEach(({ expression, originalIndex }) => {
        const evaluator = createEvaluator(expression);
        const yIntercept = evaluator(0);

        if (yIntercept !== null && yIntercept >= localYRange[0] && yIntercept <= localYRange[1]) {
          const { screenY: interceptScreenY } = mathToScreen(0, yIntercept, rect.width, rect.height);
          const dist = Math.abs(interceptScreenY - screenY);

          if (dist < axisSnapRadius && dist < closestYInterceptDist) {
            closestYInterceptDist = dist;
            closestYIntercept = {
              x: 0,
              y: yIntercept,
              screenX,
              screenY,
              exprIndex: originalIndex,
              label: `Y-intercept: (0, ${yIntercept.toFixed(2)})`,
            };
          }
        }
      });

      if (closestYIntercept) {
        setHoverPoint(closestYIntercept);
        return;
      }
    }

    // Check if near x-axis (y=0) for x-intercept snapping (supplements zero detection)
    if (Math.abs(screenY - xAxisScreenY) < axisSnapRadius && localYRange[0] <= 0 && localYRange[1] >= 0) {
      let closestXIntercept: typeof hoverPoint = null;
      let closestXInterceptDist = Infinity;

      expressions.filter(e => e.expression.trim()).forEach(({ expression, originalIndex }) => {
        const evaluator = createEvaluator(expression);
        // Binary search for zero near mouseX
        const searchRange = (localXRange[1] - localXRange[0]) * 0.1; // 10% of visible range
        const y1 = evaluator(mouseX - searchRange / 2);
        const y2 = evaluator(mouseX + searchRange / 2);

        if (y1 !== null && y2 !== null && y1 * y2 < 0) {
          // Zero crossing exists - binary search
          let lo = mouseX - searchRange / 2;
          let hi = mouseX + searchRange / 2;
          for (let i = 0; i < 20; i++) {
            const mid = (lo + hi) / 2;
            const midY = evaluator(mid);
            if (midY === null) break;
            if ((y1 > 0 && midY > 0) || (y1 < 0 && midY < 0)) {
              lo = mid;
            } else {
              hi = mid;
            }
          }
          const zeroX = (lo + hi) / 2;
          const { screenX: zeroScreenX } = mathToScreen(zeroX, 0, rect.width, rect.height);
          const dist = Math.abs(zeroScreenX - screenX);

          if (dist < axisSnapRadius && dist < closestXInterceptDist) {
            closestXInterceptDist = dist;
            closestXIntercept = {
              x: zeroX,
              y: 0,
              screenX,
              screenY,
              exprIndex: originalIndex,
              label: `X-intercept: (${zeroX.toFixed(2)}, 0)`,
            };
          }
        }
      });

      if (closestXIntercept) {
        setHoverPoint(closestXIntercept);
        return;
      }
    }

    // Find closest point on any function
    let closestPoint: typeof hoverPoint = null;
    let closestDist = Infinity;

    expressions.filter(e => e.expression.trim()).forEach(({ expression, originalIndex }) => {
      const evaluator = createEvaluator(expression);
      const y = evaluator(mouseX);

      if (y !== null && y >= localYRange[0] && y <= localYRange[1]) {
        const { screenY: pointScreenY } = mathToScreen(mouseX, y, rect.width, rect.height);
        const dist = Math.abs(pointScreenY - screenY);

        if (dist < 30 && dist < closestDist) {
          closestDist = dist;
          closestPoint = {
            x: mouseX,
            y,
            screenX,
            screenY,
            exprIndex: originalIndex,
          };
        }
      }
    });

    setHoverPoint(closestPoint);
  }, [expressions, localXRange, localYRange, screenToMath, mathToScreen, isDragging, dragStart, interestPoints]);

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

  // Touch state for pinch-to-zoom
  const lastTouchDistance = useRef<number | null>(null);
  const lastTouchCenter = useRef<{ x: number; y: number } | null>(null);

  // Touch start handler
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();

    if (e.touches.length === 1) {
      // Single touch - start panning
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      });
    } else if (e.touches.length === 2) {
      // Two touches - prepare for pinch zoom
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.sqrt(
        (touch2.clientX - touch1.clientX) ** 2 +
        (touch2.clientY - touch1.clientY) ** 2
      );
      lastTouchDistance.current = distance;
      lastTouchCenter.current = {
        x: (touch1.clientX + touch2.clientX) / 2 - rect.left,
        y: (touch1.clientY + touch2.clientY) / 2 - rect.top
      };
      setIsDragging(false);
    }
  }, []);

  // Touch move handler
  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();

    if (e.touches.length === 1 && isDragging && dragStart) {
      // Single touch - pan
      const touch = e.touches[0];
      const screenX = touch.clientX - rect.left;
      const screenY = touch.clientY - rect.top;

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
    } else if (e.touches.length === 2 && lastTouchDistance.current && lastTouchCenter.current) {
      // Two touches - pinch zoom
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const newDistance = Math.sqrt(
        (touch2.clientX - touch1.clientX) ** 2 +
        (touch2.clientY - touch1.clientY) ** 2
      );

      const scale = lastTouchDistance.current / newDistance;
      const centerX = (touch1.clientX + touch2.clientX) / 2 - rect.left;
      const centerY = (touch1.clientY + touch2.clientY) / 2 - rect.top;

      const { x: mathCenterX, y: mathCenterY } = screenToMath(centerX, centerY, rect.width, rect.height);

      const newXRange: [number, number] = [
        mathCenterX - (mathCenterX - localXRange[0]) * scale,
        mathCenterX + (localXRange[1] - mathCenterX) * scale,
      ];

      const newYRange: [number, number] = [
        mathCenterY - (mathCenterY - localYRange[0]) * scale,
        mathCenterY + (localYRange[1] - mathCenterY) * scale,
      ];

      setLocalXRange(newXRange);
      setLocalYRange(newYRange);
      onYRangeChange?.(newYRange[0], newYRange[1]);

      lastTouchDistance.current = newDistance;
      lastTouchCenter.current = { x: centerX, y: centerY };
    }
  }, [isDragging, dragStart, localXRange, localYRange, screenToMath, onYRangeChange]);

  // Touch end handler
  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    setDragStart(null);
    lastTouchDistance.current = null;
    lastTouchCenter.current = null;
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

  // Reset view - use stored initial values
  const resetView = useCallback(() => {
    setLocalXRange(initialXRange.current);
    setLocalYRange(initialYRange.current);
  }, []);

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
        className={`w-full h-full ${mini ? 'cursor-default' : 'cursor-crosshair'} touch-none`}
        onMouseMove={mini ? undefined : handleMouseMove}
        onMouseDown={mini ? undefined : handleMouseDown}
        onMouseUp={mini ? undefined : handleMouseUp}
        onMouseLeave={mini ? undefined : handleMouseLeave}
        onWheel={mini ? undefined : handleWheel}
        onTouchStart={mini ? undefined : handleTouchStart}
        onTouchMove={mini ? undefined : handleTouchMove}
        onTouchEnd={mini ? undefined : handleTouchEnd}
        onTouchCancel={mini ? undefined : handleTouchEnd}
      />
      {!mini && hoverPoint && (
        <div
          className="absolute pointer-events-none bg-black/80 text-white px-3 py-2 rounded-lg text-xs font-mono backdrop-blur-sm border border-white/20"
          style={{
            left: `min(${hoverPoint.screenX + 15}px, calc(100% - 180px))`,
            top: hoverPoint.screenY - 10,
          }}
        >
          {hoverPoint.label ? (
            <div className="text-yellow-400 text-[10px] mb-1">{hoverPoint.label}</div>
          ) : (
            <div className="text-gray-400 text-[10px] mb-1">Coordinates</div>
          )}
          <div><span className="text-red-400">x:</span> {hoverPoint.x.toFixed(4)}</div>
          <div><span className="text-green-400">y:</span> {hoverPoint.y.toFixed(4)}</div>
        </div>
      )}
      {!mini && (
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
      )}
    </div>
  );
}
