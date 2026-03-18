// ─── Combat ───

import type { UnitType, ShipType, Veterancy, UnitPosition } from './military.js';

export interface DiceRoll {
  unitId: string;
  unitType: UnitType | ShipType;
  phase: 'fire' | 'shock';
  dice: number[];          // raw d20 values
  bonus: number;           // general command + terrain + vet
  threshold: number;       // hits-on value
  successes: number;       // dice that met threshold after bonus
  armourReduction: number; // target armour minus AP
  netHits: number;         // successes - armour reduction (min 0)
}

export interface CombatRound {
  roundNumber: number;
  firePhase: DiceRoll[];
  shockPhase: DiceRoll[];
  casualties: CombatCasualty[];
  moraleChecks: MoraleCheck[];
}

export interface CombatCasualty {
  unitId: string;
  side: 'attacker' | 'defender';
  damageDealt: number;
  newStrengthPct: number;
  newState: string;
}

export interface MoraleCheck {
  unitId: string;
  side: 'attacker' | 'defender';
  roll: number;
  threshold: number;
  passed: boolean;
}

export interface CombatResult {
  id: string;
  seed: number;
  attackerArmyId: string;
  defenderArmyId: string;
  terrain: string;
  riverCrossing: boolean;
  winner: 'attacker' | 'defender' | 'draw';
  rounds: CombatRound[];
  attackerLosses: UnitLossSummary[];
  defenderLosses: UnitLossSummary[];
}

export interface UnitLossSummary {
  unitId: string;
  unitType: UnitType | ShipType;
  startStrength: number;
  endStrength: number;
  destroyed: boolean;
  veterancyGained: number;
}
