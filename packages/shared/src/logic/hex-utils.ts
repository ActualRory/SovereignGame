/**
 * Hex grid utilities — pure functions for axial coordinate math.
 * Flat-top hexagons with axial (q, r) coordinates.
 */

import type { HexCoord, HexDirection } from '../types/map.js';

// ─── Axial direction vectors (flat-top hex grid) ───

/** The 6 neighbor offsets in axial coordinates, indexed by direction. */
export const DIRECTION_VECTORS: Record<HexDirection, HexCoord> = {
  ne: { q: 1, r: -1 },
  e:  { q: 1, r: 0 },
  se: { q: 0, r: 1 },
  sw: { q: -1, r: 1 },
  w:  { q: -1, r: 0 },
  nw: { q: 0, r: -1 },
};

/** All 6 directions in clockwise order starting from NE. */
export const ALL_DIRECTIONS: HexDirection[] = ['ne', 'e', 'se', 'sw', 'w', 'nw'];

/** Get the opposite direction. */
export function oppositeDirection(dir: HexDirection): HexDirection {
  const map: Record<HexDirection, HexDirection> = {
    ne: 'sw', e: 'w', se: 'nw', sw: 'ne', w: 'e', nw: 'se',
  };
  return map[dir];
}

// ─── Neighbors ───

/** Get the 6 neighbors of a hex. */
export function hexNeighbors(coord: HexCoord): HexCoord[] {
  return ALL_DIRECTIONS.map(dir => hexNeighbor(coord, dir));
}

/** Get the neighbor in a specific direction. */
export function hexNeighbor(coord: HexCoord, dir: HexDirection): HexCoord {
  const d = DIRECTION_VECTORS[dir];
  return { q: coord.q + d.q, r: coord.r + d.r };
}

/** Get the direction from one hex to an adjacent hex, or null if not adjacent. */
export function directionTo(from: HexCoord, to: HexCoord): HexDirection | null {
  const dq = to.q - from.q;
  const dr = to.r - from.r;
  for (const dir of ALL_DIRECTIONS) {
    const v = DIRECTION_VECTORS[dir];
    if (v.q === dq && v.r === dr) return dir;
  }
  return null;
}

// ─── Distance ───

/** Manhattan distance between two hexes (in hex steps). */
export function hexDistance(a: HexCoord, b: HexCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = (-a.q - a.r) - (-b.q - b.r);
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));
}

// ─── Rings & Radius ───

/** Get all hexes at exactly `radius` distance from center. */
export function hexRing(center: HexCoord, radius: number): HexCoord[] {
  if (radius <= 0) return [center];

  const results: HexCoord[] = [];
  // Start at the "sw" direction * radius, then walk around
  let hex: HexCoord = {
    q: center.q + DIRECTION_VECTORS.sw.q * radius,
    r: center.r + DIRECTION_VECTORS.sw.r * radius,
  };

  for (const dir of ALL_DIRECTIONS) {
    for (let i = 0; i < radius; i++) {
      results.push(hex);
      hex = hexNeighbor(hex, dir);
    }
  }

  return results;
}

/** Get all hexes within `radius` distance from center (inclusive). */
export function hexesInRange(center: HexCoord, radius: number): HexCoord[] {
  const results: HexCoord[] = [];
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      results.push({ q: center.q + q, r: center.r + r });
    }
  }
  return results;
}

// ─── Line of Sight ───

/**
 * Check if a straight line from `a` to `b` is blocked by any hex in `blockedSet`.
 * Uses hex line-drawing (lerp between cube coords, sampling at each step).
 * Returns true if there is a clear line of sight.
 */
export function hasLineOfSight(
  a: HexCoord,
  b: HexCoord,
  isBlocked: (coord: HexCoord) => boolean,
): boolean {
  const dist = hexDistance(a, b);
  if (dist <= 1) return true; // adjacent hexes always visible

  const line = hexLineDraw(a, b);
  // Check all intermediate hexes (not endpoints) for blocking
  for (let i = 1; i < line.length - 1; i++) {
    if (isBlocked(line[i])) return false;
  }
  return true;
}

/** Draw a line between two hexes, returning all hexes along the path. */
export function hexLineDraw(a: HexCoord, b: HexCoord): HexCoord[] {
  const dist = hexDistance(a, b);
  if (dist === 0) return [a];

  // Convert to cube coordinates
  const aCube = { x: a.q, y: a.r, z: -a.q - a.r };
  const bCube = { x: b.q, y: b.r, z: -b.q - b.r };

  const results: HexCoord[] = [];
  for (let i = 0; i <= dist; i++) {
    const t = i / dist;
    const x = aCube.x + (bCube.x - aCube.x) * t;
    const y = aCube.y + (bCube.y - aCube.y) * t;
    const z = aCube.z + (bCube.z - aCube.z) * t;
    const rounded = cubeRound(x, y, z);
    results.push({ q: rounded.x, r: rounded.y });
  }

  return results;
}

/** Round fractional cube coordinates to the nearest hex. */
function cubeRound(x: number, y: number, z: number): { x: number; y: number; z: number } {
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);

  if (dx > dy && dx > dz) {
    rx = -ry - rz;
  } else if (dy > dz) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return { x: rx, y: ry, z: rz };
}

// ─── River Helpers ───

/** Check if there is a river on the edge between two adjacent hexes. */
export function hasRiverBetween(
  from: HexCoord,
  to: HexCoord,
  hexRiverEdges: Map<string, HexDirection[]>,
): boolean {
  const dir = directionTo(from, to);
  if (!dir) return false;

  const fromKey = `${from.q},${from.r}`;
  const fromEdges = hexRiverEdges.get(fromKey) ?? [];
  if (fromEdges.includes(dir)) return true;

  // Also check from the other side
  const toKey = `${to.q},${to.r}`;
  const toEdges = hexRiverEdges.get(toKey) ?? [];
  return toEdges.includes(oppositeDirection(dir));
}
