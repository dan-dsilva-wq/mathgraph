import * as THREE from 'three';
import { compile } from 'mathjs';

/**
 * Vector Field visualization: F(x,y,z) = <P(x,y,z), Q(x,y,z), R(x,y,z)>
 * Renders as 3D arrows on a grid using InstancedMesh for performance
 */

const FUNCTIONS = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh',
  'sqrt', 'exp', 'log', 'log10', 'log2', 'abs', 'ceil', 'floor', 'round', 'sign'];

function preprocessVectorFieldExpression(expr: string): string {
  let result = expr;

  // Auto-add brackets for functions: sinx -> sin(x)
  FUNCTIONS.forEach(fn => {
    result = result.replace(new RegExp(`(${fn})([xyz])(?![a-z0-9(])`, 'gi'), '$1($2)');
    result = result.replace(new RegExp(`(${fn})([xyz])([+\\-*/^])`, 'gi'), '$1($2)$3');
    result = result.replace(new RegExp(`(${fn})([xyz])$`, 'gi'), '$1($2)');
  });

  // Number followed by variable: 2x -> 2*x
  result = result.replace(/(\d)([xyz])/gi, '$1*$2');
  // Variable followed by number: x2 -> x*2
  result = result.replace(/([xyz])(\d)/gi, '$1*$2');
  // Variable followed by variable: xy -> x*y
  result = result.replace(/([xyz])([xyz])/gi, '$1*$2');
  // Number followed by paren: 2( -> 2*(
  result = result.replace(/(\d)\(/g, '$1*(');
  // )( -> )*(
  result = result.replace(/\)\(/g, ')*(');
  // )2 -> )*2
  result = result.replace(/\)(\d)/g, ')*$1');
  // )x -> )*x
  result = result.replace(/\)([xyz])/gi, ')*$1');

  // Variable followed by opening paren (not function): x( -> x*(
  let temp = result;
  FUNCTIONS.forEach((fn, i) => {
    temp = temp.replace(new RegExp(fn + '\\(', 'gi'), `__FN${i}__(`);
  });
  temp = temp.replace(/([xyz])\(/gi, '$1*(');
  FUNCTIONS.forEach((fn, i) => {
    temp = temp.replace(new RegExp(`__FN${i}__\\(`, 'g'), fn + '(');
  });
  result = temp;

  // Number followed by function: 2sin -> 2*sin
  FUNCTIONS.forEach(fn => {
    result = result.replace(new RegExp(`(\\d)(${fn})\\(`, 'gi'), '$1*$2(');
  });
  // Variable followed by function: xsin -> x*sin
  FUNCTIONS.forEach(fn => {
    result = result.replace(new RegExp(`([xyz])(${fn})\\(`, 'gi'), '$1*$2(');
  });
  // )sin -> )*sin
  FUNCTIONS.forEach(fn => {
    result = result.replace(new RegExp(`\\)(${fn})\\(`, 'gi'), ')*$1(');
  });

  // Convert π
  result = result.replace(/π/g, 'pi');

  // Handle e and pi implicit multiplication
  result = result.replace(/([xyz])(e)(?!xp)/gi, '$1*$2');
  result = result.replace(/(\d)(e)(?!xp)/gi, '$1*$2');
  result = result.replace(/\be(?!xp)\(/g, 'e*(');
  result = result.replace(/\be(?!xp)([xyz])/gi, 'e*$1');
  result = result.replace(/\be(?!xp)(\d)/gi, 'e*$1');

  result = result.replace(/([xyz])(pi)\b/gi, '$1*$2');
  result = result.replace(/(\d)(pi)\b/gi, '$1*$2');
  result = result.replace(/\bpi\(/gi, 'pi*(');
  result = result.replace(/\bpi([xyz])/gi, 'pi*$1');
  result = result.replace(/\bpi(\d)/gi, 'pi*$1');

  return result;
}

export function validateVectorFieldExpression(expression: string): { valid: boolean; error?: string } {
  if (!expression.trim()) {
    return { valid: false, error: 'Expression cannot be empty' };
  }
  try {
    const processed = preprocessVectorFieldExpression(expression);
    compile(processed);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid expression'
    };
  }
}

export interface VectorFieldOptions {
  pExpr: string;  // P(x,y,z) - x component
  qExpr: string;  // Q(x,y,z) - y component
  rExpr: string;  // R(x,y,z) - z component
  xRange: [number, number];
  yRange: [number, number];
  zRange: [number, number];
  density: number;  // Number of sample points per axis (e.g., 8 = 8x8x8 grid)
  normalize: boolean;  // Whether to normalize all arrows to same length
  is2D: boolean;  // If true, only sample z=0 plane
}

export interface VectorFieldArrow {
  origin: THREE.Vector3;  // Position in visual coordinates
  direction: THREE.Vector3;  // Direction in visual coordinates (normalized)
  magnitude: number;  // Original magnitude for coloring
  mathOrigin: { x: number; y: number; z: number };  // Math coordinates for tooltip
  mathVector: { x: number; y: number; z: number };  // Math vector components
}

export interface VectorFieldResult {
  arrows: VectorFieldArrow[];
  maxMagnitude: number;
  minMagnitude: number;
  transform: {
    xScale: number;
    yScale: number;
    zScale: number;
    xOffset: number;
    yOffset: number;
    zOffset: number;
  };
}

export function generateVectorField(options: VectorFieldOptions): VectorFieldResult {
  const { pExpr, qExpr, rExpr, xRange, yRange, zRange, density, normalize, is2D } = options;

  const compiledP = compile(preprocessVectorFieldExpression(pExpr));
  const compiledQ = compile(preprocessVectorFieldExpression(qExpr));
  const compiledR = compile(preprocessVectorFieldExpression(rExpr));

  const [xMin, xMax] = xRange;
  const [yMin, yMax] = yRange;
  const [zMin, zMax] = zRange;

  // Calculate grid spacing
  const nx = density;
  const ny = density;
  const nz = is2D ? 1 : density;

  const dx = (xMax - xMin) / Math.max(nx - 1, 1);
  const dy = (yMax - yMin) / Math.max(ny - 1, 1);
  const dz = is2D ? 0 : (zMax - zMin) / Math.max(nz - 1, 1);

  // Normalize to target visual size
  const targetVisualSize = 10;
  const xSpan = xMax - xMin;
  const ySpan = yMax - yMin;
  const zSpan = is2D ? Math.max(xSpan, ySpan) : (zMax - zMin);
  const maxSpan = Math.max(xSpan, ySpan, zSpan);
  const scl = maxSpan > 0 ? targetVisualSize / maxSpan : 1;
  const xOffset = (xMin + xMax) / 2;
  const yOffset = (yMin + yMax) / 2;
  const zOffset = is2D ? 0 : (zMin + zMax) / 2;

  const arrows: VectorFieldArrow[] = [];
  let maxMagnitude = 0;
  let minMagnitude = Infinity;
  const extremeCap = 1e6;

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      for (let k = 0; k < nz; k++) {
        const x = xMin + i * dx;
        const y = yMin + j * dy;
        const z = is2D ? 0 : (zMin + k * dz);

        try {
          const scope = { x, y, z };
          const p = compiledP.evaluate(scope) as number;
          const q = compiledQ.evaluate(scope) as number;
          const r = compiledR.evaluate(scope) as number;

          if (typeof p !== 'number' || typeof q !== 'number' || typeof r !== 'number' ||
              !isFinite(p) || !isFinite(q) || !isFinite(r) ||
              Math.abs(p) > extremeCap || Math.abs(q) > extremeCap || Math.abs(r) > extremeCap) {
            continue;
          }

          const magnitude = Math.sqrt(p * p + q * q + r * r);
          if (magnitude < 1e-10) continue;  // Skip zero vectors

          maxMagnitude = Math.max(maxMagnitude, magnitude);
          minMagnitude = Math.min(minMagnitude, magnitude);

          // Convert origin to visual coordinates
          // Three.js: x = math x, y = math z (up), z = math y (depth)
          const visualOrigin = new THREE.Vector3(
            (x - xOffset) * scl,
            (z - zOffset) * scl,
            (y - yOffset) * scl
          );

          // Convert vector direction to visual coordinates
          const visualDir = new THREE.Vector3(
            p * scl,
            r * scl,   // math z -> visual y
            q * scl    // math y -> visual z
          );
          const visualMag = visualDir.length();
          visualDir.normalize();

          arrows.push({
            origin: visualOrigin,
            direction: visualDir,
            magnitude,
            mathOrigin: { x, y, z },
            mathVector: { x: p, y: q, z: r },
          });
        } catch {
          // Skip invalid points
        }
      }
    }
  }

  return {
    arrows,
    maxMagnitude,
    minMagnitude,
    transform: {
      xScale: scl,
      yScale: scl,
      zScale: scl,
      xOffset,
      yOffset,
      zOffset,
    },
  };
}

/**
 * Create instanced meshes for efficient vector field rendering.
 * Uses cone + cylinder for each arrow.
 */
export function createVectorFieldMeshes(
  result: VectorFieldResult,
  normalizeArrows: boolean,
): THREE.Group {
  const group = new THREE.Group();
  const { arrows, maxMagnitude, minMagnitude } = result;

  if (arrows.length === 0) return group;

  // Calculate arrow scale based on grid spacing
  // Want arrows to be ~60% of grid spacing so they don't overlap too much
  const gridSpacing = 10 / Math.cbrt(arrows.length);
  const baseArrowLength = gridSpacing * 0.55;

  // Shaft geometry (cylinder)
  const shaftRadius = baseArrowLength * 0.04;
  const shaftLength = baseArrowLength * 0.7;
  const shaftGeometry = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 6, 1);
  // Shift origin to base
  shaftGeometry.translate(0, shaftLength / 2, 0);

  // Head geometry (cone)
  const headRadius = shaftRadius * 3;
  const headLength = baseArrowLength * 0.3;
  const headGeometry = new THREE.ConeGeometry(headRadius, headLength, 6);
  // Shift origin to base
  headGeometry.translate(0, headLength / 2, 0);

  // Create instanced meshes
  const shaftMaterial = new THREE.MeshStandardMaterial({
    vertexColors: false,
    roughness: 0.5,
    metalness: 0.1,
  });

  const headMaterial = new THREE.MeshStandardMaterial({
    vertexColors: false,
    roughness: 0.5,
    metalness: 0.1,
  });

  const shaftInstanced = new THREE.InstancedMesh(shaftGeometry, shaftMaterial, arrows.length);
  const headInstanced = new THREE.InstancedMesh(headGeometry, headMaterial, arrows.length);

  shaftInstanced.frustumCulled = false;
  headInstanced.frustumCulled = false;

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  // Log scale for magnitude mapping to prevent extreme arrows from dominating
  const logMax = Math.log1p(maxMagnitude);
  const logMin = Math.log1p(minMagnitude);
  const logRange = logMax - logMin || 1;

  for (let i = 0; i < arrows.length; i++) {
    const arrow = arrows[i];

    // Calculate arrow length based on magnitude
    let arrowScale: number;
    if (normalizeArrows) {
      arrowScale = 1;
    } else {
      // Use log scale for more uniform visualization
      const logMag = Math.log1p(arrow.magnitude);
      const t = (logMag - logMin) / logRange;
      arrowScale = 0.3 + t * 0.7; // Range: 30% to 100% of base length
    }

    const scaledShaftLength = shaftLength * arrowScale;

    // Orient arrow along direction vector
    // Default cylinder points along +Y, so we need to rotate from +Y to our direction
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), arrow.direction);

    // Shaft: position at origin, rotated
    dummy.position.copy(arrow.origin);
    dummy.quaternion.copy(quaternion);
    dummy.scale.set(1, arrowScale, 1);
    dummy.updateMatrix();
    shaftInstanced.setMatrixAt(i, dummy.matrix);

    // Head: position at end of shaft
    const headPos = arrow.origin.clone().add(
      arrow.direction.clone().multiplyScalar(scaledShaftLength)
    );
    dummy.position.copy(headPos);
    dummy.quaternion.copy(quaternion);
    dummy.scale.set(1, arrowScale, 1);
    dummy.updateMatrix();
    headInstanced.setMatrixAt(i, dummy.matrix);

    // Color based on magnitude (blue -> cyan -> green -> yellow -> red)
    const t = normalizeArrows
      ? (Math.log1p(arrow.magnitude) - logMin) / logRange
      : (Math.log1p(arrow.magnitude) - logMin) / logRange;
    const clampedT = Math.max(0, Math.min(1, t));

    // HSL gradient: blue (0.6) -> cyan (0.5) -> green (0.33) -> yellow (0.17) -> red (0)
    const hue = 0.6 - clampedT * 0.6;
    const saturation = 0.8 + clampedT * 0.2;
    const lightness = 0.35 + clampedT * 0.2;
    color.setHSL(hue, saturation, lightness);

    shaftInstanced.setColorAt(i, color);
    headInstanced.setColorAt(i, color);
  }

  shaftInstanced.instanceMatrix.needsUpdate = true;
  headInstanced.instanceMatrix.needsUpdate = true;
  if (shaftInstanced.instanceColor) shaftInstanced.instanceColor.needsUpdate = true;
  if (headInstanced.instanceColor) headInstanced.instanceColor.needsUpdate = true;

  group.add(shaftInstanced);
  group.add(headInstanced);

  return group;
}
