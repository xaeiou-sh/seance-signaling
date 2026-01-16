import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import ColorBends from "./ColorBends";

interface Orb {
  id: number;
  x: number;
  y: number;
  size: number;
  color: "neon" | "flame";
  delay: number;
  duration: number;
}

const generateOrbs = (count: number): Orb[] => {
  const colors: Orb["color"][] = ["neon", "flame"];
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 80 + 40,
    color: colors[Math.floor(Math.random() * colors.length)],
    delay: Math.random() * 5,
    duration: 8 + Math.random() * 12,
  }));
};

const colorMap = {
  neon: "47, 255, 0",
  flame: "47, 255, 0",
};

export const HeroBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbs = useRef<Orb[]>(generateOrbs(8));

  // Animated grid canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resize();
    window.addEventListener("resize", resize);

    const drawGrid = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      // Horizon line position (lower = more dramatic perspective)
      const horizon = height * 0.35;
      const vanishX = width / 2;

      // Vertical lines (receding to vanishing point)
      const verticalLines = 40;
      const baseSpacing = width / verticalLines;

      ctx.strokeStyle = `rgba(47, 255, 0, 0.15)`;
      ctx.lineWidth = 1;

      for (let i = -verticalLines; i <= verticalLines * 2; i++) {
        const baseX = i * baseSpacing;
        const topX = vanishX + (baseX - vanishX) * 0.02;

        ctx.beginPath();
        ctx.moveTo(topX, 0);
        ctx.lineTo(baseX, height);
        ctx.stroke();
      }

      // Horizontal lines (perspective grid floor)
      const horizontalLines = 30;
      for (let i = 0; i < horizontalLines; i++) {
        // Exponential spacing for perspective effect
        const t = i / horizontalLines;
        const y = horizon + (height - horizon) * Math.pow(t, 1.8);

        // Lines get brighter as they get closer
        const alpha = 0.05 + t * 0.2;

        // Animate a pulse traveling down from the vanishing point
        const pulsePos = (time * 0.3) % 1.4 - 0.4;
        const distFromPulse = Math.abs(t - pulsePos);
        const pulseIntensity = Math.max(0, 1 - distFromPulse * 2.5);

        ctx.strokeStyle = `rgba(47, 255, 0, ${alpha + pulseIntensity * 0.12})`;
        ctx.lineWidth = 1 + pulseIntensity * 1;

        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      time += 0.008;
      animationId = requestAnimationFrame(drawGrid);
    };

    drawGrid();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Base gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to bottom, #000000 0%, #030303 100%)`,
        }}
      />

      {/* Color Bends - full background */}
      <div className="absolute inset-0 opacity-50">
        <div className="w-full h-full">
          <ColorBends
            rotation={-91}
            autoRotate={0}
            speed={0.3}
            scale={0.2}
            frequency={1}
            warpStrength={1}
            mouseInfluence={0}
            parallax={0}
            noise={1}
            colors={["#2FFF00"]}
          />
        </div>
      </div>

      {/* Animated grid canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 opacity-60"
        style={{ mixBlendMode: "screen" }}
      />

      {/* Floating orbs */}
      {orbs.current.map((orb) => (
        <motion.div
          key={orb.id}
          className="absolute rounded-full"
          style={{
            left: `${orb.x}%`,
            top: `${orb.y}%`,
            width: orb.size,
            height: orb.size,
            background: `radial-gradient(circle at 30% 30%,
              rgba(${colorMap[orb.color]}, 0.4) 0%,
              rgba(${colorMap[orb.color]}, 0.1) 40%,
              transparent 70%)`,
            filter: `blur(${orb.size / 4}px)`,
          }}
          animate={{
            x: [0, 30, -20, 10, 0],
            y: [0, -40, 20, -10, 0],
            scale: [1, 1.2, 0.9, 1.1, 1],
            opacity: [0.3, 0.6, 0.4, 0.5, 0.3],
          }}
          transition={{
            duration: orb.duration,
            delay: orb.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Scanlines overlay */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(47, 255, 0, 0.06) 2px,
            rgba(47, 255, 0, 0.06) 4px
          )`,
        }}
      />

      {/* Noise texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          mixBlendMode: "overlay",
        }}
      />

      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 70% 60% at 50% 40%, transparent 0%, rgba(0, 0, 0, 0.6) 100%)`,
        }}
      />

      {/* Top fade for nav */}
      <div
        className="absolute inset-x-0 top-0 h-32"
        style={{
          background: `linear-gradient(to bottom, rgba(0, 0, 0, 0.8) 0%, transparent 100%)`,
        }}
      />

      {/* Bottom fade out */}
      <div
        className="absolute inset-x-0 bottom-0 h-72"
        style={{
          background: `linear-gradient(to top, #000000 0%, #000000 20%, transparent 100%)`,
        }}
      />
    </div>
  );
};
