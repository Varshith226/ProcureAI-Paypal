import React, { useEffect, useRef, useState } from "react";

/**
 * CustomCursor - Aurora Vault Precision Cursor Follower
 * 
 * Features:
 * - Zero latency: Native SVG cursor handles instant point-and-click
 * - Ambient halo: Smooth 60fps damped trailing ring with radial cyan/violet glow
 * - State reactive: Expands on clickable targets, compresses on click
 * - Safe & accessible: pointer-events: none, auto-disabled on touch or reduced-motion
 */
export default function CustomCursor({ isDarkMode = true }) {
  const haloRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isClicking, setIsClicking] = useState(false);

  useEffect(() => {
    // Only enable on devices with hover + fine pointers (not touchscreens/mobile)
    const hasFinePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!hasFinePointer || prefersReducedMotion) {
      return;
    }

    let mouseX = -100;
    let mouseY = -100;
    let currentX = -100;
    let currentY = -100;
    let animId = null;

    const onMouseMove = (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (!visible) setVisible(true);
    };

    const onMouseDown = () => setIsClicking(true);
    const onMouseUp = () => setIsClicking(false);
    const onMouseLeave = () => setVisible(false);
    const onMouseEnter = () => setVisible(true);

    // Detect hover over interactive elements
    const onMouseOver = (e) => {
      const target = e.target;
      if (!target) return;
      const interactive = target.closest(
        'a, button, [role="button"], .ant-btn, input, textarea, select, .ant-select, .ant-switch, .ant-slider-handle, .glass-card-interactive, .ant-tag, [data-interactive="true"]'
      );
      setIsHovered(!!interactive);
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("mousedown", onMouseDown, { passive: true });
    window.addEventListener("mouseup", onMouseUp, { passive: true });
    window.addEventListener("mouseover", onMouseOver, { passive: true });
    document.addEventListener("mouseleave", onMouseLeave);
    document.addEventListener("mouseenter", onMouseEnter);

    // Smooth lerp loop
    const renderLoop = () => {
      // Damped spring factor (0.18 gives snappy but organic lag)
      currentX += (mouseX - currentX) * 0.18;
      currentY += (mouseY - currentY) * 0.18;

      if (haloRef.current) {
        haloRef.current.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
      }
      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);

    return () => {
      if (animId) cancelAnimationFrame(animId);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("mouseleave", onMouseLeave);
      document.removeEventListener("mouseenter", onMouseEnter);
    };
  }, [visible]);

  // Compute ring dimensions based on state
  let haloSize = 32;
  if (isHovered) haloSize = 46;
  if (isClicking) haloSize = 22;

  const haloOffset = haloSize / 2;

  return (
    <div
      ref={haloRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        pointerEvents: "none",
        zIndex: 999999,
        opacity: visible ? 1 : 0,
        transition: "opacity 0.25s ease",
        willChange: "transform",
      }}
    >
      {/* Ambient trailing halo */}
      <div
        style={{
          width: haloSize,
          height: haloSize,
          position: "absolute",
          top: -haloOffset,
          left: -haloOffset,
          borderRadius: "50%",
          border: isHovered
            ? "1.5px solid rgba(56, 189, 248, 0.85)"
            : "1.5px solid rgba(34, 211, 238, 0.4)",
          background: isHovered
            ? "radial-gradient(circle, rgba(56, 189, 248, 0.15) 0%, rgba(139, 92, 246, 0.08) 70%, transparent 100%)"
            : "radial-gradient(circle, rgba(34, 211, 238, 0.08) 0%, transparent 70%)",
          boxShadow: isHovered
            ? "0 0 16px rgba(56, 189, 248, 0.4), inset 0 0 8px rgba(34, 211, 238, 0.2)"
            : "0 0 10px rgba(34, 211, 238, 0.2)",
          transform: `scale(${isClicking ? 0.85 : 1})`,
          transition: "width 0.2s cubic-bezier(0.16, 1, 0.3, 1), height 0.2s cubic-bezier(0.16, 1, 0.3, 1), top 0.2s cubic-bezier(0.16, 1, 0.3, 1), left 0.2s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease",
        }}
      >
        {/* Subtle center cross-dot when hovering interactive elements */}
        {isHovered && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: 4,
              height: 4,
              marginTop: -2,
              marginLeft: -2,
              borderRadius: "50%",
              background: "#38bdf8",
              boxShadow: "0 0 6px #38bdf8",
              transition: "opacity 0.2s ease",
            }}
          />
        )}
      </div>
    </div>
  );
}
