import * as THREE from 'three';
import { createEvaluator } from '../mathParser';
import { getColorForZWithPalette, getUndefinedColor } from './colors';

interface SurfaceOptions {
  expression: string;
  xRange: [number, number];
  yRange: [number, number];
  resolution: number;
  functionIndex?: number; // For multi-function coloring
}

interface SurfaceResult {
  geometry: THREE.BufferGeometry;
  zMin: number;
  zMax: number;
}

export function generateSurface(options: SurfaceOptions): SurfaceResult {
  const { expression, xRange, yRange, resolution, functionIndex = 0 } = options;
  const evaluate = createEvaluator(expression);

  const [xMin, xMax] = xRange;
  const [yMin, yMax] = yRange;

  const xStep = (xMax - xMin) / resolution;
  const yStep = (yMax - yMin) / resolution;

  // Calculate the visual scale based on x/y ranges
  const xSpan = xMax - xMin;
  const ySpan = yMax - yMin;
  const targetZSpan = Math.max(xSpan, ySpan); // Z should fit proportionally

  // First pass: calculate all z values and find min/max
  const zValues: (number | null)[][] = [];
  let zMin = Infinity;
  let zMax = -Infinity;

  for (let i = 0; i <= resolution; i++) {
    zValues[i] = [];
    for (let j = 0; j <= resolution; j++) {
      const x = xMin + i * xStep;
      const y = yMin + j * yStep;
      const z = evaluate(x, y);
      zValues[i][j] = z;

      if (z !== null) {
        zMin = Math.min(zMin, z);
        zMax = Math.max(zMax, z);
      }
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

  // Calculate z scaling factor to fit proportionally
  const actualZSpan = zMax - zMin;
  const zScale = actualZSpan > 0 ? targetZSpan / actualZSpan : 1;
  const zOffset = (zMin + zMax) / 2; // Center the surface

  // Second pass: build geometry with scaled z values
  const vertices: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  // Create vertices
  for (let i = 0; i <= resolution; i++) {
    for (let j = 0; j <= resolution; j++) {
      const x = xMin + i * xStep;
      const y = yMin + j * yStep;
      const z = zValues[i][j];

      // Scale and center z values for better visualization
      const scaledZ = z !== null ? (z - zOffset) * zScale : 0;
      vertices.push(x, scaledZ, y);

      // Color based on original z value (not scaled), using function-specific palette
      const color = z !== null ? getColorForZWithPalette(z, zMin, zMax, functionIndex) : getUndefinedColor();
      colors.push(color.r, color.g, color.b);
    }
  }

  // Create triangles
  for (let i = 0; i < resolution; i++) {
    for (let j = 0; j < resolution; j++) {
      const a = i * (resolution + 1) + j;
      const b = a + 1;
      const c = a + (resolution + 1);
      const d = c + 1;

      // Only create triangles if at least some vertices are valid
      const zA = zValues[i][j];
      const zB = zValues[i][j + 1];
      const zC = zValues[i + 1][j];
      const zD = zValues[i + 1][j + 1];

      // Skip triangles where all vertices are undefined
      // Use consistent counterclockwise winding for proper normals
      if (zA !== null || zB !== null || zC !== null) {
        indices.push(a, c, b);
      }
      if (zB !== null || zC !== null || zD !== null) {
        indices.push(b, c, d);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return { geometry, zMin, zMax };
}
