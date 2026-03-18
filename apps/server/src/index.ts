import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { config } from './config.js';
import { lobbyRouter } from './api/lobby.js';
import { gameRouter } from './api/game.js';
import { ordersRouter } from './api/orders.js';
import { setupSocket } from './socket/handlers.js';
import { setSocketServer, onTurnDeadline } from './game/turn-manager.js';
import { startTurnWorker } from './game/timer.js';

const app = express();
const server = http.createServer(app);

const io = new SocketServer(server, {
  cors: { origin: config.clientUrl, methods: ['GET', 'POST'] },
});

app.use(cors({ origin: config.clientUrl }));
app.use(express.json());

// API routes
app.use('/api/lobbies', lobbyRouter);
app.use('/api/games', gameRouter);
app.use('/api/games', ordersRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Socket.IO
setupSocket(io);
setSocketServer(io);

// Turn timer worker
startTurnWorker(async (gameId, turnNumber) => {
  await onTurnDeadline(gameId, turnNumber);
});

server.listen(config.port, () => {
  console.log(`Kingdoms server running on http://localhost:${config.port}`);
});
