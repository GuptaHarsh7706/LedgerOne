import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Sparkles, Layers, RefreshCw } from "lucide-react";

interface DocumentVectorNode {
  id: string;
  name: string;
  type: "INVOICE" | "PO" | "GRN" | "TAX_SCHEDULE";
  pos: THREE.Vector3;
  color: number;
  status: string;
  variance?: string;
}

export const DocumentVectorCore3D: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hoveredNode, setHoveredNode] = useState<DocumentVectorNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const currentMount = mountRef.current;
    if (!currentMount) return;

    const width = currentMount.clientWidth || 600;
    const height = 280;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x07080a, 0.04);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 14);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    currentMount.appendChild(renderer.domElement);

    // 2. Central Invariant Geometries (Concentric Core)
    const coreGroup = new THREE.Group();
    scene.add(coreGroup);

    // Outer Icosahedron
    const icoGeo = new THREE.IcosahedronGeometry(2.6, 1);
    const icoMat = new THREE.MeshBasicMaterial({
      color: 0x6366f1,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    const icoMesh = new THREE.Mesh(icoGeo, icoMat);
    coreGroup.add(icoMesh);

    // Inner Invariant Sphere
    const sphereGeo = new THREE.SphereGeometry(1.6, 16, 16);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      wireframe: true,
      transparent: true,
      opacity: 0.2,
    });
    const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    coreGroup.add(sphereMesh);

    // 3. Document Vector Nodes in 3D Space
    const nodesData: DocumentVectorNode[] = [
      {
        id: "INV-2026-9041",
        name: "DataCore Enterprise SAN Invoice",
        type: "INVOICE",
        pos: new THREE.Vector3(-4.2, 1.8, 1.2),
        color: 0xef4444,
        status: "DISCREPANCY (+$600/unit)",
      },
      {
        id: "PO-2026-4412",
        name: "Enterprise SAN Purchase Order",
        type: "PO",
        pos: new THREE.Vector3(4.2, 1.5, -0.8),
        color: 0x22c55e,
        status: "VERIFIED COMMITMENT",
      },
      {
        id: "GRN-2026-1109",
        name: "Apex Logistics Dock Receipt",
        type: "GRN",
        pos: new THREE.Vector3(0.5, -3.2, 1.5),
        color: 0x38bdf8,
        status: "DELIVERY CONFIRMED",
      },
      {
        id: "TAX-2026-SCH-5",
        name: "Held Tax Schedule (Exemption)",
        type: "TAX_SCHEDULE",
        pos: new THREE.Vector3(-2.8, -2.5, -1.8),
        color: 0xf59e0b,
        status: "PENDING SOX REVIEW",
      },
    ];

    const nodeMeshes: { mesh: THREE.Mesh; data: DocumentVectorNode }[] = [];

    nodesData.forEach((node) => {
      const nodeGeo = new THREE.SphereGeometry(0.38, 24, 24);
      const nodeMat = new THREE.MeshStandardMaterial({
        color: node.color,
        emissive: node.color,
        emissiveIntensity: 0.6,
        roughness: 0.2,
        metalness: 0.8,
      });
      const nodeMesh = new THREE.Mesh(nodeGeo, nodeMat);
      nodeMesh.position.copy(node.pos);
      scene.add(nodeMesh);
      nodeMeshes.push({ mesh: nodeMesh, data: node });

      // Outer Halo Ring
      const ringGeo = new THREE.RingGeometry(0.5, 0.58, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: node.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.4,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.copy(node.pos);
      scene.add(ringMesh);
    });

    // 4. CatmullRom Splines Connecting Reconciled Documents
    const splinePoints = [
      nodesData[1].pos, // PO
      new THREE.Vector3(2.0, 0.4, 0.8),
      nodesData[2].pos, // GRN
      new THREE.Vector3(-1.5, -0.6, 1.2),
      nodesData[0].pos, // Invoice
    ];

    const curve = new THREE.CatmullRomCurve3(splinePoints);
    const points = curve.getPoints(70);
    const splineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const splineMat = new THREE.LineBasicMaterial({
      color: 0x6366f1,
      transparent: true,
      opacity: 0.55,
      linewidth: 2,
    });
    const splineObject = new THREE.Line(splineGeo, splineMat);
    scene.add(splineObject);

    // 5. Ambient Vector Particle Field
    const particleCount = 100;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
      particlePositions[i] = (Math.random() - 0.5) * 22;
      particlePositions[i + 1] = (Math.random() - 0.5) * 14;
      particlePositions[i + 2] = (Math.random() - 0.5) * 14;
    }

    particleGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(particlePositions, 3)
    );
    const particleMat = new THREE.PointsMaterial({
      color: 0x818cf8,
      size: 0.08,
      transparent: true,
      opacity: 0.45,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // 6. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0x6366f1, 2.5, 30);
    pointLight.position.set(0, 4, 6);
    scene.add(pointLight);

    // 7. Raycasting & Interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerMove = (e: MouseEvent) => {
      const rect = currentMount.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / height) * 2 + 1;

      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(nodeMeshes.map((n) => n.mesh));

      if (intersects.length > 0) {
        const hit = nodeMeshes.find((n) => n.mesh === intersects[0].object);
        if (hit) setHoveredNode(hit.data);
      } else {
        setHoveredNode(null);
      }
    };

    currentMount.addEventListener("mousemove", handlePointerMove);

    // 8. Animation Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Rotate central invariant core
      coreGroup.rotation.x = elapsed * 0.15;
      coreGroup.rotation.y = elapsed * 0.22;

      // Subtle bobbing of document nodes
      nodeMeshes.forEach((item, idx) => {
        item.mesh.position.y =
          item.data.pos.y + Math.sin(elapsed * 1.5 + idx * 1.2) * 0.12;
      });

      // Camera parallax tracking mouse
      camera.position.x += (mouse.x * 1.5 - camera.position.x) * 0.04;
      camera.position.y += (-mouse.y * 1.2 - camera.position.y) * 0.04;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!currentMount) return;
      const newWidth = currentMount.clientWidth;
      camera.aspect = newWidth / height;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, height);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      currentMount.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("resize", handleResize);
      if (currentMount.contains(renderer.domElement)) {
        currentMount.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div className="relative w-full rounded-2xl bg-surface-primary border border-hairline overflow-hidden shadow-subtle-card">
      {/* Top Banner Information Bar */}
      <div className="absolute top-3 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-surface-elevated/80 border border-hairline backdrop-blur-md">
          <Layers className="w-3.5 h-3.5 text-brand-light animate-pulse" />
          <span className="text-[11px] font-mono font-medium text-ink-primary">
            Vector Space Invariant Core
          </span>
          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-brand/20 text-brand-light">
            Three.js WebGL
          </span>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-mono text-ink-muted px-2.5 py-1 rounded-full bg-surface-elevated/80 border border-hairline backdrop-blur-md">
          <Sparkles className="w-3 h-3 text-emerald-400" />
          <span>Interactive Raycasting Active</span>
        </div>
      </div>

      {/* 3D WebGL Canvas Mount */}
      <div ref={mountRef} className="w-full h-[280px] cursor-crosshair" />

      {/* Hover Inspection Tooltip */}
      {hoveredNode && (
        <div
          className="absolute z-30 pointer-events-none px-3 py-2 rounded-xl bg-surface-elevated/95 border border-hairline-strong shadow-floating-panel backdrop-blur-md text-xs space-y-1 transition-all duration-75"
          style={{
            left: `${Math.min(mousePos.x + 16, 420)}px`,
            top: `${Math.min(mousePos.y - 10, 200)}px`,
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: `#${hoveredNode.color.toString(16)}` }}
            />
            <span className="font-mono font-bold text-ink-primary">
              {hoveredNode.id}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface-subtle border border-hairline text-ink-muted">
              {hoveredNode.type}
            </span>
          </div>
          <p className="text-[11px] text-ink-secondary">{hoveredNode.name}</p>
          <p className="text-[10px] font-mono font-semibold text-emerald-400">
            {hoveredNode.status}
          </p>
        </div>
      )}

      {/* Bottom Telemetry Legend */}
      <div className="absolute bottom-2.5 left-4 right-4 z-20 flex flex-wrap items-center justify-between text-[10px] font-mono text-ink-muted pointer-events-none">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Purchase Order
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" /> Goods Receipt
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> Invoice Exception
          </span>
        </div>
        <div className="flex items-center gap-1">
          <RefreshCw className="w-3 h-3 text-brand-light" />
          <span>Continuous Invariant Rotation</span>
        </div>
      </div>
    </div>
  );
};
