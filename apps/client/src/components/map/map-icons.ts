/**
 * Cartographic-style settlement and army icon drawing.
 * Settlements are rendered as classic map building symbols in ink-brown.
 * Armies are rendered as figurine silhouettes in player colors.
 */

import { Graphics } from 'pixi.js';

const INK = 0x2C1810;
const INK_LIGHT = 0x4A3A28;
const GOLD = 0xD4AF37;

// ─── Settlements ───

/**
 * Draw a settlement icon at the given position on the Graphics object.
 */
export function drawSettlement(
  g: Graphics,
  x: number,
  y: number,
  tier: string,
  isCapital: boolean
): void {
  const color = isCapital ? GOLD : INK;

  switch (tier) {
    case 'hamlet':
      // Small solid square
      g.rect(x - 3, y - 7, 6, 6);
      g.fill({ color, alpha: 0.85 });
      g.stroke({ color: INK, width: 0.8 });
      break;

    case 'village':
      // Slightly larger square
      g.rect(x - 4, y - 8, 8, 7);
      g.fill({ color, alpha: 0.85 });
      g.stroke({ color: INK, width: 0.8 });
      break;

    case 'town':
      // Square with small cross/church spire on top
      g.rect(x - 5, y - 6, 10, 8);
      g.fill({ color, alpha: 0.85 });
      g.stroke({ color: INK, width: 0.8 });
      // Cross/spire
      g.moveTo(x, y - 6);
      g.lineTo(x, y - 12);
      g.stroke({ color: INK, width: 1.2 });
      g.moveTo(x - 2.5, y - 10);
      g.lineTo(x + 2.5, y - 10);
      g.stroke({ color: INK, width: 1.0 });
      break;

    case 'city':
      // Cluster of 2-3 buildings
      g.rect(x - 7, y - 5, 7, 7);
      g.fill({ color, alpha: 0.85 });
      g.stroke({ color: INK, width: 0.8 });
      g.rect(x + 1, y - 7, 6, 9);
      g.fill({ color, alpha: 0.85 });
      g.stroke({ color: INK, width: 0.8 });
      // Small dome/circle on taller building
      g.circle(x + 4, y - 9, 2.5);
      g.fill({ color, alpha: 0.85 });
      g.stroke({ color: INK, width: 0.7 });
      break;

    case 'metropolis':
      // Larger cluster with star/flag
      g.rect(x - 8, y - 4, 7, 7);
      g.fill({ color, alpha: 0.85 });
      g.stroke({ color: INK, width: 0.8 });
      g.rect(x, y - 8, 8, 11);
      g.fill({ color, alpha: 0.85 });
      g.stroke({ color: INK, width: 0.8 });
      g.rect(x - 5, y - 9, 5, 5);
      g.fill({ color, alpha: 0.85 });
      g.stroke({ color: INK, width: 0.8 });
      // Flag pole + pennant
      g.moveTo(x + 4, y - 8);
      g.lineTo(x + 4, y - 16);
      g.stroke({ color: INK, width: 1.0 });
      g.moveTo(x + 4, y - 16);
      g.lineTo(x + 10, y - 14);
      g.lineTo(x + 4, y - 12);
      g.fill({ color: isCapital ? GOLD : 0x8B2020, alpha: 0.9 });
      break;

    default:
      // Fallback: small square
      g.rect(x - 3, y - 7, 6, 6);
      g.fill({ color, alpha: 0.85 });
      g.stroke({ color: INK, width: 0.8 });
  }

  // Capital underline accent
  if (isCapital && tier !== 'metropolis') {
    g.moveTo(x - 6, y + 3);
    g.lineTo(x + 6, y + 3);
    g.stroke({ color: GOLD, width: 1.5, alpha: 0.8 });
  }
}

// ─── Armies ───

/**
 * Draw an army figurine silhouette at the given position.
 * Evokes carved war-table pieces — a soldier with helmet, shield, and spear.
 */
export function drawArmy(
  g: Graphics,
  x: number,
  y: number,
  playerColor: number,
  isSelected: boolean
): void {
  // Small circular base (like a tabletop miniature stand)
  g.ellipse(x, y + 5, 7, 2.5);
  g.fill({ color: playerColor, alpha: 0.7 });
  g.stroke({ color: INK, width: 0.6 });

  // Body / torso (tapered rectangle)
  g.moveTo(x - 3.5, y + 4);
  g.lineTo(x - 2.5, y - 3);
  g.lineTo(x + 2.5, y - 3);
  g.lineTo(x + 3.5, y + 4);
  g.closePath();
  g.fill({ color: playerColor, alpha: 0.9 });
  g.stroke({ color: INK, width: 0.7 });

  // Head (circle)
  g.circle(x, y - 5.5, 3);
  g.fill({ color: playerColor, alpha: 0.9 });
  g.stroke({ color: INK, width: 0.7 });

  // Helmet crest (small arc on top)
  g.moveTo(x - 1.5, y - 8.5);
  g.quadraticCurveTo(x, y - 11, x + 1.5, y - 8.5);
  g.stroke({ color: INK, width: 1.2 });

  // Spear (thin line from shoulder up past head)
  g.moveTo(x + 3, y + 1);
  g.lineTo(x + 3, y - 13);
  g.stroke({ color: INK_LIGHT, width: 0.9 });
  // Spear tip
  g.moveTo(x + 3, y - 13);
  g.lineTo(x + 1.5, y - 11);
  g.moveTo(x + 3, y - 13);
  g.lineTo(x + 4.5, y - 11);
  g.stroke({ color: INK, width: 0.8 });

  // Shield (small rounded shape on left arm)
  g.ellipse(x - 4, y - 0.5, 2.5, 4);
  g.fill({ color: playerColor, alpha: 0.8 });
  g.stroke({ color: INK, width: 0.6 });

  // Selection highlight
  if (isSelected) {
    g.circle(x, y - 2, 12);
    g.stroke({ color: 0xFFD700, width: 2, alpha: 0.8 });
  }
}

/**
 * Draw a move-target indicator (prominent ring around the army being moved).
 */
export function drawMoveTargetIndicator(
  g: Graphics,
  x: number,
  y: number
): void {
  g.circle(x, y - 2, 14);
  g.stroke({ color: 0xFF4444, width: 2, alpha: 0.6 });
}
