// ═══════════════════════════════════════════════════════════════════════════
// COLOR CONSTANTS (OKLCH Format)
// Based on XAEIOU design system (src/globals.css)
// OKLCH format: oklch(Lightness Chroma Hue)
// ═══════════════════════════════════════════════════════════════════════════

// Primary Colors
export const PHANTOM_PURPLE = "oklch(0.5 0.3 285)";    // Purple - mystery, special effects
export const NEON = "oklch(0.9 0.3 140)";       // Electric green - primary actions, success
export const FLAME = "oklch(0.7 0.2 40)";       // Orange - warnings, highlights, energy

// Supporting Colors
export const BLACK = "oklch(0 0 0)";             // Pure black - dominant background
export const WHITE = "oklch(1 0 0)";             // White - high contrast text
export const MIST = "oklch(0.9 0.01 0)";        // Pale gray - muted text

// Derived Shades (for hover states, shadows, etc.)
export const PHANTOM_LIGHT = "oklch(0.6 0.28 285)";   // Lighter purple for hover
export const PHANTOM_DARK = "oklch(0.4 0.3 285)";     // Darker purple
export const NEON_LIGHT = "oklch(0.95 0.28 140)";     // Lighter green for hover
export const NEON_DARK = "oklch(0.8 0.3 140)";        // Darker green
export const FLAME_LIGHT = "oklch(0.75 0.2 40)";      // Lighter orange for hover
export const FLAME_DARK = "oklch(0.65 0.22 40)";      // Darker orange

// ═══════════════════════════════════════════════════════════════════════════
// BUTTON STYLES
// Note: Using Tailwind's arbitrary value syntax with OKLCH colors
// Format: bg-[oklch(0.5_0.3_285)] - underscores replace spaces for Tailwind
// ═══════════════════════════════════════════════════════════════════════════

export const downloadButtonStyle =
  `group bg-[oklch(0.5_0.3_285)] text-pure hover:bg-[oklch(0.6_0.28_285)] transition-all duration-300 font-mono shadow-lg shadow-[oklch(0.5_0.3_285)]/50 hover:shadow-[oklch(0.5_0.3_285)]/70`;

export const waitlistButtonStyle =
  "group bg-flame text-void glow-flame transition-all duration-300 hover:glow-flame-intense font-mono";

export const getStartedButtonStyle =
  "bg-flame text-void glow-flame transition-all duration-300 hover:glow-flame-intense";
