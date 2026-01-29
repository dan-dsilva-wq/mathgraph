/**
 * Volume Geometry Generator
 *
 * Creates a closed 6-face mesh representing the enclosed volume defined by
 * the intersection of fill regions from two surfaces.
 *
 * For each surface, you can specify whether to fill "above" or "below" it:
 * - 'below' means the region where z < f(x,y)
 * - 'above' means the region where z > f(x,y)
 *
 * The volume is the intersection of these two regions.
 *
 * Example: surface1='below', surface2='above' creates the region where
 * z < f1(x,y) AND z > f2(x,y), i.e., between f2 (bottom) and f1 (top)
 */

export interface VolumeGeometryResult {
  positions: Float32Array;  // vertex positions (x, y, z)
  indices: Uint32Array;     // triangle indices
  normals: Float32Array;    // vertex normals for lighting
}

export interface VolumeTransform {
  xScale: number;
  yScale: number;
  zScale: number;
  xOffset: number;
  yOffset: number;
  zOffset: number;
}

export type FillDirection = 'above' | 'below';

export interface SurfaceConstraint {
  evaluate: (x: number, y: number) => number | null;
  fillDirection: FillDirection;
}

/**
 * Generate a closed mesh representing the volume defined by fill direction constraints.
 * Supports any number of surfaces - the volume is the intersection of all constraints.
 *
 * @param surfaces - Array of surface evaluators with their fill directions
 * @param xRange - [xMin, xMax] domain bounds
 * @param yRange - [yMin, yMax] domain bounds
 * @param zRange - [zMin, zMax] for clamping z values
 * @param resolution - Grid resolution for sampling
 * @param transform - Coordinate transformation to match surface rendering
 * @returns VolumeGeometryResult or null if no valid volume exists
 */
export function generateClosedVolumeGeometry(
  surfaces: SurfaceConstraint[],
  xRange: [number, number],
  yRange: [number, number],
  zRange: [number, number] | null,
  resolution: number,
  transform: VolumeTransform
): VolumeGeometryResult | null {
  if (surfaces.length === 0) return null;

  const [xMin, xMax] = xRange;
  const [yMin, yMax] = yRange;
  const [zClipMin, zClipMax] = zRange || [-Infinity, Infinity];

  const xStep = (xMax - xMin) / resolution;
  const yStep = (yMax - yMin) / resolution;

  // Sample all surfaces and compute the intersection region at each grid point
  // Each surface with 'below' contributes an upper bound (z < f)
  // Each surface with 'above' contributes a lower bound (z > f)
  // The intersection gives us the top and bottom of the enclosed volume
  const gridData: ({ top: number; bottom: number } | null)[][] = [];

  for (let i = 0; i <= resolution; i++) {
    gridData[i] = [];
    for (let j = 0; j <= resolution; j++) {
      const x = xMin + i * xStep;
      const y = yMin + j * yStep;

      let top = Infinity;
      let bottom = -Infinity;
      let valid = true;

      // Apply constraints from each surface
      for (const surface of surfaces) {
        const z = surface.evaluate(x, y);
        if (z === null || !isFinite(z)) {
          valid = false;
          break;
        }

        if (surface.fillDirection === 'below') {
          // z < f -> upper bound
          top = Math.min(top, z);
        } else {
          // z > f -> lower bound
          bottom = Math.max(bottom, z);
        }
      }

      if (!valid) {
        gridData[i][j] = null;
        continue;
      }

      // Apply z clipping
      top = Math.min(top, zClipMax);
      bottom = Math.max(bottom, zClipMin);

      // Skip if no valid region (top must be > bottom)
      if (top <= bottom || !isFinite(top) || !isFinite(bottom)) {
        gridData[i][j] = null;
        continue;
      }

      gridData[i][j] = { top, bottom };
    }
  }

  // Build mesh data
  const positions: number[] = [];
  const indices: number[] = [];

  // Vertex index lookup for top and bottom surfaces
  // -1 means no vertex at this location
  const topVertexIndex: number[][] = [];
  const bottomVertexIndex: number[][] = [];

  // Helper to add a vertex and return its index
  const addVertex = (x: number, y: number, z: number): number => {
    const { xScale, yScale, zScale, xOffset, yOffset, zOffset } = transform;
    const scaledX = (x - xOffset) * xScale;
    const scaledY = (y - yOffset) * yScale;
    const scaledZ = (z - zOffset) * zScale;

    // Three.js coordinates: x = scaledX, y = scaledZ (up), z = scaledY (depth)
    positions.push(scaledX, scaledZ, scaledY);
    return (positions.length / 3) - 1;
  };

  // 1. Create vertices for top and bottom surfaces
  for (let i = 0; i <= resolution; i++) {
    topVertexIndex[i] = [];
    bottomVertexIndex[i] = [];
    for (let j = 0; j <= resolution; j++) {
      const data = gridData[i][j];
      const x = xMin + i * xStep;
      const y = yMin + j * yStep;

      if (data === null) {
        topVertexIndex[i][j] = -1;
        bottomVertexIndex[i][j] = -1;
      } else {
        topVertexIndex[i][j] = addVertex(x, y, data.top);
        bottomVertexIndex[i][j] = addVertex(x, y, data.bottom);
      }
    }
  }

  // 2. Create triangles for top surface (facing up, CCW when viewed from above)
  for (let i = 0; i < resolution; i++) {
    for (let j = 0; j < resolution; j++) {
      const t00 = topVertexIndex[i][j];
      const t10 = topVertexIndex[i + 1][j];
      const t01 = topVertexIndex[i][j + 1];
      const t11 = topVertexIndex[i + 1][j + 1];

      if (t00 >= 0 && t10 >= 0 && t01 >= 0 && t11 >= 0) {
        // Two triangles per quad, CCW winding for upward-facing normal
        indices.push(t00, t01, t10);
        indices.push(t10, t01, t11);
      }
    }
  }

  // 3. Create triangles for bottom surface (facing down, reverse winding)
  for (let i = 0; i < resolution; i++) {
    for (let j = 0; j < resolution; j++) {
      const b00 = bottomVertexIndex[i][j];
      const b10 = bottomVertexIndex[i + 1][j];
      const b01 = bottomVertexIndex[i][j + 1];
      const b11 = bottomVertexIndex[i + 1][j + 1];

      if (b00 >= 0 && b10 >= 0 && b01 >= 0 && b11 >= 0) {
        // Two triangles per quad, CW winding for downward-facing normal
        indices.push(b00, b10, b01);
        indices.push(b10, b11, b01);
      }
    }
  }

  // 4. Create wall at x = xMin (i = 0)
  for (let j = 0; j < resolution; j++) {
    const data0 = gridData[0][j];
    const data1 = gridData[0][j + 1];

    if (data0 !== null && data1 !== null) {
      const y0 = yMin + j * yStep;
      const y1 = yMin + (j + 1) * yStep;

      // Wall quad: 4 vertices (top0, top1, bottom1, bottom0)
      const wt0 = addVertex(xMin, y0, data0.top);
      const wt1 = addVertex(xMin, y1, data1.top);
      const wb0 = addVertex(xMin, y0, data0.bottom);
      const wb1 = addVertex(xMin, y1, data1.bottom);

      // Two triangles, facing -x direction
      indices.push(wt0, wb0, wt1);
      indices.push(wt1, wb0, wb1);
    }
  }

  // 5. Create wall at x = xMax (i = resolution)
  for (let j = 0; j < resolution; j++) {
    const data0 = gridData[resolution][j];
    const data1 = gridData[resolution][j + 1];

    if (data0 !== null && data1 !== null) {
      const y0 = yMin + j * yStep;
      const y1 = yMin + (j + 1) * yStep;

      // Wall quad facing +x direction
      const wt0 = addVertex(xMax, y0, data0.top);
      const wt1 = addVertex(xMax, y1, data1.top);
      const wb0 = addVertex(xMax, y0, data0.bottom);
      const wb1 = addVertex(xMax, y1, data1.bottom);

      // Two triangles, facing +x direction (reverse winding from xMin wall)
      indices.push(wt0, wt1, wb0);
      indices.push(wt1, wb1, wb0);
    }
  }

  // 6. Create wall at y = yMin (j = 0)
  for (let i = 0; i < resolution; i++) {
    const data0 = gridData[i][0];
    const data1 = gridData[i + 1][0];

    if (data0 !== null && data1 !== null) {
      const x0 = xMin + i * xStep;
      const x1 = xMin + (i + 1) * xStep;

      // Wall quad facing -y direction
      const wt0 = addVertex(x0, yMin, data0.top);
      const wt1 = addVertex(x1, yMin, data1.top);
      const wb0 = addVertex(x0, yMin, data0.bottom);
      const wb1 = addVertex(x1, yMin, data1.bottom);

      // Two triangles, facing -y direction
      indices.push(wt0, wt1, wb0);
      indices.push(wt1, wb1, wb0);
    }
  }

  // 7. Create wall at y = yMax (j = resolution)
  for (let i = 0; i < resolution; i++) {
    const data0 = gridData[i][resolution];
    const data1 = gridData[i + 1][resolution];

    if (data0 !== null && data1 !== null) {
      const x0 = xMin + i * xStep;
      const x1 = xMin + (i + 1) * xStep;

      // Wall quad facing +y direction
      const wt0 = addVertex(x0, yMax, data0.top);
      const wt1 = addVertex(x1, yMax, data1.top);
      const wb0 = addVertex(x0, yMax, data0.bottom);
      const wb1 = addVertex(x1, yMax, data1.bottom);

      // Two triangles, facing +y direction (reverse winding from yMin wall)
      indices.push(wt0, wb0, wt1);
      indices.push(wt1, wb0, wb1);
    }
  }

  // Return null if no geometry was created
  if (positions.length === 0 || indices.length === 0) {
    return null;
  }

  // Convert to typed arrays
  const positionsArray = new Float32Array(positions);
  const indicesArray = new Uint32Array(indices);

  // Compute vertex normals
  const normals = computeNormals(positionsArray, indicesArray);

  return {
    positions: positionsArray,
    indices: indicesArray,
    normals,
  };
}

/**
 * Compute vertex normals from positions and indices using face-weighted averaging.
 */
function computeNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const vertexCount = positions.length / 3;
  const normals = new Float32Array(vertexCount * 3);

  // Accumulate face normals to each vertex
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i];
    const i1 = indices[i + 1];
    const i2 = indices[i + 2];

    // Get vertex positions
    const v0x = positions[i0 * 3];
    const v0y = positions[i0 * 3 + 1];
    const v0z = positions[i0 * 3 + 2];

    const v1x = positions[i1 * 3];
    const v1y = positions[i1 * 3 + 1];
    const v1z = positions[i1 * 3 + 2];

    const v2x = positions[i2 * 3];
    const v2y = positions[i2 * 3 + 1];
    const v2z = positions[i2 * 3 + 2];

    // Compute edge vectors
    const e1x = v1x - v0x;
    const e1y = v1y - v0y;
    const e1z = v1z - v0z;

    const e2x = v2x - v0x;
    const e2y = v2y - v0y;
    const e2z = v2z - v0z;

    // Cross product for face normal
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    // Add to each vertex's normal accumulator
    normals[i0 * 3] += nx;
    normals[i0 * 3 + 1] += ny;
    normals[i0 * 3 + 2] += nz;

    normals[i1 * 3] += nx;
    normals[i1 * 3 + 1] += ny;
    normals[i1 * 3 + 2] += nz;

    normals[i2 * 3] += nx;
    normals[i2 * 3 + 1] += ny;
    normals[i2 * 3 + 2] += nz;
  }

  // Normalize all vertex normals
  for (let i = 0; i < vertexCount; i++) {
    const x = normals[i * 3];
    const y = normals[i * 3 + 1];
    const z = normals[i * 3 + 2];

    const length = Math.sqrt(x * x + y * y + z * z);
    if (length > 0) {
      normals[i * 3] = x / length;
      normals[i * 3 + 1] = y / length;
      normals[i * 3 + 2] = z / length;
    }
  }

  return normals;
}
