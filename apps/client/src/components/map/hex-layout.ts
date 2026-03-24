/**
 * Hex math utilities for the PixiJS map renderer.
 * Flat-top hexagons with axial (q, r) coordinates.
 */

export const HEX_SIZE = 40; // radius (center to corner)

// Flat-top hex dimensions
export const HEX_WIDTH = HEX_SIZE * 2;
export const HEX_HEIGHT = Math.sqrt(3) * HEX_SIZE;

/** Convert axial (q, r) to pixel (x, y) for flat-top hexagons. */
export function hexToPixel(q: number, r: number): { x: number; y: number } {
  const x = HEX_SIZE * (3 / 2 * q);
  const y = HEX_SIZE * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r);
  return { x, y };
}

/** Convert pixel (x, y) to fractional axial coordinates. */
export function pixelToHex(px: number, py: number): { q: number; r: number } {
  const q = (2 / 3 * px) / HEX_SIZE;
  const r = (-1 / 3 * px + Math.sqrt(3) / 3 * py) / HEX_SIZE;
  return { q, r };
}

/** Round fractional axial coordinates to nearest hex. */
export function roundHex(q: number, r: number): { q: number; r: number } {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);

  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);

  if (dq > dr && dq > ds) {
    rq = -rr - rs;
  } else if (dr > ds) {
    rr = -rq - rs;
  }

  return { q: rq, r: rr };
}

/** Get the 6 corner points of a flat-top hex centered at (0, 0). */
export function hexCorners(): { x: number; y: number }[] {
  const corners: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    corners.push({
      x: HEX_SIZE * Math.cos(angle),
      y: HEX_SIZE * Math.sin(angle),
    });
  }
  return corners;
}

/** Get the 6 edge midpoints of a flat-top hex centered at (0, 0). */
export function hexEdgeMidpoints(): { x: number; y: number }[] {
  const corners = hexCorners();
  const midpoints: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const c1 = corners[i];
    const c2 = corners[(i + 1) % 6];
    midpoints.push({ x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 });
  }
  return midpoints;
}

/** Terrain color mapping — dark, muted tones for candlelit war-table feel. */
export const TERRAIN_COLORS: Record<string, number> = {
  plains:    0x6B7A3A,
  farmland:  0x8A9A4A,
  hills:     0x6B5B3E,
  mountains: 0x4A4240,
  forest:    0x2D5A28,
  coast:     0x2A5A7A,
  marsh:     0x3A5A35,
  desert:    0x8A7A55,
};

export const TERRAIN_COLORS_SELECTED: Record<string, number> = {
  plains:    0x8B9A5A,
  farmland:  0xAABA6A,
  hills:     0x8B7B5E,
  mountains: 0x6A6260,
  forest:    0x4D7A48,
  coast:     0x4A7A9A,
  marsh:     0x5A7A55,
  desert:    0xAA9A75,
};

/** Thin hex grid outline color for the cartographic map style. */
export const HEX_GRID_COLOR = 0x3d3225;
export const HEX_GRID_ALPHA = 0.25;

/** Direction-to-corner-index mapping for flat-top hexes. */
export const DIR_EDGE_INDEX: Record<string, number> = {
  ne: 0, e: 1, se: 2, sw: 3, w: 4, nw: 5,
};
