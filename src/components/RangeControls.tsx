'use client';

interface RangeControlsProps {
  xRange: [number, number];
  yRange: [number, number];
  onXRangeChange: (range: [number, number]) => void;
  onYRangeChange: (range: [number, number]) => void;
}

export default function RangeControls({
  xRange,
  yRange,
  onXRangeChange,
  onYRangeChange,
}: RangeControlsProps) {
  const handleMinChange = (
    axis: 'x' | 'y',
    value: string,
    currentRange: [number, number],
    setter: (range: [number, number]) => void
  ) => {
    const num = parseFloat(value);
    if (!isNaN(num) && num < currentRange[1]) {
      setter([num, currentRange[1]]);
    }
  };

  const handleMaxChange = (
    axis: 'x' | 'y',
    value: string,
    currentRange: [number, number],
    setter: (range: [number, number]) => void
  ) => {
    const num = parseFloat(value);
    if (!isNaN(num) && num > currentRange[0]) {
      setter([currentRange[0], num]);
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
            type="number"
            value={xRange[0]}
            onChange={(e) => handleMinChange('x', e.target.value, xRange, onXRangeChange)}
            className="w-16 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono"
          />
          <span className="text-slate-500 text-sm">to</span>
          <input
            type="number"
            value={xRange[1]}
            onChange={(e) => handleMaxChange('x', e.target.value, xRange, onXRangeChange)}
            className="w-16 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono"
          />
        </div>
      </div>

      {/* Y Range */}
      <div className="space-y-2">
        <label className="block text-xs text-slate-500">Y Axis</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={yRange[0]}
            onChange={(e) => handleMinChange('y', e.target.value, yRange, onYRangeChange)}
            className="w-16 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono"
          />
          <span className="text-slate-500 text-sm">to</span>
          <input
            type="number"
            value={yRange[1]}
            onChange={(e) => handleMaxChange('y', e.target.value, yRange, onYRangeChange)}
            className="w-16 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono"
          />
        </div>
      </div>
    </div>
  );
}
