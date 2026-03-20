// ─── Mount Constants ───

import type { TechId } from '../types/tech.js';
import type { TerrainType } from '../types/map.js';

export type MountType = 'horse' | 'gryphon' | 'demigryph';

export type HorseBreed =
  // Common breeds — found on plains hexes
  | 'thoroughbred' | 'clydesdale' | 'mustang' | 'painter' | 'chestnut'
  | 'weynon' | 'palomino' | 'piebald' | 'dapple_grey'
  // Rare breeds — terrain-specific spawns
  | 'craghoof' | 'dunian' | 'grover';

export type GryphonBreed = 'ironside' | 'eaglebeak' | 'savagecrest' | 'cavegryph';

export type MountBreed = HorseBreed | GryphonBreed;

export interface MountStatBonus {
  fire?: number;
  shock?: number;
  defence?: number;
  morale?: number;
  ap?: number;
  armour?: number;
  hitsOnBonus?: number; // subtracted from hitsOn — mounted units are harder to hit
}

export interface MountDef {
  name: string;
  statBonus: MountStatBonus;
  /** Tech required to use this mount type. null = available from start. */
  techRequired: TechId | null;
}

export const MOUNT_TYPES: Record<MountType, MountDef> = {
  horse: {
    name: 'Horse',
    statBonus: { shock: 3, morale: 2, defence: 1, hitsOnBonus: 1 },
    techRequired: null,
  },
  gryphon: {
    name: 'Gryphon',
    statBonus: { shock: 3, fire: 2, morale: 2, hitsOnBonus: 1 },
    techRequired: 'gryphon_taming',
  },
  demigryph: {
    name: 'Demigryph',
    statBonus: { shock: 4, fire: 1, morale: 3, defence: 1, hitsOnBonus: 2 },
    techRequired: 'demigryph_breeding',
  },
};

export interface BreedDef {
  name: string;
  description: string;
  statBonus: MountStatBonus;
  /** Terrain where this breed spawns (rare breeds only). Null = common (plains). */
  spawnTerrain: TerrainType | null;
  isRare: boolean;
}

export const HORSE_BREEDS: Record<HorseBreed, BreedDef> = {
  // ── Common breeds ──
  thoroughbred: {
    name: 'Thoroughbred',
    description: 'A refined, spirited horse with exceptional endurance.',
    statBonus: { morale: 1 },
    spawnTerrain: null, isRare: false,
  },
  clydesdale: {
    name: 'Clydesdale',
    description: 'Heavy-built and steadfast, difficult to unseat.',
    statBonus: { defence: 1 },
    spawnTerrain: null, isRare: false,
  },
  mustang: {
    name: 'Mustang',
    description: 'A wild and fierce animal, aggressive in the charge.',
    statBonus: { shock: 1 },
    spawnTerrain: null, isRare: false,
  },
  painter: {
    name: 'Painter',
    description: 'An eye-catching pinto with surprising tactical instincts.',
    statBonus: { ap: 1 },
    spawnTerrain: null, isRare: false,
  },
  chestnut: {
    name: 'Chestnut',
    description: 'A strong, reliable warhorse with a powerful build.',
    statBonus: { shock: 1 },
    spawnTerrain: null, isRare: false,
  },
  weynon: {
    name: 'Weynon',
    description: 'Calm under pressure, renowned for keeping formation.',
    statBonus: { morale: 1 },
    spawnTerrain: null, isRare: false,
  },
  palomino: {
    name: 'Palomino',
    description: 'A swift golden horse with an alert, responsive temperament.',
    statBonus: { fire: 1 },
    spawnTerrain: null, isRare: false,
  },
  piebald: {
    name: 'Piebald',
    description: 'Tough and compact, rarely flinches under fire.',
    statBonus: { defence: 1 },
    spawnTerrain: null, isRare: false,
  },
  dapple_grey: {
    name: 'Dapple Grey',
    description: 'A naturally hardy coat that absorbs minor blows.',
    statBonus: { armour: 1 },
    spawnTerrain: null, isRare: false,
  },

  // ── Rare breeds ──
  craghoof: {
    name: 'Craghoof',
    description: 'Rugged, sure-footed mountain horse, bred for treacherous terrain.',
    statBonus: { defence: 2 },
    spawnTerrain: 'hills', isRare: true,
  },
  dunian: {
    name: 'Dunian',
    description: 'Desert-adapted, strong endurance in harsh climates.',
    statBonus: { morale: 2 },
    spawnTerrain: 'desert', isRare: true,
  },
  grover: {
    name: 'Grover',
    description: 'Forest-dwelling, quick and quiet beneath the canopy.',
    statBonus: { ap: 2 },
    spawnTerrain: 'forest', isRare: true,
  },
};

export const GRYPHON_BREEDS: Record<GryphonBreed, BreedDef> = {
  ironside: {
    name: 'Ironside',
    description: 'Thick-feathered and battle-hardened, near impervious to minor wounds.',
    statBonus: { armour: 3, defence: 2 },
    spawnTerrain: null, isRare: false,
  },
  eaglebeak: {
    name: 'Eaglebeak',
    description: 'The most common gryphon — balanced and reliable in all roles.',
    statBonus: { shock: 1, fire: 1 },
    spawnTerrain: null, isRare: false,
  },
  savagecrest: {
    name: 'Savagecrest',
    description: 'Ferocious and aggressive, devastating in the initial charge.',
    statBonus: { shock: 3 },
    spawnTerrain: null, isRare: false,
  },
  cavegryph: {
    name: 'Cavegryph',
    description: 'A subterranean gryphon variant. Smaller and less capable than its kin.',
    statBonus: {},
    spawnTerrain: null, isRare: false,
  },
};

/**
 * Combine horse and gryphon breed bonuses to produce a Demigryph breed name and stats.
 * A Demigryph inherits both parent breed bonuses on top of its base mount stats.
 */
export function getDemigryph(horseName: HorseBreed, gryphonName: GryphonBreed): {
  name: string;
  combinedBonus: MountStatBonus;
} {
  const hBonus = HORSE_BREEDS[horseName].statBonus;
  const gBonus = GRYPHON_BREEDS[gryphonName].statBonus;
  const combinedBonus: MountStatBonus = {};
  for (const key of Object.keys({ ...hBonus, ...gBonus }) as (keyof MountStatBonus)[]) {
    combinedBonus[key] = (hBonus[key] ?? 0) + (gBonus[key] ?? 0);
  }
  return {
    name: `${HORSE_BREEDS[horseName].name} ${GRYPHON_BREEDS[gryphonName].name}`,
    combinedBonus,
  };
}
