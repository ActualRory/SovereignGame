// ─── Armour Constants ───

import type { TechId } from '../types/tech.js';
import type { ResourceType } from '../types/map.js';

export type ArmourType = 'gambeson' | 'mail' | 'plate' | 'breastplate';

export interface ArmourStatBonus {
  armour?: number;
  defence?: number;
  morale?: number;
}

export interface ArmourDef {
  name: string;
  statBonus: ArmourStatBonus;
  /**
   * Territorial resources the player must own (via claimed hexes) to place production orders.
   * Owning the resource without the corresponding processing building incurs a 2× gold cost penalty.
   */
  requiredResources: ResourceType[];
  techRequired: TechId | null;
  /**
   * Production cost in workshop-points per item.
   * items/workshop/turn = floor(WORKSHOP_POINTS_PER_TURN / productionCost)
   */
  productionCost: number;
  /**
   * Gold deducted from the player's treasury per item produced (at full efficiency).
   * Without the required processing building(s) this is doubled.
   */
  goldCostPerItem: number;
}

export const ARMOUR_TYPES: Record<ArmourType, ArmourDef> = {
  gambeson: {
    name: 'Gambeson',
    statBonus: { armour: 1, defence: 1 },
    requiredResources: ['wool'],
    techRequired: null,
    productionCost: 1,
    goldCostPerItem: 1,
  },
  mail: {
    name: 'Mail',
    statBonus: { armour: 3, defence: 2 },
    requiredResources: ['iron_ore'],
    techRequired: null,
    productionCost: 3,
    goldCostPerItem: 4,
  },
  plate: {
    name: 'Plate',
    statBonus: { armour: 6, defence: 2, morale: -1 },
    requiredResources: ['iron_ore'],
    techRequired: 'foundry',
    productionCost: 8,
    goldCostPerItem: 20,
  },
  breastplate: {
    name: 'Breastplate',
    statBonus: { armour: 3, defence: 2 },
    requiredResources: ['iron_ore'],
    techRequired: 'foundry',
    productionCost: 5,
    goldCostPerItem: 10,
  },
};
