/**
 * Turn Resolution Engine.
 * Executes all player orders for a turn and produces the new game state.
 * Phase 2 implements steps 1-5 + 13 (tax, production, upkeep, construction, research, pop growth).
 */

import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import {
  getSeason, isMajorTurnEnd,
  calculateSettlementProduction, calculateTaxIncome,
  calculateUpkeep, calculateFoodConsumption, getStorageCap,
  calculatePopGrowth, calculateStarvation,
  BUILDINGS, COST_TIERS, TECH_TREE, SETTLEMENT_TIERS, UNITS, TERRAIN,
  STABILITY_PER_TURN, RIVER_CROSSING_COST,
  getNextTier, TIER_ORDER,
  hexNeighbors, hexKey, hexDistance, hasRiverBetween,
  updateArmySupply, calculateHexSupply, ATTRITION_STRENGTH_LOSS,
  resolveCombat, resolveSiegeAssault,
  type CombatInput, type ArmySide, type CombatUnitInput, type CombatResult,
  type TurnOrders, emptyOrders,
  type TaxRate, type BuildingType, type ResourceType, type SettlementTier,
  type TerrainType, type UnitType, type UnitState, type Veterancy, type UnitPosition,
  type HexDirection, type Season,
} from '@kingdoms/shared';

export interface TurnResult {
  events: EventEntry[];
  combatLogs: CombatResult[];
  gameOver: boolean;
  winnerId: string | null;
}

interface EventEntry {
  type: string;
  description: string;
  playerIds: string[];
}

/** Simple string hash to generate a deterministic combat seed. */
function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

export async function resolveTurn(gameId: string, turnNumber: number): Promise<TurnResult> {
  const events: EventEntry[] = [];
  const combatLogs: CombatResult[] = [];
  const season = getSeason(turnNumber);
  const isMajorEnd = isMajorTurnEnd(turnNumber);

  // Load game state
  const [game] = await db.select().from(schema.games).where(eq(schema.games.id, gameId));
  if (!game) throw new Error(`Game ${gameId} not found`);

  const players = await db.select().from(schema.players)
    .where(eq(schema.players.gameId, gameId));

  const activePlayers = players.filter(p => !p.isEliminated && !p.isSpectator);

  // Load submitted orders (use empty orders for players who didn't submit)
  const orderRows = await db.select().from(schema.turnOrders)
    .where(and(
      eq(schema.turnOrders.gameId, gameId),
      eq(schema.turnOrders.turnNumber, turnNumber),
    ));

  const ordersByPlayer = new Map<string, TurnOrders>();
  for (const row of orderRows) {
    ordersByPlayer.set(row.playerId, row.orders as unknown as TurnOrders);
  }

  // ══════════════════════════════════════════════
  // STEP 1: Tax Rate Changes
  // ══════════════════════════════════════════════
  for (const player of activePlayers) {
    const orders = ordersByPlayer.get(player.id) ?? emptyOrders(player.taxRate as TaxRate);
    if (orders.taxRate !== player.taxRate) {
      await db.update(schema.players)
        .set({ taxRate: orders.taxRate })
        .where(eq(schema.players.id, player.id));
    }
  }

  // Reload players after tax rate changes
  const updatedPlayers = await db.select().from(schema.players)
    .where(eq(schema.players.gameId, gameId));

  // ══════════════════════════════════════════════
  // STEP 2: Resource Production
  // ══════════════════════════════════════════════
  const settlements = await db.select().from(schema.settlements)
    .where(eq(schema.settlements.gameId, gameId));

  for (const settlement of settlements) {
    const buildings = await db.select().from(schema.buildings)
      .where(eq(schema.buildings.settlementId, settlement.id));

    const [hex] = await db.select().from(schema.gameHexes)
      .where(and(
        eq(schema.gameHexes.gameId, gameId),
        eq(schema.gameHexes.q, settlement.hexQ),
        eq(schema.gameHexes.r, settlement.hexR),
      ));

    const production = calculateSettlementProduction(
      buildings.map(b => ({ type: b.type as BuildingType, isConstructing: b.isConstructing })),
      settlement.population,
      settlement.popCap,
      (hex?.resources ?? []) as ResourceType[],
      settlement.storage as Partial<Record<ResourceType, number>>,
      season,
    );

    // Apply production to storage
    const storage = { ...(settlement.storage as Record<string, number>) };
    const storageCap = getStorageCap(settlement.tier as SettlementTier);

    // Subtract consumed inputs
    for (const [resource, amount] of Object.entries(production.consumed)) {
      storage[resource] = Math.max(0, (storage[resource] ?? 0) - (amount ?? 0));
    }

    // Add produced outputs (capped by storage)
    for (const [resource, amount] of Object.entries(production.produced)) {
      storage[resource] = Math.min(storageCap, (storage[resource] ?? 0) + (amount ?? 0));
    }

    // Food consumption
    const foodNeeded = calculateFoodConsumption(settlement.population);
    const foodAvailable = storage['food'] ?? 0;
    const foodBalance = foodAvailable - foodNeeded;
    storage['food'] = Math.max(0, foodBalance);

    await db.update(schema.settlements)
      .set({ storage })
      .where(eq(schema.settlements.id, settlement.id));

    // Track research points for player
    if (production.researchPoints > 0) {
      const player = updatedPlayers.find(p => p.id === settlement.ownerId);
      if (player?.currentResearch) {
        const [techRow] = await db.select().from(schema.techProgress)
          .where(and(
            eq(schema.techProgress.gameId, gameId),
            eq(schema.techProgress.playerId, player.id),
            eq(schema.techProgress.tech, player.currentResearch),
          ));

        if (techRow && !techRow.isResearched) {
          const newPoints = techRow.researchPoints + production.researchPoints;
          const techDef = TECH_TREE[player.currentResearch as keyof typeof TECH_TREE];
          const isComplete = techDef && newPoints >= techDef.researchCost;

          await db.update(schema.techProgress)
            .set({
              researchPoints: newPoints,
              isResearched: isComplete,
            })
            .where(eq(schema.techProgress.id, techRow.id));

          if (isComplete) {
            events.push({
              type: 'tech_researched',
              description: `${player.countryName} has researched ${techDef.name}`,
              playerIds: [player.id],
            });
          }
        }
      }
    }

    // Population: starvation if food deficit
    if (foodBalance < 0) {
      const popLoss = calculateStarvation(settlement.population, foodBalance);
      if (popLoss > 0) {
        await db.update(schema.settlements)
          .set({ population: Math.max(0, settlement.population - popLoss) })
          .where(eq(schema.settlements.id, settlement.id));

        events.push({
          type: 'starvation',
          description: `${settlement.name} lost ${popLoss} population to famine`,
          playerIds: [settlement.ownerId],
        });
      }
    }
  }

  // ══════════════════════════════════════════════
  // STEP 3: Gold — Tax Income & Upkeep
  // ══════════════════════════════════════════════
  for (const player of activePlayers) {
    const playerSettlements = settlements.filter(s => s.ownerId === player.id);
    const totalPop = playerSettlements.reduce((sum, s) => sum + s.population, 0);

    const taxRate = (updatedPlayers.find(p => p.id === player.id)?.taxRate ?? 'low') as TaxRate;
    const taxIncome = calculateTaxIncome(totalPop, taxRate);

    // Gather all building types for upkeep
    const allBuildings: BuildingType[] = [];
    for (const s of playerSettlements) {
      const buildings = await db.select().from(schema.buildings)
        .where(eq(schema.buildings.settlementId, s.id));
      for (const b of buildings) {
        if (!b.isConstructing) allBuildings.push(b.type as BuildingType);
      }
    }

    // Count army units
    const armies = await db.select().from(schema.armies)
      .where(and(eq(schema.armies.gameId, gameId), eq(schema.armies.ownerId, player.id)));
    let unitCount = 0;
    for (const army of armies) {
      const units = await db.select().from(schema.units)
        .where(eq(schema.units.armyId, army.id));
      unitCount += units.filter(u => u.state !== 'destroyed').length;
    }

    const upkeep = calculateUpkeep(allBuildings, unitCount);

    const currentGold = player.gold;
    const newGold = currentGold + taxIncome - upkeep.total;

    await db.update(schema.players)
      .set({ gold: newGold })
      .where(eq(schema.players.id, player.id));

    // Deficit stability hit
    if (newGold < 0) {
      const currentStability = player.stability;
      const newStability = Math.round(Math.max(0, currentStability + STABILITY_PER_TURN.gold_deficit));
      await db.update(schema.players)
        .set({ stability: newStability })
        .where(eq(schema.players.id, player.id));
    }
  }

  // ══════════════════════════════════════════════
  // STEP 4: Construction Progress
  // ══════════════════════════════════════════════
  for (const player of activePlayers) {
    const orders = ordersByPlayer.get(player.id) ?? emptyOrders(player.taxRate as TaxRate);

    // Process new construction orders
    for (const order of orders.constructions) {
      const [settlement] = await db.select().from(schema.settlements)
        .where(eq(schema.settlements.id, order.settlementId));
      if (!settlement || settlement.ownerId !== player.id) continue;

      const def = BUILDINGS[order.buildingType];
      if (!def) continue;

      const existingBuildings = await db.select().from(schema.buildings)
        .where(eq(schema.buildings.settlementId, settlement.id));

      // Check slot availability
      const usedSlots = existingBuildings.filter(b => {
        const bDef = BUILDINGS[b.type as BuildingType];
        return bDef?.usesSlot !== false;
      }).length;

      const tier = settlement.tier as SettlementTier;
      const { buildingSlots } = SETTLEMENT_TIERS[tier];

      if (def.usesSlot && usedSlots >= buildingSlots) continue;

      // Check gold cost
      const cost = COST_TIERS[def.costTier];
      const playerRow = updatedPlayers.find(p => p.id === player.id);
      if (!playerRow || playerRow.gold < cost.goldCost) continue;

      // Deduct gold
      await db.update(schema.players)
        .set({ gold: playerRow.gold - cost.goldCost })
        .where(eq(schema.players.id, player.id));

      // Check material costs from settlement storage
      const storage = { ...(settlement.storage as Record<string, number>) };
      let hasMaterials = true;
      for (const mat of def.materials) {
        if ((storage[mat] ?? 0) < 1) { hasMaterials = false; break; }
      }
      if (!hasMaterials) continue;

      // Deduct materials
      for (const mat of def.materials) {
        storage[mat] = (storage[mat] ?? 0) - 1;
      }
      await db.update(schema.settlements)
        .set({ storage })
        .where(eq(schema.settlements.id, settlement.id));

      // Create the building
      const nextSlot = existingBuildings.length;
      await db.insert(schema.buildings).values({
        settlementId: settlement.id,
        type: order.buildingType,
        slotIndex: nextSlot,
        isConstructing: cost.buildTime > 1,
        turnsRemaining: Math.max(0, cost.buildTime - 1),
      });

      events.push({
        type: 'construction_started',
        description: `${settlement.name} began construction of ${order.buildingType}`,
        playerIds: [player.id],
      });
    }
  }

  // Advance existing construction timers
  const allSettlements = await db.select().from(schema.settlements)
    .where(eq(schema.settlements.gameId, gameId));

  for (const settlement of allSettlements) {
    const buildings = await db.select().from(schema.buildings)
      .where(eq(schema.buildings.settlementId, settlement.id));

    for (const building of buildings) {
      if (!building.isConstructing) continue;

      const newRemaining = building.turnsRemaining - 1;
      if (newRemaining <= 0) {
        await db.update(schema.buildings)
          .set({ isConstructing: false, turnsRemaining: 0 })
          .where(eq(schema.buildings.id, building.id));

        events.push({
          type: 'construction_complete',
          description: `${settlement.name} completed ${building.type}`,
          playerIds: [settlement.ownerId],
        });
      } else {
        await db.update(schema.buildings)
          .set({ turnsRemaining: newRemaining })
          .where(eq(schema.buildings.id, building.id));
      }
    }
  }

  // ══════════════════════════════════════════════
  // STEP 5: Research Selection + Progress (points handled in Step 2)
  // ══════════════════════════════════════════════
  for (const player of activePlayers) {
    const orders = ordersByPlayer.get(player.id) ?? emptyOrders(player.taxRate as TaxRate);

    // Update current research from orders
    if (orders.techResearch !== undefined) {
      await db.update(schema.players)
        .set({ currentResearch: orders.techResearch })
        .where(eq(schema.players.id, player.id));

      // Ensure tech_progress row exists for the selected tech
      if (orders.techResearch) {
        const existing = await db.select().from(schema.techProgress)
          .where(and(
            eq(schema.techProgress.gameId, gameId),
            eq(schema.techProgress.playerId, player.id),
            eq(schema.techProgress.tech, orders.techResearch),
          ));
        if (existing.length === 0) {
          await db.insert(schema.techProgress).values({
            gameId,
            playerId: player.id,
            tech: orders.techResearch,
          });
        }
      }
    }
  }

  // ══════════════════════════════════════════════
  // STEP 6: New Settlements & Settlement Upgrades
  // ══════════════════════════════════════════════
  const allHexes = await db.select().from(schema.gameHexes)
    .where(eq(schema.gameHexes.gameId, gameId));

  for (const player of activePlayers) {
    const orders = ordersByPlayer.get(player.id) ?? emptyOrders(player.taxRate as TaxRate);

    // ── Settlement upgrades ──
    for (const upgradeOrder of orders.settlementUpgrades) {
      const [settlement] = await db.select().from(schema.settlements)
        .where(eq(schema.settlements.id, upgradeOrder.settlementId));
      if (!settlement || settlement.ownerId !== player.id) continue;

      const currentTier = settlement.tier as SettlementTier;
      const nextTier = getNextTier(currentTier);
      if (!nextTier) continue; // Already max tier

      // Check pop cap reached
      if (settlement.population < settlement.popCap) continue;

      const upgradeCost = SETTLEMENT_TIERS[currentTier].upgradeCost;
      const playerRow = updatedPlayers.find(p => p.id === player.id);
      if (!playerRow || playerRow.gold < upgradeCost.gold) continue;

      // Check resource costs from settlement storage
      const storage = { ...(settlement.storage as Record<string, number>) };
      let hasMaterials = true;
      for (const [resource, amount] of Object.entries(upgradeCost.resources)) {
        if ((storage[resource] ?? 0) < (amount ?? 0)) { hasMaterials = false; break; }
      }
      if (!hasMaterials) continue;

      // Deduct costs
      await db.update(schema.players)
        .set({ gold: playerRow.gold - upgradeCost.gold })
        .where(eq(schema.players.id, player.id));

      for (const [resource, amount] of Object.entries(upgradeCost.resources)) {
        storage[resource] = (storage[resource] ?? 0) - (amount ?? 0);
      }

      const nextTierDef = SETTLEMENT_TIERS[nextTier];
      await db.update(schema.settlements)
        .set({
          tier: nextTier,
          popCap: nextTierDef.popCap,
          storage,
        })
        .where(eq(schema.settlements.id, settlement.id));

      events.push({
        type: 'settlement_upgraded',
        description: `${settlement.name} upgraded to ${nextTier}`,
        playerIds: [player.id],
      });
    }

    // ── New settlements ──
    for (const newSettlement of orders.newSettlements) {
      // Validate hex is owned by player
      const targetHex = allHexes.find(
        h => h.q === newSettlement.hexQ && h.r === newSettlement.hexR && h.ownerId === player.id
      );
      if (!targetHex) continue;

      // Validate no existing settlement on this hex
      if (targetHex.settlementId) continue;

      // Validate no adjacent settlements
      const neighbors = hexNeighbors({ q: newSettlement.hexQ, r: newSettlement.hexR });
      const hasAdjacentSettlement = neighbors.some(n =>
        allHexes.some(h => h.q === n.q && h.r === n.r && h.settlementId != null)
      );
      if (hasAdjacentSettlement) continue;

      // Cost: hamlet upgrade cost (gold + resources from nearest settlement storage)
      const hamletCost = SETTLEMENT_TIERS.hamlet.upgradeCost;
      const playerRow = updatedPlayers.find(p => p.id === player.id);
      if (!playerRow || playerRow.gold < hamletCost.gold) continue;

      // Deduct gold
      await db.update(schema.players)
        .set({ gold: playerRow.gold - hamletCost.gold })
        .where(eq(schema.players.id, player.id));

      // Create the hamlet settlement
      const [settlement] = await db.insert(schema.settlements).values({
        gameId,
        hexQ: newSettlement.hexQ,
        hexR: newSettlement.hexR,
        ownerId: player.id,
        name: newSettlement.name || `${player.countryName} Settlement`,
        tier: 'hamlet' as SettlementTier,
        population: 50,
        popCap: SETTLEMENT_TIERS.hamlet.popCap,
        isCapital: false,
        storage: {},
      }).returning();

      // Link to hex
      await db.update(schema.gameHexes)
        .set({ settlementId: settlement.id })
        .where(and(
          eq(schema.gameHexes.gameId, gameId),
          eq(schema.gameHexes.q, newSettlement.hexQ),
          eq(schema.gameHexes.r, newSettlement.hexR),
        ));

      events.push({
        type: 'settlement_founded',
        description: `${player.countryName} founded ${settlement.name}`,
        playerIds: [player.id],
      });
    }
  }

  // ══════════════════════════════════════════════
  // STEP 6b: Recruitment
  // ══════════════════════════════════════════════
  for (const player of activePlayers) {
    const orders = ordersByPlayer.get(player.id) ?? emptyOrders(player.taxRate as TaxRate);

    for (const recruit of orders.recruitments) {
      const [settlement] = await db.select().from(schema.settlements)
        .where(eq(schema.settlements.id, recruit.settlementId));
      if (!settlement || settlement.ownerId !== player.id) continue;

      // Verify army exists and belongs to player
      const [army] = await db.select().from(schema.armies)
        .where(eq(schema.armies.id, recruit.armyId));
      if (!army || army.ownerId !== player.id) continue;

      // Army must be at the settlement's hex
      if (army.hexQ !== settlement.hexQ || army.hexR !== settlement.hexR) continue;

      const unitType = recruit.unitType as UnitType;
      const unitDef = UNITS[unitType];
      if (!unitDef) continue;

      // Check equipment in settlement storage
      const storage = { ...(settlement.storage as Record<string, number>) };
      let hasEquipment = true;
      for (const equip of unitDef.equipment) {
        if ((storage[equip] ?? 0) < 1) { hasEquipment = false; break; }
      }
      if (!hasEquipment) continue;

      // Check settlement has barracks (required for recruitment)
      const buildings = await db.select().from(schema.buildings)
        .where(eq(schema.buildings.settlementId, settlement.id));
      const hasBarracks = buildings.some(b => b.type === 'barracks' && !b.isConstructing);
      if (!hasBarracks) continue;

      // Deduct equipment
      for (const equip of unitDef.equipment) {
        storage[equip] = (storage[equip] ?? 0) - 1;
      }
      await db.update(schema.settlements)
        .set({ storage })
        .where(eq(schema.settlements.id, settlement.id));

      // Recruit gold cost: 200 per unit
      const recruitCost = 200;
      const playerRow = updatedPlayers.find(p => p.id === player.id);
      if (!playerRow || playerRow.gold < recruitCost) continue;
      await db.update(schema.players)
        .set({ gold: playerRow.gold - recruitCost })
        .where(eq(schema.players.id, player.id));

      // Create the unit
      await db.insert(schema.units).values({
        armyId: army.id,
        type: unitType,
        position: unitDef.defaultPosition,
        strengthPct: 100,
        state: 'full',
        veterancy: 'fresh',
        xp: 0,
      });

      events.push({
        type: 'unit_recruited',
        description: `${player.countryName} recruited ${unitType} in ${settlement.name}`,
        playerIds: [player.id],
      });
    }
  }

  // ══════════════════════════════════════════════
  // STEP 6c: Hire Generals & Create Armies
  // ══════════════════════════════════════════════
  for (const player of activePlayers) {
    const orders = ordersByPlayer.get(player.id) ?? emptyOrders(player.taxRate as TaxRate);

    // Hire generals
    for (const hireOrder of (orders.hireGenerals ?? [])) {
      const [settlement] = await db.select().from(schema.settlements)
        .where(eq(schema.settlements.id, hireOrder.settlementId));
      if (!settlement || settlement.ownerId !== player.id) continue;

      // General costs 1000 gold
      const generalCost = 1000;
      const playerRow = updatedPlayers.find(p => p.id === player.id);
      if (!playerRow || playerRow.gold < generalCost) continue;

      await db.update(schema.players)
        .set({ gold: playerRow.gold - generalCost })
        .where(eq(schema.players.id, player.id));

      await db.insert(schema.generals).values({
        gameId,
        ownerId: player.id,
        name: hireOrder.name || `General ${player.countryName}`,
        commandRating: 2,
        isAdmiral: hireOrder.isAdmiral ?? false,
      });

      events.push({
        type: 'general_hired',
        description: `${player.countryName} hired general ${hireOrder.name}`,
        playerIds: [player.id],
      });
    }

    // Create new armies
    for (const armyOrder of (orders.createArmies ?? [])) {
      // Must be on an owned hex
      const targetHex = allHexes.find(
        h => h.q === armyOrder.hexQ && h.r === armyOrder.hexR && h.ownerId === player.id
      );
      if (!targetHex) continue;

      await db.insert(schema.armies).values({
        gameId,
        ownerId: player.id,
        name: armyOrder.name || `${player.countryName} Army`,
        hexQ: armyOrder.hexQ,
        hexR: armyOrder.hexR,
      });

      events.push({
        type: 'army_created',
        description: `${player.countryName} raised ${armyOrder.name}`,
        playerIds: [player.id],
      });
    }
  }

  // ══════════════════════════════════════════════
  // STEP 7: Trade Resolution (standing + one-time transfers)
  // ══════════════════════════════════════════════
  for (const player of activePlayers) {
    const orders = ordersByPlayer.get(player.id) ?? emptyOrders(player.taxRate as TaxRate);

    // Cancel trades
    for (const cancelId of (orders.tradeCancellations ?? [])) {
      await db.delete(schema.tradeAgreements)
        .where(eq(schema.tradeAgreements.id, cancelId));
    }

    // New trade proposals → create agreements (auto-accept for V1 simplicity)
    for (const proposal of (orders.tradeProposals ?? [])) {
      // Find nearest settlements for both players to check distance
      await db.insert(schema.tradeAgreements).values({
        gameId,
        playerAId: player.id,
        playerBId: proposal.recipientId,
        tier: 'trade_route',
        terms: {
          offeredResources: proposal.offeredResources,
          requestedResources: proposal.requestedResources,
        },
        isStanding: proposal.isStanding,
        startedTurn: turnNumber,
      });

      events.push({
        type: 'trade_established',
        description: `${player.countryName} established trade`,
        playerIds: [player.id, proposal.recipientId],
      });
    }
  }

  // Execute standing trade agreements
  const activeTradeAgreements = await db.select().from(schema.tradeAgreements)
    .where(eq(schema.tradeAgreements.gameId, gameId));

  for (const trade of activeTradeAgreements) {
    const terms = trade.terms as any;
    if (!terms?.offeredResources || !terms?.requestedResources) continue;

    // Find settlements for both players
    const [playerASettlement] = await db.select().from(schema.settlements)
      .where(and(eq(schema.settlements.gameId, gameId), eq(schema.settlements.ownerId, trade.playerAId), eq(schema.settlements.isCapital, true)));
    const [playerBSettlement] = await db.select().from(schema.settlements)
      .where(and(eq(schema.settlements.gameId, gameId), eq(schema.settlements.ownerId, trade.playerBId), eq(schema.settlements.isCapital, true)));

    if (!playerASettlement || !playerBSettlement) continue;

    // Transfer: A offers → goes to B's capital storage; B offers (requested) → goes to A's capital storage
    const storageA = { ...(playerASettlement.storage as Record<string, number>) };
    const storageB = { ...(playerBSettlement.storage as Record<string, number>) };

    let canFulfill = true;
    // Check A has offered resources
    for (const offer of terms.offeredResources) {
      if ((storageA[offer.resource] ?? 0) < offer.amount) { canFulfill = false; break; }
    }
    // Check B has requested resources (what B sends to A)
    if (canFulfill) {
      for (const req of terms.requestedResources) {
        if ((storageB[req.resource] ?? 0) < req.amount) { canFulfill = false; break; }
      }
    }

    if (!canFulfill) continue;

    // Execute transfers
    for (const offer of terms.offeredResources) {
      storageA[offer.resource] = (storageA[offer.resource] ?? 0) - offer.amount;
      storageB[offer.resource] = (storageB[offer.resource] ?? 0) + offer.amount;
    }
    for (const req of terms.requestedResources) {
      storageB[req.resource] = (storageB[req.resource] ?? 0) - req.amount;
      storageA[req.resource] = (storageA[req.resource] ?? 0) + req.amount;
    }

    await db.update(schema.settlements).set({ storage: storageA }).where(eq(schema.settlements.id, playerASettlement.id));
    await db.update(schema.settlements).set({ storage: storageB }).where(eq(schema.settlements.id, playerBSettlement.id));

    // Remove one-time agreements after execution
    if (!trade.isStanding) {
      await db.delete(schema.tradeAgreements).where(eq(schema.tradeAgreements.id, trade.id));
    }
  }

  // ══════════════════════════════════════════════
  // STEP 8: Letter Delivery
  // ══════════════════════════════════════════════
  const undeliveredLetters = await db.select().from(schema.letters)
    .where(and(
      eq(schema.letters.gameId, gameId),
      eq(schema.letters.isDelivered, false),
    ));

  for (const letter of undeliveredLetters) {
    if (turnNumber >= letter.deliveryTurn) {
      await db.update(schema.letters)
        .set({ isDelivered: true })
        .where(eq(schema.letters.id, letter.id));

      const sender = activePlayers.find(p => p.id === letter.senderId);
      events.push({
        type: 'letter_delivered',
        description: `Letter from ${sender?.countryName ?? '?'} has arrived`,
        playerIds: [letter.recipientId],
      });
    }
  }

  // ══════════════════════════════════════════════
  // STEP 9: Movement (all armies advance simultaneously)
  // ══════════════════════════════════════════════
  // First, set movement paths from orders
  for (const player of activePlayers) {
    const orders = ordersByPlayer.get(player.id) ?? emptyOrders(player.taxRate as TaxRate);

    for (const moveOrder of orders.movements) {
      const [army] = await db.select().from(schema.armies)
        .where(eq(schema.armies.id, moveOrder.armyId));
      if (!army || army.ownerId !== player.id) continue;
      if (moveOrder.path.length < 2) continue;

      await db.update(schema.armies)
        .set({ movementPath: moveOrder.path as any })
        .where(eq(schema.armies.id, army.id));
    }
  }

  // Build hex data map and river edges map for movement cost
  const hexDataForMovement = await db.select().from(schema.gameHexes)
    .where(eq(schema.gameHexes.gameId, gameId));

  const hexTerrainMap = new Map<string, TerrainType>();
  const hexRiverEdges = new Map<string, HexDirection[]>();
  for (const h of hexDataForMovement) {
    const key = hexKey({ q: h.q, r: h.r });
    hexTerrainMap.set(key, h.terrain as TerrainType);
    hexRiverEdges.set(key, (h.riverEdges ?? []) as HexDirection[]);
  }

  // Resolve movement: each army spends movement points to advance along its path
  const BASE_MOVEMENT_POINTS = 4; // points per turn

  const movingArmies = await db.select().from(schema.armies)
    .where(eq(schema.armies.gameId, gameId));

  for (const army of movingArmies) {
    const path = army.movementPath as Array<{ q: number; r: number }> | null;
    if (!path || path.length < 2) continue;

    let remainingMP = BASE_MOVEMENT_POINTS;
    let currentQ = army.hexQ;
    let currentR = army.hexR;
    let pathIndex = 0;

    // Find where we are on the path
    for (let i = 0; i < path.length; i++) {
      if (path[i].q === currentQ && path[i].r === currentR) {
        pathIndex = i;
        break;
      }
    }

    // Advance along the path spending movement points
    while (pathIndex < path.length - 1 && remainingMP > 0) {
      const nextHex = path[pathIndex + 1];
      const nextKey = hexKey(nextHex);
      const terrain = hexTerrainMap.get(nextKey);
      if (!terrain) break; // invalid hex

      // Mountains are impassable for armies (unless there's a road — future feature)
      if (terrain === 'mountains') break;

      let moveCost = TERRAIN[terrain].movementCost;

      // River crossing penalty
      if (hasRiverBetween(
        { q: currentQ, r: currentR },
        nextHex,
        hexRiverEdges,
      )) {
        moveCost += RIVER_CROSSING_COST;
      }

      if (remainingMP < moveCost) break; // not enough MP

      remainingMP -= moveCost;
      currentQ = nextHex.q;
      currentR = nextHex.r;
      pathIndex++;
    }

    // Update army position
    if (currentQ !== army.hexQ || currentR !== army.hexR) {
      // Clear path if we've reached the end
      const reachedEnd = pathIndex >= path.length - 1;
      await db.update(schema.armies)
        .set({
          hexQ: currentQ,
          hexR: currentR,
          movementPath: reachedEnd ? null : path as any,
        })
        .where(eq(schema.armies.id, army.id));
    }
  }

  // ══════════════════════════════════════════════
  // STEP 10: Combat (triggered by army collisions after movement)
  // ══════════════════════════════════════════════
  const postMoveArmies = await db.select().from(schema.armies)
    .where(eq(schema.armies.gameId, gameId));

  // Group armies by hex
  const armiesByHex = new Map<string, typeof postMoveArmies>();
  for (const army of postMoveArmies) {
    const key = hexKey({ q: army.hexQ, r: army.hexR });
    const list = armiesByHex.get(key) ?? [];
    list.push(army);
    armiesByHex.set(key, list);
  }

  // Track armies already resolved in combat this turn
  const resolvedArmyIds = new Set<string>();

  for (const [hKey, hexArmies] of armiesByHex) {
    if (hexArmies.length < 2) continue;

    // Group by owner
    const byOwner = new Map<string, typeof hexArmies>();
    for (const a of hexArmies) {
      const list = byOwner.get(a.ownerId) ?? [];
      list.push(a);
      byOwner.set(a.ownerId, list);
    }

    if (byOwner.size < 2) continue; // no enemy collision

    const ownerIds = [...byOwner.keys()];
    // Resolve pairwise: first two owners fight (simplification for V1)
    const attackerOwnerId = ownerIds[0];
    const defenderOwnerId = ownerIds[1];
    const attackerArmies = byOwner.get(attackerOwnerId)!;
    const defenderArmies = byOwner.get(defenderOwnerId)!;

    // Use the first army from each side as the main combatant
    const atkArmy = attackerArmies[0];
    const defArmy = defenderArmies[0];

    if (resolvedArmyIds.has(atkArmy.id) || resolvedArmyIds.has(defArmy.id)) continue;

    // Load units for both armies
    const atkUnits = await db.select().from(schema.units)
      .where(eq(schema.units.armyId, atkArmy.id));
    const defUnits = await db.select().from(schema.units)
      .where(eq(schema.units.armyId, defArmy.id));

    const activeAtkUnits = atkUnits.filter(u => u.state !== 'destroyed');
    const activeDefUnits = defUnits.filter(u => u.state !== 'destroyed');

    if (activeAtkUnits.length === 0 || activeDefUnits.length === 0) continue;

    // Load generals
    const [atkGeneral] = atkArmy.generalId
      ? await db.select().from(schema.generals).where(eq(schema.generals.id, atkArmy.generalId))
      : [null];
    const [defGeneral] = defArmy.generalId
      ? await db.select().from(schema.generals).where(eq(schema.generals.id, defArmy.generalId))
      : [null];

    // Get terrain
    const combatHex = hexDataForMovement.find(h => hexKey({ q: h.q, r: h.r }) === hKey);
    const combatTerrain = (combatHex?.terrain ?? 'plains') as TerrainType;

    // Generate combat seed
    const combatSeed = hashSeed(`${gameId}:${turnNumber}:${atkArmy.id}:${defArmy.id}`);

    const combatInput: CombatInput = {
      id: `combat-${turnNumber}-${atkArmy.id}-${defArmy.id}`,
      seed: combatSeed,
      terrain: combatTerrain,
      riverCrossing: false,
      attacker: {
        armyId: atkArmy.id,
        commandRating: atkGeneral?.commandRating ?? 0,
        units: activeAtkUnits.map(u => ({
          id: u.id,
          type: u.type as UnitType,
          position: (u.position ?? 'frontline') as UnitPosition,
          strengthPct: u.strengthPct,
          state: u.state as UnitState,
          veterancy: (u.veterancy ?? 'fresh') as Veterancy,
          xp: u.xp ?? 0,
        })),
      },
      defender: {
        armyId: defArmy.id,
        commandRating: defGeneral?.commandRating ?? 0,
        units: activeDefUnits.map(u => ({
          id: u.id,
          type: u.type as UnitType,
          position: (u.position ?? 'frontline') as UnitPosition,
          strengthPct: u.strengthPct,
          state: u.state as UnitState,
          veterancy: (u.veterancy ?? 'fresh') as Veterancy,
          xp: u.xp ?? 0,
        })),
      },
    };

    const result = resolveCombat(combatInput);
    combatLogs.push(result);

    // Apply combat results to units in DB
    for (const loss of [...result.attackerLosses, ...result.defenderLosses]) {
      const newState = loss.destroyed ? 'destroyed'
        : loss.endStrength < 40 ? 'broken'
        : loss.endStrength < 60 ? 'depleted'
        : 'full';

      await db.update(schema.units)
        .set({
          strengthPct: Math.max(0, Math.round(loss.endStrength)),
          state: newState,
        })
        .where(eq(schema.units.id, loss.unitId));
    }

    // Loser retreats (move back 1 hex toward their territory)
    if (result.winner !== 'draw') {
      const loserArmy = result.winner === 'attacker' ? defArmy : atkArmy;
      const winnerArmy = result.winner === 'attacker' ? atkArmy : defArmy;

      // Find a neighboring hex to retreat to
      const neighbors = hexNeighbors({ q: loserArmy.hexQ, r: loserArmy.hexR });
      const retreatHex = neighbors.find(n => {
        const nh = hexDataForMovement.find(h => h.q === n.q && h.r === n.r);
        return nh && nh.terrain !== 'coast' && nh.terrain !== 'mountains';
      });

      if (retreatHex) {
        await db.update(schema.armies)
          .set({ hexQ: retreatHex.q, hexR: retreatHex.r, movementPath: null })
          .where(eq(schema.armies.id, loserArmy.id));
      }

      // Winner stops moving
      await db.update(schema.armies)
        .set({ movementPath: null })
        .where(eq(schema.armies.id, winnerArmy.id));

      const winnerPlayer = activePlayers.find(p => p.id === winnerArmy.ownerId);
      const loserPlayer = activePlayers.find(p => p.id === loserArmy.ownerId);
      events.push({
        type: 'battle',
        description: `${winnerPlayer?.countryName ?? '?'} defeated ${loserPlayer?.countryName ?? '?'} at (${loserArmy.hexQ},${loserArmy.hexR})`,
        playerIds: [winnerArmy.ownerId, loserArmy.ownerId],
      });
    }

    resolvedArmyIds.add(atkArmy.id);
    resolvedArmyIds.add(defArmy.id);
  }

  // ══════════════════════════════════════════════
  // STEP 11: Siege Assault + Capture/Raze
  // ══════════════════════════════════════════════
  for (const player of activePlayers) {
    const orders = ordersByPlayer.get(player.id) ?? emptyOrders(player.taxRate as TaxRate);

    for (const siege of (orders.siegeAssaults ?? [])) {
      const [army] = await db.select().from(schema.armies)
        .where(eq(schema.armies.id, siege.armyId));
      if (!army || army.ownerId !== player.id) continue;
      if (army.hexQ !== siege.targetHexQ || army.hexR !== siege.targetHexR) continue;

      // Find enemy settlement on this hex
      const [targetSettlement] = await db.select().from(schema.settlements)
        .where(and(
          eq(schema.settlements.gameId, gameId),
          eq(schema.settlements.hexQ, siege.targetHexQ),
          eq(schema.settlements.hexR, siege.targetHexR),
        ));
      if (!targetSettlement || targetSettlement.ownerId === player.id) continue;

      // Load attacker units
      const atkUnits = await db.select().from(schema.units)
        .where(eq(schema.units.armyId, army.id));
      const activeAtkUnits = atkUnits.filter(u => u.state !== 'destroyed');
      if (activeAtkUnits.length === 0) continue;

      // Load defender army (if any garrison)
      const defenderArmies = await db.select().from(schema.armies)
        .where(and(
          eq(schema.armies.gameId, gameId),
          eq(schema.armies.hexQ, siege.targetHexQ),
          eq(schema.armies.hexR, siege.targetHexR),
          eq(schema.armies.ownerId, targetSettlement.ownerId),
        ));

      let defenderUnits: typeof atkUnits = [];
      let defArmy = defenderArmies[0] ?? null;
      if (defArmy) {
        defenderUnits = await db.select().from(schema.units)
          .where(eq(schema.units.armyId, defArmy.id));
        defenderUnits = defenderUnits.filter(u => u.state !== 'destroyed');
      }

      // Load generals
      const [atkGeneral] = army.generalId
        ? await db.select().from(schema.generals).where(eq(schema.generals.id, army.generalId))
        : [null];
      const [defGeneral] = defArmy?.generalId
        ? await db.select().from(schema.generals).where(eq(schema.generals.id, defArmy.generalId))
        : [null];

      const combatHex = hexDataForMovement.find(
        h => h.q === siege.targetHexQ && h.r === siege.targetHexR
      );
      const siegeTerrain = (combatHex?.terrain ?? 'plains') as TerrainType;
      const siegeSeed = hashSeed(`${gameId}:${turnNumber}:siege:${army.id}`);

      const siegeInput: CombatInput = {
        id: `siege-${turnNumber}-${army.id}`,
        seed: siegeSeed,
        terrain: siegeTerrain,
        riverCrossing: false,
        attacker: {
          armyId: army.id,
          commandRating: atkGeneral?.commandRating ?? 0,
          units: activeAtkUnits.map(u => ({
            id: u.id,
            type: u.type as UnitType,
            position: (u.position ?? 'frontline') as UnitPosition,
            strengthPct: u.strengthPct,
            state: u.state as UnitState,
            veterancy: (u.veterancy ?? 'fresh') as Veterancy,
            xp: u.xp ?? 0,
          })),
        },
        defender: {
          armyId: defArmy?.id ?? 'garrison',
          commandRating: defGeneral?.commandRating ?? 0,
          units: defenderUnits.map(u => ({
            id: u.id,
            type: u.type as UnitType,
            position: (u.position ?? 'frontline') as UnitPosition,
            strengthPct: u.strengthPct,
            state: u.state as UnitState,
            veterancy: (u.veterancy ?? 'fresh') as Veterancy,
            xp: u.xp ?? 0,
          })),
        },
      };

      // If no garrison, attacker captures automatically
      if (defenderUnits.length === 0) {
        // Capture: 25% pop loss, transfer ownership
        const newPop = Math.round(targetSettlement.population * 0.75);
        await db.update(schema.settlements)
          .set({ ownerId: player.id, population: newPop })
          .where(eq(schema.settlements.id, targetSettlement.id));

        // Transfer hex ownership
        await db.update(schema.gameHexes)
          .set({ ownerId: player.id })
          .where(and(
            eq(schema.gameHexes.gameId, gameId),
            eq(schema.gameHexes.q, targetSettlement.hexQ),
            eq(schema.gameHexes.r, targetSettlement.hexR),
          ));

        events.push({
          type: 'settlement_captured',
          description: `${player.countryName} captured ${targetSettlement.name}`,
          playerIds: [player.id, targetSettlement.ownerId],
        });
        continue;
      }

      // Resolve siege assault
      const siegeResult = resolveSiegeAssault(siegeInput);
      combatLogs.push(siegeResult);

      // Apply casualties
      for (const loss of [...siegeResult.attackerLosses, ...siegeResult.defenderLosses]) {
        const newState = loss.destroyed ? 'destroyed'
          : loss.endStrength < 40 ? 'broken'
          : loss.endStrength < 60 ? 'depleted'
          : 'full';
        await db.update(schema.units)
          .set({ strengthPct: Math.max(0, Math.round(loss.endStrength)), state: newState })
          .where(eq(schema.units.id, loss.unitId));
      }

      if (siegeResult.winner === 'attacker') {
        // Capture: 25% pop loss, transfer ownership
        const newPop = Math.round(targetSettlement.population * 0.75);
        await db.update(schema.settlements)
          .set({ ownerId: player.id, population: newPop })
          .where(eq(schema.settlements.id, targetSettlement.id));

        await db.update(schema.gameHexes)
          .set({ ownerId: player.id })
          .where(and(
            eq(schema.gameHexes.gameId, gameId),
            eq(schema.gameHexes.q, targetSettlement.hexQ),
            eq(schema.gameHexes.r, targetSettlement.hexR),
          ));

        events.push({
          type: 'settlement_captured',
          description: `${player.countryName} captured ${targetSettlement.name} by assault`,
          playerIds: [player.id, targetSettlement.ownerId],
        });
      } else {
        events.push({
          type: 'siege_failed',
          description: `${player.countryName}'s assault on ${targetSettlement.name} was repelled`,
          playerIds: [player.id, targetSettlement.ownerId],
        });
      }
    }
  }

  // ══════════════════════════════════════════════
  // STEP 12: Hex Claiming (hold 1 Major Turn = 8 minor turns)
  // ══════════════════════════════════════════════
  const hexesForClaiming = await db.select().from(schema.gameHexes)
    .where(eq(schema.gameHexes.gameId, gameId));

  for (const hex of hexesForClaiming) {
    if (hex.claimStartedTurn && !hex.ownerId) {
      // Check if 8 turns have passed (1 Major Turn)
      if (turnNumber - hex.claimStartedTurn >= 8) {
        // Find army that started the claim — check if any army from the claimant is still there
        const armiesOnHex = await db.select().from(schema.armies)
          .where(and(
            eq(schema.armies.gameId, gameId),
            eq(schema.armies.hexQ, hex.q),
            eq(schema.armies.hexR, hex.r),
          ));

        if (armiesOnHex.length > 0) {
          const claimingArmy = armiesOnHex[0];
          await db.update(schema.gameHexes)
            .set({ ownerId: claimingArmy.ownerId, claimStartedTurn: null })
            .where(eq(schema.gameHexes.id, hex.id));

          const claimingPlayer = activePlayers.find(p => p.id === claimingArmy.ownerId);
          events.push({
            type: 'hex_claimed',
            description: `${claimingPlayer?.countryName ?? 'Unknown'} claimed hex (${hex.q},${hex.r})`,
            playerIds: [claimingArmy.ownerId],
          });
        }
      }
    }

    // Start claiming if army is on unclaimed hex
    if (!hex.ownerId && !hex.claimStartedTurn) {
      const armiesOnHex = await db.select().from(schema.armies)
        .where(and(
          eq(schema.armies.gameId, gameId),
          eq(schema.armies.hexQ, hex.q),
          eq(schema.armies.hexR, hex.r),
        ));

      if (armiesOnHex.length > 0) {
        await db.update(schema.gameHexes)
          .set({ claimStartedTurn: turnNumber })
          .where(eq(schema.gameHexes.id, hex.id));
      }
    }
  }

  // ══════════════════════════════════════════════
  // STEP 13: Population Growth
  // ══════════════════════════════════════════════
  const settlementsAfter = await db.select().from(schema.settlements)
    .where(eq(schema.settlements.gameId, gameId));

  for (const settlement of settlementsAfter) {
    const storage = settlement.storage as Record<string, number>;
    const foodAvailable = storage['food'] ?? 0;
    const foodNeeded = calculateFoodConsumption(settlement.population);
    const foodSurplus = foodAvailable - foodNeeded;

    if (foodSurplus > 0) {
      // Check if player has medicine tech
      const player = updatedPlayers.find(p => p.id === settlement.ownerId);
      let hasMedicine = false;
      if (player) {
        const [medTech] = await db.select().from(schema.techProgress)
          .where(and(
            eq(schema.techProgress.gameId, gameId),
            eq(schema.techProgress.playerId, player.id),
            eq(schema.techProgress.tech, 'medicine'),
          ));
        hasMedicine = medTech?.isResearched ?? false;
      }

      const growth = calculatePopGrowth(
        settlement.population,
        settlement.popCap,
        foodSurplus,
        hasMedicine,
      );

      if (growth > 0) {
        await db.update(schema.settlements)
          .set({ population: settlement.population + growth })
          .where(eq(schema.settlements.id, settlement.id));
      }
    }
  }

  // ══════════════════════════════════════════════
  // STEP 15 (partial): Stability from tax rate
  // ══════════════════════════════════════════════
  for (const player of activePlayers) {
    const taxRate = (updatedPlayers.find(p => p.id === player.id)?.taxRate ?? 'low') as TaxRate;
    let stabilityChange = 0;

    if (taxRate === 'low') stabilityChange = STABILITY_PER_TURN.tax_low;
    else if (taxRate === 'fair') stabilityChange = STABILITY_PER_TURN.tax_fair;
    else stabilityChange = STABILITY_PER_TURN.tax_cruel;

    // Check food shortage across all settlements
    const playerSettlements = settlementsAfter.filter(s => s.ownerId === player.id);
    const hasShortage = playerSettlements.some(s => {
      const st = s.storage as Record<string, number>;
      return (st['food'] ?? 0) <= 0;
    });
    if (hasShortage) stabilityChange += STABILITY_PER_TURN.food_shortage;

    // Passive recovery if no negative factors
    if (stabilityChange >= 0 && player.stability < 100) {
      stabilityChange += STABILITY_PER_TURN.passive_recovery;
    }

    const newStability = Math.round(Math.max(0, Math.min(100, player.stability + stabilityChange)));
    await db.update(schema.players)
      .set({ stability: newStability })
      .where(eq(schema.players.id, player.id));
  }

  // ══════════════════════════════════════════════
  // STEP 14: Supply Consumption + Attrition
  // ══════════════════════════════════════════════
  const armiesForSupply = await db.select().from(schema.armies)
    .where(eq(schema.armies.gameId, gameId));

  const latestHexes = await db.select().from(schema.gameHexes)
    .where(eq(schema.gameHexes.gameId, gameId));

  const latestSettlements = await db.select().from(schema.settlements)
    .where(eq(schema.settlements.gameId, gameId));

  for (const army of armiesForSupply) {
    const hex = latestHexes.find(h => h.q === army.hexQ && h.r === army.hexR);
    if (!hex) continue;

    const terrain = (hex.terrain ?? 'plains') as TerrainType;
    const isInFriendlyTerritory = hex.ownerId === army.ownerId;

    // Friendly settlements for supply calculation
    const friendlySettlements = latestSettlements
      .filter(s => s.ownerId === army.ownerId)
      .map(s => ({ q: s.hexQ, r: s.hexR }));

    const hexSupply = calculateHexSupply(
      { q: army.hexQ, r: army.hexR },
      terrain,
      friendlySettlements,
    );

    const { newSupply, isAttriting } = updateArmySupply(
      army.supplyBank,
      hexSupply,
      isInFriendlyTerritory,
    );

    await db.update(schema.armies)
      .set({ supplyBank: newSupply })
      .where(eq(schema.armies.id, army.id));

    // Apply attrition to units
    if (isAttriting) {
      const units = await db.select().from(schema.units)
        .where(eq(schema.units.armyId, army.id));

      for (const unit of units) {
        if (unit.state === 'destroyed') continue;
        const newStrength = Math.max(0, unit.strengthPct - ATTRITION_STRENGTH_LOSS);
        const newState = newStrength <= 0 ? 'destroyed' as const
          : newStrength <= 25 ? 'broken' as const
          : newStrength <= 50 ? 'depleted' as const
          : unit.state;

        await db.update(schema.units)
          .set({ strengthPct: newStrength, state: newState })
          .where(eq(schema.units.id, unit.id));
      }

      const ownerPlayer = activePlayers.find(p => p.id === army.ownerId);
      events.push({
        type: 'army_attrition',
        description: `${army.name} is suffering from supply attrition`,
        playerIds: [army.ownerId],
      });
    }
  }

  // ══════════════════════════════════════════════
  // Save turn snapshot
  // ══════════════════════════════════════════════
  await db.insert(schema.turnSnapshots).values({
    gameId,
    turnNumber,
    snapshot: {} as any, // TODO: full state snapshot in later phases
    combatLogs: combatLogs as any,
    eventLog: events as any,
  });

  // Check for game over (all players but one eliminated)
  const alivePlayers = activePlayers.filter(p => !p.isEliminated);
  const gameOver = alivePlayers.length <= 1;
  const winnerId = gameOver && alivePlayers.length === 1 ? alivePlayers[0].id : null;

  return { events, combatLogs, gameOver, winnerId };
}
