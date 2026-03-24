// ─── Turn Orders ───

import type { HexCoord, ResourceType } from './map.js';
import type { TaxRate } from './economy.js';
import type { TechId } from './tech.js';
import type { BuildingType } from './building.js';
import type { ShipType, UnitPosition } from './military.js';
import type { NobleBranch, NobleAssignmentType } from './noble.js';
import type { WeaponType } from '../constants/weapons.js';
import type { ShieldType } from '../constants/shields.js';
import type { ArmourType } from '../constants/armour.js';
import type { MountType } from '../constants/mounts.js';

/** The full set of actions a player submits for one minor turn. */
export interface TurnOrders {
  // Economy
  taxRate: TaxRate;

  // Construction
  constructions: ConstructionOrder[];
  settlementUpgrades: SettlementUpgradeOrder[];

  // Research
  techResearch: TechId | null;

  // Military — unit templates
  createTemplates: CreateUnitTemplateOrder[];
  updateTemplates: UpdateUnitTemplateOrder[];
  deleteTemplates: DeleteUnitTemplateOrder[];

  // Military — draft & dismiss
  draftRecruits: DraftRecruitsOrder[];
  dismissRecruits: DismissRecruitsOrder[];
  draftMounts: DraftMountsOrder[];
  dismissMounts: DismissMountsOrder[];

  // Military — recruitment & replenishment
  recruitments: RecruitmentOrder[];
  replenishments: ReplenishmentOrder[];
  disbandUnits: DisbandUnitOrder[];
  upgradeUnits: UpgradeUnitOrder[];

  // Military — equipment production orders
  equipmentOrders: PlaceEquipmentOrder[];
  cancelEquipmentOrders: CancelEquipmentOrderOrder[];

  // Military — movement & combat
  movements: MovementOrder[];
  siegeAssaults: SiegeAssaultOrder[];
  unitReassignments: UnitReassignmentOrder[];

  // Nobles
  nobleOrders: NobleOrder[];
  createArmies: CreateArmyOrder[];

  // Diplomacy
  lettersSent: string[]; // letter IDs (composed separately)

  // Trade
  tradeProposals: TradeProposalOrder[];
  tradeCancellations: string[]; // agreement IDs

  // Settlement
  newSettlements: NewSettlementOrder[];

  // Territory
  claimHexes: ClaimHexOrder[];

  // Terrain conversion
  farmlandConversions: ConvertFarmlandOrder[];
}

// ── Construction ──

export interface ConstructionOrder {
  settlementId: string;
  buildingType: BuildingType;
}

export interface SettlementUpgradeOrder {
  settlementId: string;
}

// ── Unit Templates ──

export interface CreateUnitTemplateOrder {
  name: string;
  isIrregular: boolean;
  isMounted: boolean;
  companiesOrSquadrons: 1 | 2 | 3 | 4 | 5;
  primary: WeaponType | null;
  secondary: WeaponType | ShieldType | null;
  sidearm: WeaponType | null;
  armour: ArmourType | null;
  mount: MountType | null;
}

export interface UpdateUnitTemplateOrder {
  templateId: string;
  changes: Partial<Omit<CreateUnitTemplateOrder, 'isIrregular'>>;
}

export interface DeleteUnitTemplateOrder {
  templateId: string;
}

// ── Draft & Dismiss ──

export interface DraftRecruitsOrder {
  settlementId: string;
  amount: number;
}

export interface DismissRecruitsOrder {
  settlementId: string;
  amount: number;
}

export interface DraftMountsOrder {
  settlementId: string;
  mountType: MountType;
  amount: number;
}

export interface DismissMountsOrder {
  settlementId: string;
  mountType: MountType;
  amount: number;
}

// ── Recruitment & Unit Management ──

export interface RecruitmentOrder {
  settlementId: string;
  armyId: string;
  /** The template to recruit. */
  templateId: string;
}

/** Replenish losses: pull recruits + equipment from settlement to fill unit back up. */
export interface ReplenishmentOrder {
  unitId: string;
  armyId: string;
  settlementId: string;
}

export interface DisbandUnitOrder {
  unitId: string;
  armyId: string;
}

/**
 * Upgrade an outdated unit to match its current template.
 * Costs the equipment difference between the old and new template.
 * Unit must be at a settlement.
 */
export interface UpgradeUnitOrder {
  unitId: string;
  armyId: string;
  settlementId: string;
}

// ── Equipment Production ──

/**
 * Production priority for an equipment order.
 * - relaxed: ×0.75 throughput, ×0.75 input cost per turn
 * - standard: ×1.0 (default)
 * - rush:     ×1.33 throughput, ×1.25 input cost per turn
 */
export type EquipmentOrderPriority = 'relaxed' | 'standard' | 'rush';

export interface PlaceEquipmentOrder {
  settlementId: string;
  /** The weapon or armour type to produce. */
  equipmentType: ResourceType;
  quantity: number;
  priority: EquipmentOrderPriority;
}

export interface CancelEquipmentOrderOrder {
  orderId: string;
}

// ── Movement & Combat ──

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

// ── Nobles ──

export type NobleOrder =
  | { type: 'hire_noble'; settlementId: string; name?: string; branch: NobleBranch }
  | { type: 'promote_noble'; nobleId: string }
  | { type: 'rename_noble'; nobleId: string; name: string }
  | { type: 'set_title'; nobleId: string; title: string }
  | { type: 'assign_noble'; nobleId: string; assignmentType: NobleAssignmentType; entityId: string; secondaryId?: string }
  | { type: 'unassign_noble'; nobleId: string }
  | { type: 'ransom_offer'; nobleId: string; goldAmount: number }
  | { type: 'ransom_accept'; nobleId: string }
  | { type: 'ransom_reject'; nobleId: string }
  | { type: 'release_noble'; nobleId: string };

// ── Other ──

export interface TradeProposalOrder {
  recipientId: string;
  offeredResources: { resource: string; amount: number }[];
  requestedResources: { resource: string; amount: number }[];
  isStanding: boolean;
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

// ── Territory ──

export interface ClaimHexOrder {
  hexQ: number;
  hexR: number;
}

// ── Terrain Conversion ──

export interface ConvertFarmlandOrder {
  hexQ: number;
  hexR: number;
}

/** Empty turn orders — used when a player doesn't submit. */
export function emptyOrders(currentTaxRate: TaxRate): TurnOrders {
  return {
    taxRate: currentTaxRate,
    constructions: [],
    settlementUpgrades: [],
    techResearch: null,
    createTemplates: [],
    updateTemplates: [],
    deleteTemplates: [],
    draftRecruits: [],
    dismissRecruits: [],
    draftMounts: [],
    dismissMounts: [],
    recruitments: [],
    replenishments: [],
    disbandUnits: [],
    upgradeUnits: [],
    equipmentOrders: [],
    cancelEquipmentOrders: [],
    movements: [],
    siegeAssaults: [],
    unitReassignments: [],
    nobleOrders: [],
    createArmies: [],
    lettersSent: [],
    tradeProposals: [],
    tradeCancellations: [],
    newSettlements: [],
    claimHexes: [],
    farmlandConversions: [],
  };
}
