import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { config } from './config.js';
import { lobbyRouter } from './api/lobby.js';
import { gameRouter } from './api/game.js';
import { setupSocket } from './socket/handlers.js';

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

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Socket.IO
setupSocket(io);

server.listen(config.port, () => {
  console.log(`Kingdoms server running on http://localhost:${config.port}`);
});
