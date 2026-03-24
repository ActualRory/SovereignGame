/**
 * Procedural parchment background generator.
 * Creates an off-screen Canvas2D with warm paper tones, grain noise,
 * aging stain blotches, and per-hex terrain color washes.
 */

import { Texture } from 'pixi.js';
import { hexToPixel, HEX_SIZE } from './hex-layout.js';

/** Parchment palette */
const BASE_COLOR = { r: 196, g: 168, b: 120 }; // #C4A878
const NOISE_AMPLITUDE = 12; // per-channel luminance jitter

/** Per-terrain tint washes (very low alpha, blended over parchment) */
const TERRAIN_WASHES: Record<string, { r: number; g: number; b: number; a: number }> = {
  plains:    { r: 107, g: 122, b: 58,  a: 0.08 },
  farmland:  { r: 138, g: 154, b: 74,  a: 0.10 },
  hills:     { r: 140, g: 120, b: 80,  a: 0.10 },
  mountains: { r: 100, g: 95,  b: 90,  a: 0.10 },
  forest:    { r: 45,  g: 90,  b: 40,  a: 0.10 },
  coast:     { r: 100, g: 140, b: 170, a: 0.15 },
  marsh:     { r: 80,  g: 110, b: 70,  a: 0.10 },
  desert:    { r: 180, g: 160, b: 100, a: 0.08 },
};

/** Simple seeded PRNG (mulberry32) */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface HexData {
  q: number;
  r: number;
  terrain: string;
}

/**
 * Generate a parchment canvas texture covering the map bounds.
 * Returns a PixiJS Texture and the world-space origin (top-left) of the canvas.
 */
export function generateParchmentTexture(
  hexes: HexData[],
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
): { texture: Texture; originX: number; originY: number } {
  const pad = HEX_SIZE * 2;
  const originX = bounds.minX - pad;
  const originY = bounds.minY - pad;
  const width = Math.ceil(bounds.maxX - bounds.minX + pad * 2);
  const height = Math.ceil(bounds.maxY - bounds.minY + pad * 2);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Step 1: Fill with base parchment color
  ctx.fillStyle = `rgb(${BASE_COLOR.r}, ${BASE_COLOR.g}, ${BASE_COLOR.b})`;
  ctx.fillRect(0, 0, width, height);

  // Step 2: Per-pixel grain noise
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const rng = mulberry32(42);
  for (let i = 0; i < data.length; i += 4) {
    const noise = (rng() * 2 - 1) * NOISE_AMPLITUDE;
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
  }
  ctx.putImageData(imageData, 0, 0);

  // Step 3: Aging stain blotches
  const stainRng = mulberry32(137);
  const stainCount = 6 + Math.floor(stainRng() * 4);
  for (let i = 0; i < stainCount; i++) {
    const sx = stainRng() * width;
    const sy = stainRng() * height;
    const radius = 60 + stainRng() * 150;
    const gradient = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
    gradient.addColorStop(0, `rgba(168, 136, 80, ${0.04 + stainRng() * 0.06})`);
    gradient.addColorStop(1, 'rgba(168, 136, 80, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
  }

  // Step 4: Per-hex terrain washes (soft radial gradients)
  for (const hex of hexes) {
    const wash = TERRAIN_WASHES[hex.terrain];
    if (!wash) continue;
    const pos = hexToPixel(hex.q, hex.r);
    const cx = pos.x - originX;
    const cy = pos.y - originY;
    const radius = HEX_SIZE * 1.2;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, `rgba(${wash.r}, ${wash.g}, ${wash.b}, ${wash.a})`);
    gradient.addColorStop(1, `rgba(${wash.r}, ${wash.g}, ${wash.b}, 0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }

  // Step 5: Subtle edge darkening (vignette on the canvas itself)
  const vigGrad = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.3,
    width / 2, height / 2, Math.max(width, height) * 0.7
  );
  vigGrad.addColorStop(0, 'rgba(40, 32, 22, 0)');
  vigGrad.addColorStop(1, 'rgba(40, 32, 22, 0.15)');
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, width, height);

  const texture = Texture.from(canvas);
  return { texture, originX, originY };
}
