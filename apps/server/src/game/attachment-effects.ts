import { eq, and, or } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { LetterAttachment, AttachmentType, TradeAttachmentDetails, AllianceAttachmentDetails, AllianceTier, RelationType } from '@kingdoms/shared';

/**
 * Process the game effect of a single letter attachment.
 * Called either on delivery (unilateral) or on acceptance (proposals).
 */
export async function processAttachmentEffect(
  gameId: string,
  currentTurn: number,
  senderId: string,
  recipientId: string,
  attachment: LetterAttachment,
): Promise<void> {
  const { type, details } = attachment;

  switch (type) {
    // ── War & Peace ──
    case 'declaration_of_war':
      await upsertRelation(gameId, currentTurn, senderId, recipientId, 'war');
      break;

    case 'white_peace':
      await deleteRelation(gameId, senderId, recipientId);
      break;

    case 'peace_treaty':
      await deleteRelation(gameId, senderId, recipientId);
      break;

    case 'unconditional_surrender':
      await deleteRelation(gameId, senderId, recipientId);
      break;

    // ── Agreements ──
    case 'nap_proposal': {
      await upsertRelation(gameId, currentTurn, senderId, recipientId, 'nap');
      break;
    }

    case 'alliance_proposal': {
      const d = (details ?? {}) as AllianceAttachmentDetails;
      const tier: AllianceTier = d.tier ?? 'alliance';
      const relationType: RelationType = tier === 'nap' ? 'nap' : tier === 'military_union' ? 'military_union' : 'alliance';
      await upsertRelation(gameId, currentTurn, senderId, recipientId, relationType, d.name, d.terms);
      break;
    }

    // ── Economic ──
    case 'open_trade':
      await upsertRelation(gameId, currentTurn, senderId, recipientId, 'nap');
      // Also create an open_trade agreement
      await db.insert(schema.tradeAgreements).values({
        gameId,
        playerAId: senderId,
        playerBId: recipientId,
        tier: 'open_trade',
        terms: {},
        isStanding: true,
        startedTurn: currentTurn,
      });
      break;

    case 'trade_route_proposal': {
      const d = (details ?? {}) as TradeAttachmentDetails;
      await db.insert(schema.tradeAgreements).values({
        gameId,
        playerAId: senderId,
        playerBId: recipientId,
        tier: 'trade_route',
        terms: {
          offeredResources: d.offeredResources ?? [],
          requestedResources: d.requestedResources ?? [],
        },
        isStanding: d.isStanding ?? false,
        startedTurn: currentTurn,
      });
      break;
    }

    case 'economic_union':
      await db.insert(schema.tradeAgreements).values({
        gameId,
        playerAId: senderId,
        playerBId: recipientId,
        tier: 'economic_union',
        terms: {},
        isStanding: true,
        startedTurn: currentTurn,
      });
      break;

    case 'close_trade': {
      // Delete all trade agreements between these two players
      const trades = await db.select().from(schema.tradeAgreements)
        .where(and(
          eq(schema.tradeAgreements.gameId, gameId),
          or(
            and(eq(schema.tradeAgreements.playerAId, senderId), eq(schema.tradeAgreements.playerBId, recipientId)),
            and(eq(schema.tradeAgreements.playerAId, recipientId), eq(schema.tradeAgreements.playerBId, senderId)),
          ),
        ));
      for (const t of trades) {
        await db.delete(schema.tradeAgreements).where(eq(schema.tradeAgreements.id, t.id));
      }
      break;
    }

    // ── Territorial ──
    case 'vassal_offer':
      await upsertRelation(gameId, currentTurn, recipientId, senderId, 'vassal');
      break;

    // ── Intelligence (no-op for now, handled elsewhere) ──
    case 'share_maps':
    case 'share_intelligence':
    case 'tribute_demand':
    case 'offer_subsidy':
    case 'loan':
    case 'land_cession':
      break;
  }
}

// ── Helpers ──

async function upsertRelation(
  gameId: string, currentTurn: number,
  playerAId: string, playerBId: string,
  relationType: RelationType,
  allianceName?: string,
  terms?: Record<string, unknown>,
) {
  const existing = await db.select().from(schema.diplomacyRelations)
    .where(and(
      eq(schema.diplomacyRelations.gameId, gameId),
      or(
        and(eq(schema.diplomacyRelations.playerAId, playerAId), eq(schema.diplomacyRelations.playerBId, playerBId)),
        and(eq(schema.diplomacyRelations.playerAId, playerBId), eq(schema.diplomacyRelations.playerBId, playerAId)),
      ),
    ));

  if (existing.length > 0) {
    await db.update(schema.diplomacyRelations)
      .set({ relationType, terms: terms ?? null, allianceName: allianceName ?? null, startedTurn: currentTurn })
      .where(eq(schema.diplomacyRelations.id, existing[0].id));
  } else {
    await db.insert(schema.diplomacyRelations).values({
      gameId,
      playerAId: playerAId,
      playerBId: playerBId,
      relationType,
      terms: terms ?? null,
      allianceName: allianceName ?? null,
      startedTurn: currentTurn,
    });
  }
}

async function deleteRelation(gameId: string, playerAId: string, playerBId: string) {
  const existing = await db.select().from(schema.diplomacyRelations)
    .where(and(
      eq(schema.diplomacyRelations.gameId, gameId),
      or(
        and(eq(schema.diplomacyRelations.playerAId, playerAId), eq(schema.diplomacyRelations.playerBId, playerBId)),
        and(eq(schema.diplomacyRelations.playerAId, playerBId), eq(schema.diplomacyRelations.playerBId, playerAId)),
      ),
    ));

  for (const rel of existing) {
    await db.delete(schema.diplomacyRelations).where(eq(schema.diplomacyRelations.id, rel.id));
  }
}
