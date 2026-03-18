// ─── Turn Orders ───

import type { HexCoord } from './map.js';
import type { TaxRate } from './economy.js';
import type { TechId } from './tech.js';
import type { BuildingType } from './building.js';
import type { UnitType, ShipType, UnitPosition } from './military.js';

/** The full set of actions a player submits for one minor turn. */
export interface TurnOrders {
  // Economy
  taxRate: TaxRate;

  // Construction
  constructions: ConstructionOrder[];
  settlementUpgrades: SettlementUpgradeOrder[];

  // Research
  techResearch: TechId | null;

  // Military
  recruitments: RecruitmentOrder[];
  movements: MovementOrder[];
  siegeAssaults: SiegeAssaultOrder[];
  unitReassignments: UnitReassignmentOrder[];
  hireGenerals: HireGeneralOrder[];
  createArmies: CreateArmyOrder[];

  // Diplomacy
  lettersSent: string[]; // letter IDs (composed separately)

  // Trade
  tradeProposals: TradeProposalOrder[];
  tradeCancellations: string[]; // agreement IDs

  // Settlement
  newSettlements: NewSettlementOrder[];
}

export interface ConstructionOrder {
  settlementId: string;
  buildingType: BuildingType;
}

export interface SettlementUpgradeOrder {
  settlementId: string;
}

export interface RecruitmentOrder {
  settlementId: string;
  armyId: string;
  unitType: UnitType | ShipType;
}

export interface MovementOrder {
  armyId: string;
  path: HexCoord[];
}

export interface SiegeAssaultOrder {
  armyId: string;
  targetHexQ: number;
  targetHexR: number;
}

export interface UnitReassignmentOrder {
  unitId: string;
  fromArmyId: string;
  toArmyId: string;
  newPosition?: UnitPosition;
}

export interface TradeProposalOrder {
  recipientId: string;
  offeredResources: { resource: string; amount: number }[];
  requestedResources: { resource: string; amount: number }[];
  isStanding: boolean;
}

export interface HireGeneralOrder {
  settlementId: string;
  name: string;
  isAdmiral: boolean;
}

export interface CreateArmyOrder {
  hexQ: number;
  hexR: number;
  name: string;
}

export interface NewSettlementOrder {
  hexQ: number;
  hexR: number;
  name: string;
}

/** Empty turn orders — used when a player doesn't submit. */
export function emptyOrders(currentTaxRate: TaxRate): TurnOrders {
  return {
    taxRate: currentTaxRate,
    constructions: [],
    settlementUpgrades: [],
    techResearch: null,
    recruitments: [],
    movements: [],
    siegeAssaults: [],
    unitReassignments: [],
    hireGenerals: [],
    createArmies: [],
    lettersSent: [],
    tradeProposals: [],
    tradeCancellations: [],
    newSettlements: [],
  };
}
