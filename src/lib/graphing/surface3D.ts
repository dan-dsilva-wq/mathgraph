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

export interface CriticalPoint {
  x: number;
  y: number;
  z: number;
  scaledZ: number; // For 3D positioning
  type: 'minimum' | 'maximum' | 'saddle';
}

interface SurfaceResult {
  geometry: THREE.BufferGeometry;
  zMin: number;
  zMax: number;
  criticalPoints: CriticalPoint[];
  surfaceArea: number;
  zeroPlaneY: number; // Where z=0 is in Three.js Y coordinates
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

  // Find global minimum and maximum
  const criticalPoints: CriticalPoint[] = [];

  let globalMinPoint: { i: number; j: number; z: number } | null = null;
  let globalMaxPoint: { i: number; j: number; z: number } | null = null;

  for (let i = 0; i <= resolution; i++) {
    for (let j = 0; j <= resolution; j++) {
      const z = zValues[i][j];
      if (z === null) continue;

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
    const scaledZ = (globalMinPoint.z - zOffset) * zScale;
    criticalPoints.push({
      x,
      y,
      z: globalMinPoint.z,
      scaledZ,
      type: 'minimum',
    });
  }

  // Add global maximum (if different from minimum)
  if (globalMaxPoint && (!globalMinPoint || globalMaxPoint.z !== globalMinPoint.z)) {
    const x = xMin + globalMaxPoint.i * xStep;
    const y = yMin + globalMaxPoint.j * yStep;
    const scaledZ = (globalMaxPoint.z - zOffset) * zScale;
    criticalPoints.push({
      x,
      y,
      z: globalMaxPoint.z,
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

  // Calculate where z=0 is in Three.js Y coordinates
  const zeroPlaneY = (0 - zOffset) * zScale;

  return { geometry, zMin, zMax, criticalPoints, surfaceArea, zeroPlaneY };
}
