// ─── Economy ───

import type { ResourceType } from './map.js';

export type TaxRate = 'low' | 'fair' | 'cruel';

export interface ResourceStock {
  [resource: string]: number;
}

export interface UpkeepLedger {
  armyUpkeep: number;
  buildingUpkeep: number;
  totalUpkeep: number;
  taxIncome: number;
  tradeIncome: number;
  netGold: number;
}
