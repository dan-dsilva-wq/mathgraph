'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { generateSurface, calculateZRange, CriticalPoint } from '@/lib/graphing/surface3D';
import { createEvaluator } from '@/lib/mathParser';
import { generateClosedVolumeGeometry, SurfaceConstraint } from '@/lib/graphing/volumeGeometry';
import { generateParametricSurface, ParametricSurfaceOptions } from '@/lib/graphing/parametricSurface';
import { IntegrationResult } from '@/lib/integration';

interface ExpressionWithIndex {
  expression: string;
  originalIndex: number;
}

interface SurfaceStats {
  expression: string;
  originalIndex: number;
  surfaceArea: number;
  surfaceAreaResult: IntegrationResult;
  volumeResult: IntegrationResult;
}

export interface ParametricInput {
  xExpr: string;
  yExpr: string;
  zExpr: string;
  uRange: [number, number];
  vRange: [number, number];
}

interface Graph3DProps {
  expressions: ExpressionWithIndex[];
  xRange: [number, number];
  yRange: [number, number];
  zRange?: [number, number]; // User-specified z range for clipping
  resolution?: number;
  showSurfaceGrid?: boolean;
  showVolumeVisualization?: boolean; // Show semi-transparent volume between first two surfaces
  volumeFillDirections?: ('above' | 'below')[]; // Fill direction for each surface
  parametricSurfaces?: ParametricInput[]; // Parametric surfaces to render
  onZRangeChange?: (zMin: number, zMax: number) => void;
  onStatsChange?: (stats: {
    surfaceAreas: SurfaceStats[];
    volume: number;
    globalMin: { x: number; y: number; z: number } | null;
    globalMax: { x: number; y: number; z: number } | null;
  }) => void;
}

export default function Graph3D({
  expressions,
  xRange,
  yRange,
  zRange,
  resolution = 60,
  showSurfaceGrid = false,
  showVolumeVisualization = false,
  volumeFillDirections = ['below', 'above'],
  parametricSurfaces = [],
  onZRangeChange,
  onStatsChange,
}: Graph3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const surfaceGroupRef = useRef<THREE.Group | null>(null);
  const helpersGroupRef = useRef<THREE.Group | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number; z: number; screenX: number; screenY: number } | null>(null);
  const [zeroPlaneY, setZeroPlaneY] = useState<number>(0);
  const criticalPointsGroupRef = useRef<THREE.Group | null>(null);
  const volumeVisualizationRef = useRef<THREE.Group | null>(null);
  // Store transform for converting hover coords back to math coords
  const transformRef = useRef<{
    xScale: number;
    yScale: number;
    zScale: number;
    xOffset: number;
    yOffset: number;
    zOffset: number;
  } | null>(null);

  // Calculate ideal camera distance based on normalized visual size
  const getIdealCameraDistance = useCallback(() => {
    // Surface is normalized to visual size of 10, so use fixed camera distance
    return 15;
  }, []);

  // Reset camera to default view
  const resetView = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current) return;

    const distance = getIdealCameraDistance();
    const angle = distance * 0.7; // 45-degree-ish angle

    cameraRef.current.position.set(angle, angle * 0.8, angle);
    cameraRef.current.lookAt(0, 0, 0);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
  }, [getIdealCameraDistance]);

  // Download graph as PNG
  const downloadPNG = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;

    // Render the scene to get the latest frame
    rendererRef.current.render(sceneRef.current, cameraRef.current);

    // Get the canvas data
    const canvas = rendererRef.current.domElement;
    const dataURL = canvas.toDataURL('image/png');

    // Create download link
    const link = document.createElement('a');
    link.download = 'mathgraph-3d.png';
    link.href = dataURL;
    link.click();
  }, []);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene with gradient-like background
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    // Camera - slightly lower angle for better view, large far plane for big ranges
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100000);
    camera.position.set(12, 10, 12);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer with better settings
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      logarithmicDepthBuffer: true, // Better depth precision for close surfaces
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.sortObjects = true; // Enable object sorting for transparency
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    // No distance limits - user can zoom freely
    controls.minDistance = 0.1;
    controls.maxDistance = 10000;
    controls.maxPolarAngle = Math.PI * 0.85;
    controlsRef.current = controls;

    // Raycaster for hover detection
    const raycaster = new THREE.Raycaster();
    raycasterRef.current = raycaster;

    // Improved lighting setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
    mainLight.position.set(10, 20, 10);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 100;
    mainLight.shadow.camera.left = -25;
    mainLight.shadow.camera.right = 25;
    mainLight.shadow.camera.top = 25;
    mainLight.shadow.camera.bottom = -25;
    mainLight.shadow.bias = -0.0001; // Smaller bias = shadows closer to contact point
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
    fillLight.position.set(-10, 10, -10);
    scene.add(fillLight);

    const backLight = new THREE.DirectionalLight(0xff8888, 0.2);
    backLight.position.set(0, -10, 0);
    scene.add(backLight);

    // Animation loop - also updates label sizes based on camera distance
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      controls.update();

      // Update label sizes based on camera distance for consistent screen size
      if (helpersGroupRef.current) {
        const cameraDistance = camera.position.length();
        const baseScale = cameraDistance * 0.04; // Scale factor for readable labels
        helpersGroupRef.current.traverse((obj) => {
          if (obj instanceof THREE.Sprite) {
            obj.scale.set(baseScale, baseScale, 1);
          }
        });
      }

      renderer.render(scene, camera);
    };
    animate();

    // Mark as loaded after first frame
    setIsLoading(false);

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;
      cameraRef.current.aspect = newWidth / newHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(newWidth, newHeight);
    };
    window.addEventListener('resize', handleResize);

    // Handle mouse move for hover detection
    const handleMouseMove = (event: MouseEvent) => {
      if (!containerRef.current || !raycasterRef.current || !cameraRef.current || !surfaceGroupRef.current) {
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

      // Get all mesh children from surface group
      const meshes: THREE.Mesh[] = [];
      surfaceGroupRef.current.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          meshes.push(obj);
        }
      });

      const intersects = raycasterRef.current.intersectObjects(meshes);

      if (intersects.length > 0) {
        const point = intersects[0].point;
        const t = transformRef.current;

        // Convert from visual coordinates back to math coordinates
        // In Three.js: x = scaled math x, y = scaled math z, z = scaled math y
        let mathX = point.x;
        let mathY = point.z; // Three.js Z is math Y
        let mathZ = point.y; // Three.js Y is math Z

        if (t) {
          // Reverse the scaling: mathCoord = (visualCoord / scale) + offset
          mathX = (point.x / t.xScale) + t.xOffset;
          mathY = (point.z / t.yScale) + t.yOffset;
          mathZ = (point.y / t.zScale) + t.zOffset;
        }

        setHoverPoint({
          x: mathX,
          y: mathY,
          z: mathZ,
          screenX: event.clientX - rect.left,
          screenY: event.clientY - rect.top,
        });
      } else {
        setHoverPoint(null);
      }
    };

    const handleMouseLeave = () => {
      setHoverPoint(null);
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      if (rendererRef.current && container.contains(rendererRef.current.domElement)) {
        container.removeChild(rendererRef.current.domElement);
      }
      rendererRef.current?.dispose();
    };
  }, []);

  // Auto-reset view when ranges change significantly
  useEffect(() => {
    resetView();
  }, [xRange, yRange, resetView]);

  // Update grid, axes, and labels when ranges change
  useEffect(() => {
    if (!sceneRef.current) return;

    // Remove old helpers group
    if (helpersGroupRef.current) {
      sceneRef.current.remove(helpersGroupRef.current);
      helpersGroupRef.current.traverse((obj) => {
        if (obj instanceof THREE.Line || obj instanceof THREE.LineSegments) {
          obj.geometry.dispose();
          if (obj.material instanceof THREE.Material) {
            obj.material.dispose();
          }
        }
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (obj.material instanceof THREE.Material) {
            obj.material.dispose();
          }
        }
        if (obj instanceof THREE.Sprite) {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      });
    }

    const helpersGroup = new THREE.Group();

    // Use fixed visual size that matches the normalized surface coordinates
    // Surface is normalized to targetVisualSize=10 in surface3D.ts
    const visualSize = 10;
    const axisLength = visualSize * 0.6; // Axes extend to 60% of visual size
    const gridSize = visualSize; // Grid covers the visual area
    const gridDivisions = 20;

    // Grid at z=0 level (positioned using zeroPlaneY from surface generation)
    const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x444466, 0x333355);
    gridHelper.position.y = zeroPlaneY;
    helpersGroup.add(gridHelper);

    // Shadow-receiving ground plane (slightly below grid to avoid z-fighting)
    const shadowPlaneGeom = new THREE.PlaneGeometry(gridSize * 1.5, gridSize * 1.5);
    const shadowPlaneMat = new THREE.ShadowMaterial({
      opacity: 0.3,
      color: 0x000022,
      depthWrite: false, // Don't write to depth buffer - prevents occlusion issues
    });
    const shadowPlane = new THREE.Mesh(shadowPlaneGeom, shadowPlaneMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = zeroPlaneY - 0.05; // Slightly lower to avoid z-fighting
    shadowPlane.receiveShadow = true;
    shadowPlane.renderOrder = -1; // Render first, behind everything else
    helpersGroup.add(shadowPlane);

    // Arrow head size proportional to axis
    const arrowLength = axisLength * 0.08;
    const arrowRadius = axisLength * 0.02;

    // X axis (red tint)
    const xAxisGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-axisLength, 0, 0),
      new THREE.Vector3(axisLength, 0, 0),
    ]);
    const xAxis = new THREE.Line(xAxisGeom, new THREE.LineBasicMaterial({ color: 0xff6666 }));
    helpersGroup.add(xAxis);

    // X axis arrow
    const xArrowGeom = new THREE.ConeGeometry(arrowRadius, arrowLength, 8);
    const xArrowMat = new THREE.MeshBasicMaterial({ color: 0xff6666 });
    const xArrow = new THREE.Mesh(xArrowGeom, xArrowMat);
    xArrow.position.set(axisLength, 0, 0);
    xArrow.rotation.z = -Math.PI / 2;
    helpersGroup.add(xArrow);

    // Y axis (up - green tint) - this shows Z values
    const yAxisGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -axisLength, 0),
      new THREE.Vector3(0, axisLength, 0),
    ]);
    const yAxis = new THREE.Line(yAxisGeom, new THREE.LineBasicMaterial({ color: 0x66ff66 }));
    helpersGroup.add(yAxis);

    // Y axis arrow
    const yArrowGeom = new THREE.ConeGeometry(arrowRadius, arrowLength, 8);
    const yArrowMat = new THREE.MeshBasicMaterial({ color: 0x66ff66 });
    const yArrow = new THREE.Mesh(yArrowGeom, yArrowMat);
    yArrow.position.set(0, axisLength, 0);
    helpersGroup.add(yArrow);

    // Z axis (blue tint) - this is Y in math terms
    const zAxisGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -axisLength),
      new THREE.Vector3(0, 0, axisLength),
    ]);
    const zAxis = new THREE.Line(zAxisGeom, new THREE.LineBasicMaterial({ color: 0x6666ff }));
    helpersGroup.add(zAxis);

    // Z axis arrow
    const zArrowGeom = new THREE.ConeGeometry(arrowRadius, arrowLength, 8);
    const zArrowMat = new THREE.MeshBasicMaterial({ color: 0x6666ff });
    const zArrow = new THREE.Mesh(zArrowGeom, zArrowMat);
    zArrow.position.set(0, 0, axisLength);
    zArrow.rotation.x = Math.PI / 2;
    helpersGroup.add(zArrow);

    // Helper function to create text labels
    const createLabel = (text: string, color: string): THREE.Sprite => {
      const canvas = document.createElement('canvas');
      const size = 128;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;

      ctx.fillStyle = 'transparent';
      ctx.fillRect(0, 0, size, size);

      ctx.font = 'bold 80px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.fillText(text, size / 2, size / 2);

      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false
      });
      const sprite = new THREE.Sprite(material);
      // Scale labels based on visual size
      const labelScale = visualSize * 0.08;
      sprite.scale.set(labelScale, labelScale, 1);
      return sprite;
    };

    // Add axis labels
    const labelOffset = axisLength * 0.15;

    const xLabel = createLabel('X', '#ff6666');
    xLabel.position.set(axisLength + labelOffset, 0, 0);
    helpersGroup.add(xLabel);

    const yLabel = createLabel('Z', '#66ff66'); // Math Z is displayed on Y axis
    yLabel.position.set(0, axisLength + labelOffset, 0);
    helpersGroup.add(yLabel);

    const zLabel = createLabel('Y', '#6666ff'); // Math Y is displayed on Z axis
    zLabel.position.set(0, 0, axisLength + labelOffset);
    helpersGroup.add(zLabel);

    sceneRef.current.add(helpersGroup);
    helpersGroupRef.current = helpersGroup;
  }, [xRange, yRange, zeroPlaneY]);

  // Update surfaces when expressions or ranges change
  useEffect(() => {
    if (!sceneRef.current) return;

    // Remove old surface group
    if (surfaceGroupRef.current) {
      sceneRef.current.remove(surfaceGroupRef.current);
      surfaceGroupRef.current.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (obj.material instanceof THREE.Material) {
            obj.material.dispose();
          }
        }
        if (obj instanceof THREE.LineSegments) {
          obj.geometry.dispose();
          if (obj.material instanceof THREE.Material) {
            obj.material.dispose();
          }
        }
      });
      surfaceGroupRef.current = null;
    }

    // Remove old critical points markers
    if (criticalPointsGroupRef.current) {
      sceneRef.current.remove(criticalPointsGroupRef.current);
      criticalPointsGroupRef.current.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (obj.material instanceof THREE.Material) {
            obj.material.dispose();
          }
        }
        if (obj instanceof THREE.Sprite) {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      });
      criticalPointsGroupRef.current = null;
    }

    // Remove old volume visualization
    if (volumeVisualizationRef.current) {
      sceneRef.current.remove(volumeVisualizationRef.current);
      volumeVisualizationRef.current.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (obj.material instanceof THREE.Material) {
            obj.material.dispose();
          }
        }
      });
      volumeVisualizationRef.current = null;
    }

    // Filter valid expressions (they should already be filtered, but double-check)
    const validExpressions = expressions.filter(e => e.expression.trim());
    if (validExpressions.length === 0 && parametricSurfaces.length === 0) return;

    try {
      setError(null);

      // First pass: Calculate ACTUAL z range across all expressions (without clip filter)
      let actualZMin = Infinity;
      let actualZMax = -Infinity;

      validExpressions.forEach(({ expression }) => {
        const range = calculateZRange(expression, xRange, yRange, resolution); // No clip filter
        if (range) {
          actualZMin = Math.min(actualZMin, range.zMin);
          actualZMax = Math.max(actualZMax, range.zMax);
        }
      });

      // Check if surface would be entirely invisible with current z clip range
      // If so, auto-trigger z-range update to make it visible
      if (zRange && isFinite(actualZMin) && isFinite(actualZMax)) {
        const surfaceEntirelyAbove = actualZMin > zRange[1];
        const surfaceEntirelyBelow = actualZMax < zRange[0];

        if (surfaceEntirelyAbove || surfaceEntirelyBelow) {
          // Surface is entirely outside clip range - auto-adjust
          if (onZRangeChange) {
            onZRangeChange(actualZMin, actualZMax);
          }
          // Use actual range for this render
        }
      }

      // Use clip range if specified and surface is at least partially visible
      let globalZMin = actualZMin;
      let globalZMax = actualZMax;

      if (zRange) {
        // Check if there's any overlap between actual range and clip range
        const hasOverlap = !(actualZMax < zRange[0] || actualZMin > zRange[1]);
        if (hasOverlap) {
          globalZMin = zRange[0];
          globalZMax = zRange[1];
        }
        // If no overlap, use actual range (auto-adjusted above)
      }

      // Handle case where all surfaces have same z or no valid z values
      if (!isFinite(globalZMin) || !isFinite(globalZMax)) {
        globalZMin = -1;
        globalZMax = 1;
      } else if (globalZMin === globalZMax) {
        globalZMin -= 1;
        globalZMax += 1;
      }

      // Always include z=0 in the range so the grid stays visible
      // This ensures the camera view includes both the surfaces and the reference grid
      globalZMin = Math.min(globalZMin, 0);
      globalZMax = Math.max(globalZMax, 0);

      // Create a group to hold all surfaces
      const surfaceGroup = new THREE.Group();
      const criticalPointsGroup = new THREE.Group();
      let allCriticalPoints: CriticalPoint[] = [];
      const surfaceAreas: SurfaceStats[] = [];
      let totalVolume = 0;

      // Second pass: Generate surface for each expression using global z range
      validExpressions.forEach(({ expression, originalIndex }, index) => {
        try {
          const { geometry, criticalPoints: points, surfaceArea: area, surfaceAreaResult: areaResult, volume: vol, volumeResult: volResult, zeroPlaneY: zPlane, transform } = generateSurface({
            expression,
            xRange,
            yRange,
            resolution,
            functionIndex: originalIndex, // Use original index for consistent colors
            globalZMin,
            globalZMax,
            zClipRange: zRange, // Pass user z range for clipping
          });

          // Store transform for hover coordinate conversion (use first surface's transform)
          if (index === 0) {
            transformRef.current = transform;
          }

          allCriticalPoints = [...allCriticalPoints, ...points];
          surfaceAreas.push({ expression, originalIndex, surfaceArea: area, surfaceAreaResult: areaResult, volumeResult: volResult });
          totalVolume += vol;

          // Use the first function's zero plane for grid positioning
          if (index === 0) {
            setZeroPlaneY(zPlane);
          }

          // Main surface with improved material
          const isTransparent = validExpressions.length > 1;
          const surfaceMaterial = new THREE.MeshStandardMaterial({
            vertexColors: true,
            side: THREE.DoubleSide,
            roughness: 0.4,
            metalness: 0.1,
            transparent: isTransparent,
            opacity: isTransparent ? 0.75 : 1,
            depthWrite: true,
            alphaTest: 0, // Ensures proper depth testing
            polygonOffset: true, // Prevent z-fighting between close surfaces
            polygonOffsetFactor: index + 1, // Offset each surface differently
            polygonOffsetUnits: index + 1,
          });

          const surfaceMesh = new THREE.Mesh(geometry, surfaceMaterial);
          surfaceMesh.castShadow = true;
          surfaceMesh.receiveShadow = true; // Enabled for cross-surface shadows
          // Frustum culling can cause parts to disappear - disable for surfaces
          surfaceMesh.frustumCulled = false;
          surfaceGroup.add(surfaceMesh);

          // Add wireframe/grid overlay for better shape definition
          if (showSurfaceGrid) {
            // More visible grid lines when enabled
            const wireframeGeometry = new THREE.WireframeGeometry(geometry);
            const wireframeMaterial = new THREE.LineBasicMaterial({
              color: 0x000000,
              opacity: 0.25,
              transparent: true,
            });
            const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
            surfaceGroup.add(wireframe);
          } else {
            // Subtle wireframe when disabled
            const wireframeGeometry = new THREE.WireframeGeometry(geometry);
            const wireframeMaterial = new THREE.LineBasicMaterial({
              color: 0x000000,
              opacity: 0.06,
              transparent: true,
            });
            const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
            surfaceGroup.add(wireframe);
          }
        } catch (err) {
          // Skip invalid expressions but continue with others
          console.warn(`Failed to render expression "${expression}":`, err);
        }
      });

      // Render parametric surfaces
      parametricSurfaces.forEach((param, index) => {
        try {
          const { geometry, transform } = generateParametricSurface({
            xExpr: param.xExpr,
            yExpr: param.yExpr,
            zExpr: param.zExpr,
            uRange: param.uRange,
            vRange: param.vRange,
            resolution: Math.min(resolution, 100),
            functionIndex: validExpressions.length + index,
          });

          // Store transform for hover coordinate conversion
          if (validExpressions.length === 0 && index === 0) {
            transformRef.current = transform;
          }

          const surfaceMaterial = new THREE.MeshStandardMaterial({
            vertexColors: true,
            side: THREE.DoubleSide,
            roughness: 0.4,
            metalness: 0.1,
            transparent: false,
            depthWrite: true,
          });

          const surfaceMesh = new THREE.Mesh(geometry, surfaceMaterial);
          surfaceMesh.castShadow = true;
          surfaceMesh.receiveShadow = true;
          surfaceMesh.frustumCulled = false;
          surfaceGroup.add(surfaceMesh);

          if (showSurfaceGrid) {
            const wireframeGeometry = new THREE.WireframeGeometry(geometry);
            const wireframeMaterial = new THREE.LineBasicMaterial({
              color: 0x000000,
              opacity: 0.25,
              transparent: true,
            });
            const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
            surfaceGroup.add(wireframe);
          } else {
            const wireframeGeometry = new THREE.WireframeGeometry(geometry);
            const wireframeMaterial = new THREE.LineBasicMaterial({
              color: 0x000000,
              opacity: 0.06,
              transparent: true,
            });
            const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
            surfaceGroup.add(wireframe);
          }
        } catch (err) {
          console.warn(`Failed to render parametric surface:`, err);
        }
      });

      sceneRef.current.add(surfaceGroup);
      surfaceGroupRef.current = surfaceGroup;

      // Add critical points markers with labels
      const xSpan = Math.abs(xRange[1] - xRange[0]);
      const ySpan = Math.abs(yRange[1] - yRange[0]);
      const maxSpan = Math.max(xSpan, ySpan);
      const markerSize = maxSpan * 0.025;

      // Helper to create coordinate label
      const createCoordLabel = (point: CriticalPoint): THREE.Sprite => {
        const canvas = document.createElement('canvas');
        const size = 256;
        canvas.width = size;
        canvas.height = size / 2;
        const ctx = canvas.getContext('2d')!;

        ctx.fillStyle = point.type === 'maximum' ? 'rgba(0, 200, 0, 0.9)' : 'rgba(255, 50, 50, 0.9)';
        ctx.beginPath();
        ctx.roundRect(0, 0, size, size / 2, 8);
        ctx.fill();

        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'white';
        const label = point.type === 'maximum' ? 'MAX' : 'MIN';
        ctx.fillText(label, size / 2, size / 6);

        ctx.font = '18px monospace';
        ctx.fillText(`(${point.x.toFixed(2)}, ${point.y.toFixed(2)}, ${point.z.toFixed(2)})`, size / 2, size / 3 + 10);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(material);
        return sprite;
      };

      allCriticalPoints.forEach((point) => {
        // Sphere marker
        const sphereGeom = new THREE.SphereGeometry(markerSize, 16, 16);
        const color = point.type === 'maximum' ? 0x00cc00 : 0xff3333;
        const sphereMat = new THREE.MeshBasicMaterial({ color });
        const sphere = new THREE.Mesh(sphereGeom, sphereMat);
        sphere.position.set(point.scaledX, point.scaledZ, point.scaledY);
        criticalPointsGroup.add(sphere);

        // Coordinate label above the sphere
        const label = createCoordLabel(point);
        const labelScale = 1.2; // Fixed scale for consistent label size
        label.scale.set(labelScale, labelScale / 2, 1);
        label.position.set(point.scaledX, point.scaledZ + markerSize * 3, point.scaledY);
        criticalPointsGroup.add(label);
      });

      sceneRef.current.add(criticalPointsGroup);
      criticalPointsGroupRef.current = criticalPointsGroup;

      // Generate volume visualization - shows enclosed region defined by fill directions
      // Creates a closed mesh with top surface, bottom surface, and 4 boundary walls
      if (showVolumeVisualization && validExpressions.length >= 1) {
        const volumeGroup = new THREE.Group();

        try {
          // Build array of surface constraints for all expressions
          const surfaces: SurfaceConstraint[] = validExpressions.map((expr, i) => ({
            evaluate: createEvaluator(expr.expression),
            fillDirection: volumeFillDirections[i] || (i === 0 ? 'below' : 'above'),
          }));

          // If only one surface, add z=0 as second surface
          if (surfaces.length === 1) {
            surfaces.push({
              evaluate: () => 0,
              fillDirection: volumeFillDirections[1] || 'above',
            });
          }

          const t = transformRef.current;
          if (t) {
            const volumeGeometry = generateClosedVolumeGeometry(
              surfaces,
              xRange,
              yRange,
              zRange || null,
              Math.min(resolution, 60),
              t
            );

            if (volumeGeometry) {
              const bufferGeometry = new THREE.BufferGeometry();
              bufferGeometry.setAttribute('position', new THREE.BufferAttribute(volumeGeometry.positions, 3));
              bufferGeometry.setAttribute('normal', new THREE.BufferAttribute(volumeGeometry.normals, 3));
              bufferGeometry.setIndex(new THREE.BufferAttribute(volumeGeometry.indices, 1));

              const material = new THREE.MeshPhongMaterial({
                color: 0x4488ff,
                transparent: true,
                opacity: 0.4,
                side: THREE.DoubleSide,
                depthWrite: false,
                shininess: 30,
              });

              const volumeMesh = new THREE.Mesh(bufferGeometry, material);
              volumeMesh.renderOrder = 10; // Render after other objects for proper transparency
              volumeGroup.add(volumeMesh);
            }
          }
        } catch (err) {
          console.warn('Failed to generate volume visualization:', err);
        }

        sceneRef.current.add(volumeGroup);
        volumeVisualizationRef.current = volumeGroup;
      }

      // Call stats callback
      if (onStatsChange) {
        const globalMin = allCriticalPoints.find(p => p.type === 'minimum');
        const globalMax = allCriticalPoints.find(p => p.type === 'maximum');
        onStatsChange({
          surfaceAreas,
          volume: totalVolume,
          globalMin: globalMin ? { x: globalMin.x, y: globalMin.y, z: globalMin.z } : null,
          globalMax: globalMax ? { x: globalMax.x, y: globalMax.y, z: globalMax.z } : null,
        });
      }

      if (onZRangeChange && isFinite(globalZMin) && isFinite(globalZMax)) {
        onZRangeChange(globalZMin, globalZMax);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate surface');
    }
  }, [expressions, xRange, yRange, zRange, resolution, showSurfaceGrid, showVolumeVisualization, volumeFillDirections, parametricSurfaces, onZRangeChange, onStatsChange]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {/* Loading skeleton */}
      {isLoading && (
        <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center">
          <div className="relative w-24 h-24 mb-4">
            {/* Animated 3D cube wireframe */}
            <div className="absolute inset-0 border-2 border-blue-500/50 animate-spin" style={{ animationDuration: '3s' }} />
            <div className="absolute inset-2 border-2 border-purple-500/50 animate-spin" style={{ animationDuration: '2s', animationDirection: 'reverse' }} />
            <div className="absolute inset-4 border-2 border-cyan-500/50 animate-spin" style={{ animationDuration: '4s' }} />
          </div>
          <div className="text-slate-400 text-sm">Initializing 3D renderer...</div>
          <div className="mt-2 flex gap-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      )}
      {error && (
        <div className="absolute top-4 left-4 right-4 bg-red-500/90 text-white px-4 py-2 rounded-lg text-sm backdrop-blur-sm">
          {error}
        </div>
      )}
      {hoverPoint && (
        <div
          className="absolute pointer-events-none bg-black/80 text-white px-3 py-2 rounded-lg text-xs font-mono backdrop-blur-sm border border-white/20"
          style={{
            left: hoverPoint.screenX + 15,
            top: hoverPoint.screenY - 10,
          }}
        >
          <div className="text-gray-400 text-[10px] mb-1">Coordinates</div>
          <div><span className="text-red-400">x:</span> {hoverPoint.x.toFixed(3)}</div>
          <div><span className="text-blue-400">y:</span> {hoverPoint.y.toFixed(3)}</div>
          <div><span className="text-green-400">z:</span> {hoverPoint.z.toFixed(3)}</div>
        </div>
      )}
      <div className="absolute bottom-2 md:bottom-4 left-2 md:left-4 flex items-center gap-1 md:gap-2">
        <button
          onClick={resetView}
          className="text-xs text-gray-300 bg-black/50 hover:bg-black/70 p-2 md:px-3 md:py-1.5 rounded backdrop-blur-sm transition-colors flex items-center gap-1"
          title="Reset View"
        >
          <svg className="w-4 h-4 md:w-3 md:h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="hidden md:inline">Reset View</span>
        </button>
        <button
          onClick={downloadPNG}
          className="text-xs text-gray-300 bg-black/50 hover:bg-black/70 p-2 md:px-3 md:py-1.5 rounded backdrop-blur-sm transition-colors flex items-center gap-1"
          title="Download PNG"
        >
          <svg className="w-4 h-4 md:w-3 md:h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <span className="hidden md:inline">Download PNG</span>
        </button>
        <span className="hidden md:inline text-xs text-gray-400 bg-black/30 px-2 py-1 rounded backdrop-blur-sm">
          Drag to rotate &bull; Scroll to zoom
        </span>
      </div>
    </div>
  );
}
