'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { generateSurface } from '@/lib/graphing/surface3D';

interface Graph3DProps {
  expressions: string[];
  xRange: [number, number];
  yRange: [number, number];
  resolution?: number;
  onZRangeChange?: (zMin: number, zMax: number) => void;
}

export default function Graph3D({
  expressions,
  xRange,
  yRange,
  resolution = 60,
  onZRangeChange,
}: Graph3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const surfaceGroupRef = useRef<THREE.Group | null>(null);
  const helpersGroupRef = useRef<THREE.Group | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Calculate ideal camera distance based on range
  const getIdealCameraDistance = useCallback(() => {
    const xSpan = Math.abs(xRange[1] - xRange[0]);
    const ySpan = Math.abs(yRange[1] - yRange[0]);
    const maxSpan = Math.max(xSpan, ySpan);
    // Camera should be about 1.5x the span away for a good view
    return Math.max(maxSpan * 1.5, 10);
  }, [xRange, yRange]);

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
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 100000);
    camera.position.set(12, 10, 12);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer with better settings
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

    // Improved lighting setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
    mainLight.position.set(10, 20, 10);
    mainLight.castShadow = true;
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
    fillLight.position.set(-10, 10, -10);
    scene.add(fillLight);

    const backLight = new THREE.DirectionalLight(0xff8888, 0.2);
    backLight.position.set(0, -10, 0);
    scene.add(backLight);

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

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

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
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
        if (obj instanceof THREE.Sprite) {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      });
    }

    const helpersGroup = new THREE.Group();

    // Calculate size based on ranges
    const xSpan = Math.abs(xRange[1] - xRange[0]);
    const ySpan = Math.abs(yRange[1] - yRange[0]);
    const maxSpan = Math.max(xSpan, ySpan);
    const axisLength = maxSpan * 0.6;
    const gridSize = maxSpan;
    const gridDivisions = 20;

    // Grid on the floor (at y=0 level, which is the center of the graph)
    const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x444466, 0x333355);
    gridHelper.position.y = 0;
    helpersGroup.add(gridHelper);

    // X axis (red tint)
    const xAxisGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-axisLength, 0, 0),
      new THREE.Vector3(axisLength, 0, 0),
    ]);
    const xAxis = new THREE.Line(xAxisGeom, new THREE.LineBasicMaterial({ color: 0xff6666 }));
    helpersGroup.add(xAxis);

    // Y axis (up - green tint) - this shows Z values
    const yAxisGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -axisLength, 0),
      new THREE.Vector3(0, axisLength, 0),
    ]);
    const yAxis = new THREE.Line(yAxisGeom, new THREE.LineBasicMaterial({ color: 0x66ff66 }));
    helpersGroup.add(yAxis);

    // Z axis (blue tint) - this is Y in math terms
    const zAxisGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -axisLength),
      new THREE.Vector3(0, 0, axisLength),
    ]);
    const zAxis = new THREE.Line(zAxisGeom, new THREE.LineBasicMaterial({ color: 0x6666ff }));
    helpersGroup.add(zAxis);

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
      // Scale labels based on range
      const labelScale = maxSpan * 0.08;
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
  }, [xRange, yRange]);

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

    // Filter valid expressions
    const validExpressions = expressions.filter(expr => expr.trim());
    if (validExpressions.length === 0) return;

    try {
      setError(null);

      // Create a group to hold all surfaces
      const surfaceGroup = new THREE.Group();
      let globalZMin = Infinity;
      let globalZMax = -Infinity;

      // Generate surface for each expression
      validExpressions.forEach((expression, index) => {
        try {
          const { geometry, zMin, zMax } = generateSurface({
            expression,
            xRange,
            yRange,
            resolution,
            functionIndex: index,
          });

          globalZMin = Math.min(globalZMin, zMin);
          globalZMax = Math.max(globalZMax, zMax);

          // Main surface with improved material
          const surfaceMaterial = new THREE.MeshStandardMaterial({
            vertexColors: true,
            side: THREE.DoubleSide,
            roughness: 0.4,
            metalness: 0.1,
            transparent: validExpressions.length > 1,
            opacity: validExpressions.length > 1 ? 0.85 : 1,
          });

          const surfaceMesh = new THREE.Mesh(geometry, surfaceMaterial);
          surfaceMesh.castShadow = true;
          surfaceMesh.receiveShadow = true;
          surfaceGroup.add(surfaceMesh);

          // Add wireframe overlay for better shape definition
          const wireframeGeometry = new THREE.WireframeGeometry(geometry);
          const wireframeMaterial = new THREE.LineBasicMaterial({
            color: 0x000000,
            opacity: 0.06,
            transparent: true,
          });
          const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
          surfaceGroup.add(wireframe);
        } catch (err) {
          // Skip invalid expressions but continue with others
          console.warn(`Failed to render expression "${expression}":`, err);
        }
      });

      sceneRef.current.add(surfaceGroup);
      surfaceGroupRef.current = surfaceGroup;

      if (onZRangeChange && isFinite(globalZMin) && isFinite(globalZMax)) {
        onZRangeChange(globalZMin, globalZMax);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate surface');
    }
  }, [expressions, xRange, yRange, resolution, onZRangeChange]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {error && (
        <div className="absolute top-4 left-4 right-4 bg-red-500/90 text-white px-4 py-2 rounded-lg text-sm backdrop-blur-sm">
          {error}
        </div>
      )}
      <div className="absolute bottom-4 left-4 flex items-center gap-2">
        <button
          onClick={resetView}
          className="text-xs text-gray-300 bg-black/50 hover:bg-black/70 px-3 py-1.5 rounded backdrop-blur-sm transition-colors flex items-center gap-1"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Reset View
        </button>
        <span className="text-xs text-gray-400 bg-black/30 px-2 py-1 rounded backdrop-blur-sm">
          Drag to rotate &bull; Scroll to zoom
        </span>
      </div>
    </div>
  );
}
