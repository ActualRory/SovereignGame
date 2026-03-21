/**
 * Step-by-step simultaneous movement resolver.
 *
 * All armies advance 1 hex at a time. After each tick, collisions are checked.
 * Combat triggers when armies at war share a hex. Border enforcement prevents
 * armies from entering foreign territory without war or openBorders.
 */

import {
  hexKey, hexNeighbors, hasRiverBetween, canEnterHex,
  resolveCombat, computeUnitStats,
  TERRAIN, RIVER_CROSSING_COST,
  getDefaultPosition, MEN_PER_COMPANY, MEN_PER_SQUADRON,
  type CombatInput, type CombatUnitInput, type CombatResult,
  type TerrainType, type HexDirection, type UnitState, type UnitPosition,
  type UnitTemplate, type WeaponDesign, type TroopCounts,
  type DiplomacyRelation,
  type MovementLog, type MovementStep, type MovementCombatEvent,
} from '@kingdoms/shared';

// ── Types ──

export interface ArmyForMovement {
  id: string;
  ownerId: string;
  hexQ: number;
  hexR: number;
  movementPath: Array<{ q: number; r: number }> | null;
  generalId: string | null;
}

export interface GeneralInfo {
  id: string;
  commandRating: number;
}

export interface UnitForCombat {
  id: string;
  armyId: string;
  templateId: string | null;
  name: string | null;
  state: string;
  xp: number | null;
  position: string | null;
  troopCounts: unknown;
}

export interface HexInfo {
  q: number;
  r: number;
  terrain: string;
  ownerId: string | null;
  riverEdges: HexDirection[];
}

interface WorkingArmy {
  army: ArmyForMovement;
  currentQ: number;
  currentR: number;
  pathIndex: number;
  remainingMP: number;
  stopped: boolean;
}

export interface EventEntry {
  type: string;
  description: string;
  playerIds: string[];
}

export interface MovementResult {
  /** Updated army positions: armyId -> { hexQ, hexR, movementPath (null if done) } */
  positions: Map<string, { hexQ: number; hexR: number; movementPath: Array<{ q: number; r: number }> | null }>;
  movementLog: MovementLog;
  combatLogs: CombatResult[];
  events: EventEntry[];
  /** Unit updates from combat: unitId -> { troopCounts, state, xp } */
  unitUpdates: Map<string, { troopCounts: TroopCounts; state: string; xp: number }>;
}

// ── Helpers ──

const BASE_MOVEMENT_POINTS = 4;

function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// ── Main resolver ──

export function resolveMovementStepByStep(opts: {
  gameId: string;
  turnNumber: number;
  armies: ArmyForMovement[];
  hexData: HexInfo[];
  relations: DiplomacyRelation[];
  /** All generals in the game, keyed by ID */
  generals: Map<string, GeneralInfo>;
  /** All non-destroyed units keyed by armyId */
  unitsByArmy: Map<string, UnitForCombat[]>;
  /** All unit templates for the game */
  templates: UnitTemplate[];
  /** All weapon designs for the game */
  weaponDesigns: WeaponDesign[];
  /** Map of playerId -> countryName for event descriptions */
  playerNames: Map<string, string>;
}): MovementResult {
  const {
    gameId, turnNumber, armies, hexData, relations,
    generals, unitsByArmy, templates, weaponDesigns, playerNames,
  } = opts;

  // Build lookup maps
  const hexTerrainMap = new Map<string, TerrainType>();
  const hexOwnerMap = new Map<string, string | null>();
  const hexRiverEdges = new Map<string, HexDirection[]>();

  for (const h of hexData) {
    const key = hexKey({ q: h.q, r: h.r });
    hexTerrainMap.set(key, h.terrain as TerrainType);
    hexOwnerMap.set(key, h.ownerId);
    hexRiverEdges.set(key, h.riverEdges ?? []);
  }

  // Build working state for each army that has a movement path
  const workingArmies: WorkingArmy[] = [];
  for (const army of armies) {
    const path = army.movementPath;
    if (!path || path.length < 1) continue;

    // Find current position on path
    let pathIndex = 0;
    for (let i = 0; i < path.length; i++) {
      if (path[i].q === army.hexQ && path[i].r === army.hexR) {
        pathIndex = i;
        break;
      }
    }

    workingArmies.push({
      army,
      currentQ: army.hexQ,
      currentR: army.hexR,
      pathIndex,
      remainingMP: BASE_MOVEMENT_POINTS,
      stopped: false,
    });
  }

  // Sort by army ID for deterministic ordering
  workingArmies.sort((a, b) => a.army.id.localeCompare(b.army.id));

  const movementLog: MovementLog = { ticks: [], combats: [] };
  const combatLogs: CombatResult[] = [];
  const events: EventEntry[] = [];
  const unitUpdates = new Map<string, { troopCounts: TroopCounts; state: string; xp: number }>();

  // Track armies already resolved in combat this turn
  const resolvedArmyIds = new Set<string>();

  // Also track ALL armies' current positions (including non-moving ones) for collision detection
  const armyPositions = new Map<string, { q: number; r: number; ownerId: string }>();
  for (const army of armies) {
    armyPositions.set(army.id, { q: army.hexQ, r: army.hexR, ownerId: army.ownerId });
  }

  // Step-by-step loop
  for (let tick = 0; tick < 20; tick++) { // max 20 ticks as safety
    const tickSteps: MovementStep[] = [];

    // Determine which armies can move this tick
    for (const wa of workingArmies) {
      if (wa.stopped) continue;

      const path = wa.army.movementPath!;
      if (wa.pathIndex >= path.length - 1) {
        wa.stopped = true;
        continue;
      }

      const nextHex = path[wa.pathIndex + 1];
      const nextKey = hexKey(nextHex);
      const terrain = hexTerrainMap.get(nextKey);

      if (!terrain) { wa.stopped = true; continue; }
      if (terrain === 'mountains') { wa.stopped = true; continue; }

      // Border check
      const nextOwner = hexOwnerMap.get(nextKey) ?? null;
      if (!canEnterHex(nextOwner, wa.army.ownerId, relations)) {
        wa.stopped = true;
        const ownerName = nextOwner ? (playerNames.get(nextOwner) ?? '?') : '?';
        events.push({
          type: 'border_blocked',
          description: `Army "${wa.army.id}" stopped at the border of ${ownerName} — no military access.`,
          playerIds: [wa.army.ownerId],
        });
        continue;
      }

      let moveCost = TERRAIN[terrain].movementCost;
      if (hasRiverBetween({ q: wa.currentQ, r: wa.currentR }, nextHex, hexRiverEdges)) {
        moveCost += RIVER_CROSSING_COST;
      }

      if (wa.remainingMP < moveCost) { wa.stopped = true; continue; }

      // Advance
      const fromQ = wa.currentQ;
      const fromR = wa.currentR;
      wa.remainingMP -= moveCost;
      wa.currentQ = nextHex.q;
      wa.currentR = nextHex.r;
      wa.pathIndex++;

      tickSteps.push({
        armyId: wa.army.id,
        ownerId: wa.army.ownerId,
        fromQ, fromR,
        toQ: nextHex.q, toR: nextHex.r,
      });

      // Update position tracker
      armyPositions.set(wa.army.id, { q: nextHex.q, r: nextHex.r, ownerId: wa.army.ownerId });
    }

    if (tickSteps.length === 0) break;
    movementLog.ticks.push(tickSteps);

    // Check for collisions after this tick
    const armiesByHex = new Map<string, string[]>(); // hexKey -> armyIds
    for (const [armyId, pos] of armyPositions) {
      const key = hexKey({ q: pos.q, r: pos.r });
      const list = armiesByHex.get(key) ?? [];
      list.push(armyId);
      armiesByHex.set(key, list);
    }

    for (const [hKey, armyIds] of armiesByHex) {
      if (armyIds.length < 2) continue;

      // Group by owner
      const byOwner = new Map<string, string[]>();
      for (const aid of armyIds) {
        const pos = armyPositions.get(aid)!;
        const list = byOwner.get(pos.ownerId) ?? [];
        list.push(aid);
        byOwner.set(pos.ownerId, list);
      }

      if (byOwner.size < 2) continue;

      // Check pairwise: first two different owners
      const ownerIds = [...byOwner.keys()];
      for (let oi = 0; oi < ownerIds.length - 1 && oi < 2; oi++) {
        for (let oj = oi + 1; oj < ownerIds.length && oj < 3; oj++) {
          const ownerA = ownerIds[oi];
          const ownerB = ownerIds[oj];

          // Only fight if at war
          const rel = relations.find(
            r => (r.playerAId === ownerA && r.playerBId === ownerB)
              || (r.playerAId === ownerB && r.playerBId === ownerA),
          );
          if (!rel || rel.relationType !== 'war') continue;

          const atkArmyId = byOwner.get(ownerA)![0];
          const defArmyId = byOwner.get(ownerB)![0];

          if (resolvedArmyIds.has(atkArmyId) || resolvedArmyIds.has(defArmyId)) continue;

          // Resolve combat
          const combatResult = resolveCombatBetween({
            gameId, turnNumber, hKey,
            atkArmyId, defArmyId,
            armies, unitsByArmy, templates, weaponDesigns, generals,
            hexTerrainMap,
          });

          if (!combatResult) continue;

          combatLogs.push(combatResult.result);

          // Apply unit updates
          for (const loss of [...combatResult.result.attackerLosses, ...combatResult.result.defenderLosses]) {
            const tmpl = templates.find(t => t.id === loss.templateId);
            const maxTroops = tmpl
              ? (tmpl.isMounted ? tmpl.companiesOrSquadrons * MEN_PER_SQUADRON : tmpl.companiesOrSquadrons * MEN_PER_COMPANY)
              : 100;
            const endTotal = loss.endTroops;
            const pct = maxTroops > 0 ? endTotal / maxTroops : 0;
            const newState = loss.destroyed ? 'destroyed'
              : pct < 0.4 ? 'broken'
              : pct < 0.6 ? 'depleted'
              : 'full';
            unitUpdates.set(loss.unitId, {
              troopCounts: loss.endTroopCounts,
              state: newState,
              xp: loss.xpGained,
            });
          }

          // Loser retreats, winner stops
          const loserArmyId = combatResult.result.winner === 'attacker' ? defArmyId : atkArmyId;
          const winnerArmyId = combatResult.result.winner === 'attacker' ? atkArmyId : defArmyId;

          // Parse hex position from key
          const [hq, hr] = hKey.split(',').map(Number);

          // Find retreat hex for loser
          let retreatQ: number | null = null;
          let retreatR: number | null = null;
          if (combatResult.result.winner !== 'draw') {
            const neighbors = hexNeighbors({ q: hq, r: hr });
            const retreatHex = neighbors.find(n => {
              const nh = hexTerrainMap.get(hexKey(n));
              return nh && nh !== 'coast' && nh !== 'mountains';
            });
            if (retreatHex) {
              retreatQ = retreatHex.q;
              retreatR = retreatHex.r;
            }
          }

          // Update working army state
          for (const wa of workingArmies) {
            if (wa.army.id === loserArmyId && retreatQ !== null && retreatR !== null) {
              wa.currentQ = retreatQ;
              wa.currentR = retreatR;
              wa.stopped = true;
              armyPositions.set(loserArmyId, { q: retreatQ, r: retreatR, ownerId: wa.army.ownerId });
            }
            if (wa.army.id === winnerArmyId) {
              wa.stopped = true;
            }
          }

          // Also handle non-moving armies (winner/loser might not be in workingArmies)
          if (retreatQ !== null && retreatR !== null) {
            armyPositions.set(loserArmyId, { q: retreatQ, r: retreatR, ownerId: armyPositions.get(loserArmyId)!.ownerId });
          }

          resolvedArmyIds.add(atkArmyId);
          resolvedArmyIds.add(defArmyId);

          // Record combat event
          movementLog.combats.push({
            tick,
            hexQ: hq, hexR: hr,
            attackerArmyId: atkArmyId,
            defenderArmyId: defArmyId,
            winner: combatResult.result.winner,
            loserRetreatQ: retreatQ,
            loserRetreatR: retreatR,
          });

          const winnerName = playerNames.get(armyPositions.get(winnerArmyId)!.ownerId) ?? '?';
          const loserName = playerNames.get(armyPositions.get(loserArmyId)!.ownerId) ?? '?';
          events.push({
            type: 'battle',
            description: `${winnerName} defeated ${loserName} at (${hq},${hr})`,
            playerIds: [armyPositions.get(winnerArmyId)!.ownerId, armyPositions.get(loserArmyId)!.ownerId],
          });
        }
      }
    }
  }

  // Build final positions
  const positions = new Map<string, { hexQ: number; hexR: number; movementPath: Array<{ q: number; r: number }> | null }>();
  for (const wa of workingArmies) {
    const reachedEnd = wa.pathIndex >= (wa.army.movementPath!.length - 1);
    positions.set(wa.army.id, {
      hexQ: wa.currentQ,
      hexR: wa.currentR,
      movementPath: reachedEnd ? null : wa.army.movementPath,
    });
  }

  return { positions, movementLog, combatLogs, events, unitUpdates };
}

// ── Combat helper ──

function resolveCombatBetween(opts: {
  gameId: string;
  turnNumber: number;
  hKey: string;
  atkArmyId: string;
  defArmyId: string;
  armies: ArmyForMovement[];
  unitsByArmy: Map<string, UnitForCombat[]>;
  templates: UnitTemplate[];
  weaponDesigns: WeaponDesign[];
  generals: Map<string, GeneralInfo>;
  hexTerrainMap: Map<string, TerrainType>;
}): { result: CombatResult } | null {
  const { gameId, turnNumber, hKey, atkArmyId, defArmyId, armies, unitsByArmy, templates, weaponDesigns, generals, hexTerrainMap } = opts;

  const atkUnits = (unitsByArmy.get(atkArmyId) ?? []).filter(u => u.state !== 'destroyed');
  const defUnits = (unitsByArmy.get(defArmyId) ?? []).filter(u => u.state !== 'destroyed');

  if (atkUnits.length === 0 || defUnits.length === 0) return null;

  function buildCombatUnit(u: UnitForCombat): CombatUnitInput | null {
    const tmpl = templates.find(t => t.id === u.templateId) as UnitTemplate | undefined;
    if (!tmpl) return null;
    const troopCounts = (u.troopCounts ?? { rookie: 0, capable: 0, veteran: 0 }) as TroopCounts;
    const maxTroops = tmpl.isMounted
      ? tmpl.companiesOrSquadrons * MEN_PER_SQUADRON
      : tmpl.companiesOrSquadrons * MEN_PER_COMPANY;
    const stats = computeUnitStats(tmpl, weaponDesigns);
    return {
      id: u.id,
      templateId: tmpl.id,
      name: u.name ?? tmpl.name,
      position: (u.position ?? getDefaultPosition(tmpl.isMounted, tmpl.primary)) as UnitPosition,
      state: u.state as UnitState,
      xp: u.xp ?? 0,
      troopCounts,
      maxTroops,
      fire: stats.fire,
      shock: stats.shock,
      defence: stats.defence,
      morale: stats.morale,
      armour: stats.armour,
      ap: stats.ap,
      hitsOn: stats.hitsOn,
    };
  }

  const atkCombatUnits = atkUnits.map(buildCombatUnit).filter((u): u is CombatUnitInput => u !== null);
  const defCombatUnits = defUnits.map(buildCombatUnit).filter((u): u is CombatUnitInput => u !== null);

  if (atkCombatUnits.length === 0 || defCombatUnits.length === 0) return null;

  const combatTerrain = (hexTerrainMap.get(hKey) ?? 'plains') as TerrainType;
  const combatSeed = hashSeed(`${gameId}:${turnNumber}:${atkArmyId}:${defArmyId}`);

  // Look up generals via armies
  const atkArmy = armies.find(a => a.id === atkArmyId);
  const defArmy = armies.find(a => a.id === defArmyId);
  const atkGeneral = atkArmy?.generalId ? generals.get(atkArmy.generalId) : null;
  const defGeneral = defArmy?.generalId ? generals.get(defArmy.generalId) : null;

  const combatInput: CombatInput = {
    id: `combat-${turnNumber}-${atkArmyId}-${defArmyId}`,
    seed: combatSeed,
    terrain: combatTerrain,
    riverCrossing: false,
    attacker: {
      armyId: atkArmyId,
      commandRating: atkGeneral?.commandRating ?? 0,
      units: atkCombatUnits,
    },
    defender: {
      armyId: defArmyId,
      commandRating: defGeneral?.commandRating ?? 0,
      units: defCombatUnits,
    },
  };

  const result = resolveCombat(combatInput);
  return { result };
}
