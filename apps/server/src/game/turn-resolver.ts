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
  BUILDINGS, COST_TIERS, TECH_TREE, SETTLEMENT_TIERS,
  STABILITY_PER_TURN,
  getNextTier, TIER_ORDER,
  hexNeighbors, hexKey,
  updateArmySupply, calculateHexSupply, ATTRITION_STRENGTH_LOSS,
  type TurnOrders, emptyOrders,
  type TaxRate, type BuildingType, type ResourceType, type SettlementTier,
  type TerrainType, type Season,
} from '@kingdoms/shared';

export interface TurnResult {
  events: EventEntry[];
  gameOver: boolean;
  winnerId: string | null;
}

interface EventEntry {
  type: string;
  description: string;
  playerIds: string[];
}

export async function resolveTurn(gameId: string, turnNumber: number): Promise<TurnResult> {
  const events: EventEntry[] = [];
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
  // STEP 5: Research Progress (handled above in Step 2 alongside production)
  // ══════════════════════════════════════════════

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
    combatLogs: [],
    eventLog: events as any,
  });

  // Check for game over (all players but one eliminated)
  const alivePlayers = activePlayers.filter(p => !p.isEliminated);
  const gameOver = alivePlayers.length <= 1;
  const winnerId = gameOver && alivePlayers.length === 1 ? alivePlayers[0].id : null;

  return { events, gameOver, winnerId };
}
