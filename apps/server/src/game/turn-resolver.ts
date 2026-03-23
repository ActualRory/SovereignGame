/**
 * Turn Resolution Engine.
 * Executes all player orders for a turn and produces the new game state.
 * Phase 2 implements steps 1-5 + 13 (tax, production, upkeep, construction, research, pop growth).
 */

import { eq, and, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { resolveMovementStepByStep } from './movement-resolver.js';
import {
  getSeason, isMajorTurnEnd,
  calculateSettlementProduction, calculateTaxIncome,
  calculateUpkeep, calculateFoodConsumption, getStorageCap,
  calculatePopGrowth, calculateStarvation,
  BUILDINGS, RESOURCE_EFFICIENCY_BUILDING, RAW_RESOURCE_COST_MULTIPLIER,
  COST_TIERS, TECH_TREE, SETTLEMENT_TIERS, TERRAIN,
  STABILITY_PER_TURN, RIVER_CROSSING_COST,
  getNextTier, TIER_ORDER,
  hexNeighbors, hexKey, hexDistance, hasRiverBetween,
  updateArmySupply, calculateHexSupply, ATTRITION_STRENGTH_LOSS,
  resolveCombat, resolveSiegeAssault,
  calculateStabilityTurn, resolveWinterRoll, WINTER_ROLL_BONUS,
  getStabilityBand,
  getBaseStats, getDefaultPosition, MEN_PER_COMPANY, MEN_PER_SQUADRON,
  WEAPON_DESIGN_DEVELOP_TURNS,
  WEAPONS, SHIELDS, ARMOUR_TYPES, WORKSHOP_POINTS_PER_TURN,
  computeUnitStats,
  type CombatInput, type ArmySide, type CombatUnitInput, type CombatResult,
  type TurnOrders, emptyOrders,
  type TaxRate, type BuildingType, type ResourceType, type SettlementTier,
  type TerrainType, type UnitState, type UnitPosition,
  type HexDirection, type Season, type StabilityEventType,
  type WeaponType, type ShieldType, type ArmourType, type MountType,
  type UnitTemplate, type WeaponDesign, type TroopCounts,
  UNILATERAL_ATTACHMENTS, type LetterAttachment,
} from '@kingdoms/shared';
import { processAttachmentEffect } from './attachment-effects.js';
import type { NobleRank } from '@kingdoms/shared';
import {
  NOBLE_HIRE_COST, PROMOTION_REQUIREMENTS, CUNNING_COST_REDUCTION_PER_POINT,
  RANK_DISPLAY_NAMES, getNextRank, NOBLES_PER_ESTATE, NOBLE_GENERATION_DELAY_TURNS,
  MINOR_TURNS_PER_YEAR, NOBLE_DEATH_AGE_START, NOBLE_DEATH_CHANCE_BASE,
  NOBLE_DEATH_CHANCE_PER_YEAR, NOBLE_CAPTURE_CHANCE, NOBLE_BATTLE_DEATH_CHANCE,
  GOVERNOR_BONUS_PER_RANK,
} from '@kingdoms/shared';
import { generateNobleName, generateNobleAge, generateNobleStat } from '@kingdoms/shared';
import { computeArmyCombatBonus, computeUnitSpecialtyBonus } from '@kingdoms/shared';

// Seeded PRNG for noble generation (same algo as combat engine)
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
  // STEP 3b: Loan Payments (on major turn ends)
  // ══════════════════════════════════════════════
  if (isMajorEnd) {
    const activeLoans = await db.select().from(schema.loans)
      .where(and(
        eq(schema.loans.gameId, gameId),
        inArray(schema.loans.status, ['active', 'delinquent']),
      ));

    for (const loan of activeLoans) {
      // Check grace period: each major turn = 8 minor turns
      const majorTurnsSinceStart = Math.floor((turnNumber - loan.startTurn) / 8);
      if (majorTurnsSinceStart < loan.gracePeriodMajorTurns) continue;

      const remaining = loan.totalOwed - loan.amountPaid;
      if (remaining <= 0) {
        await db.update(schema.loans)
          .set({ status: 'repaid', delinquentCount: 0 })
          .where(eq(schema.loans.id, loan.id));
        events.push({ type: 'loan_repaid', description: `Loan of ${loan.principal}g fully repaid.`, playerIds: [loan.borrowerId, loan.lenderId] });
        continue;
      }

      const payment = Math.min(loan.instalmentAmount, remaining);

      // Get borrower's current gold
      const [borrower] = await db.select().from(schema.players).where(eq(schema.players.id, loan.borrowerId));
      if (!borrower) continue;

      const canPay = borrower.gold >= payment;
      const actualPayment = canPay ? payment : Math.max(0, borrower.gold);

      // Transfer whatever they can pay
      if (actualPayment > 0) {
        await db.update(schema.players)
          .set({ gold: borrower.gold - actualPayment })
          .where(eq(schema.players.id, loan.borrowerId));

        const [lender] = await db.select().from(schema.players).where(eq(schema.players.id, loan.lenderId));
        if (lender) {
          await db.update(schema.players)
            .set({ gold: lender.gold + actualPayment })
            .where(eq(schema.players.id, loan.lenderId));
        }
      }

      const newAmountPaid = loan.amountPaid + actualPayment;
      const newDelinquent = canPay ? 0 : loan.delinquentCount + 1;

      // Check if fully repaid after this payment
      if (newAmountPaid >= loan.totalOwed) {
        await db.update(schema.loans)
          .set({ amountPaid: newAmountPaid, status: 'repaid', delinquentCount: 0 })
          .where(eq(schema.loans.id, loan.id));
        events.push({ type: 'loan_repaid', description: `Loan of ${loan.principal}g fully repaid.`, playerIds: [loan.borrowerId, loan.lenderId] });
      } else if (newDelinquent >= 2) {
        // Default after 2 consecutive missed payments
        await db.update(schema.loans)
          .set({ amountPaid: newAmountPaid, status: 'defaulted', delinquentCount: newDelinquent })
          .where(eq(schema.loans.id, loan.id));

        // Stability penalty for borrower
        const newStability = Math.round(Math.max(0, borrower.stability + STABILITY_PER_TURN.gold_deficit * 5));
        await db.update(schema.players)
          .set({ stability: newStability })
          .where(eq(schema.players.id, loan.borrowerId));

        events.push({ type: 'loan_defaulted', description: `Defaulted on loan of ${loan.principal}g! Stability plummets.`, playerIds: [loan.borrowerId, loan.lenderId] });
      } else {
        const newStatus = canPay ? 'active' : 'delinquent';
        await db.update(schema.loans)
          .set({ amountPaid: newAmountPaid, status: newStatus, delinquentCount: newDelinquent })
          .where(eq(schema.loans.id, loan.id));

        if (!canPay) {
          events.push({ type: 'loan_delinquent', description: `Missed loan payment — ${remaining - actualPayment}g still owed.`, playerIds: [loan.borrowerId, loan.lenderId] });
        }
      }
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
        secondary: tmplOrder.secondary ?? null,
        sidearm: tmplOrder.sidearm ?? null,
        armour: tmplOrder.armour ?? null,
        mount: tmplOrder.mount ?? null,
        primaryDesignId: tmplOrder.primaryDesignId ?? null,
        secondaryDesignId: tmplOrder.secondaryDesignId ?? null,
        sidearmDesignId: tmplOrder.sidearmDesignId ?? null,
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
      if (!playerRow) continue;

      // Recalculate design cost server-side
      const baseDef = WEAPONS[designOrder.baseWeapon as WeaponType] ?? SHIELDS[designOrder.baseWeapon as ShieldType];
      const productionCost = baseDef?.productionCost ?? 2;
      const budgetUsed = Object.values(designOrder.statModifiers ?? {}).reduce((s, v) => s + Math.max(0, v ?? 0), 0);
      const designCost = Math.round(productionCost * 50 + budgetUsed * 75);

      if (playerRow.gold < designCost) continue;

      await db.update(schema.players)
        .set({ gold: playerRow.gold - designCost })
        .where(eq(schema.players.id, player.id));

      await db.insert(schema.weaponDesigns).values({
        gameId,
        playerId: player.id,
        baseWeapon: designOrder.baseWeapon,
        name: designOrder.name,
        statModifiers: designOrder.statModifiers as Record<string, number>,
        costModifier: 0,
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
      const heldEquipment = { primary: 0, secondary: 0, sidearm: 0, armour: 0, mounts: 0 };

      if (!template.isIrregular) {
        // Check and transfer primary weapon
        if (template.primary) {
          const weaponKey = template.primary as string;
          if ((storage[weaponKey] ?? 0) < troops) continue;
          storage[weaponKey] = (storage[weaponKey] ?? 0) - troops;
          heldEquipment.primary = troops;
        }
        // Check and transfer secondary (weapon or shield)
        if (template.secondary) {
          const secondaryKey = template.secondary as string;
          if ((storage[secondaryKey] ?? 0) < troops) continue;
          storage[secondaryKey] = (storage[secondaryKey] ?? 0) - troops;
          heldEquipment.secondary = troops;
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
      const defaultPos = getDefaultPosition(template.isMounted, template.primary as WeaponType | null);

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
        const held = unit.heldEquipment as { primary: number; secondary: number; sidearm: number; armour: number; mounts: number };

        if (tmpl?.primary && held.primary > 0) {
          storage[tmpl.primary] = Math.min(storageCap, (storage[tmpl.primary] ?? 0) + held.primary);
        }
        if (tmpl?.secondary && held.secondary > 0) {
          storage[tmpl.secondary] = Math.min(storageCap, (storage[tmpl.secondary] ?? 0) + held.secondary);
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

      const held = unit.heldEquipment as { primary: number; secondary: number; sidearm: number; armour: number; mounts: number };
      const troops = (unit.troopCounts as { rookie: number; capable: number; veteran: number });
      const total = troops.rookie + troops.capable + troops.veteran;

      const storage = { ...(settlement.storage as Record<string, number>) };
      const storageCap = getStorageCap(settlement.tier as SettlementTier);

      // Return old equipment to storage, then pull new equipment
      // (Simplified: swap all held equipment for the template's current spec)
      if (tmpl.primary && held.primary > 0) {
        storage[tmpl.primary] = Math.min(storageCap, (storage[tmpl.primary] ?? 0) + held.primary);
      }
      if (tmpl.secondary && (held.secondary ?? 0) > 0) {
        storage[tmpl.secondary] = Math.min(storageCap, (storage[tmpl.secondary] ?? 0) + held.secondary);
      }
      // Pull new equipment for current troops count
      if (tmpl.primary) {
        if ((storage[tmpl.primary] ?? 0) < total) continue;
        storage[tmpl.primary] = (storage[tmpl.primary] ?? 0) - total;
        held.primary = total;
      }
      if (tmpl.secondary) {
        const available = storage[tmpl.secondary] ?? 0;
        const toTake = Math.min(available, total);
        storage[tmpl.secondary] = available - toTake;
        held.secondary = toTake;
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
      const held = { ...(unit.heldEquipment as { primary: number; secondary: number; sidearm: number; armour: number; mounts: number }) };

      if (!tmpl.isIrregular) {
        if (tmpl.primary && (storage[tmpl.primary] ?? 0) < casualties) continue;
        if (tmpl.primary) { storage[tmpl.primary] = (storage[tmpl.primary] ?? 0) - casualties; held.primary += casualties; }
        if (tmpl.secondary) { const secAvail = storage[tmpl.secondary] ?? 0; const secTake = Math.min(secAvail, casualties); storage[tmpl.secondary] = secAvail - secTake; held.secondary = (held.secondary ?? 0) + secTake; }
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
        designId: eqOrder.designId ?? null,
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
    const weaponDef = WEAPONS[eqOrder.equipmentType as WeaponType];
    const shieldDef = SHIELDS[eqOrder.equipmentType as ShieldType];
    const armourDef = ARMOUR_TYPES[eqOrder.equipmentType as ArmourType];
    const workshopType = (weaponDef || shieldDef) ? 'arms_workshop' : armourDef ? 'armour_workshop' : null;
    if (!workshopType) continue;

    const workshopCount = buildings.filter(b => b.type === workshopType && !b.isConstructing).length;
    if (workshopCount === 0) continue;

    const def = weaponDef ?? shieldDef ?? armourDef;
    const productionCost: number = def.productionCost;

    const priority = eqOrder.priority ?? 'standard';
    const throughputMult = PRIORITY_THROUGHPUT[priority] ?? 1.0;
    const inputCostMult  = PRIORITY_INPUT_COST[priority]  ?? 1.0;

    // Points available this turn across all workshops
    const totalPoints = workshopCount * WORKSHOP_POINTS_PER_TURN * throughputMult;
    const remaining   = eqOrder.quantityOrdered - eqOrder.quantityFulfilled;
    const canProduce  = Math.min(remaining, Math.floor(totalPoints / productionCost));
    if (canProduce <= 0) continue;

    // Territory access check — player must own hexes with all required resources.
    // If a required processing building is absent at this settlement, apply 2× gold cost.
    const ownerPlayer = activePlayers.find(p => p.id === eqOrder.playerId);
    if (!ownerPlayer) continue;
    const ownedHexes = await db.select().from(schema.gameHexes)
      .where(and(eq(schema.gameHexes.gameId, gameId), eq(schema.gameHexes.ownerId, ownerPlayer.id)));
    const ownedResources = new Set(ownedHexes.flatMap(h => (h.resources as ResourceType[]) ?? []));

    let canAccess = true;
    let efficiencyMultiplier = 1.0;
    for (const res of def.requiredResources) {
      if (!ownedResources.has(res)) { canAccess = false; break; }
      const effBuilding = RESOURCE_EFFICIENCY_BUILDING[res];
      if (effBuilding) {
        const hasBuilding = buildings.some(b => b.type === effBuilding && !b.isConstructing);
        if (!hasBuilding) efficiencyMultiplier = Math.max(efficiencyMultiplier, RAW_RESOURCE_COST_MULTIPLIER);
      }
    }
    if (!canAccess) continue;

    // Deduct gold cost from player treasury
    const totalGoldCost = Math.ceil(def.goldCostPerItem * canProduce * efficiencyMultiplier * inputCostMult);
    const playerGold = ownerPlayer.gold ?? 0;
    if (playerGold < totalGoldCost) continue;

    const newGold = playerGold - totalGoldCost;
    await db.update(schema.players)
      .set({ gold: newGold })
      .where(eq(schema.players.id, ownerPlayer.id));
    ownerPlayer.gold = newGold; // keep in-memory value current for subsequent orders

    const storage = { ...(settlement.storage as Record<string, number>) };

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
  // STEP 6c: Noble Orders & Create Armies
  // ══════════════════════════════════════════════
  for (const player of activePlayers) {
    const orders = ordersByPlayer.get(player.id) ?? emptyOrders(player.taxRate as TaxRate);

    // Process noble orders
    for (const nobleOrder of (orders.nobleOrders ?? [])) {
      const playerRow = updatedPlayers.find(p => p.id === player.id);
      if (!playerRow) continue;

      if (nobleOrder.type === 'hire_noble') {
        // Find a valid settlement: either the specified one, or auto-pick one with a military academy
        let settlement: any = null;
        if (nobleOrder.settlementId) {
          const [s] = await db.select().from(schema.settlements)
            .where(eq(schema.settlements.id, nobleOrder.settlementId));
          if (s && s.ownerId === player.id) settlement = s;
        }
        if (!settlement) {
          // Auto-pick: find any player settlement with a military academy
          const playerSettlements = await db.select().from(schema.settlements)
            .where(eq(schema.settlements.ownerId, player.id));
          for (const s of playerSettlements) {
            const blds = await db.select().from(schema.buildings)
              .where(and(eq(schema.buildings.settlementId, s.id), eq(schema.buildings.isConstructing, false)));
            if (blds.some(b => b.type === 'military_academy')) { settlement = s; break; }
          }
        }
        if (!settlement) continue;

        // Requires military_academy building at settlement
        const settlementBuildings = await db.select().from(schema.buildings)
          .where(and(eq(schema.buildings.settlementId, settlement.id), eq(schema.buildings.isConstructing, false)));
        if (!settlementBuildings.some(b => b.type === 'military_academy')) continue;

        if (playerRow.gold < NOBLE_HIRE_COST) continue;

        await db.update(schema.players)
          .set({ gold: playerRow.gold - NOBLE_HIRE_COST })
          .where(eq(schema.players.id, player.id));
        playerRow.gold -= NOBLE_HIRE_COST;

        // Generate noble stats and name
        const nameRng = mulberry32(Date.now() ^ parseInt(player.id.slice(0, 8), 16));
        const { firstName, surname } = generateNobleName(nameRng);
        const nobleName = nobleOrder.name || `${firstName} ${surname}`;
        const age = generateNobleAge(nameRng);
        const martial = generateNobleStat(nameRng);
        const intelligence = generateNobleStat(nameRng);
        const cunning = generateNobleStat(nameRng);

        // Find or create family
        let familyId: string | null = null;
        const existingFamily = await db.select().from(schema.nobleFamilies)
          .where(and(
            eq(schema.nobleFamilies.gameId, gameId),
            eq(schema.nobleFamilies.ownerId, player.id),
            eq(schema.nobleFamilies.surname, surname),
          ));
        if (existingFamily.length > 0) {
          familyId = existingFamily[0].id;
        } else {
          const [newFamily] = await db.insert(schema.nobleFamilies).values({
            gameId,
            ownerId: player.id,
            surname,
          }).returning();
          familyId = newFamily.id;
        }

        const startRank = nobleOrder.branch === 'army' ? 'captain' : 'lieutenant';
        await db.insert(schema.nobles).values({
          gameId,
          ownerId: player.id,
          name: nobleName,
          familyId,
          age,
          birthTurn: currentTurn,
          branch: nobleOrder.branch,
          rank: startRank,
          birthSettlementId: settlement.id,
          martial,
          intelligence,
          cunning,
        });

        events.push({
          type: 'noble_hired',
          description: `${player.countryName} hired ${nobleName}`,
          playerIds: [player.id],
        });
      } else if (nobleOrder.type === 'promote_noble') {
        const [noble] = await db.select().from(schema.nobles)
          .where(and(eq(schema.nobles.id, nobleOrder.nobleId), eq(schema.nobles.ownerId, player.id)));
        if (!noble || !noble.isAlive) continue;

        const nextRank = getNextRank(noble.rank as any, noble.branch as any);
        if (!nextRank) continue;

        const req = PROMOTION_REQUIREMENTS[noble.rank as NobleRank];
        if (!req) continue;
        if (noble.xp < req.minXp || noble.turnsInRank < req.minTurnsInRank) continue;

        const costReduction = 1 - (noble.cunning * CUNNING_COST_REDUCTION_PER_POINT);
        const goldCost = Math.floor(req.baseGoldCost * Math.max(0.5, costReduction));
        if (playerRow.gold < goldCost) continue;

        await db.update(schema.players)
          .set({ gold: playerRow.gold - goldCost })
          .where(eq(schema.players.id, player.id));
        playerRow.gold -= goldCost;

        await db.update(schema.nobles)
          .set({ rank: nextRank, turnsInRank: 0 })
          .where(eq(schema.nobles.id, noble.id));

        events.push({
          type: 'noble_promoted',
          description: `${noble.name} promoted to ${RANK_DISPLAY_NAMES[nextRank as NobleRank]}`,
          playerIds: [player.id],
        });
      } else if (nobleOrder.type === 'assign_noble') {
        const [noble] = await db.select().from(schema.nobles)
          .where(and(eq(schema.nobles.id, nobleOrder.nobleId), eq(schema.nobles.ownerId, player.id)));
        if (!noble || !noble.isAlive || noble.captorPlayerId) continue;

        await db.update(schema.nobles)
          .set({
            assignmentType: nobleOrder.assignmentType,
            assignedEntityId: nobleOrder.entityId,
            assignedSecondaryId: nobleOrder.secondaryId ?? null,
          })
          .where(eq(schema.nobles.id, noble.id));

        // Update denormalized FKs on armies/settlements
        if (nobleOrder.assignmentType === 'army_ic') {
          await db.update(schema.armies)
            .set({ commanderNobleId: noble.id })
            .where(eq(schema.armies.id, nobleOrder.entityId));
        } else if (nobleOrder.assignmentType === 'army_2ic') {
          await db.update(schema.armies)
            .set({ secondInCommandNobleId: noble.id })
            .where(eq(schema.armies.id, nobleOrder.entityId));
        } else if (nobleOrder.assignmentType === 'governor') {
          await db.update(schema.settlements)
            .set({ governorNobleId: noble.id })
            .where(eq(schema.settlements.id, nobleOrder.entityId));
        }
      } else if (nobleOrder.type === 'unassign_noble') {
        const [noble] = await db.select().from(schema.nobles)
          .where(and(eq(schema.nobles.id, nobleOrder.nobleId), eq(schema.nobles.ownerId, player.id)));
        if (!noble) continue;

        // Clear denormalized FKs
        if (noble.assignmentType === 'army_ic' && noble.assignedEntityId) {
          await db.update(schema.armies)
            .set({ commanderNobleId: null })
            .where(eq(schema.armies.id, noble.assignedEntityId));
        } else if (noble.assignmentType === 'army_2ic' && noble.assignedEntityId) {
          await db.update(schema.armies)
            .set({ secondInCommandNobleId: null })
            .where(eq(schema.armies.id, noble.assignedEntityId));
        } else if (noble.assignmentType === 'governor' && noble.assignedEntityId) {
          await db.update(schema.settlements)
            .set({ governorNobleId: null })
            .where(eq(schema.settlements.id, noble.assignedEntityId));
        }

        await db.update(schema.nobles)
          .set({ assignmentType: 'unassigned', assignedEntityId: null, assignedSecondaryId: null })
          .where(eq(schema.nobles.id, noble.id));
      } else if (nobleOrder.type === 'rename_noble') {
        await db.update(schema.nobles)
          .set({ name: nobleOrder.name })
          .where(and(eq(schema.nobles.id, nobleOrder.nobleId), eq(schema.nobles.ownerId, player.id)));
      } else if (nobleOrder.type === 'set_title') {
        await db.update(schema.nobles)
          .set({ title: nobleOrder.title })
          .where(and(eq(schema.nobles.id, nobleOrder.nobleId), eq(schema.nobles.ownerId, player.id)));
      } else if (nobleOrder.type === 'ransom_offer') {
        // Store ransom offer (simplified: as a notification to the prisoner's owner)
        const [noble] = await db.select().from(schema.nobles)
          .where(and(eq(schema.nobles.id, nobleOrder.nobleId), eq(schema.nobles.captorPlayerId, player.id)));
        if (!noble) continue;
        events.push({
          type: 'ransom_offered',
          description: `${player.countryName} demands ${nobleOrder.goldAmount} gold for ${noble.name}`,
          playerIds: [noble.ownerId],
          data: { nobleId: noble.id, goldAmount: nobleOrder.goldAmount, captorId: player.id },
        });
      } else if (nobleOrder.type === 'release_noble') {
        const [noble] = await db.select().from(schema.nobles)
          .where(and(eq(schema.nobles.id, nobleOrder.nobleId), eq(schema.nobles.captorPlayerId, player.id)));
        if (!noble) continue;
        await db.update(schema.nobles)
          .set({ captorPlayerId: null })
          .where(eq(schema.nobles.id, noble.id));
        events.push({
          type: 'noble_released',
          description: `${noble.name} has been released`,
          playerIds: [noble.ownerId, player.id],
        });
      }
    }

    // Create new armies
    for (const armyOrder of (orders.createArmies ?? [])) {
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
  // STEP 7: Trade Resolution (cancellations + standing/one-time transfers)
  // ══════════════════════════════════════════════
  // Trade proposals are now created via letter attachments (accept/reject).
  // This step only handles cancellations and executing existing agreements.
  for (const player of activePlayers) {
    const orders = ordersByPlayer.get(player.id) ?? emptyOrders(player.taxRate as TaxRate);

    // Cancel trades
    for (const cancelId of (orders.tradeCancellations ?? [])) {
      await db.delete(schema.tradeAgreements)
        .where(eq(schema.tradeAgreements.id, cancelId));
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

      // Process unilateral attachments immediately on delivery
      const attachments = (letter.attachments ?? []) as LetterAttachment[];
      for (const attachment of attachments) {
        if (UNILATERAL_ATTACHMENTS.includes(attachment.type)) {
          await processAttachmentEffect(gameId, turnNumber, letter.senderId, letter.recipientId, attachment);

          if (attachment.type === 'declaration_of_war') {
            events.push({
              type: 'war_declared',
              description: `${sender?.countryName ?? '?'} has declared war!`,
              playerIds: [letter.senderId, letter.recipientId],
            });
          }
        }
      }
    }
  }

  // ══════════════════════════════════════════════
  // STEP 9+10: Movement + Combat (step-by-step simultaneous)
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

  // Load all data needed for movement resolution
  const hexDataForMovement = await db.select().from(schema.gameHexes)
    .where(eq(schema.gameHexes.gameId, gameId));

  const allMovementArmies = await db.select().from(schema.armies)
    .where(eq(schema.armies.gameId, gameId));

  const allDiplomacyRelations = await db.select().from(schema.diplomacyRelations)
    .where(eq(schema.diplomacyRelations.gameId, gameId));

  const allNobles = await db.select().from(schema.nobles)
    .where(and(eq(schema.nobles.gameId, gameId), eq(schema.nobles.isAlive, true)));
  const noblesById = new Map(allNobles.map(n => [n.id, n]));

  const armyIds = allMovementArmies.map(a => a.id);
  const allUnits = armyIds.length > 0
    ? await db.select().from(schema.units).where(inArray(schema.units.armyId, armyIds))
    : [];
  const unitsByArmy = new Map<string, typeof allUnits>();
  for (const u of allUnits) {
    const list = unitsByArmy.get(u.armyId) ?? [];
    list.push(u);
    unitsByArmy.set(u.armyId, list);
  }

  const allTemplates = await db.select().from(schema.unitTemplates)
    .where(eq(schema.unitTemplates.gameId, gameId));

  const allWeaponDesigns = await db.select().from(schema.weaponDesigns)
    .where(eq(schema.weaponDesigns.gameId, gameId));

  const playerNames = new Map(activePlayers.map(p => [p.id, p.countryName as string]));

  // Run step-by-step movement with border enforcement and mid-path combat
  console.log(`Step 9+10: resolving movement for ${allMovementArmies.length} armies, ${allUnits.length} units`);
  const movementResult = resolveMovementStepByStep({
    gameId,
    turnNumber,
    armies: allMovementArmies.map(a => ({
      id: a.id,
      ownerId: a.ownerId,
      hexQ: a.hexQ,
      hexR: a.hexR,
      movementPath: a.movementPath as Array<{ q: number; r: number }> | null,
      commanderNobleId: a.commanderNobleId,
      secondInCommandNobleId: a.secondInCommandNobleId,
    })),
    hexData: hexDataForMovement.map(h => ({
      q: h.q,
      r: h.r,
      terrain: h.terrain as string,
      ownerId: h.ownerId,
      riverEdges: (h.riverEdges ?? []) as HexDirection[],
    })),
    relations: allDiplomacyRelations.map(r => ({
      id: r.id,
      gameId: r.gameId,
      playerAId: r.playerAId,
      playerBId: r.playerBId,
      relationType: r.relationType as any,
      allianceName: r.allianceName,
      terms: r.terms as any,
      startedTurn: r.startedTurn,
    })),
    nobles: noblesById as any,
    unitsByArmy: unitsByArmy as any,
    templates: allTemplates as any,
    weaponDesigns: allWeaponDesigns as any,
    playerNames,
  });

  // Apply movement results to DB
  for (const [armyId, pos] of movementResult.positions) {
    await db.update(schema.armies)
      .set({
        hexQ: pos.hexQ,
        hexR: pos.hexR,
        movementPath: pos.movementPath as any,
      })
      .where(eq(schema.armies.id, armyId));
  }

  // Apply combat unit updates to DB
  for (const [unitId, update] of movementResult.unitUpdates) {
    await db.update(schema.units)
      .set({
        troopCounts: update.troopCounts,
        state: update.state as any,
        xp: update.xp,
      })
      .where(eq(schema.units.id, unitId));
  }

  // Apply retreat/stop positions for armies involved in combat
  // (already handled within movementResult.positions)

  // Merge movement events and combat logs into the turn's results
  combatLogs.push(...movementResult.combatLogs);
  events.push(...movementResult.events);

  // Store movement log for client animation (will be saved in snapshot below)
  const movementLog = movementResult.movementLog;

  // ══════════════════════════════════════════════
  // STEP 11a: Siege Progression (multi-turn)
  // Armies on enemy settlements at war automatically progress the siege.
  // ══════════════════════════════════════════════
  const allSettlementsForSiege = await db.select().from(schema.settlements)
    .where(eq(schema.settlements.gameId, gameId));
  const latestArmies = await db.select().from(schema.armies)
    .where(eq(schema.armies.gameId, gameId));
  const latestRelations = await db.select().from(schema.diplomacyRelations)
    .where(eq(schema.diplomacyRelations.gameId, gameId));

  // Siege progress rates by settlement tier (progress per turn, out of 100)
  const SIEGE_RATE: Record<string, number> = {
    hamlet: 34,    // ~3 turns
    village: 25,   // 4 turns
    town: 17,      // ~6 turns
    city: 10,      // 10 turns
    metropolis: 6, // ~17 turns
  };

  for (const settlement of allSettlementsForSiege) {
    // Find enemy armies on this hex that are at war with the settlement owner
    const enemyArmiesHere = latestArmies.filter(a =>
      a.hexQ === settlement.hexQ && a.hexR === settlement.hexR
      && a.ownerId !== settlement.ownerId
    );

    // Filter to only armies whose owner is at war with settlement owner
    const besiegingArmies = enemyArmiesHere.filter(a => {
      const rel = latestRelations.find(r =>
        (r.playerAId === a.ownerId && r.playerBId === settlement.ownerId)
        || (r.playerAId === settlement.ownerId && r.playerBId === a.ownerId)
      );
      return rel && rel.relationType === 'war';
    });

    if (besiegingArmies.length === 0) {
      // No enemy army — reset siege progress if any
      if (settlement.siegeProgress && settlement.siegeProgress > 0) {
        await db.update(schema.settlements)
          .set({ siegeProgress: null })
          .where(eq(schema.settlements.id, settlement.id));
      }
      continue;
    }

    // Count total besieging troops
    const besiegingUnitCounts = await Promise.all(
      besiegingArmies.map(async a => {
        const units = await db.select().from(schema.units).where(eq(schema.units.armyId, a.id));
        return units.filter(u => u.state !== 'destroyed').length;
      })
    );
    const totalBesiegingUnits = besiegingUnitCounts.reduce((s, c) => s + c, 0);
    if (totalBesiegingUnits === 0) continue;

    // Check if garrison is present
    const garrisonArmies = latestArmies.filter(a =>
      a.hexQ === settlement.hexQ && a.hexR === settlement.hexR
      && a.ownerId === settlement.ownerId
    );
    const hasGarrison = garrisonArmies.length > 0;

    // Calculate progress increment
    const baseRate = SIEGE_RATE[settlement.tier] ?? 20;
    // Bonus for multiple units: +2 per extra unit (diminishing)
    const unitBonus = Math.min((totalBesiegingUnits - 1) * 2, 10);
    // Garrison halves progress
    const garrisonPenalty = hasGarrison ? 0.5 : 1;
    const increment = Math.round((baseRate + unitBonus) * garrisonPenalty);

    const currentProgress = settlement.siegeProgress ?? 0;
    const newProgress = Math.min(currentProgress + increment, 100);

    if (newProgress >= 100) {
      // Siege complete — auto-capture
      const besiegerId = besiegingArmies[0].ownerId;
      const besiegerPlayer = activePlayers.find(p => p.id === besiegerId);
      const newPop = Math.round(settlement.population * 0.75);

      await db.update(schema.settlements)
        .set({ ownerId: besiegerId, population: newPop, siegeProgress: null })
        .where(eq(schema.settlements.id, settlement.id));

      await db.update(schema.gameHexes)
        .set({ ownerId: besiegerId })
        .where(and(
          eq(schema.gameHexes.gameId, gameId),
          eq(schema.gameHexes.q, settlement.hexQ),
          eq(schema.gameHexes.r, settlement.hexR),
        ));

      events.push({
        type: 'settlement_captured',
        description: `${besiegerPlayer?.countryName ?? '?'} captured ${settlement.name} after a long siege`,
        playerIds: [besiegerId, settlement.ownerId],
      });
    } else {
      await db.update(schema.settlements)
        .set({ siegeProgress: newProgress })
        .where(eq(schema.settlements.id, settlement.id));

      // Only notify on first tick (siege started)
      if (currentProgress === 0) {
        const besiegerId = besiegingArmies[0].ownerId;
        const besiegerPlayer = activePlayers.find(p => p.id === besiegerId);
        events.push({
          type: 'siege_started',
          description: `${besiegerPlayer?.countryName ?? '?'} is besieging ${settlement.name}`,
          playerIds: [besiegerId, settlement.ownerId],
        });
      }
    }
  }

  // ══════════════════════════════════════════════
  // STEP 11b: Siege Assault (optional instant capture attempt)
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

      // Load noble commanders for siege
      const atkIcNoble = army.commanderNobleId ? noblesById.get(army.commanderNobleId) ?? null : null;
      const atk2icNoble = army.secondInCommandNobleId ? noblesById.get(army.secondInCommandNobleId) ?? null : null;
      const defIcNoble = defArmy?.commanderNobleId ? noblesById.get(defArmy.commanderNobleId) ?? null : null;
      const def2icNoble = defArmy?.secondInCommandNobleId ? noblesById.get(defArmy.secondInCommandNobleId) ?? null : null;
      const siegeHasChainOfCommand = false; // TODO: check per-player tech

      const combatHex = hexDataForMovement.find(
        h => h.q === siege.targetHexQ && h.r === siege.targetHexR
      );
      const siegeTerrain = (combatHex?.terrain ?? 'plains') as TerrainType;
      const siegeSeed = hashSeed(`${gameId}:${turnNumber}:siege:${army.id}`);

      // Build CombatUnitInput from new military format (templates + troopCounts)
      const allSiegeTemplates = await db.select().from(schema.unitTemplates)
        .where(eq(schema.unitTemplates.gameId, gameId));
      const allSiegeWeaponDesigns = await db.select().from(schema.weaponDesigns)
        .where(eq(schema.weaponDesigns.gameId, gameId));

      function buildSiegeCombatUnit(u: typeof activeAtkUnits[0]): CombatUnitInput | null {
        const tmpl = allSiegeTemplates.find(t => t.id === u.templateId) as UnitTemplate | undefined;
        if (!tmpl) return null;
        const troopCounts = (u.troopCounts ?? { rookie: 0, capable: 0, veteran: 0 }) as TroopCounts;
        const maxTroops = tmpl.isMounted
          ? tmpl.companiesOrSquadrons * MEN_PER_SQUADRON
          : tmpl.companiesOrSquadrons * MEN_PER_COMPANY;
        const stats = computeUnitStats(tmpl as UnitTemplate, allSiegeWeaponDesigns as unknown as WeaponDesign[]);
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

      const atkCombatUnits = activeAtkUnits.map(buildSiegeCombatUnit).filter((u): u is CombatUnitInput => u !== null);
      const defCombatUnits = defenderUnits.map(buildSiegeCombatUnit).filter((u): u is CombatUnitInput => u !== null);

      const siegeAtkBonus = computeArmyCombatBonus(atkIcNoble as any, atk2icNoble as any, siegeHasChainOfCommand);
      const siegeDefBonus = computeArmyCombatBonus(defIcNoble as any, def2icNoble as any, siegeHasChainOfCommand);

      const siegeInput: CombatInput = {
        id: `siege-${turnNumber}-${army.id}`,
        seed: siegeSeed,
        terrain: siegeTerrain,
        riverCrossing: false,
        attacker: {
          armyId: army.id,
          nobleBonus: siegeAtkBonus,
          units: atkCombatUnits,
        },
        defender: {
          armyId: defArmy?.id ?? 'garrison',
          nobleBonus: siegeDefBonus,
          units: defCombatUnits,
        },
      };

      // If no garrison, attacker captures automatically
      if (defenderUnits.length === 0) {
        // Capture: 25% pop loss, transfer ownership
        const newPop = Math.round(targetSettlement.population * 0.75);
        await db.update(schema.settlements)
          .set({ ownerId: player.id, population: newPop, siegeProgress: null })
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
        const tmpl = allSiegeTemplates.find(t => t.id === loss.templateId) as UnitTemplate | undefined;
        const maxTroops = tmpl
          ? (tmpl.isMounted ? tmpl.companiesOrSquadrons * MEN_PER_SQUADRON : tmpl.companiesOrSquadrons * MEN_PER_COMPANY)
          : 100;
        const pct = maxTroops > 0 ? loss.endTroops / maxTroops : 0;
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

      if (siegeResult.winner === 'attacker') {
        // Capture: 25% pop loss, transfer ownership
        const newPop = Math.round(targetSettlement.population * 0.75);
        await db.update(schema.settlements)
          .set({ ownerId: player.id, population: newPop, siegeProgress: null })
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
  // STEP 15b: Noble Lifecycle (Aging, Death, Estate Generation)
  // ══════════════════════════════════════════════
  {
    // Increment turnsInRank for all living nobles
    await db.update(schema.nobles)
      .set({ turnsInRank: db.raw`turns_in_rank + 1` as any })
      .where(and(eq(schema.nobles.gameId, gameId), eq(schema.nobles.isAlive, true)));

    // Aging: every MINOR_TURNS_PER_YEAR turns (once per year), increment age
    if (currentTurn % MINOR_TURNS_PER_YEAR === 0) {
      const livingNobles = await db.select().from(schema.nobles)
        .where(and(eq(schema.nobles.gameId, gameId), eq(schema.nobles.isAlive, true)));

      for (const noble of livingNobles) {
        const newAge = noble.age + 1;
        // Natural death check for nobles aged 60+
        if (newAge >= NOBLE_DEATH_AGE_START) {
          const deathChance = NOBLE_DEATH_CHANCE_BASE + NOBLE_DEATH_CHANCE_PER_YEAR * (newAge - NOBLE_DEATH_AGE_START);
          if (Math.random() < deathChance) {
            // Noble dies of old age — clear assignments
            if (noble.assignmentType === 'army_ic' && noble.assignedEntityId) {
              await db.update(schema.armies).set({ commanderNobleId: null }).where(eq(schema.armies.id, noble.assignedEntityId));
            } else if (noble.assignmentType === 'army_2ic' && noble.assignedEntityId) {
              await db.update(schema.armies).set({ secondInCommandNobleId: null }).where(eq(schema.armies.id, noble.assignedEntityId));
            } else if (noble.assignmentType === 'governor' && noble.assignedEntityId) {
              await db.update(schema.settlements).set({ governorNobleId: null }).where(eq(schema.settlements.id, noble.assignedEntityId));
            }
            await db.update(schema.nobles).set({ isAlive: false, age: newAge }).where(eq(schema.nobles.id, noble.id));
            events.push({
              type: 'noble_died',
              description: `${noble.name} has passed away at the age of ${newAge}`,
              playerIds: [noble.ownerId],
            });
            continue;
          }
        }
        await db.update(schema.nobles).set({ age: newAge }).where(eq(schema.nobles.id, noble.id));
      }
    }

    // Estate generation: for each settlement, check if below noble cap
    const allSettlements = await db.select().from(schema.settlements)
      .where(eq(schema.settlements.gameId, gameId));

    for (const settlement of allSettlements) {
      const settlementBuildings = await db.select().from(schema.buildings)
        .where(and(eq(schema.buildings.settlementId, settlement.id), eq(schema.buildings.isConstructing, false)));

      const estateCount = settlementBuildings.filter(b => b.type === 'estate').length;
      if (estateCount === 0) continue;

      const nobleCap = estateCount * NOBLES_PER_ESTATE;
      const lastGen = settlement.lastNobleGeneratedTurn ?? 0;
      if (currentTurn - lastGen < NOBLE_GENERATION_DELAY_TURNS) continue;

      // Count living nobles born at this settlement
      const noblesHere = await db.select().from(schema.nobles)
        .where(and(
          eq(schema.nobles.gameId, gameId),
          eq(schema.nobles.ownerId, settlement.ownerId),
          eq(schema.nobles.birthSettlementId, settlement.id),
          eq(schema.nobles.isAlive, true),
        ));

      if (noblesHere.length >= nobleCap) continue;

      // Auto-generate a noble
      const genRng = mulberry32(currentTurn ^ parseInt(settlement.id.slice(0, 8), 16));
      const { firstName, surname } = generateNobleName(genRng);
      const age = generateNobleAge(genRng);
      const martial = generateNobleStat(genRng);
      const intelligence = generateNobleStat(genRng);
      const cunning = generateNobleStat(genRng);
      const branch = genRng() < 0.5 ? 'army' : 'navy';
      const startRank = branch === 'army' ? 'captain' : 'lieutenant';

      // Find or create family
      let familyId: string | null = null;
      const existingFamily = await db.select().from(schema.nobleFamilies)
        .where(and(
          eq(schema.nobleFamilies.gameId, gameId),
          eq(schema.nobleFamilies.ownerId, settlement.ownerId),
          eq(schema.nobleFamilies.surname, surname),
        ));
      if (existingFamily.length > 0) {
        familyId = existingFamily[0].id;
      } else {
        const [newFamily] = await db.insert(schema.nobleFamilies).values({
          gameId,
          ownerId: settlement.ownerId,
          surname,
        }).returning();
        familyId = newFamily.id;
      }

      await db.insert(schema.nobles).values({
        gameId,
        ownerId: settlement.ownerId,
        name: `${firstName} ${surname}`,
        familyId,
        age,
        birthTurn: currentTurn,
        branch: branch as any,
        rank: startRank,
        birthSettlementId: settlement.id,
        martial,
        intelligence,
        cunning,
      });

      await db.update(schema.settlements)
        .set({ lastNobleGeneratedTurn: currentTurn })
        .where(eq(schema.settlements.id, settlement.id));

      events.push({
        type: 'noble_born',
        description: `A new noble, ${firstName} ${surname}, has emerged in ${settlement.name}`,
        playerIds: [settlement.ownerId],
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
            // A noble defects
            const playerNobles = await db.select().from(schema.nobles)
              .where(and(eq(schema.nobles.gameId, gameId), eq(schema.nobles.ownerId, player.id), eq(schema.nobles.isAlive, true)));
            if (playerNobles.length > 0) {
              const target = playerNobles[Math.floor(Math.random() * playerNobles.length)];
              // Clear assignments
              if (target.assignmentType === 'army_ic' && target.assignedEntityId) {
                await db.update(schema.armies).set({ commanderNobleId: null }).where(eq(schema.armies.id, target.assignedEntityId));
              } else if (target.assignmentType === 'army_2ic' && target.assignedEntityId) {
                await db.update(schema.armies).set({ secondInCommandNobleId: null }).where(eq(schema.armies.id, target.assignedEntityId));
              } else if (target.assignmentType === 'governor' && target.assignedEntityId) {
                await db.update(schema.settlements).set({ governorNobleId: null }).where(eq(schema.settlements.id, target.assignedEntityId));
              }
              await db.update(schema.nobles).set({ isAlive: false }).where(eq(schema.nobles.id, target.id));
              events.push({
                type: 'noble_defection',
                description: `${target.name} has defected from ${player.countryName}!`,
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
  try {
    await db.insert(schema.turnSnapshots).values({
      gameId,
      turnNumber,
      snapshot: {} as any, // TODO: full state snapshot in later phases
      combatLogs: combatLogs as any,
      eventLog: events as any,
      movementLog: movementLog as any,
    }).onConflictDoUpdate({
      target: [schema.turnSnapshots.gameId, schema.turnSnapshots.turnNumber],
      set: {
        combatLogs: combatLogs as any,
        eventLog: events as any,
        movementLog: movementLog as any,
      },
    });
  } catch (snapshotErr) {
    // Fallback: if movementLog column doesn't exist yet (schema not pushed),
    // insert without it
    console.warn('Snapshot insert failed (possibly missing movementLog column), retrying without:', snapshotErr);
    try {
      await db.insert(schema.turnSnapshots).values({
        gameId,
        turnNumber,
        snapshot: {} as any,
        combatLogs: combatLogs as any,
        eventLog: events as any,
      } as any).onConflictDoUpdate({
        target: [schema.turnSnapshots.gameId, schema.turnSnapshots.turnNumber],
        set: {
          combatLogs: combatLogs as any,
          eventLog: events as any,
        } as any,
      });
    } catch (innerErr) {
      console.error('Snapshot insert completely failed:', innerErr);
    }
  }

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
