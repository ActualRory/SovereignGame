/**
 * Supply system — pure functions.
 *
 * Each terrain has a base supply value. Friendly settlements boost supply
 * within a radius. Armies carry a supply bank that depletes in low-supply
 * or enemy territory.
 */

import type { HexCoord, TerrainType } from '../types/map.js';
import { hexKey } from '../types/map.js';
import { TERRAIN } from '../constants/terrain.js';
import { hexDistance } from './hex-utils.js';

/** How far a settlement provides supply bonus. */
export const SETTLEMENT_SUPPLY_RADIUS = 3;

/** Supply bonus per settlement within radius. */
export const SETTLEMENT_SUPPLY_BONUS = 2;

/** Maximum supply bank for an army. */
export const MAX_SUPPLY_BANK = 100;

/** Supply consumed per turn by an army (base). */
export const ARMY_SUPPLY_CONSUMPTION = 10;

/** Attrition threshold — army takes losses below this supply. */
export const ATTRITION_THRESHOLD = 20;

/** Percentage strength lost per turn when supply is critically low. */
export const ATTRITION_STRENGTH_LOSS = 5;

/**
 * Calculate the supply value at a hex, considering terrain and nearby friendly settlements.
 */
export function calculateHexSupply(
  hex: HexCoord,
  terrain: TerrainType,
  friendlySettlements: HexCoord[],
): number {
  let supply = TERRAIN[terrain].supplyValue;

  for (const settlement of friendlySettlements) {
    const dist = hexDistance(hex, settlement);
    if (dist <= SETTLEMENT_SUPPLY_RADIUS) {
      supply += SETTLEMENT_SUPPLY_BONUS;
    }
  }

  return supply;
}

/**
 * Update an army's supply bank for one turn.
 * Returns new supply bank value and whether the army is attriting.
 */
export function updateArmySupply(
  currentSupply: number,
  hexSupplyValue: number,
  isInFriendlyTerritory: boolean,
): { newSupply: number; isAttriting: boolean } {
  let delta = 0;

  if (isInFriendlyTerritory && hexSupplyValue >= 3) {
    // Good supply in friendly territory: replenish
    delta = hexSupplyValue;
  } else if (isInFriendlyTerritory) {
    // Poor supply in friendly territory: slow drain
    delta = -Math.max(1, ARMY_SUPPLY_CONSUMPTION - hexSupplyValue);
  } else {
    // Enemy/neutral territory: faster drain
    delta = -(ARMY_SUPPLY_CONSUMPTION - Math.floor(hexSupplyValue / 2));
  }

  const newSupply = Math.max(0, Math.min(MAX_SUPPLY_BANK, currentSupply + delta));
  const isAttriting = newSupply < ATTRITION_THRESHOLD;

  return { newSupply, isAttriting };
}

/**
 * Calculate the supply map for all hexes for a given player.
 * Returns a map of hexKey → supply value.
 */
export function buildSupplyMap(
  allHexes: Array<{ q: number; r: number; terrain: TerrainType; ownerId: string | null }>,
  playerId: string,
  friendlySettlements: HexCoord[],
): Map<string, number> {
  const result = new Map<string, number>();

  for (const hex of allHexes) {
    const supply = calculateHexSupply(
      { q: hex.q, r: hex.r },
      hex.terrain,
      friendlySettlements,
    );
    result.set(hexKey({ q: hex.q, r: hex.r }), supply);
  }

  return result;
}
