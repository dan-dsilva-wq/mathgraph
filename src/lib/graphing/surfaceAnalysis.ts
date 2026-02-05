import { createEvaluator, createDerivativeEvaluators, Evaluator } from '../mathParser';

export interface HessianResult {
  fxx: number;
  fxy: number;
  fyy: number;
  determinant: number; // fxx * fyy - fxy^2
  trace: number; // fxx + fyy (Laplacian)
}

export type PointClassification = 'local_min' | 'local_max' | 'saddle' | 'degenerate';

export interface ClassifiedCriticalPoint {
  x: number;
  y: number;
  z: number;
  type: PointClassification;
  hessian: HessianResult;
  // Eigenvalues of the Hessian (principal curvatures of the graph surface relate to these)
  eigenvalues: [number, number];
  // Gaussian curvature K = det(shape operator)
  gaussianCurvature: number;
  // Mean curvature H = trace(shape operator) / 2
  meanCurvature: number;
}

export interface SurfaceAnalysisResult {
  // Symbolic partial derivatives (LaTeX)
  partialDerivatives: {
    dzdx: string;
    dzdy: string;
  } | null;
  // Critical points with full classification
  criticalPoints: ClassifiedCriticalPoint[];
  // Whether the analysis could be performed
  success: boolean;
  error?: string;
}

/**
 * Compute the Hessian matrix at a point for z = f(x, y)
 */
function computeHessian(
  d2zdx2: Evaluator,
  d2zdy2: Evaluator,
  d2zdxdy: Evaluator,
  x: number,
  y: number
): HessianResult | null {
  const fxx = d2zdx2(x, y);
  const fyy = d2zdy2(x, y);
  const fxy = d2zdxdy(x, y);

  if (fxx === null || fyy === null || fxy === null) return null;

  return {
    fxx,
    fxy,
    fyy,
    determinant: fxx * fyy - fxy * fxy,
    trace: fxx + fyy,
  };
}

/**
 * Classify a critical point using the second derivative test
 */
function classifyPoint(hessian: HessianResult): PointClassification {
  const { determinant, fxx } = hessian;
  const eps = 1e-8;

  if (determinant > eps) {
    return fxx > 0 ? 'local_min' : 'local_max';
  } else if (determinant < -eps) {
    return 'saddle';
  } else {
    return 'degenerate';
  }
}

/**
 * Compute eigenvalues of 2x2 symmetric matrix [[a, b], [b, c]]
 */
function eigenvalues2x2(a: number, b: number, c: number): [number, number] {
  const trace = a + c;
  const det = a * c - b * b;
  const disc = Math.sqrt(Math.max(0, trace * trace - 4 * det));
  return [(trace + disc) / 2, (trace - disc) / 2];
}

/**
 * Compute Gaussian and Mean curvature at a point on z = f(x,y)
 *
 * For a surface z = f(x,y), the curvatures are:
 * K (Gaussian) = (fxx * fyy - fxy^2) / (1 + fx^2 + fy^2)^2
 * H (Mean) = ((1 + fy^2)*fxx - 2*fx*fy*fxy + (1 + fx^2)*fyy) / (2*(1 + fx^2 + fy^2)^(3/2))
 */
function computeCurvature(
  fx: number, fy: number,
  fxx: number, fxy: number, fyy: number
): { gaussianCurvature: number; meanCurvature: number } {
  const denom = 1 + fx * fx + fy * fy;
  const gaussianCurvature = (fxx * fyy - fxy * fxy) / (denom * denom);
  const meanCurvature = ((1 + fy * fy) * fxx - 2 * fx * fy * fxy + (1 + fx * fx) * fyy) / (2 * Math.pow(denom, 1.5));

  return { gaussianCurvature, meanCurvature };
}

/**
 * Full surface analysis: find critical points, classify them, compute curvatures
 */
export function analyzeSurface(
  expression: string,
  xRange: [number, number],
  yRange: [number, number],
  maxPoints: number = 10
): SurfaceAnalysisResult {
  try {
    const derivs = createDerivativeEvaluators(expression);
    if (!derivs) {
      return { partialDerivatives: null, criticalPoints: [], success: false, error: 'Could not compute derivatives' };
    }

    const { dzdx, dzdy, d2zdx2, d2zdy2, d2zdxdy } = derivs;
    const evaluate = createEvaluator(expression);

    // Find critical points using grid search + Newton-Raphson
    const criticalPoints: ClassifiedCriticalPoint[] = [];
    const [xMin, xMax] = xRange;
    const [yMin, yMax] = yRange;
    const searchRes = 50;
    const xStep = (xMax - xMin) / searchRes;
    const yStep = (yMax - yMin) / searchRes;

    const candidates: { x: number; y: number }[] = [];

    // Grid search for approximate critical points
    for (let i = 1; i < searchRes; i++) {
      for (let j = 1; j < searchRes; j++) {
        const x = xMin + i * xStep;
        const y = yMin + j * yStep;
        const fx = dzdx(x, y);
        const fy = dzdy(x, y);
        if (fx === null || fy === null) continue;

        const gradMag = Math.sqrt(fx * fx + fy * fy);
        if (gradMag < 0.5) {
          candidates.push({ x, y });
        }
      }
    }

    // Newton-Raphson refinement
    const refined: { x: number; y: number }[] = [];
    for (const cand of candidates) {
      let x = cand.x;
      let y = cand.y;
      let converged = false;

      for (let iter = 0; iter < 50; iter++) {
        const fx = dzdx(x, y);
        const fy = dzdy(x, y);
        if (fx === null || fy === null) break;

        if (Math.sqrt(fx * fx + fy * fy) < 1e-10) {
          converged = true;
          break;
        }

        const fxx = d2zdx2(x, y);
        const fyy = d2zdy2(x, y);
        const fxy = d2zdxdy(x, y);
        if (fxx === null || fyy === null || fxy === null) break;

        const det = fxx * fyy - fxy * fxy;
        if (Math.abs(det) < 1e-15) {
          // Gradient descent fallback
          x -= 0.1 * fx;
          y -= 0.1 * fy;
        } else {
          x -= (fyy * fx - fxy * fy) / det;
          y -= (fxx * fy - fxy * fx) / det;
        }

        if (x < xMin || x > xMax || y < yMin || y > yMax) break;
      }

      if (converged && x >= xMin && x <= xMax && y >= yMin && y <= yMax) {
        // Check for duplicates
        const isDup = refined.some(p => Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6);
        if (!isDup) {
          refined.push({ x, y });
        }
      }
    }

    // Classify each point
    for (const pt of refined.slice(0, maxPoints)) {
      const z = evaluate(pt.x, pt.y);
      if (z === null) continue;

      const hessian = computeHessian(d2zdx2, d2zdy2, d2zdxdy, pt.x, pt.y);
      if (!hessian) continue;

      const type = classifyPoint(hessian);
      const eigs = eigenvalues2x2(hessian.fxx, hessian.fxy, hessian.fyy);

      const fx = dzdx(pt.x, pt.y);
      const fy = dzdy(pt.x, pt.y);
      if (fx === null || fy === null) continue;

      const curvature = computeCurvature(fx, fy, hessian.fxx, hessian.fxy, hessian.fyy);

      // Round nicely
      const round = (v: number) => {
        const nice = [0, Math.PI, -Math.PI, Math.PI / 2, -Math.PI / 2, 1, -1, 2, -2, 0.5, -0.5];
        for (const n of nice) {
          if (Math.abs(v - n) < 1e-10) return n;
        }
        return Math.round(v * 1e8) / 1e8;
      };

      criticalPoints.push({
        x: round(pt.x),
        y: round(pt.y),
        z: round(z),
        type,
        hessian,
        eigenvalues: eigs,
        gaussianCurvature: curvature.gaussianCurvature,
        meanCurvature: curvature.meanCurvature,
      });
    }

    // Sort: minima first, then maxima, then saddles, then degenerate
    const order: Record<PointClassification, number> = { local_min: 0, local_max: 1, saddle: 2, degenerate: 3 };
    criticalPoints.sort((a, b) => order[a.type] - order[b.type]);

    return {
      partialDerivatives: null, // Will be set by caller using getPartialDerivatives
      criticalPoints,
      success: true,
    };
  } catch (err) {
    return {
      partialDerivatives: null,
      criticalPoints: [],
      success: false,
      error: err instanceof Error ? err.message : 'Analysis failed',
    };
  }
}

/**
 * Compute Hessian at a specific point (for tangent plane info)
 */
export function computeHessianAtPoint(
  expression: string,
  x: number,
  y: number
): HessianResult | null {
  try {
    const derivs = createDerivativeEvaluators(expression);
    if (!derivs) return null;
    return computeHessian(derivs.d2zdx2, derivs.d2zdy2, derivs.d2zdxdy, x, y);
  } catch {
    return null;
  }
}

/**
 * Compute curvature info at a specific point
 */
export function computeCurvatureAtPoint(
  expression: string,
  x: number,
  y: number
): { gaussianCurvature: number; meanCurvature: number } | null {
  try {
    const derivs = createDerivativeEvaluators(expression);
    if (!derivs) return null;

    const fx = derivs.dzdx(x, y);
    const fy = derivs.dzdy(x, y);
    const fxx = derivs.d2zdx2(x, y);
    const fyy = derivs.d2zdy2(x, y);
    const fxy = derivs.d2zdxdy(x, y);

    if (fx === null || fy === null || fxx === null || fyy === null || fxy === null) return null;

    return computeCurvature(fx, fy, fxx, fxy, fyy);
  } catch {
    return null;
  }
}
