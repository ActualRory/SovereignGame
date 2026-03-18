import type { Server, Socket } from 'socket.io';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

export function setupSocket(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Join a game room
    socket.on('join_game', async (data: { gameId: string; sessionToken: string }) => {
      const [player] = await db.select()
        .from(schema.players)
        .where(eq(schema.players.sessionToken, data.sessionToken));

      if (!player || player.gameId !== data.gameId) {
        socket.emit('error', { message: 'Invalid session' });
        return;
      }

      socket.join(`game:${data.gameId}`);
      socket.data.playerId = player.id;
      socket.data.gameId = data.gameId;

      // Notify others
      socket.to(`game:${data.gameId}`).emit('player_joined', {
        playerId: player.id,
        displayName: player.displayName,
      });
    });

    // Player submits turn
    socket.on('submit_turn', async () => {
      const { gameId, playerId } = socket.data;
      if (!gameId || !playerId) return;

      // Notify all players in the game
      io.to(`game:${gameId}`).emit('player_submitted', { playerId });
    });

    // Chat message
    socket.on('chat_message', (data: { message: string }) => {
      const { gameId, playerId } = socket.data;
      if (!gameId || !playerId) return;

      io.to(`game:${gameId}`).emit('chat_message', {
        playerId,
        message: data.message,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
}
