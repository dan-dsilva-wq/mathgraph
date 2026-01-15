'use client';

import { useEffect, useRef, useState } from 'react';
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
  const animationIdRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);

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

    // Camera - slightly lower angle for better view
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
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
    controls.minDistance = 5;
    controls.maxDistance = 50;
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

    // Subtle grid on the floor
    const gridHelper = new THREE.GridHelper(20, 20, 0x444466, 0x333355);
    gridHelper.position.y = -5;
    scene.add(gridHelper);

    // Create axis lines with labels
    const axisLength = 8;
    const axisMaterial = new THREE.LineBasicMaterial({ color: 0x666688 });

    // X axis (red tint)
    const xAxisGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-axisLength, 0, 0),
      new THREE.Vector3(axisLength, 0, 0),
    ]);
    const xAxis = new THREE.Line(xAxisGeom, new THREE.LineBasicMaterial({ color: 0xff6666 }));
    scene.add(xAxis);

    // Y axis (up - green tint)
    const yAxisGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -axisLength, 0),
      new THREE.Vector3(0, axisLength, 0),
    ]);
    const yAxis = new THREE.Line(yAxisGeom, new THREE.LineBasicMaterial({ color: 0x66ff66 }));
    scene.add(yAxis);

    // Z axis (blue tint) - this is Y in math terms
    const zAxisGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -axisLength),
      new THREE.Vector3(0, 0, axisLength),
    ]);
    const zAxis = new THREE.Line(zAxisGeom, new THREE.LineBasicMaterial({ color: 0x6666ff }));
    scene.add(zAxis);

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
      <div className="absolute bottom-4 left-4 text-xs text-gray-400 bg-black/30 px-2 py-1 rounded backdrop-blur-sm">
        Drag to rotate &bull; Scroll to zoom
      </div>
    </div>
  );
}
