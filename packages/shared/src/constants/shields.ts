// ─── Shield Constants ───

import type { TechId } from '../types/tech.js';
import type { ResourceType } from '../types/map.js';

export type ShieldType = 'buckler' | 'round_shield' | 'kite_shield' | 'tower_shield';

export interface ShieldStatBonus {
  defence?: number;
  armour?: number;
  morale?: number;
}

export interface ShieldDef {
  name: string;
  statBonus: ShieldStatBonus;
  requiredResources: ResourceType[];
  techRequired: TechId | null;
  /** Production cost in workshop-points per item (Arms Workshop). */
  productionCost: number;
  /** Gold deducted per item produced at full efficiency. */
  goldCostPerItem: number;
}

export const SHIELDS: Record<ShieldType, ShieldDef> = {
  buckler: {
    name: 'Buckler',
    statBonus: { defence: 2, armour: 1 },
    requiredResources: ['wood'],
    techRequired: null,

    productionCost: 1,
    goldCostPerItem: 2,
  },
  round_shield: {
    name: 'Round Shield',
    statBonus: { defence: 3, armour: 2 },
    requiredResources: ['wood', 'iron_ore'],
    techRequired: null,

    productionCost: 2,
    goldCostPerItem: 4,
  },
  kite_shield: {
    name: 'Kite Shield',
    statBonus: { defence: 4, armour: 3 },
    requiredResources: ['wood', 'iron_ore'],
    techRequired: 'foundry',

    productionCost: 4,
    goldCostPerItem: 8,
  },
  tower_shield: {
    name: 'Tower Shield',
    statBonus: { defence: 5, armour: 4, morale: 1 },
    requiredResources: ['wood', 'iron_ore'],
    techRequired: 'foundry',

    productionCost: 6,
    goldCostPerItem: 12,
  },
};

export const SHIELD_STAT_KEYS = ['defence', 'armour', 'morale'] as const;
export type ShieldStatKey = typeof SHIELD_STAT_KEYS[number];
