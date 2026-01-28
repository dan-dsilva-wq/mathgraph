import * as THREE from 'three';
import { createEvaluator } from '../mathParser';
import { getColorForZWithPalette, getUndefinedColor } from './colors';

interface SurfaceOptions {
  expression: string;
  xRange: [number, number];
  yRange: [number, number];
  resolution: number;
  functionIndex?: number; // For multi-function coloring
  globalZMin?: number; // For consistent scaling across multiple surfaces
  globalZMax?: number; // For consistent scaling across multiple surfaces
  zClipRange?: [number, number]; // User-specified z range for clipping
}

export interface CriticalPoint {
  x: number;
  y: number;
  z: number;
  scaledX: number; // For 3D positioning
  scaledY: number; // For 3D positioning
  scaledZ: number; // For 3D positioning
  type: 'minimum' | 'maximum' | 'saddle';
}

interface SurfaceResult {
  geometry: THREE.BufferGeometry;
  zMin: number;
  zMax: number;
  criticalPoints: CriticalPoint[];
  surfaceArea: number;
  volume: number; // Volume under the surface (above z=0)
  zeroPlaneY: number; // Where z=0 is in Three.js Y coordinates
}

export function generateSurface(options: SurfaceOptions): SurfaceResult {
  const { expression, xRange, yRange, resolution, functionIndex = 0, globalZMin, globalZMax, zClipRange } = options;
  const evaluate = createEvaluator(expression);

  const [xMin, xMax] = xRange;
  const [yMin, yMax] = yRange;

  const xStep = (xMax - xMin) / resolution;
  const yStep = (yMax - yMin) / resolution;

  // Calculate spans for each dimension
  const xSpan = xMax - xMin;
  const ySpan = yMax - yMin;

  // Target visual size - normalize everything to this scale for consistent rendering
  const targetVisualSize = 10;

  // First pass: calculate all z values and find min/max
  // DON'T clip to zClipRange here - we need original values for interpolation
  const zValues: (number | null)[][] = [];
  let zMin = Infinity;
  let zMax = -Infinity;

  // Only filter out infinite/NaN values for numerical stability
  const extremeCap = 1e6;

  for (let i = 0; i <= resolution; i++) {
    zValues[i] = [];
    for (let j = 0; j <= resolution; j++) {
      const x = xMin + i * xStep;
      const y = yMin + j * yStep;
      let z = evaluate(x, y);

      // Only filter out truly extreme/infinite values
      if (z !== null && (Math.abs(z) > extremeCap || !isFinite(z))) {
        z = null;
      }

      zValues[i][j] = z;

      // Only count in-range values for zMin/zMax calculation
      if (z !== null) {
        if (!zClipRange || (z >= zClipRange[0] && z <= zClipRange[1])) {
          zMin = Math.min(zMin, z);
          zMax = Math.max(zMax, z);
        }
      }
    }
  }

  // If all values are out of range, use the clip range for scaling
  if (!isFinite(zMin) || !isFinite(zMax)) {
    if (zClipRange) {
      zMin = zClipRange[0];
      zMax = zClipRange[1];
    } else {
      zMin = -1;
      zMax = 1;
    }
  }

  // Handle case where all values are the same or undefined
  if (!isFinite(zMin) || !isFinite(zMax)) {
    zMin = -1;
    zMax = 1;
  } else if (zMin === zMax) {
    zMin -= 1;
    zMax += 1;
  }

  // Use global z range if provided (for consistent scaling across multiple surfaces)
  const effectiveZMin = globalZMin !== undefined ? globalZMin : zMin;
  const effectiveZMax = globalZMax !== undefined ? globalZMax : zMax;

  // Calculate scaling factors to normalize all dimensions to targetVisualSize
  // This ensures consistent rendering regardless of input range sizes
  const xScale = xSpan > 0 ? targetVisualSize / xSpan : 1;
  const yScale = ySpan > 0 ? targetVisualSize / ySpan : 1;
  const actualZSpan = effectiveZMax - effectiveZMin;
  const zScale = actualZSpan > 0 ? targetVisualSize / actualZSpan : 1;

  // Center offsets for each dimension
  const xOffset = (xMin + xMax) / 2;
  const yOffset = (yMin + yMax) / 2;
  const zOffset = (effectiveZMin + effectiveZMax) / 2;

  // Second pass: build geometry with normalized coordinates
  const vertices: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  // Create vertices - all dimensions normalized to targetVisualSize centered at origin
  for (let i = 0; i <= resolution; i++) {
    for (let j = 0; j <= resolution; j++) {
      const x = xMin + i * xStep;
      const y = yMin + j * yStep;
      const z = zValues[i][j];

      // Normalize all coordinates to consistent visual scale
      const scaledX = (x - xOffset) * xScale;
      const scaledY = (y - yOffset) * yScale;
      const scaledZ = z !== null ? (z - zOffset) * zScale : 0;
      vertices.push(scaledX, scaledZ, scaledY);

      // Color based on original z value (not scaled), using function-specific palette
      const color = z !== null ? getColorForZWithPalette(z, zMin, zMax, functionIndex) : getUndefinedColor();
      colors.push(color.r, color.g, color.b);
    }
  }

  // For z-range clipping, we interpolate edges that cross the boundary
  // to create smooth clipped edges instead of jagged staircases

  // Track extra vertices for clipped triangles
  const extraVertices: number[] = [];
  const extraColors: number[] = [];
  let extraVertexCount = 0;

  // Helper to get vertex index
  const getVertexIndex = (i: number, j: number): number => i * (resolution + 1) + j;

  // Helper to add a new interpolated vertex at z boundary
  const addClippedVertex = (
    i1: number, j1: number, z1: number,
    i2: number, j2: number, z2: number,
    zBoundary: number
  ): number => {
    const t = (zBoundary - z1) / (z2 - z1);

    const x1 = xMin + i1 * xStep;
    const y1 = yMin + j1 * yStep;
    const x2 = xMin + i2 * xStep;
    const y2 = yMin + j2 * yStep;

    const x = x1 + t * (x2 - x1);
    const y = y1 + t * (y2 - y1);

    // Normalize coordinates to match the main vertex generation
    const scaledX = (x - xOffset) * xScale;
    const scaledY = (y - yOffset) * yScale;
    const scaledZ = (zBoundary - zOffset) * zScale;

    extraVertices.push(scaledX, scaledZ, scaledY);

    const color = getColorForZWithPalette(zBoundary, zMin, zMax, functionIndex);
    extraColors.push(color.r, color.g, color.b);

    const newIndex = (resolution + 1) * (resolution + 1) + extraVertexCount;
    extraVertexCount++;
    return newIndex;
  };

  // Helper to check if z is in range
  const inRange = (z: number | null): boolean => {
    if (z === null) return false;
    if (!zClipRange) return true;
    return z >= zClipRange[0] && z <= zClipRange[1];
  };

  // Helper to clip a triangle against z boundaries
  // Returns array of triangles (as index triplets) after clipping
  // IMPORTANT: Preserves winding order from original triangle
  const clipTriangle = (
    idx1: number, i1: number, j1: number, z1: number | null,
    idx2: number, i2: number, j2: number, z2: number | null,
    idx3: number, i3: number, j3: number, z3: number | null
  ): number[][] => {
    if (z1 === null || z2 === null || z3 === null) return [];
    if (!zClipRange) return [[idx1, idx2, idx3]];

    const [clipMin, clipMax] = zClipRange;
    const in1 = z1 >= clipMin && z1 <= clipMax;
    const in2 = z2 >= clipMin && z2 <= clipMax;
    const in3 = z3 >= clipMin && z3 <= clipMax;

    const inCount = (in1 ? 1 : 0) + (in2 ? 1 : 0) + (in3 ? 1 : 0);

    if (inCount === 3) return [[idx1, idx2, idx3]]; // All inside
    if (inCount === 0) return []; // All outside

    // Helper to get clip point on edge from vertex A to vertex B
    const getEdgeClip = (
      iA: number, jA: number, zA: number,
      iB: number, jB: number, zB: number
    ): number => {
      // Determine which boundary the edge crosses
      const boundary = (zA < clipMin || zB < clipMin) ? clipMin : clipMax;
      return addClippedVertex(iA, jA, zA, iB, jB, zB, boundary);
    };

    // 1 vertex inside, 2 outside: create 1 triangle
    // Preserve winding by keeping the inside vertex in its original position
    if (inCount === 1) {
      if (in1) {
        // v1 inside, v2 and v3 outside
        // Original: v1 -> v2 -> v3
        // Clipped:  v1 -> clip(1->2) -> clip(1->3)
        const c12 = getEdgeClip(i1, j1, z1, i2, j2, z2);
        const c13 = getEdgeClip(i1, j1, z1, i3, j3, z3);
        return [[idx1, c12, c13]];
      } else if (in2) {
        // v2 inside, v1 and v3 outside
        // Original: v1 -> v2 -> v3
        // Clipped:  clip(2->1) -> v2 -> clip(2->3)
        const c21 = getEdgeClip(i2, j2, z2, i1, j1, z1);
        const c23 = getEdgeClip(i2, j2, z2, i3, j3, z3);
        return [[c21, idx2, c23]];
      } else {
        // v3 inside, v1 and v2 outside
        // Original: v1 -> v2 -> v3
        // Clipped:  clip(3->1) -> clip(3->2) -> v3
        const c31 = getEdgeClip(i3, j3, z3, i1, j1, z1);
        const c32 = getEdgeClip(i3, j3, z3, i2, j2, z2);
        return [[c31, c32, idx3]];
      }
    }

    // 2 vertices inside, 1 outside: create 2 triangles (quad)
    // Preserve winding order carefully
    if (!in1) {
      // v1 outside, v2 and v3 inside
      // Original: v1 -> v2 -> v3
      // Quad vertices in order: clip(2->1), v2, v3, clip(3->1)
      const c21 = getEdgeClip(i2, j2, z2, i1, j1, z1);
      const c31 = getEdgeClip(i3, j3, z3, i1, j1, z1);
      return [
        [c21, idx2, idx3],
        [c21, idx3, c31]
      ];
    } else if (!in2) {
      // v2 outside, v1 and v3 inside
      // Original: v1 -> v2 -> v3
      // Quad vertices in order: v1, clip(1->2), clip(3->2), v3
      const c12 = getEdgeClip(i1, j1, z1, i2, j2, z2);
      const c32 = getEdgeClip(i3, j3, z3, i2, j2, z2);
      return [
        [idx1, c12, c32],
        [idx1, c32, idx3]
      ];
    } else {
      // v3 outside, v1 and v2 inside
      // Original: v1 -> v2 -> v3
      // Quad vertices in order: v1, v2, clip(2->3), clip(1->3)
      const c23 = getEdgeClip(i2, j2, z2, i3, j3, z3);
      const c13 = getEdgeClip(i1, j1, z1, i3, j3, z3);
      return [
        [idx1, idx2, c23],
        [idx1, c23, c13]
      ];
    }
  };

  // Create triangles with proper clipping
  for (let i = 0; i < resolution; i++) {
    for (let j = 0; j < resolution; j++) {
      const a = getVertexIndex(i, j);
      const b = getVertexIndex(i, j + 1);
      const c = getVertexIndex(i + 1, j);
      const d = getVertexIndex(i + 1, j + 1);

      const zA = zValues[i][j];
      const zB = zValues[i][j + 1];
      const zC = zValues[i + 1][j];
      const zD = zValues[i + 1][j + 1];

      // Triangle 1: a-c-b
      if (zA !== null && zC !== null && zB !== null) {
        const clipped = clipTriangle(
          a, i, j, zA,
          c, i + 1, j, zC,
          b, i, j + 1, zB
        );
        for (const tri of clipped) {
          indices.push(tri[0], tri[1], tri[2]);
        }
      }

      // Triangle 2: b-c-d
      if (zB !== null && zC !== null && zD !== null) {
        const clipped = clipTriangle(
          b, i, j + 1, zB,
          c, i + 1, j, zC,
          d, i + 1, j + 1, zD
        );
        for (const tri of clipped) {
          indices.push(tri[0], tri[1], tri[2]);
        }
      }
    }
  }

  // Add extra vertices to the geometry arrays
  for (let i = 0; i < extraVertices.length; i++) {
    vertices.push(extraVertices[i]);
  }
  for (let i = 0; i < extraColors.length; i++) {
    colors.push(extraColors[i]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  // Find global minimum and maximum (only considering points within z clip range)
  const criticalPoints: CriticalPoint[] = [];

  let globalMinPoint: { i: number; j: number; z: number } | null = null;
  let globalMaxPoint: { i: number; j: number; z: number } | null = null;

  for (let i = 0; i <= resolution; i++) {
    for (let j = 0; j <= resolution; j++) {
      const z = zValues[i][j];
      if (z === null) continue;

      // Only consider points within the z clip range for critical points
      if (zClipRange && (z < zClipRange[0] || z > zClipRange[1])) continue;

      if (globalMinPoint === null || z < globalMinPoint.z) {
        globalMinPoint = { i, j, z };
      }
      if (globalMaxPoint === null || z > globalMaxPoint.z) {
        globalMaxPoint = { i, j, z };
      }
    }
  }

  // Add global minimum
  if (globalMinPoint) {
    const x = xMin + globalMinPoint.i * xStep;
    const y = yMin + globalMinPoint.j * yStep;
    const scaledX = (x - xOffset) * xScale;
    const scaledY = (y - yOffset) * yScale;
    const scaledZ = (globalMinPoint.z - zOffset) * zScale;
    criticalPoints.push({
      x,
      y,
      z: globalMinPoint.z,
      scaledX,
      scaledY,
      scaledZ,
      type: 'minimum',
    });
  }

  // Add global maximum (if different from minimum)
  if (globalMaxPoint && (!globalMinPoint || globalMaxPoint.z !== globalMinPoint.z)) {
    const x = xMin + globalMaxPoint.i * xStep;
    const y = yMin + globalMaxPoint.j * yStep;
    const scaledX = (x - xOffset) * xScale;
    const scaledY = (y - yOffset) * yScale;
    const scaledZ = (globalMaxPoint.z - zOffset) * zScale;
    criticalPoints.push({
      x,
      y,
      z: globalMaxPoint.z,
      scaledX,
      scaledY,
      scaledZ,
      type: 'maximum',
    });
  }

  // Calculate surface area by summing triangle areas
  let surfaceArea = 0;
  const positionArray = geometry.getAttribute('position').array;
  const indexArray = geometry.getIndex()?.array;

  if (indexArray) {
    for (let i = 0; i < indexArray.length; i += 3) {
      const i0 = indexArray[i] * 3;
      const i1 = indexArray[i + 1] * 3;
      const i2 = indexArray[i + 2] * 3;

      const v0 = new THREE.Vector3(positionArray[i0], positionArray[i0 + 1], positionArray[i0 + 2]);
      const v1 = new THREE.Vector3(positionArray[i1], positionArray[i1 + 1], positionArray[i1 + 2]);
      const v2 = new THREE.Vector3(positionArray[i2], positionArray[i2 + 1], positionArray[i2 + 2]);

      // Triangle area = 0.5 * |AB x AC|
      const ab = new THREE.Vector3().subVectors(v1, v0);
      const ac = new THREE.Vector3().subVectors(v2, v0);
      const cross = new THREE.Vector3().crossVectors(ab, ac);
      surfaceArea += cross.length() * 0.5;
    }
  }

  // Calculate volume under the surface using the trapezoidal rule
  // Volume = ∫∫ z(x,y) dA ≈ Σ z_i * ΔA
  let volume = 0;
  const cellArea = xStep * yStep;

  for (let i = 0; i <= resolution; i++) {
    for (let j = 0; j <= resolution; j++) {
      const z = zValues[i][j];
      if (z !== null) {
        // Use absolute value for total volume (both above and below z=0)
        volume += Math.abs(z) * cellArea;
      }
    }
  }

  // Calculate where z=0 is in Three.js Y coordinates
  const zeroPlaneY = (0 - zOffset) * zScale;

  return { geometry, zMin, zMax, criticalPoints, surfaceArea, volume, zeroPlaneY };
}

// Quick z-range calculation without full geometry generation
export function calculateZRange(
  expression: string,
  xRange: [number, number],
  yRange: [number, number],
  resolution: number,
  zClipRange?: [number, number]
): { zMin: number; zMax: number } | null {
  try {
    const evaluate = createEvaluator(expression);
    const [xMin, xMax] = xRange;
    const [yMin, yMax] = yRange;
    const xStep = (xMax - xMin) / resolution;
    const yStep = (yMax - yMin) / resolution;

    const extremeCap = 1e6;

    let zMin = Infinity;
    let zMax = -Infinity;

    for (let i = 0; i <= resolution; i++) {
      for (let j = 0; j <= resolution; j++) {
        const x = xMin + i * xStep;
        const y = yMin + j * yStep;
        let z = evaluate(x, y);

        // Only filter out truly extreme/infinite values
        if (z !== null && (Math.abs(z) > extremeCap || !isFinite(z))) {
          z = null;
        }

        // Filter out values outside user-specified range
        if (z !== null && zClipRange) {
          if (z < zClipRange[0] || z > zClipRange[1]) {
            z = null;
          }
        }

        if (z !== null) {
          zMin = Math.min(zMin, z);
          zMax = Math.max(zMax, z);
        }
      }
    }

    if (!isFinite(zMin) || !isFinite(zMax)) {
      return null;
    }

    return { zMin, zMax };
  } catch {
    return null;
  }
}
