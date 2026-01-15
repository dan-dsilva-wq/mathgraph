'use client';

import { useState, useEffect } from 'react';
import katex from 'katex';
import { validateExpression } from '@/lib/mathParser';

interface EquationInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

// Convert expression to LaTeX-friendly format
function toLatex(expr: string): string {
  return expr
    .replace(/\*/g, ' \\cdot ')
    .replace(/sqrt/g, '\\sqrt')
    .replace(/\^/g, '^')
    .replace(/pi/g, '\\pi')
    .replace(/exp/g, '\\exp')
    .replace(/sin/g, '\\sin')
    .replace(/cos/g, '\\cos')
    .replace(/tan/g, '\\tan')
    .replace(/log/g, '\\log')
    .replace(/ln/g, '\\ln');
}

export default function EquationInput({ value, onChange, onSubmit }: EquationInputProps) {
  const [renderedLatex, setRenderedLatex] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!value.trim()) {
      setRenderedLatex('');
      setValidationError(null);
      return;
    }

    // Validate expression
    const validation = validateExpression(value);
    if (!validation.valid) {
      setValidationError(validation.error || 'Invalid expression');
    } else {
      setValidationError(null);
    }

    // Render LaTeX
    try {
      const latex = `z = ${toLatex(value)}`;
      const html = katex.renderToString(latex, {
        throwOnError: false,
        displayMode: false,
      });
      setRenderedLatex(html);
    } catch {
      setRenderedLatex('');
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide">
        Equation: z = f(x, y)
      </label>
      <div className="space-y-2">
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-sm">
            z =
          </div>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="x^2 + y^2"
            className={`w-full pl-10 pr-3 py-2 bg-slate-800 border rounded-lg text-white font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-slate-500 ${
              validationError ? 'border-red-500' : 'border-slate-700'
            }`}
          />
        </div>
        <button
          onClick={onSubmit}
          disabled={!!validationError || !value.trim()}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Graph
        </button>
      </div>

      {/* LaTeX Preview */}
      {renderedLatex && !validationError && (
        <div
          className="text-sm text-slate-200 py-2 px-3 bg-slate-800/50 rounded border border-slate-700 [&_.katex]:text-slate-100"
          dangerouslySetInnerHTML={{ __html: renderedLatex }}
        />
      )}

      {/* Error message */}
      {validationError && (
        <p className="text-xs text-red-400">{validationError}</p>
      )}
    </div>
  );
}
