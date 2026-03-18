// ─── Settlements ───

import type { ResourceType } from './map.js';

export type SettlementTier = 'hamlet' | 'village' | 'town' | 'city' | 'metropolis';

export interface Settlement {
  id: string;
  gameId: string;
  hexQ: number;
  hexR: number;
  ownerId: string;
  name: string;
  tier: SettlementTier;
  population: number;
  popCap: number;
  isCapital: boolean;
  /** Resource stockpile stored at this settlement. */
  storage: Partial<Record<ResourceType, number>>;
  constructionQueue: ConstructionJob[];
}

export interface ConstructionJob {
  buildingType: string;
  turnsRemaining: number;
}
