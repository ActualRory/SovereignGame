/**
 * Fog-of-war filter — the security boundary.
 * Runs on EVERY outbound game state message to strip data the player shouldn't see.
 *
 * Rules:
 * - full_vision: everything visible
 * - soft_fog: terrain, resources, river edges, owner, settlement name/tier — NO armies, units, detailed settlement data
 * - undiscovered: nothing (hex not included in response)
 */

import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import {
  hexKey, type FogState,
  calculateVisibility, decayVisibility,
  armyVisionSource, settlementVisionSource,
  type VisionSource,
} from '@kingdoms/shared';

export interface FilteredGameState {
  game: Record<string, unknown>;
  player: Record<string, unknown>;
  players: Record<string, unknown>[];
  hexes: Record<string, unknown>[];
  settlements: Record<string, unknown>[];
  armies: Record<string, unknown>[];
  visibility: Record<string, FogState>;
}

/**
 * Build the per-player filtered game state.
 * Recalculates visibility, persists it, then strips hidden data.
 */
export async function buildFilteredState(
  gameId: string,
  playerId: string,
  rawState: {
    game: Record<string, unknown>;
    player: Record<string, unknown>;
    players: Record<string, unknown>[];
    hexes: Record<string, unknown>[];
    settlements: Array<Record<string, unknown> & { buildings?: unknown[] }>;
    armies: Array<Record<string, unknown> & { units?: unknown[] }>;
  },
): Promise<FilteredGameState> {
  const { game, player, players, hexes, settlements, armies } = rawState;
  const preExplored = (game.preExplored as boolean) ?? false;

  // ── Check for tech bonuses ──
  const [cartographyTech] = await db.select().from(schema.techProgress)
    .where(and(
      eq(schema.techProgress.gameId, gameId),
      eq(schema.techProgress.playerId, playerId),
      eq(schema.techProgress.tech, 'cartography'),
    ));
  const hasCartography = cartographyTech?.isResearched ?? false;

  const [opticsTech] = await db.select().from(schema.techProgress)
    .where(and(
      eq(schema.techProgress.gameId, gameId),
      eq(schema.techProgress.playerId, playerId),
      eq(schema.techProgress.tech, 'optics'),
    ));
  const hasOptics = opticsTech?.isResearched ?? false;

  // ── Build vision sources ──
  const sources: VisionSource[] = [];

  // Settlements owned by this player
  for (const s of settlements) {
    if (s.ownerId === playerId) {
      sources.push(settlementVisionSource(
        { q: s.hexQ as number, r: s.hexR as number },
        hasCartography,
      ));
    }
  }

  // Armies owned by this player
  for (const a of armies) {
    if (a.ownerId === playerId) {
      sources.push(armyVisionSource(
        { q: a.hexQ as number, r: a.hexR as number },
        hasOptics,
      ));
    }
  }

  // ── Load previous visibility ──
  const visRows = await db.select().from(schema.hexVisibility)
    .where(and(
      eq(schema.hexVisibility.gameId, gameId),
      eq(schema.hexVisibility.playerId, playerId),
    ));

  const previousVis = new Map<string, FogState>();
  for (const row of visRows) {
    previousVis.set(hexKey({ q: row.q, r: row.r }), row.state);
  }

  // All valid hex keys
  const allHexKeys = new Set(hexes.map(h => hexKey({ q: h.q as number, r: h.r as number })));

  // Decay full_vision → soft_fog, then recalculate
  const decayed = decayVisibility(previousVis);
  const newVis = calculateVisibility(sources, decayed, allHexKeys, preExplored);

  // ── Persist updated visibility ──
  for (const [key, state] of newVis) {
    const [qStr, rStr] = key.split(',');
    const q = Number(qStr);
    const r = Number(rStr);
    const prevState = previousVis.get(key);

    if (prevState === undefined) {
      // Insert new row (use onConflict to handle races)
      if (state !== 'undiscovered') {
        await db.insert(schema.hexVisibility).values({
          gameId, playerId, q, r, state,
        }).onConflictDoUpdate({
          target: [schema.hexVisibility.gameId, schema.hexVisibility.playerId, schema.hexVisibility.q, schema.hexVisibility.r],
          set: { state },
        });
      }
    } else if (prevState !== state) {
      // Update existing row
      await db.update(schema.hexVisibility)
        .set({ state })
        .where(and(
          eq(schema.hexVisibility.gameId, gameId),
          eq(schema.hexVisibility.playerId, playerId),
          eq(schema.hexVisibility.q, q),
          eq(schema.hexVisibility.r, r),
        ));
    }
  }

  // ── Filter game data based on visibility ──
  const visMap = Object.fromEntries(newVis) as Record<string, FogState>;

  // Filter hexes
  const filteredHexes: Record<string, unknown>[] = [];
  for (const hex of hexes) {
    const key = hexKey({ q: hex.q as number, r: hex.r as number });
    const fogState = newVis.get(key) ?? 'undiscovered';

    if (fogState === 'undiscovered') continue; // Don't send at all

    if (fogState === 'soft_fog') {
      // Soft fog: terrain, resources, rivers, owner — no detailed info
      filteredHexes.push({
        q: hex.q,
        r: hex.r,
        terrain: hex.terrain,
        resources: hex.resources,
        riverEdges: hex.riverEdges,
        ownerId: hex.ownerId,
        settlementId: hex.settlementId,
        fogState: 'soft_fog',
      });
    } else {
      // Full vision: everything
      filteredHexes.push({
        ...hex,
        fogState: 'full_vision',
      });
    }
  }

  // Filter settlements
  const filteredSettlements: Record<string, unknown>[] = [];
  for (const s of settlements) {
    const key = hexKey({ q: s.hexQ as number, r: s.hexR as number });
    const fogState = newVis.get(key) ?? 'undiscovered';

    if (fogState === 'undiscovered') continue;

    if (fogState === 'soft_fog') {
      // Soft fog: name, tier, location only
      filteredSettlements.push({
        id: s.id,
        gameId: s.gameId,
        hexQ: s.hexQ,
        hexR: s.hexR,
        ownerId: s.ownerId,
        name: s.name,
        tier: s.tier,
        isCapital: s.isCapital,
        fogState: 'soft_fog',
        // No population, storage, buildings, construction queue
      });
    } else {
      // Full vision: everything
      filteredSettlements.push({
        ...s,
        fogState: 'full_vision',
      });
    }
  }

  // Filter armies — only visible under full vision
  const filteredArmies: Record<string, unknown>[] = [];
  for (const a of armies) {
    const key = hexKey({ q: a.hexQ as number, r: a.hexR as number });
    const fogState = newVis.get(key) ?? 'undiscovered';

    if (fogState !== 'full_vision') continue;

    // Own armies: full detail. Enemy armies: limited info
    if (a.ownerId === playerId) {
      filteredArmies.push({ ...a, fogState: 'full_vision' });
    } else {
      // Enemy army: show position, owner, name, unit count — no detailed unit stats
      const unitCount = Array.isArray(a.units) ? a.units.length : 0;
      filteredArmies.push({
        id: a.id,
        gameId: a.gameId,
        ownerId: a.ownerId,
        name: a.name,
        hexQ: a.hexQ,
        hexR: a.hexR,
        isNaval: a.isNaval,
        unitCount,
        fogState: 'full_vision',
        // No unit details, no movement path, no supply bank
      });
    }
  }

  // Filter players — hide gold/stability/taxRate of others
  const filteredPlayers = players.map(p => {
    if (p.id === playerId) return p;
    return {
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
    };
  });

  return {
    game,
    player: { ...player, sessionToken: undefined },
    players: filteredPlayers,
    hexes: filteredHexes,
    settlements: filteredSettlements,
    armies: filteredArmies,
    visibility: visMap,
  };
}
