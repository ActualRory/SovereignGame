// ─── Nobles ───

// ── Branch & Ranks ──

export type NobleBranch = 'army' | 'navy';

export type ArmyRank = 'captain' | 'major' | 'colonel' | 'brigadier' | 'general';
export type NavyRank = 'lieutenant' | 'commander' | 'captain_navy' | 'commodore' | 'admiral';
export type NobleRank = ArmyRank | NavyRank;

// ── Traits ──

export type NobleTraitKey =
  | 'infantry_commander' | 'cavalry_commander' | 'naval_commander'
  | 'administrator' | 'fire' | 'shock' | 'maneuver';
  // espionage deferred

/** Trait ranks, each 0-5. 0 = untrained. */
export type NobleTraits = Record<NobleTraitKey, number>;

export const EMPTY_NOBLE_TRAITS: NobleTraits = {
  infantry_commander: 0,
  cavalry_commander: 0,
  naval_commander: 0,
  administrator: 0,
  fire: 0,
  shock: 0,
  maneuver: 0,
};

// ── Assignment ──

export type NobleAssignmentType =
  | 'unassigned'
  | 'army_ic' | 'army_2ic'
  | 'unit_ic' | 'unit_2ic'
  | 'ship_ic' | 'ship_2ic'
  | 'fleet_ic' | 'fleet_2ic'
  | 'governor';

// ── Noble ──

export interface Noble {
  id: string;
  gameId: string;
  ownerId: string;

  // Identity
  name: string;
  familyId: string | null;
  age: number;
  /** Game turn the noble was created on. Used with MINOR_TURNS_PER_YEAR for aging. */
  birthTurn: number;
  branch: NobleBranch;
  rank: NobleRank;
  /** Player-assigned honourary title, e.g. "Duke of Ashenvale". */
  title: string | null;
  /** Settlement where the noble was born / hired. */
  birthSettlementId: string | null;

  // Stats (1-10)
  martial: number;
  intelligence: number;
  cunning: number;

  // Traits (0-5 per key)
  traits: NobleTraits;

  // Progression
  xp: number;
  /** Minor turns spent at current rank. Used for promotion prerequisites. */
  turnsInRank: number;

  // Assignment (denormalized for fast lookups)
  assignmentType: NobleAssignmentType;
  /** Primary entity: army/unit/ship/fleet/settlement ID. Null when unassigned. */
  assignedEntityId: string | null;
  /** Secondary entity: army ID when assigned to a unit within an army. Null otherwise. */
  assignedSecondaryId: string | null;

  // Prisoner state
  /** If captured, the player ID of the captor. Null if free. */
  captorPlayerId: string | null;

  isAlive: boolean;
  createdAt: string;
}

// ── Family ──

export interface NobleFamily {
  id: string;
  gameId: string;
  ownerId: string;
  surname: string;
  /** Accumulated reputation from noble achievements. */
  reputation: number;
}

// ── Combat bonus (output of noble-combat.ts) ──

export interface NobleCombatBonus {
  fireBonus: number;
  shockBonus: number;
  widthBonus: number;
  /** Higher maneuver → flanking priority. */
  flankPriority: number;
  /** Maneuver-based retreat casualty reduction (fraction, e.g. 0.1 per rank). */
  retreatReduction: number;
}
