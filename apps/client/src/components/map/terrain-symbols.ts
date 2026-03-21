/**
 * Cartographic terrain symbol renderer.
 * Generates cached Textures for each terrain type (multiple variants per type)
 * using classic map-drawing conventions: grass tufts, hachure hills,
 * mountain peaks, tree silhouettes, wave patterns, marsh reeds, stipple dots.
 */

import { Graphics, Texture, Container, type Renderer } from 'pixi.js';
import { HEX_SIZE } from './hex-layout.js';

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

const VARIANTS_PER_TERRAIN = 4;
const SYMBOL_AREA = HEX_SIZE * 1.4; // radius within which to scatter symbols

type TerrainDrawFn = (g: Graphics, rng: () => number) => void;

// ─── Individual terrain symbol drawers ───

function drawPlains(g: Graphics, rng: () => number): void {
  // 5-8 small grass tufts scattered in the hex
  const count = 5 + Math.floor(rng() * 4);
  for (let i = 0; i < count; i++) {
    const bx = (rng() * 2 - 1) * SYMBOL_AREA * 0.6;
    const by = (rng() * 2 - 1) * SYMBOL_AREA * 0.5;
    const scale = 0.7 + rng() * 0.5;

    // 3 blades fanning out from base
    for (let b = -1; b <= 1; b++) {
      const angle = (b * 25 + (rng() * 10 - 5)) * (Math.PI / 180);
      const len = (7 + rng() * 4) * scale;
      const tipX = bx + Math.sin(angle) * len;
      const tipY = by - Math.cos(angle) * len;
      const cpX = bx + Math.sin(angle) * len * 0.5 + (rng() - 0.5) * 2;
      const cpY = by - Math.cos(angle) * len * 0.7;
      g.moveTo(bx, by);
      g.quadraticCurveTo(cpX, cpY, tipX, tipY);
    }
  }
  g.stroke({ color: 0x5A6B3A, width: 1.2, alpha: 0.7 });
}

function drawHills(g: Graphics, rng: () => number): void {
  // 2-3 hachure arc humps (classic "caterpillar" hills)
  const count = 2 + Math.floor(rng() * 2);
  const startY = -count * 5;

  for (let i = 0; i < count; i++) {
    const cx = (rng() * 2 - 1) * 4;
    const cy = startY + i * 10;
    const halfW = 10 + rng() * 6;
    const height = 8 + rng() * 4;

    // Main arc
    g.moveTo(cx - halfW, cy);
    g.quadraticCurveTo(cx, cy - height, cx + halfW, cy);

    // Short hachure lines descending from arc
    const hachures = 3 + Math.floor(rng() * 3);
    for (let h = 0; h < hachures; h++) {
      const t = (h + 0.5) / hachures;
      const hx = cx - halfW + t * halfW * 2;
      // approximate y on the arc
      const hy = cy - height * 4 * t * (1 - t);
      const hLen = 3 + rng() * 3;
      g.moveTo(hx, hy);
      g.lineTo(hx + (rng() - 0.5), hy + hLen);
    }
  }
  g.stroke({ color: 0x6B5040, width: 1.4, alpha: 0.75 });
}

function drawMountains(g: Graphics, rng: () => number): void {
  // 1-2 mountain peaks with slight hand-drawn wobble
  const peaks = 1 + Math.floor(rng() * 1.5);

  for (let p = 0; p < peaks; p++) {
    const ox = p === 0 ? -3 + rng() * 6 : (rng() > 0.5 ? 12 : -12) + (rng() * 4 - 2);
    const oy = p === 0 ? 0 : 2 + rng() * 4;
    const scale = p === 0 ? 1 : 0.7 + rng() * 0.2;
    const w = (12 + rng() * 4) * scale;
    const h = (16 + rng() * 5) * scale;

    const wobble = () => (rng() * 2 - 1) * 1.2;

    // Triangle outline
    const lx = ox - w + wobble();
    const ly = oy + h / 2 + wobble();
    const tx = ox + wobble() * 0.5;
    const ty = oy - h / 2 + wobble();
    const rx = ox + w + wobble();
    const ry = oy + h / 2 + wobble();

    g.moveTo(lx, ly);
    g.lineTo(tx, ty);
    g.lineTo(rx, ry);

    // Hatching on left (shaded) slope
    const hatches = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < hatches; i++) {
      const t = (i + 1) / (hatches + 1);
      const sx = lx + (tx - lx) * t + 1;
      const sy = ly + (ty - ly) * t;
      const len = 3 + rng() * 3;
      g.moveTo(sx, sy);
      g.lineTo(sx + len * 0.3, sy + len);
    }
  }
  g.stroke({ color: 0x4A4240, width: 1.6, alpha: 0.8 });
}

function drawForest(g: Graphics, rng: () => number): void {
  // 3-5 tree silhouettes (mix of deciduous lollipops and conifers)
  const count = 3 + Math.floor(rng() * 3);

  for (let i = 0; i < count; i++) {
    const tx = (rng() * 2 - 1) * SYMBOL_AREA * 0.5;
    const ty = (rng() * 2 - 1) * SYMBOL_AREA * 0.4;
    const isConifer = rng() > 0.5;
    const scale = 0.7 + rng() * 0.4;

    if (isConifer) {
      // Triangle crown
      const w = 5 * scale;
      const h = 10 * scale;
      g.moveTo(tx, ty - h);
      g.lineTo(tx - w, ty - 2 * scale);
      g.lineTo(tx + w, ty - 2 * scale);
      g.closePath();
      g.fill({ color: 0x2D5A28, alpha: 0.7 });
      // Trunk
      g.moveTo(tx, ty - 2 * scale);
      g.lineTo(tx, ty + 3 * scale);
      g.stroke({ color: 0x4A3A28, width: 1.2 });
    } else {
      // Deciduous: circle crown on a stick
      const r = 4 * scale;
      g.circle(tx, ty - 6 * scale, r);
      g.fill({ color: 0x2D5A28, alpha: 0.6 });
      // Trunk
      g.moveTo(tx, ty - (6 - r) * scale);
      g.lineTo(tx, ty + 3 * scale);
      g.stroke({ color: 0x4A3A28, width: 1.2 });
    }
  }
}

function drawCoast(g: Graphics, rng: () => number): void {
  // 3-5 wave squiggles in roughly horizontal rows
  const count = 3 + Math.floor(rng() * 3);

  for (let i = 0; i < count; i++) {
    const wx = (rng() * 2 - 1) * SYMBOL_AREA * 0.4;
    const wy = (rng() * 2 - 1) * SYMBOL_AREA * 0.4;
    const waveLen = 7 + rng() * 5;
    const amp = 3 + rng() * 2;

    g.moveTo(wx - waveLen, wy);
    g.quadraticCurveTo(wx - waveLen / 2, wy - amp, wx, wy);
    g.quadraticCurveTo(wx + waveLen / 2, wy + amp, wx + waveLen, wy);
  }
  g.stroke({ color: 0x4A7A9A, width: 1.1, alpha: 0.7 });
}

function drawMarsh(g: Graphics, rng: () => number): void {
  // 5-7 reed marks: short vertical lines with horizontal tick crosses
  const count = 5 + Math.floor(rng() * 3);

  for (let i = 0; i < count; i++) {
    const rx = (rng() * 2 - 1) * SYMBOL_AREA * 0.5;
    const ry = (rng() * 2 - 1) * SYMBOL_AREA * 0.4;
    const h = 7 + rng() * 4;

    // Vertical reed stem
    g.moveTo(rx, ry);
    g.lineTo(rx, ry - h);

    // 2-3 horizontal ticks
    const ticks = 2 + Math.floor(rng() * 2);
    for (let t = 0; t < ticks; t++) {
      const tickY = ry - h * (t + 1) / (ticks + 1);
      const tickW = 2 + rng() * 2;
      g.moveTo(rx - tickW, tickY);
      g.lineTo(rx + tickW, tickY);
    }
  }
  g.stroke({ color: 0x3A5A35, width: 1.0, alpha: 0.7 });
}

function drawDesert(g: Graphics, rng: () => number): void {
  // 15-25 stipple dots scattered with slight clustering
  const count = 15 + Math.floor(rng() * 11);

  for (let i = 0; i < count; i++) {
    // Gaussian-ish clustering: average of two uniform randoms
    const dx = ((rng() + rng()) / 2 * 2 - 1) * SYMBOL_AREA * 0.6;
    const dy = ((rng() + rng()) / 2 * 2 - 1) * SYMBOL_AREA * 0.5;
    g.circle(dx, dy, 0.6 + rng() * 0.4);
  }
  g.fill({ color: 0x8A7040, alpha: 0.65 });
}

// ─── Registry ───

const DRAW_FNS: Record<string, TerrainDrawFn> = {
  plains: drawPlains,
  hills: drawHills,
  mountains: drawMountains,
  forest: drawForest,
  coast: drawCoast,
  marsh: drawMarsh,
  desert: drawDesert,
};

// ─── Texture cache generation ───

let textureCache: Record<string, Texture[]> | null = null;

/**
 * Generate terrain symbol textures (called once at init).
 * Returns a map of terrain type → array of variant Textures.
 */
export function generateTerrainTextures(
  renderer: Renderer
): Record<string, Texture[]> {
  if (textureCache) return textureCache;

  const result: Record<string, Texture[]> = {};

  for (const [terrain, drawFn] of Object.entries(DRAW_FNS)) {
    const variants: Texture[] = [];

    for (let v = 0; v < VARIANTS_PER_TERRAIN; v++) {
      const container = new Container();
      const g = new Graphics();
      container.addChild(g);

      const rng = mulberry32(terrain.length * 1000 + v * 7919);
      drawFn(g, rng);

      // Render to texture with padding so strokes aren't clipped
      const tex = renderer.generateTexture({
        target: container,
        resolution: 2, // crisp at zoom
      });
      variants.push(tex);
    }

    result[terrain] = variants;
  }

  textureCache = result;
  return result;
}

/**
 * Pick a deterministic variant index for a hex.
 */
export function terrainVariant(q: number, r: number): number {
  return (((q * 73856093) ^ (r * 19349663)) >>> 0) % VARIANTS_PER_TERRAIN;
}

/**
 * Get a small deterministic rotation for a hex's terrain stamp.
 */
export function terrainRotation(q: number, r: number): number {
  const seed = ((q * 48611) ^ (r * 29423)) >>> 0;
  return ((seed % 100) / 100 - 0.5) * 0.3; // +-0.15 radians
}

/**
 * Clear cached textures (call on cleanup).
 */
export function clearTerrainTextures(): void {
  if (!textureCache) return;
  for (const variants of Object.values(textureCache)) {
    for (const tex of variants) {
      tex.destroy(true);
    }
  }
  textureCache = null;
}
