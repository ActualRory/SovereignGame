/**
 * Deterministic combat engine.
 * Pure function — no DB, no side effects.
 * Uses seeded PRNG so combats can be replayed on the client.
 */

import type { UnitType, UnitState, Veterancy, UnitPosition, ShipType, ShipState } from '../types/military.js';
import type { TerrainType } from '../types/map.js';
import type {
  CombatResult, CombatRound, DiceRoll,
  CombatCasualty, MoraleCheck, UnitLossSummary,
} from '../types/combat.js';
import { UNITS, VETERANCY_BONUS, UNIT_STATE_THRESHOLDS, STATE_DICE_MULTIPLIER } from '../constants/units.js';
import { TERRAIN } from '../constants/terrain.js';
import { SHIPS, type ShipStats } from '../constants/ships.js';
import {
  DICE_SIDES, MAX_COMBAT_ROUNDS,
  COMMAND_BONUS_PER_POINT, COMMAND_WIDTH_PER_2_POINTS,
  MANEUVER_WARFARE_WIDTH_BONUS, MODERN_DOCTRINE_BONUS,
} from '../constants/combat.js';

// ── Seeded PRNG (mulberry32) ──

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rollD20(rng: () => number): number {
  return Math.floor(rng() * DICE_SIDES) + 1;
}

// ── Combat unit snapshot (mutable during combat) ──

interface CombatUnit {
  id: string;
  type: UnitType;
  position: UnitPosition;
  strengthPct: number;
  state: UnitState;
  veterancy: Veterancy;
  xp: number;
  startStrength: number; // snapshot for loss summary
  isBroken: boolean;     // fled the battlefield
}

// ── Public API ──

export interface CombatInput {
  id: string;
  seed: number;
  terrain: TerrainType;
  riverCrossing: boolean;

  attacker: ArmySide;
  defender: ArmySide;

  // Tech flags
  attackerHasManeuverWarfare?: boolean;
  defenderHasManeuverWarfare?: boolean;
  attackerHasModernDoctrine?: boolean;
  defenderHasModernDoctrine?: boolean;
}

export interface ArmySide {
  armyId: string;
  commandRating: number; // general's rating, 0 if no general
  units: CombatUnitInput[];
}

export interface CombatUnitInput {
  id: string;
  type: UnitType;
  position: UnitPosition;
  strengthPct: number;
  state: UnitState;
  veterancy: Veterancy;
  xp: number;
}

/**
 * Resolve a field battle between two armies.
 * Fully deterministic given the seed.
 */
export function resolveCombat(input: CombatInput): CombatResult {
  const rng = mulberry32(input.seed);

  // Build mutable combat units
  const attackers: CombatUnit[] = input.attacker.units
    .filter(u => u.state !== 'destroyed')
    .map(u => ({ ...u, startStrength: u.strengthPct, isBroken: false }));

  const defenders: CombatUnit[] = input.defender.units
    .filter(u => u.state !== 'destroyed')
    .map(u => ({ ...u, startStrength: u.strengthPct, isBroken: false }));

  const terrainStats = TERRAIN[input.terrain];
  const baseFrontlineWidth = terrainStats.frontlineWidth;
  const defenceBonus = terrainStats.defenceBonus + (input.riverCrossing ? 1 : 0);

  // Frontline width calculation
  const attackerWidth = calcFrontlineWidth(
    baseFrontlineWidth,
    input.attacker.commandRating,
    input.attackerHasManeuverWarfare ?? false,
  );
  const defenderWidth = calcFrontlineWidth(
    baseFrontlineWidth,
    input.defender.commandRating,
    input.defenderHasManeuverWarfare ?? false,
  );

  const rounds: CombatRound[] = [];

  for (let roundNum = 1; roundNum <= MAX_COMBAT_ROUNDS; roundNum++) {
    const activeAttackers = attackers.filter(u => u.strengthPct > 0 && !u.isBroken);
    const activeDefenders = defenders.filter(u => u.strengthPct > 0 && !u.isBroken);

    if (activeAttackers.length === 0 || activeDefenders.length === 0) break;

    // Assign positions for this round
    const atkFront = assignFrontline(activeAttackers, attackerWidth);
    const atkBack = activeAttackers.filter(u => u.position === 'backline' && !atkFront.includes(u));
    const atkFlank = activeAttackers.filter(u => u.position === 'flank' && !atkFront.includes(u));

    const defFront = assignFrontline(activeDefenders, defenderWidth);
    const defBack = activeDefenders.filter(u => u.position === 'backline' && !defFront.includes(u));
    const defFlank = activeDefenders.filter(u => u.position === 'flank' && !defFront.includes(u));

    // Flanking: if attacker frontline wider than defender, flank units attack backline
    const atkFlanking = atkFront.length > defFront.length;
    const defFlanking = defFront.length > atkFront.length;

    const fireRolls: DiceRoll[] = [];
    const shockRolls: DiceRoll[] = [];
    const casualties: CombatCasualty[] = [];
    const moraleChecks: MoraleCheck[] = [];

    // ── Fire Phase ──
    // Backline + flank units fire at enemy frontline
    // Frontline units also get fire dice (some melee units have fire stat)
    const atkFireUnits = [...atkBack, ...atkFlank, ...atkFront];
    const defFireUnits = [...defBack, ...defFlank, ...defFront];

    const atkFireDamage = resolvePhase(
      'fire', atkFireUnits, activeDefenders, defFront,
      input.attacker.commandRating, 0,
      input.attackerHasModernDoctrine ?? false,
      rng, fireRolls, 'attacker',
    );

    const defFireDamage = resolvePhase(
      'fire', defFireUnits, activeAttackers, atkFront,
      input.defender.commandRating, defenceBonus,
      input.defenderHasModernDoctrine ?? false,
      rng, fireRolls, 'defender',
    );

    // Apply fire damage simultaneously
    applyDamage(atkFireDamage, activeDefenders, defFront, atkFlanking ? defBack : [], casualties, 'defender');
    applyDamage(defFireDamage, activeAttackers, atkFront, defFlanking ? atkBack : [], casualties, 'attacker');

    // ── Shock Phase ──
    // Only frontline + flank units participate in shock
    const atkShockUnits = [...atkFront, ...atkFlank];
    const defShockUnits = [...defFront, ...defFlank];

    const atkShockDamage = resolvePhase(
      'shock', atkShockUnits, activeDefenders, defFront,
      input.attacker.commandRating, 0,
      input.attackerHasModernDoctrine ?? false,
      rng, shockRolls, 'attacker',
    );

    const defShockDamage = resolvePhase(
      'shock', defShockUnits, activeAttackers, atkFront,
      input.defender.commandRating, defenceBonus,
      input.defenderHasModernDoctrine ?? false,
      rng, shockRolls, 'defender',
    );

    applyDamage(atkShockDamage, activeDefenders, defFront, atkFlanking ? defBack : [], casualties, 'defender');
    applyDamage(defShockDamage, activeAttackers, atkFront, defFlanking ? atkBack : [], casualties, 'attacker');

    // ── Morale Checks ──
    // Units that took damage this round check morale
    for (const cas of casualties) {
      const side = cas.side;
      const pool = side === 'attacker' ? attackers : defenders;
      const unit = pool.find(u => u.id === cas.unitId);
      if (!unit || unit.isBroken || unit.strengthPct <= 0) continue;

      const stats = UNITS[unit.type];
      const moraleThreshold = stats.morale + (VETERANCY_BONUS[unit.veterancy] ?? 0);
      const roll = rollD20(rng);
      const passed = roll <= moraleThreshold;

      moraleChecks.push({
        unitId: unit.id,
        side,
        roll,
        threshold: moraleThreshold,
        passed,
      });

      if (!passed && unit.state === 'broken') {
        // Broken units that fail morale flee
        unit.isBroken = true;
      }
    }

    rounds.push({ roundNumber: roundNum, firePhase: fireRolls, shockPhase: shockRolls, casualties, moraleChecks });

    // Check if combat ends
    const remainingAttackers = attackers.filter(u => u.strengthPct > 0 && !u.isBroken);
    const remainingDefenders = defenders.filter(u => u.strengthPct > 0 && !u.isBroken);
    if (remainingAttackers.length === 0 || remainingDefenders.length === 0) break;
  }

  // ── Determine winner ──
  const atkAlive = attackers.filter(u => u.strengthPct > 0 && !u.isBroken);
  const defAlive = defenders.filter(u => u.strengthPct > 0 && !u.isBroken);

  let winner: 'attacker' | 'defender' | 'draw';
  if (atkAlive.length === 0 && defAlive.length === 0) winner = 'draw';
  else if (atkAlive.length === 0) winner = 'defender';
  else if (defAlive.length === 0) winner = 'attacker';
  else winner = 'draw'; // max rounds reached

  // ── XP & Veterancy ──
  const xpForWinning = 20;
  const xpForSurviving = 10;
  const xpForLosing = 5;

  for (const unit of attackers) {
    if (unit.strengthPct > 0) {
      unit.xp += winner === 'attacker' ? xpForWinning : xpForSurviving;
    } else {
      unit.xp += xpForLosing;
    }
  }
  for (const unit of defenders) {
    if (unit.strengthPct > 0) {
      unit.xp += winner === 'defender' ? xpForWinning : xpForSurviving;
    } else {
      unit.xp += xpForLosing;
    }
  }

  // Build loss summaries
  const attackerLosses: UnitLossSummary[] = attackers.map(u => ({
    unitId: u.id,
    unitType: u.type,
    startStrength: u.startStrength,
    endStrength: u.strengthPct,
    destroyed: u.strengthPct <= 0,
    veterancyGained: calcVeterancyGained(u),
  }));

  const defenderLosses: UnitLossSummary[] = defenders.map(u => ({
    unitId: u.id,
    unitType: u.type,
    startStrength: u.startStrength,
    endStrength: u.strengthPct,
    destroyed: u.strengthPct <= 0,
    veterancyGained: calcVeterancyGained(u),
  }));

  return {
    id: input.id,
    seed: input.seed,
    attackerArmyId: input.attacker.armyId,
    defenderArmyId: input.defender.armyId,
    terrain: input.terrain,
    riverCrossing: input.riverCrossing,
    winner,
    rounds,
    attackerLosses,
    defenderLosses,
  };
}

// ── Siege assault variant ──

export function resolveSiegeAssault(input: CombatInput): CombatResult {
  // Siege: defender fires first (exclusively), then attacker fires, then attacker shock
  // We re-use the same engine but with modified phase ordering
  const rng = mulberry32(input.seed);

  const attackers: CombatUnit[] = input.attacker.units
    .filter(u => u.state !== 'destroyed')
    .map(u => ({ ...u, startStrength: u.strengthPct, isBroken: false }));

  const defenders: CombatUnit[] = input.defender.units
    .filter(u => u.state !== 'destroyed')
    .map(u => ({ ...u, startStrength: u.strengthPct, isBroken: false }));

  const terrainStats = TERRAIN[input.terrain];
  // Siege uses reduced frontline (fortress walls)
  const siegeWidth = 4;
  const defenceBonus = terrainStats.defenceBonus + 2; // walls give +2

  const attackerWidth = calcFrontlineWidth(
    siegeWidth, input.attacker.commandRating,
    input.attackerHasManeuverWarfare ?? false,
  );
  const defenderWidth = calcFrontlineWidth(
    siegeWidth, input.defender.commandRating,
    input.defenderHasManeuverWarfare ?? false,
  );

  const rounds: CombatRound[] = [];

  for (let roundNum = 1; roundNum <= MAX_COMBAT_ROUNDS; roundNum++) {
    const activeAttackers = attackers.filter(u => u.strengthPct > 0 && !u.isBroken);
    const activeDefenders = defenders.filter(u => u.strengthPct > 0 && !u.isBroken);
    if (activeAttackers.length === 0 || activeDefenders.length === 0) break;

    const atkFront = assignFrontline(activeAttackers, attackerWidth);
    const defFront = assignFrontline(activeDefenders, defenderWidth);
    const defBack = activeDefenders.filter(u => u.position === 'backline' && !defFront.includes(u));

    const fireRolls: DiceRoll[] = [];
    const shockRolls: DiceRoll[] = [];
    const casualties: CombatCasualty[] = [];
    const moraleChecks: MoraleCheck[] = [];

    // Phase 1: Defender fires (only)
    const defFireUnits = [...defBack, ...defFront];
    const defFireDamage = resolvePhase(
      'fire', defFireUnits, activeAttackers, atkFront,
      input.defender.commandRating, defenceBonus,
      input.defenderHasModernDoctrine ?? false,
      rng, fireRolls, 'defender',
    );
    applyDamage(defFireDamage, activeAttackers, atkFront, [], casualties, 'attacker');

    // Phase 2: Attacker fires
    const atkBack = activeAttackers.filter(u => u.position === 'backline' && !atkFront.includes(u));
    const atkFireUnits = [...atkBack, ...atkFront];
    const atkFireDamage = resolvePhase(
      'fire', atkFireUnits, activeDefenders, defFront,
      input.attacker.commandRating, 0,
      input.attackerHasModernDoctrine ?? false,
      rng, fireRolls, 'attacker',
    );
    applyDamage(atkFireDamage, activeDefenders, defFront, [], casualties, 'defender');

    // Phase 3: Attacker shock
    const atkShockUnits = atkFront.filter(u => u.strengthPct > 0);
    const atkShockDamage = resolvePhase(
      'shock', atkShockUnits, activeDefenders, defFront,
      input.attacker.commandRating, 0,
      input.attackerHasModernDoctrine ?? false,
      rng, shockRolls, 'attacker',
    );
    applyDamage(atkShockDamage, activeDefenders, defFront, [], casualties, 'defender');

    // Morale checks
    for (const cas of casualties) {
      const pool = cas.side === 'attacker' ? attackers : defenders;
      const unit = pool.find(u => u.id === cas.unitId);
      if (!unit || unit.isBroken || unit.strengthPct <= 0) continue;
      const stats = UNITS[unit.type];
      const moraleThreshold = stats.morale + (VETERANCY_BONUS[unit.veterancy] ?? 0);
      const roll = rollD20(rng);
      moraleChecks.push({ unitId: unit.id, side: cas.side, roll, threshold: moraleThreshold, passed: roll <= moraleThreshold });
      if (roll > moraleThreshold && unit.state === 'broken') unit.isBroken = true;
    }

    rounds.push({ roundNumber: roundNum, firePhase: fireRolls, shockPhase: shockRolls, casualties, moraleChecks });

    const remainingAtk = attackers.filter(u => u.strengthPct > 0 && !u.isBroken);
    const remainingDef = defenders.filter(u => u.strengthPct > 0 && !u.isBroken);
    if (remainingAtk.length === 0 || remainingDef.length === 0) break;
  }

  const atkAlive = attackers.filter(u => u.strengthPct > 0 && !u.isBroken);
  const defAlive = defenders.filter(u => u.strengthPct > 0 && !u.isBroken);
  let winner: 'attacker' | 'defender' | 'draw';
  if (atkAlive.length === 0 && defAlive.length === 0) winner = 'draw';
  else if (atkAlive.length === 0) winner = 'defender';
  else if (defAlive.length === 0) winner = 'attacker';
  else winner = 'defender'; // siege: defender wins if not broken through

  const xpW = 20, xpS = 10, xpL = 5;
  for (const u of attackers) u.xp += u.strengthPct > 0 ? (winner === 'attacker' ? xpW : xpS) : xpL;
  for (const u of defenders) u.xp += u.strengthPct > 0 ? (winner === 'defender' ? xpW : xpS) : xpL;

  return {
    id: input.id, seed: input.seed,
    attackerArmyId: input.attacker.armyId,
    defenderArmyId: input.defender.armyId,
    terrain: input.terrain, riverCrossing: input.riverCrossing,
    winner, rounds,
    attackerLosses: attackers.map(u => ({ unitId: u.id, unitType: u.type, startStrength: u.startStrength, endStrength: u.strengthPct, destroyed: u.strengthPct <= 0, veterancyGained: calcVeterancyGained(u) })),
    defenderLosses: defenders.map(u => ({ unitId: u.id, unitType: u.type, startStrength: u.startStrength, endStrength: u.strengthPct, destroyed: u.strengthPct <= 0, veterancyGained: calcVeterancyGained(u) })),
  };
}

// ── Helpers ──

function calcFrontlineWidth(base: number, commandRating: number, hasManeuverWarfare: boolean): number {
  let width = base;
  width += Math.floor(commandRating / 2) * COMMAND_WIDTH_PER_2_POINTS;
  if (hasManeuverWarfare) width += MANEUVER_WARFARE_WIDTH_BONUS;
  return width;
}

/** Assign units to the frontline, preferring frontline-positioned units first. */
function assignFrontline(units: CombatUnit[], maxWidth: number): CombatUnit[] {
  const front: CombatUnit[] = [];
  // Priority: frontline → flank → backline
  const sorted = [...units].sort((a, b) => {
    const order: Record<string, number> = { frontline: 0, flank: 1, backline: 2 };
    return (order[a.position] ?? 1) - (order[b.position] ?? 1);
  });

  for (const unit of sorted) {
    if (front.length >= maxWidth) break;
    if (unit.position !== 'backline') {
      front.push(unit);
    }
  }

  // If frontline not full and we have backline units, draft them
  if (front.length < maxWidth) {
    for (const unit of sorted) {
      if (front.length >= maxWidth) break;
      if (!front.includes(unit)) {
        front.push(unit);
      }
    }
  }

  return front;
}

function resolvePhase(
  phase: 'fire' | 'shock',
  attackingUnits: CombatUnit[],
  _allDefenders: CombatUnit[],
  defenderFrontline: CombatUnit[],
  commandRating: number,
  terrainBonus: number,
  hasModernDoctrine: boolean,
  rng: () => number,
  rolls: DiceRoll[],
  side: 'attacker' | 'defender',
): number {
  let totalDamage = 0;

  for (const unit of attackingUnits) {
    if (unit.strengthPct <= 0 || unit.isBroken) continue;

    const stats = UNITS[unit.type];
    const baseDice = phase === 'fire' ? stats.fire : stats.shock;
    if (baseDice === 0) continue;

    const stateMultiplier = STATE_DICE_MULTIPLIER[unit.state] ?? 1;
    const numDice = Math.max(1, Math.round(baseDice * stateMultiplier));

    const vetBonus = VETERANCY_BONUS[unit.veterancy] ?? 0;
    const bonus = (commandRating * COMMAND_BONUS_PER_POINT)
      + (side === 'defender' ? terrainBonus : 0)
      + (hasModernDoctrine ? MODERN_DOCTRINE_BONUS : 0);
    const threshold = stats.hitsOn - vetBonus; // lower is better for attacker

    const dice: number[] = [];
    let successes = 0;
    for (let i = 0; i < numDice; i++) {
      const roll = rollD20(rng);
      dice.push(roll);
      if (roll + bonus >= threshold) successes++;
    }

    // Armour reduction: target frontline average armour minus AP
    const targetArmour = defenderFrontline.length > 0
      ? Math.max(0, avgArmour(defenderFrontline) - stats.ap)
      : 0;
    const netHits = Math.max(0, successes - Math.round(targetArmour));

    rolls.push({
      unitId: unit.id,
      unitType: unit.type,
      phase,
      dice,
      bonus,
      threshold,
      successes,
      armourReduction: Math.round(targetArmour),
      netHits,
    });

    totalDamage += netHits;
  }

  return totalDamage;
}

function avgArmour(units: CombatUnit[]): number {
  if (units.length === 0) return 0;
  const total = units.reduce((sum, u) => sum + UNITS[u.type].armour, 0);
  return total / units.length;
}

function applyDamage(
  totalDamage: number,
  allEnemies: CombatUnit[],
  frontline: CombatUnit[],
  backline: CombatUnit[],
  casualties: CombatCasualty[],
  side: 'attacker' | 'defender',
) {
  if (totalDamage <= 0) return;

  // Distribute damage: primarily to frontline, flanking hits backline
  const targets = frontline.filter(u => u.strengthPct > 0);
  const flankTargets = backline.filter(u => u.strengthPct > 0);

  // Split: 80% frontline, 20% flanking backline (if flanking)
  const frontDamage = flankTargets.length > 0 ? Math.ceil(totalDamage * 0.8) : totalDamage;
  const flankDamage = flankTargets.length > 0 ? totalDamage - frontDamage : 0;

  distributeDamage(frontDamage, targets, casualties, side);
  distributeDamage(flankDamage, flankTargets, casualties, side);
}

function distributeDamage(
  damage: number,
  targets: CombatUnit[],
  casualties: CombatCasualty[],
  side: 'attacker' | 'defender',
) {
  if (targets.length === 0 || damage <= 0) return;

  // Each net hit = ~5% strength loss, spread evenly
  const damagePerUnit = damage / targets.length;
  const pctPerHit = 5;

  for (const unit of targets) {
    const pctLoss = Math.round(damagePerUnit * pctPerHit);
    if (pctLoss <= 0) continue;

    const oldStrength = unit.strengthPct;
    unit.strengthPct = Math.max(0, unit.strengthPct - pctLoss);
    unit.state = getUnitState(unit.strengthPct);

    casualties.push({
      unitId: unit.id,
      side,
      damageDealt: pctLoss,
      newStrengthPct: unit.strengthPct,
      newState: unit.state,
    });
  }
}

function getUnitState(strengthPct: number): UnitState {
  if (strengthPct <= 0) return 'destroyed';
  if (strengthPct < UNIT_STATE_THRESHOLDS.depleted) return 'broken';
  if (strengthPct < UNIT_STATE_THRESHOLDS.full) return 'depleted';
  return 'full';
}

const VETERANCY_ORDER: Veterancy[] = ['fresh', 'regular', 'veteran', 'elite', 'legend'];
const XP_THRESHOLDS: Record<Veterancy, number> = {
  fresh: 0,
  regular: 30,
  veteran: 80,
  elite: 150,
  legend: 250,
};

function calcVeterancyGained(unit: CombatUnit): number {
  const currentIdx = VETERANCY_ORDER.indexOf(unit.veterancy);
  let gained = 0;
  let vet = unit.veterancy;
  let idx = currentIdx;

  while (idx < VETERANCY_ORDER.length - 1) {
    const nextVet = VETERANCY_ORDER[idx + 1];
    if (unit.xp >= XP_THRESHOLDS[nextVet]) {
      vet = nextVet;
      idx++;
      gained++;
    } else {
      break;
    }
  }

  // Update the unit's veterancy
  unit.veterancy = vet;
  return gained;
}

// ── Naval combat (simplified: 2 fire phases, no shock) ──

export interface NavalCombatInput {
  id: string;
  seed: number;
  terrain: TerrainType;

  attacker: NavalSide;
  defender: NavalSide;

  attackerHasModernDoctrine?: boolean;
  defenderHasModernDoctrine?: boolean;
}

export interface NavalSide {
  fleetId: string;
  commandRating: number;
  ships: NavalShipInput[];
}

export interface NavalShipInput {
  id: string;
  type: ShipType;
  hullCurrent: number;
  hullMax: number;
  state: ShipState;
  veterancy: Veterancy;
  xp: number;
}

interface CombatShip {
  id: string;
  type: ShipType;
  hullCurrent: number;
  hullMax: number;
  state: ShipState;
  veterancy: Veterancy;
  xp: number;
  startHull: number;
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

export interface NavalCombatRound {
  roundNumber: number;
  fire1: DiceRoll[];
  fire2: DiceRoll[];
  casualties: NavalCasualty[];
}

export interface NavalCasualty {
  shipId: string;
  side: 'attacker' | 'defender';
  hullDamage: number;
  newHullPct: number;
  newState: string;
}

export interface NavalLossSummary {
  shipId: string;
  shipType: ShipType;
  startHull: number;
  endHull: number;
  sunk: boolean;
}

export function resolveNavalCombat(input: NavalCombatInput): NavalCombatResult {
  const rng = mulberry32(input.seed);

  const attackers: CombatShip[] = input.attacker.ships
    .filter(s => s.state !== 'sunk')
    .map(s => ({ ...s, startHull: s.hullCurrent }));

  const defenders: CombatShip[] = input.defender.ships
    .filter(s => s.state !== 'sunk')
    .map(s => ({ ...s, startHull: s.hullCurrent }));

  const rounds: NavalCombatRound[] = [];

  for (let roundNum = 1; roundNum <= MAX_COMBAT_ROUNDS; roundNum++) {
    const activeAtk = attackers.filter(s => s.hullCurrent > 0);
    const activeDef = defenders.filter(s => s.hullCurrent > 0);
    if (activeAtk.length === 0 || activeDef.length === 0) break;

    const fire1: DiceRoll[] = [];
    const fire2: DiceRoll[] = [];
    const casualties: NavalCasualty[] = [];

    // Fire phase 1 — simultaneous
    const atkDmg1 = resolveNavalFire(activeAtk, activeDef, input.attacker.commandRating, input.attackerHasModernDoctrine ?? false, rng, fire1, 'attacker');
    const defDmg1 = resolveNavalFire(activeDef, activeAtk, input.defender.commandRating, input.defenderHasModernDoctrine ?? false, rng, fire1, 'defender');

    applyNavalDamage(atkDmg1, activeDef, casualties, 'defender');
    applyNavalDamage(defDmg1, activeAtk, casualties, 'attacker');

    // Fire phase 2 — simultaneous
    const stillAtk = attackers.filter(s => s.hullCurrent > 0);
    const stillDef = defenders.filter(s => s.hullCurrent > 0);

    const atkDmg2 = resolveNavalFire(stillAtk, stillDef, input.attacker.commandRating, input.attackerHasModernDoctrine ?? false, rng, fire2, 'attacker');
    const defDmg2 = resolveNavalFire(stillDef, stillAtk, input.defender.commandRating, input.defenderHasModernDoctrine ?? false, rng, fire2, 'defender');

    applyNavalDamage(atkDmg2, stillDef, casualties, 'defender');
    applyNavalDamage(defDmg2, stillAtk, casualties, 'attacker');

    rounds.push({ roundNumber: roundNum, fire1, fire2, casualties });

    if (attackers.filter(s => s.hullCurrent > 0).length === 0 ||
        defenders.filter(s => s.hullCurrent > 0).length === 0) break;
  }

  const atkAlive = attackers.filter(s => s.hullCurrent > 0);
  const defAlive = defenders.filter(s => s.hullCurrent > 0);
  let winner: 'attacker' | 'defender' | 'draw';
  if (atkAlive.length === 0 && defAlive.length === 0) winner = 'draw';
  else if (atkAlive.length === 0) winner = 'defender';
  else if (defAlive.length === 0) winner = 'attacker';
  else winner = 'draw';

  return {
    id: input.id, seed: input.seed,
    attackerFleetId: input.attacker.fleetId,
    defenderFleetId: input.defender.fleetId,
    winner, rounds,
    attackerLosses: attackers.map(s => ({ shipId: s.id, shipType: s.type, startHull: s.startHull, endHull: s.hullCurrent, sunk: s.hullCurrent <= 0 })),
    defenderLosses: defenders.map(s => ({ shipId: s.id, shipType: s.type, startHull: s.startHull, endHull: s.hullCurrent, sunk: s.hullCurrent <= 0 })),
  };
}

function resolveNavalFire(
  attackingShips: CombatShip[],
  _targetShips: CombatShip[],
  commandRating: number,
  hasModernDoctrine: boolean,
  rng: () => number,
  rolls: DiceRoll[],
  side: 'attacker' | 'defender',
): number {
  let totalDamage = 0;
  for (const ship of attackingShips) {
    if (ship.hullCurrent <= 0) continue;
    const stats = SHIPS[ship.type];
    if (!stats) continue;
    const baseDice = stats.fire;
    if (baseDice === 0) continue;

    // Hull-based dice reduction
    const hullPct = ship.hullCurrent / ship.hullMax;
    const multiplier = hullPct > 0.5 ? 1.0 : hullPct > 0.25 ? 0.6 : 0.3;
    const numDice = Math.max(1, Math.round(baseDice * multiplier));

    const vetBonus = VETERANCY_BONUS[ship.veterancy] ?? 0;
    const bonus = (commandRating * COMMAND_BONUS_PER_POINT)
      + (hasModernDoctrine ? MODERN_DOCTRINE_BONUS : 0);
    const threshold = stats.hitsOn - vetBonus;

    const dice: number[] = [];
    let successes = 0;
    for (let i = 0; i < numDice; i++) {
      const roll = rollD20(rng);
      dice.push(roll);
      if (roll + bonus >= threshold) successes++;
    }

    rolls.push({
      unitId: ship.id,
      unitType: ship.type as any,
      phase: 'fire',
      dice, bonus, threshold, successes,
      armourReduction: 0,
      netHits: successes,
    });

    totalDamage += successes;
  }
  return totalDamage;
}

function applyNavalDamage(
  totalDamage: number,
  targets: CombatShip[],
  casualties: NavalCasualty[],
  side: 'attacker' | 'defender',
) {
  if (totalDamage <= 0 || targets.length === 0) return;
  const dmgPerShip = totalDamage / targets.length;

  for (const ship of targets) {
    if (ship.hullCurrent <= 0) continue;
    const hullLoss = Math.round(dmgPerShip);
    if (hullLoss <= 0) continue;
    ship.hullCurrent = Math.max(0, ship.hullCurrent - hullLoss);
    const hullPct = ship.hullCurrent / ship.hullMax;
    ship.state = hullPct <= 0 ? 'sunk' : hullPct <= 0.25 ? 'crippled' : hullPct <= 0.5 ? 'damaged' : 'intact';

    casualties.push({
      shipId: ship.id, side,
      hullDamage: hullLoss,
      newHullPct: Math.round(hullPct * 100),
      newState: ship.state,
    });
  }
}
