import type { SettlementTier } from '../types/settlement.js';
import type { ResourceType } from '../types/map.js';

export interface SettlementTierDef {
  buildingSlots: number;
  popCap: number;
  storageCap: number;
  upgradeCost: { gold: number; resources: Partial<Record<ResourceType, number>> };
  visionRange: number;
  softFogRange: number;
}

export const SETTLEMENT_TIERS: Record<SettlementTier, SettlementTierDef> = {
  hamlet: {
    buildingSlots: 2,
    popCap: 200,
    storageCap: 500,
    upgradeCost: { gold: 1000, resources: { timber: 20 } },
    visionRange: 3,
    softFogRange: 4,
  },
  village: {
    buildingSlots: 4,
    popCap: 500,
    storageCap: 1000,
    upgradeCost: { gold: 3000, resources: { timber: 30, brick: 10 } },
    visionRange: 3,
    softFogRange: 4,
  },
  town: {
    buildingSlots: 6,
    popCap: 1200,
    storageCap: 2000,
    upgradeCost: { gold: 6000, resources: { brick: 30, stone: 20 } },
    visionRange: 3,
    softFogRange: 4,
  },
  city: {
    buildingSlots: 8,
    popCap: 3000,
    storageCap: 4000,
    upgradeCost: { gold: 12000, resources: { brick: 50, stone: 40 } },
    visionRange: 3,
    softFogRange: 4,
  },
  metropolis: {
    buildingSlots: 10,
    popCap: 8000,
    storageCap: 8000,
    upgradeCost: { gold: 0, resources: {} }, // max tier, no upgrade
    visionRange: 3,
    softFogRange: 4,
  },
};

/** Ordered list for upgrade path lookups. */
export const TIER_ORDER: SettlementTier[] = [
  'hamlet', 'village', 'town', 'city', 'metropolis',
];

export function getNextTier(current: SettlementTier): SettlementTier | null {
  const idx = TIER_ORDER.indexOf(current);
  return idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : null;
}

export function getTierIndex(tier: SettlementTier): number {
  return TIER_ORDER.indexOf(tier);
}

/** Check if a settlement tier meets a minimum requirement. */
export function meetsTierRequirement(current: SettlementTier, required: SettlementTier): boolean {
  return getTierIndex(current) >= getTierIndex(required);
}
