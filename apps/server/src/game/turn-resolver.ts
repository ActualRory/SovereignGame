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
  BUILDINGS, COST_TIERS, TECH_TREE, SETTLEMENT_TIERS, TERRAIN,
  STABILITY_PER_TURN, RIVER_CROSSING_COST,
  getNextTier, TIER_ORDER,
  hexNeighbors, hexKey, hexDistance, hasRiverBetween,
  updateArmySupply, calculateHexSupply, ATTRITION_STRENGTH_LOSS,
  resolveCombat, resolveSiegeAssault,
  calculateStabilityTurn, resolveWinterRoll, WINTER_ROLL_BONUS,
  getStabilityBand,
  getBaseStats, getDefaultPosition, MEN_PER_COMPANY, MEN_PER_SQUADRON,
  WEAPON_DESIGN_COST, WEAPON_DESIGN_DEVELOP_TURNS,
  PRIMARY_WEAPONS, SIDEARM_WEAPONS, ARMOUR_TYPES, WORKSHOP_POINTS_PER_TURN,
  computeUnitStats,
  type CombatInput, type ArmySide, type CombatUnitInput, type CombatResult,
  type TurnOrders, emptyOrders,
  type TaxRate, type BuildingType, type ResourceType, type SettlementTier,
  type TerrainType, type UnitState, type UnitPosition,
  type HexDirection, type Season, type StabilityEventType,
  type PrimaryWeapon, type SidearmWeapon, type ArmourType, type MountType,
  type UnitTemplate, type WeaponDesign, type TroopCounts,
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
  // STEP 6a-pre: Unit Template + Weapon Design Management
  // ══════════════════════════════════════════════
  for (const player of activePlayers) {
    const orders = ordersByPlayer.get(player.id) ?? emptyOrders(player.taxRate as TaxRate);

    // ── Create unit templates ──
    for (const tmplOrder of (orders.createTemplates ?? [])) {
      await db.insert(schema.unitTemplates).values({
        gameId,
        playerId: player.id,
        name: tmplOrder.name,
        isIrregular: tmplOrder.isIrregular,
        isMounted: tmplOrder.isMounted,
        companiesOrSquadrons: tmplOrder.companiesOrSquadrons,
        primary: tmplOrder.primary ?? null,
        sidearm: tmplOrder.sidearm ?? null,
        armour: tmplOrder.armour ?? null,
        mount: tmplOrder.mount ?? null,
        weaponDesignId: tmplOrder.weaponDesignId ?? null,
      });
    }

    // ── Update unit templates (and flag existing units as outdated) ──
    for (const tmplOrder of (orders.updateTemplates ?? [])) {
      const [tmpl] = await db.select().from(schema.unitTemplates)
        .where(and(
          eq(schema.unitTemplates.id, tmplOrder.templateId),
          eq(schema.unitTemplates.playerId, player.id),
        ));
      if (!tmpl) continue;

      await db.update(schema.unitTemplates)
        .set({ ...tmplOrder.changes, updatedAt: new Date().toISOString() })
        .where(eq(schema.unitTemplates.id, tmpl.id));

      // Mark all live units using this template as outdated
      const armies = await db.select().from(schema.armies)
        .where(and(eq(schema.armies.gameId, gameId), eq(schema.armies.ownerId, player.id)));
      for (const army of armies) {
        await db.update(schema.units)
          .set({ isOutdated: true })
          .where(and(
            eq(schema.units.armyId, army.id),
            eq(schema.units.templateId, tmpl.id),
          ));
      }
    }

    // ── Delete unit templates ──
    for (const tmplOrder of (orders.deleteTemplates ?? [])) {
      await db.delete(schema.unitTemplates)
        .where(and(
          eq(schema.unitTemplates.id, tmplOrder.templateId),
          eq(schema.unitTemplates.playerId, player.id),
        ));
    }

    // ── Create weapon designs (costs gold, enters developing phase) ──
    for (const designOrder of (orders.createWeaponDesigns ?? [])) {
      const playerRow = updatedPlayers.find(p => p.id === player.id);
      if (!playerRow || playerRow.gold < WEAPON_DESIGN_COST) continue;

      await db.update(schema.players)
        .set({ gold: playerRow.gold - WEAPON_DESIGN_COST })
        .where(eq(schema.players.id, player.id));

      await db.insert(schema.weaponDesigns).values({
        gameId,
        playerId: player.id,
        baseWeapon: designOrder.baseWeapon,
        name: designOrder.name,
        statModifiers: designOrder.statModifiers as Record<string, number>,
        costModifier: Math.round((designOrder.costModifier ?? 0) * 100), // store as int ×100
        status: 'developing',
        turnsRemaining: WEAPON_DESIGN_DEVELOP_TURNS,
      });

      events.push({
        type: 'weapon_design_started',
        description: `${player.countryName} is developing ${designOrder.name}`,
        playerIds: [player.id],
      });
    }

    // ── Retire weapon designs ──
    for (const retireOrder of (orders.retireWeaponDesigns ?? [])) {
      await db.update(schema.weaponDesigns)
        .set({ status: 'retired' })
        .where(and(
          eq(schema.weaponDesigns.id, retireOrder.designId),
          eq(schema.weaponDesigns.playerId, player.id),
        ));
    }
  }

  // ── Tick weapon design development ──
  const allDesigns = await db.select().from(schema.weaponDesigns)
    .where(eq(schema.weaponDesigns.gameId, gameId));
  for (const design of allDesigns) {
    if (design.status !== 'developing') continue;
    const newTurns = design.turnsRemaining - 1;
    if (newTurns <= 0) {
      await db.update(schema.weaponDesigns)
        .set({ status: 'ready', turnsRemaining: 0 })
        .where(eq(schema.weaponDesigns.id, design.id));
      const designPlayer = activePlayers.find(p => p.id === design.playerId);
      if (designPlayer) {
        events.push({
          type: 'weapon_design_ready',
          description: `${design.name} design is ready`,
          playerIds: [designPlayer.id],
        });
      }
    } else {
      await db.update(schema.weaponDesigns)
        .set({ turnsRemaining: newTurns })
        .where(eq(schema.weaponDesigns.id, design.id));
    }
  }

  // ══════════════════════════════════════════════
  // STEP 6a-mid: Draft & Dismiss
  // ══════════════════════════════════════════════
  for (const player of activePlayers) {
    const orders = ordersByPlayer.get(player.id) ?? emptyOrders(player.taxRate as TaxRate);

    for (const draftOrder of (orders.draftRecruits ?? [])) {
      const [settlement] = await db.select().from(schema.settlements)
        .where(and(
          eq(schema.settlements.id, draftOrder.settlementId),
          eq(schema.settlements.ownerId, player.id),
        ));
      if (!settlement) continue;
      const amount = Math.min(draftOrder.amount, Math.floor(settlement.population * 0.20));
      if (amount <= 0) continue;
      await db.update(schema.settlements)
        .set({ draftedRecruits: settlement.draftedRecruits + amount })
        .where(eq(schema.settlements.id, settlement.id));
    }

    for (const dismissOrder of (orders.dismissRecruits ?? [])) {
      const [settlement] = await db.select().from(schema.settlements)
        .where(and(
          eq(schema.settlements.id, dismissOrder.settlementId),
          eq(schema.settlements.ownerId, player.id),
        ));
      if (!settlement) continue;
      const amount = Math.min(dismissOrder.amount, settlement.draftedRecruits);
      await db.update(schema.settlements)
        .set({ draftedRecruits: settlement.draftedRecruits - amount })
        .where(eq(schema.settlements.id, settlement.id));
    }

    for (const draftOrder of (orders.draftMounts ?? [])) {
      const [settlement] = await db.select().from(schema.settlements)
        .where(and(
          eq(schema.settlements.id, draftOrder.settlementId),
          eq(schema.settlements.ownerId, player.id),
        ));
      if (!settlement) continue;
      const storage = { ...(settlement.storage as Record<string, number>) };
      const mountKey = draftOrder.mountType === 'horse' ? 'horses'
        : draftOrder.mountType === 'gryphon' ? 'griffins' : 'demigryphs';
      const available = storage[mountKey] ?? 0;
      const amount = Math.min(draftOrder.amount, available);
      if (amount <= 0) continue;
      storage[mountKey] = available - amount;

      const updates: Record<string, number> = { storage: storage as unknown as number };
      if (draftOrder.mountType === 'horse') {
        (updates as Record<string, unknown>)['draftedHorses'] = settlement.draftedHorses + amount;
      } else if (draftOrder.mountType === 'gryphon') {
        (updates as Record<string, unknown>)['draftedGryphons'] = settlement.draftedGryphons + amount;
      } else {
        (updates as Record<string, unknown>)['draftedDemigryphs'] = settlement.draftedDemigryphs + amount;
      }
      await db.update(schema.settlements)
        .set({ storage, ...(draftOrder.mountType === 'horse' ? { draftedHorses: settlement.draftedHorses + amount }
          : draftOrder.mountType === 'gryphon' ? { draftedGryphons: settlement.draftedGryphons + amount }
          : { draftedDemigryphs: settlement.draftedDemigryphs + amount }) })
        .where(eq(schema.settlements.id, settlement.id));
    }

    // Dismiss mounts: return to storage (settlement where they currently reside)
    for (const dismissOrder of (orders.dismissMounts ?? [])) {
      const [settlement] = await db.select().from(schema.settlements)
        .where(and(
          eq(schema.settlements.id, dismissOrder.settlementId),
          eq(schema.settlements.ownerId, player.id),
        ));
      if (!settlement) continue;
      const storage = { ...(settlement.storage as Record<string, number>) };
      const mountKey = dismissOrder.mountType === 'horse' ? 'horses'
        : dismissOrder.mountType === 'gryphon' ? 'griffins' : 'demigryphs';
      const storageCap = getStorageCap(settlement.tier as SettlementTier);

      const poolKey = dismissOrder.mountType === 'horse' ? 'draftedHorses'
        : dismissOrder.mountType === 'gryphon' ? 'draftedGryphons' : 'draftedDemigryphs';
      const poolSize = (settlement as Record<string, number>)[poolKey] ?? 0;
      const amount = Math.min(dismissOrder.amount, poolSize);
      const currentInStorage = storage[mountKey] ?? 0;
      const canFit = Math.max(0, storageCap - currentInStorage);
      const returned = Math.min(amount, canFit);
      const lost = amount - returned;

      storage[mountKey] = currentInStorage + returned;
      await db.update(schema.settlements)
        .set({
          storage,
          ...(dismissOrder.mountType === 'horse' ? { draftedHorses: poolSize - amount }
            : dismissOrder.mountType === 'gryphon' ? { draftedGryphons: poolSize - amount }
            : { draftedDemigryphs: poolSize - amount }),
        })
        .where(eq(schema.settlements.id, settlement.id));

      if (lost > 0) {
        events.push({
          type: 'mounts_lost_on_dismiss',
          description: `${lost} ${dismissOrder.mountType}s could not be resettled and were lost`,
          playerIds: [player.id],
        });
      }
    }
  }

  // ══════════════════════════════════════════════
  // STEP 6b: Recruitment (template-based)
  // ══════════════════════════════════════════════
  for (const player of activePlayers) {
    const orders = ordersByPlayer.get(player.id) ?? emptyOrders(player.taxRate as TaxRate);

    for (const recruit of (orders.recruitments ?? [])) {
      const [settlement] = await db.select().from(schema.settlements)
        .where(eq(schema.settlements.id, recruit.settlementId));
      if (!settlement || settlement.ownerId !== player.id) continue;

      const [army] = await db.select().from(schema.armies)
        .where(eq(schema.armies.id, recruit.armyId));
      if (!army || army.ownerId !== player.id) continue;
      if (army.hexQ !== settlement.hexQ || army.hexR !== settlement.hexR) continue;

      // Load the template
      const [template] = await db.select().from(schema.unitTemplates)
        .where(and(
          eq(schema.unitTemplates.id, recruit.templateId),
          eq(schema.unitTemplates.playerId, player.id),
        ));
      if (!template) continue;

      // Calculate troop requirement
      const troops = template.isMounted
        ? template.companiesOrSquadrons * MEN_PER_SQUADRON
        : template.companiesOrSquadrons * MEN_PER_COMPANY;

      // Check drafted recruits pool
      if (settlement.draftedRecruits < troops) continue;

      // Check settlement has barracks
      const buildings = await db.select().from(schema.buildings)
        .where(eq(schema.buildings.settlementId, settlement.id));
      const hasBarracks = buildings.some(b => b.type === 'barracks' && !b.isConstructing);
      if (!hasBarracks) continue;

      const storage = { ...(settlement.storage as Record<string, number>) };
      const heldEquipment = { primary: 0, sidearm: 0, armour: 0, mounts: 0 };

      if (!template.isIrregular) {
        // Check and transfer primary weapon
        if (template.primary) {
          const weaponKey = template.primary as string;
          if ((storage[weaponKey] ?? 0) < troops) continue;
          storage[weaponKey] = (storage[weaponKey] ?? 0) - troops;
          heldEquipment.primary = troops;
        }
        // Check and transfer sidearm
        if (template.sidearm) {
          const sidearmKey = template.sidearm as string;
          if ((storage[sidearmKey] ?? 0) < troops) continue;
          storage[sidearmKey] = (storage[sidearmKey] ?? 0) - troops;
          heldEquipment.sidearm = troops;
        }
        // Check and transfer armour
        if (template.armour) {
          const armourKey = template.armour as string;
          if ((storage[armourKey] ?? 0) < troops) continue;
          storage[armourKey] = (storage[armourKey] ?? 0) - troops;
          heldEquipment.armour = troops;
        }
        // Check and transfer mounts from draft pool
        if (template.isMounted && template.mount) {
          const mountPoolKey = template.mount === 'horse' ? 'draftedHorses'
            : template.mount === 'gryphon' ? 'draftedGryphons' : 'draftedDemigryphs';
          const mountPool = (settlement as Record<string, number>)[mountPoolKey] ?? 0;
          if (mountPool < troops) continue;
          heldEquipment.mounts = troops;
          // Update mount pool
          await db.update(schema.settlements)
            .set({ [mountPoolKey]: mountPool - troops })
            .where(eq(schema.settlements.id, settlement.id));
        }
      }

      // Deduct recruits from pool
      await db.update(schema.settlements)
        .set({
          draftedRecruits: settlement.draftedRecruits - troops,
          storage,
        })
        .where(eq(schema.settlements.id, settlement.id));

      // Deduct gold cost
      const recruitCost = 200 + template.companiesOrSquadrons * 50;
      const playerRow = updatedPlayers.find(p => p.id === player.id);
      if (!playerRow || playerRow.gold < recruitCost) continue;
      await db.update(schema.players)
        .set({ gold: playerRow.gold - recruitCost })
        .where(eq(schema.players.id, player.id));

      // Determine default position and get hex for mount breed
      const defaultPos = getDefaultPosition(template.isMounted, template.primary as PrimaryWeapon | null);

      const [hex] = await db.select().from(schema.gameHexes)
        .where(and(
          eq(schema.gameHexes.gameId, gameId),
          eq(schema.gameHexes.q, settlement.hexQ),
          eq(schema.gameHexes.r, settlement.hexR),
        ));

      // Create the unit
      await db.insert(schema.units).values({
        armyId: army.id,
        templateId: template.id,
        position: defaultPos,
        troopCounts: { rookie: troops, capable: 0, veteran: 0 },
        state: 'full',
        xp: 0,
        heldEquipment,
        isOutdated: false,
        mountBreed: template.isMounted ? (hex?.mountBreed ?? null) : null,
      });

      events.push({
        type: 'unit_recruited',
        description: `${player.countryName} raised ${template.name} in ${settlement.name}`,
        playerIds: [player.id],
      });
    }
  }

  // ══════════════════════════════════════════════
  // STEP 6b-mid: Disband, Upgrade, Replenish Units
  // ══════════════════════════════════════════════
  for (const player of activePlayers) {
    const orders = ordersByPlayer.get(player.id) ?? emptyOrders(player.taxRate as TaxRate);

    // ── Disband: return held equipment to settlement storage ──
    for (const disbandOrder of (orders.disbandUnits ?? [])) {
      const [unit] = await db.select().from(schema.units)
        .where(eq(schema.units.id, disbandOrder.unitId));
      if (!unit) continue;
      const [army] = await db.select().from(schema.armies)
        .where(eq(schema.armies.id, unit.armyId));
      if (!army || army.ownerId !== player.id) continue;

      // Find settlement at army's hex
      const [nearestSettlement] = await db.select().from(schema.settlements)
        .where(and(
          eq(schema.settlements.gameId, gameId),
          eq(schema.settlements.ownerId, player.id),
          eq(schema.settlements.hexQ, army.hexQ),
          eq(schema.settlements.hexR, army.hexR),
        ));

      if (nearestSettlement) {
        const [tmpl] = await db.select().from(schema.unitTemplates)
          .where(eq(schema.unitTemplates.id, unit.templateId));

        const storage = { ...(nearestSettlement.storage as Record<string, number>) };
        const storageCap = getStorageCap(nearestSettlement.tier as SettlementTier);
        const held = unit.heldEquipment as { primary: number; sidearm: number; armour: number; mounts: number };

        if (tmpl?.primary && held.primary > 0) {
          storage[tmpl.primary] = Math.min(storageCap, (storage[tmpl.primary] ?? 0) + held.primary);
        }
        if (tmpl?.sidearm && held.sidearm > 0) {
          storage[tmpl.sidearm] = Math.min(storageCap, (storage[tmpl.sidearm] ?? 0) + held.sidearm);
        }
        if (tmpl?.armour && held.armour > 0) {
          storage[tmpl.armour] = Math.min(storageCap, (storage[tmpl.armour] ?? 0) + held.armour);
        }
        if (tmpl?.mount && held.mounts > 0) {
          const mountKey = tmpl.mount === 'horse' ? 'horses'
            : tmpl.mount === 'gryphon' ? 'griffins' : 'demigryphs';
          storage[mountKey] = Math.min(storageCap, (storage[mountKey] ?? 0) + held.mounts);
        }

        await db.update(schema.settlements)
          .set({ storage })
          .where(eq(schema.settlements.id, nearestSettlement.id));
      }

      // Delete the unit
      await db.delete(schema.units).where(eq(schema.units.id, unit.id));

      events.push({
        type: 'unit_disbanded',
        description: `${player.countryName} disbanded a unit`,
        playerIds: [player.id],
      });
    }

    // ── Upgrade outdated units (costs equipment difference) ──
    for (const upgradeOrder of (orders.upgradeUnits ?? [])) {
      const [unit] = await db.select().from(schema.units)
        .where(eq(schema.units.id, upgradeOrder.unitId));
      if (!unit || !unit.isOutdated) continue;

      const [army] = await db.select().from(schema.armies)
        .where(eq(schema.armies.id, unit.armyId));
      if (!army || army.ownerId !== player.id) continue;

      const [settlement] = await db.select().from(schema.settlements)
        .where(eq(schema.settlements.id, upgradeOrder.settlementId));
      if (!settlement || settlement.ownerId !== player.id) continue;
      if (army.hexQ !== settlement.hexQ || army.hexR !== settlement.hexR) continue;

      const [tmpl] = await db.select().from(schema.unitTemplates)
        .where(eq(schema.unitTemplates.id, unit.templateId));
      if (!tmpl) continue;

      const held = unit.heldEquipment as { primary: number; sidearm: number; armour: number; mounts: number };
      const troops = (unit.troopCounts as { rookie: number; capable: number; veteran: number });
      const total = troops.rookie + troops.capable + troops.veteran;

      const storage = { ...(settlement.storage as Record<string, number>) };
      const storageCap = getStorageCap(settlement.tier as SettlementTier);

      // Return old equipment to storage, then pull new equipment
      // (Simplified: swap all held equipment for the template's current spec)
      const oldPrimary = held.primary;
      if (tmpl.primary && oldPrimary > 0) {
        storage[tmpl.primary] = Math.min(storageCap, (storage[tmpl.primary] ?? 0) + oldPrimary);
      }
      // Pull new equipment for current troops count
      if (tmpl.primary) {
        if ((storage[tmpl.primary] ?? 0) < total) continue;
        storage[tmpl.primary] = (storage[tmpl.primary] ?? 0) - total;
        held.primary = total;
      }

      await db.update(schema.settlements)
        .set({ storage })
        .where(eq(schema.settlements.id, settlement.id));

      await db.update(schema.units)
        .set({ isOutdated: false, heldEquipment: held })
        .where(eq(schema.units.id, unit.id));
    }

    // ── Replenish: fill casualties from settlement storage + drafted recruits ──
    for (const replenOrder of (orders.replenishments ?? [])) {
      const [unit] = await db.select().from(schema.units)
        .where(eq(schema.units.id, replenOrder.unitId));
      if (!unit) continue;

      const [army] = await db.select().from(schema.armies)
        .where(eq(schema.armies.id, unit.armyId));
      if (!army || army.ownerId !== player.id) continue;

      const [settlement] = await db.select().from(schema.settlements)
        .where(eq(schema.settlements.id, replenOrder.settlementId));
      if (!settlement || settlement.ownerId !== player.id) continue;
      if (army.hexQ !== settlement.hexQ || army.hexR !== settlement.hexR) continue;

      const [tmpl] = await db.select().from(schema.unitTemplates)
        .where(eq(schema.unitTemplates.id, unit.templateId));
      if (!tmpl) continue;

      const troops = unit.troopCounts as { rookie: number; capable: number; veteran: number };
      const maxTroops = tmpl.isMounted
        ? tmpl.companiesOrSquadrons * MEN_PER_SQUADRON
        : tmpl.companiesOrSquadrons * MEN_PER_COMPANY;
      const casualties = maxTroops - (troops.rookie + troops.capable + troops.veteran);
      if (casualties <= 0) continue;

      // Need that many recruits + equipment
      if (settlement.draftedRecruits < casualties) continue;

      const storage = { ...(settlement.storage as Record<string, number>) };
      const held = { ...(unit.heldEquipment as { primary: number; sidearm: number; armour: number; mounts: number }) };

      if (!tmpl.isIrregular) {
        if (tmpl.primary && (storage[tmpl.primary] ?? 0) < casualties) continue;
        if (tmpl.primary) { storage[tmpl.primary] = (storage[tmpl.primary] ?? 0) - casualties; held.primary += casualties; }
        if (tmpl.sidearm) { storage[tmpl.sidearm] = (storage[tmpl.sidearm] ?? 0) - casualties; held.sidearm += casualties; }
        if (tmpl.armour) { storage[tmpl.armour] = (storage[tmpl.armour] ?? 0) - casualties; held.armour += casualties; }
      }

      // New recruits start as rookies
      await db.update(schema.settlements)
        .set({ draftedRecruits: settlement.draftedRecruits - casualties, storage })
        .where(eq(schema.settlements.id, settlement.id));

      await db.update(schema.units)
        .set({
          troopCounts: { ...troops, rookie: troops.rookie + casualties },
          heldEquipment: held,
          state: 'full',
        })
        .where(eq(schema.units.id, unit.id));
    }
  }

  // ══════════════════════════════════════════════
  // STEP 6b-post: Equipment Production Orders
  // ══════════════════════════════════════════════
  for (const player of activePlayers) {
    const orders = ordersByPlayer.get(player.id) ?? emptyOrders(player.taxRate as TaxRate);

    // Place new equipment orders
    for (const eqOrder of (orders.equipmentOrders ?? [])) {
      const [settlement] = await db.select().from(schema.settlements)
        .where(and(
          eq(schema.settlements.id, eqOrder.settlementId),
          eq(schema.settlements.ownerId, player.id),
        ));
      if (!settlement) continue;

      await db.insert(schema.equipmentOrders).values({
        gameId,
        settlementId: eqOrder.settlementId,
        playerId: player.id,
        equipmentType: eqOrder.equipmentType,
        quantityOrdered: eqOrder.quantity,
        quantityFulfilled: 0,
        status: 'active',
      });
    }

    // Cancel equipment orders
    for (const cancelOrder of (orders.cancelEquipmentOrders ?? [])) {
      await db.update(schema.equipmentOrders)
        .set({ status: 'cancelled' })
        .where(and(
          eq(schema.equipmentOrders.id, cancelOrder.orderId),
          eq(schema.equipmentOrders.playerId, player.id),
        ));
    }
  }

  // Process active equipment orders.
  // Throughput = floor(workshopCount × WORKSHOP_POINTS_PER_TURN × priorityMultiplier / effectiveProductionCost)
  // Input materials are scaled by the same priority multiplier (rush costs more per item).
  const PRIORITY_THROUGHPUT: Record<string, number> = { relaxed: 0.75, standard: 1.0, rush: 1.33 };
  const PRIORITY_INPUT_COST: Record<string, number>  = { relaxed: 0.75, standard: 1.0, rush: 1.25 };

  const activeOrders = await db.select().from(schema.equipmentOrders)
    .where(and(
      eq(schema.equipmentOrders.gameId, gameId),
      eq(schema.equipmentOrders.status, 'active'),
    ));

  for (const eqOrder of activeOrders) {
    const [settlement] = await db.select().from(schema.settlements)
      .where(eq(schema.settlements.id, eqOrder.settlementId));
    if (!settlement) continue;

    const buildings = await db.select().from(schema.buildings)
      .where(eq(schema.buildings.settlementId, settlement.id));

    // Determine workshop type and base definition
    const primaryDef   = PRIMARY_WEAPONS[eqOrder.equipmentType as PrimaryWeapon];
    const sidearmDef   = SIDEARM_WEAPONS[eqOrder.equipmentType as SidearmWeapon];
    const armourDef    = ARMOUR_TYPES[eqOrder.equipmentType as ArmourType];
    const workshopType = (primaryDef || sidearmDef) ? 'arms_workshop' : armourDef ? 'armour_workshop' : null;
    if (!workshopType) continue;

    const workshopCount = buildings.filter(b => b.type === workshopType && !b.isConstructing).length;
    if (workshopCount === 0) continue;

    const def = primaryDef ?? sidearmDef ?? armourDef;
    const productionCost: number = def.productionCost;
    const inputs = def.inputs;

    const priority = eqOrder.priority ?? 'standard';
    const throughputMult = PRIORITY_THROUGHPUT[priority] ?? 1.0;
    const inputCostMult  = PRIORITY_INPUT_COST[priority]  ?? 1.0;

    // Points available this turn across all workshops
    const totalPoints = workshopCount * WORKSHOP_POINTS_PER_TURN * throughputMult;
    const remaining   = eqOrder.quantityOrdered - eqOrder.quantityFulfilled;
    const canProduce  = Math.min(remaining, Math.floor(totalPoints / productionCost));
    if (canProduce <= 0) continue;

    // Deduct input materials (scaled by priority cost multiplier)
    const storage = { ...(settlement.storage as Record<string, number>) };
    let hasInputs = true;
    for (const [mat, qty] of Object.entries(inputs)) {
      const required = Math.ceil((qty ?? 0) * canProduce * inputCostMult);
      if ((storage[mat] ?? 0) < required) { hasInputs = false; break; }
    }
    if (!hasInputs) continue;

    for (const [mat, qty] of Object.entries(inputs)) {
      storage[mat] = (storage[mat] ?? 0) - Math.ceil((qty ?? 0) * canProduce * inputCostMult);
    }

    // Add produced equipment to storage
    const storageCap = getStorageCap(settlement.tier as SettlementTier);
    storage[eqOrder.equipmentType] = Math.min(storageCap, (storage[eqOrder.equipmentType] ?? 0) + canProduce);

    const newFulfilled = eqOrder.quantityFulfilled + canProduce;
    const isComplete = newFulfilled >= eqOrder.quantityOrdered;

    await db.update(schema.settlements)
      .set({ storage })
      .where(eq(schema.settlements.id, settlement.id));

    await db.update(schema.equipmentOrders)
      .set({
        quantityFulfilled: newFulfilled,
        status: isComplete ? 'fulfilled' : 'active',
      })
      .where(eq(schema.equipmentOrders.id, eqOrder.id));

    if (isComplete) {
      const orderPlayer = activePlayers.find(p => p.id === eqOrder.playerId);
      if (orderPlayer) {
        events.push({
          type: 'equipment_order_fulfilled',
          description: `${settlement.name} completed production of ${eqOrder.quantityOrdered} ${eqOrder.equipmentType}`,
          playerIds: [orderPlayer.id],
        });
      }
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

    // Load all templates for these units
    const allCombatUnitIds = [...activeAtkUnits, ...activeDefUnits].map(u => u.templateId).filter(Boolean) as string[];
    const allTemplates = allCombatUnitIds.length > 0
      ? await db.select().from(schema.unitTemplates).where(
          eq(schema.unitTemplates.gameId, gameId)
        )
      : [];

    // Load all weapon designs for this game (used by computeUnitStats)
    const allWeaponDesigns = await db.select().from(schema.weaponDesigns)
      .where(eq(schema.weaponDesigns.gameId, gameId));

    function buildCombatUnit(u: typeof atkUnits[0]): CombatUnitInput | null {
      const tmpl = allTemplates.find(t => t.id === u.templateId) as UnitTemplate | undefined;
      if (!tmpl) return null;
      const troopCounts = (u.troopCounts ?? { rookie: 0, capable: 0, veteran: 0 }) as TroopCounts;
      const maxTroops = tmpl.isMounted
        ? tmpl.companiesOrSquadrons * MEN_PER_SQUADRON
        : tmpl.companiesOrSquadrons * MEN_PER_COMPANY;
      const stats = computeUnitStats(tmpl, allWeaponDesigns as WeaponDesign[]);
      return {
        id: u.id,
        unitName: u.name ?? tmpl.name,
        position: (u.position ?? getDefaultPosition(tmpl.isMounted)) as UnitPosition,
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

    const atkCombatUnits = activeAtkUnits.map(buildCombatUnit).filter((u): u is CombatUnitInput => u !== null);
    const defCombatUnits = activeDefUnits.map(buildCombatUnit).filter((u): u is CombatUnitInput => u !== null);

    if (atkCombatUnits.length === 0 || defCombatUnits.length === 0) continue;

    const combatInput: CombatInput = {
      id: `combat-${turnNumber}-${atkArmy.id}-${defArmy.id}`,
      seed: combatSeed,
      terrain: combatTerrain,
      riverCrossing: false,
      attacker: {
        armyId: atkArmy.id,
        commandRating: atkGeneral?.commandRating ?? 0,
        units: atkCombatUnits,
      },
      defender: {
        armyId: defArmy.id,
        commandRating: defGeneral?.commandRating ?? 0,
        units: defCombatUnits,
      },
    };

    const result = resolveCombat(combatInput);
    combatLogs.push(result);

    // Apply combat results to units in DB
    for (const loss of [...result.attackerLosses, ...result.defenderLosses]) {
      const endTotal = loss.endTroops;
      const maxTroops = allTemplates.find(t => t.id === loss.templateId) ?
        (() => {
          const tmpl = allTemplates.find(t => t.id === loss.templateId)!;
          return tmpl.isMounted ? tmpl.companiesOrSquadrons * MEN_PER_SQUADRON : tmpl.companiesOrSquadrons * MEN_PER_COMPANY;
        })() : 100;
      const pct = maxTroops > 0 ? endTotal / maxTroops : 0;
      const newState = loss.destroyed ? 'destroyed'
        : pct < 0.4 ? 'broken'
        : pct < 0.6 ? 'depleted'
        : 'full';

      await db.update(schema.units)
        .set({
          troopCounts: loss.endTroopCounts,
          state: newState,
          xp: loss.xpGained,
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

  // Fetch armies for use in Steps 14-16
  const armiesForSupply = await db.select().from(schema.armies)
    .where(eq(schema.armies.gameId, gameId));

  // ══════════════════════════════════════════════
  // STEP 14: Supply Consumption + Attrition
  // ══════════════════════════════════════════════
  const latestHexes = await db.select().from(schema.gameHexes)
    .where(eq(schema.gameHexes.gameId, gameId));

  const latestSettlements = await db.select().from(schema.settlements)
    .where(eq(schema.settlements.gameId, gameId));

  for (const army of armiesForSupply) {
    const hex = latestHexes.find(h => h.q === army.hexQ && h.r === army.hexR);
    if (!hex) continue;

    const terrain = (hex.terrain ?? 'plains') as TerrainType;
    const isInFriendlyTerritory = hex.ownerId === army.ownerId;

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

      events.push({
        type: 'army_attrition',
        description: `${army.name} is suffering from supply attrition`,
        playerIds: [army.ownerId],
      });
    }
  }

  // ══════════════════════════════════════════════
  // STEP 15: Stability Calculation
  // ══════════════════════════════════════════════
  for (const player of activePlayers) {
    const taxRate = (updatedPlayers.find(p => p.id === player.id)?.taxRate ?? 'low') as TaxRate;
    const playerSettlements = settlementsAfter.filter(s => s.ownerId === player.id);

    const hasFoodShortage = playerSettlements.some(s => {
      const st = s.storage as Record<string, number>;
      return (st['food'] ?? 0) <= 0;
    });
    const hasGoldDeficit = (updatedPlayers.find(p => p.id === player.id)?.gold ?? 0) < 0;

    const stabilityResult = calculateStabilityTurn({
      currentStability: player.stability,
      taxRate,
      hasGoldDeficit,
      hasFoodShortage,
    });

    // Apply stability band consequences (uneasy+ = reduced pop growth already handled by band check)
    const band = getStabilityBand(stabilityResult.newStability);

    // Unstable+ bands: desertion — random units lose 5% strength
    if (band === 'unstable' || band === 'crisis' || band === 'collapse') {
      const playerArmies = armiesForSupply.filter(a => a.ownerId === player.id);
      for (const army of playerArmies) {
        const units = await db.select().from(schema.units).where(eq(schema.units.armyId, army.id));
        for (const unit of units) {
          if (unit.state === 'destroyed') continue;
          // 10% chance per unit per turn of losing 5% strength
          if (Math.random() < 0.10) {
            const newStr = Math.max(0, unit.strengthPct - 5);
            const newState = newStr <= 0 ? 'destroyed' as const
              : newStr <= 25 ? 'broken' as const
              : newStr <= 50 ? 'depleted' as const
              : unit.state;
            await db.update(schema.units)
              .set({ strengthPct: newStr, state: newState })
              .where(eq(schema.units.id, unit.id));
          }
        }
      }
    }

    await db.update(schema.players)
      .set({ stability: stabilityResult.newStability })
      .where(eq(schema.players.id, player.id));

    if (stabilityResult.change !== 0) {
      events.push({
        type: 'stability_change',
        description: `${player.countryName}: stability ${stabilityResult.change > 0 ? '+' : ''}${stabilityResult.change}% (now ${stabilityResult.newStability}%)`,
        playerIds: [player.id],
      });
    }
  }

  // ══════════════════════════════════════════════
  // STEP 16: Late Winter Seasonal d20 Roll
  // ══════════════════════════════════════════════
  if (season === 'late_winter') {
    for (const player of activePlayers) {
      const currentStability = (await db.select().from(schema.players).where(eq(schema.players.id, player.id)))[0]?.stability ?? player.stability;
      const roll = Math.floor(Math.random() * 20) + 1; // 1-20
      const winterResult = resolveWinterRoll({ stability: currentStability, roll });

      if (winterResult.event) {
        events.push({
          type: 'winter_roll',
          description: `${player.countryName} Late Winter roll: ${roll} — ${formatWinterEvent(winterResult.event)}`,
          playerIds: [player.id],
        });

        // Apply event effects
        let newStab = currentStability;

        switch (winterResult.event) {
          case 'stability_bonus':
            newStab = Math.min(100, newStab + WINTER_ROLL_BONUS);
            break;

          case 'minor_unrest':
            // Flavour only
            break;

          case 'riots': {
            // -3% stability, 5% pop loss in random settlement
            newStab = Math.max(0, newStab - 3);
            const playerSettlements = settlementsAfter.filter(s => s.ownerId === player.id);
            if (playerSettlements.length > 0) {
              const target = playerSettlements[Math.floor(Math.random() * playerSettlements.length)];
              const popLoss = Math.floor(target.population * 0.05);
              await db.update(schema.settlements)
                .set({ population: Math.max(10, target.population - popLoss) })
                .where(eq(schema.settlements.id, target.id));
            }
            break;
          }

          case 'desertion': {
            // 15% of units across all armies lose 20% strength
            const playerArmies = armiesForSupply.filter(a => a.ownerId === player.id);
            for (const army of playerArmies) {
              const units = await db.select().from(schema.units).where(eq(schema.units.armyId, army.id));
              for (const unit of units) {
                if (unit.state === 'destroyed') continue;
                if (Math.random() < 0.15) {
                  const newStr = Math.max(0, unit.strengthPct - 20);
                  const newState = newStr <= 0 ? 'destroyed' as const
                    : newStr <= 25 ? 'broken' as const
                    : newStr <= 50 ? 'depleted' as const
                    : unit.state;
                  await db.update(schema.units)
                    .set({ strengthPct: newStr, state: newState })
                    .where(eq(schema.units.id, unit.id));
                }
              }
            }
            break;
          }

          case 'mass_desertion': {
            // 40% of units lose 30% strength + rebellion
            const playerArmies = armiesForSupply.filter(a => a.ownerId === player.id);
            for (const army of playerArmies) {
              const units = await db.select().from(schema.units).where(eq(schema.units.armyId, army.id));
              for (const unit of units) {
                if (unit.state === 'destroyed') continue;
                if (Math.random() < 0.40) {
                  const newStr = Math.max(0, unit.strengthPct - 30);
                  const newState = newStr <= 0 ? 'destroyed' as const
                    : newStr <= 25 ? 'broken' as const
                    : newStr <= 50 ? 'depleted' as const
                    : unit.state;
                  await db.update(schema.units)
                    .set({ strengthPct: newStr, state: newState })
                    .where(eq(schema.units.id, unit.id));
                }
              }
            }
            newStab = Math.max(0, newStab - 5);
            break;
          }

          case 'rebellion': {
            // Random non-capital settlement defects (ownership removed)
            const playerSettlements = settlementsAfter.filter(s => s.ownerId === player.id && !s.isCapital);
            if (playerSettlements.length > 0) {
              const target = playerSettlements[Math.floor(Math.random() * playerSettlements.length)];
              // Settlement becomes unowned (rebels control it)
              await db.update(schema.settlements)
                .set({ ownerId: player.id }) // stays with player but population drops 25%
                .where(eq(schema.settlements.id, target.id));
              const popLoss = Math.floor(target.population * 0.25);
              await db.update(schema.settlements)
                .set({ population: Math.max(10, target.population - popLoss) })
                .where(eq(schema.settlements.id, target.id));
              events.push({
                type: 'rebellion',
                description: `Rebellion in ${target.name}! Population decreased by ${popLoss}.`,
                playerIds: [player.id],
              });
            }
            newStab = Math.max(0, newStab - 5);
            break;
          }

          case 'noble_defection': {
            // A general defects (removed)
            const generals = await db.select().from(schema.generals)
              .where(and(eq(schema.generals.gameId, gameId), eq(schema.generals.ownerId, player.id)));
            if (generals.length > 0) {
              const target = generals[Math.floor(Math.random() * generals.length)];
              // Remove general from any army
              await db.update(schema.armies)
                .set({ generalId: null })
                .where(eq(schema.armies.generalId, target.id));
              await db.delete(schema.generals).where(eq(schema.generals.id, target.id));
              events.push({
                type: 'noble_defection',
                description: `General ${target.name} has defected from ${player.countryName}!`,
                playerIds: [player.id],
              });
            }
            break;
          }

          case 'settlement_defection':
            // Handled same as rebellion for V1
            break;
        }

        if (newStab !== currentStability) {
          await db.update(schema.players)
            .set({ stability: newStab })
            .where(eq(schema.players.id, player.id));
        }
      }
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

  // ══════════════════════════════════════════════
  // STEP 17: Elimination + Victory Check
  // ══════════════════════════════════════════════
  const finalSettlements = await db.select().from(schema.settlements)
    .where(eq(schema.settlements.gameId, gameId));

  for (const player of activePlayers) {
    if (player.isEliminated) continue;

    const playerSettlements = finalSettlements.filter(s => s.ownerId === player.id);
    if (playerSettlements.length === 0) {
      // Realm death — all settlements lost
      await db.update(schema.players)
        .set({ isEliminated: true, isSpectator: true })
        .where(eq(schema.players.id, player.id));

      events.push({
        type: 'player_eliminated',
        description: `${player.countryName} has been eliminated! All settlements were lost.`,
        playerIds: activePlayers.map(p => p.id),
      });
    }
  }

  // Re-check alive players after elimination
  const latestPlayers = await db.select().from(schema.players)
    .where(eq(schema.players.gameId, gameId));
  const alivePlayers = latestPlayers.filter(p => !p.isEliminated && !p.isSpectator);
  const gameOver = alivePlayers.length <= 1;
  const winnerId = gameOver && alivePlayers.length === 1 ? alivePlayers[0].id : null;

  if (gameOver && winnerId) {
    const winner = alivePlayers[0];
    events.push({
      type: 'game_over',
      description: `${winner.countryName} is victorious! Last nation standing.`,
      playerIds: latestPlayers.map(p => p.id),
    });
  }

  return { events, combatLogs, gameOver, winnerId };
}

function formatWinterEvent(event: StabilityEventType): string {
  const labels: Record<StabilityEventType, string> = {
    minor_unrest: 'Minor Unrest',
    riots: 'Riots!',
    desertion: 'Desertion!',
    mass_desertion: 'Mass Desertion!',
    rebellion: 'Rebellion!',
    noble_defection: 'Noble Defection!',
    settlement_defection: 'Settlement Defection!',
    stability_bonus: '+10% Stability!',
  };
  return labels[event] ?? event;
}
