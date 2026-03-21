import { useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../../store/index.js';
import { connectToGame } from '../../api/socket.js';
import { BottomBar } from './BottomBar.js';
import { TabOverlay } from './TabOverlay.js';
import { TopBar } from './TopBar.js';
import { MapCanvas } from '../map/MapCanvas.js';
import { MapContextMenu } from '../map/MapContextMenu.js';
import { MoveTargetBanner } from '../map/MoveTargetBanner.js';
import { HexDetailPanel } from '../panels/HexDetailPanel.js';
import { CombatLogPanel } from '../panels/CombatLogPanel.js';
import { EventLogPanel } from '../panels/EventLogPanel.js';
import { GameOverOverlay } from '../panels/GameOverOverlay.js';
import { BattleOverlay } from '../panels/BattleOverlay.js';
import { SiegePanel } from '../panels/SiegePanel.js';

let notifCounter = 0;

export function GamePage() {
  const { slug } = useParams<{ slug: string }>();
  const setGameState = useStore(s => s.setGameState);
  const addNotification = useStore(s => s.addNotification);
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

    socket.on('turn_resolved', (data: { turnNumber: number; events: any[]; gameOver?: boolean; winnerId?: string }) => {
      // Signal that a turn just resolved so MapCanvas can play movement animation
      useStore.getState().setTurnJustResolved(true);
      fetchState();
      // Reset pending orders for the new turn
      const state = useStore.getState();
      const taxRate = (state.player as any)?.taxRate ?? 'low';
      state.resetOrders(taxRate);

      // Generate notifications from turn events
      const myId = (state.player as any)?.id;
      if (data.events) {
        for (const evt of data.events) {
          if (!evt.playerIds || evt.playerIds.length === 0 || evt.playerIds.includes(myId)) {
            addNotification({
              id: `notif-${++notifCounter}`,
              type: evt.type,
              turn: data.turnNumber,
              message: evt.description,
              data: evt,
              isRead: false,
            });
          }
        }
      }

      // Add turn resolved notification
      addNotification({
        id: `notif-${++notifCounter}`,
        type: 'turn_resolved',
        turn: data.turnNumber,
        message: `Turn ${data.turnNumber} has been resolved.`,
        isRead: false,
      });
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

    socket.on('game_over', ({ winnerId }: { winnerId: string }) => {
      fetchState();
      addNotification({
        id: `notif-${++notifCounter}`,
        type: 'game_over',
        turn: 0,
        message: 'The game is over!',
        data: { winnerId },
        isRead: false,
      });
    });

    return () => {
      socket.off('turn_resolved');
      socket.off('turn_started');
      socket.off('player_submitted');
      socket.off('game_over');
    };
  }, [slug, gameId, fetchState, addNotification]);

  const activeTab = useStore(s => s.activeTab);
  const game = useStore(s => s.game) as Record<string, unknown> | null;

  return (
    <div className="game-layout">
      <TopBar />
      <div className="game-map-area">
        <MapCanvas />
        <MoveTargetBanner />
        <MapContextMenu />
        <TabOverlay />
        {!activeTab && <HexDetailPanel />}
        <CombatLogPanel />
        <EventLogPanel />
        <SiegePanel />
        <BattleOverlay />
        {game?.status === 'finished' && <GameOverOverlay />}
      </div>
      <BottomBar />
    </div>
  );
}
