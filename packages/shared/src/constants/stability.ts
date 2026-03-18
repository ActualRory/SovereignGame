import type { StabilityBand, StabilityEventType } from '../types/stability.js';

/** Per-minor-turn stability changes. */
export const STABILITY_PER_TURN = {
  tax_low: 0.5,
  tax_fair: -0.5,
  tax_cruel: -1,
  gold_deficit: -1,
  food_shortage: -1,
  passive_recovery: 0.5,
} as const;

/** One-time stability events. */
export const STABILITY_EVENTS = {
  war_declared: -5,
  peace_declared: 5,
  settlement_captured: -5,
  settlement_razed: -15,
  alliance_broken: -15,
  nap_broken: -10,
} as const;

/**
 * Late Winter seasonal d20 roll outcome table.
 * Rows indexed by roll range, columns by stability band.
 * null = nothing happens.
 */
export interface WinterRollOutcome {
  rollRange: [number, number];
  outcomes: Record<StabilityBand, StabilityEventType | null>;
}

export const WINTER_ROLL_TABLE: WinterRollOutcome[] = [
  {
    rollRange: [1, 2],
    outcomes: {
      stable: 'minor_unrest',
      uneasy: 'riots',
      unstable: 'desertion',
      crisis: 'rebellion',
      collapse: 'mass_desertion', // + rebellion
    },
  },
  {
    rollRange: [3, 4],
    outcomes: {
      stable: null,
      uneasy: 'minor_unrest',
      unstable: 'riots',
      crisis: 'noble_defection',
      collapse: 'rebellion',
    },
  },
  {
    rollRange: [5, 6],
    outcomes: {
      stable: null,
      uneasy: null,
      unstable: 'minor_unrest',
      crisis: 'desertion',
      collapse: 'noble_defection',
    },
  },
  {
    rollRange: [7, 10],
    outcomes: {
      stable: null,
      uneasy: null,
      unstable: null,
      crisis: 'riots',
      collapse: 'desertion',
    },
  },
  {
    rollRange: [11, 19],
    outcomes: {
      stable: null,
      uneasy: null,
      unstable: null,
      crisis: null,
      collapse: 'riots',
    },
  },
  {
    rollRange: [20, 20],
    outcomes: {
      stable: 'stability_bonus',
      uneasy: 'stability_bonus',
      unstable: 'stability_bonus',
      crisis: 'stability_bonus',
      collapse: 'stability_bonus',
    },
  },
];

/** Stability bonus from a natural 20 on the winter roll. */
export const WINTER_ROLL_BONUS = 10;

/** Pop loss on settlement capture. */
export const CAPTURE_POP_LOSS = 0.25;

/** Pop loss on settlement raze. */
export const RAZE_POP_LOSS = 0.50;
