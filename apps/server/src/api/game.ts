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

  try {
    const result = await db.transaction(async (tx) => {
      // Lock the game row to prevent concurrent starts
      const [game] = await tx.select()
        .from(schema.games)
        .where(eq(schema.games.slug, slug))
        .for('update');

      if (!game) {
        return { status: 404, error: 'Game not found' } as const;
      }

      const [hostPlayer] = await tx.select()
        .from(schema.players)
        .where(eq(schema.players.sessionToken, sessionToken));

      if (!hostPlayer || hostPlayer.id !== game.hostPlayerId) {
        return { status: 403, error: 'Only the host can start the game' } as const;
      }

      if (game.status !== 'lobby') {
        return { status: 400, error: 'Game already started' } as const;
      }

      const gamePlayers = await tx.select()
        .from(schema.players)
        .where(eq(schema.players.gameId, game.id));

      if (gamePlayers.length < 2) {
        return { status: 400, error: 'Need at least 2 players' } as const;
      }

      // Load map
      if (!game.mapId) {
        return { status: 400, error: 'No map selected' } as const;
      }

      const [map] = await tx.select()
        .from(schema.maps)
        .where(eq(schema.maps.id, game.mapId));

      if (!map) {
        return { status: 400, error: 'Map not found' } as const;
      }

      const mapHexes = map.hexData as Array<{
        q: number; r: number; terrain: string; resources: string[]; riverEdges: string[];
      }>;
      const playerStarts = map.playerStarts as Array<{
        slotIndex: number; q: number; r: number; claimedHexes: Array<{ q: number; r: number }>;
      }>;

      // Mark game as active early (inside transaction) to prevent races
      await tx.update(schema.games)
        .set({ status: 'active', currentTurn: 1 })
        .where(eq(schema.games.id, game.id));

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

        await tx.insert(schema.gameHexes).values({
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
        const [settlement] = await tx.insert(schema.settlements).values({
          gameId: game.id,
          hexQ: start.q,
          hexR: start.r,
          ownerId: player.id,
          name: `${player.countryName} Capital`,
          tier: startTier,
          population: startPop,
          popCap: SETTLEMENT_TIERS[startTier].popCap,
          isCapital: true,
          storage: { food: STARTING_CONDITIONS.startingFood },
        }).returning();

        // Link settlement to hex
        await tx.update(schema.gameHexes)
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
          await tx.insert(schema.buildings).values({
            settlementId: settlement.id,
            type: STARTING_CONDITIONS.buildings[i],
            slotIndex: i,
          });
        }

        // Create starting army
        const [army] = await tx.insert(schema.armies).values({
          gameId: game.id,
          ownerId: player.id,
          name: `${player.countryName} 1st Army`,
          hexQ: start.q,
          hexR: start.r,
        }).returning();

        // Create starting Irregulars template for each player
        const [irregularsTemplate] = await tx.insert(schema.unitTemplates).values({
          gameId: game.id,
          playerId: player.id,
          name: 'Irregulars',
          isIrregular: true,
          isMounted: false,
          companiesOrSquadrons: 3,
          primary: null,
          secondary: null,
          sidearm: null,
          armour: null,
          mount: null,
          primaryDesignId: null,
          secondaryDesignId: null,
          sidearmDesignId: null,
        }).returning();

        // Create starting units using the new template system
        for (const unitDef of STARTING_CONDITIONS.units) {
          for (let i = 0; i < unitDef.count; i++) {
            await tx.insert(schema.units).values({
              armyId: army.id,
              templateId: irregularsTemplate.id,
              position: 'frontline',
              troopCounts: { rookie: 300, capable: 0, veteran: 0 },
              state: 'full',
              xp: 0,
              heldEquipment: { primary: 0, sidearm: 0, armour: 0, mounts: 0 },
              isOutdated: false,
              mountBreed: null,
            });
          }
        }

        // Set player gold and stability
        await tx.update(schema.players)
          .set({
            gold: STARTING_CONDITIONS.gold,
            stability: STARTING_CONDITIONS.stability,
            taxRate: STARTING_CONDITIONS.taxRate,
          })
          .where(eq(schema.players.id, player.id));
      }

      return { gameId: game.id } as const;
    });

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    // Start turn 1 outside the transaction (sets up timer for blitz/standard modes)
    await startTurn(result.gameId, 1);

    res.json({ success: true, currentTurn: 1 });
  } catch (err) {
    console.error('Game start failed:', err);
    res.status(500).json({ error: 'Failed to start game' });
  }
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
  const [gamePlayers, hexes, allSettlements, allArmies, allTechProgress, allRelations, allLetters, allTrades, allTemplates, allDesigns, allEquipmentOrders, allNobles, allNobleFamilies] = await Promise.all([
    db.select().from(schema.players).where(eq(schema.players.gameId, game.id)),
    db.select().from(schema.gameHexes).where(eq(schema.gameHexes.gameId, game.id)),
    db.select().from(schema.settlements).where(eq(schema.settlements.gameId, game.id)),
    db.select().from(schema.armies).where(eq(schema.armies.gameId, game.id)),
    db.select().from(schema.techProgress).where(eq(schema.techProgress.gameId, game.id)),
    db.select().from(schema.diplomacyRelations).where(eq(schema.diplomacyRelations.gameId, game.id)),
    db.select().from(schema.letters).where(eq(schema.letters.gameId, game.id)),
    db.select().from(schema.tradeAgreements).where(eq(schema.tradeAgreements.gameId, game.id)),
    db.select().from(schema.unitTemplates).where(eq(schema.unitTemplates.gameId, game.id)),
    db.select().from(schema.weaponDesigns).where(eq(schema.weaponDesigns.gameId, game.id)),
    db.select().from(schema.equipmentOrders).where(eq(schema.equipmentOrders.gameId, game.id)),
    db.select().from(schema.nobles).where(eq(schema.nobles.gameId, game.id)),
    db.select().from(schema.nobleFamilies).where(eq(schema.nobleFamilies.gameId, game.id)),
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
  const myTemplates = allTemplates.filter(t => t.playerId === player.id);
  const myDesigns = allDesigns.filter(d => d.playerId === player.id);
  const myEquipmentOrders = allEquipmentOrders.filter(o => o.playerId === player.id);
  // Nobles: own nobles + nobles held prisoner by this player
  const myNobles = allNobles.filter(n => n.ownerId === player.id || n.captorPlayerId === player.id);
  const myFamilies = allNobleFamilies.filter(f => f.ownerId === player.id);

  // Fetch latest combat logs + event log + movement log (from previous turn)
  const prevTurn = game.currentTurn - 1;
  let latestCombatLogs: unknown[] = [];
  let latestEventLog: unknown[] = [];
  let latestMovementLog: unknown = null;
  if (prevTurn >= 1) {
    let snapshot: Record<string, unknown> | undefined;
    try {
      const [row] = await db.select().from(schema.turnSnapshots)
        .where(and(
          eq(schema.turnSnapshots.gameId, game.id),
          eq(schema.turnSnapshots.turnNumber, prevTurn),
        ));
      snapshot = row as any;
    } catch (snapshotErr) {
      // Fallback: movementLog column may not exist yet (schema not pushed)
      // Query only the known columns
      console.warn('Snapshot query failed (possibly missing movementLog column), retrying without:', snapshotErr);
      try {
        const [row] = await db.select({
          id: schema.turnSnapshots.id,
          gameId: schema.turnSnapshots.gameId,
          turnNumber: schema.turnSnapshots.turnNumber,
          snapshot: schema.turnSnapshots.snapshot,
          combatLogs: schema.turnSnapshots.combatLogs,
          eventLog: schema.turnSnapshots.eventLog,
          createdAt: schema.turnSnapshots.createdAt,
        }).from(schema.turnSnapshots)
          .where(and(
            eq(schema.turnSnapshots.gameId, game.id),
            eq(schema.turnSnapshots.turnNumber, prevTurn),
          ));
        snapshot = row as any;
      } catch (innerErr) {
        console.error('Snapshot query completely failed:', innerErr);
      }
    }
    if (snapshot?.combatLogs) {
      // Filter: only show combats where this player was involved
      latestCombatLogs = (snapshot.combatLogs as any[]).filter((log: any) => {
        const atkArmy = allArmies.find(a => a.id === log.attackerArmyId);
        const defArmy = allArmies.find(a => a.id === log.defenderArmyId);
        return atkArmy?.ownerId === player.id || defArmy?.ownerId === player.id;
      });
    }
    if (snapshot?.eventLog) {
      // Filter: only show events that involve this player
      latestEventLog = (snapshot.eventLog as any[]).filter((evt: any) => {
        return !evt.playerIds || evt.playerIds.length === 0 || evt.playerIds.includes(player.id);
      });
    }
    if ((snapshot as any)?.movementLog) {
      // Fog-filter movement log: own armies show full path, enemy armies only in visible hexes
      const rawLog = (snapshot as any).movementLog as { ticks?: any[][]; combats?: any[] };
      if (rawLog?.ticks) {
        // We need the player's current visibility to filter
        // For now, include own army steps fully, filter enemy steps by hex visibility
        // Visibility is computed by buildFilteredState below, so we do a simpler filter:
        // include all steps where ownerId === player.id, and enemy steps through owned/visible hexes
        const filteredTicks = rawLog.ticks.map((tick: any[]) =>
          tick.filter((step: any) => {
            if (step.ownerId === player.id) return true;
            // Include enemy steps on hexes we own or have settlements on
            const toKey = `${step.toQ},${step.toR}`;
            const hex = hexes.find((h: any) => `${h.q},${h.r}` === toKey);
            return hex && hex.ownerId === player.id;
          })
        ).filter((tick: any[]) => tick.length > 0);

        const filteredCombats = (rawLog.combats ?? []).filter((c: any) => {
          const atkArmy = allArmies.find(a => a.id === c.attackerArmyId);
          const defArmy = allArmies.find(a => a.id === c.defenderArmyId);
          return atkArmy?.ownerId === player.id || defArmy?.ownerId === player.id;
        });

        latestMovementLog = { ticks: filteredTicks, combats: filteredCombats };
      }
    }
  }

  try {
    const filtered = await buildFilteredState(game.id, player.id, rawState);
    res.json({ ...filtered, combatLogs: latestCombatLogs, eventLog: latestEventLog, movementLog: latestMovementLog, techProgress: myTech, letters: myLetters, diplomacyRelations: myRelations, tradeAgreements: myTrades, unitTemplates: myTemplates, weaponDesigns: myDesigns, equipmentOrders: myEquipmentOrders, nobles: myNobles, nobleFamilies: myFamilies });
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
      eventLog: latestEventLog,
      movementLog: latestMovementLog,
      techProgress: myTech,
      letters: myLetters,
      diplomacyRelations: myRelations,
      tradeAgreements: myTrades,
      unitTemplates: myTemplates,
      weaponDesigns: myDesigns,
      equipmentOrders: myEquipmentOrders,
      nobles: myNobles,
      nobleFamilies: myFamilies,
    });
  }
});

/** POST /api/games/:slug/player/flag — Update player flag data, color, country/ruler names. */
gameRouter.post('/:slug/player/flag', async (req, res) => {
  const { slug } = req.params;
  const sessionToken = req.headers['x-session-token'] as string;
  const { flagData, color, countryName, rulerName } = req.body as {
    flagData?: Record<string, unknown>;
    color?: string;
    countryName?: string;
    rulerName?: string;
  };

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

  const updateFields: Record<string, unknown> = {};
  if (flagData) updateFields.flagData = flagData;
  if (color) updateFields.color = color;
  if (countryName !== undefined) {
    const trimmed = countryName.trim().slice(0, 40);
    if (trimmed) updateFields.countryName = trimmed;
  }
  if (rulerName !== undefined) {
    const trimmed = rulerName.trim().slice(0, 40);
    if (trimmed) updateFields.rulerName = trimmed;
  }

  if (Object.keys(updateFields).length > 0) {
    await db.update(schema.players)
      .set(updateFields)
      .where(eq(schema.players.id, player.id));
  }

  res.json({ success: true });
});

/** PATCH /api/games/:slug/army/:armyId — Rename army / update subtitle. */
gameRouter.patch('/:slug/army/:armyId', async (req, res) => {
  const sessionToken = req.headers['x-session-token'] as string;
  if (!sessionToken) { res.status(401).json({ error: 'Session token required' }); return; }

  const [player] = await db.select().from(schema.players).where(eq(schema.players.sessionToken, sessionToken));
  if (!player) { res.status(403).json({ error: 'Invalid session' }); return; }

  const { armyId } = req.params;
  const [army] = await db.select().from(schema.armies).where(eq(schema.armies.id, armyId));
  if (!army || army.ownerId !== player.id) { res.status(404).json({ error: 'Army not found' }); return; }

  const { name, subtitle } = req.body as { name?: string; subtitle?: string };
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (subtitle !== undefined) updates.subtitle = subtitle;

  if (Object.keys(updates).length > 0) {
    await db.update(schema.armies).set(updates).where(eq(schema.armies.id, armyId));
  }

  res.json({ success: true });
});

/** PATCH /api/games/:slug/unit/:unitId — Rename unit / update subtitle. */
gameRouter.patch('/:slug/unit/:unitId', async (req, res) => {
  const sessionToken = req.headers['x-session-token'] as string;
  if (!sessionToken) { res.status(401).json({ error: 'Session token required' }); return; }

  const [player] = await db.select().from(schema.players).where(eq(schema.players.sessionToken, sessionToken));
  if (!player) { res.status(403).json({ error: 'Invalid session' }); return; }

  const { unitId } = req.params;
  const [unit] = await db.select().from(schema.units).where(eq(schema.units.id, unitId));
  if (!unit) { res.status(404).json({ error: 'Unit not found' }); return; }

  // Verify ownership through army
  const [army] = await db.select().from(schema.armies).where(eq(schema.armies.id, unit.armyId));
  if (!army || army.ownerId !== player.id) { res.status(403).json({ error: 'Not your unit' }); return; }

  const { name, subtitle } = req.body as { name?: string; subtitle?: string };
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (subtitle !== undefined) updates.subtitle = subtitle;

  if (Object.keys(updates).length > 0) {
    await db.update(schema.units).set(updates).where(eq(schema.units.id, unitId));
  }

  res.json({ success: true });
});

/** PATCH /api/games/:slug/hex — Rename a hex (custom name). */
gameRouter.patch('/:slug/hex', async (req, res) => {
  const { slug } = req.params;
  const sessionToken = req.headers['x-session-token'] as string;
  if (!sessionToken) { res.status(401).json({ error: 'Session token required' }); return; }

  const [game] = await db.select().from(schema.games).where(eq(schema.games.slug, slug));
  if (!game) { res.status(404).json({ error: 'Game not found' }); return; }

  const [player] = await db.select().from(schema.players).where(eq(schema.players.sessionToken, sessionToken));
  if (!player || player.gameId !== game.id) { res.status(403).json({ error: 'Not in this game' }); return; }

  const { q, r, customName } = req.body as { q: number; r: number; customName: string };
  if (q === undefined || r === undefined) { res.status(400).json({ error: 'q and r required' }); return; }

  const [hex] = await db.select().from(schema.gameHexes).where(
    and(eq(schema.gameHexes.gameId, game.id), eq(schema.gameHexes.q, q), eq(schema.gameHexes.r, r))
  );
  if (!hex) { res.status(404).json({ error: 'Hex not found' }); return; }

  // Only owner can name a hex
  if (hex.ownerId !== player.id) { res.status(403).json({ error: 'You do not control this hex' }); return; }

  await db.update(schema.gameHexes).set({ customName: customName || null })
    .where(eq(schema.gameHexes.id, hex.id));

  res.json({ success: true });
});

/** PATCH /api/games/:slug/settlement — Rename a settlement. */
gameRouter.patch(':slug/settlement', async (req, res) => {
  const { slug } = req.params;
  const sessionToken = req.headers['x-session-token'] as string;
  if (!sessionToken) { res.status(401).json({ error: 'Session token required' }); return; }

  const [game] = await db.select().from(schema.games).where(eq(schema.games.slug, slug));
  if (!game) { res.status(404).json({ error: 'Game not found' }); return; }

  const [player] = await db.select().from(schema.players).where(eq(schema.players.sessionToken, sessionToken));
  if (!player || player.gameId !== game.id) { res.status(403).json({ error: 'Not in this game' }); return; }

  const { settlementId, name } = req.body as { settlementId: string; name: string };
  if (!settlementId || !name?.trim()) { res.status(400).json({ error: 'settlementId and name required' }); return; }

  const [settlement] = await db.select().from(schema.settlements).where(eq(schema.settlements.id, settlementId));
  if (!settlement) { res.status(404).json({ error: 'Settlement not found' }); return; }
  if (settlement.ownerId !== player.id) { res.status(403).json({ error: 'You do not own this settlement' }); return; }

  await db.update(schema.settlements).set({ name: name.trim() })
    .where(eq(schema.settlements.id, settlement.id));

  res.json({ success: true });
});
