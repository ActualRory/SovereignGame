/**
 * Fog of War calculation — pure functions.
 *
 * Vision rules:
 * - Armies: 2 hexes full vision, 3rd hex soft fog
 * - Settlements: 3 hexes full vision, 4th hex soft fog
 * - Cartography tech: +1 vision range to settlements
 * - Optics tech: +1 vision range to all armies
 * - Pre-explored: all hexes start at soft fog
 *
 * Fog only upgrades — never downgrades below soft_fog once seen.
 */

import type { HexCoord, FogState } from '../types/map.js';
import { hexKey } from '../types/map.js';
import { hexesInRange } from './hex-utils.js';

// ─── Vision source definitions ───

export interface VisionSource {
  coord: HexCoord;
  fullVisionRange: number;
  softFogRange: number;
}

const BASE_ARMY_VISION = 2;
const BASE_ARMY_SOFT_FOG = 3;
const BASE_SETTLEMENT_VISION = 3;
const BASE_SETTLEMENT_SOFT_FOG = 4;

export function armyVisionSource(
  coord: HexCoord,
  hasOptics: boolean,
): VisionSource {
  const bonus = hasOptics ? 1 : 0;
  return {
    coord,
    fullVisionRange: BASE_ARMY_VISION + bonus,
    softFogRange: BASE_ARMY_SOFT_FOG + bonus,
  };
}

export function settlementVisionSource(
  coord: HexCoord,
  hasCartography: boolean,
): VisionSource {
  const bonus = hasCartography ? 1 : 0;
  return {
    coord,
    fullVisionRange: BASE_SETTLEMENT_VISION + bonus,
    softFogRange: BASE_SETTLEMENT_SOFT_FOG + bonus,
  };
}

// ─── Visibility calculation ───

/**
 * Calculate the current visibility map for a player given their vision sources
 * and their previous visibility state.
 *
 * @param sources - All vision sources the player controls this turn
 * @param previousVisibility - The player's existing fog map (key → FogState)
 * @param allHexKeys - Set of all valid hex keys on the map
 * @param preExplored - If true, all hexes start at soft_fog
 * @returns Updated visibility map (key → FogState)
 */
export function calculateVisibility(
  sources: VisionSource[],
  previousVisibility: Map<string, FogState>,
  allHexKeys: Set<string>,
  preExplored: boolean,
): Map<string, FogState> {
  const result = new Map<string, FogState>();

  // Initialize with previous state (fog only upgrades)
  for (const key of allHexKeys) {
    const prev = previousVisibility.get(key) ?? (preExplored ? 'soft_fog' : 'undiscovered');
    result.set(key, prev);
  }

  // Calculate vision from each source
  for (const source of sources) {
    // Full vision hexes
    const fullHexes = hexesInRange(source.coord, source.fullVisionRange);
    for (const hex of fullHexes) {
      const key = hexKey(hex);
      if (allHexKeys.has(key)) {
        result.set(key, 'full_vision');
      }
    }

    // Soft fog ring (between full vision range + 1 and soft fog range)
    const softHexes = hexesInRange(source.coord, source.softFogRange);
    for (const hex of softHexes) {
      const key = hexKey(hex);
      if (!allHexKeys.has(key)) continue;
      const current = result.get(key)!;
      // Only upgrade: undiscovered → soft_fog
      if (current === 'undiscovered') {
        result.set(key, 'soft_fog');
      }
    }
  }

  return result;
}

/**
 * Downgrade full_vision hexes that are no longer in range to soft_fog.
 * Called at the start of each turn before recalculating.
 * Previous soft_fog stays as soft_fog, never reverts to undiscovered.
 */
export function decayVisibility(
  current: Map<string, FogState>,
): Map<string, FogState> {
  const result = new Map<string, FogState>();
  for (const [key, state] of current) {
    result.set(key, state === 'full_vision' ? 'soft_fog' : state);
  }
  return result;
}

// ─── Filtering helpers ───

/** What is visible under soft fog: terrain, resources, settlement tier. */
export interface SoftFogHexData {
  q: number;
  r: number;
  terrain: string;
  resources: string[];
  riverEdges: string[];
  ownerId: string | null;
  settlementId: string | null;
  // No army info, no detailed settlement info
}

/** Determine if a player can see another player's data based on fog. */
export function canSeeDetails(fogState: FogState): boolean {
  return fogState === 'full_vision';
}

export function canSeeBasics(fogState: FogState): boolean {
  return fogState !== 'undiscovered';
}
