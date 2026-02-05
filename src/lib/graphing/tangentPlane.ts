import * as THREE from 'three';
import { createEvaluator, createAnimatedEvaluator, createDerivativeEvaluators } from '../mathParser';

export interface TangentPlaneOptions {
  expression: string;
  pointX: number;       // Math x coordinate of the point
  pointY: number;       // Math y coordinate of the point
  xRange: [number, number];
  yRange: [number, number];
  zRange: [number, number]; // For scaling
  planeSize?: number;   // Size of the tangent plane (in math units)
  time?: number;
}

export interface TangentPlaneResult {
  // The point on the surface
  point: { x: number; y: number; z: number };
  // Partial derivatives at the point
  dzdx: number;
  dzdy: number;
  // The tangent plane equation: z = z0 + dz/dx * (x - x0) + dz/dy * (y - y0)
  planeEquation: string;
  // Normal vector (not normalized)
  normal: { x: number; y: number; z: number };
  // Gradient vector (2D: lies in xy plane, points uphill)
  gradient: { x: number; y: number; magnitude: number };
  // Three.js geometries
  planeGeometry: THREE.BufferGeometry;      // Tangent plane mesh
  normalLineGeometry: THREE.BufferGeometry;  // Normal vector line
  gradientLineGeometry: THREE.BufferGeometry; // Gradient arrow on surface
  pointGeometry: THREE.BufferGeometry;       // Sphere at the point
}

/**
 * Compute the tangent plane, normal vector, and gradient at a given point on z=f(x,y).
 */
export function generateTangentPlane(options: TangentPlaneOptions): TangentPlaneResult | null {
  const {
    expression,
    pointX,
    pointY,
    xRange,
    yRange,
    zRange,
    planeSize = 2,
    time,
  } = options;

  // Evaluate z at the point
  const rawEvaluate = time !== undefined ? createAnimatedEvaluator(expression) : null;
  const evaluate = time !== undefined && rawEvaluate
    ? (x: number, y: number) => rawEvaluate(x, y, time)
    : createEvaluator(expression);

  const z = evaluate(pointX, pointY);
  if (z === null || !isFinite(z)) return null;

  // Compute partial derivatives
  // Try symbolic derivatives first, fall back to numerical
  let dzdx: number;
  let dzdy: number;

  const derivs = createDerivativeEvaluators(expression);
  if (derivs) {
    const dx = derivs.dzdx(pointX, pointY);
    const dy = derivs.dzdy(pointX, pointY);
    if (dx !== null && dy !== null && isFinite(dx) && isFinite(dy)) {
      dzdx = dx;
      dzdy = dy;
    } else {
      // Numerical fallback
      const h = 1e-6;
      const zxp = evaluate(pointX + h, pointY);
      const zxm = evaluate(pointX - h, pointY);
      const zyp = evaluate(pointX, pointY + h);
      const zym = evaluate(pointX, pointY - h);
      if (zxp === null || zxm === null || zyp === null || zym === null) return null;
      dzdx = (zxp - zxm) / (2 * h);
      dzdy = (zyp - zym) / (2 * h);
    }
  } else {
    // Numerical derivatives
    const h = 1e-6;
    const zxp = evaluate(pointX + h, pointY);
    const zxm = evaluate(pointX - h, pointY);
    const zyp = evaluate(pointX, pointY + h);
    const zym = evaluate(pointX, pointY - h);
    if (zxp === null || zxm === null || zyp === null || zym === null) return null;
    dzdx = (zxp - zxm) / (2 * h);
    dzdy = (zyp - zym) / (2 * h);
  }

  if (!isFinite(dzdx) || !isFinite(dzdy)) return null;

  // The tangent plane: z = z0 + dzdx*(x - x0) + dzdy*(y - y0)
  const planeEquation = formatPlaneEquation(z, dzdx, dzdy, pointX, pointY);

  // Normal vector to the surface: n = (-dz/dx, -dz/dy, 1)
  const normal = { x: -dzdx, y: -dzdy, z: 1 };

  // Gradient vector: grad f = (dz/dx, dz/dy) - points in direction of steepest ascent
  const gradMag = Math.sqrt(dzdx * dzdx + dzdy * dzdy);
  const gradient = { x: dzdx, y: dzdy, magnitude: gradMag };

  // === Build Three.js geometries ===
  // Scaling (same as surface3D.ts)
  const [xMin, xMax] = xRange;
  const [yMin, yMax] = yRange;
  const [zMin, zMax] = zRange;

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

  const toVisual = (mx: number, my: number, mz: number): [number, number, number] => [
    (mx - xOffset) * xScale,
    (mz - zOffset) * zScale,  // Three.js Y = math Z
    (my - yOffset) * yScale,  // Three.js Z = math Y
  ];

  // --- Tangent plane (a quad centered at the point) ---
  // The plane is defined by z = z0 + dzdx*(x - x0) + dzdy*(y - y0)
  // We create a square in the (x,y) plane and compute z for each corner
  const halfSize = planeSize / 2;
  const corners = [
    [-halfSize, -halfSize],
    [halfSize, -halfSize],
    [halfSize, halfSize],
    [-halfSize, halfSize],
  ].map(([dx, dy]) => {
    const cx = pointX + dx;
    const cy = pointY + dy;
    const cz = z + dzdx * dx + dzdy * dy;
    return toVisual(cx, cy, cz);
  });

  const planeVertices = new Float32Array([
    ...corners[0], ...corners[1], ...corners[2],
    ...corners[0], ...corners[2], ...corners[3],
  ]);
  const planeGeometry = new THREE.BufferGeometry();
  planeGeometry.setAttribute('position', new THREE.BufferAttribute(planeVertices, 3));
  planeGeometry.computeVertexNormals();

  // --- Normal vector line ---
  const [px, py, pz] = toVisual(pointX, pointY, z);

  // Scale the normal for visual display
  // Normalize then scale to a fixed visual length
  const normalLength = 2; // visual units
  const nMag = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
  const nxDir = normal.x / nMag;
  const nyDir = normal.y / nMag;
  const nzDir = normal.z / nMag;

  // Convert the direction from math space to visual space
  const normalEndMath = {
    x: pointX + nxDir * normalLength / xScale,
    y: pointY + nyDir * normalLength / yScale,
    z: z + nzDir * normalLength / zScale,
  };
  const [nex, ney, nez] = toVisual(normalEndMath.x, normalEndMath.y, normalEndMath.z);

  const normalVerts = new Float32Array([px, py, pz, nex, ney, nez]);
  const normalLineGeometry = new THREE.BufferGeometry();
  normalLineGeometry.setAttribute('position', new THREE.BufferAttribute(normalVerts, 3));

  // --- Gradient vector (lies on the surface, projects onto xy plane) ---
  let gradientLineGeometry: THREE.BufferGeometry;
  if (gradMag > 1e-8) {
    // Gradient direction in math coords
    const gxDir = dzdx / gradMag;
    const gyDir = dzdy / gradMag;

    // The gradient arrow length (in visual units)
    const gradVisualLength = 2;
    const gradEndMath = {
      x: pointX + gxDir * gradVisualLength / xScale,
      y: pointY + gyDir * gradVisualLength / yScale,
      // z follows the surface at the endpoint
      z: z + dzdx * (gxDir * gradVisualLength / xScale) + dzdy * (gyDir * gradVisualLength / yScale),
    };
    const [gex, gey, gez] = toVisual(gradEndMath.x, gradEndMath.y, gradEndMath.z);

    // Build the arrow: shaft + arrowhead lines
    // Main shaft
    const gradVerts: number[] = [px, py, pz, gex, gey, gez];

    // Arrowhead - two small lines from the tip
    const arrowSize = 0.3;
    const dx = gex - px;
    const dy = gey - py;
    const dz = gez - pz;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len > 0.01) {
      const ux = dx / len;
      const uy = dy / len;
      const uz = dz / len;

      // Perpendicular in the XZ plane (Three.js coords)
      const perpX = -uz;
      const perpZ = ux;
      const perpLen = Math.sqrt(perpX * perpX + perpZ * perpZ);
      if (perpLen > 0.001) {
        const px1 = perpX / perpLen;
        const pz1 = perpZ / perpLen;

        // Two arrowhead lines
        gradVerts.push(
          gex, gey, gez,
          gex - ux * arrowSize + px1 * arrowSize * 0.4,
          gey - uy * arrowSize,
          gez - uz * arrowSize + pz1 * arrowSize * 0.4,
        );
        gradVerts.push(
          gex, gey, gez,
          gex - ux * arrowSize - px1 * arrowSize * 0.4,
          gey - uy * arrowSize,
          gez - uz * arrowSize - pz1 * arrowSize * 0.4,
        );
      }
    }

    gradientLineGeometry = new THREE.BufferGeometry();
    gradientLineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gradVerts, 3));
  } else {
    gradientLineGeometry = new THREE.BufferGeometry();
  }

  // --- Point sphere geometry (small sphere at the clicked point) ---
  const pointGeometry = new THREE.SphereGeometry(0.12, 16, 16);
  // Position will be set via mesh.position in the renderer

  return {
    point: { x: pointX, y: pointY, z },
    dzdx,
    dzdy,
    planeEquation,
    normal,
    gradient,
    planeGeometry,
    normalLineGeometry,
    gradientLineGeometry,
    pointGeometry,
  };
}

function formatPlaneEquation(z0: number, dzdx: number, dzdy: number, x0: number, y0: number): string {
  const fmt = (n: number) => {
    if (Math.abs(n) < 1e-10) return '0';
    if (Math.abs(n - Math.round(n)) < 1e-10) return Math.round(n).toString();
    return n.toFixed(4);
  };

  let eq = `z = ${fmt(z0)}`;

  if (Math.abs(dzdx) > 1e-10) {
    const sign = dzdx > 0 ? '+' : '-';
    const coeff = Math.abs(dzdx);
    const coeffStr = Math.abs(coeff - 1) < 1e-10 ? '' : fmt(coeff);
    if (Math.abs(x0) < 1e-10) {
      eq += ` ${sign} ${coeffStr}x`;
    } else {
      eq += ` ${sign} ${coeffStr}(x ${x0 > 0 ? '-' : '+'} ${fmt(Math.abs(x0))})`;
    }
  }

  if (Math.abs(dzdy) > 1e-10) {
    const sign = dzdy > 0 ? '+' : '-';
    const coeff = Math.abs(dzdy);
    const coeffStr = Math.abs(coeff - 1) < 1e-10 ? '' : fmt(coeff);
    if (Math.abs(y0) < 1e-10) {
      eq += ` ${sign} ${coeffStr}y`;
    } else {
      eq += ` ${sign} ${coeffStr}(y ${y0 > 0 ? '-' : '+'} ${fmt(Math.abs(y0))})`;
    }
  }

  return eq;
}
