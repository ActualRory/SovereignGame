// ─── Military ───

import type { HexCoord } from './map.js';

export type UnitType =
  // Early
  | 'irregulars' | 'spearmen' | 'archers' | 'cavalry'
  // Middle
  | 'swordsmen' | 'crossbowmen' | 'men_at_arms' | 'knights'
  | 'griffin_riders' | 'griffin_knights'
  // Late
  | 'hussars' | 'riflemen' | 'dragoons';

export type ShipType =
  // Early
  | 'sloop' | 'brig'
  // Middle
  | 'frigate' | 'transport'
  // Late
  | 'third_rate' | 'second_rate' | 'first_rate';

export type UnitState = 'full' | 'depleted' | 'broken' | 'destroyed';
export type ShipState = 'intact' | 'damaged' | 'crippled' | 'sunk';

export type Veterancy = 'fresh' | 'regular' | 'veteran' | 'elite' | 'legend';

export type UnitPosition = 'frontline' | 'backline' | 'flank';

export interface Unit {
  id: string;
  armyId: string;
  type: UnitType;
  name: string | null;
  subtitle: string | null;
  strengthPct: number; // 0-100
  state: UnitState;
  veterancy: Veterancy;
  xp: number;
  position: UnitPosition;
  isRecruiting: boolean;
}

export interface Ship {
  id: string;
  fleetId: string;
  type: ShipType;
  name: string | null;
  subtitle: string | null;
  hullCurrent: number;
  hullMax: number;
  state: ShipState;
  veterancy: Veterancy;
  xp: number;
}

export interface General {
  id: string;
  gameId: string;
  ownerId: string;
  name: string;
  commandRating: number; // 1-10
  xp: number;
  isAdmiral: boolean;
}

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
