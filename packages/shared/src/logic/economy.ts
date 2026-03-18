/**
 * Resource production and economic calculations.
 * Pure functions — no DB access, no side effects.
 */

import type { ResourceType } from '../types/map.js';
import type { TaxRate } from '../types/economy.js';
import type { BuildingType } from '../types/building.js';
import type { Season } from '../types/game.js';
import { BUILDINGS, COST_TIERS, RESEARCH_POINTS } from '../constants/buildings.js';
import { SETTLEMENT_TIERS } from '../constants/settlements.js';
import type { SettlementTier } from '../types/settlement.js';

export interface SettlementProduction {
  settlementId: string;
  produced: Partial<Record<ResourceType, number>>;
  consumed: Partial<Record<ResourceType, number>>;
  researchPoints: number;
}

export interface BuildingInstance {
  type: BuildingType;
  isConstructing: boolean;
}

/**
 * Calculate what a single settlement produces and consumes in one minor turn.
 * Output scales linearly with population up to building capacity.
 */
export function calculateSettlementProduction(
  buildings: BuildingInstance[],
  population: number,
  popCap: number,
  hexResources: ResourceType[],
  hexStorage: Partial<Record<ResourceType, number>>,
  season: Season,
): SettlementProduction {
  const produced: Partial<Record<ResourceType, number>> = {};
  const consumed: Partial<Record<ResourceType, number>> = {};
  let researchPoints = 0;

  // Population scaling factor (0 to 1)
  const popScale = popCap > 0 ? Math.min(1, population / popCap) : 0;

  for (const building of buildings) {
    if (building.isConstructing) continue;

    const def = BUILDINGS[building.type];
    if (!def) continue;

    // Research buildings
    const rp = RESEARCH_POINTS[building.type];
    if (rp) {
      researchPoints += Math.floor(rp * popScale);
      continue;
    }

    // Production buildings
    if (def.output) {
      // Check if extraction building has matching terrain resource
      if (def.category === 'extraction' && def.terrain) {
        const hasMatchingResource = hexResources.some(r => {
          // Farm needs grain/cattle/fruit, fishery needs fish, etc.
          if (building.type === 'farm') return ['grain', 'cattle', 'fruit'].includes(r);
          if (building.type === 'fishery') return r === 'fish';
          if (building.type === 'sawmill') return r === 'wood';
          if (building.type === 'quarry') return r === 'stone';
          if (building.type === 'mine') return ['iron_ore', 'gold_ore'].includes(r);
          if (building.type === 'stables') return r === 'wild_horses';
          if (building.type === 'griffin_lodge') return r === 'gryphons';
          return false;
        });
        if (!hasMatchingResource) continue;
      }

      // Check processing buildings have input available
      if (def.category === 'processing' && def.input) {
        let hasInputs = true;
        for (const [resource, amount] of Object.entries(def.input)) {
          const available = hexStorage[resource as ResourceType] ?? 0;
          if (available < (amount ?? 0)) {
            hasInputs = false;
            break;
          }
        }
        if (!hasInputs) continue;

        // Record consumed inputs
        for (const [resource, amount] of Object.entries(def.input)) {
          consumed[resource as ResourceType] = (consumed[resource as ResourceType] ?? 0) + (amount ?? 0);
        }
      }

      // Calculate output scaled by population
      for (const [resource, baseAmount] of Object.entries(def.output)) {
        let amount = Math.floor((baseAmount ?? 0) * popScale);

        // Seasonal modifiers for farms
        if (building.type === 'farm') {
          amount = applySeasonalModifier(amount, season);
        }

        produced[resource as ResourceType] = (produced[resource as ResourceType] ?? 0) + amount;
      }
    }
  }

  return { settlementId: '', produced, consumed, researchPoints };
}

/** Apply seasonal modifier to farm output. */
function applySeasonalModifier(baseAmount: number, season: Season): number {
  // Harvest bonus: late summer / early autumn
  if (season === 'late_summer' || season === 'early_autumn') {
    return Math.floor(baseAmount * 1.5);
  }
  // Winter penalty
  if (season === 'early_winter' || season === 'late_winter') {
    return Math.floor(baseAmount * 0.5);
  }
  return baseAmount;
}

/** Calculate tax income for a player. */
export function calculateTaxIncome(
  totalPopulation: number,
  taxRate: TaxRate,
): number {
  const basePerPop = 0.5; // gold per population
  const multiplier = taxRate === 'low' ? 0.5 : taxRate === 'fair' ? 1.0 : 1.5;
  return Math.floor(totalPopulation * basePerPop * multiplier);
}

/** Calculate total upkeep for armies and buildings. */
export function calculateUpkeep(
  buildingTypes: BuildingType[],
  armyUnitCount: number,
): { buildingUpkeep: number; armyUpkeep: number; total: number } {
  let buildingUpkeep = 0;
  for (const type of buildingTypes) {
    const def = BUILDINGS[type];
    if (!def) continue;
    const tier = COST_TIERS[def.costTier];
    buildingUpkeep += tier.maintenance;
  }

  // Army upkeep: 50g per unit per minor turn
  const armyUpkeep = armyUnitCount * 50;

  return {
    buildingUpkeep,
    armyUpkeep,
    total: buildingUpkeep + armyUpkeep,
  };
}

/** Calculate food consumption for a settlement. */
export function calculateFoodConsumption(population: number): number {
  // 1 food per 10 population per minor turn
  return Math.ceil(population / 10);
}

/** Get the storage cap for a settlement tier. */
export function getStorageCap(tier: SettlementTier): number {
  return SETTLEMENT_TIERS[tier].storageCap;
}
