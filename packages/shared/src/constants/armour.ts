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
  /** Resources consumed from settlement storage to produce one batch. */
  inputs: Partial<Record<ResourceType, number>>;
  techRequired: TechId | null;
}

export const ARMOUR_TYPES: Record<ArmourType, ArmourDef> = {
  gambeson: {
    name: 'Gambeson',
    statBonus: { armour: 1, defence: 1 },
    inputs: { wool: 2 },
    techRequired: null,
  },
  mail: {
    name: 'Mail',
    statBonus: { armour: 3, defence: 2 },
    inputs: { iron: 2, leather: 1 },
    techRequired: null,
  },
  plate: {
    name: 'Plate',
    statBonus: { armour: 6, defence: 2, morale: -1 },
    inputs: { steel: 3 },
    techRequired: 'foundry',
  },
  breastplate: {
    name: 'Breastplate',
    statBonus: { armour: 3, defence: 2 },
    inputs: { steel: 2 },
    techRequired: 'foundry',
  },
};
