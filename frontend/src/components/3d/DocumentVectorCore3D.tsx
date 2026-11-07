"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Sparkles, Maximize2, RotateCcw } from "lucide-react";

interface NodeData {
  id: string;
  name: string;
  category: "INVOICE" | "PURCHASE_ORDER" | "RECEIPT" | "CONTRACT";
  amount: string;
  position: [number, number, number];
  color: number;
}

export function DocumentVectorCore3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredNode, setHoveredNode] = useState<NodeData | null>(null);
  const [isRotating, setIsRotating] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene, Camera, Renderer
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 18);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // 2. Ambient & Point Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0x6366f1, 2.5, 50);
    pointLight.position.set(5, 5, 10);
    scene.add(pointLight);

    const secondaryLight = new THREE.PointLight(0x10b981, 1.5, 40);
    secondaryLight.position.set(-6, -4, 8);
    scene.add(secondaryLight);

    // 3. Central Wireframe Geometry (Invariant Mathematical Core)
    const coreGroup = new THREE.Group();
    scene.add(coreGroup);

    const icosaGeometry = new THREE.IcosahedronGeometry(4.2, 1);
    const icosaWireframe = new THREE.WireframeGeometry(icosaGeometry);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x4f46e5,
      transparent: true,
      opacity: 0.25,
      linewidth: 1,
    });
    const coreLines = new THREE.LineSegments(icosaWireframe, lineMaterial);
    coreGroup.add(coreLines);

    // Inner glowing sphere
    const sphereGeo = new THREE.SphereGeometry(1.8, 16, 16);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0x6366f1,
      transparent: true,
      opacity: 0.15,
      wireframe: true,
    });
    const innerSphere = new THREE.Mesh(sphereGeo, sphereMat);
    coreGroup.add(innerSphere);

    // 4. Financial Document Nodes in 3D Space
    const documentNodes: NodeData[] = [
      {
        id: "INV-2026-9041",
        name: "DataCore Enterprise INV",
        category: "INVOICE",
        amount: "$11,220.00",
        position: [3.2, 2.1, 1.5],
        color: 0xf43f5e, // rose
      },
      {
        id: "PO-2026-4412",
        name: "DataCore Contract PO",
        category: "PURCHASE_ORDER",
        amount: "$10,000.00",
        position: [-3.0, 1.8, -1.2],
        color: 0x6366f1, // brand indigo
      },
      {
        id: "GRN-2026-1109",
        name: "Bay 4 Goods Receipt",
        category: "RECEIPT",
        amount: "6 Units",
        position: [0.8, -3.2, 2.0],
        color: 0x10b981, // emerald
      },
      {
        id: "CTR-2026-0819",
        name: "Global Systems SOW",
        category: "CONTRACT",
        amount: "$45,000.00",
        position: [-2.5, -2.1, -1.8],
        color: 0xa855f7, // purple
      },
      {
        id: "INV-2026-7721",
        name: "Apex Compute Invoice",
        category: "INVOICE",
        amount: "$4,500.00",
        position: [2.8, -1.2, -2.5],
        color: 0xf59e0b, // amber
      },
      {
        id: "INV-2026-5582",
        name: "NetLink Hardware INV",
        category: "INVOICE",
        amount: "$8,450.00",
        position: [-1.2, 3.4, -0.8],
        color: 0x38bdf8, // sky
      },
    ];

    const nodeMeshes: THREE.Mesh[] = [];

    documentNodes.forEach((node) => {
      const nodeGeo = new THREE.SphereGeometry(0.35, 16, 16);
      const nodeMat = new THREE.MeshStandardMaterial({
        color: node.color,
        emissive: node.color,
        emissiveIntensity: 0.6,
        roughness: 0.2,
      });
      const mesh = new THREE.Mesh(nodeGeo, nodeMat);
      mesh.position.set(...node.position);
      mesh.userData = node;
      coreGroup.add(mesh);
      nodeMeshes.push(mesh);

      // Add a subtle halo ring around each node
      const ringGeo = new THREE.RingGeometry(0.45, 0.52, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: node.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.4,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.lookAt(camera.position);
      mesh.add(ring);
    });

    // 5. Connect 3-Way Match Nodes with Pulsing Splines (PO -> GRN -> INV)
    const splinePoints = [
      new THREE.Vector3(-3.0, 1.8, -1.2), // PO
      new THREE.Vector3(0.8, -3.2, 2.0),  // GRN
      new THREE.Vector3(3.2, 2.1, 1.5),   // INV
      new THREE.Vector3(-3.0, 1.8, -1.2), // Loop back
    ];
    const curve = new THREE.CatmullRomCurve3(splinePoints);
    const curveGeo = new THREE.TubeGeometry(curve, 64, 0.04, 8, true);
    const curveMat = new THREE.MeshBasicMaterial({
      color: 0x818cf8,
      transparent: true,
      opacity: 0.6,
      wireframe: false,
    });
    const matchSpline = new THREE.Mesh(curveGeo, curveMat);
    coreGroup.add(matchSpline);

    // 6. Background Vector Particle Dust
    const particleCount = 200;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 30;
      positions[i + 1] = (Math.random() - 0.5) * 30;
      positions[i + 2] = (Math.random() - 0.5) * 30;
    }
    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const particleMat = new THREE.PointsMaterial({
      color: 0x4f46e5,
      size: 0.08,
      transparent: true,
      opacity: 0.35,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // 7. Mouse Parallax & Raycasting
    let mouseX = 0;
    let mouseY = 0;
    let targetRotationX = 0;
    let targetRotationY = 0;

    const raycaster = new THREE.Raycaster();
    const mouseVector = new THREE.Vector2();

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      mouseX = x;
      mouseY = y;
      targetRotationY = x * 0.45;
      targetRotationX = -y * 0.45;

      mouseVector.set(x, y);
      raycaster.setFromCamera(mouseVector, camera);
      const intersects = raycaster.intersectObjects(nodeMeshes);

      if (intersects.length > 0) {
        setHoveredNode(intersects[0].object.userData as NodeData);
        container.style.cursor = "pointer";
      } else {
        setHoveredNode(null);
        container.style.cursor = "default";
      }
    };

    container.addEventListener("mousemove", handleMouseMove);

    // 8. Animation Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      if (isRotating) {
        coreGroup.rotation.y += 0.003;
        coreGroup.rotation.x += 0.001;
      }

      // Smooth mouse parallax damping
      coreGroup.rotation.y += (targetRotationY - coreGroup.rotation.y) * 0.05;
      coreGroup.rotation.x += (targetRotationX - coreGroup.rotation.x) * 0.05;

      // Pulse inner sphere scale
      const pulse = 1 + Math.sin(elapsedTime * 2) * 0.04;
      innerSphere.scale.set(pulse, pulse, pulse);

      // Rotate particles slowly in opposite direction
      particles.rotation.y = -elapsedTime * 0.015;

      renderer.render(scene, camera);
    };

    animate();

    // 9. Resize Handling
    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener("resize", handleResize);

    // 10. Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(animationFrameId);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
      icosaGeometry.dispose();
      sphereGeo.dispose();
      particleGeo.dispose();
    };
  }, [isRotating]);

  return (
    <div className="relative w-full h-80 rounded-2xl bg-gradient-to-b from-surface-card to-canvas border border-white/[0.08] shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] overflow-hidden group">
      {/* 3D WebGL Canvas Container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Ambient Gradient Glow Accents */}
      <div className="absolute top-0 left-1/4 w-72 h-40 bg-brand/15 blur-3xl pointer-events-none rounded-full" />
      <div className="absolute bottom-0 right-1/4 w-60 h-32 bg-emerald-500/10 blur-3xl pointer-events-none rounded-full" />

      {/* Floating HUD Header */}
      <div className="absolute top-3.5 left-4 right-4 flex items-center justify-between pointer-events-none z-10">
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-ink-primary text-[11px] font-mono pointer-events-auto">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          <Sparkles className="w-3 h-3 text-brand-light" />
          <span>Multidimensional Financial Vector Core</span>
        </div>

        <div className="flex items-center gap-1.5 pointer-events-auto">
          <button
            onClick={() => setIsRotating((r) => !r)}
            className="p-1.5 rounded-lg bg-black/50 backdrop-blur-md border border-white/10 text-ink-muted hover:text-ink-primary transition"
            title={isRotating ? "Pause auto-rotation" : "Resume auto-rotation"}
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isRotating ? "" : "text-amber-400"}`} />
          </button>
        </div>
      </div>

      {/* Interactive Node Tooltip Overlay */}
      {hoveredNode && (
        <div className="absolute bottom-4 left-4 p-3 rounded-xl bg-black/80 backdrop-blur-lg border border-white/15 shadow-2xl text-xs space-y-1 animate-in fade-in zoom-in-95 duration-100 z-20 pointer-events-none">
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: `#${hoveredNode.color.toString(16).padStart(6, "0")}` }}
            />
            <span className="font-semibold text-ink-primary">{hoveredNode.name}</span>
            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/10 text-ink-muted">
              {hoveredNode.category}
            </span>
          </div>
          <div className="text-[11px] font-mono text-ink-secondary flex items-center justify-between gap-4">
            <span>Commitment: <strong className="text-white">{hoveredNode.amount}</strong></span>
            <span className="text-[10px] text-brand-light">HNSW Cluster #02</span>
          </div>
        </div>
      )}

      {/* Bottom Telemetry Legend */}
      <div className="absolute bottom-3 right-4 flex items-center gap-3 text-[10px] font-mono text-ink-muted pointer-events-none z-10 bg-black/40 backdrop-blur px-2.5 py-1 rounded-full border border-white/5">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Invoice
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> PO
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Receipt
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500" /> Contract
        </span>
      </div>
    </div>
  );
}

export default DocumentVectorCore3D;
