import { Router, type Router as RouterType } from 'express';
import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { STARTING_CONDITIONS } from '@kingdoms/shared';
import { SETTLEMENT_TIERS } from '@kingdoms/shared';
import { v4 as uuid } from 'uuid';
import { startTurn } from '../game/turn-manager.js';
import { buildFilteredState } from '../game/fog-filter.js';

export const gameRouter: RouterType = Router();

/** POST /api/games/:slug/start — Start the game (host only). */
gameRouter.post('/:slug/start', async (req, res) => {
  const { slug } = req.params;
  const { sessionToken } = req.body as { sessionToken: string };

  const [game] = await db.select()
    .from(schema.games)
    .where(eq(schema.games.slug, slug));

  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const [hostPlayer] = await db.select()
    .from(schema.players)
    .where(eq(schema.players.sessionToken, sessionToken));

  if (!hostPlayer || hostPlayer.id !== game.hostPlayerId) {
    res.status(403).json({ error: 'Only the host can start the game' });
    return;
  }

  if (game.status !== 'lobby') {
    res.status(400).json({ error: 'Game already started' });
    return;
  }

  const gamePlayers = await db.select()
    .from(schema.players)
    .where(eq(schema.players.gameId, game.id));

  if (gamePlayers.length < 2) {
    res.status(400).json({ error: 'Need at least 2 players' });
    return;
  }

  // Load map
  if (!game.mapId) {
    res.status(400).json({ error: 'No map selected' });
    return;
  }

  const [map] = await db.select()
    .from(schema.maps)
    .where(eq(schema.maps.id, game.mapId));

  if (!map) {
    res.status(400).json({ error: 'Map not found' });
    return;
  }

  const mapHexes = map.hexData as Array<{
    q: number; r: number; terrain: string; resources: string[]; riverEdges: string[];
  }>;
  const playerStarts = map.playerStarts as Array<{
    slotIndex: number; q: number; r: number; claimedHexes: Array<{ q: number; r: number }>;
  }>;

  // Create game hexes
  for (const hex of mapHexes) {
    // Determine ownership from player starts
    let ownerId: string | null = null;
    for (const start of playerStarts) {
      const matchingPlayer = gamePlayers.find(p => p.slotIndex === start.slotIndex);
      if (!matchingPlayer) continue;
      const isClaimed = start.claimedHexes.some(c => c.q === hex.q && c.r === hex.r)
        || (start.q === hex.q && start.r === hex.r);
      if (isClaimed) {
        ownerId = matchingPlayer.id;
        break;
      }
    }

    await db.insert(schema.gameHexes).values({
      gameId: game.id,
      q: hex.q,
      r: hex.r,
      terrain: hex.terrain,
      resources: hex.resources,
      riverEdges: hex.riverEdges || [],
      ownerId,
    });
  }

  // Create starting settlements, buildings, units, and set gold for each player
  const startTier = STARTING_CONDITIONS.settlement.tier;
  const startPop = Math.floor(
    SETTLEMENT_TIERS[startTier].popCap * STARTING_CONDITIONS.populationFraction
  );

  for (const player of gamePlayers) {
    const start = playerStarts.find(s => s.slotIndex === player.slotIndex);
    if (!start) continue;

    // Create settlement
    const [settlement] = await db.insert(schema.settlements).values({
      gameId: game.id,
      hexQ: start.q,
      hexR: start.r,
      ownerId: player.id,
      name: `${player.countryName} Capital`,
      tier: startTier,
      population: startPop,
      popCap: SETTLEMENT_TIERS[startTier].popCap,
      isCapital: true,
      storage: {},
    }).returning();

    // Link settlement to hex
    await db.update(schema.gameHexes)
      .set({ settlementId: settlement.id })
      .where(
        and(
          eq(schema.gameHexes.gameId, game.id),
          eq(schema.gameHexes.q, start.q),
          eq(schema.gameHexes.r, start.r),
        )
      );

    // Create starting buildings
    for (let i = 0; i < STARTING_CONDITIONS.buildings.length; i++) {
      await db.insert(schema.buildings).values({
        settlementId: settlement.id,
        type: STARTING_CONDITIONS.buildings[i],
        slotIndex: i,
      });
    }

    // Create starting army
    const [army] = await db.insert(schema.armies).values({
      gameId: game.id,
      ownerId: player.id,
      name: `${player.countryName} 1st Army`,
      hexQ: start.q,
      hexR: start.r,
    }).returning();

    // Create starting units
    for (const unitDef of STARTING_CONDITIONS.units) {
      for (let i = 0; i < unitDef.count; i++) {
        await db.insert(schema.units).values({
          armyId: army.id,
          type: unitDef.type,
          position: 'frontline',
        });
      }
    }

    // Set player gold and stability
    await db.update(schema.players)
      .set({
        gold: STARTING_CONDITIONS.gold,
        stability: STARTING_CONDITIONS.stability,
        taxRate: STARTING_CONDITIONS.taxRate,
      })
      .where(eq(schema.players.id, player.id));
  }

  // Start the game and the first turn
  await db.update(schema.games)
    .set({ status: 'active', currentTurn: 1 })
    .where(eq(schema.games.id, game.id));

  // Start turn 1 (sets up timer for blitz/standard modes)
  await startTurn(game.id, 1);

  res.json({ success: true, currentTurn: 1 });
});

/** GET /api/games/:slug/state — Get filtered game state for a player. */
gameRouter.get('/:slug/state', async (req, res) => {
  const { slug } = req.params;
  const sessionToken = req.headers['x-session-token'] as string;

  if (!sessionToken) {
    res.status(401).json({ error: 'Session token required' });
    return;
  }

  const [game] = await db.select()
    .from(schema.games)
    .where(eq(schema.games.slug, slug));

  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const [player] = await db.select()
    .from(schema.players)
    .where(eq(schema.players.sessionToken, sessionToken));

  if (!player || player.gameId !== game.id) {
    res.status(403).json({ error: 'Not a player in this game' });
    return;
  }

  // Fetch all game data
  const [gamePlayers, hexes, allSettlements, allArmies, allTechProgress, allRelations, allLetters, allTrades] = await Promise.all([
    db.select().from(schema.players).where(eq(schema.players.gameId, game.id)),
    db.select().from(schema.gameHexes).where(eq(schema.gameHexes.gameId, game.id)),
    db.select().from(schema.settlements).where(eq(schema.settlements.gameId, game.id)),
    db.select().from(schema.armies).where(eq(schema.armies.gameId, game.id)),
    db.select().from(schema.techProgress).where(eq(schema.techProgress.gameId, game.id)),
    db.select().from(schema.diplomacyRelations).where(eq(schema.diplomacyRelations.gameId, game.id)),
    db.select().from(schema.letters).where(eq(schema.letters.gameId, game.id)),
    db.select().from(schema.tradeAgreements).where(eq(schema.tradeAgreements.gameId, game.id)),
  ]);

  // Fetch buildings for each settlement
  const settlementBuildings: Record<string, unknown[]> = {};
  for (const s of allSettlements) {
    const buildings = await db.select().from(schema.buildings)
      .where(eq(schema.buildings.settlementId, s.id));
    settlementBuildings[s.id] = buildings;
  }

  // Fetch units for each army
  const armyUnits: Record<string, unknown[]> = {};
  for (const a of allArmies) {
    const units = await db.select().from(schema.units)
      .where(eq(schema.units.armyId, a.id));
    armyUnits[a.id] = units;
  }

  // Apply fog-of-war filtering
  const rawState = {
    game: game as Record<string, unknown>,
    player: player as Record<string, unknown>,
    players: gamePlayers.map(p => ({
      id: p.id,
      displayName: p.displayName,
      countryName: p.countryName,
      rulerName: p.rulerName,
      flagData: p.flagData,
      color: p.color,
      slotIndex: p.slotIndex,
      isEliminated: p.isEliminated,
      isSpectator: p.isSpectator,
      hasSubmitted: p.hasSubmitted,
      // Include own player's private data
      ...(p.id === player.id ? { gold: p.gold, stability: p.stability, taxRate: p.taxRate, currentResearch: p.currentResearch } : {}),
    })) as Record<string, unknown>[],
    hexes: hexes as Record<string, unknown>[],
    settlements: allSettlements.map(s => ({
      ...s,
      buildings: settlementBuildings[s.id] ?? [],
    })) as Array<Record<string, unknown> & { buildings?: unknown[] }>,
    armies: allArmies.map(a => ({
      ...a,
      units: armyUnits[a.id] ?? [],
    })) as Array<Record<string, unknown> & { units?: unknown[] }>,
  };

  // Player-specific data: own tech, own letters (delivered), diplomacy relations, trade agreements
  const myTech = allTechProgress.filter(t => t.playerId === player.id);
  const myLetters = allLetters.filter(l =>
    (l.recipientId === player.id && l.isDelivered) || l.senderId === player.id
  );
  const myRelations = allRelations.filter(r =>
    r.playerAId === player.id || r.playerBId === player.id
  );
  const myTrades = allTrades.filter(t =>
    t.playerAId === player.id || t.playerBId === player.id
  );

  // Fetch latest combat logs (from previous turn)
  const prevTurn = game.currentTurn - 1;
  let latestCombatLogs: unknown[] = [];
  if (prevTurn >= 1) {
    const [snapshot] = await db.select().from(schema.turnSnapshots)
      .where(and(
        eq(schema.turnSnapshots.gameId, game.id),
        eq(schema.turnSnapshots.turnNumber, prevTurn),
      ));
    if (snapshot?.combatLogs) {
      // Filter: only show combats where this player was involved
      latestCombatLogs = (snapshot.combatLogs as any[]).filter((log: any) => {
        const atkArmy = allArmies.find(a => a.id === log.attackerArmyId);
        const defArmy = allArmies.find(a => a.id === log.defenderArmyId);
        return atkArmy?.ownerId === player.id || defArmy?.ownerId === player.id;
      });
    }
  }

  try {
    const filtered = await buildFilteredState(game.id, player.id, rawState);
    res.json({ ...filtered, combatLogs: latestCombatLogs, techProgress: myTech, letters: myLetters, diplomacyRelations: myRelations, tradeAgreements: myTrades });
  } catch (err) {
    console.error('Fog filter error:', err);
    res.json({
      game,
      player: { ...player, sessionToken: undefined },
      players: rawState.players,
      hexes: rawState.hexes,
      settlements: rawState.settlements,
      armies: rawState.armies,
      visibility: {},
      combatLogs: latestCombatLogs,
      techProgress: myTech,
      letters: myLetters,
      diplomacyRelations: myRelations,
      tradeAgreements: myTrades,
    });
  }
});
