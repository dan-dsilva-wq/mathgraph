'use client';

import { Example } from '@/types';

const examples: Example[] = [
  {
    name: 'Paraboloid',
    expression: 'x^2 + y^2',
    description: 'A 3D parabola (bowl shape)',
  },
  {
    name: 'Saddle',
    expression: 'x^2 - y^2',
    description: 'Hyperbolic paraboloid (saddle shape)',
  },
  {
    name: 'Ripple',
    expression: 'sin(sqrt(x^2 + y^2))',
    description: 'Circular ripple pattern',
  },
  {
    name: 'Wave',
    expression: 'sin(x) * cos(y)',
    description: 'Intersecting sine waves',
  },
  {
    name: 'Gaussian',
    expression: 'exp(-(x^2 + y^2) / 4)',
    description: 'Bell curve in 3D',
  },
  {
    name: 'Cone',
    expression: 'sqrt(x^2 + y^2)',
    description: 'A cone shape',
  },
  {
    name: 'Egg Carton',
    expression: 'sin(x) * sin(y)',
    description: 'Periodic peaks and valleys',
  },
  {
    name: 'Plane',
    expression: 'x + y',
    description: 'A tilted plane',
  },
];

interface ExamplePickerProps {
  onSelect: (expression: string) => void;
}

export default function ExamplePicker({ onSelect }: ExamplePickerProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide">Examples</h3>
      <div className="flex flex-wrap gap-1.5">
        {examples.map((example) => (
          <button
            key={example.name}
            onClick={() => onSelect(example.expression)}
            className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition-colors border border-slate-700 hover:border-slate-600"
            title={example.description}
          >
            {example.name}
          </button>
        ))}
      </div>
    </div>
  );
}
