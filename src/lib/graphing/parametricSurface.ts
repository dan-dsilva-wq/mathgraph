import * as THREE from 'three';
import { createParametricEvaluator, createAnimatedParametricEvaluator } from '../mathParser';
import { getColorForZWithPalette, getUndefinedColor } from './colors';

export interface ParametricSurfaceOptions {
  xExpr: string;  // x(u,v) or x(u,v,t)
  yExpr: string;  // y(u,v) or y(u,v,t)
  zExpr: string;  // z(u,v) or z(u,v,t)
  uRange: [number, number];
  vRange: [number, number];
  resolution: number;
  functionIndex?: number;
  time?: number;  // Time parameter for animation
}

export interface ParametricSurfaceResult {
  geometry: THREE.BufferGeometry;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
  // Bounding box in math coordinates for camera positioning
  boundingBox: {
    center: THREE.Vector3;
    size: THREE.Vector3;
  };
  transform: {
    xScale: number;
    yScale: number;
    zScale: number;
    xOffset: number;
    yOffset: number;
    zOffset: number;
  };
}

export function generateParametricSurface(options: ParametricSurfaceOptions): ParametricSurfaceResult {
  const { xExpr, yExpr, zExpr, uRange, vRange, resolution, functionIndex = 0, time } = options;

  // Use animated evaluators when time is provided
  const rawEvalX = time !== undefined ? createAnimatedParametricEvaluator(xExpr) : null;
  const rawEvalY = time !== undefined ? createAnimatedParametricEvaluator(yExpr) : null;
  const rawEvalZ = time !== undefined ? createAnimatedParametricEvaluator(zExpr) : null;

  const evalX = time !== undefined && rawEvalX
    ? (u: number, v: number) => rawEvalX(u, v, time)
    : createParametricEvaluator(xExpr);
  const evalY = time !== undefined && rawEvalY
    ? (u: number, v: number) => rawEvalY(u, v, time)
    : createParametricEvaluator(yExpr);
  const evalZ = time !== undefined && rawEvalZ
    ? (u: number, v: number) => rawEvalZ(u, v, time)
    : createParametricEvaluator(zExpr);

  const [uMin, uMax] = uRange;
  const [vMin, vMax] = vRange;
  const uStep = (uMax - uMin) / resolution;
  const vStep = (vMax - vMin) / resolution;

  const extremeCap = 1e6;

  // First pass: evaluate all points and find bounds
  const points: ({ x: number; y: number; z: number } | null)[][] = [];
  let xMin = Infinity, xMax = -Infinity;
  let yMin = Infinity, yMax = -Infinity;
  let zMin = Infinity, zMax = -Infinity;

  for (let i = 0; i <= resolution; i++) {
    points[i] = [];
    for (let j = 0; j <= resolution; j++) {
      const u = uMin + i * uStep;
      const v = vMin + j * vStep;

      const x = evalX(u, v);
      const y = evalY(u, v);
      const z = evalZ(u, v);

      if (x === null || y === null || z === null ||
          !isFinite(x) || !isFinite(y) || !isFinite(z) ||
          Math.abs(x) > extremeCap || Math.abs(y) > extremeCap || Math.abs(z) > extremeCap) {
        points[i][j] = null;
        continue;
      }

      points[i][j] = { x, y, z };
      xMin = Math.min(xMin, x);
      xMax = Math.max(xMax, x);
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
      zMin = Math.min(zMin, z);
      zMax = Math.max(zMax, z);
    }
  }

  // Handle degenerate cases
  if (!isFinite(xMin)) { xMin = -1; xMax = 1; }
  if (!isFinite(yMin)) { yMin = -1; yMax = 1; }
  if (!isFinite(zMin)) { zMin = -1; zMax = 1; }
  if (xMin === xMax) { xMin -= 1; xMax += 1; }
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  if (zMin === zMax) { zMin -= 1; zMax += 1; }

  // Normalize to target visual size, centered at origin
  const targetVisualSize = 10;
  const xSpan = xMax - xMin;
  const ySpan = yMax - yMin;
  const zSpan = zMax - zMin;
  const maxSpan = Math.max(xSpan, ySpan, zSpan);

  // Uniform scaling so the shape isn't distorted
  const scale = maxSpan > 0 ? targetVisualSize / maxSpan : 1;
  const xOffset = (xMin + xMax) / 2;
  const yOffset = (yMin + yMax) / 2;
  const zOffset = (zMin + zMax) / 2;

  // Second pass: build geometry
  const vertices: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= resolution; i++) {
    for (let j = 0; j <= resolution; j++) {
      const pt = points[i][j];

      if (pt) {
        const scaledX = (pt.x - xOffset) * scale;
        const scaledY = (pt.y - yOffset) * scale;
        const scaledZ = (pt.z - zOffset) * scale;

        // Three.js coords: x = math x, y = math z (up), z = math y (depth)
        vertices.push(scaledX, scaledZ, scaledY);

        // Color based on z value
        const color = getColorForZWithPalette(pt.z, zMin, zMax, functionIndex);
        colors.push(color.r, color.g, color.b);
      } else {
        // Placeholder vertex for null points (won't be in any triangle)
        vertices.push(0, 0, 0);
        const color = getUndefinedColor();
        colors.push(color.r, color.g, color.b);
      }
    }
  }

  // Create triangles
  const getIdx = (i: number, j: number): number => i * (resolution + 1) + j;

  for (let i = 0; i < resolution; i++) {
    for (let j = 0; j < resolution; j++) {
      const p00 = points[i][j];
      const p10 = points[i + 1][j];
      const p01 = points[i][j + 1];
      const p11 = points[i + 1][j + 1];

      const a = getIdx(i, j);
      const b = getIdx(i + 1, j);
      const c = getIdx(i, j + 1);
      const d = getIdx(i + 1, j + 1);

      // Triangle 1: a-b-c
      if (p00 && p10 && p01) {
        indices.push(a, b, c);
      }
      // Triangle 2: b-d-c
      if (p10 && p11 && p01) {
        indices.push(b, d, c);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const center = new THREE.Vector3(0, 0, 0);
  const size = new THREE.Vector3(
    xSpan * scale,
    zSpan * scale,
    ySpan * scale
  );

  return {
    geometry,
    xMin, xMax,
    yMin, yMax,
    zMin, zMax,
    boundingBox: { center, size },
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
