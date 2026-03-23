/** Combat system constants. */

/** All combat dice are d20. */
export const DICE_SIDES = 20;

/** Maximum combat rounds before forced draw. */
export const MAX_COMBAT_ROUNDS = 12;

/** Command rating bonus: +1 to each die roll per point of command. */
export const COMMAND_BONUS_PER_POINT = 1;

/** Maneuver Warfare tech: +2 frontline width everywhere. */
export const MANEUVER_WARFARE_WIDTH_BONUS = 2;

/** General's Command rating adds +1 width per 2 points. */
export const COMMAND_WIDTH_PER_2_POINTS = 1;

/** Modern Doctrine tech: +1 to all combat rolls. */
export const MODERN_DOCTRINE_BONUS = 1;

/** Dice multiplier: scales dice count for granularity without changing lethality. */
export const DICE_MULTIPLIER = 4;

/**
 * Armour/AP → hitsOn conversion divisor.
 * Raw armour/AP values are divided by this and rounded up to get the hitsOn modifier.
 * e.g. plate (6 armour) → ceil(6/2) = +3 hitsOn; rifle (5 AP) → ceil(5/2) = -3 hitsOn.
 */
export const ARMOUR_HITSON_DIVISOR = 2;

/** Siege assault: defender fires first, then attacker fires, then attacker resolves shock. */
export const SIEGE_PHASES = ['defender_fire', 'attacker_fire', 'attacker_shock'] as const;

/** Naval combat: two fire phases, boarding (shock) is rare. */
export const NAVAL_PHASES = ['fire_1', 'fire_2'] as const;

/** Replenishment veterancy loss. */
export const REPLENISHMENT_VET_LOSS = {
  depleted_to_full: 1,
  broken_to_full: 2,
} as const;
