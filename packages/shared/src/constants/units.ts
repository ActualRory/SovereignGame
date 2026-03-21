// ─── Unit Base Stats ───
//
// Units no longer have hardcoded types. Instead, a UnitTemplate defines:
//   - company/squadron count (size)
//   - equipment slots (primary, sidearm, armour, mount)
//
// The final combat stats are:
//   baseStats(template) + weapon bonuses + armour bonuses + mount bonuses + design modifiers
//
// This file defines the base stats (before equipment) and supporting constants.

import type { UnitPosition } from '../types/military.js';
import type { WeaponType } from './weapons.js';
import { RANGED_WEAPONS } from './weapons.js';

export interface BaseCombatStats {
  fire: number;
  shock: number;
  defence: number;
  morale: number;
  armour: number;
  ap: number;
  hitsOn: number;
  defaultPosition: UnitPosition;
  /** Max troops: companies × 100 (infantry) or squadrons × 50 (mounted). */
  maxTroops: number;
}

/** Number of men per company (infantry). */
export const MEN_PER_COMPANY = 100;

/** Number of men per squadron (mounted). */
export const MEN_PER_SQUADRON = 50;

/**
 * Derive the default combat position from template properties.
 * - Mounted units → flank
 * - Ranged primary → backline
 * - Otherwise → frontline
 */
export function getDefaultPosition(
  isMounted: boolean,
  primary: WeaponType | null,
): UnitPosition {
  if (isMounted) return 'flank';
  if (primary !== null && RANGED_WEAPONS.has(primary)) return 'backline';
  return 'frontline';
}

/**
 * Get base combat stats for a unit before equipment modifiers are applied.
 * Irregulars (isIrregular = true) use a fixed weak stat block regardless of size.
 */
export function getBaseStats(
  companiesOrSquadrons: 1 | 2 | 3 | 4 | 5,
  isMounted: boolean,
  isIrregular: boolean,
  primary: WeaponType | null,
): BaseCombatStats {
  const position = getDefaultPosition(isMounted, primary);
  const maxTroops = isMounted
    ? companiesOrSquadrons * MEN_PER_SQUADRON
    : companiesOrSquadrons * MEN_PER_COMPANY;

  if (isIrregular) {
    return {
      fire: 1, shock: 3, defence: 2,
      morale: 2 + Math.floor((companiesOrSquadrons - 1) * 0.5),
      armour: 0, ap: 0, hitsOn: 14,
      defaultPosition: position,
      maxTroops,
    };
  }

  // Base stats scale slightly with unit size (larger units harder to break).
  const sizeBonus = companiesOrSquadrons - 1; // 0-4

  if (isMounted) {
    return {
      fire: 1,
      shock: 4,
      defence: 2,
      morale: 3 + Math.floor(sizeBonus * 0.5),
      armour: 0, ap: 0,
      hitsOn: 12, // mounted units are harder to hit
      defaultPosition: 'flank',
      maxTroops,
    };
  }

  if (position === 'backline') {
    return {
      fire: 2,
      shock: 1,
      defence: 2,
      morale: 2 + Math.floor(sizeBonus * 0.5),
      armour: 0, ap: 0,
      hitsOn: 13,
      defaultPosition: 'backline',
      maxTroops,
    };
  }

  // Frontline infantry
  return {
    fire: 1,
    shock: 3,
    defence: 2,
    morale: 2 + Math.floor(sizeBonus * 0.5),
    armour: 0, ap: 0,
    hitsOn: 14,
    defaultPosition: 'frontline',
    maxTroops,
  };
}

// ── Veterancy and State ──

/**
 * Weighted veterancy modifier — subtracted from hitsOn.
 * Computed from the troop tier composition (Rookie / Capable / Veteran).
 */
export function getWeightedVeterancyModifier(
  rookie: number,
  capable: number,
  veteran: number,
): number {
  const total = rookie + capable + veteran;
  if (total === 0) return 0;
  return (
    (rookie   / total) * 0 +
    (capable  / total) * 1 +
    (veteran  / total) * 2
  );
}

/** Unit state thresholds (strength as fraction of max troops). */
export const UNIT_STATE_THRESHOLDS = {
  full: 0.60,     // ≥60% = Full
  depleted: 0.40, // ≥40% = Depleted
  broken: 0,      // <40% = Broken (0 = Destroyed)
};

/** Dice pool multiplier per unit state. */
export const STATE_DICE_MULTIPLIER: Record<string, number> = {
  full: 1.0,
  depleted: 0.6,
  broken: 0.3,
  destroyed: 0,
};

/**
 * Fraction of survivors that gain a tier after combat:
 * - rookies that survive a battle have a chance to become capable
 * - capable have a smaller chance to become veteran
 */
export const COMBAT_PROMOTION_RATE = {
  rookieToCapable: 0.15,
  capableToVeteran: 0.06,
};

// ── Weapon Design ──

/** Gold cost to initiate a new weapon design. Prevents design spamming. */
export const WEAPON_DESIGN_COST = 500;

/** Turns the design spends in 'developing' before becoming 'ready'. */
export const WEAPON_DESIGN_DEVELOP_TURNS = 2;
