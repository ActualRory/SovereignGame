import express from 'express';
import cors from 'cors';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { Server as SocketServer } from 'socket.io';
import { config } from './config.js';
import { lobbyRouter } from './api/lobby.js';
import { gameRouter } from './api/game.js';
import { ordersRouter } from './api/orders.js';
import { diplomacyRouter } from './api/diplomacy.js';
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
app.use('/api/games', diplomacyRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Serve built client if available
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Socket.IO
setupSocket(io);
setSocketServer(io);

// Turn timer worker
startTurnWorker(async (gameId, turnNumber) => {
  await onTurnDeadline(gameId, turnNumber);
});

server.listen(config.port, () => {
  console.log(`Sovereigns server running on http://localhost:${config.port}`);
});

// Graceful shutdown for hot-reload (tsx watch)
function shutdown() {
  server.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
