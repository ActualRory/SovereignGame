// ─── Turn Orders ───

import type { HexCoord, ResourceType } from './map.js';
import type { TaxRate } from './economy.js';
import type { TechId } from './tech.js';
import type { BuildingType } from './building.js';
import type { ShipType, UnitPosition } from './military.js';
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

  // Military — weapon designs
  createWeaponDesigns: CreateWeaponDesignOrder[];
  retireWeaponDesigns: RetireWeaponDesignOrder[];

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

  // Officers
  hireGenerals: HireGeneralOrder[];
  assignOfficers: AssignOfficerOrder[];
  unassignOfficers: UnassignOfficerOrder[];
  createArmies: CreateArmyOrder[];

  // Diplomacy
  lettersSent: string[]; // letter IDs (composed separately)

  // Trade
  tradeProposals: TradeProposalOrder[];
  tradeCancellations: string[]; // agreement IDs

  // Settlement
  newSettlements: NewSettlementOrder[];
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
  primaryDesignId: string | null;
  secondaryDesignId: string | null;
  sidearmDesignId: string | null;
}

export interface UpdateUnitTemplateOrder {
  templateId: string;
  changes: Partial<Omit<CreateUnitTemplateOrder, 'isIrregular'>>;
}

export interface DeleteUnitTemplateOrder {
  templateId: string;
}

// ── Weapon Designs ──

export interface CreateWeaponDesignOrder {
  baseWeapon: WeaponType | ShieldType;
  name: string;
  statModifiers: Partial<{
    fire: number; shock: number; defence: number;
    morale: number; ap: number; armour: number;
  }>;
}

export interface RetireWeaponDesignOrder {
  designId: string;
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
  /** Optional weapon design variant being produced. Display/tracking only — base type goes to storage. */
  designId?: string;
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

// ── Officers ──

export interface HireGeneralOrder {
  settlementId: string;
  name: string;
  isAdmiral: boolean;
}

export interface AssignOfficerOrder {
  officerId: string;
  unitId: string;
}

export interface UnassignOfficerOrder {
  officerId: string;
}

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
    createWeaponDesigns: [],
    retireWeaponDesigns: [],
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
    hireGenerals: [],
    assignOfficers: [],
    unassignOfficers: [],
    createArmies: [],
    lettersSent: [],
    tradeProposals: [],
    tradeCancellations: [],
    newSettlements: [],
  };
}
