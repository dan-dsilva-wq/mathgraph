import * as THREE from 'three';
import { createEvaluator, createAnimatedEvaluator } from '../mathParser';
import { getColorForZWithPalette } from './colors';

export type SlicePlane = 'x' | 'y' | 'z';

export interface CrossSectionOptions {
  expression: string;
  plane: SlicePlane;        // Which axis to slice along
  planeValue: number;       // The constant value (e.g., x=2 means plane='x', planeValue=2)
  xRange: [number, number];
  yRange: [number, number];
  zRange: [number, number]; // Needed for z-plane slices
  segments?: number;        // Resolution of the curve
  functionIndex?: number;   // For coloring
  time?: number;           // Animation time
}

export interface CrossSectionResult {
  curveGeometry: THREE.BufferGeometry;  // The 3D curve on the surface
  planeGeometry: THREE.BufferGeometry;  // Semi-transparent cutting plane
  curvePoints: { x: number; y: number; z: number }[];  // Math coordinates for the curve
}

/**
 * Generate a cross-section curve by slicing a surface z=f(x,y) with a plane.
 *
 * - plane='x', planeValue=c: slice at x=c, get z=f(c,y) as y varies
 * - plane='y', planeValue=c: slice at y=c, get z=f(x,c) as x varies
 * - plane='z', planeValue=c: slice at z=c, find contour where f(x,y)=c
 */
export function generateCrossSection(options: CrossSectionOptions): CrossSectionResult {
  const {
    expression,
    plane,
    planeValue,
    xRange,
    yRange,
    zRange,
    segments = 200,
    functionIndex = 0,
    time,
  } = options;

  const rawEvaluate = time !== undefined ? createAnimatedEvaluator(expression) : null;
  const evaluate = time !== undefined && rawEvaluate
    ? (x: number, y: number) => rawEvaluate(x, y, time)
    : createEvaluator(expression);

  const [xMin, xMax] = xRange;
  const [yMin, yMax] = yRange;
  const [zMin, zMax] = zRange;

  // Calculate scaling (same logic as surface3D.ts)
  const targetVisualSize = 10;
  const xSpan = xMax - xMin;
  const ySpan = yMax - yMin;
  const zSpan = zMax - zMin;
  const xScale = xSpan > 0 ? targetVisualSize / xSpan : 1;
  const yScale = ySpan > 0 ? targetVisualSize / ySpan : 1;
  const zScale = zSpan > 0 ? targetVisualSize / zSpan : 1;
  const xOffset = (xMin + xMax) / 2;
  const yOffset = (yMin + yMax) / 2;
  const zOffset = (zMin + zMax) / 2;

  const toVisual = (mx: number, my: number, mz: number): [number, number, number] => {
    return [
      (mx - xOffset) * xScale,
      (mz - zOffset) * zScale,  // Three.js Y = math Z
      (my - yOffset) * yScale,  // Three.js Z = math Y
    ];
  };

  const curvePoints: { x: number; y: number; z: number }[] = [];
  const curveVertices: number[] = [];
  const curveColors: number[] = [];

  if (plane === 'x') {
    // Slice at x = planeValue, parametrize by y
    const yStep = (yMax - yMin) / segments;
    for (let i = 0; i <= segments; i++) {
      const y = yMin + i * yStep;
      const z = evaluate(planeValue, y);
      if (z === null || !isFinite(z)) continue;

      // Clip to z range
      if (z < zMin || z > zMax) continue;

      curvePoints.push({ x: planeValue, y, z });
      const [vx, vy, vz] = toVisual(planeValue, y, z);
      curveVertices.push(vx, vy, vz);

      const color = getColorForZWithPalette(z, zMin, zMax, functionIndex);
      curveColors.push(color.r, color.g, color.b);
    }
  } else if (plane === 'y') {
    // Slice at y = planeValue, parametrize by x
    const xStep = (xMax - xMin) / segments;
    for (let i = 0; i <= segments; i++) {
      const x = xMin + i * xStep;
      const z = evaluate(x, planeValue);
      if (z === null || !isFinite(z)) continue;

      if (z < zMin || z > zMax) continue;

      curvePoints.push({ x, y: planeValue, z });
      const [vx, vy, vz] = toVisual(x, planeValue, z);
      curveVertices.push(vx, vy, vz);

      const color = getColorForZWithPalette(z, zMin, zMax, functionIndex);
      curveColors.push(color.r, color.g, color.b);
    }
  } else {
    // plane === 'z': contour at z = planeValue
    // Use marching squares on a grid to find the contour f(x,y) = planeValue
    const gridRes = Math.min(segments, 150);
    const xStep = (xMax - xMin) / gridRes;
    const yStep = (yMax - yMin) / gridRes;

    // Evaluate grid
    const values: (number | null)[][] = [];
    for (let i = 0; i <= gridRes; i++) {
      values[i] = [];
      for (let j = 0; j <= gridRes; j++) {
        const x = xMin + i * xStep;
        const y = yMin + j * yStep;
        values[i][j] = evaluate(x, y);
      }
    }

    // Marching squares to extract contour
    const contourSegments: [number, number, number, number][] = []; // x1,y1,x2,y2

    for (let i = 0; i < gridRes; i++) {
      for (let j = 0; j < gridRes; j++) {
        const v00 = values[i][j];
        const v10 = values[i + 1][j];
        const v01 = values[i][j + 1];
        const v11 = values[i + 1][j + 1];

        if (v00 === null || v10 === null || v01 === null || v11 === null) continue;

        const x0 = xMin + i * xStep;
        const x1 = xMin + (i + 1) * xStep;
        const y0 = yMin + j * yStep;
        const y1 = yMin + (j + 1) * yStep;

        // Binary classification: above or below the contour level
        const b00 = v00 >= planeValue ? 1 : 0;
        const b10 = v10 >= planeValue ? 1 : 0;
        const b01 = v01 >= planeValue ? 1 : 0;
        const b11 = v11 >= planeValue ? 1 : 0;

        const caseIndex = b00 | (b10 << 1) | (b01 << 2) | (b11 << 3);
        if (caseIndex === 0 || caseIndex === 15) continue;

        // Linear interpolation along edges
        const lerp = (va: number, vb: number, a: number, b: number): number => {
          const t = (planeValue - va) / (vb - va);
          return a + t * (b - a);
        };

        // Edge intersection points (if they exist)
        const bottom = (v00 - planeValue) * (v10 - planeValue) < 0
          ? lerp(v00, v10, x0, x1) : null;
        const top = (v01 - planeValue) * (v11 - planeValue) < 0
          ? lerp(v01, v11, x0, x1) : null;
        const left = (v00 - planeValue) * (v01 - planeValue) < 0
          ? lerp(v00, v01, y0, y1) : null;
        const right = (v10 - planeValue) * (v11 - planeValue) < 0
          ? lerp(v10, v11, y0, y1) : null;

        // Generate line segments based on marching squares cases
        const addSegment = (px1: number, py1: number, px2: number, py2: number) => {
          contourSegments.push([px1, py1, px2, py2]);
        };

        switch (caseIndex) {
          case 1: // only 00 inside
          case 14: // all but 00 inside
            if (bottom !== null && left !== null) addSegment(bottom, y0, x0, left);
            break;
          case 2: // only 10 inside
          case 13:
            if (bottom !== null && right !== null) addSegment(bottom, y0, x1, right);
            break;
          case 3: // 00 and 10 inside
          case 12:
            if (left !== null && right !== null) addSegment(x0, left, x1, right);
            break;
          case 4: // only 01 inside
          case 11:
            if (left !== null && top !== null) addSegment(x0, left, top, y1);
            break;
          case 5: // 00 and 01 inside (ambiguous)
            if (bottom !== null && right !== null) addSegment(bottom, y0, x1, right);
            if (left !== null && top !== null) addSegment(x0, left, top, y1);
            break;
          case 6: // 10 and 01 inside
          case 9:
            if (bottom !== null && top !== null) addSegment(bottom, y0, top, y1);
            break;
          case 7: // all but 11
          case 8: // only 11 inside
            if (right !== null && top !== null) addSegment(x1, right, top, y1);
            break;
          case 10: // 00 and 11 (ambiguous)
            if (bottom !== null && left !== null) addSegment(bottom, y0, x0, left);
            if (right !== null && top !== null) addSegment(x1, right, top, y1);
            break;
        }
      }
    }

    // Convert contour segments to 3D vertices
    const contourColor = getColorForZWithPalette(planeValue, zMin, zMax, functionIndex);
    for (const [sx1, sy1, sx2, sy2] of contourSegments) {
      const [vx1, vy1, vz1] = toVisual(sx1, sy1, planeValue);
      const [vx2, vy2, vz2] = toVisual(sx2, sy2, planeValue);
      curveVertices.push(vx1, vy1, vz1, vx2, vy2, vz2);
      curveColors.push(contourColor.r, contourColor.g, contourColor.b);
      curveColors.push(contourColor.r, contourColor.g, contourColor.b);
      curvePoints.push({ x: sx1, y: sy1, z: planeValue });
      curvePoints.push({ x: sx2, y: sy2, z: planeValue });
    }
  }

  // Build curve geometry
  const curveGeometry = new THREE.BufferGeometry();
  if (curveVertices.length > 0) {
    curveGeometry.setAttribute('position', new THREE.Float32BufferAttribute(curveVertices, 3));
    curveGeometry.setAttribute('color', new THREE.Float32BufferAttribute(curveColors, 3));
  }

  // Build cutting plane geometry (semi-transparent quad)
  const planeGeometry = createCuttingPlane(plane, planeValue, xRange, yRange, zRange, toVisual);

  return { curveGeometry, planeGeometry, curvePoints };
}

function createCuttingPlane(
  plane: SlicePlane,
  planeValue: number,
  xRange: [number, number],
  yRange: [number, number],
  zRange: [number, number],
  toVisual: (mx: number, my: number, mz: number) => [number, number, number],
): THREE.BufferGeometry {
  const [xMin, xMax] = xRange;
  const [yMin, yMax] = yRange;
  const [zMin, zMax] = zRange;

  let corners: [number, number, number][];

  if (plane === 'x') {
    // Plane at x = planeValue, spanning y and z
    corners = [
      toVisual(planeValue, yMin, zMin),
      toVisual(planeValue, yMax, zMin),
      toVisual(planeValue, yMax, zMax),
      toVisual(planeValue, yMin, zMax),
    ];
  } else if (plane === 'y') {
    // Plane at y = planeValue, spanning x and z
    corners = [
      toVisual(xMin, planeValue, zMin),
      toVisual(xMax, planeValue, zMin),
      toVisual(xMax, planeValue, zMax),
      toVisual(xMin, planeValue, zMax),
    ];
  } else {
    // Plane at z = planeValue, spanning x and y
    corners = [
      toVisual(xMin, yMin, planeValue),
      toVisual(xMax, yMin, planeValue),
      toVisual(xMax, yMax, planeValue),
      toVisual(xMin, yMax, planeValue),
    ];
  }

  const vertices = new Float32Array([
    ...corners[0], ...corners[1], ...corners[2],
    ...corners[0], ...corners[2], ...corners[3],
  ]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Generate multiple level curves (contour lines) at evenly spaced z values.
 * Returns geometry for all contour lines combined.
 */
export interface LevelCurvesOptions {
  expression: string;
  xRange: [number, number];
  yRange: [number, number];
  zRange: [number, number];
  numLevels?: number;       // Number of contour levels
  customLevels?: number[];  // Or specify exact z values
  functionIndex?: number;
  time?: number;
}

export interface LevelCurvesResult {
  geometry: THREE.BufferGeometry;         // All contour lines as LineSegments
  projectedGeometry: THREE.BufferGeometry; // Contour lines projected onto z=zMin plane
  levels: number[];                        // The z values used
}

export function generateLevelCurves(options: LevelCurvesOptions): LevelCurvesResult {
  const {
    expression,
    xRange,
    yRange,
    zRange,
    numLevels = 10,
    customLevels,
    functionIndex = 0,
    time,
  } = options;

  const rawEvaluate = time !== undefined ? createAnimatedEvaluator(expression) : null;
  const evaluate = time !== undefined && rawEvaluate
    ? (x: number, y: number) => rawEvaluate(x, y, time)
    : createEvaluator(expression);

  const [xMin, xMax] = xRange;
  const [yMin, yMax] = yRange;
  const [zMin, zMax] = zRange;

  // Scaling
  const targetVisualSize = 10;
  const xSpan = xMax - xMin;
  const ySpan = yMax - yMin;
  const zSpan = zMax - zMin;
  const xScl = xSpan > 0 ? targetVisualSize / xSpan : 1;
  const yScl = ySpan > 0 ? targetVisualSize / ySpan : 1;
  const zScl = zSpan > 0 ? targetVisualSize / zSpan : 1;
  const xOff = (xMin + xMax) / 2;
  const yOff = (yMin + yMax) / 2;
  const zOff = (zMin + zMax) / 2;

  const toVisual = (mx: number, my: number, mz: number): [number, number, number] => [
    (mx - xOff) * xScl,
    (mz - zOff) * zScl,
    (my - yOff) * yScl,
  ];

  // Determine level values
  const levels = customLevels || (() => {
    const result: number[] = [];
    const step = (zMax - zMin) / (numLevels + 1);
    for (let i = 1; i <= numLevels; i++) {
      result.push(zMin + i * step);
    }
    return result;
  })();

  // Evaluate grid once
  const gridRes = 120;
  const xStep = (xMax - xMin) / gridRes;
  const yStep = (yMax - yMin) / gridRes;

  const values: (number | null)[][] = [];
  for (let i = 0; i <= gridRes; i++) {
    values[i] = [];
    for (let j = 0; j <= gridRes; j++) {
      const x = xMin + i * xStep;
      const y = yMin + j * yStep;
      values[i][j] = evaluate(x, y);
    }
  }

  const onSurfaceVerts: number[] = [];
  const onSurfaceColors: number[] = [];
  const projectedVerts: number[] = [];
  const projectedColors: number[] = [];

  // For each level, run marching squares
  for (const level of levels) {
    if (level < zMin || level > zMax) continue;

    const color = getColorForZWithPalette(level, zMin, zMax, functionIndex);
    // Make contour lines slightly brighter
    const brightColor = new THREE.Color(color.r, color.g, color.b);
    brightColor.multiplyScalar(1.3);
    brightColor.r = Math.min(1, brightColor.r);
    brightColor.g = Math.min(1, brightColor.g);
    brightColor.b = Math.min(1, brightColor.b);

    for (let i = 0; i < gridRes; i++) {
      for (let j = 0; j < gridRes; j++) {
        const v00 = values[i][j];
        const v10 = values[i + 1][j];
        const v01 = values[i][j + 1];
        const v11 = values[i + 1][j + 1];

        if (v00 === null || v10 === null || v01 === null || v11 === null) continue;

        const x0 = xMin + i * xStep;
        const x1 = xMin + (i + 1) * xStep;
        const y0 = yMin + j * yStep;
        const y1 = yMin + (j + 1) * yStep;

        const b00 = v00 >= level ? 1 : 0;
        const b10 = v10 >= level ? 1 : 0;
        const b01 = v01 >= level ? 1 : 0;
        const b11 = v11 >= level ? 1 : 0;

        const caseIdx = b00 | (b10 << 1) | (b01 << 2) | (b11 << 3);
        if (caseIdx === 0 || caseIdx === 15) continue;

        const lerp = (va: number, vb: number, a: number, b: number): number => {
          const t = (level - va) / (vb - va);
          return a + t * (b - a);
        };

        const bottom = (v00 - level) * (v10 - level) < 0 ? lerp(v00, v10, x0, x1) : null;
        const top = (v01 - level) * (v11 - level) < 0 ? lerp(v01, v11, x0, x1) : null;
        const left = (v00 - level) * (v01 - level) < 0 ? lerp(v00, v01, y0, y1) : null;
        const right = (v10 - level) * (v11 - level) < 0 ? lerp(v10, v11, y0, y1) : null;

        const addSeg = (px1: number, py1: number, px2: number, py2: number) => {
          // On-surface contour (at z = level)
          const [vx1, vy1, vz1] = toVisual(px1, py1, level);
          const [vx2, vy2, vz2] = toVisual(px2, py2, level);
          onSurfaceVerts.push(vx1, vy1, vz1, vx2, vy2, vz2);
          onSurfaceColors.push(brightColor.r, brightColor.g, brightColor.b);
          onSurfaceColors.push(brightColor.r, brightColor.g, brightColor.b);

          // Projected contour (at z = zMin, i.e., the floor)
          const [pvx1, pvy1, pvz1] = toVisual(px1, py1, zMin);
          const [pvx2, pvy2, pvz2] = toVisual(px2, py2, zMin);
          projectedVerts.push(pvx1, pvy1, pvz1, pvx2, pvy2, pvz2);
          projectedColors.push(brightColor.r, brightColor.g, brightColor.b);
          projectedColors.push(brightColor.r, brightColor.g, brightColor.b);
        };

        switch (caseIdx) {
          case 1: case 14:
            if (bottom !== null && left !== null) addSeg(bottom, y0, x0, left);
            break;
          case 2: case 13:
            if (bottom !== null && right !== null) addSeg(bottom, y0, x1, right);
            break;
          case 3: case 12:
            if (left !== null && right !== null) addSeg(x0, left, x1, right);
            break;
          case 4: case 11:
            if (left !== null && top !== null) addSeg(x0, left, top, y1);
            break;
          case 5:
            if (bottom !== null && right !== null) addSeg(bottom, y0, x1, right);
            if (left !== null && top !== null) addSeg(x0, left, top, y1);
            break;
          case 6: case 9:
            if (bottom !== null && top !== null) addSeg(bottom, y0, top, y1);
            break;
          case 7: case 8:
            if (right !== null && top !== null) addSeg(x1, right, top, y1);
            break;
          case 10:
            if (bottom !== null && left !== null) addSeg(bottom, y0, x0, left);
            if (right !== null && top !== null) addSeg(x1, right, top, y1);
            break;
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  if (onSurfaceVerts.length > 0) {
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(onSurfaceVerts, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(onSurfaceColors, 3));
  }

  const projectedGeometry = new THREE.BufferGeometry();
  if (projectedVerts.length > 0) {
    projectedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(projectedVerts, 3));
    projectedGeometry.setAttribute('color', new THREE.Float32BufferAttribute(projectedColors, 3));
  }

  return { geometry, projectedGeometry, levels };
}
