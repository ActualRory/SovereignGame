/**
 * Hand-drawn wobbly line utility.
 * Converts straight line segments into slightly irregular curves
 * using seeded random perpendicular offsets and quadratic Bezier curves.
 */

import { Graphics } from 'pixi.js';

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

interface Point {
  x: number;
  y: number;
}

/**
 * Draw a wobbly line between two points on a Graphics object.
 * The line is already "moved to" p1 — this function draws from p1 to p2.
 *
 * @param g - PixiJS Graphics object (caller should set stroke after calling)
 * @param p1 - Start point
 * @param p2 - End point
 * @param seed - Seed for deterministic wobble
 * @param amplitude - Maximum perpendicular offset in pixels (default 3)
 * @param segments - Number of intermediate control points (default 2)
 */
export function wobblyLine(
  g: Graphics,
  p1: Point,
  p2: Point,
  seed: number,
  amplitude = 3,
  segments = 2
): void {
  const rng = mulberry32(seed);

  // Direction and perpendicular vectors
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.001) return;

  const nx = -dy / len; // perpendicular unit vector
  const ny = dx / len;

  g.moveTo(p1.x, p1.y);

  // Generate intermediate points with perpendicular offsets
  const points: Point[] = [p1];
  for (let i = 1; i <= segments; i++) {
    const t = i / (segments + 1);
    const offset = (rng() * 2 - 1) * amplitude;
    points.push({
      x: p1.x + dx * t + nx * offset,
      y: p1.y + dy * t + ny * offset,
    });
  }
  points.push(p2);

  // Draw quadratic curves through intermediate points
  for (let i = 1; i < points.length - 1; i++) {
    const mid = {
      x: (points[i].x + points[i + 1].x) / 2,
      y: (points[i].y + points[i + 1].y) / 2,
    };
    g.quadraticCurveTo(points[i].x, points[i].y, mid.x, mid.y);
  }
  // Final segment to endpoint
  g.lineTo(p2.x, p2.y);
}

/**
 * Generate a seed from hex coordinates and an optional extra value.
 */
export function hexSeed(q: number, r: number, extra = 0): number {
  return ((q * 73856093) ^ (r * 19349663) ^ (extra * 83492791)) >>> 0;
}
