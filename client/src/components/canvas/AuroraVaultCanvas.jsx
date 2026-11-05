// client/src/components/canvas/AuroraVaultCanvas.jsx
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export default function AuroraVaultCanvas({
  sceneState = "idle", // "idle" | "thinking" | "plans" | "locked" | "authorized" | "settled" | "blocked"
  quality = "full",    // "full" | "lite" | "off"
  isDarkMode = true,
  step = 0,
}) {
  const mountRef = useRef(null);
  const [webglSupported, setWebglSupported] = useState(true);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (quality === "off" || !isDarkMode || prefersReducedMotion) {
      if (typeof window !== "undefined") {
        window.__PROCUREAI_SCENE_FPS__ = 0;
      }
      return;
    }

    const container = mountRef.current;
    if (!container) return;

    // Check WebGL availability
    try {
      const testCanvas = document.createElement("canvas");
      const gl = testCanvas.getContext("webgl") || testCanvas.getContext("experimental-webgl");
      if (!gl) {
        setWebglSupported(false);
        return;
      }
    } catch (_) {
      setWebglSupported(false);
      return;
    }

    if (quality === "lite") {
      // 2D Canvas fallback for lite mode
      const canvas = document.createElement("canvas");
      canvas.style.position = "absolute";
      canvas.style.top = "0";
      canvas.style.left = "0";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.pointerEvents = "none";
      container.appendChild(canvas);

      const ctx = canvas.getContext("2d");
      let animId;
      let width = (canvas.width = window.innerWidth);
      let height = (canvas.height = window.innerHeight);

      const particles = Array.from({ length: 45 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 2 + 1,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        alpha: Math.random() * 0.5 + 0.2,
      }));

      let liteFrames = 0;
      let liteLastTime = performance.now();

      const renderLite = () => {
        liteFrames++;
        const now = performance.now();
        if (now - liteLastTime >= 1000) {
          window.__PROCUREAI_SCENE_FPS__ = Math.round((liteFrames * 1000) / (now - liteLastTime));
          liteFrames = 0;
          liteLastTime = now;
        }

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = sceneState === "authorized" ? "rgba(16, 185, 129, " : sceneState === "locked" ? "rgba(0, 82, 255, " : "rgba(56, 189, 248, ";
        for (const p of particles) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0) p.x = width;
          if (p.x > width) p.x = 0;
          if (p.y < 0) p.y = height;
          if (p.y > height) p.y = 0;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
        animId = requestAnimationFrame(renderLite);
      };
      renderLite();

      const handleResize = () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
      };
      window.addEventListener("resize", handleResize);

      return () => {
        cancelAnimationFrame(animId);
        window.removeEventListener("resize", handleResize);
        if (container.contains(canvas)) container.removeChild(canvas);
      };
    }

    // -------------------------------------------------------------
    // THREE.JS HIGH PERFORMANCE AMBIENT "AURORA VAULT" SCENE
    // -------------------------------------------------------------
    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100);
    camera.position.set(0, 0, 24);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch (_) {
      setWebglSupported(false);
      return;
    }

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0); // transparent background
    container.appendChild(renderer.domElement);

    // Mouse Parallax State
    let mouseX = 0;
    let mouseY = 0;
    let targetMouseX = 0;
    let targetMouseY = 0;

    const handlePointerMove = (e) => {
      targetMouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      targetMouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    // 1. Motes / Particle Field
    const particleCount = 220;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const baseColor = new THREE.Color(0x0052ff);
    const accentColor = new THREE.Color(0x06b6d4);
    const violetColor = new THREE.Color(0x8b5cf6);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 50;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 38;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 22;

      const rnd = Math.random();
      const mixed = rnd < 0.5 ? baseColor.clone().lerp(accentColor, rnd * 2) : accentColor.clone().lerp(violetColor, (rnd - 0.5) * 2);
      colors[i * 3] = mixed.r;
      colors[i * 3 + 1] = mixed.g;
      colors[i * 3 + 2] = mixed.b;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const particleMaterial = new THREE.PointsMaterial({
      size: 0.24,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    });
    const particleSystem = new THREE.Points(geometry, particleMaterial);
    scene.add(particleSystem);

    // 2. Concentric Vault Cryptographic Rings (The "Mandate Ring")
    const ringGroup = new THREE.Group();
    ringGroup.position.set(0, 0, -4);

    const ringMat1 = new THREE.MeshBasicMaterial({
      color: 0x0052ff,
      wireframe: true,
      transparent: true,
      opacity: 0.22,
    });
    const ringGeo1 = new THREE.TorusGeometry(8.5, 0.05, 12, 64);
    const ringMesh1 = new THREE.Mesh(ringGeo1, ringMat1);
    ringGroup.add(ringMesh1);

    const ringMat2 = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      wireframe: true,
      transparent: true,
      opacity: 0.16,
    });
    const ringGeo2 = new THREE.TorusGeometry(11.2, 0.04, 12, 64);
    const ringMesh2 = new THREE.Mesh(ringGeo2, ringMat2);
    ringMesh2.rotation.x = Math.PI / 4;
    ringGroup.add(ringMesh2);

    // Central Core Octahedron
    const coreOctaGeo = new THREE.OctahedronGeometry(2.2, 0);
    const coreOctaMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.18,
    });
    const coreOctaMesh = new THREE.Mesh(coreOctaGeo, coreOctaMat);
    ringGroup.add(coreOctaMesh);

    scene.add(ringGroup);

    // 3. Floating Cryptographic Polyhedra Constellation
    const crystalsGroup = new THREE.Group();
    const crystalDisposables = [];

    const crystalConfigs = [
      { geo: new THREE.OctahedronGeometry(0.9, 0), color: 0x0052ff, r: 12, speed: 0.4, phase: 0.0, yOffset: 3 },
      { geo: new THREE.IcosahedronGeometry(0.8, 0), color: 0x38bdf8, r: 14, speed: -0.32, phase: 1.5, yOffset: -4 },
      { geo: new THREE.TetrahedronGeometry(1.0, 0), color: 0x8b5cf6, r: 10, speed: 0.45, phase: 3.1, yOffset: 1.5 },
      { geo: new THREE.OctahedronGeometry(0.7, 0), color: 0x10b981, r: 13, speed: -0.38, phase: 4.5, yOffset: -2 },
      { geo: new THREE.DodecahedronGeometry(0.65, 0), color: 0x0052ff, r: 15, speed: 0.28, phase: 5.2, yOffset: 4 },
    ];

    const crystalMeshes = crystalConfigs.map((cfg) => {
      crystalDisposables.push(cfg.geo);
      const mat = new THREE.MeshBasicMaterial({
        color: cfg.color,
        wireframe: true,
        transparent: true,
        opacity: 0.25,
      });
      crystalDisposables.push(mat);
      const mesh = new THREE.Mesh(cfg.geo, mat);
      mesh.userData = cfg;
      crystalsGroup.add(mesh);
      return mesh;
    });

    scene.add(crystalsGroup);

    // Animation Loop
    let animId;
    let clock = new THREE.Clock();

    let webglFrames = 0;
    let webglLastTime = performance.now();

    const animate = () => {
      webglFrames++;
      const now = performance.now();
      if (now - webglLastTime >= 1000) {
        window.__PROCUREAI_SCENE_FPS__ = Math.round((webglFrames * 1000) / (now - webglLastTime));
        webglFrames = 0;
        webglLastTime = now;
      }

      const elapsed = clock.getElapsedTime();

      // Scene Intensity & Placement per Step
      const isCalm = step >= 1;
      const targetIntensity = isCalm ? 0.38 : 1.0;
      
      // Push rings to edges / depth in calm mode
      if (isCalm) {
        ringGroup.position.z = THREE.MathUtils.lerp(ringGroup.position.z, -10, 0.05);
        ringGroup.scale.lerp(new THREE.Vector3(1.45, 1.45, 1.45), 0.05);
        ringMat1.opacity = THREE.MathUtils.lerp(ringMat1.opacity, 0.12 * targetIntensity, 0.05);
        ringMat2.opacity = THREE.MathUtils.lerp(ringMat2.opacity, 0.08 * targetIntensity, 0.05);
        coreOctaMat.opacity = THREE.MathUtils.lerp(coreOctaMat.opacity, 0.04, 0.05);
        particleMaterial.opacity = THREE.MathUtils.lerp(particleMaterial.opacity, 0.35, 0.05);
      } else {
        // Step 0: Brief mode - pushed back and scaled to outer perimeter so it never crosses hero text or prompt box
        ringGroup.position.z = THREE.MathUtils.lerp(ringGroup.position.z, -9, 0.05);
        ringGroup.position.y = THREE.MathUtils.lerp(ringGroup.position.y, 1.8, 0.05);
        ringGroup.scale.lerp(new THREE.Vector3(1.55, 1.55, 1.55), 0.05);
        ringMat1.opacity = THREE.MathUtils.lerp(ringMat1.opacity, 0.18, 0.05);
        ringMat2.opacity = THREE.MathUtils.lerp(ringMat2.opacity, 0.12, 0.05);
        coreOctaMat.opacity = THREE.MathUtils.lerp(coreOctaMat.opacity, 0.12, 0.05);
        particleMaterial.opacity = THREE.MathUtils.lerp(particleMaterial.opacity, 0.65, 0.05);
      }

      // Smooth Mouse Parallax Lerp
      mouseX += (targetMouseX - mouseX) * 0.04;
      mouseY += (targetMouseY - mouseY) * 0.04;
      camera.position.x = mouseX * (isCalm ? 1.4 : 2.8);
      camera.position.y = -mouseY * (isCalm ? 1.1 : 2.2);
      camera.lookAt(0, 0, 0);

      // State-driven dynamics
      let speedFactor = isCalm ? 0.7 : 1.0;
      let targetColor = new THREE.Color(0x0052ff);

      if (sceneState === "thinking") {
        speedFactor = 2.4;
        targetColor = new THREE.Color(0x06b6d4);
      } else if (sceneState === "plans") {
        speedFactor = 1.1;
        targetColor = new THREE.Color(0x0052ff);
      } else if (sceneState === "locked") {
        speedFactor = 0.6;
        targetColor = new THREE.Color(0x3b82f6);
      } else if (sceneState === "authorized") {
        speedFactor = 0.85;
        targetColor = new THREE.Color(0x10b981);
      } else if (sceneState === "settled") {
        speedFactor = 1.3;
        targetColor = new THREE.Color(0x10b981);
      } else if (sceneState === "blocked") {
        speedFactor = 1.8;
        targetColor = new THREE.Color(0xef4444);
      }

      // Rotate background rings slowly
      ringGroup.rotation.y = elapsed * 0.08 * speedFactor;
      ringGroup.rotation.x = Math.sin(elapsed * 0.05) * 0.15 + (mouseY * 0.1);
      coreOctaMesh.rotation.y = -elapsed * 0.18 * speedFactor;
      coreOctaMesh.rotation.z = elapsed * 0.12;

      // Pulse ring opacity and color smoothly
      ringMat1.color.lerp(targetColor, 0.05);

      // Update Floating Constellation
      crystalMeshes.forEach((mesh) => {
        const { r, speed, phase, yOffset } = mesh.userData;
        const effectiveR = isCalm ? Math.max(r, 18) : r;
        const angle = elapsed * speed * speedFactor + phase;
        let posX = Math.cos(angle) * effectiveR;
        if (isCalm && Math.abs(posX) < 14) {
          posX = posX < 0 ? -16 - Math.abs(posX) : 16 + Math.abs(posX);
        }
        mesh.position.x = posX;
        mesh.position.z = Math.sin(angle) * (effectiveR * 0.7) - (isCalm ? 8 : 3);
        mesh.position.y = yOffset + Math.sin(elapsed * 1.5 + phase) * 0.8;
        mesh.rotation.x += 0.012 * speedFactor;
        mesh.rotation.y += 0.016 * speedFactor;
      });

      // Drift particle positions gently
      particleSystem.rotation.y = elapsed * 0.02 * speedFactor;
      particleSystem.rotation.x = Math.cos(elapsed * 0.02) * 0.05 + (mouseY * 0.05);

      renderer.render(scene, camera);
      animId = requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pointermove", handlePointerMove);
      geometry.dispose();
      particleMaterial.dispose();
      ringGeo1.dispose();
      ringMat1.dispose();
      ringGeo2.dispose();
      ringMat2.dispose();
      coreOctaGeo.dispose();
      coreOctaMat.dispose();
      crystalDisposables.forEach((item) => item.dispose());
      renderer.dispose();
      if (container && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [sceneState, quality, isDarkMode]);

  // CSS Aurora Gradient Base Layer (Always rendered for instantaneous depth)
  return (
    <div
      data-testid="aurora-canvas-layer"
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
        overflow: "hidden",
      }}
    >
      {/* Dynamic Aurora Glow Orbs with Living Ambient Drift */}
      <div
        className="aurora-orb-ambient aurora-orb-1"
        style={{
          position: "absolute",
          top: "-15%",
          left: "20%",
          width: "55vw",
          height: "55vw",
          maxWidth: 800,
          maxHeight: 800,
          borderRadius: "50%",
          background: isDarkMode
            ? sceneState === "authorized" || sceneState === "settled"
              ? "radial-gradient(circle, rgba(16, 185, 129, 0.18) 0%, rgba(5, 150, 105, 0.05) 50%, transparent 70%)"
              : sceneState === "locked"
              ? "radial-gradient(circle, rgba(0, 82, 255, 0.22) 0%, rgba(14, 165, 233, 0.07) 50%, transparent 70%)"
              : sceneState === "thinking"
              ? "radial-gradient(circle, rgba(6, 182, 212, 0.22) 0%, rgba(99, 102, 241, 0.08) 50%, transparent 70%)"
              : "radial-gradient(circle, rgba(0, 82, 255, 0.16) 0%, rgba(99, 102, 241, 0.05) 50%, transparent 70%)"
            : "radial-gradient(circle, rgba(0, 82, 255, 0.08) 0%, transparent 70%)",
          filter: "blur(60px)",
          transition: "background 1s ease",
        }}
      />
      <div
        className="aurora-orb-ambient aurora-orb-2"
        style={{
          position: "absolute",
          bottom: "-10%",
          right: "10%",
          width: "48vw",
          height: "48vw",
          maxWidth: 650,
          maxHeight: 650,
          borderRadius: "50%",
          background: isDarkMode
            ? sceneState === "authorized" || sceneState === "settled"
              ? "radial-gradient(circle, rgba(6, 182, 212, 0.16) 0%, transparent 70%)"
              : sceneState === "locked"
              ? "radial-gradient(circle, rgba(124, 58, 237, 0.18) 0%, transparent 70%)"
              : "radial-gradient(circle, rgba(124, 58, 237, 0.14) 0%, transparent 70%)"
            : "radial-gradient(circle, rgba(6, 182, 212, 0.06) 0%, transparent 70%)",
          filter: "blur(50px)",
          transition: "background 1s ease",
        }}
      />

      {/* WebGL Canvas container */}
      <div
        ref={mountRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
        }}
      />
    </div>
  );
}

