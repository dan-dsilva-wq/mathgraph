'use client';

import { useState, useEffect } from 'react';

interface RangeControlsProps {
  xRange: [number, number];
  yRange: [number, number];
  zRange?: [number, number];
  autoZRange?: boolean;
  onXRangeChange: (range: [number, number]) => void;
  onYRangeChange: (range: [number, number]) => void;
  onZRangeChange?: (range: [number, number]) => void;
  onAutoZRangeChange?: (auto: boolean) => void;
}

export default function RangeControls({
  xRange,
  yRange,
  zRange,
  autoZRange = true,
  onXRangeChange,
  onYRangeChange,
  onZRangeChange,
  onAutoZRangeChange,
}: RangeControlsProps) {
  // Local string state for inputs - allows empty values while typing
  const [xMinStr, setXMinStr] = useState(String(xRange[0]));
  const [xMaxStr, setXMaxStr] = useState(String(xRange[1]));
  const [yMinStr, setYMinStr] = useState(String(yRange[0]));
  const [yMaxStr, setYMaxStr] = useState(String(yRange[1]));
  const [zMinStr, setZMinStr] = useState(zRange ? String(zRange[0]) : '-10');
  const [zMaxStr, setZMaxStr] = useState(zRange ? String(zRange[1]) : '10');

  // Sync local state when props change externally
  useEffect(() => {
    setXMinStr(String(xRange[0]));
    setXMaxStr(String(xRange[1]));
  }, [xRange]);

  useEffect(() => {
    setYMinStr(String(yRange[0]));
    setYMaxStr(String(yRange[1]));
  }, [yRange]);

  useEffect(() => {
    if (zRange) {
      setZMinStr(String(zRange[0]));
      setZMaxStr(String(zRange[1]));
    }
  }, [zRange]);

  const handleBlur = (
    type: 'xMin' | 'xMax' | 'yMin' | 'yMax' | 'zMin' | 'zMax',
    value: string
  ) => {
    const num = parseFloat(value);

    switch (type) {
      case 'xMin':
        if (!isNaN(num) && num < xRange[1]) {
          onXRangeChange([num, xRange[1]]);
        } else {
          setXMinStr(String(xRange[0])); // Reset to valid value
        }
        break;
      case 'xMax':
        if (!isNaN(num) && num > xRange[0]) {
          onXRangeChange([xRange[0], num]);
        } else {
          setXMaxStr(String(xRange[1]));
        }
        break;
      case 'yMin':
        if (!isNaN(num) && num < yRange[1]) {
          onYRangeChange([num, yRange[1]]);
        } else {
          setYMinStr(String(yRange[0]));
        }
        break;
      case 'yMax':
        if (!isNaN(num) && num > yRange[0]) {
          onYRangeChange([yRange[0], num]);
        } else {
          setYMaxStr(String(yRange[1]));
        }
        break;
      case 'zMin':
        if (zRange && onZRangeChange) {
          if (!isNaN(num) && num < zRange[1]) {
            onZRangeChange([num, zRange[1]]);
          } else {
            setZMinStr(String(zRange[0]));
          }
        }
        break;
      case 'zMax':
        if (zRange && onZRangeChange) {
          if (!isNaN(num) && num > zRange[0]) {
            onZRangeChange([zRange[0], num]);
          } else {
            setZMaxStr(String(zRange[1]));
          }
        }
        break;
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent,
    type: 'xMin' | 'xMax' | 'yMin' | 'yMax' | 'zMin' | 'zMax',
    value: string
  ) => {
    if (e.key === 'Enter') {
      handleBlur(type, value);
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide">Axis Ranges</h3>

      {/* X Range */}
      <div className="space-y-2">
        <label className="block text-xs text-slate-500">X Axis</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={xMinStr}
            onChange={(e) => setXMinStr(e.target.value)}
            onBlur={(e) => handleBlur('xMin', e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, 'xMin', xMinStr)}
            className="w-16 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono text-center"
          />
          <span className="text-slate-500 text-sm">to</span>
          <input
            type="text"
            inputMode="numeric"
            value={xMaxStr}
            onChange={(e) => setXMaxStr(e.target.value)}
            onBlur={(e) => handleBlur('xMax', e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, 'xMax', xMaxStr)}
            className="w-16 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono text-center"
          />
        </div>
      </div>

      {/* Y Range */}
      <div className="space-y-2">
        <label className="block text-xs text-slate-500">Y Axis</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={yMinStr}
            onChange={(e) => setYMinStr(e.target.value)}
            onBlur={(e) => handleBlur('yMin', e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, 'yMin', yMinStr)}
            className="w-16 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono text-center"
          />
          <span className="text-slate-500 text-sm">to</span>
          <input
            type="text"
            inputMode="numeric"
            value={yMaxStr}
            onChange={(e) => setYMaxStr(e.target.value)}
            onBlur={(e) => handleBlur('yMax', e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, 'yMax', yMaxStr)}
            className="w-16 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono text-center"
          />
        </div>
      </div>

      {/* Z Range */}
      {zRange && onZRangeChange && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs text-slate-500">Z Axis</label>
            {onAutoZRangeChange && (
              <button
                onClick={() => onAutoZRangeChange(!autoZRange)}
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  autoZRange
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                }`}
              >
                Auto
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={zMinStr}
              onChange={(e) => setZMinStr(e.target.value)}
              onBlur={(e) => handleBlur('zMin', e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, 'zMin', zMinStr)}
              disabled={autoZRange}
              className={`w-16 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono text-center ${
                autoZRange ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            />
            <span className="text-slate-500 text-sm">to</span>
            <input
              type="text"
              inputMode="numeric"
              value={zMaxStr}
              onChange={(e) => setZMaxStr(e.target.value)}
              onBlur={(e) => handleBlur('zMax', e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, 'zMax', zMaxStr)}
              disabled={autoZRange}
              className={`w-16 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono text-center ${
                autoZRange ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
