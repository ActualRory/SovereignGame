/**
 * Noble combat bonus computation.
 * Pure functions — no DB, no side effects.
 *
 * Replaces the old flat `commandRating` system.
 * Combat bonuses are derived from noble traits + martial stat.
 */

import type { Noble, NobleTraits, NobleCombatBonus } from '../types/noble.js';
import { EMPTY_NOBLE_TRAITS } from '../types/noble.js';
import {
  NOBLE_MARTIAL_DIVISOR,
  NOBLE_SPECIALTY_ARMY_DIVISOR,
  NOBLE_MANEUVER_WIDTH_PER_RANK,
  NOBLE_MANEUVER_RETREAT_REDUCTION_PER_RANK,
} from '../constants/nobles.js';

// ── Trait Combination (IC + 2IC) ──

/**
 * Combine IC and 2IC traits.
 * - IC's traits are primary.
 * - 2IC fills gaps: if IC has 0 for a trait but 2IC has a rank, use 2IC's rank.
 * - If both have the same trait, the higher rank is used.
 */
export function combineNobleTraits(
  icTraits: NobleTraits,
  secondIcTraits: NobleTraits | null,
): NobleTraits {
  if (!secondIcTraits) return { ...icTraits };

  const combined = { ...icTraits };
  for (const key of Object.keys(combined) as (keyof NobleTraits)[]) {
    combined[key] = Math.max(icTraits[key], secondIcTraits[key]);
  }
  return combined;
}

// ── Army-Level Combat Bonus ──

/**
 * Compute the combat bonus for an army from its IC (and optionally 2IC) noble.
 *
 * Fire bonus = combined fire trait + floor(IC martial / 3)
 * Shock bonus = combined shock trait + floor(IC martial / 3)
 * Width bonus = combined maneuver rank
 * Flank priority = combined maneuver rank
 * Retreat reduction = maneuver rank * 0.05
 */
export function computeArmyCombatBonus(
  ic: Noble | null,
  secondIc: Noble | null,
  hasChainOfCommand: boolean,
): NobleCombatBonus {
  if (!ic) {
    return { fireBonus: 0, shockBonus: 0, widthBonus: 0, flankPriority: 0, retreatReduction: 0 };
  }

  const effectiveSecondIc = hasChainOfCommand ? secondIc : null;
  const traits = combineNobleTraits(ic.traits, effectiveSecondIc?.traits ?? null);
  const martialBonus = Math.floor(ic.martial / NOBLE_MARTIAL_DIVISOR);

  return {
    fireBonus: traits.fire + martialBonus,
    shockBonus: traits.shock + martialBonus,
    widthBonus: traits.maneuver * NOBLE_MANEUVER_WIDTH_PER_RANK,
    flankPriority: traits.maneuver,
    retreatReduction: traits.maneuver * NOBLE_MANEUVER_RETREAT_REDUCTION_PER_RANK,
  };
}

// ── Unit-Level Specialty Bonus ──

/**
 * Compute the per-unit dice bonus from commander specialty traits.
 *
 * Unit IC: +1 per specialty rank (for matching unit type).
 * Army/Fleet IC: +1 per 2 specialty ranks rounded down (for matching units).
 *
 * The two bonuses stack: a unit gets its own IC's bonus + the army IC's bonus.
 *
 * @param unitIc - Noble assigned as this unit's IC (unit_ic assignment)
 * @param unit2ic - Noble assigned as this unit's 2IC (unit_2ic assignment, requires Chain of Command)
 * @param armyIc - Noble assigned as the army's IC (army_ic assignment)
 * @param army2ic - Noble assigned as the army's 2IC (army_2ic assignment)
 * @param isMounted - Whether the unit is mounted (cavalry)
 * @param isNaval - Whether this is a naval unit
 * @param hasChainOfCommand - Whether the player has Chain of Command tech
 */
export function computeUnitSpecialtyBonus(
  unitIc: Noble | null,
  unit2ic: Noble | null,
  armyIc: Noble | null,
  army2ic: Noble | null,
  isMounted: boolean,
  isNaval: boolean,
  hasChainOfCommand: boolean,
): number {
  const traitKey = isNaval ? 'naval_commander' : isMounted ? 'cavalry_commander' : 'infantry_commander';

  // Unit IC + 2IC combined specialty
  let unitBonus = 0;
  if (unitIc) {
    const effective2ic = hasChainOfCommand ? unit2ic : null;
    const unitTraits = combineNobleTraits(unitIc.traits, effective2ic?.traits ?? null);
    unitBonus = unitTraits[traitKey]; // +1 per rank
  }

  // Army IC + 2IC combined specialty (weaker: floor(rank / 2))
  let armyBonus = 0;
  if (armyIc) {
    const effective2ic = hasChainOfCommand ? army2ic : null;
    const armyTraits = combineNobleTraits(armyIc.traits, effective2ic?.traits ?? null);
    armyBonus = Math.floor(armyTraits[traitKey] / NOBLE_SPECIALTY_ARMY_DIVISOR);
  }

  return unitBonus + armyBonus;
}
