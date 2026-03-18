/**
 * Population growth calculations.
 * Pure functions — no DB access, no side effects.
 */

import type { Season } from '../types/game.js';
import type { SettlementTier } from '../types/settlement.js';

/** Maximum population growth per minor turn (cap). */
const MAX_GROWTH_PER_TURN = 50;

/** Base growth rate per minor turn as fraction of surplus food. */
const BASE_GROWTH_RATE = 0.1;

/** Medicine tech bonus to growth rate. */
const MEDICINE_GROWTH_BONUS = 0.05;

/**
 * Calculate population growth for a settlement in one minor turn.
 * Growth is driven by food surplus — excess food after consumption.
 */
export function calculatePopGrowth(
  currentPop: number,
  popCap: number,
  foodSurplus: number,
  hasMedicine: boolean,
): number {
  // No growth if at or above cap
  if (currentPop >= popCap) return 0;

  // No growth if no food surplus
  if (foodSurplus <= 0) return 0;

  // Growth rate
  const rate = BASE_GROWTH_RATE + (hasMedicine ? MEDICINE_GROWTH_BONUS : 0);

  // Growth = surplus * rate, capped
  let growth = Math.floor(foodSurplus * rate * 10); // scale up since surplus is small numbers

  // Cap per turn
  growth = Math.min(growth, MAX_GROWTH_PER_TURN);

  // Don't exceed pop cap
  growth = Math.min(growth, popCap - currentPop);

  return Math.max(0, growth);
}

/**
 * Calculate population loss from food shortage.
 * If food consumption exceeds available food, population starves.
 */
export function calculateStarvation(
  currentPop: number,
  foodDeficit: number,
): number {
  if (foodDeficit >= 0) return 0; // no deficit

  // Lose 5% of population per unit of deficit
  const loss = Math.ceil(currentPop * 0.01 * Math.abs(foodDeficit));
  return Math.min(loss, currentPop); // can't lose more than total
}
