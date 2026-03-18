import { useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../../store/index.js';
import { connectToGame } from '../../api/socket.js';
import { BottomBar } from './BottomBar.js';
import { TabOverlay } from './TabOverlay.js';
import { TurnBar } from './TurnBar.js';
import { MapCanvas } from '../map/MapCanvas.js';

export function GamePage() {
  const { slug } = useParams<{ slug: string }>();
  const setGameState = useStore(s => s.setGameState);

  const fetchState = useCallback(async () => {
    if (!slug) return;
    const sessionToken = localStorage.getItem(`session:${slug}`);
    if (!sessionToken) return;

    try {
      const res = await fetch(`/api/games/${slug}/state`, {
        headers: { 'x-session-token': sessionToken },
      });
      const data = await res.json();
      setGameState(data);
    } catch (err) {
      console.error('Failed to fetch game state:', err);
    }
  }, [slug, setGameState]);

  // Initial load
  useEffect(() => { fetchState(); }, [fetchState]);

  // Socket.IO for real-time updates
  useEffect(() => {
    if (!slug) return;
    const sessionToken = localStorage.getItem(`session:${slug}`);
    const game = useStore.getState().game as Record<string, unknown> | null;
    if (!sessionToken || !game?.id) return;

    const socket = connectToGame(game.id as string, sessionToken);

    socket.on('turn_resolved', () => {
      // Refetch full state after turn resolves
      fetchState();
    });

    socket.on('turn_started', () => {
      fetchState();
    });

    socket.on('player_submitted', ({ playerId }: { playerId: string }) => {
      // Update submitted status in local state
      const state = useStore.getState();
      const updatedPlayers = state.players.map((p: any) =>
        p.id === playerId ? { ...p, hasSubmitted: true } : p
      );
      state.setGameState({ players: updatedPlayers });
    });

    return () => {
      socket.off('turn_resolved');
      socket.off('turn_started');
      socket.off('player_submitted');
    };
  }, [slug, fetchState]);

  return (
    <div className="game-layout">
      <div className="game-map-area">
        <MapCanvas />
        <TurnBar />
        <TabOverlay />
      </div>
      <BottomBar />
    </div>
  );
}
