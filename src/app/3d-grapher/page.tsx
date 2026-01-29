'use client';

import { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import RangeControls from '@/components/RangeControls';
import { getFunctionColor } from '@/lib/graphing/colors';
import { validateExpression, generateIntersectionEquation, createEvaluator, getPartialDerivatives } from '@/lib/mathParser';
import { IntegrationResult, calculateVolumeWithFillDirections, FillDirection, SurfaceConstraint } from '@/lib/integration';
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
const CURRENT_EXPR_KEY = 'mathgraph-current-expressions';
const CURRENT_RANGES_KEY = 'mathgraph-current-ranges';

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
  const [zRange, setZRange] = useState<[number, number]>([-5, 5]);
  const [userZRange, setUserZRange] = useState<[number, number]>([-5, 5]);
  const [autoZRange, setAutoZRange] = useState(false);
  const [stats, setStats] = useState<{
    surfaceAreas: { expression: string; originalIndex: number; surfaceArea: number; surfaceAreaResult: IntegrationResult; volumeResult: IntegrationResult }[];
    volume: number;
    globalMin: { x: number; y: number; z: number } | null;
    globalMax: { x: number; y: number; z: number } | null;
  }>({ surfaceAreas: [], volume: 0, globalMin: null, globalMax: null });
  const [showIntersectionWorking, setShowIntersectionWorking] = useState(false);
  const [showSurfaceAreaWorking, setShowSurfaceAreaWorking] = useState(false);
  const [showVolumeWorking, setShowVolumeWorking] = useState(false);
  const [volumeMode, setVolumeMode] = useState(false);
  const [volumeBetweenSurfaces, setVolumeBetweenSurfaces] = useState<number | null>(null);
  const [volumeBetweenResult, setVolumeBetweenResult] = useState<IntegrationResult | null>(null);
  // Fill direction for each surface: 'above' or 'below'
  // 'below' means fill the region below the surface (z < f(x,y))
  // 'above' means fill the region above the surface (z > f(x,y))
  const [volumeFillDirections, setVolumeFillDirections] = useState<('above' | 'below')[]>(['below', 'above']);
  const [recentEquations, setRecentEquations] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [highResolution, setHighResolution] = useState(false);
  const [isLoadingHD, setIsLoadingHD] = useState(false);

  // Resolution: 60 for normal, 300 for high (much smoother but slower)
  const resolution = highResolution ? 300 : 60;

  // Handle HD toggle with loading state
  const toggleHighResolution = useCallback(() => {
    setIsLoadingHD(true);
    // Use setTimeout to allow the UI to update before the expensive render
    setTimeout(() => {
      setHighResolution(prev => !prev);
      // Clear loading state after a brief moment (render will have started)
      setTimeout(() => setIsLoadingHD(false), 100);
    }, 10);
  }, []);

  // Load recent equations and current expressions from localStorage after mount (avoids hydration mismatch)
  useEffect(() => {
    try {
      const storedHistory = localStorage.getItem(HISTORY_KEY);
      if (storedHistory) {
        setRecentEquations(JSON.parse(storedHistory));
      }

      // Only load saved expressions if there are no URL params
      if (urlExpressions.length === 0) {
        const storedExpressions = localStorage.getItem(CURRENT_EXPR_KEY);
        if (storedExpressions) {
          const parsed = JSON.parse(storedExpressions) as string[];
          if (parsed.length > 0) {
            setExpressions(parsed);
            // Also update active expressions for valid ones
            const validExprs = parsed
              .map((expr, i) => ({ expression: expr, originalIndex: i }))
              .filter(e => e.expression.trim() && validateExpression(e.expression).valid);
            if (validExprs.length > 0) {
              setActiveExpressions(validExprs);
            }
          }
        }

        const storedRanges = localStorage.getItem(CURRENT_RANGES_KEY);
        if (storedRanges) {
          const ranges = JSON.parse(storedRanges);
          if (ranges.xRange) setXRange(ranges.xRange);
          if (ranges.yRange) setYRange(ranges.yRange);
          if (ranges.zRange) setUserZRange(ranges.zRange);
          if (ranges.autoZRange !== undefined) setAutoZRange(ranges.autoZRange);
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [showSurfaceGrid, setShowSurfaceGrid] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showMobilePanel, setShowMobilePanel] = useState(false);

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

  // Save current expressions to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem(CURRENT_EXPR_KEY, JSON.stringify(expressions));
    } catch {
      // Ignore localStorage errors
    }
  }, [expressions]);

  // Save current ranges to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem(CURRENT_RANGES_KEY, JSON.stringify({
        xRange,
        yRange,
        zRange: userZRange,
        autoZRange,
      }));
    } catch {
      // Ignore localStorage errors
    }
  }, [xRange, yRange, userZRange, autoZRange]);

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

  // Calculate volume using fill directions (matches the visualization)
  const calculateVolume = useCallback((
    expressions: string[],
    fillDirections: FillDirection[],
    zClipRange: [number, number] | null
  ): IntegrationResult | null => {
    try {
      // Build array of surface constraints
      const surfaces: SurfaceConstraint[] = expressions.map((expr, i) => ({
        evaluate: createEvaluator(expr),
        fillDirection: fillDirections[i] || (i === 0 ? 'below' : 'above'),
      }));

      // If only one surface, add z=0 as second surface
      if (surfaces.length === 1) {
        surfaces.push({
          evaluate: () => 0,
          fillDirection: fillDirections[1] || 'above',
        });
      }

      return calculateVolumeWithFillDirections(
        surfaces,
        xRange,
        yRange,
        zClipRange,
        1e-3,  // tolerance (relaxed for UI responsiveness)
        4      // maxDepth (reduced for speed)
      );
    } catch {
      return null;
    }
  }, [xRange, yRange]);

  // Update volume when in volume mode and expressions/fill directions change
  // Uses the same fill direction logic as the visualization
  useEffect(() => {
    if (volumeMode && activeExpressionStrings.length >= 1) {
      const zClipRange = autoZRange ? null : userZRange;
      const result = calculateVolume(
        activeExpressionStrings,
        volumeFillDirections,
        zClipRange
      );
      setVolumeBetweenResult(result);
      setVolumeBetweenSurfaces(result?.value ?? null);
    } else {
      setVolumeBetweenSurfaces(null);
      setVolumeBetweenResult(null);
      // Reset volume mode if we don't have any expressions
      if (volumeMode && activeExpressionStrings.length < 1) {
        setVolumeMode(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volumeMode, activeExpressionStrings.join('|'), xRange[0], xRange[1], yRange[0], yRange[1], volumeFillDirections, userZRange, autoZRange]);

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
    // When auto, also update userZRange to reflect the computed values
    if (autoZRange) {
      setUserZRange([zMin, zMax]);
    }
  }, [autoZRange]);

  const handleUserZRangeChange = useCallback((range: [number, number]) => {
    setUserZRange(range);
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
          {/* Mobile menu button */}
          <button
            onClick={() => setShowMobilePanel(!showMobilePanel)}
            className="md:hidden p-1 text-slate-400 hover:text-white"
            aria-label="Toggle controls"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-white">MathGraph 3D</h1>
          {/* Spacer for centering on mobile */}
          <div className="w-6 md:hidden" />
        </div>
      </header>

      {/* Main content - fixed height, no scroll */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Mobile overlay backdrop */}
        {showMobilePanel && (
          <div
            className="md:hidden fixed inset-0 bg-black/50 z-20"
            onClick={() => setShowMobilePanel(false)}
          />
        )}

        {/* Left Panel - Controls (slide-over on mobile) */}
        <div className={`
          ${isFullscreen ? 'hidden' : ''}
          ${showMobilePanel ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          fixed md:relative z-30 md:z-auto
          w-80 max-w-[85vw] md:max-w-none
          h-[calc(100vh-49px)] md:h-auto
          flex-shrink-0 bg-slate-900 border-r border-slate-800
          flex flex-col overflow-y-auto
          transition-transform duration-300 ease-in-out
        `}>
          {/* Mobile close button */}
          <div className="md:hidden flex items-center justify-between p-3 border-b border-slate-800">
            <span className="text-sm font-medium text-slate-300">Controls</span>
            <button
              onClick={() => setShowMobilePanel(false)}
              className="p-1 text-slate-400 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

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
                        <div key={idx} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: getFunctionColor(surface.originalIndex) }}
                              />
                              <span className="text-xs text-slate-400 truncate max-w-[100px]">
                                {surface.expression}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-mono text-slate-300">
                                {surface.surfaceArea.toFixed(2)} units²
                              </span>
                              <span
                                className={`text-[9px] px-1 py-0.5 rounded ${
                                  surface.surfaceAreaResult.isExact
                                    ? 'bg-green-600/30 text-green-400 border border-green-500/30'
                                    : surface.surfaceAreaResult.method === 'mesh'
                                      ? 'bg-orange-600/30 text-orange-400 border border-orange-500/30'
                                      : 'bg-yellow-600/30 text-yellow-400 border border-yellow-500/30'
                                }`}
                                title={surface.surfaceAreaResult.isExact
                                  ? 'Exact result'
                                  : surface.surfaceAreaResult.method === 'mesh'
                                    ? 'Mesh approximation (less accurate)'
                                    : `Adaptive integration (error: ~${surface.surfaceAreaResult.error.toExponential(1)})`}
                              >
                                {surface.surfaceAreaResult.isExact ? 'exact' : '~'}
                              </span>
                            </div>
                          </div>
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
                        <div className="text-slate-600 mt-1">
                          {stats.surfaceAreas[0]?.surfaceAreaResult.method === 'adaptive'
                            ? '(adaptive Gaussian quadrature)'
                            : stats.surfaceAreas[0]?.surfaceAreaResult.method === 'gaussian'
                              ? '(Gaussian quadrature)'
                              : '(mesh triangulation)'}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">No surfaces</div>
                )}
              </CollapsibleSection>

              {/* Volume Between Surfaces Section */}
              <CollapsibleSection
                title="Enclosed Volume"
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
                    onClick={() => setVolumeMode(true)}
                    className="w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded transition-colors"
                    disabled={activeExpressions.length < 1}
                  >
                    Calculate Enclosed Volume
                  </button>
                ) : (
                  <div className="space-y-2">
                    {activeExpressions.length >= 1 ? (
                      <>
                        <div className="space-y-2">
                          <div className="text-[10px] text-slate-500 mb-1">
                            Select which side of each surface to fill:
                          </div>
                          {activeExpressions.map((expr, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: getFunctionColor(expr.originalIndex) }} />
                              <span className="text-slate-400 flex-shrink-0">z{i+1} =</span>
                              <span className="text-slate-300 font-mono truncate flex-1">{expr.expression}</span>
                              <div className="flex gap-1 flex-shrink-0">
                                <button
                                  onClick={() => {
                                    const newDirs = [...volumeFillDirections];
                                    newDirs[i] = 'above';
                                    setVolumeFillDirections(newDirs);
                                  }}
                                  className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                                    volumeFillDirections[i] === 'above'
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                  }`}
                                  title="Fill region above this surface"
                                >
                                  ▲ above
                                </button>
                                <button
                                  onClick={() => {
                                    const newDirs = [...volumeFillDirections];
                                    newDirs[i] = 'below';
                                    setVolumeFillDirections(newDirs);
                                  }}
                                  className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                                    volumeFillDirections[i] === 'below'
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                  }`}
                                  title="Fill region below this surface"
                                >
                                  ▼ below
                                </button>
                              </div>
                            </div>
                          ))}
                          {activeExpressions.length === 1 && (
                            <div className="flex items-center gap-2 text-xs">
                              <div className="w-2 h-2 rounded-full bg-slate-500 flex-shrink-0" />
                              <span className="text-slate-400 flex-shrink-0">z₂ =</span>
                              <span className="text-slate-300 font-mono flex-1">0</span>
                              <div className="flex gap-1 flex-shrink-0">
                                <button
                                  onClick={() => {
                                    const newDirs = [...volumeFillDirections];
                                    newDirs[1] = 'above';
                                    setVolumeFillDirections(newDirs);
                                  }}
                                  className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                                    volumeFillDirections[1] === 'above'
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                  }`}
                                  title="Fill region above z=0"
                                >
                                  ▲ above
                                </button>
                                <button
                                  onClick={() => {
                                    const newDirs = [...volumeFillDirections];
                                    newDirs[1] = 'below';
                                    setVolumeFillDirections(newDirs);
                                  }}
                                  className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                                    volumeFillDirections[1] === 'below'
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                  }`}
                                  title="Fill region below z=0"
                                >
                                  ▼ below
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 bg-slate-800/50 rounded p-2">
                          Volume = intersection of {
                            [...Array(Math.max(activeExpressions.length, 1) + (activeExpressions.length === 1 ? 1 : 0))].map((_, i) => {
                              const dir = volumeFillDirections[i] || (i === 0 ? 'below' : 'above');
                              const label = i < activeExpressions.length ? `z${i + 1}` : 'z=0';
                              return `${dir === 'below' ? 'below' : 'above'} ${label}`;
                            }).join(' ∩ ')
                          }
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Domain: x ∈ [{xRange[0]}, {xRange[1]}], y ∈ [{yRange[0]}, {yRange[1]}]
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-lg font-mono text-white">
                            V = {volumeBetweenSurfaces !== null ? volumeBetweenSurfaces.toFixed(2) : '...'} units³
                          </div>
                          {volumeBetweenResult && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded ${
                                volumeBetweenResult.isExact
                                  ? 'bg-green-600/30 text-green-400 border border-green-500/30'
                                  : 'bg-yellow-600/30 text-yellow-400 border border-yellow-500/30'
                              }`}
                              title={volumeBetweenResult.isExact
                                ? 'Exact symbolic integration'
                                : `Adaptive integration (error: ~${volumeBetweenResult.error.toExponential(1)})`}
                            >
                              {volumeBetweenResult.isExact ? 'exact' : '~approx'}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => setShowVolumeWorking(!showVolumeWorking)}
                          className="text-[10px] text-blue-400 hover:text-blue-300"
                        >
                          {showVolumeWorking ? 'Hide' : 'Show'} working
                        </button>
                        {showVolumeWorking && (
                          <div className="text-[10px] text-slate-500 space-y-1 overflow-x-auto custom-scrollbar">
                            <InlineMath math="V = \iint_D \max(0, z_{top} - z_{bot}) \, dA" />
                            <div className="text-slate-600 mt-1">
                              where z<sub>top</sub> = min of upper bounds, z<sub>bot</sub> = max of lower bounds
                            </div>
                            {[...Array(Math.max(activeExpressions.length, 1) + (activeExpressions.length === 1 ? 1 : 0))].map((_, i) => {
                              const dir = volumeFillDirections[i] || (i === 0 ? 'below' : 'above');
                              const label = i < activeExpressions.length ? `z${i + 1}` : 'z=0';
                              const subscript = i < activeExpressions.length ? String(i + 1) : '₀';
                              return (
                                <div key={i} className="text-slate-600">
                                  • {dir === 'below' ? `z < ${label} (upper bound)` : `z > ${label} (lower bound)`}
                                </div>
                              );
                            })}
                            <div className="text-slate-600 mt-1">
                              {volumeBetweenResult?.method === 'adaptive'
                                ? '(adaptive Gaussian quadrature)'
                                : '(Gaussian quadrature)'}
                            </div>
                            <div className="text-slate-600">
                              Domain: x ∈ [{xRange[0]}, {xRange[1]}], y ∈ [{yRange[0]}, {yRange[1]}]
                              {!autoZRange && `, z ∈ [${userZRange[0]}, ${userZRange[1]}]`}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-xs text-slate-500">Need at least 1 surface</div>
                    )}
                    <button
                      onClick={() => setVolumeMode(false)}
                      className="w-full mt-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded transition-colors flex items-center justify-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Stop Measuring Volume
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
              zRange={userZRange}
              autoZRange={autoZRange}
              onXRangeChange={setXRange}
              onYRangeChange={setYRange}
              onZRangeChange={handleUserZRangeChange}
              onAutoZRangeChange={setAutoZRange}
            />
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
        <div className="flex-1 p-2 md:p-4 min-w-0 relative">
          <div className="w-full h-full rounded-xl overflow-hidden shadow-2xl">
            <Graph3D
              expressions={activeExpressions}
              xRange={xRange}
              yRange={yRange}
              zRange={autoZRange ? undefined : userZRange}
              resolution={resolution}
              showSurfaceGrid={showSurfaceGrid}
              showVolumeVisualization={volumeMode}
              volumeFillDirections={volumeFillDirections}
              onZRangeChange={handleZRangeChange}
              onStatsChange={handleStatsChange}
            />
          </div>

          {/* Mobile floating controls button */}
          <button
            onClick={() => setShowMobilePanel(true)}
            className="md:hidden absolute top-4 left-4 p-3 bg-blue-600/90 hover:bg-blue-500 rounded-full text-white shadow-lg transition-colors"
            aria-label="Open controls"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </button>

          {/* High resolution toggle button */}
          <button
            onClick={toggleHighResolution}
            disabled={isLoadingHD}
            className={`absolute top-4 md:top-6 right-16 md:right-20 p-2 rounded-lg text-slate-300 transition-colors backdrop-blur-sm border ${
              isLoadingHD
                ? 'bg-amber-600/80 border-amber-500/50 cursor-wait'
                : highResolution
                  ? 'bg-blue-600/80 hover:bg-blue-500 border-blue-500/50'
                  : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700/50'
            }`}
            title={highResolution ? 'Switch to normal resolution (60×60)' : 'Switch to high resolution (300×300)'}
          >
            {isLoadingHD ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <span className="text-xs font-medium">HD</span>
            )}
          </button>

          {/* Fullscreen toggle button */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="absolute top-4 md:top-6 right-4 md:right-6 p-2 bg-slate-800/80 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors backdrop-blur-sm border border-slate-700/50"
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
