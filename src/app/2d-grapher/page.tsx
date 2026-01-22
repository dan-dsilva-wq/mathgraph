'use client';

import { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Graph2D from '@/components/Graph2D';
import { getFunctionColor } from '@/lib/graphing/colors';
import { validateExpression, expressionToLatex } from '@/lib/mathParser';
import 'katex/dist/katex.min.css';
import { InlineMath } from 'react-katex';

const MAX_FUNCTIONS = 6;
const DEBOUNCE_MS = 300;
const MAX_HISTORY = 10;
const HISTORY_KEY = 'mathgraph-recent-equations-2d';

interface HistoryEntry {
  expressions: string[];
  timestamp: number;
}

// Validate 2D expression (only uses x, not y)
function validate2DExpression(expr: string): { valid: boolean; error?: string } {
  if (!expr.trim()) return { valid: false, error: 'Expression cannot be empty' };

  // Check for y variable which isn't allowed in 2D mode
  if (/\by\b/i.test(expr)) {
    return { valid: false, error: 'Use x only (2D mode)' };
  }

  // Handle +- or ± prefix - validate the base expression
  const cleanExpr = expr.replace(/^[±]|^\+-/, '');
  return validateExpression(cleanExpr.replace(/y/gi, 'x')); // Validate treating as single var
}

// Expand +- or ± expressions into positive and negative versions
function expandPlusMinusExpr(expr: string): string[] {
  const trimmed = expr.trim();
  // Check for +- or ± at the start
  if (trimmed.startsWith('+-') || trimmed.startsWith('±')) {
    const baseExpr = trimmed.replace(/^[±]|^\+-/, '');
    return [baseExpr, '-(' + baseExpr + ')'];
  }
  return [expr];
}

function Graph2DPage() {
  const searchParams = useSearchParams();

  const urlExpressions = searchParams.get('eq')?.split('|') || [];
  const urlXRange = searchParams.get('xr')?.split(',').map(Number) as [number, number] | undefined;
  const urlYRange = searchParams.get('yr')?.split(',').map(Number) as [number, number] | undefined;

  const [expressions, setExpressions] = useState<string[]>(
    urlExpressions.length > 0 ? urlExpressions : ['sin(x)']
  );
  const [activeExpressions, setActiveExpressions] = useState<{ expression: string; originalIndex: number }[]>(
    urlExpressions.length > 0
      ? urlExpressions.map((e, i) => ({ expression: e, originalIndex: i }))
      : [{ expression: 'sin(x)', originalIndex: 0 }]
  );
  const [xRange, setXRange] = useState<[number, number]>(urlXRange || [-10, 10]);
  const [yRange, setYRange] = useState<[number, number]>(urlYRange || [-10, 10]);
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
            const validation = validate2DExpression(expr);
            if (validation.valid) {
              const expanded = expandPlusMinusExpr(expr);
              expanded.forEach((expandedExpr, subIndex) => {
                validExpressions.push({
                  expression: expandedExpr,
                  originalIndex: expanded.length > 1 ? index * 2 + subIndex : index
                });
              });
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

  // Save to history
  const saveToHistory = useCallback((exprs: string[]) => {
    const validExprs = exprs.filter(e => e.trim() && validate2DExpression(e).valid);
    if (validExprs.length === 0) return;

    setRecentEquations(prev => {
      const exprKey = validExprs.join('|');
      if (prev.length > 0 && prev[0].expressions.join('|') === exprKey) {
        return prev;
      }

      const newEntry: HistoryEntry = {
        expressions: validExprs,
        timestamp: Date.now(),
      };

      const filtered = prev.filter(h => h.expressions.join('|') !== exprKey);
      const newHistory = [newEntry, ...filtered].slice(0, MAX_HISTORY);

      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
      } catch {
        // Ignore localStorage errors
      }

      return newHistory;
    });
  }, []);

  useEffect(() => {
    if (activeExpressions.length > 0) {
      const timer = setTimeout(() => {
        saveToHistory(activeExpressions.map(e => e.expression));
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [activeExpressions, saveToHistory]);

  const loadFromHistory = (entry: HistoryEntry) => {
    setExpressions(entry.expressions);
    setShowHistory(false);
  };

  // Auto-update graph when expressions change
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      const validExpressions: { expression: string; originalIndex: number }[] = [];
      expressions.forEach((expr, index) => {
        if (expr.trim()) {
          const validation = validate2DExpression(expr);
          if (validation.valid) {
            // Expand +- expressions into positive and negative versions
            const expanded = expandPlusMinusExpr(expr);
            expanded.forEach((expandedExpr, subIndex) => {
              validExpressions.push({
                expression: expandedExpr,
                originalIndex: expanded.length > 1 ? index * 2 + subIndex : index
              });
            });
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
      setExpressions(expressions.filter((_, i) => i !== index));
    }
  };

  const handleYRangeChange = useCallback((yMin: number, yMax: number) => {
    setYRange([yMin, yMax]);
  }, []);

  // Generate share URL
  const getShareUrl = () => {
    const validExpressions = activeExpressions.map(e => e.expression).filter(e => e.trim());
    if (validExpressions.length === 0) return '';

    const params = new URLSearchParams({
      eq: validExpressions.join('|'),
      xr: `${xRange[0]},${xRange[1]}`,
      yr: `${yRange[0]},${yRange[1]}`,
    });

    return `${window.location.origin}/2d-grapher?${params.toString()}`;
  };

  const handleShare = async () => {
    const url = getShareUrl();
    if (url) {
      await navigator.clipboard.writeText(url);
    }
  };

  // Example equations for 2D
  const examples = [
    { name: 'Sine Wave', expr: 'sin(x)' },
    { name: 'Parabola', expr: 'x^2' },
    { name: 'Cubic', expr: 'x^3 - 3x' },
    { name: 'Exponential', expr: 'exp(-x^2)' },
    { name: 'Absolute Value', expr: 'abs(x)' },
    { name: 'Tangent', expr: 'tan(x)' },
  ];

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
          <h1 className="text-lg font-semibold text-white">2D Grapher</h1>
          <div className="w-16" />
        </div>
      </header>

      {/* Main content */}
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
                const validation = expr.trim() ? validate2DExpression(expr) : { valid: true };
                const color = getFunctionColor(index);

                return (
                  <div key={index} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <div className="flex-1 relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono">y=</span>
                        <input
                          type="text"
                          value={expr}
                          onChange={(e) => handleExpressionChange(index, e.target.value)}
                          placeholder="sin(x)"
                          className={`w-full pl-7 pr-2 py-1.5 bg-slate-800 border rounded text-white font-mono text-sm placeholder-slate-600 ${
                            !validation.valid ? 'border-red-500' : 'border-slate-700'
                          }`}
                        />
                      </div>
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
                    {!validation.valid && validation.error && (
                      <div className="ml-5 text-xs text-red-400">{validation.error}</div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Live preview */}
            {activeExpressions.length > 0 && (
              <div className="mt-3 p-2 bg-slate-800/50 rounded">
                {activeExpressions.map(({ expression, originalIndex }) => (
                  <div key={originalIndex} className="flex items-center gap-2 text-sm">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: getFunctionColor(originalIndex) }}
                    />
                    <InlineMath math={`y = ${expressionToLatex(expression)}`} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Example Equations */}
          <div className="p-4 border-b border-slate-800">
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">Examples</h3>
            <div className="grid grid-cols-2 gap-2">
              {examples.map((ex) => (
                <button
                  key={ex.name}
                  onClick={() => setExpressions([ex.expr])}
                  className="text-left px-2 py-1.5 bg-slate-800/50 hover:bg-slate-700/50 rounded text-xs text-slate-300 border border-slate-700/50 hover:border-slate-600 transition-colors"
                >
                  <div className="font-medium">{ex.name}</div>
                  <div className="text-slate-500 font-mono">y = {ex.expr}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Range Controls */}
          <div className="p-4 border-b border-slate-800">
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">Range</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">X Range</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={xRange[0]}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) setXRange([val, xRange[1]]);
                    }}
                    className="w-20 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white font-mono text-sm text-center"
                  />
                  <span className="text-slate-500">to</span>
                  <input
                    type="text"
                    value={xRange[1]}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) setXRange([xRange[0], val]);
                    }}
                    className="w-20 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white font-mono text-sm text-center"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Y Range</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={yRange[0]}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) setYRange([val, yRange[1]]);
                    }}
                    className="w-20 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white font-mono text-sm text-center"
                  />
                  <span className="text-slate-500">to</span>
                  <input
                    type="text"
                    value={yRange[1]}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) setYRange([yRange[0], val]);
                    }}
                    className="w-20 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white font-mono text-sm text-center"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Share */}
          <div className="p-4 border-b border-slate-800">
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">Share</h3>
            <button
              onClick={handleShare}
              disabled={activeExpressions.length === 0}
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
                            y = {e}
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

          {/* Tips */}
          <div className="mt-auto p-4 border-t border-slate-800">
            <p className="text-xs text-slate-500 mb-2">
              Plot multiple functions to compare. Use notation like x^2, sin(x), exp(-x), sqrt(x)
            </p>
            <p className="text-xs text-slate-600">
              <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400">Enter</kbd> graph &middot; <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400">Esc</kbd> clear &middot; <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400">F</kbd> fullscreen
            </p>
          </div>
        </div>

        {/* Right Panel - Graph */}
        <div className="flex-1 p-4 min-w-0 relative">
          <div className="w-full h-full rounded-xl overflow-hidden shadow-2xl bg-slate-900">
            <Graph2D
              expressions={activeExpressions}
              xRange={xRange}
              yRange={yRange}
              onYRangeChange={handleYRangeChange}
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
      <Graph2DPage />
    </Suspense>
  );
}
