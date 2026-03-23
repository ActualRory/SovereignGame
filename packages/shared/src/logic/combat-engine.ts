/**
 * Deterministic combat engine.
 * Pure function — no DB, no side effects.
 * Uses seeded PRNG so combats can be replayed on the client.
 *
 * Unit stats are pre-computed by the caller (base stats + equipment modifiers).
 * The engine handles troop-tier casualty tracking (rookie → capable → veteran).
 */

import type { UnitState, UnitPosition, ShipType, ShipState } from '../types/military.js';
import type { TerrainType } from '../types/map.js';
import type {
  CombatResult, CombatRound, DiceRoll, DiceRollTarget,
  CombatCasualty, MoraleCheck, UnitLossSummary,
  NavalCombatResult, NavalCombatRound, NavalCasualty, NavalLossSummary,
} from '../types/combat.js';
import { getWeightedVeterancyModifier, UNIT_STATE_THRESHOLDS, STATE_DICE_MULTIPLIER, COMBAT_PROMOTION_RATE } from '../constants/units.js';
import { TERRAIN } from '../constants/terrain.js';
import { SHIPS, type ShipStats } from '../constants/ships.js';
import type { NobleCombatBonus } from '../types/noble.js';
import {
  DICE_SIDES, MAX_COMBAT_ROUNDS,
  MANEUVER_WARFARE_WIDTH_BONUS, MODERN_DOCTRINE_BONUS,
  DICE_MULTIPLIER, ARMOUR_HITSON_DIVISOR,
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

// ── Internal mutable combat unit ──

interface CombatUnit {
  id: string;
  templateId: string;
  name: string | null;
  position: UnitPosition;
  // Pre-computed stats
  fire: number;
  shock: number;
  defence: number;
  morale: number;
  armour: number;
  ap: number;
  hitsOn: number;       // base hitsOn before vet modifier
  // Troop composition (mutable during combat)
  troopCounts: { rookie: number; capable: number; veteran: number };
  maxTroops: number;
  state: UnitState;
  xp: number;
  startTroops: number;  // snapshot for loss summary
  isBroken: boolean;
}

// ── Public API ──

export interface CombatInput {
  id: string;
  seed: number;
  terrain: TerrainType;
  riverCrossing: boolean;

  attacker: ArmySide;
  defender: ArmySide;

  attackerHasManeuverWarfare?: boolean;
  defenderHasManeuverWarfare?: boolean;
  attackerHasModernDoctrine?: boolean;
  defenderHasModernDoctrine?: boolean;
}

export interface ArmySide {
  armyId: string;
  /** Noble-derived combat bonuses (replaces flat commandRating). */
  nobleBonus: NobleCombatBonus;
  /** Per-unit specialty dice bonus keyed by unit ID (commander specialty trait). */
  unitSpecialtyBonuses?: Record<string, number>;
  units: CombatUnitInput[];
}

/** Pre-computed unit data passed into the combat engine. Stats derived from template + equipment. */
export interface CombatUnitInput {
  id: string;
  templateId: string;
  name: string | null;
  position: UnitPosition;
  // Pre-computed totals (base + weapon + armour + mount + design)
  fire: number;
  shock: number;
  defence: number;
  morale: number;
  armour: number;
  ap: number;
  hitsOn: number;
  troopCounts: { rookie: number; capable: number; veteran: number };
  maxTroops: number;
  state: UnitState;
  xp: number;
}

export function resolveCombat(input: CombatInput): CombatResult {
  const rng = mulberry32(input.seed);

  const attackers: CombatUnit[] = input.attacker.units
    .filter(u => u.state !== 'destroyed')
    .map(u => ({ ...u, troopCounts: { ...u.troopCounts }, startTroops: totalTroops(u.troopCounts), isBroken: false }));

  const defenders: CombatUnit[] = input.defender.units
    .filter(u => u.state !== 'destroyed')
    .map(u => ({ ...u, troopCounts: { ...u.troopCounts }, startTroops: totalTroops(u.troopCounts), isBroken: false }));

  const terrainStats = TERRAIN[input.terrain];
  const baseFrontlineWidth = terrainStats.frontlineWidth;
  const defenceBonus = terrainStats.defenceBonus + (input.riverCrossing ? 1 : 0);

  const atkBonus = input.attacker.nobleBonus;
  const defBonus = input.defender.nobleBonus;
  const atkSpecialty = input.attacker.unitSpecialtyBonuses ?? {};
  const defSpecialty = input.defender.unitSpecialtyBonuses ?? {};

  const attackerWidth = calcFrontlineWidth(baseFrontlineWidth, atkBonus.widthBonus, input.attackerHasManeuverWarfare ?? false);
  const defenderWidth = calcFrontlineWidth(baseFrontlineWidth, defBonus.widthBonus, input.defenderHasManeuverWarfare ?? false);

  const rounds: CombatRound[] = [];

  for (let roundNum = 1; roundNum <= MAX_COMBAT_ROUNDS; roundNum++) {
    const activeAttackers = attackers.filter(u => totalTroops(u.troopCounts) > 0 && !u.isBroken);
    const activeDefenders = defenders.filter(u => totalTroops(u.troopCounts) > 0 && !u.isBroken);
    if (activeAttackers.length === 0 || activeDefenders.length === 0) break;

    const atkFront = assignFrontline(activeAttackers, attackerWidth);
    const atkBack = activeAttackers.filter(u => u.position === 'backline' && !atkFront.includes(u));
    const atkFlank = activeAttackers.filter(u => u.position === 'flank' && !atkFront.includes(u));

    const defFront = assignFrontline(activeDefenders, defenderWidth);
    const defBack = activeDefenders.filter(u => u.position === 'backline' && !defFront.includes(u));
    const defFlank = activeDefenders.filter(u => u.position === 'flank' && !defFront.includes(u));

    const atkFlanking = atkFront.length > defFront.length;
    const defFlanking = defFront.length > atkFront.length;

    const fireRolls: DiceRoll[] = [];
    const shockRolls: DiceRoll[] = [];
    const casualties: CombatCasualty[] = [];
    const moraleChecks: MoraleCheck[] = [];

    // ── Fire Phase ──
    const atkFireUnits = [...atkBack, ...atkFlank, ...atkFront];
    const defFireUnits = [...defBack, ...defFlank, ...defFront];

    const atkFireHits = resolvePhase('fire', atkFireUnits, defFront, atkBonus.fireBonus, atkSpecialty, 0, input.attackerHasModernDoctrine ?? false, rng, fireRolls, 'attacker');
    const defFireHits = resolvePhase('fire', defFireUnits, atkFront, defBonus.fireBonus, defSpecialty, defenceBonus, input.defenderHasModernDoctrine ?? false, rng, fireRolls, 'defender');

    applyTargetedDamage(atkFireHits, defFront, atkFlanking ? defBack : [], casualties, 'defender');
    applyTargetedDamage(defFireHits, atkFront, defFlanking ? atkBack : [], casualties, 'attacker');

    // ── Shock Phase ──
    const atkShockUnits = [...atkFront, ...atkFlank];
    const defShockUnits = [...defFront, ...defFlank];

    const atkShockHits = resolvePhase('shock', atkShockUnits, defFront, atkBonus.shockBonus, atkSpecialty, 0, input.attackerHasModernDoctrine ?? false, rng, shockRolls, 'attacker');
    const defShockHits = resolvePhase('shock', defShockUnits, atkFront, defBonus.shockBonus, defSpecialty, defenceBonus, input.defenderHasModernDoctrine ?? false, rng, shockRolls, 'defender');

    applyTargetedDamage(atkShockHits, defFront, atkFlanking ? defBack : [], casualties, 'defender');
    applyTargetedDamage(defShockHits, atkFront, defFlanking ? atkBack : [], casualties, 'attacker');

    // ── Morale Checks ──
    for (const cas of casualties) {
      const pool = cas.side === 'attacker' ? attackers : defenders;
      const unit = pool.find(u => u.id === cas.unitId);
      if (!unit || unit.isBroken || totalTroops(unit.troopCounts) <= 0) continue;

      const moraleThreshold = unit.morale;
      const roll = rollD20(rng);
      const passed = roll <= moraleThreshold;

      moraleChecks.push({ unitId: unit.id, side: cas.side, roll, threshold: moraleThreshold, passed });

      if (!passed && unit.state === 'broken') {
        unit.isBroken = true;
      }
    }

    rounds.push({ roundNumber: roundNum, firePhase: fireRolls, shockPhase: shockRolls, casualties, moraleChecks });

    const remainingAttackers = attackers.filter(u => totalTroops(u.troopCounts) > 0 && !u.isBroken);
    const remainingDefenders = defenders.filter(u => totalTroops(u.troopCounts) > 0 && !u.isBroken);
    if (remainingAttackers.length === 0 || remainingDefenders.length === 0) break;
  }

  const atkAlive = attackers.filter(u => totalTroops(u.troopCounts) > 0 && !u.isBroken);
  const defAlive = defenders.filter(u => totalTroops(u.troopCounts) > 0 && !u.isBroken);

  let winner: 'attacker' | 'defender' | 'draw';
  if (atkAlive.length === 0 && defAlive.length === 0) winner = 'draw';
  else if (atkAlive.length === 0) winner = 'defender';
  else if (defAlive.length === 0) winner = 'attacker';
  else winner = 'draw';

  // ── XP & Tier Promotions ──
  const xpForWinning = 20, xpForSurviving = 10, xpForLosing = 5;

  const attackerLosses: UnitLossSummary[] = attackers.map(u => {
    if (totalTroops(u.troopCounts) > 0) u.xp += winner === 'attacker' ? xpForWinning : xpForSurviving;
    else u.xp += xpForLosing;
    const { rookiesPromoted, capablePromoted } = applyPostBattlePromotions(u);
    return {
      unitId: u.id,
      templateId: u.templateId,
      unitName: u.name,
      startTroops: u.startTroops,
      endTroops: totalTroops(u.troopCounts),
      endTroopCounts: { ...u.troopCounts },
      destroyed: totalTroops(u.troopCounts) <= 0,
      xpGained: winner === 'attacker' ? xpForWinning : xpForSurviving,
      rookiesPromoted,
      capablePromoted,
    };
  });

  const defenderLosses: UnitLossSummary[] = defenders.map(u => {
    if (totalTroops(u.troopCounts) > 0) u.xp += winner === 'defender' ? xpForWinning : xpForSurviving;
    else u.xp += xpForLosing;
    const { rookiesPromoted, capablePromoted } = applyPostBattlePromotions(u);
    return {
      unitId: u.id,
      templateId: u.templateId,
      unitName: u.name,
      startTroops: u.startTroops,
      endTroops: totalTroops(u.troopCounts),
      endTroopCounts: { ...u.troopCounts },
      destroyed: totalTroops(u.troopCounts) <= 0,
      xpGained: winner === 'defender' ? xpForWinning : xpForSurviving,
      rookiesPromoted,
      capablePromoted,
    };
  });

  return { id: input.id, seed: input.seed, attackerArmyId: input.attacker.armyId, defenderArmyId: input.defender.armyId, terrain: input.terrain, riverCrossing: input.riverCrossing, winner, rounds, attackerLosses, defenderLosses };
}

// ── Siege assault variant ──

export function resolveSiegeAssault(input: CombatInput): CombatResult {
  const rng = mulberry32(input.seed);

  const attackers: CombatUnit[] = input.attacker.units
    .filter(u => u.state !== 'destroyed')
    .map(u => ({ ...u, troopCounts: { ...u.troopCounts }, startTroops: totalTroops(u.troopCounts), isBroken: false }));

  const defenders: CombatUnit[] = input.defender.units
    .filter(u => u.state !== 'destroyed')
    .map(u => ({ ...u, troopCounts: { ...u.troopCounts }, startTroops: totalTroops(u.troopCounts), isBroken: false }));

  const terrainStats = TERRAIN[input.terrain];
  const siegeWidth = 4;
  const defenceBonus = terrainStats.defenceBonus + 2;

  const siegeAtkBonus = input.attacker.nobleBonus;
  const siegeDefBonus = input.defender.nobleBonus;
  const siegeAtkSpec = input.attacker.unitSpecialtyBonuses ?? {};
  const siegeDefSpec = input.defender.unitSpecialtyBonuses ?? {};

  const attackerWidth = calcFrontlineWidth(siegeWidth, siegeAtkBonus.widthBonus, input.attackerHasManeuverWarfare ?? false);
  const defenderWidth = calcFrontlineWidth(siegeWidth, siegeDefBonus.widthBonus, input.defenderHasManeuverWarfare ?? false);

  const rounds: CombatRound[] = [];

  for (let roundNum = 1; roundNum <= MAX_COMBAT_ROUNDS; roundNum++) {
    const activeAttackers = attackers.filter(u => totalTroops(u.troopCounts) > 0 && !u.isBroken);
    const activeDefenders = defenders.filter(u => totalTroops(u.troopCounts) > 0 && !u.isBroken);
    if (activeAttackers.length === 0 || activeDefenders.length === 0) break;

    const atkFront = assignFrontline(activeAttackers, attackerWidth);
    const atkBack = activeAttackers.filter(u => u.position === 'backline' && !atkFront.includes(u));
    const defFront = assignFrontline(activeDefenders, defenderWidth);
    const defBack = activeDefenders.filter(u => u.position === 'backline' && !defFront.includes(u));

    const fireRolls: DiceRoll[] = [];
    const shockRolls: DiceRoll[] = [];
    const casualties: CombatCasualty[] = [];
    const moraleChecks: MoraleCheck[] = [];

    const defFireUnits = [...defBack, ...defFront];
    const defFireHits = resolvePhase('fire', defFireUnits, atkFront, siegeDefBonus.fireBonus, siegeDefSpec, defenceBonus, input.defenderHasModernDoctrine ?? false, rng, fireRolls, 'defender');
    applyTargetedDamage(defFireHits, atkFront, [], casualties, 'attacker');

    const atkFireUnits = [...atkBack, ...atkFront];
    const atkFireHits = resolvePhase('fire', atkFireUnits, defFront, siegeAtkBonus.fireBonus, siegeAtkSpec, 0, input.attackerHasModernDoctrine ?? false, rng, fireRolls, 'attacker');
    applyTargetedDamage(atkFireHits, defFront, [], casualties, 'defender');

    const atkShockUnits = atkFront.filter(u => totalTroops(u.troopCounts) > 0);
    const atkShockHits = resolvePhase('shock', atkShockUnits, defFront, siegeAtkBonus.shockBonus, siegeAtkSpec, 0, input.attackerHasModernDoctrine ?? false, rng, shockRolls, 'attacker');
    applyTargetedDamage(atkShockHits, defFront, [], casualties, 'defender');

    for (const cas of casualties) {
      const pool = cas.side === 'attacker' ? attackers : defenders;
      const unit = pool.find(u => u.id === cas.unitId);
      if (!unit || unit.isBroken || totalTroops(unit.troopCounts) <= 0) continue;
      const roll = rollD20(rng);
      moraleChecks.push({ unitId: unit.id, side: cas.side, roll, threshold: unit.morale, passed: roll <= unit.morale });
      if (roll > unit.morale && unit.state === 'broken') unit.isBroken = true;
    }

    rounds.push({ roundNumber: roundNum, firePhase: fireRolls, shockPhase: shockRolls, casualties, moraleChecks });

    if (attackers.filter(u => totalTroops(u.troopCounts) > 0 && !u.isBroken).length === 0 ||
        defenders.filter(u => totalTroops(u.troopCounts) > 0 && !u.isBroken).length === 0) break;
  }

  const atkAlive = attackers.filter(u => totalTroops(u.troopCounts) > 0 && !u.isBroken);
  const defAlive = defenders.filter(u => totalTroops(u.troopCounts) > 0 && !u.isBroken);
  let winner: 'attacker' | 'defender' | 'draw';
  if (atkAlive.length === 0 && defAlive.length === 0) winner = 'draw';
  else if (atkAlive.length === 0) winner = 'defender';
  else if (defAlive.length === 0) winner = 'attacker';
  else winner = 'defender';

  const xpW = 20, xpS = 10, xpL = 5;
  const attackerLosses: UnitLossSummary[] = attackers.map(u => {
    u.xp += totalTroops(u.troopCounts) > 0 ? (winner === 'attacker' ? xpW : xpS) : xpL;
    const { rookiesPromoted, capablePromoted } = applyPostBattlePromotions(u);
    return { unitId: u.id, templateId: u.templateId, unitName: u.name, startTroops: u.startTroops, endTroops: totalTroops(u.troopCounts), endTroopCounts: { ...u.troopCounts }, destroyed: totalTroops(u.troopCounts) <= 0, xpGained: winner === 'attacker' ? xpW : xpS, rookiesPromoted, capablePromoted };
  });
  const defenderLosses: UnitLossSummary[] = defenders.map(u => {
    u.xp += totalTroops(u.troopCounts) > 0 ? (winner === 'defender' ? xpW : xpS) : xpL;
    const { rookiesPromoted, capablePromoted } = applyPostBattlePromotions(u);
    return { unitId: u.id, templateId: u.templateId, unitName: u.name, startTroops: u.startTroops, endTroops: totalTroops(u.troopCounts), endTroopCounts: { ...u.troopCounts }, destroyed: totalTroops(u.troopCounts) <= 0, xpGained: winner === 'defender' ? xpW : xpS, rookiesPromoted, capablePromoted };
  });

  return { id: input.id, seed: input.seed, attackerArmyId: input.attacker.armyId, defenderArmyId: input.defender.armyId, terrain: input.terrain, riverCrossing: input.riverCrossing, winner, rounds, attackerLosses, defenderLosses };
}

// ── Helpers ──

function totalTroops(tc: { rookie: number; capable: number; veteran: number }): number {
  return tc.rookie + tc.capable + tc.veteran;
}

function calcFrontlineWidth(base: number, nobleWidthBonus: number, hasManeuverWarfare: boolean): number {
  let width = base;
  width += nobleWidthBonus; // from noble's maneuver trait
  if (hasManeuverWarfare) width += MANEUVER_WARFARE_WIDTH_BONUS;
  return width;
}

function assignFrontline(units: CombatUnit[], maxWidth: number): CombatUnit[] {
  const front: CombatUnit[] = [];
  const sorted = [...units].sort((a, b) => {
    const order: Record<string, number> = { frontline: 0, flank: 1, backline: 2 };
    return (order[a.position] ?? 1) - (order[b.position] ?? 1);
  });

  for (const unit of sorted) {
    if (front.length >= maxWidth) break;
    if (unit.position !== 'backline') front.push(unit);
  }
  if (front.length < maxWidth) {
    for (const unit of sorted) {
      if (front.length >= maxWidth) break;
      if (!front.includes(unit)) front.push(unit);
    }
  }
  return front;
}

/** Convert raw armour/AP stat to hitsOn modifier. */
function armourToHitsMod(raw: number): number {
  return Math.ceil(raw / ARMOUR_HITSON_DIVISOR);
}

/**
 * Resolve one phase (fire or shock) with per-target armour/AP.
 *
 * Each attacker splits its dice across defenders proportionally by troop count.
 * Each batch is rolled against a per-defender threshold:
 *   effective threshold = base hitsOn − vet mod + defender armour mod − attacker AP mod
 *
 * Returns a map of defender unit ID → total hits aimed at that defender.
 */
function resolvePhase(
  phase: 'fire' | 'shock',
  attackingUnits: CombatUnit[],
  defenderFrontline: CombatUnit[],
  phaseBonus: number,
  unitSpecialtyBonuses: Record<string, number>,
  terrainBonus: number,
  hasModernDoctrine: boolean,
  rng: () => number,
  rolls: DiceRoll[],
  side: 'attacker' | 'defender',
): Map<string, number> {
  const hitsByDefender = new Map<string, number>();

  const liveDefenders = defenderFrontline.filter(u => totalTroops(u.troopCounts) > 0);
  if (liveDefenders.length === 0) return hitsByDefender;

  // Total defender troops for proportional dice splitting
  const totalDefTroops = liveDefenders.reduce((s, u) => s + totalTroops(u.troopCounts), 0);

  for (const unit of attackingUnits) {
    if (totalTroops(unit.troopCounts) <= 0 || unit.isBroken) continue;

    const baseStat = phase === 'fire' ? unit.fire : unit.shock;
    if (baseStat === 0) continue;

    const troops = totalTroops(unit.troopCounts);
    const troopScale = troops / 100;
    const stateMultiplier = STATE_DICE_MULTIPLIER[unit.state] ?? 1;
    const numDice = Math.max(1, Math.round(baseStat * troopScale * DICE_MULTIPLIER * stateMultiplier));

    const vetMod = getWeightedVeterancyModifier(unit.troopCounts.rookie, unit.troopCounts.capable, unit.troopCounts.veteran);
    const baseThreshold = Math.max(1, unit.hitsOn - vetMod);

    const specialtyBonus = unitSpecialtyBonuses[unit.id] ?? 0;
    const bonus = phaseBonus + specialtyBonus
      + (side === 'defender' ? terrainBonus : 0)
      + (hasModernDoctrine ? MODERN_DOCTRINE_BONUS : 0);

    const attackerApMod = armourToHitsMod(unit.ap);

    // Roll all dice up front (deterministic sequence)
    const dice: number[] = [];
    for (let i = 0; i < numDice; i++) dice.push(rollD20(rng));

    // Split dice across defenders proportionally by troop count
    const targets: DiceRollTarget[] = [];
    let diceUsed = 0;
    let totalSuccesses = 0;
    let totalNetHits = 0;

    for (let di = 0; di < liveDefenders.length; di++) {
      const def = liveDefenders[di];
      const isLast = di === liveDefenders.length - 1;
      const proportion = totalDefTroops > 0 ? totalTroops(def.troopCounts) / totalDefTroops : 1 / liveDefenders.length;
      const diceForTarget = isLast ? numDice - diceUsed : Math.round(numDice * proportion);

      const defArmourMod = armourToHitsMod(def.armour);
      const effectiveThreshold = Math.max(1, baseThreshold + defArmourMod - attackerApMod);

      let hits = 0;
      for (let i = diceUsed; i < diceUsed + diceForTarget && i < dice.length; i++) {
        if (dice[i] + bonus >= effectiveThreshold) hits++;
      }

      totalSuccesses += hits;
      totalNetHits += hits;
      hitsByDefender.set(def.id, (hitsByDefender.get(def.id) ?? 0) + hits);

      targets.push({
        targetUnitId: def.id,
        targetUnitName: def.name,
        diceCount: diceForTarget,
        threshold: effectiveThreshold,
        hits,
      });

      diceUsed += diceForTarget;
    }

    rolls.push({
      unitId: unit.id, unitName: unit.name, phase, dice, bonus,
      threshold: baseThreshold, successes: totalSuccesses,
      targets, netHits: totalNetHits,
    });
  }

  return hitsByDefender;
}

/**
 * Apply targeted damage. Each defender receives hits aimed specifically at it.
 * When flanking, 20% of frontline hits spill to backline targets.
 */
function applyTargetedDamage(
  hitsByDefender: Map<string, number>,
  frontline: CombatUnit[],
  flankTargets: CombatUnit[],
  casualties: CombatCasualty[],
  side: 'attacker' | 'defender',
) {
  for (const unit of frontline) {
    const hits = hitsByDefender.get(unit.id) ?? 0;
    if (hits <= 0) continue;

    // If flanking, 20% of this unit's hits spill to backline
    let frontHits = hits;
    let spillHits = 0;
    if (flankTargets.length > 0) {
      spillHits = Math.floor(hits * 0.2);
      frontHits = hits - spillHits;
    }

    applyHitsToUnit(frontHits, unit, casualties, side);

    if (spillHits > 0) {
      // Distribute spill evenly across backline
      distributeDamage(spillHits, flankTargets.filter(u => totalTroops(u.troopCounts) > 0), casualties, side);
    }
  }
}

/** Apply hits to a single unit. Each hit = 5 troop casualties. Rookies die first. */
function applyHitsToUnit(
  hits: number,
  unit: CombatUnit,
  casualties: CombatCasualty[],
  side: 'attacker' | 'defender',
) {
  if (hits <= 0 || totalTroops(unit.troopCounts) <= 0) return;
  const troopsPerHit = 5;
  let remaining = Math.min(hits * troopsPerHit, totalTroops(unit.troopCounts));
  const tc = unit.troopCounts;

  const rookieLoss = Math.min(remaining, tc.rookie);
  tc.rookie -= rookieLoss;
  remaining -= rookieLoss;

  const capableLoss = Math.min(remaining, tc.capable);
  tc.capable -= capableLoss;
  remaining -= capableLoss;

  const veteranLoss = Math.min(remaining, tc.veteran);
  tc.veteran -= veteranLoss;

  const totalLost = rookieLoss + capableLoss + veteranLoss;
  unit.state = getUnitState(totalTroops(tc), unit.maxTroops);

  casualties.push({
    unitId: unit.id,
    side,
    troopsLost: totalLost,
    newTroopCounts: { ...tc },
    newState: unit.state,
  });
}

/**
 * Distribute troop casualties evenly across multiple targets.
 * Used for flanking spill damage. Each net hit = 5 troop casualties.
 */
function distributeDamage(
  damage: number,
  targets: CombatUnit[],
  casualties: CombatCasualty[],
  side: 'attacker' | 'defender',
) {
  if (targets.length === 0 || damage <= 0) return;
  const hitsPerUnit = Math.round(damage / targets.length);
  for (const unit of targets) {
    applyHitsToUnit(hitsPerUnit, unit, casualties, side);
  }
}

function getUnitState(currentTroops: number, maxTroops: number): UnitState {
  if (maxTroops === 0 || currentTroops <= 0) return 'destroyed';
  const ratio = currentTroops / maxTroops;
  if (ratio < UNIT_STATE_THRESHOLDS.broken) return 'destroyed';
  if (ratio < UNIT_STATE_THRESHOLDS.depleted) return 'broken';
  if (ratio < UNIT_STATE_THRESHOLDS.full) return 'depleted';
  return 'full';
}

/**
 * After battle: promote a fraction of surviving rookies → capable, capable → veteran.
 * Returns counts for the loss summary.
 */
function applyPostBattlePromotions(unit: CombatUnit): { rookiesPromoted: number; capablePromoted: number } {
  const tc = unit.troopCounts;
  const rookiesPromoted = Math.floor(tc.rookie * COMBAT_PROMOTION_RATE.rookieToCapable);
  const capablePromoted = Math.floor(tc.capable * COMBAT_PROMOTION_RATE.capableToVeteran);

  tc.rookie -= rookiesPromoted;
  tc.capable += rookiesPromoted - capablePromoted;
  tc.veteran += capablePromoted;

  return { rookiesPromoted, capablePromoted };
}

// ── Stat derivation helper (used by server before passing to combat engine) ──

import type { UnitTemplate, WeaponDesign } from '../types/military.js';
import type { WeaponType } from '../constants/weapons.js';
import type { ShieldType } from '../constants/shields.js';
import { WEAPONS } from '../constants/weapons.js';
import { SHIELDS } from '../constants/shields.js';
import { ARMOUR_TYPES } from '../constants/armour.js';
import { MOUNT_TYPES } from '../constants/mounts.js';
import { getBaseStats } from '../constants/units.js';

/**
 * Compute the full CombatUnitInput stat block for a unit from its template.
 * Call this on the server before building CombatInput.
 */
export function computeUnitStats(
  template: UnitTemplate,
  weaponDesigns: WeaponDesign[],
): { fire: number; shock: number; defence: number; morale: number; armour: number; ap: number; hitsOn: number } {
  const base = getBaseStats(
    template.companiesOrSquadrons,
    template.isMounted,
    template.isIrregular,
    template.primary,
  );

  if (template.isIrregular) {
    return { fire: base.fire, shock: base.shock, defence: base.defence, morale: base.morale, armour: base.armour, ap: base.ap, hitsOn: base.hitsOn };
  }

  let fire = base.fire, shock = base.shock, defence = base.defence;
  let morale = base.morale, armour = base.armour, ap = base.ap, hitsOn = base.hitsOn;

  function applyWeaponBonus(bonus: { fire?: number; shock?: number; defence?: number; morale?: number; ap?: number; armour?: number }, mult: number) {
    fire   += (bonus.fire   ?? 0) * mult;
    shock  += (bonus.shock  ?? 0) * mult;
    defence += (bonus.defence ?? 0) * mult;
    morale += (bonus.morale ?? 0) * mult;
    ap     += (bonus.ap     ?? 0) * mult;
    armour += (bonus.armour ?? 0) * mult;
  }

  // Primary weapon — 100%
  if (template.primary) {
    const w = WEAPONS[template.primary as WeaponType];
    if (w) applyWeaponBonus(w.statBonus, 1);
    if (template.primaryDesignId) {
      const d = weaponDesigns.find(d => d.id === template.primaryDesignId && d.status === 'ready');
      if (d) applyWeaponBonus(d.statModifiers, 1);
    }
  }

  // Secondary hand — 50% (weapon or shield)
  if (template.secondary) {
    const w = WEAPONS[template.secondary as WeaponType];
    const s = w ? null : SHIELDS[template.secondary as ShieldType];
    if (w) applyWeaponBonus(w.statBonus, 0.5);
    if (s) applyWeaponBonus(s.statBonus, 0.5);
    if (template.secondaryDesignId) {
      const d = weaponDesigns.find(d => d.id === template.secondaryDesignId && d.status === 'ready');
      if (d) applyWeaponBonus(d.statModifiers, 0.5);
    }
  }

  // Sidearm — 25% (1H weapon only)
  if (template.sidearm) {
    const w = WEAPONS[template.sidearm as WeaponType];
    if (w) applyWeaponBonus(w.statBonus, 0.25);
    if (template.sidearmDesignId) {
      const d = weaponDesigns.find(d => d.id === template.sidearmDesignId && d.status === 'ready');
      if (d) applyWeaponBonus(d.statModifiers, 0.25);
    }
  }

  // Armour
  if (template.armour) {
    const a = ARMOUR_TYPES[template.armour];
    if (a) {
      armour += a.statBonus.armour ?? 0;
      defence += a.statBonus.defence ?? 0;
      morale += a.statBonus.morale ?? 0;
    }
  }

  // Mount
  if (template.mount) {
    const m = MOUNT_TYPES[template.mount];
    if (m) {
      fire   += m.statBonus.fire   ?? 0;
      shock  += m.statBonus.shock  ?? 0;
      defence += m.statBonus.defence ?? 0;
      morale += m.statBonus.morale ?? 0;
      armour += m.statBonus.armour ?? 0;
      ap     += m.statBonus.ap     ?? 0;
      hitsOn -= m.statBonus.hitsOnBonus ?? 0;
    }
  }

  return {
    fire:    Math.max(0, fire),
    shock:   Math.max(0, shock),
    defence: Math.max(0, defence),
    morale:  Math.max(1, Math.round(morale)),
    armour:  Math.max(0, armour),
    ap:      Math.max(0, ap),
    hitsOn:  Math.max(1, Math.round(hitsOn)),
  };
}

// ── Naval combat ──

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
  /** Noble-derived combat bonuses (replaces flat commandRating). */
  nobleBonus: NobleCombatBonus;
  ships: NavalShipInput[];
}

export interface NavalShipInput {
  id: string;
  type: ShipType;
  hullCurrent: number;
  hullMax: number;
  state: ShipState;
  crewCounts: { rookie: number; capable: number; veteran: number };
  xp: number;
}

interface CombatShip {
  id: string;
  type: ShipType;
  hullCurrent: number;
  hullMax: number;
  state: ShipState;
  crewCounts: { rookie: number; capable: number; veteran: number };
  xp: number;
  startHull: number;
  startCrewCounts: { rookie: number; capable: number; veteran: number };
}

/** Crew per net hit taken in naval combat. */
const CREW_LOSS_PER_HIT = 2;

export function resolveNavalCombat(input: NavalCombatInput): NavalCombatResult {
  const rng = mulberry32(input.seed);

  const attackers: CombatShip[] = input.attacker.ships.filter(s => s.state !== 'sunk').map(s => ({
    ...s,
    startHull: s.hullCurrent,
    startCrewCounts: { ...s.crewCounts },
  }));
  const defenders: CombatShip[] = input.defender.ships.filter(s => s.state !== 'sunk').map(s => ({
    ...s,
    startHull: s.hullCurrent,
    startCrewCounts: { ...s.crewCounts },
  }));

  const rounds: NavalCombatRound[] = [];

  for (let roundNum = 1; roundNum <= MAX_COMBAT_ROUNDS; roundNum++) {
    const activeAtk = attackers.filter(s => s.hullCurrent > 0);
    const activeDef = defenders.filter(s => s.hullCurrent > 0);
    if (activeAtk.length === 0 || activeDef.length === 0) break;

    const fire1: DiceRoll[] = [];
    const fire2: DiceRoll[] = [];
    const casualties: NavalCasualty[] = [];

    const atkDmg1 = resolveNavalFire(activeAtk, input.attacker.nobleBonus.fireBonus, input.attackerHasModernDoctrine ?? false, rng, fire1, 'attacker');
    const defDmg1 = resolveNavalFire(activeDef, input.defender.nobleBonus.fireBonus, input.defenderHasModernDoctrine ?? false, rng, fire1, 'defender');
    applyNavalDamage(atkDmg1, activeDef, casualties, 'defender');
    applyNavalDamage(defDmg1, activeAtk, casualties, 'attacker');

    const stillAtk = attackers.filter(s => s.hullCurrent > 0);
    const stillDef = defenders.filter(s => s.hullCurrent > 0);
    const atkDmg2 = resolveNavalFire(stillAtk, input.attacker.nobleBonus.fireBonus, input.attackerHasModernDoctrine ?? false, rng, fire2, 'attacker');
    const defDmg2 = resolveNavalFire(stillDef, input.defender.nobleBonus.fireBonus, input.defenderHasModernDoctrine ?? false, rng, fire2, 'defender');
    applyNavalDamage(atkDmg2, stillDef, casualties, 'defender');
    applyNavalDamage(defDmg2, stillAtk, casualties, 'attacker');

    rounds.push({ roundNumber: roundNum, fire1, fire2, casualties });
    if (attackers.filter(s => s.hullCurrent > 0).length === 0 || defenders.filter(s => s.hullCurrent > 0).length === 0) break;
  }

  const atkAlive = attackers.filter(s => s.hullCurrent > 0);
  const defAlive = defenders.filter(s => s.hullCurrent > 0);
  let winner: 'attacker' | 'defender' | 'draw';
  if (atkAlive.length === 0 && defAlive.length === 0) winner = 'draw';
  else if (atkAlive.length === 0) winner = 'defender';
  else if (defAlive.length === 0) winner = 'attacker';
  else winner = 'draw';

  // Post-battle crew promotions
  applyNavalCrewPromotions(attackers);
  applyNavalCrewPromotions(defenders);

  const buildLossSummary = (ships: CombatShip[]): NavalLossSummary[] =>
    ships.map(s => {
      const startCrew = s.startCrewCounts.rookie + s.startCrewCounts.capable + s.startCrewCounts.veteran;
      const endCrew = s.crewCounts.rookie + s.crewCounts.capable + s.crewCounts.veteran;
      return {
        shipId: s.id, shipType: s.type,
        startHull: s.startHull, endHull: s.hullCurrent, sunk: s.hullCurrent <= 0,
        startCrew, endCrew, endCrewCounts: { ...s.crewCounts },
        rookiesPromoted: Math.floor(s.startCrewCounts.rookie * COMBAT_PROMOTION_RATE.rookieToCapable),
        capablePromoted: Math.floor(s.startCrewCounts.capable * COMBAT_PROMOTION_RATE.capableToVeteran),
      };
    });

  return {
    id: input.id, seed: input.seed,
    attackerFleetId: input.attacker.fleetId,
    defenderFleetId: input.defender.fleetId,
    winner, rounds,
    attackerLosses: buildLossSummary(attackers),
    defenderLosses: buildLossSummary(defenders),
  };
}

function resolveNavalFire(ships: CombatShip[], fireBonus: number, hasModernDoctrine: boolean, rng: () => number, rolls: DiceRoll[], side: 'attacker' | 'defender'): number {
  let totalDamage = 0;
  for (const ship of ships) {
    if (ship.hullCurrent <= 0) continue;
    const stats = SHIPS[ship.type];
    if (!stats || stats.fire === 0) continue;
    const hullPct = ship.hullCurrent / ship.hullMax;
    const multiplier = hullPct > 0.5 ? 1.0 : hullPct > 0.25 ? 0.6 : 0.3;
    const numDice = Math.max(1, Math.round(stats.fire * multiplier));
    const bonus = fireBonus + (hasModernDoctrine ? MODERN_DOCTRINE_BONUS : 0);
    // Experienced crew aim better — weighted vet modifier reduces hitsOn
    const vetMod = getWeightedVeterancyModifier(ship.crewCounts.rookie, ship.crewCounts.capable, ship.crewCounts.veteran);
    const threshold = Math.max(2, stats.hitsOn - Math.floor(vetMod));
    const dice: number[] = [];
    let successes = 0;
    for (let i = 0; i < numDice; i++) {
      const roll = rollD20(rng);
      dice.push(roll);
      if (roll + bonus >= threshold) successes++;
    }
    rolls.push({ unitId: ship.id, unitName: null, phase: 'fire', dice, bonus, threshold, successes, targets: [], netHits: successes });
    totalDamage += successes;
  }
  return totalDamage;
}

function applyNavalDamage(totalDamage: number, targets: CombatShip[], casualties: NavalCasualty[], side: 'attacker' | 'defender') {
  if (totalDamage <= 0 || targets.length === 0) return;
  const dmgPerShip = totalDamage / targets.length;
  for (const ship of targets) {
    if (ship.hullCurrent <= 0) continue;
    const hullLoss = Math.round(dmgPerShip);
    if (hullLoss <= 0) continue;
    ship.hullCurrent = Math.max(0, ship.hullCurrent - hullLoss);
    const hullPct = ship.hullCurrent / ship.hullMax;
    ship.state = hullPct <= 0 ? 'sunk' : hullPct <= 0.25 ? 'crippled' : hullPct <= 0.5 ? 'damaged' : 'intact';

    // Crew casualties — rookies lost first, then capable, then veteran
    const crewLost = hullLoss * CREW_LOSS_PER_HIT;
    let remaining = crewLost;
    const rookieLoss = Math.min(ship.crewCounts.rookie, remaining);
    ship.crewCounts.rookie -= rookieLoss;
    remaining -= rookieLoss;
    const capableLoss = Math.min(ship.crewCounts.capable, remaining);
    ship.crewCounts.capable -= capableLoss;
    remaining -= capableLoss;
    ship.crewCounts.veteran = Math.max(0, ship.crewCounts.veteran - remaining);

    casualties.push({
      shipId: ship.id, side,
      hullDamage: hullLoss, newHullPct: Math.round(hullPct * 100), newState: ship.state,
      crewLost, newCrewCounts: { ...ship.crewCounts },
    });
  }
}

function applyNavalCrewPromotions(ships: CombatShip[]) {
  for (const ship of ships) {
    if (ship.hullCurrent <= 0) continue;
    const promoted = Math.floor(ship.crewCounts.rookie * COMBAT_PROMOTION_RATE.rookieToCapable);
    const promoted2 = Math.floor(ship.crewCounts.capable * COMBAT_PROMOTION_RATE.capableToVeteran);
    ship.crewCounts.rookie -= promoted;
    ship.crewCounts.capable += promoted - promoted2;
    ship.crewCounts.veteran += promoted2;
  }
}
