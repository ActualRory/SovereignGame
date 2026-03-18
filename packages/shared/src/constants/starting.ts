import type { BuildingType } from '../types/building.js';
import type { UnitType } from '../types/military.js';
import type { SettlementTier } from '../types/settlement.js';
import type { TaxRate } from '../types/economy.js';

/** What each player starts with when a game begins. */
export const STARTING_CONDITIONS = {
  settlement: {
    tier: 'town' as SettlementTier,
    isCapital: true,
  },
  /** Population starts at half the Town pop cap. */
  populationFraction: 0.5,
  /** Starting gold in the treasury. */
  gold: 5000,
  /** Pre-built buildings (4 of 6 Town slots used). */
  buildings: ['farm', 'library', 'barracks', 'blacksmith'] as BuildingType[],
  /** Starting military units. */
  units: [
    { type: 'spearmen' as UnitType, count: 2 },
  ],
  /** Starting stability. */
  stability: 100,
  /** Default tax rate. */
  taxRate: 'low' as TaxRate,
  /** Starting government title. */
  governmentTitle: 'Ruler',
} as const;
