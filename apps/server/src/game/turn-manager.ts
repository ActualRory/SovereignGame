import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import {
  scheduleTurnDeadline, cancelTurnDeadline,
  getRemainingTime, TURN_DURATIONS,
} from './timer.js';
import { resolveTurn } from './turn-resolver.js';
import type { Server as SocketServer } from 'socket.io';

let io: SocketServer | null = null;

export function setSocketServer(socketServer: SocketServer) {
  io = socketServer;
}

/**
 * Begin a new turn for a game. Sets up deadline timers and resets submit flags.
 */
export async function startTurn(gameId: string, turnNumber: number) {
  const [game] = await db.select().from(schema.games).where(eq(schema.games.id, gameId));
  if (!game) return;

  // Reset all player submit flags
  const players = await db.select().from(schema.players).where(eq(schema.players.gameId, gameId));
  for (const p of players) {
    if (p.isEliminated) continue;
    await db.update(schema.players)
      .set({ hasSubmitted: false })
      .where(eq(schema.players.id, p.id));
  }

  // Schedule deadline for timed modes
  const mode = game.mode as keyof typeof TURN_DURATIONS;
  const duration = TURN_DURATIONS[mode];

  let deadline: string | null = null;
  if (duration > 0) {
    await scheduleTurnDeadline(gameId, turnNumber, duration);
    deadline = new Date(Date.now() + duration).toISOString();
  }

  await db.update(schema.games).set({
    currentTurn: turnNumber,
    turnDeadline: deadline ? new Date(deadline) : null,
  }).where(eq(schema.games.id, gameId));

  // Broadcast new turn to all players
  io?.to(`game:${gameId}`).emit('turn_started', { turnNumber, deadline });
}

/**
 * Called when a player submits their turn.
 * Checks if all players have submitted; if so, resolves immediately.
 */
export async function onPlayerSubmit(gameId: string, playerId: string) {
  await db.update(schema.players)
    .set({ hasSubmitted: true })
    .where(eq(schema.players.id, playerId));

  io?.to(`game:${gameId}`).emit('player_submitted', { playerId });

  // Check if all active players have submitted
  const players = await db.select().from(schema.players)
    .where(eq(schema.players.gameId, gameId));

  const activePlayers = players.filter(p => !p.isEliminated && !p.isSpectator);
  const allSubmitted = activePlayers.every(p =>
    p.id === playerId ? true : p.hasSubmitted
  );

  if (allSubmitted) {
    const [game] = await db.select().from(schema.games).where(eq(schema.games.id, gameId));
    if (!game) return;

    // Calculate remaining time for early submit time inheritance
    let remainingMs = 0;
    if (game.mode !== 'anytime') {
      remainingMs = await getRemainingTime(gameId, game.currentTurn);
      await cancelTurnDeadline(gameId, game.currentTurn);
    }

    await triggerTurnResolution(gameId, game.currentTurn, remainingMs);
  }
}

/**
 * Handle turn deadline expiry (timer ran out).
 */
export async function onTurnDeadline(gameId: string, turnNumber: number) {
  const [game] = await db.select().from(schema.games).where(eq(schema.games.id, gameId));
  if (!game || game.currentTurn !== turnNumber) return; // stale job
  if (game.status !== 'active') return;

  await triggerTurnResolution(gameId, turnNumber, 0);
}

/**
 * Core resolution trigger. Resolves the current turn and starts the next one.
 */
async function triggerTurnResolution(gameId: string, turnNumber: number, remainingMs: number) {
  console.log(`Resolving turn ${turnNumber} for game ${gameId}`);

  // Run the resolution engine
  let result;
  try {
    result = await resolveTurn(gameId, turnNumber);
  } catch (err) {
    console.error(`Turn resolution FAILED for game ${gameId} turn ${turnNumber}:`, err);
    // Don't re-throw — this is called from socket handlers.
    // Re-throwing would leave the game permanently stuck.
    // The game stays on the current turn so players can retry.
    return;
  }

  // Broadcast results to all players with events for notifications
  io?.to(`game:${gameId}`).emit('turn_resolved', {
    turnNumber,
    events: result.events,
    gameOver: result.gameOver,
    winnerId: result.winnerId,
  });

  // Check for game over
  if (result.gameOver) {
    await db.update(schema.games)
      .set({ status: 'finished' })
      .where(eq(schema.games.id, gameId));

    io?.to(`game:${gameId}`).emit('game_over', { winnerId: result.winnerId });
    return;
  }

  // Start next turn (with inherited remaining time for early submit)
  try {
    const nextTurn = turnNumber + 1;

    // For early submit: next turn inherits remaining time from previous
    const [game] = await db.select().from(schema.games).where(eq(schema.games.id, gameId));
    if (!game) return;

    const mode = game.mode as keyof typeof TURN_DURATIONS;
    const baseDuration = TURN_DURATIONS[mode];

    if (baseDuration > 0 && remainingMs > 0 && game.earlySubmit) {
      // Next turn gets base + remaining
      const nextDuration = baseDuration + remainingMs;
      await scheduleTurnDeadline(gameId, nextTurn, nextDuration);
      const deadline = new Date(Date.now() + nextDuration).toISOString();
      await db.update(schema.games).set({
        currentTurn: nextTurn,
        turnDeadline: new Date(deadline),
      }).where(eq(schema.games.id, gameId));
    } else {
      await startTurn(gameId, nextTurn);
      return; // startTurn handles the rest
    }

    // Reset submit flags for next turn
    const players = await db.select().from(schema.players).where(eq(schema.players.gameId, gameId));
    for (const p of players) {
      if (p.isEliminated) continue;
      await db.update(schema.players)
        .set({ hasSubmitted: false })
        .where(eq(schema.players.id, p.id));
    }

    io?.to(`game:${gameId}`).emit('turn_started', {
      turnNumber: nextTurn,
      deadline: game.turnDeadline,
    });
  } catch (err) {
    console.error(`Failed to start next turn after resolving turn ${turnNumber} for game ${gameId}:`, err);
  }
}
