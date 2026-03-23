import { Router, type Router as RouterType } from 'express';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { onPlayerSubmit } from '../game/turn-manager.js';

export const ordersRouter: RouterType = Router();

/** POST /api/games/:slug/orders — Submit turn orders. */
ordersRouter.post('/:slug/orders', async (req, res) => {
  const { slug } = req.params;
  const sessionToken = req.headers['x-session-token'] as string;

  if (!sessionToken) {
    res.status(401).json({ error: 'Session token required' });
    return;
  }

  const [game] = await db.select()
    .from(schema.games)
    .where(eq(schema.games.slug, slug));

  if (!game || game.status !== 'active') {
    res.status(400).json({ error: 'Game not active' });
    return;
  }

  const [player] = await db.select()
    .from(schema.players)
    .where(eq(schema.players.sessionToken, sessionToken));

  if (!player || player.gameId !== game.id) {
    res.status(403).json({ error: 'Not in this game' });
    return;
  }

  if (player.isEliminated) {
    res.status(400).json({ error: 'You are eliminated' });
    return;
  }

  if (player.hasSubmitted) {
    res.status(400).json({ error: 'Already submitted this turn' });
    return;
  }

  const { orders } = req.body;
  if (!orders) {
    res.status(400).json({ error: 'Orders required' });
    return;
  }

  // Upsert orders for this turn
  const existing = await db.select().from(schema.turnOrders)
    .where(and(
      eq(schema.turnOrders.gameId, game.id),
      eq(schema.turnOrders.playerId, player.id),
      eq(schema.turnOrders.turnNumber, game.currentTurn),
    ));

  if (existing.length > 0) {
    await db.update(schema.turnOrders)
      .set({ orders, submittedAt: new Date() })
      .where(eq(schema.turnOrders.id, existing[0].id));
  } else {
    await db.insert(schema.turnOrders).values({
      gameId: game.id,
      playerId: player.id,
      turnNumber: game.currentTurn,
      orders,
    });
  }

  // Trigger submit logic (checks if all submitted, may resolve turn)
  try {
    await onPlayerSubmit(game.id, player.id);
  } catch (err) {
    console.error('Turn submit/resolution error:', err);
    res.status(500).json({ error: 'Turn resolution failed' });
    return;
  }

  res.json({ success: true });
});

/** DELETE /api/games/:slug/orders — Retract turn submission (un-end turn). */
ordersRouter.delete('/:slug/orders', async (req, res) => {
  const { slug } = req.params;
  const sessionToken = req.headers['x-session-token'] as string;

  if (!sessionToken) {
    res.status(401).json({ error: 'Session token required' });
    return;
  }

  const [game] = await db.select()
    .from(schema.games)
    .where(eq(schema.games.slug, slug));

  if (!game || game.status !== 'active') {
    res.status(400).json({ error: 'Game not active' });
    return;
  }

  const [player] = await db.select()
    .from(schema.players)
    .where(eq(schema.players.sessionToken, sessionToken));

  if (!player || player.gameId !== game.id) {
    res.status(403).json({ error: 'Not in this game' });
    return;
  }

  if (!player.hasSubmitted) {
    res.status(400).json({ error: 'Not submitted yet' });
    return;
  }

  // Check that not all players have submitted (turn would already be resolving)
  const allPlayers = await db.select().from(schema.players)
    .where(eq(schema.players.gameId, game.id));
  const activePlayers = allPlayers.filter(p => !p.isEliminated && !p.isSpectator);
  const allSubmitted = activePlayers.every(p => p.hasSubmitted);

  if (allSubmitted) {
    res.status(400).json({ error: 'All players have submitted — turn is resolving' });
    return;
  }

  // Retract submission
  await db.update(schema.players)
    .set({ hasSubmitted: false })
    .where(eq(schema.players.id, player.id));

  // Notify other players
  const { getIO } = await import('../game/turn-manager.js');
  const io = getIO();
  io?.to(`game:${game.id}`).emit('player_unsubmitted', { playerId: player.id });

  res.json({ success: true });
});

/** GET /api/games/:slug/orders — Get current player's saved orders for this turn. */
ordersRouter.get('/:slug/orders', async (req, res) => {
  const { slug } = req.params;
  const sessionToken = req.headers['x-session-token'] as string;

  if (!sessionToken) {
    res.status(401).json({ error: 'Session token required' });
    return;
  }

  const [game] = await db.select().from(schema.games).where(eq(schema.games.slug, slug));
  if (!game) { res.status(404).json({ error: 'Game not found' }); return; }

  const [player] = await db.select().from(schema.players)
    .where(eq(schema.players.sessionToken, sessionToken));
  if (!player || player.gameId !== game.id) {
    res.status(403).json({ error: 'Not in this game' }); return;
  }

  const [orderRow] = await db.select().from(schema.turnOrders)
    .where(and(
      eq(schema.turnOrders.gameId, game.id),
      eq(schema.turnOrders.playerId, player.id),
      eq(schema.turnOrders.turnNumber, game.currentTurn),
    ));

  res.json({ orders: orderRow?.orders ?? null });
});
