import type { TerrainType, ResourceType } from '../types/map.js';

export interface TerrainStats {
  movementCost: number;
  supply: 'very_low' | 'low' | 'medium' | 'high';
  supplyValue: number; // numeric for calculations
  defenceBonus: number;
  possibleResources: ResourceType[];
  frontlineWidth: number;
}

export const TERRAIN: Record<TerrainType, TerrainStats> = {
  plains: {
    movementCost: 1,
    supply: 'high',
    supplyValue: 4,
    defenceBonus: 0,
    possibleResources: ['grain', 'cattle', 'wool', 'cotton', 'wild_horses'],
    frontlineWidth: 10,
  },
  farmland: {
    movementCost: 1,
    supply: 'high',
    supplyValue: 5,
    defenceBonus: 0,
    possibleResources: ['grain', 'cattle', 'fruit'],
    frontlineWidth: 10,
  },
  hills: {
    movementCost: 2,
    supply: 'medium',
    supplyValue: 3,
    defenceBonus: 1,
    possibleResources: ['iron_ore', 'stone', 'gold_ore'],
    frontlineWidth: 6,
  },
  mountains: {
    movementCost: 3,
    supply: 'low',
    supplyValue: 2,
    defenceBonus: 2,
    possibleResources: ['stone', 'iron_ore', 'gold_ore', 'gryphons'],
    frontlineWidth: 4,
  },
  forest: {
    movementCost: 2,
    supply: 'medium',
    supplyValue: 3,
    defenceBonus: 1,
    possibleResources: ['wood', 'fruit'],
    frontlineWidth: 5,
  },
  coast: {
    movementCost: 1,
    supply: 'medium',
    supplyValue: 3,
    defenceBonus: 0,
    possibleResources: ['fish'],
    frontlineWidth: 4,
  },
  marsh: {
    movementCost: 3,
    supply: 'low',
    supplyValue: 2,
    defenceBonus: 1,
    possibleResources: [],
    frontlineWidth: 4,
  },
  desert: {
    movementCost: 2,
    supply: 'very_low',
    supplyValue: 1,
    defenceBonus: 0,
    possibleResources: [],
    frontlineWidth: 10,
  },
};

/** Extra movement cost for crossing a river edge. */
export const RIVER_CROSSING_COST = 1;

/** Defence bonus for the defender when the attacker crosses a river. */
export const RIVER_DEFENCE_BONUS = 1;

/** Frontline width when attacking across a river. */
export const RIVER_CROSSING_FRONTLINE_WIDTH = 4;
