/**
 * Stability Engine — Pure functions for stability calculation and Late Winter d20 roll.
 */

import { getStabilityBand, type StabilityBand, type StabilityEventType } from '../types/stability.js';
import {
  STABILITY_PER_TURN,
  STABILITY_EVENTS,
  WINTER_ROLL_TABLE,
  WINTER_ROLL_BONUS,
} from '../constants/stability.js';
import type { TaxRate } from '../types/economy.js';

export interface StabilityTurnInput {
  currentStability: number;
  taxRate: TaxRate;
  hasGoldDeficit: boolean;
  hasFoodShortage: boolean;
}

export interface StabilityTurnResult {
  newStability: number;
  change: number;
  sources: { label: string; value: number }[];
}

/** Calculate per-turn stability changes. */
export function calculateStabilityTurn(input: StabilityTurnInput): StabilityTurnResult {
  const sources: { label: string; value: number }[] = [];
  let change = 0;

  // Tax rate
  if (input.taxRate === 'low') {
    sources.push({ label: 'Low tax', value: STABILITY_PER_TURN.tax_low });
    change += STABILITY_PER_TURN.tax_low;
  } else if (input.taxRate === 'fair') {
    sources.push({ label: 'Fair tax', value: STABILITY_PER_TURN.tax_fair });
    change += STABILITY_PER_TURN.tax_fair;
  } else {
    sources.push({ label: 'Cruel tax', value: STABILITY_PER_TURN.tax_cruel });
    change += STABILITY_PER_TURN.tax_cruel;
  }

  // Gold deficit
  if (input.hasGoldDeficit) {
    sources.push({ label: 'Gold deficit', value: STABILITY_PER_TURN.gold_deficit });
    change += STABILITY_PER_TURN.gold_deficit;
  }

  // Food shortage
  if (input.hasFoodShortage) {
    sources.push({ label: 'Food shortage', value: STABILITY_PER_TURN.food_shortage });
    change += STABILITY_PER_TURN.food_shortage;
  }

  // Passive recovery: only if no negative factors and not already full
  if (change >= 0 && input.currentStability < 100) {
    sources.push({ label: 'Recovery', value: STABILITY_PER_TURN.passive_recovery });
    change += STABILITY_PER_TURN.passive_recovery;
  }

  const newStability = Math.round(Math.max(0, Math.min(100, input.currentStability + change)));

  return { newStability, change, sources };
}

/** Apply a one-time stability event. */
export function applyStabilityEvent(
  currentStability: number,
  eventKey: keyof typeof STABILITY_EVENTS,
): number {
  const delta = STABILITY_EVENTS[eventKey];
  return Math.round(Math.max(0, Math.min(100, currentStability + delta)));
}

export interface WinterRollInput {
  stability: number;
  /** d20 roll value (1-20). Caller generates this via PRNG or random. */
  roll: number;
}

export interface WinterRollResult {
  roll: number;
  band: StabilityBand;
  event: StabilityEventType | null;
  stabilityAfter: number;
}

/** Resolve a Late Winter d20 roll for a single player. */
export function resolveWinterRoll(input: WinterRollInput): WinterRollResult {
  const band = getStabilityBand(input.stability);
  let event: StabilityEventType | null = null;

  for (const row of WINTER_ROLL_TABLE) {
    if (input.roll >= row.rollRange[0] && input.roll <= row.rollRange[1]) {
      event = row.outcomes[band];
      break;
    }
  }

  let stabilityAfter = input.stability;
  if (event === 'stability_bonus') {
    stabilityAfter = Math.min(100, stabilityAfter + WINTER_ROLL_BONUS);
  }

  return { roll: input.roll, band, event, stabilityAfter };
}

/** Band consequence descriptions for UI display. */
export const BAND_CONSEQUENCES: Record<StabilityBand, string[]> = {
  stable: [],
  uneasy: ['Tax efficiency reduced', 'Pop growth slowed'],
  unstable: ['Tax efficiency reduced', 'Pop growth slowed', 'Desertion possible', 'Riots possible'],
  crisis: ['Tax efficiency reduced', 'Pop growth slowed', 'Desertion possible', 'Riots possible', 'Rebellion possible', 'Noble defection possible'],
  collapse: ['Tax efficiency reduced', 'Pop growth slowed', 'All crisis effects', 'Settlement defection possible', 'Mass desertion possible'],
};

/** Band color for UI. */
export const BAND_COLORS: Record<StabilityBand, string> = {
  stable: '#2d5a27',
  uneasy: '#b8860b',
  unstable: '#c47000',
  crisis: '#8b2500',
  collapse: '#5a0000',
};
