import type { UnitType, UnitPosition } from '../types/military.js';
import type { TechEra } from '../types/tech.js';
import type { ResourceType } from '../types/map.js';

export interface UnitStats {
  era: TechEra;
  fire: number;
  shock: number;
  defence: number;
  morale: number;
  armour: number;
  ap: number;
  hitsOn: number;
  defaultPosition: UnitPosition;
  equipment: ResourceType[];
  requiresUniforms: boolean;
}

export const UNITS: Record<UnitType, UnitStats> = {
  // ── Early Era ──
  irregulars: {
    era: 'early',
    fire: 1, shock: 3, defence: 2, morale: 2,
    armour: 0, ap: 0, hitsOn: 14,
    defaultPosition: 'frontline',
    equipment: [],
    requiresUniforms: false,
  },
  spearmen: {
    era: 'early',
    fire: 2, shock: 5, defence: 4, morale: 4,
    armour: 0, ap: 0, hitsOn: 13,
    defaultPosition: 'frontline',
    equipment: ['spears'],
    requiresUniforms: false,
  },
  archers: {
    era: 'early',
    fire: 6, shock: 1, defence: 2, morale: 3,
    armour: 0, ap: 0, hitsOn: 13,
    defaultPosition: 'backline',
    equipment: ['bows'],
    requiresUniforms: false,
  },
  cavalry: {
    era: 'early',
    fire: 1, shock: 6, defence: 3, morale: 5,
    armour: 0, ap: 0, hitsOn: 12,
    defaultPosition: 'flank',
    equipment: ['spears', 'horses'],
    requiresUniforms: false,
  },

  // ── Middle Era ──
  swordsmen: {
    era: 'middle',
    fire: 2, shock: 6, defence: 5, morale: 4,
    armour: 0, ap: 0, hitsOn: 11,
    defaultPosition: 'frontline',
    equipment: ['swords'],
    requiresUniforms: false,
  },
  crossbowmen: {
    era: 'middle',
    fire: 7, shock: 1, defence: 3, morale: 4,
    armour: 0, ap: 2, hitsOn: 12,
    defaultPosition: 'backline',
    equipment: ['crossbows'],
    requiresUniforms: false,
  },
  men_at_arms: {
    era: 'middle',
    fire: 2, shock: 6, defence: 7, morale: 5,
    armour: 4, ap: 0, hitsOn: 10,
    defaultPosition: 'frontline',
    equipment: ['armour', 'halberds'],
    requiresUniforms: false,
  },
  knights: {
    era: 'middle',
    fire: 2, shock: 9, defence: 5, morale: 7,
    armour: 4, ap: 0, hitsOn: 9,
    defaultPosition: 'flank',
    equipment: ['spears', 'swords', 'horses', 'armour'],
    requiresUniforms: false,
  },
  griffin_riders: {
    era: 'middle',
    fire: 4, shock: 7, defence: 5, morale: 7,
    armour: 0, ap: 0, hitsOn: 9,
    defaultPosition: 'flank',
    equipment: ['griffins', 'swords'], // "Swords or Spears" — default to swords
    requiresUniforms: false,
  },
  griffin_knights: {
    era: 'middle',
    fire: 3, shock: 9, defence: 7, morale: 8,
    armour: 3, ap: 0, hitsOn: 8,
    defaultPosition: 'flank',
    equipment: ['griffins', 'armour', 'halberds'],
    requiresUniforms: false,
  },

  // ── Late Era ──
  hussars: {
    era: 'late',
    fire: 3, shock: 7, defence: 6, morale: 7,
    armour: 0, ap: 0, hitsOn: 10,
    defaultPosition: 'flank',
    equipment: ['swords', 'horses', 'uniforms'],
    requiresUniforms: true,
  },
  riflemen: {
    era: 'late',
    fire: 9, shock: 2, defence: 4, morale: 5,
    armour: 0, ap: 5, hitsOn: 10,
    defaultPosition: 'backline',
    equipment: ['rifles', 'uniforms'],
    requiresUniforms: true,
  },
  dragoons: {
    era: 'late',
    fire: 6, shock: 5, defence: 6, morale: 6,
    armour: 0, ap: 3, hitsOn: 10,
    defaultPosition: 'flank',
    equipment: ['rifles', 'horses', 'uniforms'],
    requiresUniforms: true,
  },
};

/** Veterancy bonuses to Hits On threshold (subtracted — lower is better). */
export const VETERANCY_BONUS: Record<string, number> = {
  fresh: 0,
  regular: 1,
  veteran: 2,
  elite: 3,
  legend: 4,
};

/** Unit state thresholds (strength percentage). */
export const UNIT_STATE_THRESHOLDS = {
  full: 60,     // 100-60% = Full
  depleted: 40, // 60-40% = Depleted
  broken: 0,    // 40-0% = Broken (0% = Destroyed)
};

/** Dice reduction by unit state. */
export const STATE_DICE_MULTIPLIER: Record<string, number> = {
  full: 1.0,
  depleted: 0.6,
  broken: 0.3,
  destroyed: 0,
};
