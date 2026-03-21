// ─── Military ───

import type { HexCoord } from './map.js';
import type { WeaponType } from '../constants/weapons.js';
import type { ShieldType } from '../constants/shields.js';
import type { ArmourType } from '../constants/armour.js';
import type { MountType, MountBreed } from '../constants/mounts.js';

// ── Unit Template ──

/** A nation-wide reusable unit design. Any army can recruit from it. */
export interface UnitTemplate {
  id: string;
  gameId: string;
  playerId: string;
  name: string;
  /** If true, requires no equipment and uses weak base stats. Available to all from turn 1. */
  isIrregular: boolean;
  /** Mounted units use squadrons (50 men each); infantry use companies (100 men each). */
  isMounted: boolean;
  /** 1-5 companies (infantry) or 1-5 squadrons (mounted). */
  companiesOrSquadrons: 1 | 2 | 3 | 4 | 5;
  /** Primary weapon (full stats). Null for irregulars. */
  primary: WeaponType | null;
  /**
   * Secondary hand item (50% stat contribution).
   * Can be a 1H/versatile weapon or a shield.
   * Must be null if primary is 2H.
   */
  secondary: WeaponType | ShieldType | null;
  /**
   * Sidearm slot (25% stat contribution).
   * Must be a 1H weapon. Cannot be a shield.
   * Always available regardless of primary handedness.
   */
  sidearm: WeaponType | null;
  /** Optional armour. */
  armour: ArmourType | null;
  /** Optional mount type. Only valid when isMounted = true. */
  mount: MountType | null;
  /** Active weapon design for the primary slot. */
  primaryDesignId: string | null;
  /** Active weapon/shield design for the secondary slot. */
  secondaryDesignId: string | null;
  /** Active weapon design for the sidearm slot. */
  sidearmDesignId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Weapon Design ──

export type WeaponDesignStatus = 'developing' | 'ready' | 'retired';

/**
 * A named variant of an unlocked base weapon with bounded stat tradeoffs.
 *
 * Creating a design requires a gold cost and a development phase (turnsRemaining > 0).
 * During development the design is not yet usable. This prevents spamming designs.
 * There is no building requirement — any player can design weapons they have unlocked.
 */
export interface WeaponDesign {
  id: string;
  gameId: string;
  playerId: string;
  /** The base weapon or shield this design modifies. */
  baseWeapon: WeaponType | ShieldType;
  /** Player-chosen name, e.g. "Light Rifle" or "Heavy Crossbow". */
  name: string;
  /** Stat modifications applied on top of the base weapon's stats. Values sum to zero. */
  statModifiers: Partial<{
    fire: number;
    shock: number;
    defence: number;
    morale: number;
    ap: number;
    armour: number;
  }>;
  /**
   * Production cost multiplier adjustment. Range: -0.3 to +0.3.
   * Negative = cheaper, positive = more expensive.
   */
  costModifier: number;
  /** Status: 'developing' until turnsRemaining reaches 0, then 'ready'. */
  status: WeaponDesignStatus;
  /** Turns remaining in the development phase. 0 = ready to use. */
  turnsRemaining: number;
  createdAt: string;
}

// ── Troop Composition ──

/** Individual troop counts by experience tier within a unit. */
export interface TroopCounts {
  rookie: number;
  capable: number;
  veteran: number;
}

/** Equipment held by a unit (not in settlement storage). Returned on disband; capturable on defeat. */
export interface HeldEquipment {
  primary: number;    // quantity of primary weapon items
  secondary: number;  // quantity of secondary hand items (weapon or shield)
  sidearm: number;    // quantity of sidearm items (25% slot)
  armour: number;     // quantity of armour items
  mounts: number;     // quantity of mount animals
}

// ── Unit ──

export type UnitState = 'full' | 'depleted' | 'broken' | 'destroyed';
export type UnitPosition = 'frontline' | 'backline' | 'flank';

export interface Unit {
  id: string;
  armyId: string;
  /** References a UnitTemplate. The template defines equipment and size. */
  templateId: string;
  name: string | null;
  subtitle: string | null;
  troopCounts: TroopCounts;
  state: UnitState;
  xp: number;
  position: UnitPosition;
  isRecruiting: boolean;
  /** True if the unit's template has been updated since this unit was raised. */
  isOutdated: boolean;
  /** Equipment currently held by this unit (moved from storage on raise). */
  heldEquipment: HeldEquipment;
  /**
   * Breed of mounts in this unit (if mounted).
   * Inherited from the hex at the time of drafting.
   */
  mountBreed: MountBreed | null;
}

// ── Ships (unchanged) ──

export type ShipType =
  // Early
  | 'sloop' | 'brig'
  // Middle
  | 'frigate' | 'transport'
  // Late
  | 'third_rate' | 'second_rate' | 'first_rate';

export type ShipState = 'intact' | 'damaged' | 'crippled' | 'sunk';

export interface Ship {
  id: string;
  fleetId: string;
  type: ShipType;
  name: string | null;
  subtitle: string | null;
  hullCurrent: number;
  hullMax: number;
  state: ShipState;
  /** Crew experience tiers. Weighted average reduces hitsOn during combat. */
  crewCounts: TroopCounts;
  xp: number;
}

// ── Officer / General ──

export type OfficerRank = 'major' | 'colonel' | 'general';

export interface General {
  id: string;
  gameId: string;
  ownerId: string;
  name: string;
  commandRating: number; // 1-10
  xp: number;
  isAdmiral: boolean;
  /** Rank determines eligibility: Major+ can be assigned to a unit; Colonel+ to an army. */
  rank: OfficerRank;
  /** Unit this officer is assigned to. Null = in officer pool (unassigned). */
  assignedUnitId: string | null;
}

// ── Army ──

export interface Army {
  id: string;
  gameId: string;
  ownerId: string;
  name: string;
  hexQ: number;
  hexR: number;
  generalId: string | null;
  supplyBank: number;
  movementPath: HexCoord[] | null;
  isNaval: boolean;
  units: Unit[];
}

export interface Fleet {
  id: string;
  gameId: string;
  ownerId: string;
  name: string;
  hexQ: number;
  hexR: number;
  admiralId: string | null;
  supplyBank: number;
  movementPath: HexCoord[] | null;
  ships: Ship[];
}

// ── Settlement draft pools ──

/** Manpower and mount pools held at a settlement, available for unit raising. */
export interface SettlementMilitaryPool {
  settlementId: string;
  /** Recruits drafted from local population. */
  draftedRecruits: number;
  /** Horses moved from storage to the mount pool. Cost gold maintenance per turn. */
  draftedHorses: number;
  /** Gryphons moved from storage to the mount pool. */
  draftedGryphons: number;
  /** Demigryphs bred from horses + gryphons. */
  draftedDemigryphs: number;
}

// ── Equipment Orders ──

import type { ResourceType } from './map.js';

export type EquipmentOrderStatus = 'active' | 'fulfilled' | 'cancelled';

/** A queued production order placed at an Arms Workshop or Armour Workshop. */
export interface EquipmentOrder {
  id: string;
  gameId: string;
  settlementId: string;
  playerId: string;
  /** The equipment type being produced. */
  equipmentType: ResourceType;
  quantityOrdered: number;
  quantityFulfilled: number;
  status: EquipmentOrderStatus;
  /** Controls throughput/cost tradeoff. relaxed = slower+cheaper, rush = faster+pricier. */
  priority: 'relaxed' | 'standard' | 'rush';
  createdAt: string;
}
