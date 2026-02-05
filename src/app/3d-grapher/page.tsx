'use client';

import { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import RangeControls from '@/components/RangeControls';
import { getFunctionColor } from '@/lib/graphing/colors';
import { validateExpression, generateIntersectionEquation, createEvaluator, getPartialDerivatives, expressionUsesTime, parametricExpressionUsesTime } from '@/lib/mathParser';
import { IntegrationResult, calculateVolumeWithFillDirections, FillDirection, SurfaceConstraint } from '@/lib/integration';
import { validateParametricExpression } from '@/lib/mathParser';
import { ParametricInput, SpaceCurveInput, ImplicitSurfaceInput, VectorFieldInput } from '@/components/Graph3D';
import { validateCurveExpression } from '@/lib/graphing/spaceCurve';
import { validateImplicitExpression } from '@/lib/graphing/implicitSurface';
import { validateVectorFieldExpression } from '@/lib/graphing/vectorField';
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

type GraphMode = 'explicit' | 'parametric' | 'curve' | 'implicit' | 'vector';

interface ParametricExample {
  name: string;
  description: string;
  x: string;
  y: string;
  z: string;
  uRange: [number, number];
  vRange: [number, number];
}

const PARAMETRIC_EXAMPLES: ParametricExample[] = [
  {
    name: 'Sphere',
    description: 'Unit sphere',
    x: 'sin(u) * cos(v)',
    y: 'sin(u) * sin(v)',
    z: 'cos(u)',
    uRange: [0, 3.14159],
    vRange: [0, 6.28318],
  },
  {
    name: 'Torus',
    description: 'Donut shape (R=2, r=0.7)',
    x: '(2 + 0.7*cos(v)) * cos(u)',
    y: '(2 + 0.7*cos(v)) * sin(u)',
    z: '0.7 * sin(v)',
    uRange: [0, 6.28318],
    vRange: [0, 6.28318],
  },
  {
    name: 'Möbius Strip',
    description: 'One-sided surface',
    x: '(1 + v/2 * cos(u/2)) * cos(u)',
    y: '(1 + v/2 * cos(u/2)) * sin(u)',
    z: 'v/2 * sin(u/2)',
    uRange: [0, 6.28318],
    vRange: [-0.4, 0.4],
  },
  {
    name: 'Helicoid',
    description: 'Spiral ramp',
    x: 'u * cos(v)',
    y: 'u * sin(v)',
    z: 'v',
    uRange: [-1, 1],
    vRange: [0, 6.28318],
  },
  {
    name: 'Klein Bottle',
    description: 'Non-orientable surface',
    x: '(2 + cos(u/2)*sin(v) - sin(u/2)*sin(2*v)) * cos(u)',
    y: '(2 + cos(u/2)*sin(v) - sin(u/2)*sin(2*v)) * sin(u)',
    z: 'sin(u/2)*sin(v) + cos(u/2)*sin(2*v)',
    uRange: [0, 6.28318],
    vRange: [0, 6.28318],
  },
  {
    name: 'Trefoil Knot',
    description: 'Tube around trefoil curve',
    x: 'sin(u) + 2*sin(2*u) + 0.3*cos(v)*sin(u)*(2+cos(2*u))',
    y: 'cos(u) - 2*cos(2*u) + 0.3*cos(v)*cos(u)*(2+cos(2*u))',
    z: '-sin(3*u) + 0.3*sin(v)',
    uRange: [0, 6.28318],
    vRange: [0, 6.28318],
  },
  {
    name: 'Cylinder',
    description: 'Open cylinder',
    x: 'cos(u)',
    y: 'sin(u)',
    z: 'v',
    uRange: [0, 6.28318],
    vRange: [-2, 2],
  },
  {
    name: 'Cone',
    description: 'Parametric cone',
    x: 'v * cos(u)',
    y: 'v * sin(u)',
    z: 'v',
    uRange: [0, 6.28318],
    vRange: [0, 2],
  },
  {
    name: 'Figure-8',
    description: 'Figure-eight immersion',
    x: '(2 + cos(u/2)*sin(v) - sin(u/2)*sin(2*v)) * cos(u)',
    y: '(2 + cos(u/2)*sin(v) - sin(u/2)*sin(2*v)) * sin(u)',
    z: 'sin(u/2)*sin(v) + cos(u/2)*sin(2*v)',
    uRange: [0, 6.28318],
    vRange: [0, 6.28318],
  },
  {
    name: 'Spring',
    description: 'Helical tube',
    x: '(1 + 0.3*cos(v))*cos(u)',
    y: '(1 + 0.3*cos(v))*sin(u)',
    z: '0.3*sin(v) + u/3',
    uRange: [0, 18.85],
    vRange: [0, 6.28318],
  },
];

// Animated explicit examples that use 't' for time
interface AnimatedExample {
  name: string;
  description: string;
  expression: string;
}

const ANIMATED_EXAMPLES: AnimatedExample[] = [
  {
    name: 'Traveling Wave',
    description: 'Wave propagating across the surface',
    expression: 'sin(x - t) * cos(y - t)',
  },
  {
    name: 'Ripple',
    description: 'Expanding circular ripple',
    expression: 'sin(sqrt(x^2 + y^2) - 2t) / (1 + sqrt(x^2 + y^2)/5)',
  },
  {
    name: 'Breathing',
    description: 'Surface that breathes in and out',
    expression: '(x^2 + y^2) * (0.5 + 0.5*sin(t))',
  },
  {
    name: 'Rotating Saddle',
    description: 'Hyperbolic paraboloid that rotates',
    expression: '(x*cos(t) - y*sin(t))^2 - (x*sin(t) + y*cos(t))^2',
  },
  {
    name: 'Ocean',
    description: 'Multi-frequency ocean waves',
    expression: 'sin(x - t) + 0.5*sin(2y + 1.5t) + 0.3*cos(3x + 2y - 2t)',
  },
  {
    name: 'Pulse',
    description: 'Gaussian pulse that expands',
    expression: '3*exp(-((x-sin(t)*2)^2 + (y-cos(t)*2)^2))',
  },
];

// Animated parametric examples
interface AnimatedParametricExample {
  name: string;
  description: string;
  x: string;
  y: string;
  z: string;
  uRange: [number, number];
  vRange: [number, number];
}

const ANIMATED_PARAMETRIC_EXAMPLES: AnimatedParametricExample[] = [
  {
    name: 'Breathing Sphere',
    description: 'Sphere that pulses',
    x: '(1 + 0.3*sin(3*u + t)*sin(3*v + t)) * sin(u) * cos(v)',
    y: '(1 + 0.3*sin(3*u + t)*sin(3*v + t)) * sin(u) * sin(v)',
    z: '(1 + 0.3*sin(3*u + t)*sin(3*v + t)) * cos(u)',
    uRange: [0, 3.14159],
    vRange: [0, 6.28318],
  },
  {
    name: 'Spinning Torus',
    description: 'Torus with rotating bumps',
    x: '(2 + (0.7 + 0.2*sin(3*v + t))*cos(v)) * cos(u)',
    y: '(2 + (0.7 + 0.2*sin(3*v + t))*cos(v)) * sin(u)',
    z: '(0.7 + 0.2*sin(3*v + t)) * sin(v)',
    uRange: [0, 6.28318],
    vRange: [0, 6.28318],
  },
  {
    name: 'Morphing Shape',
    description: 'Sphere morphing to a star',
    x: '(1 + 0.5*sin(5*u)*sin(t)^2) * sin(u) * cos(v)',
    y: '(1 + 0.5*sin(5*u)*sin(t)^2) * sin(u) * sin(v)',
    z: '(1 + 0.5*sin(5*v)*sin(t)^2) * cos(u)',
    uRange: [0, 3.14159],
    vRange: [0, 6.28318],
  },
];

// Space curve examples
interface CurveExample {
  name: string;
  description: string;
  x: string;
  y: string;
  z: string;
  tRange: [number, number];
}

const CURVE_EXAMPLES: CurveExample[] = [
  {
    name: 'Helix',
    description: 'Circular helix spiraling upward',
    x: 'cos(t)',
    y: 'sin(t)',
    z: 't / 3',
    tRange: [0, 18.85],
  },
  {
    name: 'Trefoil Knot',
    description: 'A trefoil knot in 3D space',
    x: 'sin(t) + 2sin(2t)',
    y: 'cos(t) - 2cos(2t)',
    z: '-sin(3t)',
    tRange: [0, 6.28318],
  },
  {
    name: 'Torus Knot',
    description: '(3,2) torus knot',
    x: '(2 + cos(3t)) * cos(2t)',
    y: '(2 + cos(3t)) * sin(2t)',
    z: 'sin(3t)',
    tRange: [0, 6.28318],
  },
  {
    name: 'Viviani Curve',
    description: 'Intersection of sphere and cylinder',
    x: '1 + cos(t)',
    y: 'sin(t)',
    z: '2sin(t/2)',
    tRange: [0, 12.566],
  },
  {
    name: 'Lissajous 3D',
    description: 'Lissajous figure in 3D',
    x: 'sin(2t)',
    y: 'sin(3t)',
    z: 'sin(5t)',
    tRange: [0, 6.28318],
  },
  {
    name: 'Conical Spiral',
    description: 'Spiral on a cone',
    x: 't * cos(6t)',
    y: 't * sin(6t)',
    z: 't',
    tRange: [0, 6.28318],
  },
  {
    name: 'Figure Eight',
    description: 'Figure-eight curve in 3D',
    x: 'cos(t)',
    y: 'sin(t) * cos(t)',
    z: 'sin(t)',
    tRange: [0, 6.28318],
  },
  {
    name: 'Spherical Spiral',
    description: 'Spiral wrapping a sphere',
    x: 'cos(t) * cos(t/20)',
    y: 'sin(t) * cos(t/20)',
    z: 'sin(t/20)',
    tRange: [0, 62.83],
  },
];

// Implicit surface examples
interface ImplicitExample {
  name: string;
  description: string;
  expression: string;
  xRange: [number, number];
  yRange: [number, number];
  zRange: [number, number];
}

const IMPLICIT_EXAMPLES: ImplicitExample[] = [
  {
    name: 'Sphere',
    description: 'Unit sphere x² + y² + z² = 1',
    expression: 'x^2 + y^2 + z^2 - 1',
    xRange: [-1.5, 1.5],
    yRange: [-1.5, 1.5],
    zRange: [-1.5, 1.5],
  },
  {
    name: 'Ellipsoid',
    description: 'Stretched sphere',
    expression: 'x^2/4 + y^2/9 + z^2 - 1',
    xRange: [-3, 3],
    yRange: [-4, 4],
    zRange: [-2, 2],
  },
  {
    name: 'Torus',
    description: 'Donut shape',
    expression: '(sqrt(x^2 + y^2) - 2)^2 + z^2 - 0.5',
    xRange: [-4, 4],
    yRange: [-4, 4],
    zRange: [-2, 2],
  },
  {
    name: 'Hyperboloid',
    description: 'One-sheet hyperboloid',
    expression: 'x^2 + y^2 - z^2 - 1',
    xRange: [-3, 3],
    yRange: [-3, 3],
    zRange: [-3, 3],
  },
  {
    name: 'Cone',
    description: 'Double cone',
    expression: 'x^2 + y^2 - z^2',
    xRange: [-3, 3],
    yRange: [-3, 3],
    zRange: [-3, 3],
  },
  {
    name: 'Gyroid',
    description: 'Triply periodic minimal surface',
    expression: 'sin(x)*cos(y) + sin(y)*cos(z) + sin(z)*cos(x)',
    xRange: [-6.28, 6.28],
    yRange: [-6.28, 6.28],
    zRange: [-6.28, 6.28],
  },
  {
    name: 'Genus 2',
    description: 'Surface with 2 holes',
    expression: '2y(y^2 - 3x^2)(1-z^2) + (x^2+y^2)^2 - (9z^2-1)(1-z^2)',
    xRange: [-3, 3],
    yRange: [-3, 3],
    zRange: [-2, 2],
  },
  {
    name: 'Cylinder',
    description: 'Circular cylinder',
    expression: 'x^2 + y^2 - 1',
    xRange: [-2, 2],
    yRange: [-2, 2],
    zRange: [-3, 3],
  },
];

// Vector field examples
interface VectorFieldExample {
  name: string;
  description: string;
  p: string;
  q: string;
  r: string;
  xRange: [number, number];
  yRange: [number, number];
  zRange: [number, number];
  is2D?: boolean;
}

const VECTOR_FIELD_EXAMPLES: VectorFieldExample[] = [
  {
    name: 'Rotation',
    description: 'Counterclockwise rotation field',
    p: '-y',
    q: 'x',
    r: '0',
    xRange: [-3, 3],
    yRange: [-3, 3],
    zRange: [-3, 3],
    is2D: true,
  },
  {
    name: 'Radial',
    description: 'Radial outward field',
    p: 'x',
    q: 'y',
    r: 'z',
    xRange: [-3, 3],
    yRange: [-3, 3],
    zRange: [-3, 3],
  },
  {
    name: 'Gravity',
    description: 'Inverse-square gravitational field',
    p: '-x / (x^2 + y^2 + z^2)^(3/2)',
    q: '-y / (x^2 + y^2 + z^2)^(3/2)',
    r: '-z / (x^2 + y^2 + z^2)^(3/2)',
    xRange: [-3, 3],
    yRange: [-3, 3],
    zRange: [-3, 3],
  },
  {
    name: 'Vortex',
    description: 'Vortex around z-axis',
    p: '-y / (x^2 + y^2)',
    q: 'x / (x^2 + y^2)',
    r: '0.5',
    xRange: [-3, 3],
    yRange: [-3, 3],
    zRange: [-2, 2],
  },
  {
    name: 'Curl Field',
    description: 'Field with non-zero curl',
    p: '-z',
    q: '0',
    r: 'x',
    xRange: [-3, 3],
    yRange: [-3, 3],
    zRange: [-3, 3],
  },
  {
    name: 'Gradient',
    description: 'Gradient of x^2 + y^2 + z^2',
    p: '2x',
    q: '2y',
    r: '2z',
    xRange: [-3, 3],
    yRange: [-3, 3],
    zRange: [-3, 3],
  },
  {
    name: 'Dipole',
    description: 'Magnetic dipole-like field',
    p: '3x*z / (x^2 + y^2 + z^2)^(5/2)',
    q: '3y*z / (x^2 + y^2 + z^2)^(5/2)',
    r: '(3z^2 - (x^2 + y^2 + z^2)) / (x^2 + y^2 + z^2)^(5/2)',
    xRange: [-3, 3],
    yRange: [-3, 3],
    zRange: [-3, 3],
  },
  {
    name: 'Sink/Source',
    description: 'Source at (1,0,0) and sink at (-1,0,0)',
    p: '(x-1)/((x-1)^2+y^2+z^2)^(3/2) - (x+1)/((x+1)^2+y^2+z^2)^(3/2)',
    q: 'y/((x-1)^2+y^2+z^2)^(3/2) - y/((x+1)^2+y^2+z^2)^(3/2)',
    r: 'z/((x-1)^2+y^2+z^2)^(3/2) - z/((x+1)^2+y^2+z^2)^(3/2)',
    xRange: [-4, 4],
    yRange: [-3, 3],
    zRange: [-3, 3],
  },
];

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

  // Parametric mode state
  const [graphMode, setGraphMode] = useState<GraphMode>('explicit');
  const [paramXExpr, setParamXExpr] = useState('sin(u) * cos(v)');
  const [paramYExpr, setParamYExpr] = useState('sin(u) * sin(v)');
  const [paramZExpr, setParamZExpr] = useState('cos(u)');
  const [paramURange, setParamURange] = useState<[number, number]>([0, Math.PI]);
  const [paramVRange, setParamVRange] = useState<[number, number]>([0, 2 * Math.PI]);
  const [activeParametricSurfaces, setActiveParametricSurfaces] = useState<ParametricInput[]>([]);

  // Space curve mode state
  const [curveXExpr, setCurveXExpr] = useState('cos(t)');
  const [curveYExpr, setCurveYExpr] = useState('sin(t)');
  const [curveZExpr, setCurveZExpr] = useState('t / 3');
  const [curveTRange, setCurveTRange] = useState<[number, number]>([0, 6 * Math.PI]);
  const [activeCurves, setActiveCurves] = useState<SpaceCurveInput[]>([]);

  // Implicit surface mode state
  const [implicitExpr, setImplicitExpr] = useState('x^2 + y^2 + z^2 - 1');
  const [implicitXRange, setImplicitXRange] = useState<[number, number]>([-2, 2]);
  const [implicitYRange, setImplicitYRange] = useState<[number, number]>([-2, 2]);
  const [implicitZRange, setImplicitZRange] = useState<[number, number]>([-2, 2]);
  const [activeImplicits, setActiveImplicits] = useState<ImplicitSurfaceInput[]>([]);

  // Vector field mode state
  const [vfPExpr, setVfPExpr] = useState('-y');
  const [vfQExpr, setVfQExpr] = useState('x');
  const [vfRExpr, setVfRExpr] = useState('0');
  const [vfXRange, setVfXRange] = useState<[number, number]>([-3, 3]);
  const [vfYRange, setVfYRange] = useState<[number, number]>([-3, 3]);
  const [vfZRange, setVfZRange] = useState<[number, number]>([-3, 3]);
  const [vfDensity, setVfDensity] = useState(7);
  const [vfNormalize, setVfNormalize] = useState(false);
  const [vfIs2D, setVfIs2D] = useState(false);
  const [activeVectorFields, setActiveVectorFields] = useState<VectorFieldInput[]>([]);

  // Animation state
  const [animationTime, setAnimationTime] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationSpeed, setAnimationSpeed] = useState(1);
  const animationRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  // Detect if any expression uses the time variable 't'
  const usesTime = graphMode === 'explicit'
    ? expressions.some(expr => expr.trim() && expressionUsesTime(expr))
    : (parametricExpressionUsesTime(paramXExpr) ||
       parametricExpressionUsesTime(paramYExpr) ||
       parametricExpressionUsesTime(paramZExpr));

  // Auto-start animation when expressions use 't'
  useEffect(() => {
    if (usesTime && !isAnimating) {
      setIsAnimating(true);
    }
    // Don't auto-stop: let user control pause
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usesTime]);

  // Animation loop
  useEffect(() => {
    if (!isAnimating) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const animate = (timestamp: number) => {
      if (lastFrameTimeRef.current === 0) {
        lastFrameTimeRef.current = timestamp;
      }
      const delta = (timestamp - lastFrameTimeRef.current) / 1000; // seconds
      lastFrameTimeRef.current = timestamp;

      setAnimationTime(prev => prev + delta * animationSpeed);
      animationRef.current = requestAnimationFrame(animate);
    };

    lastFrameTimeRef.current = 0;
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isAnimating, animationSpeed]);

  // Use lower resolution during animation for smooth playback
  // Resolution: 60 for normal, 300 for high (much smoother but slower)
  const resolution = highResolution ? 300 : (isAnimating ? 40 : 60);

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

  // Auto-update parametric surface when parametric expressions change (debounced)
  const paramDebounceRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (graphMode !== 'parametric') {
      setActiveParametricSurfaces([]);
      return;
    }

    if (paramDebounceRef.current) {
      clearTimeout(paramDebounceRef.current);
    }

    paramDebounceRef.current = setTimeout(() => {
      const xValid = paramXExpr.trim() && validateParametricExpression(paramXExpr).valid;
      const yValid = paramYExpr.trim() && validateParametricExpression(paramYExpr).valid;
      const zValid = paramZExpr.trim() && validateParametricExpression(paramZExpr).valid;

      if (xValid && yValid && zValid) {
        setActiveParametricSurfaces([{
          xExpr: paramXExpr,
          yExpr: paramYExpr,
          zExpr: paramZExpr,
          uRange: paramURange,
          vRange: paramVRange,
        }]);
      } else {
        setActiveParametricSurfaces([]);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (paramDebounceRef.current) {
        clearTimeout(paramDebounceRef.current);
      }
    };
  }, [graphMode, paramXExpr, paramYExpr, paramZExpr, paramURange, paramVRange]);

  // Auto-update space curve when expressions change (debounced)
  const curveDebounceRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (graphMode !== 'curve') {
      setActiveCurves([]);
      return;
    }

    if (curveDebounceRef.current) {
      clearTimeout(curveDebounceRef.current);
    }

    curveDebounceRef.current = setTimeout(() => {
      const xValid = curveXExpr.trim() && validateCurveExpression(curveXExpr).valid;
      const yValid = curveYExpr.trim() && validateCurveExpression(curveYExpr).valid;
      const zValid = curveZExpr.trim() && validateCurveExpression(curveZExpr).valid;

      if (xValid && yValid && zValid) {
        setActiveCurves([{
          xExpr: curveXExpr,
          yExpr: curveYExpr,
          zExpr: curveZExpr,
          tRange: curveTRange,
          tubeRadius: 1,
        }]);
      } else {
        setActiveCurves([]);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (curveDebounceRef.current) {
        clearTimeout(curveDebounceRef.current);
      }
    };
  }, [graphMode, curveXExpr, curveYExpr, curveZExpr, curveTRange]);

  // Auto-update implicit surface when expression changes (debounced)
  const implicitDebounceRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (graphMode !== 'implicit') {
      setActiveImplicits([]);
      return;
    }

    if (implicitDebounceRef.current) {
      clearTimeout(implicitDebounceRef.current);
    }

    implicitDebounceRef.current = setTimeout(() => {
      if (implicitExpr.trim() && validateImplicitExpression(implicitExpr).valid) {
        setActiveImplicits([{
          expression: implicitExpr,
          xRange: implicitXRange,
          yRange: implicitYRange,
          zRange: implicitZRange,
        }]);
      } else {
        setActiveImplicits([]);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (implicitDebounceRef.current) {
        clearTimeout(implicitDebounceRef.current);
      }
    };
  }, [graphMode, implicitExpr, implicitXRange, implicitYRange, implicitZRange]);

  // Auto-update vector field when expressions change (debounced)
  const vfDebounceRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (graphMode !== 'vector') {
      setActiveVectorFields([]);
      return;
    }

    if (vfDebounceRef.current) {
      clearTimeout(vfDebounceRef.current);
    }

    vfDebounceRef.current = setTimeout(() => {
      const pValid = vfPExpr.trim() && validateVectorFieldExpression(vfPExpr).valid;
      const qValid = vfQExpr.trim() && validateVectorFieldExpression(vfQExpr).valid;
      const rValid = vfRExpr.trim() && validateVectorFieldExpression(vfRExpr).valid;

      if (pValid && qValid && rValid) {
        setActiveVectorFields([{
          pExpr: vfPExpr,
          qExpr: vfQExpr,
          rExpr: vfRExpr,
          xRange: vfXRange,
          yRange: vfYRange,
          zRange: vfZRange,
          density: vfDensity,
          normalize: vfNormalize,
          is2D: vfIs2D,
        }]);
      } else {
        setActiveVectorFields([]);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (vfDebounceRef.current) {
        clearTimeout(vfDebounceRef.current);
      }
    };
  }, [graphMode, vfPExpr, vfQExpr, vfRExpr, vfXRange, vfYRange, vfZRange, vfDensity, vfNormalize, vfIs2D]);

  const loadVectorFieldExample = (example: VectorFieldExample) => {
    setVfPExpr(example.p);
    setVfQExpr(example.q);
    setVfRExpr(example.r);
    setVfXRange(example.xRange);
    setVfYRange(example.yRange);
    setVfZRange(example.zRange);
    setVfIs2D(example.is2D ?? false);
  };

  const loadCurveExample = (example: CurveExample) => {
    setCurveXExpr(example.x);
    setCurveYExpr(example.y);
    setCurveZExpr(example.z);
    setCurveTRange(example.tRange);
  };

  const loadImplicitExample = (example: ImplicitExample) => {
    setImplicitExpr(example.expression);
    setImplicitXRange(example.xRange);
    setImplicitYRange(example.yRange);
    setImplicitZRange(example.zRange);
  };

  const loadParametricExample = (example: ParametricExample) => {
    setParamXExpr(example.x);
    setParamYExpr(example.y);
    setParamZExpr(example.z);
    setParamURange(example.uRange);
    setParamVRange(example.vRange);
  };

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

          {/* Mode Toggle */}
          <div className="p-4 border-b border-slate-800">
            <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setGraphMode('explicit')}
                className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                  graphMode === 'explicit'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                z=f(x,y)
              </button>
              <button
                onClick={() => setGraphMode('parametric')}
                className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                  graphMode === 'parametric'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                Parametric
              </button>
              <button
                onClick={() => setGraphMode('curve')}
                className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                  graphMode === 'curve'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                Curve
              </button>
              <button
                onClick={() => setGraphMode('implicit')}
                className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                  graphMode === 'implicit'
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                Implicit
              </button>
              <button
                onClick={() => setGraphMode('vector')}
                className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                  graphMode === 'vector'
                    ? 'bg-amber-600 text-white'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                Vector
              </button>
            </div>
          </div>

          {/* Explicit mode: Multi-Equation Input */}
          {graphMode === 'explicit' && (
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
          )}

          {/* Animated Examples (explicit mode) */}
          {graphMode === 'explicit' && (
          <div className="p-4 border-b border-slate-800">
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
              Animated Examples <span className="text-blue-400 normal-case">(use t for time)</span>
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {ANIMATED_EXAMPLES.map((example) => (
                <button
                  key={example.name}
                  onClick={() => {
                    setExpressions([example.expression]);
                    setAnimationTime(0);
                  }}
                  className="px-2.5 py-1 text-xs bg-blue-900/40 hover:bg-blue-800/50 text-blue-300 rounded-md transition-colors border border-blue-700/40 hover:border-blue-600/50"
                  title={example.description}
                >
                  {example.name}
                </button>
              ))}
            </div>
          </div>
          )}

          {/* Parametric mode */}
          {graphMode === 'parametric' && (
          <div className="p-4 border-b border-slate-800">
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">
              Parametric Surface (u, v)
            </h3>

            <div className="space-y-2">
              {/* x(u,v) */}
              <div className="flex items-center gap-2">
                <span className="text-red-400 text-xs font-mono w-6 text-right flex-shrink-0">x =</span>
                <input
                  type="text"
                  value={paramXExpr}
                  onChange={(e) => setParamXExpr(e.target.value)}
                  placeholder="sin(u) * cos(v)"
                  className={`flex-1 px-2 py-1.5 bg-slate-800 border rounded text-white font-mono text-sm placeholder-slate-600 ${
                    paramXExpr.trim() && !validateParametricExpression(paramXExpr).valid ? 'border-red-500' : 'border-slate-700'
                  }`}
                />
              </div>
              {/* y(u,v) */}
              <div className="flex items-center gap-2">
                <span className="text-blue-400 text-xs font-mono w-6 text-right flex-shrink-0">y =</span>
                <input
                  type="text"
                  value={paramYExpr}
                  onChange={(e) => setParamYExpr(e.target.value)}
                  placeholder="sin(u) * sin(v)"
                  className={`flex-1 px-2 py-1.5 bg-slate-800 border rounded text-white font-mono text-sm placeholder-slate-600 ${
                    paramYExpr.trim() && !validateParametricExpression(paramYExpr).valid ? 'border-red-500' : 'border-slate-700'
                  }`}
                />
              </div>
              {/* z(u,v) */}
              <div className="flex items-center gap-2">
                <span className="text-green-400 text-xs font-mono w-6 text-right flex-shrink-0">z =</span>
                <input
                  type="text"
                  value={paramZExpr}
                  onChange={(e) => setParamZExpr(e.target.value)}
                  placeholder="cos(u)"
                  className={`flex-1 px-2 py-1.5 bg-slate-800 border rounded text-white font-mono text-sm placeholder-slate-600 ${
                    paramZExpr.trim() && !validateParametricExpression(paramZExpr).valid ? 'border-red-500' : 'border-slate-700'
                  }`}
                />
              </div>
            </div>

            {/* Parameter ranges */}
            <div className="mt-4 space-y-3">
              <h4 className="text-xs text-slate-500">Parameter Ranges</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-mono w-6 text-right flex-shrink-0">u:</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={paramURange[0].toFixed(paramURange[0] === Math.round(paramURange[0]) ? 0 : 5)}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) setParamURange([v, paramURange[1]]);
                    }}
                    className="w-16 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono text-center"
                  />
                  <span className="text-slate-500 text-xs">to</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={paramURange[1].toFixed(paramURange[1] === Math.round(paramURange[1]) ? 0 : 5)}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) setParamURange([paramURange[0], v]);
                    }}
                    className="w-16 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono text-center"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-mono w-6 text-right flex-shrink-0">v:</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={paramVRange[0].toFixed(paramVRange[0] === Math.round(paramVRange[0]) ? 0 : 5)}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) setParamVRange([v, paramVRange[1]]);
                    }}
                    className="w-16 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono text-center"
                  />
                  <span className="text-slate-500 text-xs">to</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={paramVRange[1].toFixed(paramVRange[1] === Math.round(paramVRange[1]) ? 0 : 5)}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) setParamVRange([paramVRange[0], v]);
                    }}
                    className="w-16 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono text-center"
                  />
                </div>
              </div>
              {/* Quick range buttons */}
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => { setParamURange([0, Math.PI]); setParamVRange([0, 2 * Math.PI]); }}
                  className="text-[10px] px-1.5 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-400 rounded"
                >
                  [0,π]×[0,2π]
                </button>
                <button
                  onClick={() => { setParamURange([0, 2 * Math.PI]); setParamVRange([0, 2 * Math.PI]); }}
                  className="text-[10px] px-1.5 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-400 rounded"
                >
                  [0,2π]×[0,2π]
                </button>
                <button
                  onClick={() => { setParamURange([-Math.PI, Math.PI]); setParamVRange([-Math.PI, Math.PI]); }}
                  className="text-[10px] px-1.5 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-400 rounded"
                >
                  [-π,π]×[-π,π]
                </button>
                <button
                  onClick={() => { setParamURange([-2, 2]); setParamVRange([-2, 2]); }}
                  className="text-[10px] px-1.5 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-400 rounded"
                >
                  [-2,2]×[-2,2]
                </button>
              </div>
            </div>

            {/* Parametric Examples */}
            <div className="mt-4">
              <h4 className="text-xs text-slate-500 mb-2">Examples</h4>
              <div className="flex flex-wrap gap-1.5">
                {PARAMETRIC_EXAMPLES.map((example) => (
                  <button
                    key={example.name}
                    onClick={() => loadParametricExample(example)}
                    className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition-colors border border-slate-700 hover:border-slate-600"
                    title={example.description}
                  >
                    {example.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Animated Parametric Examples */}
            <div className="mt-3">
              <h4 className="text-xs text-slate-500 mb-2">Animated <span className="text-blue-400">(use t)</span></h4>
              <div className="flex flex-wrap gap-1.5">
                {ANIMATED_PARAMETRIC_EXAMPLES.map((example) => (
                  <button
                    key={example.name}
                    onClick={() => {
                      setParamXExpr(example.x);
                      setParamYExpr(example.y);
                      setParamZExpr(example.z);
                      setParamURange(example.uRange);
                      setParamVRange(example.vRange);
                      setAnimationTime(0);
                    }}
                    className="px-2.5 py-1 text-xs bg-blue-900/40 hover:bg-blue-800/50 text-blue-300 rounded-md transition-colors border border-blue-700/40 hover:border-blue-600/50"
                    title={example.description}
                  >
                    {example.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
          )}

          {/* Space Curve mode */}
          {graphMode === 'curve' && (
          <div className="p-4 border-b border-slate-800">
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">
              Space Curve r(t) = &lt;x(t), y(t), z(t)&gt;
            </h3>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-red-400 text-xs font-mono w-10 text-right flex-shrink-0">x(t) =</span>
                <input
                  type="text"
                  value={curveXExpr}
                  onChange={(e) => setCurveXExpr(e.target.value)}
                  placeholder="cos(t)"
                  className={`flex-1 px-2 py-1.5 bg-slate-800 border rounded text-white font-mono text-sm placeholder-slate-600 ${
                    curveXExpr.trim() && !validateCurveExpression(curveXExpr).valid ? 'border-red-500' : 'border-slate-700'
                  }`}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-blue-400 text-xs font-mono w-10 text-right flex-shrink-0">y(t) =</span>
                <input
                  type="text"
                  value={curveYExpr}
                  onChange={(e) => setCurveYExpr(e.target.value)}
                  placeholder="sin(t)"
                  className={`flex-1 px-2 py-1.5 bg-slate-800 border rounded text-white font-mono text-sm placeholder-slate-600 ${
                    curveYExpr.trim() && !validateCurveExpression(curveYExpr).valid ? 'border-red-500' : 'border-slate-700'
                  }`}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-400 text-xs font-mono w-10 text-right flex-shrink-0">z(t) =</span>
                <input
                  type="text"
                  value={curveZExpr}
                  onChange={(e) => setCurveZExpr(e.target.value)}
                  placeholder="t / 3"
                  className={`flex-1 px-2 py-1.5 bg-slate-800 border rounded text-white font-mono text-sm placeholder-slate-600 ${
                    curveZExpr.trim() && !validateCurveExpression(curveZExpr).valid ? 'border-red-500' : 'border-slate-700'
                  }`}
                />
              </div>
            </div>

            {/* t range */}
            <div className="mt-4 space-y-2">
              <h4 className="text-xs text-slate-500">Parameter Range</h4>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-mono w-6 text-right flex-shrink-0">t:</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={curveTRange[0].toFixed(curveTRange[0] === Math.round(curveTRange[0]) ? 0 : 5)}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) setCurveTRange([v, curveTRange[1]]);
                  }}
                  className="w-16 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono text-center"
                />
                <span className="text-slate-500 text-xs">to</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={curveTRange[1].toFixed(curveTRange[1] === Math.round(curveTRange[1]) ? 0 : 5)}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) setCurveTRange([curveTRange[0], v]);
                  }}
                  className="w-16 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono text-center"
                />
              </div>
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => setCurveTRange([0, 2 * Math.PI])}
                  className="text-[10px] px-1.5 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-400 rounded"
                >
                  [0, 2π]
                </button>
                <button
                  onClick={() => setCurveTRange([0, 4 * Math.PI])}
                  className="text-[10px] px-1.5 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-400 rounded"
                >
                  [0, 4π]
                </button>
                <button
                  onClick={() => setCurveTRange([0, 6 * Math.PI])}
                  className="text-[10px] px-1.5 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-400 rounded"
                >
                  [0, 6π]
                </button>
                <button
                  onClick={() => setCurveTRange([-Math.PI, Math.PI])}
                  className="text-[10px] px-1.5 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-400 rounded"
                >
                  [-π, π]
                </button>
                <button
                  onClick={() => setCurveTRange([0, 10])}
                  className="text-[10px] px-1.5 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-400 rounded"
                >
                  [0, 10]
                </button>
              </div>
            </div>

            {/* Curve Examples */}
            <div className="mt-4">
              <h4 className="text-xs text-slate-500 mb-2">Examples</h4>
              <div className="flex flex-wrap gap-1.5">
                {CURVE_EXAMPLES.map((example) => (
                  <button
                    key={example.name}
                    onClick={() => loadCurveExample(example)}
                    className="px-2.5 py-1 text-xs bg-emerald-900/40 hover:bg-emerald-800/50 text-emerald-300 rounded-md transition-colors border border-emerald-700/40 hover:border-emerald-600/50"
                    title={example.description}
                  >
                    {example.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
          )}

          {/* Implicit Surface mode */}
          {graphMode === 'implicit' && (
          <div className="p-4 border-b border-slate-800">
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">
              Implicit Surface F(x,y,z) = 0
            </h3>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-purple-400 text-xs font-mono flex-shrink-0">F =</span>
                <input
                  type="text"
                  value={implicitExpr}
                  onChange={(e) => setImplicitExpr(e.target.value)}
                  placeholder="x^2 + y^2 + z^2 - 1"
                  className={`flex-1 px-2 py-1.5 bg-slate-800 border rounded text-white font-mono text-sm placeholder-slate-600 ${
                    implicitExpr.trim() && !validateImplicitExpression(implicitExpr).valid ? 'border-red-500' : 'border-slate-700'
                  }`}
                />
              </div>
              <div className="text-[10px] text-slate-500">
                Surface is rendered where F(x,y,z) = 0
              </div>
            </div>

            {/* Ranges */}
            <div className="mt-4 space-y-2">
              <h4 className="text-xs text-slate-500">Bounds</h4>
              {/* x range */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-400 font-mono w-4 text-right flex-shrink-0">x:</span>
                <input type="text" inputMode="numeric"
                  value={implicitXRange[0]}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setImplicitXRange([v, implicitXRange[1]]); }}
                  className="w-14 px-1.5 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono text-center"
                />
                <span className="text-slate-500 text-[10px]">to</span>
                <input type="text" inputMode="numeric"
                  value={implicitXRange[1]}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setImplicitXRange([implicitXRange[0], v]); }}
                  className="w-14 px-1.5 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono text-center"
                />
              </div>
              {/* y range */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-blue-400 font-mono w-4 text-right flex-shrink-0">y:</span>
                <input type="text" inputMode="numeric"
                  value={implicitYRange[0]}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setImplicitYRange([v, implicitYRange[1]]); }}
                  className="w-14 px-1.5 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono text-center"
                />
                <span className="text-slate-500 text-[10px]">to</span>
                <input type="text" inputMode="numeric"
                  value={implicitYRange[1]}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setImplicitYRange([implicitYRange[0], v]); }}
                  className="w-14 px-1.5 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono text-center"
                />
              </div>
              {/* z range */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-green-400 font-mono w-4 text-right flex-shrink-0">z:</span>
                <input type="text" inputMode="numeric"
                  value={implicitZRange[0]}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setImplicitZRange([v, implicitZRange[1]]); }}
                  className="w-14 px-1.5 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono text-center"
                />
                <span className="text-slate-500 text-[10px]">to</span>
                <input type="text" inputMode="numeric"
                  value={implicitZRange[1]}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setImplicitZRange([implicitZRange[0], v]); }}
                  className="w-14 px-1.5 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono text-center"
                />
              </div>
            </div>

            {/* Implicit Examples */}
            <div className="mt-4">
              <h4 className="text-xs text-slate-500 mb-2">Examples</h4>
              <div className="flex flex-wrap gap-1.5">
                {IMPLICIT_EXAMPLES.map((example) => (
                  <button
                    key={example.name}
                    onClick={() => loadImplicitExample(example)}
                    className="px-2.5 py-1 text-xs bg-purple-900/40 hover:bg-purple-800/50 text-purple-300 rounded-md transition-colors border border-purple-700/40 hover:border-purple-600/50"
                    title={example.description}
                  >
                    {example.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
          )}

          {/* Vector Field mode */}
          {graphMode === 'vector' && (
          <div className="p-4 border-b border-slate-800">
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">
              Vector Field F = &lt;P, Q, R&gt;
            </h3>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-red-400 text-xs font-mono w-10 text-right flex-shrink-0">P =</span>
                <input
                  type="text"
                  value={vfPExpr}
                  onChange={(e) => setVfPExpr(e.target.value)}
                  placeholder="-y"
                  className={`flex-1 px-2 py-1.5 bg-slate-800 border rounded text-white font-mono text-sm placeholder-slate-600 ${
                    vfPExpr.trim() && !validateVectorFieldExpression(vfPExpr).valid ? 'border-red-500' : 'border-slate-700'
                  }`}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-blue-400 text-xs font-mono w-10 text-right flex-shrink-0">Q =</span>
                <input
                  type="text"
                  value={vfQExpr}
                  onChange={(e) => setVfQExpr(e.target.value)}
                  placeholder="x"
                  className={`flex-1 px-2 py-1.5 bg-slate-800 border rounded text-white font-mono text-sm placeholder-slate-600 ${
                    vfQExpr.trim() && !validateVectorFieldExpression(vfQExpr).valid ? 'border-red-500' : 'border-slate-700'
                  }`}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-400 text-xs font-mono w-10 text-right flex-shrink-0">R =</span>
                <input
                  type="text"
                  value={vfRExpr}
                  onChange={(e) => setVfRExpr(e.target.value)}
                  placeholder="0"
                  className={`flex-1 px-2 py-1.5 bg-slate-800 border rounded text-white font-mono text-sm placeholder-slate-600 ${
                    vfRExpr.trim() && !validateVectorFieldExpression(vfRExpr).valid ? 'border-red-500' : 'border-slate-700'
                  }`}
                />
              </div>
              <div className="text-[10px] text-slate-500">
                F(x,y,z) = P(x,y,z)<span className="text-red-400">i</span> + Q(x,y,z)<span className="text-blue-400">j</span> + R(x,y,z)<span className="text-green-400">k</span>
              </div>
            </div>

            {/* Bounds */}
            <div className="mt-4 space-y-2">
              <h4 className="text-xs text-slate-500">Bounds</h4>
              {/* x range */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-400 font-mono w-4 text-right flex-shrink-0">x:</span>
                <input type="text" inputMode="numeric"
                  value={vfXRange[0]}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setVfXRange([v, vfXRange[1]]); }}
                  className="w-14 px-1.5 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono text-center"
                />
                <span className="text-slate-500 text-[10px]">to</span>
                <input type="text" inputMode="numeric"
                  value={vfXRange[1]}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setVfXRange([vfXRange[0], v]); }}
                  className="w-14 px-1.5 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono text-center"
                />
              </div>
              {/* y range */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-blue-400 font-mono w-4 text-right flex-shrink-0">y:</span>
                <input type="text" inputMode="numeric"
                  value={vfYRange[0]}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setVfYRange([v, vfYRange[1]]); }}
                  className="w-14 px-1.5 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono text-center"
                />
                <span className="text-slate-500 text-[10px]">to</span>
                <input type="text" inputMode="numeric"
                  value={vfYRange[1]}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setVfYRange([vfYRange[0], v]); }}
                  className="w-14 px-1.5 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono text-center"
                />
              </div>
              {/* z range */}
              {!vfIs2D && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-green-400 font-mono w-4 text-right flex-shrink-0">z:</span>
                <input type="text" inputMode="numeric"
                  value={vfZRange[0]}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setVfZRange([v, vfZRange[1]]); }}
                  className="w-14 px-1.5 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono text-center"
                />
                <span className="text-slate-500 text-[10px]">to</span>
                <input type="text" inputMode="numeric"
                  value={vfZRange[1]}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setVfZRange([vfZRange[0], v]); }}
                  className="w-14 px-1.5 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-white font-mono text-center"
                />
              </div>
              )}
            </div>

            {/* Options */}
            <div className="mt-4 space-y-3">
              <h4 className="text-xs text-slate-500">Options</h4>

              {/* Density control */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-14 flex-shrink-0">Density:</span>
                <input
                  type="range"
                  min="3"
                  max="12"
                  value={vfDensity}
                  onChange={(e) => setVfDensity(parseInt(e.target.value))}
                  className="flex-1 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <span className="text-xs text-slate-400 font-mono w-6 text-right">{vfDensity}</span>
              </div>

              {/* 2D / 3D toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={vfIs2D}
                  onChange={(e) => setVfIs2D(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500 focus:ring-offset-0"
                />
                <span className="text-sm text-slate-300">2D mode (z=0 plane only)</span>
              </label>

              {/* Normalize toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={vfNormalize}
                  onChange={(e) => setVfNormalize(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500 focus:ring-offset-0"
                />
                <span className="text-sm text-slate-300">Normalize arrows (uniform length)</span>
              </label>
            </div>

            {/* Examples */}
            <div className="mt-4">
              <h4 className="text-xs text-slate-500 mb-2">Examples</h4>
              <div className="flex flex-wrap gap-1.5">
                {VECTOR_FIELD_EXAMPLES.map((example) => (
                  <button
                    key={example.name}
                    onClick={() => loadVectorFieldExample(example)}
                    className="px-2.5 py-1 text-xs bg-amber-900/40 hover:bg-amber-800/50 text-amber-300 rounded-md transition-colors border border-amber-700/40 hover:border-amber-600/50"
                    title={example.description}
                  >
                    {example.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
          )}

          {/* Calculations - Collapsible Sections (explicit mode only) */}
          {graphMode === 'explicit' && (
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
          )}

          {/* Range Controls (explicit mode only) */}
          {graphMode === 'explicit' && (
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
          )}

          {/* Animation Controls - visible when expressions use 't' */}
          {usesTime && (
          <div className="p-4 border-b border-slate-800">
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">
              <span className="inline-flex items-center gap-1.5">
                Animation
                <span className={`inline-block w-2 h-2 rounded-full ${isAnimating ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
              </span>
            </h3>
            <div className="space-y-3">
              {/* Play/Pause + Reset */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsAnimating(!isAnimating)}
                  className={`flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    isAnimating
                      ? 'bg-amber-600 hover:bg-amber-500 text-white'
                      : 'bg-green-600 hover:bg-green-500 text-white'
                  }`}
                >
                  {isAnimating ? (
                    <span className="flex items-center justify-center gap-1">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                      Pause
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-1">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                      Play
                    </span>
                  )}
                </button>
                <button
                  onClick={() => { setAnimationTime(0); }}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-xs transition-colors"
                  title="Reset time to 0"
                >
                  Reset
                </button>
              </div>

              {/* Time display */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-mono">t = {animationTime.toFixed(2)}</span>
                <span className="text-slate-600 font-mono">{animationSpeed}x speed</span>
              </div>

              {/* Time slider (manual scrub) */}
              <div>
                <input
                  type="range"
                  min="0"
                  max={Math.max(20, Math.ceil(animationTime / 10) * 10 + 10)}
                  step="0.05"
                  value={animationTime}
                  onChange={(e) => {
                    const newTime = parseFloat(e.target.value);
                    setAnimationTime(newTime);
                    if (isAnimating) setIsAnimating(false);
                  }}
                  className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              {/* Speed controls */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-500 mr-1">Speed:</span>
                {[0.25, 0.5, 1, 2, 4].map(speed => (
                  <button
                    key={speed}
                    onClick={() => setAnimationSpeed(speed)}
                    className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                      animationSpeed === speed
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>
          </div>
          )}

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
            {graphMode === 'explicit' ? (
              <p className="text-xs text-slate-500 mb-2">
                Use <kbd className="px-1 py-0.5 bg-slate-800 rounded text-slate-400 text-[10px]">t</kbd> for animation. Try: sin(x - t) * cos(y). Also supports x^2, sin(x), cos(y), exp(-x^2)
              </p>
            ) : graphMode === 'vector' ? (
              <p className="text-xs text-slate-500 mb-2">
                Define P, Q, R components of a 3D vector field. Color = magnitude. Supports x, y, z variables.
              </p>
            ) : (
              <p className="text-xs text-slate-500 mb-2">
                Define x(u,v), y(u,v), z(u,v) for parametric surfaces. Use <kbd className="px-1 py-0.5 bg-slate-800 rounded text-slate-400 text-[10px]">t</kbd> for animation.
              </p>
            )}
            <p className="text-xs text-slate-600">
              <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400">Enter</kbd> graph &middot; <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400">Esc</kbd> clear &middot; <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400">F</kbd> fullscreen
            </p>
          </div>
        </div>

        {/* Right Panel - Graph */}
        <div className="flex-1 p-2 md:p-4 min-w-0 relative">
          <div className="w-full h-full rounded-xl overflow-hidden shadow-2xl">
            <Graph3D
              expressions={graphMode === 'explicit' ? activeExpressions : []}
              xRange={xRange}
              yRange={yRange}
              zRange={autoZRange ? undefined : userZRange}
              resolution={resolution}
              showSurfaceGrid={showSurfaceGrid}
              showVolumeVisualization={graphMode === 'explicit' && volumeMode}
              volumeFillDirections={volumeFillDirections}
              parametricSurfaces={graphMode === 'parametric' ? activeParametricSurfaces : []}
              spaceCurves={graphMode === 'curve' ? activeCurves : []}
              implicitSurfaces={graphMode === 'implicit' ? activeImplicits : []}
              vectorFields={graphMode === 'vector' ? activeVectorFields : []}
              time={usesTime ? animationTime : undefined}
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
