'use client';

import { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import RangeControls from '@/components/RangeControls';
import { getFunctionColor } from '@/lib/graphing/colors';
import { validateExpression, generateIntersectionEquation, createEvaluator, getPartialDerivatives } from '@/lib/mathParser';
import 'katex/dist/katex.min.css';
import { InlineMath } from 'react-katex';

// Dynamically import Graph3D to avoid SSR issues with Three.js
const Graph3D = dynamic(() => import('@/components/Graph3D'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-900 rounded-xl">
      <div className="text-slate-400">Loading 3D renderer...</div>
    </div>
  ),
});

// Dynamically import Graph2D for mini intersection preview
const Graph2D = dynamic(() => import('@/components/Graph2D'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-800 rounded">
      <div className="text-slate-500 text-xs">Loading...</div>
    </div>
  ),
});

// Collapsible section component
function CollapsibleSection({
  title,
  icon,
  children,
  defaultOpen = false,
  badge
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-slate-700/50 last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm text-slate-300">{title}</span>
          {badge}
        </div>
        <svg
          className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="px-3 pb-3">
          {children}
        </div>
      )}
    </div>
  );
}

const MAX_FUNCTIONS = 6;
const DEBOUNCE_MS = 300; // Update graph 300ms after typing stops
const MAX_HISTORY = 10;
const HISTORY_KEY = 'mathgraph-recent-equations';

interface HistoryEntry {
  expressions: string[];
  timestamp: number;
}

function Graph3DPage() {
  const searchParams = useSearchParams();

  // Parse URL params - supports multiple expressions separated by |
  const urlExpressions = searchParams.get('eq')?.split('|') || [];
  const urlXRange = searchParams.get('xr')?.split(',').map(Number) as [number, number] | undefined;
  const urlYRange = searchParams.get('yr')?.split(',').map(Number) as [number, number] | undefined;

  const [expressions, setExpressions] = useState<string[]>(
    urlExpressions.length > 0 ? urlExpressions : ['x^2 + y^2']
  );
  const [activeExpressions, setActiveExpressions] = useState<{ expression: string; originalIndex: number }[]>(
    urlExpressions.length > 0
      ? urlExpressions.map((e, i) => ({ expression: e, originalIndex: i }))
      : [{ expression: 'x^2 + y^2', originalIndex: 0 }]
  );
  const [xRange, setXRange] = useState<[number, number]>(urlXRange || [-5, 5]);
  const [yRange, setYRange] = useState<[number, number]>(urlYRange || [-5, 5]);
  const [zRange, setZRange] = useState<[number, number]>([-10, 10]);
  const [stats, setStats] = useState<{
    surfaceAreas: { expression: string; originalIndex: number; surfaceArea: number }[];
    volume: number;
    globalMin: { x: number; y: number; z: number } | null;
    globalMax: { x: number; y: number; z: number } | null;
  }>({ surfaceAreas: [], volume: 0, globalMin: null, globalMax: null });
  const [showIntersectionWorking, setShowIntersectionWorking] = useState(false);
  const [showSurfaceAreaWorking, setShowSurfaceAreaWorking] = useState(false);
  const [showVolumeWorking, setShowVolumeWorking] = useState(false);
  const [volumeMode, setVolumeMode] = useState(false);
  const [volumeBetweenSurfaces, setVolumeBetweenSurfaces] = useState<number | null>(null);
  const [recentEquations, setRecentEquations] = useState<HistoryEntry[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [showHistory, setShowHistory] = useState(false);
  const [showSurfaceGrid, setShowSurfaceGrid] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      if (e.key === 'Escape') {
        if (isFullscreen) {
          // Exit fullscreen first
          setIsFullscreen(false);
        } else {
          // Clear all expressions
          setExpressions(['']);
          setActiveExpressions([]);
          // Blur any focused input
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
        }
      } else if (e.key === 'f' && !isInput) {
        // Toggle fullscreen
        setIsFullscreen(prev => !prev);
      } else if (e.key === 'Enter' && isInput) {
        // Force immediate graph update (skip debounce)
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }
        const validExpressions: { expression: string; originalIndex: number }[] = [];
        expressions.forEach((expr, index) => {
          if (expr.trim()) {
            const validation = validateExpression(expr);
            if (validation.valid) {
              validExpressions.push({ expression: expr, originalIndex: index });
            }
          }
        });
        if (validExpressions.length > 0) {
          setActiveExpressions(validExpressions);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expressions, isFullscreen]);

  // Save to history when expressions change (debounced)
  const saveToHistory = useCallback((exprs: string[]) => {
    const validExprs = exprs.filter(e => e.trim() && validateExpression(e).valid);
    if (validExprs.length === 0) return;

    setRecentEquations(prev => {
      // Don't add if it's the same as the most recent
      const exprKey = validExprs.join('|');
      if (prev.length > 0 && prev[0].expressions.join('|') === exprKey) {
        return prev;
      }

      const newEntry: HistoryEntry = {
        expressions: validExprs,
        timestamp: Date.now(),
      };

      // Remove duplicates and limit to MAX_HISTORY
      const filtered = prev.filter(h => h.expressions.join('|') !== exprKey);
      const newHistory = [newEntry, ...filtered].slice(0, MAX_HISTORY);

      // Save to localStorage
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
      } catch {
        // Ignore localStorage errors
      }

      return newHistory;
    });
  }, []);

  // Save to history when active expressions change
  useEffect(() => {
    if (activeExpressions.length > 0) {
      const timer = setTimeout(() => {
        saveToHistory(activeExpressions.map(e => e.expression));
      }, 1000); // Wait 1 second after changes stabilize
      return () => clearTimeout(timer);
    }
  }, [activeExpressions, saveToHistory]);

  // Load expressions from history
  const loadFromHistory = (entry: HistoryEntry) => {
    setExpressions(entry.expressions);
    setShowHistory(false);
  };

  // Helper to get just the expression strings from activeExpressions
  const activeExpressionStrings = activeExpressions.map(e => e.expression);

  // Calculate volume between two surfaces
  const calculateVolumeBetween = useCallback((expr1: string, expr2: string) => {
    try {
      const eval1 = createEvaluator(expr1);
      const eval2 = createEvaluator(expr2);

      const resolution = 60;
      const [xMin, xMax] = xRange;
      const [yMin, yMax] = yRange;
      const xStep = (xMax - xMin) / resolution;
      const yStep = (yMax - yMin) / resolution;
      const cellArea = xStep * yStep;

      let volume = 0;
      // Use midpoint rule for better accuracy: sample at center of each cell
      for (let i = 0; i < resolution; i++) {
        for (let j = 0; j < resolution; j++) {
          // Sample at midpoint of cell for better integration accuracy
          const x = xMin + (i + 0.5) * xStep;
          const y = yMin + (j + 0.5) * yStep;
          const z1 = eval1(x, y);
          const z2 = eval2(x, y);
          if (z1 !== null && z2 !== null) {
            volume += Math.abs(z1 - z2) * cellArea;
          }
        }
      }
      return volume;
    } catch {
      return null;
    }
  }, [xRange, yRange]);

  // Update volume when in volume mode and expressions change
  useEffect(() => {
    if (volumeMode && activeExpressionStrings.length >= 2) {
      const vol = calculateVolumeBetween(activeExpressionStrings[0], activeExpressionStrings[1]);
      setVolumeBetweenSurfaces(vol);
    } else {
      setVolumeBetweenSurfaces(null);
      // Reset volume mode if we don't have 2 expressions anymore
      if (volumeMode && activeExpressionStrings.length < 2) {
        setVolumeMode(false);
      }
    }
  }, [volumeMode, activeExpressionStrings, calculateVolumeBetween]);

  // Auto-update graph when expressions change (debounced)
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      // Only update with valid expressions, preserving original indices
      const validExpressions: { expression: string; originalIndex: number }[] = [];
      expressions.forEach((expr, index) => {
        if (expr.trim()) {
          const validation = validateExpression(expr);
          if (validation.valid) {
            validExpressions.push({ expression: expr, originalIndex: index });
          }
        }
      });

      if (validExpressions.length > 0 || expressions.every(e => !e.trim())) {
        setActiveExpressions(validExpressions);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [expressions]);

  const handleExpressionChange = (index: number, value: string) => {
    // Replace 'pi' with π symbol for display
    const displayValue = value.replace(/\bpi\b/gi, 'π');
    const newExpressions = [...expressions];
    newExpressions[index] = displayValue;
    setExpressions(newExpressions);
  };

  const addExpression = () => {
    if (expressions.length < MAX_FUNCTIONS) {
      setExpressions([...expressions, '']);
    }
  };

  const removeExpression = (index: number) => {
    if (expressions.length > 1) {
      const newExpressions = expressions.filter((_, i) => i !== index);
      setExpressions(newExpressions);
    }
  };

  const handleZRangeChange = useCallback((zMin: number, zMax: number) => {
    setZRange([zMin, zMax]);
  }, []);

  const handleStatsChange = useCallback((newStats: typeof stats) => {
    setStats(newStats);
  }, []);

  // Generate share URL
  const getShareUrl = () => {
    const validExpressions = activeExpressionStrings.filter(e => e.trim());
    if (validExpressions.length === 0) return '';

    const params = new URLSearchParams({
      eq: validExpressions.join('|'),
      xr: `${xRange[0]},${xRange[1]}`,
      yr: `${yRange[0]},${yRange[1]}`,
    });

    return `${window.location.origin}/3d-grapher?${params.toString()}`;
  };

  const handleShare = async () => {
    const url = getShareUrl();
    if (url) {
      await navigator.clipboard.writeText(url);
    }
  };

  // Auto-graph on initial load if URL has expressions
  useEffect(() => {
    if (urlExpressions.length > 0) {
      setActiveExpressions(urlExpressions.map((e, i) => ({ expression: e, originalIndex: i })));
    }
  }, []);

  return (
    <div className="h-screen flex flex-col bg-slate-950 overflow-hidden">
      {/* Compact Header */}
      <header className="flex-shrink-0 bg-slate-900 border-b border-slate-800">
        <div className="px-4 py-2 flex items-center justify-between">
          <Link href="/" className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Home
          </Link>
          <h1 className="text-lg font-semibold text-white">3D Grapher</h1>
          <div className="w-16" />
        </div>
      </header>

      {/* Main content - fixed height, no scroll */}
      <div className="flex-1 flex min-h-0">
        {/* Left Panel - Controls */}
        <div className={`${isFullscreen ? 'hidden' : 'w-80'} flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col overflow-y-auto transition-all`}>
          {/* Multi-Equation Input */}
          <div className="p-4 border-b border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                Functions ({expressions.length}/{MAX_FUNCTIONS})
              </h3>
              {expressions.length < MAX_FUNCTIONS && (
                <button
                  onClick={addExpression}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add
                </button>
              )}
            </div>

            <div className="space-y-2">
              {expressions.map((expr, index) => {
                const validation = expr.trim() ? validateExpression(expr) : { valid: true };
                const color = getFunctionColor(index);

                return (
                  <div key={index} className="flex items-center gap-2">
                    {/* Color indicator */}
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    {/* Input */}
                    <div className="flex-1 relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono">z=</span>
                      <input
                        type="text"
                        value={expr}
                        onChange={(e) => handleExpressionChange(index, e.target.value)}
                        placeholder="x^2 + y^2"
                        className={`w-full pl-7 pr-2 py-1.5 bg-slate-800 border rounded text-white font-mono text-sm placeholder-slate-600 ${
                          !validation.valid ? 'border-red-500' : 'border-slate-700'
                        }`}
                      />
                    </div>
                    {/* Remove button */}
                    {expressions.length > 1 && (
                      <button
                        onClick={() => removeExpression(index)}
                        className="text-slate-500 hover:text-red-400 p-1"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Calculations - Collapsible Sections */}
          <div className="border-b border-slate-800">
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide px-4 pt-4 pb-2">Calculations</h3>
            <div className="bg-slate-800/30 rounded-lg mx-3 mb-3 overflow-hidden">
              {/* Extrema Section */}
              <CollapsibleSection
                title="Extrema"
                icon={<span className="text-xs">📊</span>}
                badge={
                  stats.globalMin || stats.globalMax ? (
                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-700 rounded text-slate-400">
                      {stats.globalMin && stats.globalMax ? '2' : '1'}
                    </span>
                  ) : null
                }
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-red-400 text-xs">▼</span>
                      <span className="text-xs text-slate-400">Min</span>
                    </div>
                    {stats.globalMin ? (
                      <span className="text-xs font-mono text-slate-300">
                        ({stats.globalMin.x.toFixed(2)}, {stats.globalMin.y.toFixed(2)}, {stats.globalMin.z.toFixed(2)})
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">—</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-green-400 text-xs">▲</span>
                      <span className="text-xs text-slate-400">Max</span>
                    </div>
                    {stats.globalMax ? (
                      <span className="text-xs font-mono text-slate-300">
                        ({stats.globalMax.x.toFixed(2)}, {stats.globalMax.y.toFixed(2)}, {stats.globalMax.z.toFixed(2)})
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">—</span>
                    )}
                  </div>
                </div>
              </CollapsibleSection>

              {/* Surface Area Section */}
              <CollapsibleSection
                title="Surface Area"
                icon={<span className="text-xs">📐</span>}
                badge={
                  stats.surfaceAreas.length > 0 ? (
                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-700 rounded text-slate-400">
                      {stats.surfaceAreas.length}
                    </span>
                  ) : null
                }
              >
                {stats.surfaceAreas.length > 0 ? (
                  <div className="space-y-2">
                    {stats.surfaceAreas.map((surface, idx) => {
                      const derivs = getPartialDerivatives(surface.expression);
                      return (
                        <div key={idx} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: getFunctionColor(surface.originalIndex) }}
                            />
                            <span className="text-xs text-slate-400 truncate max-w-[100px]">
                              {surface.expression}
                            </span>
                          </div>
                          <span className="text-xs font-mono text-slate-300">
                            {surface.surfaceArea.toFixed(2)} units²
                          </span>
                        </div>
                      );
                    })}
                    <button
                      onClick={() => setShowSurfaceAreaWorking(!showSurfaceAreaWorking)}
                      className="text-[10px] text-blue-400 hover:text-blue-300"
                    >
                      {showSurfaceAreaWorking ? 'Hide' : 'Show'} formula
                    </button>
                    {showSurfaceAreaWorking && (
                      <div className="text-[10px] text-slate-500 overflow-x-auto custom-scrollbar">
                        <InlineMath math="A = \iint_D \sqrt{1 + z_x^2 + z_y^2} \, dA" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">No surfaces</div>
                )}
              </CollapsibleSection>

              {/* Volume Section */}
              <CollapsibleSection
                title="Volume"
                icon={<span className="text-xs">📦</span>}
                badge={
                  volumeBetweenSurfaces !== null ? (
                    <span className="text-[10px] px-1.5 py-0.5 bg-blue-600 rounded text-white">
                      {volumeBetweenSurfaces.toFixed(2)}
                    </span>
                  ) : null
                }
              >
                {!volumeMode ? (
                  <button
                    onClick={() => {
                      if (expressions.length === 1 || (expressions.length > 1 && !expressions[1].trim())) {
                        const newExpressions = [...expressions];
                        if (newExpressions.length === 1) {
                          newExpressions.push('0');
                        } else {
                          newExpressions[1] = '0';
                        }
                        setExpressions(newExpressions);
                      }
                      setVolumeMode(true);
                    }}
                    className="w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded transition-colors"
                  >
                    Calculate Volume Between Surfaces
                  </button>
                ) : (
                  <div className="space-y-2">
                    {activeExpressions.length >= 2 ? (
                      <>
                        <div className="space-y-1">
                          {activeExpressions.slice(0, 2).map((expr, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getFunctionColor(expr.originalIndex) }} />
                              <span className="text-slate-400">z{i+1} =</span>
                              <span className="text-slate-300 font-mono truncate">{expr.expression}</span>
                            </div>
                          ))}
                        </div>
                        <div className="text-lg font-mono text-white">
                          V = {volumeBetweenSurfaces !== null ? volumeBetweenSurfaces.toFixed(4) : '...'} units³
                        </div>
                        <button
                          onClick={() => setShowVolumeWorking(!showVolumeWorking)}
                          className="text-[10px] text-blue-400 hover:text-blue-300"
                        >
                          {showVolumeWorking ? 'Hide' : 'Show'} working
                        </button>
                        {showVolumeWorking && (
                          <div className="text-[10px] text-slate-500 space-y-1 overflow-x-auto custom-scrollbar">
                            <InlineMath math="V = \iint_D |z_1 - z_2| \, dA" />
                            <div className="text-slate-600">(60×60 midpoint rule)</div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-xs text-slate-500">Need 2 surfaces</div>
                    )}
                    <button
                      onClick={() => setVolumeMode(false)}
                      className="text-[10px] text-slate-500 hover:text-slate-400"
                    >
                      Close
                    </button>
                  </div>
                )}
              </CollapsibleSection>

              {/* Intersection Equation Section */}
              {activeExpressions.length >= 2 && (() => {
                const intersection = generateIntersectionEquation(activeExpressions[0].expression, activeExpressions[1].expression);
                const hasValidIntersection = intersection.rawExpression &&
                                             intersection.rawExpression.trim() !== '' &&
                                             !intersection.simplified.includes('No intersection') &&
                                             !intersection.simplified.includes('Identical');

                return (
                  <CollapsibleSection
                    title="Intersection"
                    icon={<span className="text-xs">✕</span>}
                    defaultOpen={true}
                  >
                    <div className="space-y-2">
                      <div className="text-xs text-slate-400">Where surfaces meet:</div>
                      <div className="text-sm text-white overflow-x-auto custom-scrollbar py-1">
                        <InlineMath math={intersection.simplified} />
                      </div>

                      {/* Mini 2D Graph Preview */}
                      {hasValidIntersection && (
                        <div className="mt-2">
                          <div className="text-[10px] text-slate-500 mb-1">
                            2D Preview ({intersection.solvedFor === 'x' ? 'x vs y' : 'y vs x'}){intersection.hasPlusMinus && ' - both ± branches'}:
                          </div>
                          <div className="h-48 bg-slate-900 rounded overflow-hidden border border-slate-700">
                            <Graph2D
                              expressions={
                                intersection.hasPlusMinus && intersection.rawExpressionNeg
                                  ? [
                                      { expression: intersection.rawExpression, originalIndex: 0 },
                                      { expression: intersection.rawExpressionNeg, originalIndex: 1 }
                                    ]
                                  : [{ expression: intersection.rawExpression, originalIndex: 0 }]
                              }
                              xRange={xRange}
                              yRange={[-10, 10]}
                              mini={true}
                              swapAxes={intersection.solvedFor === 'x'}
                            />
                          </div>
                          <Link
                            href={`/2d-grapher?eq=${encodeURIComponent(
                              intersection.hasPlusMinus && intersection.rawExpressionNeg
                                ? intersection.rawExpression + '|' + intersection.rawExpressionNeg
                                : intersection.rawExpression
                            )}&xr=${xRange[0]},${xRange[1]}`}
                            target="_blank"
                            className="mt-2 flex items-center justify-center gap-1 text-[10px] text-blue-400 hover:text-blue-300"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            Open in 2D Grapher
                          </Link>
                        </div>
                      )}

                      <button
                        onClick={() => setShowIntersectionWorking(!showIntersectionWorking)}
                        className="text-[10px] text-blue-400 hover:text-blue-300"
                      >
                        {showIntersectionWorking ? 'Hide' : 'Show'} working
                      </button>
                      {showIntersectionWorking && (
                        <div className="space-y-1 text-[10px] text-slate-500 overflow-x-auto custom-scrollbar">
                          {intersection.steps.map((step, i) => (
                            <div key={i}>
                              <InlineMath math={step} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CollapsibleSection>
                );
              })()}
            </div>
          </div>

          {/* Range Controls */}
          <div className="p-4 border-b border-slate-800">
            <RangeControls
              xRange={xRange}
              yRange={yRange}
              onXRangeChange={setXRange}
              onYRangeChange={setYRange}
            />
          </div>

          {/* Z Range Display */}
          <div className="p-4 border-b border-slate-800">
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Z Range (auto)</h3>
            <p className="text-sm text-slate-300 font-mono">
              {zRange[0].toFixed(2)} to {zRange[1].toFixed(2)}
            </p>
          </div>

          {/* Display Options */}
          <div className="p-4 border-b border-slate-800">
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">Display Options</h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showSurfaceGrid}
                onChange={(e) => setShowSurfaceGrid(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
              />
              <span className="text-sm text-slate-300">Show surface grid lines</span>
            </label>
          </div>

          {/* Share */}
          <div className="p-4 border-b border-slate-800">
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">Share</h3>
            <button
              onClick={handleShare}
              disabled={activeExpressionStrings.filter(e => e.trim()).length === 0}
              className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-700 hover:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Copy Share Link
            </button>
          </div>

          {/* Recent Equations */}
          {recentEquations.length > 0 && (
            <div className="p-4 border-b border-slate-800">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center justify-between w-full text-xs font-medium text-slate-400 uppercase tracking-wide"
              >
                <span>Recent Equations ({recentEquations.length})</span>
                <svg
                  className={`w-4 h-4 transition-transform ${showHistory ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showHistory && (
                <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                  {recentEquations.map((entry, idx) => (
                    <button
                      key={idx}
                      onClick={() => loadFromHistory(entry)}
                      className="w-full text-left p-2 bg-slate-800/50 hover:bg-slate-700/50 rounded border border-slate-700/50 hover:border-slate-600 transition-colors"
                    >
                      <div className="text-xs text-slate-300 font-mono truncate">
                        {entry.expressions.map((e, i) => (
                          <span key={i}>
                            {i > 0 && <span className="text-slate-500"> | </span>}
                            z = {e}
                          </span>
                        ))}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1">
                        {new Date(entry.timestamp).toLocaleDateString()} {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tips - pushed to bottom */}
          <div className="mt-auto p-4 border-t border-slate-800">
            <p className="text-xs text-slate-500 mb-2">
              Add multiple functions to see intersections. Use notation like x^2, sin(x), cos(y), exp(-x^2)
            </p>
            <p className="text-xs text-slate-600">
              <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400">Enter</kbd> graph &middot; <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400">Esc</kbd> clear &middot; <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400">F</kbd> fullscreen
            </p>
          </div>
        </div>

        {/* Right Panel - Graph */}
        <div className="flex-1 p-4 min-w-0 relative">
          <div className="w-full h-full rounded-xl overflow-hidden shadow-2xl">
            <Graph3D
              expressions={activeExpressions}
              xRange={xRange}
              yRange={yRange}
              resolution={60}
              showSurfaceGrid={showSurfaceGrid}
              onZRangeChange={handleZRangeChange}
              onStatsChange={handleStatsChange}
            />
          </div>
          {/* Fullscreen toggle button */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="absolute top-6 right-6 p-2 bg-slate-800/80 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors backdrop-blur-sm border border-slate-700/50"
            title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
          >
            {isFullscreen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    }>
      <Graph3DPage />
    </Suspense>
  );
}
