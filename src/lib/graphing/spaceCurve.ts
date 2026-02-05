import * as THREE from 'three';
import { compile } from 'mathjs';
import { getColorForZWithPalette } from './colors';

/**
 * Preprocess a single-variable expression for t (same rules as parametric but only 't' variable)
 */
function preprocessCurveExpression(expr: string): string {
  const FUNCTIONS = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh',
    'sqrt', 'exp', 'log', 'log10', 'log2', 'abs', 'ceil', 'floor', 'round', 'sign'];

  let result = expr;

  // Auto-add brackets for trig functions: sint -> sin(t)
  FUNCTIONS.forEach(fn => {
    result = result.replace(new RegExp(`(${fn})(t)(?![a-z0-9(])`, 'gi'), '$1($2)');
    result = result.replace(new RegExp(`(${fn})(t)([+\\-*/^])`, 'gi'), '$1($2)$3');
    result = result.replace(new RegExp(`(${fn})(t)$`, 'gi'), '$1($2)');
  });

  // Number followed by variable: 2t -> 2*t
  result = result.replace(/(\d)(t)/gi, '$1*$2');
  // Variable followed by number: t2 -> t*2
  result = result.replace(/(t)(\d)/gi, '$1*$2');
  // t followed by t: tt -> t*t
  result = result.replace(/(t)(t)/gi, '$1*$2');
  // Number followed by opening paren: 2( -> 2*(
  result = result.replace(/(\d)\(/g, '$1*(');
  // Closing paren followed by opening paren: )( -> )*(
  result = result.replace(/\)\(/g, ')*(');
  // Closing paren followed by number: )2 -> )*2
  result = result.replace(/\)(\d)/g, ')*$1');
  // Closing paren followed by variable: )t -> )*t
  result = result.replace(/\)(t)/gi, ')*$1');

  // Variable followed by opening paren (but not a function): t( -> t*(
  let temp = result;
  FUNCTIONS.forEach((fn, i) => {
    temp = temp.replace(new RegExp(fn + '\\(', 'gi'), `__FN${i}__(`);
  });
  temp = temp.replace(/(t)\(/gi, '$1*(');
  FUNCTIONS.forEach((fn, i) => {
    temp = temp.replace(new RegExp(`__FN${i}__\\(`, 'g'), fn + '(');
  });
  result = temp;

  // Number followed by function: 2sin -> 2*sin
  FUNCTIONS.forEach(fn => {
    result = result.replace(new RegExp(`(\\d)(${fn})\\(`, 'gi'), '$1*$2(');
  });
  // Variable followed by function: tsin -> t*sin
  FUNCTIONS.forEach(fn => {
    result = result.replace(new RegExp(`(t)(${fn})\\(`, 'gi'), '$1*$2(');
  });
  // Closing paren followed by function
  FUNCTIONS.forEach(fn => {
    result = result.replace(new RegExp(`\\)(${fn})\\(`, 'gi'), ')*$1(');
  });

  // Convert π symbol to pi for math.js
  result = result.replace(/π/g, 'pi');

  // Handle implicit multiplication for e and pi
  result = result.replace(/(t)(e)(?!xp)/gi, '$1*$2');
  result = result.replace(/(\d)(e)(?!xp)/gi, '$1*$2');
  result = result.replace(/\be(?!xp)\(/g, 'e*(');
  result = result.replace(/\be(?!xp)(t)/gi, 'e*$1');
  result = result.replace(/\be(?!xp)(\d)/gi, 'e*$1');

  result = result.replace(/(t)(pi)\b/gi, '$1*$2');
  result = result.replace(/(\d)(pi)\b/gi, '$1*$2');
  result = result.replace(/\bpi\(/gi, 'pi*(');
  result = result.replace(/\bpi(t)/gi, 'pi*$1');
  result = result.replace(/\bpi(\d)/gi, 'pi*$1');

  return result;
}

export interface SpaceCurveOptions {
  xExpr: string;  // x(t)
  yExpr: string;  // y(t)
  zExpr: string;  // z(t)
  tRange: [number, number];
  segments: number;  // Number of line segments
  functionIndex?: number;
  tubeRadius?: number;  // 0 = line, >0 = tube
}

export interface SpaceCurveResult {
  geometry: THREE.BufferGeometry;  // TubeGeometry or BufferGeometry for line
  lineGeometry: THREE.BufferGeometry;  // Always line geometry for wireframe
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
  transform: {
    xScale: number;
    yScale: number;
    zScale: number;
    xOffset: number;
    yOffset: number;
    zOffset: number;
  };
}

export function validateCurveExpression(expression: string): { valid: boolean; error?: string } {
  if (!expression.trim()) {
    return { valid: false, error: 'Expression cannot be empty' };
  }
  try {
    const processed = preprocessCurveExpression(expression);
    compile(processed);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid expression'
    };
  }
}

export function generateSpaceCurve(options: SpaceCurveOptions): SpaceCurveResult {
  const { xExpr, yExpr, zExpr, tRange, segments, functionIndex = 0, tubeRadius = 0 } = options;

  // Compile expressions
  const compiledX = compile(preprocessCurveExpression(xExpr));
  const compiledY = compile(preprocessCurveExpression(yExpr));
  const compiledZ = compile(preprocessCurveExpression(zExpr));

  const [tMin, tMax] = tRange;
  const tStep = (tMax - tMin) / segments;
  const extremeCap = 1e6;

  // Evaluate all points
  const curvePoints: ({ x: number; y: number; z: number } | null)[] = [];
  let xMin = Infinity, xMax = -Infinity;
  let yMin = Infinity, yMax = -Infinity;
  let zMin = Infinity, zMax = -Infinity;

  for (let i = 0; i <= segments; i++) {
    const t = tMin + i * tStep;
    try {
      const x = compiledX.evaluate({ t }) as number;
      const y = compiledY.evaluate({ t }) as number;
      const z = compiledZ.evaluate({ t }) as number;

      if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number' ||
          !isFinite(x) || !isFinite(y) || !isFinite(z) ||
          Math.abs(x) > extremeCap || Math.abs(y) > extremeCap || Math.abs(z) > extremeCap) {
        curvePoints.push(null);
        continue;
      }

      curvePoints.push({ x, y, z });
      xMin = Math.min(xMin, x); xMax = Math.max(xMax, x);
      yMin = Math.min(yMin, y); yMax = Math.max(yMax, y);
      zMin = Math.min(zMin, z); zMax = Math.max(zMax, z);
    } catch {
      curvePoints.push(null);
    }
  }

  // Handle degenerate cases
  if (!isFinite(xMin)) { xMin = -1; xMax = 1; }
  if (!isFinite(yMin)) { yMin = -1; yMax = 1; }
  if (!isFinite(zMin)) { zMin = -1; zMax = 1; }
  if (xMin === xMax) { xMin -= 1; xMax += 1; }
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  if (zMin === zMax) { zMin -= 1; zMax += 1; }

  // Normalize to target visual size
  const targetVisualSize = 10;
  const xSpan = xMax - xMin;
  const ySpan = yMax - yMin;
  const zSpan = zMax - zMin;
  const maxSpan = Math.max(xSpan, ySpan, zSpan);
  const scale = maxSpan > 0 ? targetVisualSize / maxSpan : 1;
  const xOffset = (xMin + xMax) / 2;
  const yOffset = (yMin + yMax) / 2;
  const zOffset = (zMin + zMax) / 2;

  // Build THREE.js curve from valid points
  const threePoints: THREE.Vector3[] = [];
  const tValues: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const pt = curvePoints[i];
    if (pt) {
      const scaledX = (pt.x - xOffset) * scale;
      const scaledY = (pt.y - yOffset) * scale;
      const scaledZ = (pt.z - zOffset) * scale;
      // Three.js: x = math x, y = math z (up), z = math y (depth)
      threePoints.push(new THREE.Vector3(scaledX, scaledZ, scaledY));
      tValues.push(tMin + i * tStep);
    }
  }

  // Create line geometry (always needed)
  const lineVertices: number[] = [];
  const lineColors: number[] = [];
  for (let i = 0; i < threePoints.length; i++) {
    lineVertices.push(threePoints[i].x, threePoints[i].y, threePoints[i].z);
    const pt = curvePoints.filter(p => p !== null)[i];
    if (pt) {
      const color = getColorForZWithPalette(pt.z, zMin, zMax, functionIndex);
      lineColors.push(color.r, color.g, color.b);
    } else {
      lineColors.push(0.5, 0.5, 0.5);
    }
  }

  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lineVertices, 3));
  lineGeometry.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));

  // Create tube geometry for 3D effect
  let mainGeometry: THREE.BufferGeometry;

  if (tubeRadius > 0 && threePoints.length >= 2) {
    const curve = new THREE.CatmullRomCurve3(threePoints, false, 'catmullrom', 0.5);
    const tubeGeo = new THREE.TubeGeometry(curve, segments, tubeRadius * scale * 0.05, 8, false);

    // Apply vertex colors based on position along curve
    const tubePositions = tubeGeo.getAttribute('position');
    const tubeColors = new Float32Array(tubePositions.count * 3);

    for (let i = 0; i < tubePositions.count; i++) {
      const pos = new THREE.Vector3(
        tubePositions.getX(i),
        tubePositions.getY(i),
        tubePositions.getZ(i)
      );
      // Approximate t from position along the tube
      // Use y (which is math z) for coloring
      const mathZ = pos.y / scale + zOffset;
      const color = getColorForZWithPalette(mathZ, zMin, zMax, functionIndex);
      tubeColors[i * 3] = color.r;
      tubeColors[i * 3 + 1] = color.g;
      tubeColors[i * 3 + 2] = color.b;
    }

    tubeGeo.setAttribute('color', new THREE.Float32BufferAttribute(tubeColors, 3));
    mainGeometry = tubeGeo;
  } else {
    mainGeometry = lineGeometry;
  }

  return {
    geometry: mainGeometry,
    lineGeometry,
    xMin, xMax,
    yMin, yMax,
    zMin, zMax,
    transform: {
      xScale: scale,
      yScale: scale,
      zScale: scale,
      xOffset,
      yOffset,
      zOffset,
    },
  };
}
