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

/** Maximum fraction of population that can starve in a single turn. */
const MAX_STARVATION_RATE = 0.05;

/**
 * Calculate population loss from food shortage.
 * If food consumption exceeds available food, population starves.
 * Loss scales with deficit severity but is capped at 5% of population per turn
 * so famine is a slow drain players can react to, not an instant catastrophe.
 */
export function calculateStarvation(
  currentPop: number,
  foodDeficit: number,
): number {
  if (foodDeficit >= 0) return 0; // no deficit

  // Scale: lose 1% of population per unit of deficit, capped at 5%
  const uncapped = currentPop * 0.01 * Math.abs(foodDeficit);
  const maxLoss = currentPop * MAX_STARVATION_RATE;
  return Math.min(Math.ceil(Math.min(uncapped, maxLoss)), currentPop);
}
