import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ autoConnect: false });
  }
  return socket;
}

export function connectToGame(gameId: string, sessionToken: string): Socket {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
  s.emit('join_game', { gameId, sessionToken });
  return s;
}
