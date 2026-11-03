// client/src/components/canvas/AuroraVaultCanvas.jsx
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export default function AuroraVaultCanvas({
  sceneState = "idle", // "idle" | "thinking" | "plans" | "locked" | "authorized" | "settled" | "blocked"
  quality = "full",    // "full" | "lite" | "off"
  isDarkMode = true,
}) {
  const mountRef = useRef(null);
  const [webglSupported, setWebglSupported] = useState(true);

  useEffect(() => {
    if (quality === "off" || !isDarkMode) return;

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

      const renderLite = () => {
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
    camera.position.z = 24;

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

    // 1. Motes / Particle Field
    const particleCount = 180;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const baseColor = new THREE.Color(0x0052ff);
    const accentColor = new THREE.Color(0x06b6d4);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 45;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 35;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20;

      const mixed = baseColor.clone().lerp(accentColor, Math.random());
      colors[i * 3] = mixed.r;
      colors[i * 3 + 1] = mixed.g;
      colors[i * 3 + 2] = mixed.b;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const particleMaterial = new THREE.PointsMaterial({
      size: 0.22,
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
    });
    const particleSystem = new THREE.Points(geometry, particleMaterial);
    scene.add(particleSystem);

    // 2. Concentric Vault Cryptographic Rings (Subtle in background)
    const ringGroup = new THREE.Group();
    ringGroup.position.set(0, 0, -4);

    const ringMat1 = new THREE.MeshBasicMaterial({
      color: 0x0052ff,
      wireframe: true,
      transparent: true,
      opacity: 0.18,
    });
    const ringGeo1 = new THREE.TorusGeometry(8.5, 0.05, 12, 64);
    const ringMesh1 = new THREE.Mesh(ringGeo1, ringMat1);
    ringGroup.add(ringMesh1);

    const ringMat2 = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      wireframe: true,
      transparent: true,
      opacity: 0.14,
    });
    const ringGeo2 = new THREE.TorusGeometry(11.2, 0.04, 12, 64);
    const ringMesh2 = new THREE.Mesh(ringGeo2, ringMat2);
    ringMesh2.rotation.x = Math.PI / 4;
    ringGroup.add(ringMesh2);

    // Cryptographic Crystalline Node (Octahedron)
    const octaGeo = new THREE.OctahedronGeometry(2.2, 0);
    const octaMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.12,
    });
    const octaMesh = new THREE.Mesh(octaGeo, octaMat);
    ringGroup.add(octaMesh);

    scene.add(ringGroup);

    // Animation Loop
    let animId;
    let clock = new THREE.Clock();

    const animate = () => {
      const elapsed = clock.getElapsedTime();

      // State-driven dynamics
      let speedFactor = 1.0;
      let targetColor = new THREE.Color(0x0052ff);

      if (sceneState === "thinking") {
        speedFactor = 2.4;
        targetColor = new THREE.Color(0x06b6d4);
      } else if (sceneState === "locked") {
        speedFactor = 0.5;
        targetColor = new THREE.Color(0x3b82f6);
      } else if (sceneState === "authorized") {
        speedFactor = 0.8;
        targetColor = new THREE.Color(0x10b981);
      } else if (sceneState === "settled") {
        speedFactor = 1.2;
        targetColor = new THREE.Color(0x10b981);
      } else if (sceneState === "blocked") {
        speedFactor = 1.8;
        targetColor = new THREE.Color(0xef4444);
      }

      // Rotate background rings slowly
      ringGroup.rotation.y = elapsed * 0.08 * speedFactor;
      ringGroup.rotation.x = Math.sin(elapsed * 0.05) * 0.15;
      octaMesh.rotation.y = -elapsed * 0.15 * speedFactor;
      octaMesh.rotation.z = elapsed * 0.1;

      // Pulse ring opacity and color smoothly
      ringMat1.color.lerp(targetColor, 0.05);

      // Drift particle positions gently
      particleSystem.rotation.y = elapsed * 0.02 * speedFactor;
      particleSystem.rotation.x = Math.cos(elapsed * 0.02) * 0.05;

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
      geometry.dispose();
      particleMaterial.dispose();
      ringGeo1.dispose();
      ringMat1.dispose();
      ringGeo2.dispose();
      ringMat2.dispose();
      octaGeo.dispose();
      octaMat.dispose();
      renderer.dispose();
      if (container && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [sceneState, quality, isDarkMode]);

  // CSS Aurora Gradient Base Layer (Always rendered for instantaneous depth)
  return (
    <div
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
      {/* Dynamic Aurora Glow Orbs */}
      <div
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
            ? sceneState === "authorized"
              ? "radial-gradient(circle, rgba(16, 185, 129, 0.14) 0%, rgba(5, 150, 105, 0.04) 50%, transparent 70%)"
              : sceneState === "locked"
              ? "radial-gradient(circle, rgba(0, 82, 255, 0.18) 0%, rgba(14, 165, 233, 0.05) 50%, transparent 70%)"
              : "radial-gradient(circle, rgba(0, 82, 255, 0.15) 0%, rgba(99, 102, 241, 0.04) 50%, transparent 70%)"
            : "radial-gradient(circle, rgba(0, 82, 255, 0.08) 0%, transparent 70%)",
          filter: "blur(60px)",
          transition: "background 1s ease",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-10%",
          right: "10%",
          width: "45vw",
          height: "45vw",
          maxWidth: 600,
          maxHeight: 600,
          borderRadius: "50%",
          background: isDarkMode
            ? sceneState === "authorized"
              ? "radial-gradient(circle, rgba(6, 182, 212, 0.12) 0%, transparent 70%)"
              : "radial-gradient(circle, rgba(124, 58, 237, 0.12) 0%, transparent 70%)"
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
