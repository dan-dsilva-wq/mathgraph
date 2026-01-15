import * as THREE from 'three';

// Map a value from one range to another
function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

// Distinct color palettes for multiple functions
// Each palette has a base hue with slight variation for depth, plus saturation/lightness ranges
const COLOR_PALETTES = [
  // Blue palette (function 0) - shifts toward cyan at high z
  { hMin: 0.55, hMax: 0.65, sRange: [0.7, 0.95], lRange: [0.25, 0.65] },
  // Orange palette (function 1) - shifts toward yellow at high z
  { hMin: 0.02, hMax: 0.12, sRange: [0.85, 1.0], lRange: [0.3, 0.6] },
  // Green palette (function 2) - shifts toward cyan at high z
  { hMin: 0.28, hMax: 0.42, sRange: [0.6, 0.9], lRange: [0.25, 0.55] },
  // Purple palette (function 3) - shifts toward blue at high z
  { hMin: 0.7, hMax: 0.82, sRange: [0.6, 0.9], lRange: [0.3, 0.65] },
  // Cyan palette (function 4) - shifts toward blue at high z
  { hMin: 0.45, hMax: 0.55, sRange: [0.7, 0.95], lRange: [0.3, 0.6] },
  // Red/Pink palette (function 5) - shifts toward orange at high z
  { hMin: 0.95, hMax: 0.05, sRange: [0.75, 0.95], lRange: [0.3, 0.55] },
];

// Get color based on z-value with a specific color palette for multi-function support
export function getColorForZWithPalette(z: number, zMin: number, zMax: number, functionIndex: number): THREE.Color {
  const t = mapRange(z, zMin, zMax, 0, 1);
  const palette = COLOR_PALETTES[functionIndex % COLOR_PALETTES.length];

  // Hue shifts with z for better depth perception
  let h: number;
  if (palette.hMin > palette.hMax) {
    // Wraps around (e.g., red to orange)
    h = palette.hMin + t * ((1 - palette.hMin) + palette.hMax);
    if (h > 1) h -= 1;
  } else {
    h = mapRange(t, 0, 1, palette.hMin, palette.hMax);
  }

  const s = mapRange(t, 0, 1, palette.sRange[0], palette.sRange[1]);
  const l = mapRange(t, 0, 1, palette.lRange[0], palette.lRange[1]);

  const color = new THREE.Color();
  color.setHSL(h, s, l);
  return color;
}

// Get the base color for a function (for UI display)
export function getFunctionColor(functionIndex: number): string {
  const palette = COLOR_PALETTES[functionIndex % COLOR_PALETTES.length];
  const color = new THREE.Color();
  const midH = (palette.hMin + palette.hMax) / 2;
  color.setHSL(midH > 1 ? midH - 1 : midH, 0.8, 0.5);
  return '#' + color.getHexString();
}

// Get color based on z-value (blue -> cyan -> green -> yellow -> red) - legacy single function
export function getColorForZ(z: number, zMin: number, zMax: number): THREE.Color {
  // Normalize z to 0-1 range
  const t = mapRange(z, zMin, zMax, 0, 1);

  // Color gradient: blue (0) -> cyan (0.25) -> green (0.5) -> yellow (0.75) -> red (1)
  let r: number, g: number, b: number;

  if (t < 0.25) {
    // Blue to Cyan
    const localT = t / 0.25;
    r = 0;
    g = localT;
    b = 1;
  } else if (t < 0.5) {
    // Cyan to Green
    const localT = (t - 0.25) / 0.25;
    r = 0;
    g = 1;
    b = 1 - localT;
  } else if (t < 0.75) {
    // Green to Yellow
    const localT = (t - 0.5) / 0.25;
    r = localT;
    g = 1;
    b = 0;
  } else {
    // Yellow to Red
    const localT = (t - 0.75) / 0.25;
    r = 1;
    g = 1 - localT;
    b = 0;
  }

  return new THREE.Color(r, g, b);
}

// Get a default gray color for undefined points
export function getUndefinedColor(): THREE.Color {
  return new THREE.Color(0.5, 0.5, 0.5);
}
