/**
 * Numerical Integration Module
 * Implements 2D Gaussian quadrature with adaptive refinement for high-accuracy integration.
 */

export interface IntegrationResult {
  value: number;
  error: number;
  isExact: boolean;
  method: 'symbolic' | 'gaussian' | 'adaptive' | 'mesh';
}

// Gauss-Legendre quadrature nodes and weights for different orders
// These are pre-computed values for the interval [-1, 1]

// 5-point Gauss-Legendre
const GL5_NODES = [
  -0.9061798459386640,
  -0.5384693101056831,
  0.0,
  0.5384693101056831,
  0.9061798459386640
];
const GL5_WEIGHTS = [
  0.2369268850561891,
  0.4786286704993665,
  0.5688888888888889,
  0.4786286704993665,
  0.2369268850561891
];

// 10-point Gauss-Legendre
const GL10_NODES = [
  -0.9739065285171717,
  -0.8650633666889845,
  -0.6794095682990244,
  -0.4333953941292472,
  -0.1488743389816312,
  0.1488743389816312,
  0.4333953941292472,
  0.6794095682990244,
  0.8650633666889845,
  0.9739065285171717
];
const GL10_WEIGHTS = [
  0.0666713443086881,
  0.1494513491505806,
  0.2190863625159820,
  0.2692667193099963,
  0.2955242247147529,
  0.2955242247147529,
  0.2692667193099963,
  0.2190863625159820,
  0.1494513491505806,
  0.0666713443086881
];

// 15-point Gauss-Legendre
const GL15_NODES = [
  -0.9879925180204854,
  -0.9372733924007060,
  -0.8482065834104272,
  -0.7244177313601701,
  -0.5709721726085388,
  -0.3941513470775634,
  -0.2011940939974345,
  0.0,
  0.2011940939974345,
  0.3941513470775634,
  0.5709721726085388,
  0.7244177313601701,
  0.8482065834104272,
  0.9372733924007060,
  0.9879925180204854
];
const GL15_WEIGHTS = [
  0.0307532419961173,
  0.0703660474881081,
  0.1071592204671719,
  0.1395706779261543,
  0.1662692058169939,
  0.1861610000155622,
  0.1984314853271116,
  0.2025782419255613,
  0.1984314853271116,
  0.1861610000155622,
  0.1662692058169939,
  0.1395706779261543,
  0.1071592204671719,
  0.0703660474881081,
  0.0307532419961173
];

type Evaluator2D = (x: number, y: number) => number | null;

/**
 * Get quadrature nodes and weights for a given order
 */
function getQuadratureRule(order: 5 | 10 | 15): { nodes: number[]; weights: number[] } {
  switch (order) {
    case 5:
      return { nodes: GL5_NODES, weights: GL5_WEIGHTS };
    case 10:
      return { nodes: GL10_NODES, weights: GL10_WEIGHTS };
    case 15:
      return { nodes: GL15_NODES, weights: GL15_WEIGHTS };
  }
}

/**
 * Transform a value from [-1, 1] to [a, b]
 */
function transformPoint(t: number, a: number, b: number): number {
  return 0.5 * ((b - a) * t + (a + b));
}

/**
 * Basic 2D Gaussian quadrature over a rectangular region
 * Integrates f(x, y) over [xMin, xMax] x [yMin, yMax]
 */
export function integrate2D(
  f: Evaluator2D,
  xRange: [number, number],
  yRange: [number, number],
  order: 5 | 10 | 15 = 10
): number {
  const [xMin, xMax] = xRange;
  const [yMin, yMax] = yRange;
  const { nodes, weights } = getQuadratureRule(order);

  const xScale = (xMax - xMin) / 2;
  const yScale = (yMax - yMin) / 2;

  let sum = 0;
  let validPoints = 0;
  let totalPoints = 0;

  for (let i = 0; i < nodes.length; i++) {
    const x = transformPoint(nodes[i], xMin, xMax);
    const wx = weights[i];

    for (let j = 0; j < nodes.length; j++) {
      const y = transformPoint(nodes[j], yMin, yMax);
      const wy = weights[j];

      totalPoints++;
      const value = f(x, y);
      if (value !== null && isFinite(value)) {
        sum += wx * wy * value;
        validPoints++;
      }
    }
  }

  // If too many points are invalid, the result may be unreliable
  if (validPoints < totalPoints * 0.5) {
    return NaN;
  }

  return sum * xScale * yScale;
}

/**
 * Adaptive 2D Gaussian quadrature with error estimation
 * Subdivides regions where the error is large
 */
export function adaptiveIntegrate2D(
  f: Evaluator2D,
  xRange: [number, number],
  yRange: [number, number],
  tolerance: number = 1e-6,
  maxDepth: number = 10
): IntegrationResult {
  const [xMin, xMax] = xRange;
  const [yMin, yMax] = yRange;

  interface Region {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
    coarseValue: number;
    depth: number;
  }

  // Initial coarse estimate using 5-point rule
  const initialCoarse = integrate2D(f, xRange, yRange, 5);
  // Fine estimate using 15-point rule
  const initialFine = integrate2D(f, xRange, yRange, 15);

  if (isNaN(initialCoarse) || isNaN(initialFine)) {
    // Function has too many undefined points, signal failure with NaN
    // so caller can fall back to mesh method
    return {
      value: NaN,
      error: Infinity,
      isExact: false,
      method: 'mesh'
    };
  }

  // If initial estimates agree well enough, return
  const initialError = Math.abs(initialFine - initialCoarse);
  if (initialError < tolerance) {
    return {
      value: initialFine,
      error: initialError,
      isExact: false,
      method: 'gaussian'
    };
  }

  // Adaptive refinement
  const regions: Region[] = [{
    xMin, xMax, yMin, yMax,
    coarseValue: initialCoarse,
    depth: 0
  }];

  let totalValue = 0;
  let totalError = 0;
  let iterations = 0;
  const maxIterations = 1000; // Prevent infinite loops

  while (regions.length > 0 && iterations < maxIterations) {
    iterations++;
    const region = regions.pop()!;

    // Compute fine value for this region
    const fineValue = integrate2D(f, [region.xMin, region.xMax], [region.yMin, region.yMax], 15);

    if (isNaN(fineValue)) {
      // Skip regions with undefined values
      continue;
    }

    const regionError = Math.abs(fineValue - region.coarseValue);
    const regionArea = (region.xMax - region.xMin) * (region.yMax - region.yMin);
    const totalArea = (xMax - xMin) * (yMax - yMin);
    const localTolerance = tolerance * (regionArea / totalArea);

    if (regionError < localTolerance || region.depth >= maxDepth) {
      // Accept this region
      totalValue += fineValue;
      totalError += regionError;
    } else {
      // Subdivide into 4 regions
      const xMid = (region.xMin + region.xMax) / 2;
      const yMid = (region.yMin + region.yMax) / 2;

      const subRegions = [
        { xMin: region.xMin, xMax: xMid, yMin: region.yMin, yMax: yMid },
        { xMin: xMid, xMax: region.xMax, yMin: region.yMin, yMax: yMid },
        { xMin: region.xMin, xMax: xMid, yMin: yMid, yMax: region.yMax },
        { xMin: xMid, xMax: region.xMax, yMin: yMid, yMax: region.yMax }
      ];

      for (const sub of subRegions) {
        const coarse = integrate2D(f, [sub.xMin, sub.xMax], [sub.yMin, sub.yMax], 5);
        if (!isNaN(coarse)) {
          regions.push({
            ...sub,
            coarseValue: coarse,
            depth: region.depth + 1
          });
        }
      }
    }
  }

  return {
    value: totalValue,
    error: totalError,
    isExact: false,
    method: 'adaptive'
  };
}

/**
 * Calculate surface area using adaptive integration
 * Surface area = integral of sqrt(1 + (dz/dx)^2 + (dz/dy)^2) dA
 */
export function calculateSurfaceAreaAdaptive(
  evaluate: Evaluator2D,
  dzdx: Evaluator2D,
  dzdy: Evaluator2D,
  xRange: [number, number],
  yRange: [number, number],
  tolerance: number = 1e-6,
  maxDepth: number = 8
): IntegrationResult {
  const integrand: Evaluator2D = (x, y) => {
    const fx = dzdx(x, y);
    const fy = dzdy(x, y);
    if (fx === null || fy === null) return null;
    return Math.sqrt(1 + fx * fx + fy * fy);
  };

  return adaptiveIntegrate2D(integrand, xRange, yRange, tolerance, maxDepth);
}

/**
 * Calculate volume under a surface using adaptive integration
 * Volume = integral of |z| dA
 */
export function calculateVolumeAdaptive(
  evaluate: Evaluator2D,
  xRange: [number, number],
  yRange: [number, number],
  tolerance: number = 1e-6,
  maxDepth: number = 8
): IntegrationResult {
  const integrand: Evaluator2D = (x, y) => {
    const z = evaluate(x, y);
    if (z === null) return null;
    return Math.abs(z);
  };

  return adaptiveIntegrate2D(integrand, xRange, yRange, tolerance, maxDepth);
}

/**
 * Calculate volume between two surfaces using adaptive integration
 * Volume = integral of |z1 - z2| dA
 */
export function calculateVolumeBetweenAdaptive(
  evaluate1: Evaluator2D,
  evaluate2: Evaluator2D,
  xRange: [number, number],
  yRange: [number, number],
  tolerance: number = 1e-6,
  maxDepth: number = 8
): IntegrationResult {
  const integrand: Evaluator2D = (x, y) => {
    const z1 = evaluate1(x, y);
    const z2 = evaluate2(x, y);
    if (z1 === null || z2 === null) return null;
    return Math.abs(z1 - z2);
  };

  return adaptiveIntegrate2D(integrand, xRange, yRange, tolerance, maxDepth);
}

export type FillDirection = 'above' | 'below';

export interface SurfaceConstraint {
  evaluate: Evaluator2D;
  fillDirection: FillDirection;
}

/**
 * Calculate volume of the region defined by fill direction constraints.
 * Supports any number of surfaces - the volume is the intersection of all constraints.
 *
 * For each surface, fillDir specifies which side to fill:
 * - 'below' means z < f(x,y) -> contributes an upper bound
 * - 'above' means z > f(x,y) -> contributes a lower bound
 *
 * The volume is the intersection of these regions, clamped to zRange.
 *
 * Volume = integral of max(0, top - bottom) dA where top/bottom are the bounds
 * of the intersection region at each (x, y).
 */
export function calculateVolumeWithFillDirections(
  surfaces: SurfaceConstraint[],
  xRange: [number, number],
  yRange: [number, number],
  zRange: [number, number] | null,
  tolerance: number = 1e-6,
  maxDepth: number = 8
): IntegrationResult {
  const [zClipMin, zClipMax] = zRange || [-1e10, 1e10];

  const integrand: Evaluator2D = (x, y) => {
    let top = Infinity;
    let bottom = -Infinity;

    // Apply constraints from each surface
    for (const surface of surfaces) {
      const z = surface.evaluate(x, y);
      if (z === null || !isFinite(z)) return null;

      if (surface.fillDirection === 'below') {
        // z < f -> upper bound
        top = Math.min(top, z);
      } else {
        // z > f -> lower bound
        bottom = Math.max(bottom, z);
      }
    }

    // Apply z clipping
    top = Math.min(top, zClipMax);
    bottom = Math.max(bottom, zClipMin);

    // Height of the region at this point
    const height = top - bottom;
    return height > 0 ? height : 0;
  };

  return adaptiveIntegrate2D(integrand, xRange, yRange, tolerance, maxDepth);
}
