// ─── Weapon Constants ───

import type { TechId } from '../types/tech.js';
import type { ResourceType } from '../types/map.js';

export type Handedness = '1h' | '2h' | 'versatile';

export type WeaponType =
  // 1H
  | 'dagger' | 'shortsword' | 'sabre' | 'handgun'
  // Versatile (1H or 2H)
  | 'longsword' | 'spear'
  // 2H
  | 'great_weapon' | 'polearm' | 'longbow' | 'musket' | 'rifle';

/** @deprecated Use WeaponType */
export type PrimaryWeapon = 'great_weapon' | 'polearm' | 'longbow' | 'musket' | 'rifle';
/** @deprecated Use WeaponType */
export type SidearmWeapon = 'shortsword' | 'longsword' | 'sabre' | 'handgun';
/** @deprecated Use WeaponType */
export type AnyWeapon = WeaponType;

/** Ranged weapons — units with these as primary default to backline. */
export const RANGED_WEAPONS: ReadonlySet<WeaponType> = new Set(['longbow', 'musket', 'rifle']);
/** @deprecated Use RANGED_WEAPONS */
export const RANGED_PRIMARIES = RANGED_WEAPONS;

export interface WeaponStatBonus {
  fire?: number;
  shock?: number;
  defence?: number;
  morale?: number;
  ap?: number;
}

/** Workshop production points generated per workshop building per minor turn. */
export const WORKSHOP_POINTS_PER_TURN = 80;

export interface WeaponDef {
  name: string;
  handedness: Handedness;
  statBonus: WeaponStatBonus;
  /**
   * Territorial resources the player must own to place production orders.
   * Owning the resource without the corresponding processing building incurs a 2× gold cost penalty.
   */
  requiredResources: ResourceType[];
  /** Tech required to unlock production. null = available from start. */
  techRequired: TechId | null;
  /** Production cost in workshop-points per item. */
  productionCost: number;
  /** Gold deducted per item produced at full efficiency. */
  goldCostPerItem: number;
}

export const WEAPONS: Record<WeaponType, WeaponDef> = {
  // ── 1H ──
  dagger: {
    name: 'Dagger',
    handedness: '1h',
    statBonus: { shock: 1 },
    requiredResources: ['iron_ore'],
    techRequired: null,
    productionCost: 1,
    goldCostPerItem: 1,
  },
  shortsword: {
    name: 'Shortsword',
    handedness: '1h',
    statBonus: { shock: 2 },
    requiredResources: ['iron_ore'],
    techRequired: null,
    productionCost: 2,
    goldCostPerItem: 2,
  },
  sabre: {
    name: 'Sabre',
    handedness: '1h',
    statBonus: { shock: 2, fire: 1 },
    requiredResources: ['iron_ore'],
    techRequired: 'foundry',
    productionCost: 3,
    goldCostPerItem: 4,
  },
  handgun: {
    name: 'Handgun',
    handedness: '1h',
    statBonus: { fire: 3, ap: 2 },
    requiredResources: ['iron_ore', 'sulphur'],
    techRequired: 'firearms',
    productionCost: 5,
    goldCostPerItem: 5,
  },

  // ── Versatile ──
  longsword: {
    name: 'Longsword',
    handedness: 'versatile',
    statBonus: { shock: 3 },
    requiredResources: ['iron_ore'],
    techRequired: 'foundry',

    productionCost: 3,
    goldCostPerItem: 4,
  },
  spear: {
    name: 'Spear',
    handedness: 'versatile',
    statBonus: { shock: 2, defence: 2 },
    requiredResources: ['wood', 'iron_ore'],
    techRequired: null,

    productionCost: 2,
    goldCostPerItem: 3,
  },

  // ── 2H ──
  great_weapon: {
    name: 'Great Weapon',
    handedness: '2h',
    statBonus: { shock: 5, ap: 1 },
    requiredResources: ['iron_ore'],
    techRequired: null,

    productionCost: 2,
    goldCostPerItem: 3,
  },
  polearm: {
    name: 'Polearm',
    handedness: '2h',
    statBonus: { shock: 3, defence: 3 },
    requiredResources: ['iron_ore', 'wood'],
    techRequired: null,

    productionCost: 2,
    goldCostPerItem: 3,
  },
  longbow: {
    name: 'Longbow',
    handedness: '2h',
    statBonus: { fire: 6, ap: 1 },
    requiredResources: ['wood'],
    techRequired: null,

    productionCost: 2,
    goldCostPerItem: 2,
  },
  musket: {
    name: 'Musket',
    handedness: '2h',
    statBonus: { fire: 7, ap: 3 },
    requiredResources: ['iron_ore', 'sulphur'],
    techRequired: 'alchemy',

    productionCost: 5,
    goldCostPerItem: 8,
  },
  rifle: {
    name: 'Rifle',
    handedness: '2h',
    statBonus: { fire: 9, ap: 5 },
    requiredResources: ['iron_ore', 'sulphur'],
    techRequired: 'firearms',

    productionCost: 10,
    goldCostPerItem: 15,
  },
};

/** Legacy split constants for backward compat. Prefer WEAPONS. */
export const PRIMARY_WEAPONS = Object.fromEntries(
  (['great_weapon', 'polearm', 'longbow', 'musket', 'rifle'] as PrimaryWeapon[]).map(k => [k, WEAPONS[k]])
) as Record<PrimaryWeapon, WeaponDef>;

/** Legacy split constants for backward compat. Prefer WEAPONS. */
export const SIDEARM_WEAPONS = Object.fromEntries(
  (['shortsword', 'longsword', 'sabre', 'handgun'] as SidearmWeapon[]).map(k => [k, WEAPONS[k]])
) as Record<SidearmWeapon, WeaponDef>;

/** Returns true if this weapon can be placed in the secondary hand slot. */
export function canGoInSecondary(weapon: WeaponType): boolean {
  return WEAPONS[weapon].handedness === '1h' || WEAPONS[weapon].handedness === 'versatile';
}

/** Returns true if this weapon can be placed in the sidearm slot. */
export function canGoInSidearm(weapon: WeaponType): boolean {
  return WEAPONS[weapon].handedness === '1h';
}

/** Returns true if the primary weapon allows a secondary hand item. */
export function secondarySlotAllowed(primary: WeaponType | null): boolean {
  if (!primary) return true;
  return WEAPONS[primary].handedness !== '2h';
}
