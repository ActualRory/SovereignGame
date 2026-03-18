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

/** Terrain color mapping. */
export const TERRAIN_COLORS: Record<string, number> = {
  plains:    0xC8D87E,
  hills:     0xA8956E,
  mountains: 0x8C7C6C,
  forest:    0x5B8C4A,
  coast:     0x6BAFCF,
  marsh:     0x7A9A6B,
  desert:    0xDBC9A0,
};

export const TERRAIN_COLORS_SELECTED: Record<string, number> = {
  plains:    0xD8E88E,
  hills:     0xB8A57E,
  mountains: 0x9C8C7C,
  forest:    0x6B9C5A,
  coast:     0x7BBFDF,
  marsh:     0x8AAA7B,
  desert:    0xEBD9B0,
};
