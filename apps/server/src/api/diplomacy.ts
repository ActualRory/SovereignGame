import { Router, type Router as RouterType } from 'express';
import { eq, and, or } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { hexDistance, UNILATERAL_ATTACHMENTS, type LetterAttachment, type AttachmentType } from '@kingdoms/shared';
import { processAttachmentEffect } from '../game/attachment-effects.js';

export const diplomacyRouter: RouterType = Router();

/** POST /api/games/:slug/letters — Send a letter. */
diplomacyRouter.post('/:slug/letters', async (req, res) => {
  const { slug } = req.params;
  const sessionToken = req.headers['x-session-token'] as string;
  if (!sessionToken) { res.status(401).json({ error: 'Session token required' }); return; }

  const [game] = await db.select().from(schema.games).where(eq(schema.games.slug, slug));
  if (!game || game.status !== 'active') { res.status(400).json({ error: 'Game not active' }); return; }

  const [sender] = await db.select().from(schema.players).where(eq(schema.players.sessionToken, sessionToken));
  if (!sender || sender.gameId !== game.id) { res.status(403).json({ error: 'Not in this game' }); return; }

  const { recipientId, bodyText, attachments } = req.body;
  if (!recipientId || !bodyText) { res.status(400).json({ error: 'recipientId and bodyText required' }); return; }

  const [recipient] = await db.select().from(schema.players).where(eq(schema.players.id, recipientId));
  if (!recipient || recipient.gameId !== game.id) { res.status(400).json({ error: 'Invalid recipient' }); return; }

  // Calculate delivery delay: 1 minor turn per hex distance between capitals
  const senderSettlements = await db.select().from(schema.settlements)
    .where(and(eq(schema.settlements.gameId, game.id), eq(schema.settlements.ownerId, sender.id), eq(schema.settlements.isCapital, true)));
  const recipientSettlements = await db.select().from(schema.settlements)
    .where(and(eq(schema.settlements.gameId, game.id), eq(schema.settlements.ownerId, recipientId), eq(schema.settlements.isCapital, true)));

  const senderCap = senderSettlements[0];
  const recipientCap = recipientSettlements[0];

  let deliveryDelay = 1; // minimum 1 turn
  if (senderCap && recipientCap) {
    const dist = hexDistance(
      { q: senderCap.hexQ, r: senderCap.hexR },
      { q: recipientCap.hexQ, r: recipientCap.hexR },
    );
    // Letters travel ~3x faster than armies (riders/pigeons)
    deliveryDelay = Math.max(1, Math.ceil(dist / 3));
  }

  const [letter] = await db.insert(schema.letters).values({
    gameId: game.id,
    senderId: sender.id,
    recipientId,
    bodyText,
    attachments: attachments ?? [],
    sentTurn: game.currentTurn,
    deliveryTurn: game.currentTurn + deliveryDelay,
  }).returning();

  res.json({ letter });
});

/** POST /api/games/:slug/letters/:letterId/read — Mark letter as read. */
diplomacyRouter.post('/:slug/letters/:letterId/read', async (req, res) => {
  const sessionToken = req.headers['x-session-token'] as string;
  if (!sessionToken) { res.status(401).json({ error: 'Session token required' }); return; }

  const [player] = await db.select().from(schema.players).where(eq(schema.players.sessionToken, sessionToken));
  if (!player) { res.status(403).json({ error: 'Invalid session' }); return; }

  const { letterId } = req.params;
  const [letter] = await db.select().from(schema.letters).where(eq(schema.letters.id, letterId));
  if (!letter || letter.recipientId !== player.id) { res.status(404).json({ error: 'Letter not found' }); return; }

  await db.update(schema.letters).set({ isRead: true }).where(eq(schema.letters.id, letterId));
  res.json({ success: true });
});

/** DELETE /api/games/:slug/letters/:letterId — Recall an undelivered letter. */
diplomacyRouter.delete('/:slug/letters/:letterId', async (req, res) => {
  const sessionToken = req.headers['x-session-token'] as string;
  if (!sessionToken) { res.status(401).json({ error: 'Session token required' }); return; }

  const [player] = await db.select().from(schema.players).where(eq(schema.players.sessionToken, sessionToken));
  if (!player) { res.status(403).json({ error: 'Invalid session' }); return; }

  const { letterId } = req.params;
  const [letter] = await db.select().from(schema.letters).where(eq(schema.letters.id, letterId));
  if (!letter || letter.senderId !== player.id) { res.status(404).json({ error: 'Letter not found' }); return; }

  if (letter.isDelivered) {
    res.status(400).json({ error: 'Cannot recall a delivered letter' });
    return;
  }

  await db.delete(schema.letters).where(eq(schema.letters.id, letterId));
  res.json({ success: true, letter });
});

/** POST /api/games/:slug/diplomacy/propose — Propose alliance/NAP. */
diplomacyRouter.post('/:slug/diplomacy/propose', async (req, res) => {
  const { slug } = req.params;
  const sessionToken = req.headers['x-session-token'] as string;
  if (!sessionToken) { res.status(401).json({ error: 'Session token required' }); return; }

  const [game] = await db.select().from(schema.games).where(eq(schema.games.slug, slug));
  if (!game || game.status !== 'active') { res.status(400).json({ error: 'Game not active' }); return; }

  const [player] = await db.select().from(schema.players).where(eq(schema.players.sessionToken, sessionToken));
  if (!player || player.gameId !== game.id) { res.status(403).json({ error: 'Not in this game' }); return; }

  const { targetPlayerId, relationType, terms } = req.body;
  if (!targetPlayerId || !relationType) { res.status(400).json({ error: 'targetPlayerId and relationType required' }); return; }

  // Check no existing relation
  const existing = await db.select().from(schema.diplomacyRelations)
    .where(and(
      eq(schema.diplomacyRelations.gameId, game.id),
      or(
        and(eq(schema.diplomacyRelations.playerAId, player.id), eq(schema.diplomacyRelations.playerBId, targetPlayerId)),
        and(eq(schema.diplomacyRelations.playerAId, targetPlayerId), eq(schema.diplomacyRelations.playerBId, player.id)),
      ),
    ));

  if (existing.length > 0) {
    // Update existing relation
    await db.update(schema.diplomacyRelations)
      .set({ relationType, terms: terms ?? null, startedTurn: game.currentTurn, allianceName: terms?.name ?? null })
      .where(eq(schema.diplomacyRelations.id, existing[0].id));
  } else {
    await db.insert(schema.diplomacyRelations).values({
      gameId: game.id,
      playerAId: player.id,
      playerBId: targetPlayerId,
      relationType,
      terms: terms ?? null,
      allianceName: terms?.name ?? null,
      startedTurn: game.currentTurn,
    });
  }

  res.json({ success: true });
});

/** DELETE /api/games/:slug/diplomacy/:relationId — Dissolve a relation. */
diplomacyRouter.delete('/:slug/diplomacy/:relationId', async (req, res) => {
  const sessionToken = req.headers['x-session-token'] as string;
  if (!sessionToken) { res.status(401).json({ error: 'Session token required' }); return; }

  const [player] = await db.select().from(schema.players).where(eq(schema.players.sessionToken, sessionToken));
  if (!player) { res.status(403).json({ error: 'Invalid session' }); return; }

  const { relationId } = req.params;
  const [relation] = await db.select().from(schema.diplomacyRelations).where(eq(schema.diplomacyRelations.id, relationId));
  if (!relation || (relation.playerAId !== player.id && relation.playerBId !== player.id)) {
    res.status(404).json({ error: 'Relation not found' }); return;
  }

  await db.delete(schema.diplomacyRelations).where(eq(schema.diplomacyRelations.id, relationId));
  res.json({ success: true });
});

/** POST /api/games/:slug/letters/:letterId/respond — Accept or reject proposal attachments. */
diplomacyRouter.post('/:slug/letters/:letterId/respond', async (req, res) => {
  const { slug, letterId } = req.params;
  const sessionToken = req.headers['x-session-token'] as string;
  if (!sessionToken) { res.status(401).json({ error: 'Session token required' }); return; }

  const [game] = await db.select().from(schema.games).where(eq(schema.games.slug, slug));
  if (!game || game.status !== 'active') { res.status(400).json({ error: 'Game not active' }); return; }

  const [player] = await db.select().from(schema.players).where(eq(schema.players.sessionToken, sessionToken));
  if (!player || player.gameId !== game.id) { res.status(403).json({ error: 'Not in this game' }); return; }

  const [letter] = await db.select().from(schema.letters).where(eq(schema.letters.id, letterId));
  if (!letter || letter.recipientId !== player.id) { res.status(404).json({ error: 'Letter not found' }); return; }
  if (!letter.isDelivered) { res.status(400).json({ error: 'Letter not yet delivered' }); return; }
  if (letter.response) { res.status(400).json({ error: 'Already responded' }); return; }

  const attachments = (letter.attachments ?? []) as LetterAttachment[];
  const hasProposals = attachments.some(a => !UNILATERAL_ATTACHMENTS.includes(a.type));
  if (!hasProposals) { res.status(400).json({ error: 'No proposals to respond to' }); return; }

  const { accept } = req.body;
  const response = accept ? 'accepted' : 'rejected';

  await db.update(schema.letters).set({ response, isRead: true }).where(eq(schema.letters.id, letterId));

  if (accept) {
    for (const attachment of attachments) {
      if (UNILATERAL_ATTACHMENTS.includes(attachment.type)) continue;
      await processAttachmentEffect(game.id, game.currentTurn, letter.senderId, letter.recipientId, attachment);
    }
  }

  res.json({ success: true, response });
});
