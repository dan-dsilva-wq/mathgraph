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

const MAX_FUNCTIONS = 6;
const DEBOUNCE_MS = 300; // Update graph 300ms after typing stops

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

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

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
    const newExpressions = [...expressions];
    newExpressions[index] = value;
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
        <div className="w-80 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col overflow-y-auto">
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

          {/* Calculations */}
          <div className="p-4 border-b border-slate-800">
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">Calculations</h3>
            <div className="space-y-3 text-sm">
              {/* Global Minimum */}
              <div className="bg-slate-800/50 rounded-lg p-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-red-400">▼</span>
                  <span className="text-slate-300 font-medium">Global Minimum</span>
                </div>
                {stats.globalMin ? (
                  <div className="text-slate-400 font-mono text-xs pl-5">
                    ({stats.globalMin.x.toFixed(3)}, {stats.globalMin.y.toFixed(3)}, {stats.globalMin.z.toFixed(3)})
                  </div>
                ) : (
                  <div className="text-slate-500 text-xs pl-5">No data</div>
                )}
              </div>

              {/* Global Maximum */}
              <div className="bg-slate-800/50 rounded-lg p-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-green-400">▲</span>
                  <span className="text-slate-300 font-medium">Global Maximum</span>
                </div>
                {stats.globalMax ? (
                  <div className="text-slate-400 font-mono text-xs pl-5">
                    ({stats.globalMax.x.toFixed(3)}, {stats.globalMax.y.toFixed(3)}, {stats.globalMax.z.toFixed(3)})
                  </div>
                ) : (
                  <div className="text-slate-500 text-xs pl-5">No data</div>
                )}
              </div>

              {/* Surface Area */}
              <div className="bg-slate-800/50 rounded-lg p-2">
                <div className="text-slate-300 font-medium mb-1">Surface Area</div>
                <div className="text-slate-400 text-xs mb-1">
                  <InlineMath math="A = \iint_D \sqrt{1 + \left(\frac{\partial z}{\partial x}\right)^2 + \left(\frac{\partial z}{\partial y}\right)^2} \, dA" />
                </div>

                {stats.surfaceAreas.length > 0 ? (
                  <div className="space-y-2 mt-2">
                    {stats.surfaceAreas.map((surface, idx) => {
                      const derivs = getPartialDerivatives(surface.expression);
                      return (
                        <div key={idx} className="border-l-2 border-slate-700 pl-2">
                          <div className="flex items-center gap-2 mb-1">
                            <div
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: getFunctionColor(surface.originalIndex) }}
                            />
                            <span className="text-slate-400 text-xs">z = {surface.expression}</span>
                          </div>
                          <div className="text-white font-mono text-sm">
                            A = {surface.surfaceArea.toFixed(4)} units²
                          </div>

                          {/* Show working toggle */}
                          {derivs && (
                            <>
                              <button
                                onClick={() => setShowSurfaceAreaWorking(!showSurfaceAreaWorking)}
                                className="mt-1 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                              >
                                <svg
                                  className={`w-3 h-3 transition-transform ${showSurfaceAreaWorking ? 'rotate-90' : ''}`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                                Show working
                              </button>

                              {showSurfaceAreaWorking && (
                                <div className="mt-2 pl-2 border-l border-slate-600 space-y-1 text-xs">
                                  <div className="text-slate-400">
                                    <InlineMath math={`\\frac{\\partial z}{\\partial x} = ${derivs.dzdx}`} />
                                  </div>
                                  <div className="text-slate-400">
                                    <InlineMath math={`\\frac{\\partial z}{\\partial y} = ${derivs.dzdy}`} />
                                  </div>
                                  <div className="text-slate-400 mt-1">
                                    <InlineMath math={`A = \\int_{${yRange[0]}}^{${yRange[1]}} \\int_{${xRange[0]}}^{${xRange[1]}} \\sqrt{1 + (${derivs.dzdx})^2 + (${derivs.dzdy})^2} \\, dx \\, dy`} />
                                  </div>
                                  <div className="text-slate-500 mt-1">
                                    (Computed numerically via mesh triangulation)
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-slate-500 text-xs">No surfaces</div>
                )}
              </div>

              {/* Volume Between Surfaces */}
              <div className="bg-slate-800/50 rounded-lg p-2">
                <div className="text-slate-300 font-medium mb-1">Volume Between Surfaces</div>

                {!volumeMode ? (
                  <button
                    onClick={() => {
                      // If only 1 expression, add z=0 as second
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
                    className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
                  >
                    Calculate Volume
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="text-slate-400 text-xs">
                      <InlineMath math="V = \iint_D |z_1 - z_2| \, dA" />
                    </div>

                    {activeExpressions.length >= 2 ? (
                      <>
                        <div className="text-xs text-slate-500 mb-1">
                          Between surfaces (edit above):
                        </div>
                        <div className="text-xs space-y-1 pl-2 border-l-2 border-slate-700">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getFunctionColor(activeExpressions[0].originalIndex) }} />
                            <span className="text-slate-400">z₁ =</span>
                            <span className="text-white font-mono">{activeExpressions[0].expression}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getFunctionColor(activeExpressions[1].originalIndex) }} />
                            <span className="text-slate-400">z₂ =</span>
                            <span className="text-white font-mono">{activeExpressions[1].expression}</span>
                          </div>
                        </div>
                        <div className="text-white font-mono text-lg">
                          = {volumeBetweenSurfaces !== null ? volumeBetweenSurfaces.toFixed(4) : '...'} units³
                        </div>

                        {/* Show working toggle */}
                        <button
                          onClick={() => setShowVolumeWorking(!showVolumeWorking)}
                          className="mt-1 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                        >
                          <svg
                            className={`w-3 h-3 transition-transform ${showVolumeWorking ? 'rotate-90' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          Show working
                        </button>

                        {showVolumeWorking && (
                          <div className="mt-2 pl-2 border-l border-slate-600 space-y-1 text-xs">
                            <div className="text-slate-400">
                              <InlineMath math={`V = \\int_{${yRange[0]}}^{${yRange[1]}} \\int_{${xRange[0]}}^{${xRange[1]}} |z_1 - z_2| \\, dx \\, dy`} />
                            </div>
                            <div className="text-slate-400">
                              <InlineMath math={`V = \\int_{${yRange[0]}}^{${yRange[1]}} \\int_{${xRange[0]}}^{${xRange[1]}} |(${activeExpressions[0].expression}) - (${activeExpressions[1].expression})| \\, dx \\, dy`} />
                            </div>
                            <div className="text-slate-500 mt-1">
                              (Computed numerically using midpoint rule with 60×60 grid)
                            </div>
                            <div className="text-slate-500">
                              Cell area = {((xRange[1] - xRange[0]) / 60 * (yRange[1] - yRange[0]) / 60).toFixed(6)} units²
                            </div>
                          </div>
                        )}
                      </>
                    ) : activeExpressions.length > 2 ? (
                      <div className="text-amber-400 text-xs">
                        Only works with exactly 2 surfaces. Please remove extra functions.
                      </div>
                    ) : (
                      <div className="text-slate-500 text-xs">
                        Need 2 valid expressions to calculate volume.
                      </div>
                    )}

                    <button
                      onClick={() => setVolumeMode(false)}
                      className="text-xs text-slate-500 hover:text-slate-400"
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>

              {/* Intersection Equation - shown when 2+ functions */}
              {activeExpressions.length >= 2 && (() => {
                const intersection = generateIntersectionEquation(activeExpressions[0].expression, activeExpressions[1].expression);
                return (
                  <div className="bg-slate-800/50 rounded-lg p-2">
                    <div className="text-slate-300 font-medium mb-1">Intersection Equation</div>
                    <div className="text-slate-400 text-xs mb-2">
                      Where surfaces intersect:
                    </div>
                    <div className="text-white text-sm overflow-x-auto scrollbar-hide">
                      <InlineMath math={intersection.simplified} />
                    </div>

                    {/* Expandable working section */}
                    <button
                      onClick={() => setShowIntersectionWorking(!showIntersectionWorking)}
                      className="mt-2 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      <svg
                        className={`w-3 h-3 transition-transform ${showIntersectionWorking ? 'rotate-90' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      Show working
                    </button>

                    {showIntersectionWorking && (
                      <div className="mt-2 pl-4 border-l-2 border-slate-700 space-y-1">
                        {intersection.steps.map((step, i) => (
                          <div key={i} className="text-slate-400 text-xs overflow-x-auto scrollbar-hide">
                            <InlineMath math={step} />
                          </div>
                        ))}
                      </div>
                    )}

                    {activeExpressions.length > 2 && (
                      <div className="text-slate-500 text-xs mt-2">
                        (Showing intersection of first two functions)
                      </div>
                    )}
                  </div>
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

          {/* Share */}
          <div className="p-4">
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

          {/* Tips - pushed to bottom */}
          <div className="mt-auto p-4 border-t border-slate-800">
            <p className="text-xs text-slate-500">
              Add multiple functions to see intersections. Use notation like x^2, sin(x), cos(y), exp(-x^2)
            </p>
          </div>
        </div>

        {/* Right Panel - Graph */}
        <div className="flex-1 p-4 min-w-0">
          <div className="w-full h-full rounded-xl overflow-hidden shadow-2xl">
            <Graph3D
              expressions={activeExpressions}
              xRange={xRange}
              yRange={yRange}
              resolution={60}
              onZRangeChange={handleZRangeChange}
              onStatsChange={handleStatsChange}
            />
          </div>
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
