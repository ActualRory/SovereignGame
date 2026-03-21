// ─── Weapon Constants ───

import type { TechId } from '../types/tech.js';
import type { ResourceType } from '../types/map.js';

export type PrimaryWeapon = 'greataxe' | 'greatsword' | 'polearm' | 'longbow' | 'musket' | 'rifle';
export type SidearmWeapon = 'shortsword' | 'longsword' | 'sabre' | 'handgun';
export type AnyWeapon = PrimaryWeapon | SidearmWeapon;

/** Ranged primaries — units equipped with these default to backline position. */
export const RANGED_PRIMARIES: ReadonlySet<PrimaryWeapon> = new Set(['longbow', 'musket', 'rifle']);

export interface WeaponStatBonus {
  fire?: number;
  shock?: number;
  defence?: number;
  morale?: number;
  ap?: number;
}

/** Workshop production points generated per workshop building per minor turn. */
export const WORKSHOP_POINTS_PER_TURN = 10;

export interface WeaponDef {
  name: string;
  statBonus: WeaponStatBonus;
  /** Resources consumed from settlement storage per item produced. */
  inputs: Partial<Record<ResourceType, number>>;
  /** Tech required to unlock production. null = available from start. */
  techRequired: TechId | null;
  /** Max stat points that can be shifted via weapon design (total pool for variants). */
  designBudget: number;
  /**
   * Production cost in workshop-points per item.
   * items/workshop/turn = floor(WORKSHOP_POINTS_PER_TURN / productionCost)
   * Modified by weapon design costModifier and order priority.
   */
  productionCost: number;
}

export const PRIMARY_WEAPONS: Record<PrimaryWeapon, WeaponDef> = {
  greataxe: {
    name: 'Greataxe',
    statBonus: { shock: 5, ap: 1 },
    inputs: { iron: 1, leather: 1 },
    techRequired: null,
    designBudget: 3,
    productionCost: 2,
  },
  greatsword: {
    name: 'Greatsword',
    statBonus: { shock: 4, defence: 1, ap: 2 },
    inputs: { steel: 1, leather: 1 },
    techRequired: 'foundry',
    designBudget: 3,
    productionCost: 3,
  },
  polearm: {
    name: 'Polearm',
    statBonus: { shock: 3, defence: 3 },
    inputs: { iron: 1, timber: 1 },
    techRequired: null,
    designBudget: 3,
    productionCost: 2,
  },
  longbow: {
    name: 'Longbow',
    statBonus: { fire: 6, ap: 1 },
    inputs: { timber: 2 },
    techRequired: null,
    designBudget: 3,
    productionCost: 2,
  },
  musket: {
    name: 'Musket',
    statBonus: { fire: 7, ap: 3 },
    inputs: { iron: 1, timber: 1, gunpowder: 1 },
    techRequired: 'alchemy',
    designBudget: 4,
    productionCost: 5,
  },
  rifle: {
    name: 'Rifle',
    statBonus: { fire: 9, ap: 5 },
    inputs: { steel: 1, timber: 1, gunpowder: 1 },
    techRequired: 'firearms',
    designBudget: 4,
    productionCost: 10,
  },
};

export const SIDEARM_WEAPONS: Record<SidearmWeapon, WeaponDef> = {
  shortsword: {
    name: 'Shortsword',
    statBonus: { shock: 2 },
    inputs: { iron: 1 },
    techRequired: null,
    designBudget: 2,
    productionCost: 2,
  },
  longsword: {
    name: 'Longsword',
    statBonus: { shock: 3 },
    inputs: { steel: 1 },
    techRequired: 'foundry',
    designBudget: 2,
    productionCost: 3,
  },
  sabre: {
    name: 'Sabre',
    statBonus: { shock: 2, fire: 1 },
    inputs: { steel: 1 },
    techRequired: 'foundry',
    designBudget: 2,
    productionCost: 3,
  },
  handgun: {
    name: 'Handgun',
    statBonus: { fire: 3, ap: 2 },
    inputs: { iron: 1, gunpowder: 1 },
    techRequired: 'firearms',
    designBudget: 2,
    productionCost: 5,
  },
};
