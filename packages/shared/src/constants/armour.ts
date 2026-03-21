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
  /** Resources consumed from settlement storage per item produced. */
  inputs: Partial<Record<ResourceType, number>>;
  techRequired: TechId | null;
  /**
   * Production cost in workshop-points per item.
   * items/workshop/turn = floor(WORKSHOP_POINTS_PER_TURN / productionCost)
   */
  productionCost: number;
}

export const ARMOUR_TYPES: Record<ArmourType, ArmourDef> = {
  gambeson: {
    name: 'Gambeson',
    statBonus: { armour: 1, defence: 1 },
    inputs: { wool: 2 },
    techRequired: null,
    productionCost: 1,
  },
  mail: {
    name: 'Mail',
    statBonus: { armour: 3, defence: 2 },
    inputs: { iron: 2, leather: 1 },
    techRequired: null,
    productionCost: 3,
  },
  plate: {
    name: 'Plate',
    statBonus: { armour: 6, defence: 2, morale: -1 },
    inputs: { steel: 3 },
    techRequired: 'foundry',
    productionCost: 8,
  },
  breastplate: {
    name: 'Breastplate',
    statBonus: { armour: 3, defence: 2 },
    inputs: { steel: 2 },
    techRequired: 'foundry',
    productionCost: 5,
  },
};
