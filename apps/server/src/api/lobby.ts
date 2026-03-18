import { Router, type Router as RouterType } from 'express';
import { v4 as uuid } from 'uuid';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

export const lobbyRouter: RouterType = Router();

const PLAYER_COLORS = [
  '#C62828', '#1565C0', '#2E7D32', '#F9A825',
  '#6A1B9A', '#EF6C00', '#00838F', '#AD1457',
];

function generateSlug(): string {
  const words = ['iron', 'oak', 'frost', 'dawn', 'ember', 'crown', 'vale', 'storm', 'lion', 'raven', 'stone', 'forge'];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  return `${pick()}-${pick()}-${Math.floor(Math.random() * 1000)}`;
}

/** POST /api/lobbies — Create a new game lobby. */
lobbyRouter.post('/', async (req, res) => {
  const { name, displayName } = req.body as { name?: string; displayName?: string };
  const gameName = name || 'New Game';
  const playerName = displayName || 'Player 1';
  const slug = generateSlug();
  const sessionToken = uuid();

  // Auto-assign first available map
  const [defaultMap] = await db.select().from(schema.maps);

  const [game] = await db.insert(schema.games).values({
    slug,
    name: gameName,
    status: 'lobby',
    mode: 'standard',
    mapId: defaultMap?.id ?? null,
  }).returning();

  const [player] = await db.insert(schema.players).values({
    gameId: game.id,
    sessionToken,
    displayName: playerName,
    slotIndex: 0,
    color: PLAYER_COLORS[0],
  }).returning();

  // Set host
  await db.update(schema.games)
    .set({ hostPlayerId: player.id })
    .where(eq(schema.games.id, game.id));

  res.status(201).json({
    game: { ...game, hostPlayerId: player.id },
    player,
    sessionToken,
  });
});

/** GET /api/lobbies/:slug — Get lobby state. */
lobbyRouter.get('/:slug', async (req, res) => {
  const { slug } = req.params;

  const [game] = await db.select()
    .from(schema.games)
    .where(eq(schema.games.slug, slug));

  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const gamePlayers = await db.select()
    .from(schema.players)
    .where(eq(schema.players.gameId, game.id));

  res.json({ game, players: gamePlayers });
});

/** POST /api/lobbies/:slug/join — Join an existing lobby. */
lobbyRouter.post('/:slug/join', async (req, res) => {
  const { slug } = req.params;
  const { displayName } = req.body as { displayName?: string };

  const [game] = await db.select()
    .from(schema.games)
    .where(eq(schema.games.slug, slug));

  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  if (game.status !== 'lobby') {
    res.status(400).json({ error: 'Game already started' });
    return;
  }

  const existingPlayers = await db.select()
    .from(schema.players)
    .where(eq(schema.players.gameId, game.id));

  if (existingPlayers.length >= 8) {
    res.status(400).json({ error: 'Lobby is full' });
    return;
  }

  const slotIndex = existingPlayers.length;
  const sessionToken = uuid();

  const [player] = await db.insert(schema.players).values({
    gameId: game.id,
    sessionToken,
    displayName: displayName || `Player ${slotIndex + 1}`,
    slotIndex,
    color: PLAYER_COLORS[slotIndex % PLAYER_COLORS.length],
  }).returning();

  res.status(201).json({ player, sessionToken });
});

/** PATCH /api/lobbies/:slug/settings — Update lobby settings. */
lobbyRouter.patch('/:slug/settings', async (req, res) => {
  const { slug } = req.params;
  const { sessionToken, ...settings } = req.body as {
    sessionToken: string;
    mode?: string;
    earlySubmit?: boolean;
    preExplored?: boolean;
    neutralSettlements?: boolean;
    mapId?: string;
  };

  const [game] = await db.select()
    .from(schema.games)
    .where(eq(schema.games.slug, slug));

  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  // Verify host
  const [player] = await db.select()
    .from(schema.players)
    .where(eq(schema.players.sessionToken, sessionToken));

  if (!player || player.id !== game.hostPlayerId) {
    res.status(403).json({ error: 'Only the host can change settings' });
    return;
  }

  const updateFields: Record<string, unknown> = {};
  if (settings.mode) updateFields.mode = settings.mode;
  if (settings.earlySubmit !== undefined) updateFields.earlySubmit = settings.earlySubmit;
  if (settings.preExplored !== undefined) updateFields.preExplored = settings.preExplored;
  if (settings.neutralSettlements !== undefined) updateFields.neutralSettlements = settings.neutralSettlements;
  if (settings.mapId) updateFields.mapId = settings.mapId;

  await db.update(schema.games)
    .set(updateFields)
    .where(eq(schema.games.id, game.id));

  res.json({ success: true });
});
