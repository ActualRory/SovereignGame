import { useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../../store/index.js';
import { connectToGame } from '../../api/socket.js';
import { BottomBar } from './BottomBar.js';
import { TabOverlay } from './TabOverlay.js';
import { TurnBar } from './TurnBar.js';
import { MapCanvas } from '../map/MapCanvas.js';
import { HexDetailPanel } from '../panels/HexDetailPanel.js';
import { CombatLogPanel } from '../panels/CombatLogPanel.js';

export function GamePage() {
  const { slug } = useParams<{ slug: string }>();
  const setGameState = useStore(s => s.setGameState);
  const gameId = useStore(s => (s.game as Record<string, unknown> | null)?.id as string | undefined);

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

  // Socket.IO for real-time updates — depends on gameId so it re-runs after initial fetch
  useEffect(() => {
    if (!slug || !gameId) return;
    const sessionToken = localStorage.getItem(`session:${slug}`);
    if (!sessionToken) return;

    const socket = connectToGame(gameId, sessionToken);

    socket.on('turn_resolved', () => {
      fetchState();
      // Reset pending orders for the new turn
      const state = useStore.getState();
      const taxRate = (state.player as any)?.taxRate ?? 'low';
      state.resetOrders(taxRate);
    });

    socket.on('turn_started', () => {
      fetchState();
    });

    socket.on('player_submitted', ({ playerId }: { playerId: string }) => {
      const state = useStore.getState();
      const updatedPlayers = state.players.map((p: any) =>
        p.id === playerId ? { ...p, hasSubmitted: true } : p
      );
      // Also update own player if it's us
      const currentPlayer = state.player as Record<string, unknown> | null;
      const updatedPlayer = currentPlayer?.id === playerId
        ? { ...currentPlayer, hasSubmitted: true }
        : currentPlayer;
      state.setGameState({ players: updatedPlayers, player: updatedPlayer });
    });

    return () => {
      socket.off('turn_resolved');
      socket.off('turn_started');
      socket.off('player_submitted');
    };
  }, [slug, gameId, fetchState]);

  const activeTab = useStore(s => s.activeTab);

  return (
    <div className="game-layout">
      <div className="game-map-area">
        <MapCanvas />
        <TurnBar />
        <TabOverlay />
        {!activeTab && <HexDetailPanel />}
        <CombatLogPanel />
      </div>
      <BottomBar />
    </div>
  );
}
