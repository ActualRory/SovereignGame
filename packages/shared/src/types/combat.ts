// ─── Combat ───

import type { ShipType, UnitPosition, UnitState } from './military.js';

/** Per-target breakdown within a single attacker's dice roll. */
export interface DiceRollTarget {
  targetUnitId: string;
  targetUnitName: string | null;
  diceCount: number;        // how many dice aimed at this target
  threshold: number;        // effective hitsOn (base + armour mod - AP mod)
  hits: number;             // dice that met threshold
}

export interface DiceRoll {
  unitId: string;
  /** Template name for display purposes. */
  unitName: string | null;
  phase: 'fire' | 'shock';
  dice: number[];          // raw d20 values
  bonus: number;           // general command + terrain + tech
  /** Base threshold before per-target armour/AP adjustments. */
  threshold: number;
  /** Total successes across all targets. */
  successes: number;
  /** Per-target hit breakdown (armour/AP baked into each target's threshold). */
  targets: DiceRollTarget[];
  /** Total hits after armour (sum of targets[].hits). Replaces old netHits. */
  netHits: number;
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
  troopsLost: number;
  newTroopCounts: { rookie: number; capable: number; veteran: number };
  newState: UnitState;
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
  templateId: string;
  unitName: string | null;
  startTroops: number;
  endTroops: number;
  endTroopCounts: { rookie: number; capable: number; veteran: number };
  destroyed: boolean;
  xpGained: number;
  /** Troop tier promotions after combat. */
  rookiesPromoted: number;
  capablePromoted: number;
}

// ── Naval (unchanged) ──

export interface NavalCasualty {
  shipId: string;
  side: 'attacker' | 'defender';
  hullDamage: number;
  newHullPct: number;
  newState: string;
  crewLost: number;
  newCrewCounts: { rookie: number; capable: number; veteran: number };
}

export interface NavalLossSummary {
  shipId: string;
  shipType: ShipType;
  startHull: number;
  endHull: number;
  sunk: boolean;
  startCrew: number;
  endCrew: number;
  endCrewCounts: { rookie: number; capable: number; veteran: number };
  rookiesPromoted: number;
  capablePromoted: number;
}

export interface NavalCombatRound {
  roundNumber: number;
  fire1: DiceRoll[];
  fire2: DiceRoll[];
  casualties: NavalCasualty[];
}

export interface NavalCombatResult {
  id: string;
  seed: number;
  attackerFleetId: string;
  defenderFleetId: string;
  winner: 'attacker' | 'defender' | 'draw';
  rounds: NavalCombatRound[];
  attackerLosses: NavalLossSummary[];
  defenderLosses: NavalLossSummary[];
}
