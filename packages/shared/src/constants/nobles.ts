// ─── Noble System Constants ───

import type { ArmyRank, NavyRank, NobleRank, NobleTraitKey } from '../types/noble.js';

// ── Rank Progression ──

export const ARMY_RANK_ORDER: ArmyRank[] = ['captain', 'major', 'colonel', 'brigadier', 'general'];
export const NAVY_RANK_ORDER: NavyRank[] = ['lieutenant', 'commander', 'captain_navy', 'commodore', 'admiral'];

/** Human-readable display names for ranks. */
export const RANK_DISPLAY_NAMES: Record<NobleRank, string> = {
  // Army
  captain: 'Captain',
  major: 'Major',
  colonel: 'Colonel',
  brigadier: 'Brigadier',
  general: 'General',
  // Navy
  lieutenant: 'Lieutenant',
  commander: 'Commander',
  captain_navy: 'Captain',
  commodore: 'Commodore',
  admiral: 'Admiral',
};

/** Human-readable trait names. */
export const TRAIT_DISPLAY_NAMES: Record<NobleTraitKey, string> = {
  infantry_commander: 'Infantry Commander',
  cavalry_commander: 'Cavalry Commander',
  naval_commander: 'Naval Commander',
  administrator: 'Administrator',
  fire: 'Fire',
  shock: 'Shock',
  maneuver: 'Maneuver',
};

// ── Rank → Command Limits ──

/** Maximum units an army IC of this rank can command. */
export const ARMY_IC_MAX_UNITS: Partial<Record<NobleRank, number>> = {
  colonel: 3,
  brigadier: 5,
  general: 999,
};

/** Maximum ships a fleet IC of this rank can command. */
export const FLEET_IC_MAX_SHIPS: Partial<Record<NobleRank, number>> = {
  commodore: 5,
  admiral: 999,
};

/** Ship size categories and the minimum navy rank to command as IC. */
export const SHIP_IC_MIN_RANK: Record<'really_weak' | 'weak' | 'big', NavyRank> = {
  really_weak: 'lieutenant',
  weak: 'commander',
  big: 'captain_navy',
};

/** Minimum rank to serve as Unit IC (army). */
export const UNIT_IC_MIN_RANK: NobleRank = 'major';
/** Minimum rank to serve as Unit 2IC (army). */
export const UNIT_2IC_MIN_RANK: NobleRank = 'captain';
/** Minimum rank to serve as Army IC. */
export const ARMY_IC_MIN_RANK: NobleRank = 'colonel';
/** Minimum rank to serve as Army 2IC. */
export const ARMY_2IC_MIN_RANK: NobleRank = 'major';

// ── Promotion ──

export interface PromotionRequirement {
  minXp: number;
  minTurnsInRank: number;
  baseGoldCost: number;
}

/** Requirements to promote FROM rank X TO the next rank. Keyed by current rank. */
export const PROMOTION_REQUIREMENTS: Partial<Record<NobleRank, PromotionRequirement>> = {
  // Army
  captain:   { minXp: 20,  minTurnsInRank: 4,  baseGoldCost: 200 },
  major:     { minXp: 50,  minTurnsInRank: 8,  baseGoldCost: 500 },
  colonel:   { minXp: 100, minTurnsInRank: 8,  baseGoldCost: 1000 },
  brigadier: { minXp: 200, minTurnsInRank: 16, baseGoldCost: 2000 },
  // Navy
  lieutenant:  { minXp: 20,  minTurnsInRank: 4,  baseGoldCost: 200 },
  commander:   { minXp: 50,  minTurnsInRank: 8,  baseGoldCost: 500 },
  captain_navy: { minXp: 100, minTurnsInRank: 8,  baseGoldCost: 1000 },
  commodore:   { minXp: 200, minTurnsInRank: 16, baseGoldCost: 2000 },
  // general / admiral: cannot promote further
};

/** Cunning reduces promotion gold cost by this fraction per point. */
export const CUNNING_COST_REDUCTION_PER_POINT = 0.05; // 5% per cunning → max 50% at cunning 10

// ── Stat Generation ──

/** Stat generation: sum of N dice, clamped. Bell curve centred around 4-6. */
export const STAT_GENERATION = {
  diceCount: 2,
  diceSides: 5,  // 2d5 → range 2-10, mean 6
  min: 1,
  max: 10,
} as const;

// ── Trait XP Thresholds ──

/** Cumulative XP needed for each trait rank. Index = target rank. */
export const TRAIT_RANK_THRESHOLDS = [0, 10, 30, 60, 100, 150] as const;
export const MAX_TRAIT_RANK = 5;

/** Martial stat affects military trait gain rate: multiplier = 1 + (martial - 5) * this. */
export const MARTIAL_TRAIT_GAIN_MULTIPLIER = 0.1;
/** Intelligence stat affects general trait gain rate. */
export const INTELLIGENCE_TRAIT_GAIN_MULTIPLIER = 0.1;

// ── Estate Building & Generation ──

/** Number of nobles each Estate building can support. */
export const NOBLES_PER_ESTATE = 2;
/** Minor turns between auto-generated nobles (when below cap). */
export const NOBLE_GENERATION_DELAY_TURNS = 4;

// ── Hiring ──

export const NOBLE_HIRE_COST = 1000;

// ── Aging & Death ──

export const MINOR_TURNS_PER_YEAR = 8;
export const NOBLE_START_AGE_MIN = 16;
export const NOBLE_START_AGE_MAX = 20;
/** Age at which natural death chance begins. */
export const NOBLE_DEATH_AGE_START = 60;
/** Base annual death chance at age 60. */
export const NOBLE_DEATH_CHANCE_BASE = 0.05;
/** Additional death chance per year over 60. */
export const NOBLE_DEATH_CHANCE_PER_YEAR = 0.03;

// ── Battle Outcomes ──

/** Chance a noble in a defeated army is captured (rolled first). */
export const NOBLE_CAPTURE_CHANCE = 0.30;
/** Chance a noble in a defeated army is killed (rolled if not captured). */
export const NOBLE_BATTLE_DEATH_CHANCE = 0.15;

// ── Governor (Administrator trait) Bonuses per Rank ──

export const GOVERNOR_BONUS_PER_RANK = {
  /** +2% tax income per rank. */
  taxEfficiency: 0.02,
  /** 5% chance per rank to reduce a construction by 1 turn. */
  constructionSpeedChance: 0.05,
  /** +1% population growth per rank. */
  popGrowth: 0.01,
  /** +0.3 stability per rank per minor turn. */
  localStability: 0.3,
} as const;

// ── Combat Constants ──

/** Fire/Shock bonus = trait rank + floor(martial / this). */
export const NOBLE_MARTIAL_DIVISOR = 3;
/** Army/Fleet IC specialty bonus: floor(specialtyRank / this). */
export const NOBLE_SPECIALTY_ARMY_DIVISOR = 2;
/** Maneuver trait: +1 frontline width per rank. */
export const NOBLE_MANEUVER_WIDTH_PER_RANK = 1;
/** Maneuver trait: retreat casualty reduction per rank (fraction). */
export const NOBLE_MANEUVER_RETREAT_REDUCTION_PER_RANK = 0.05;

// ── Rank Index Helpers ──

export function getArmyRankIndex(rank: ArmyRank): number {
  return ARMY_RANK_ORDER.indexOf(rank);
}

export function getNavyRankIndex(rank: NavyRank): number {
  return NAVY_RANK_ORDER.indexOf(rank);
}

export function getRankIndex(rank: NobleRank): number {
  const ai = ARMY_RANK_ORDER.indexOf(rank as ArmyRank);
  if (ai !== -1) return ai;
  return NAVY_RANK_ORDER.indexOf(rank as NavyRank);
}

export function getNextRank(rank: NobleRank, branch: 'army' | 'navy'): NobleRank | null {
  const order: readonly NobleRank[] = branch === 'army' ? ARMY_RANK_ORDER : NAVY_RANK_ORDER;
  const idx = order.indexOf(rank);
  if (idx === -1 || idx >= order.length - 1) return null;
  return order[idx + 1];
}
