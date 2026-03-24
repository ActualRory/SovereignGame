import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../../store/index.js';
import { getTurnLabel } from '@kingdoms/shared';

export function TurnBar() {
  const { slug } = useParams<{ slug: string }>();
  const game = useStore(s => s.game) as Record<string, unknown> | null;
  const player = useStore(s => s.player) as Record<string, unknown> | null;
  const players = useStore(s => s.players);
  const pendingOrders = useStore(s => s.pendingOrders);
  const resetOrders = useStore(s => s.resetOrders);
  const [submitting, setSubmitting] = useState(false);
  const [retracting, setRetracting] = useState(false);

  if (!game || !player || game.status !== 'active') return null;

  // Spectators/eliminated players can't submit
  if ((player as any).isEliminated || (player as any).isSpectator) {
    return (
      <div className="spectator-banner">
        Spectating
      </div>
    );
  }

  const currentTurn = (game.currentTurn as number) ?? 1;
  const turnLabel = getTurnLabel(currentTurn);
  const hasSubmitted = (player as any).hasSubmitted ?? false;

  const activePlayers = players.filter((p: any) => !p.isEliminated && !p.isSpectator);
  const submittedCount = activePlayers.filter((p: any) => p.hasSubmitted).length;

  async function submitTurn() {
    if (!slug || hasSubmitted) return;
    setSubmitting(true);

    const sessionToken = localStorage.getItem(`session:${slug}`);
    if (!sessionToken) return;

    try {
      const orders = {
        taxRate: pendingOrders.taxRate || (player as any).taxRate || 'low',
        constructions: pendingOrders.constructions,
        settlementUpgrades: pendingOrders.settlementUpgrades,
        techResearch: pendingOrders.techResearch,
        recruitments: pendingOrders.recruitments,
        movements: pendingOrders.movements,
        nobleOrders: pendingOrders.nobleOrders,
        createArmies: pendingOrders.createArmies,
        newSettlements: pendingOrders.newSettlements,
        siegeAssaults: pendingOrders.siegeAssaults,
        unitReassignments: [],
        lettersSent: [],
        tradeProposals: pendingOrders.tradeProposals,
        tradeCancellations: pendingOrders.tradeCancellations,
        createTemplates: pendingOrders.createTemplates,
        updateTemplates: pendingOrders.updateTemplates,
        deleteTemplates: pendingOrders.deleteTemplates,
        draftRecruits: pendingOrders.draftRecruits,
        dismissRecruits: pendingOrders.dismissRecruits,
        draftMounts: pendingOrders.draftMounts,
        dismissMounts: pendingOrders.dismissMounts,
        placeEquipmentOrders: pendingOrders.placeEquipmentOrders,
        cancelEquipmentOrders: pendingOrders.cancelEquipmentOrders,
        disbandUnits: pendingOrders.disbandUnits,
        upgradeUnits: pendingOrders.upgradeUnits,
        replenishments: pendingOrders.replenishments,
      };

      const res = await fetch(`/api/games/${slug}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': sessionToken,
        },
        body: JSON.stringify({ orders }),
      });

      if (res.ok) {
        // Optimistic update — update both player and players array
        const state = useStore.getState();
        const updatedPlayers = state.players.map((p: any) =>
          p.id === (player as any).id ? { ...p, hasSubmitted: true } : p
        );
        state.setGameState({
          player: { ...player, hasSubmitted: true } as any,
          players: updatedPlayers,
        });
      }
    } catch (err) {
      console.error('Failed to submit turn:', err);
    } finally {
      setSubmitting(false);
    }
  }

  const allSubmitted = submittedCount === activePlayers.length;

  async function retractTurn() {
    if (!slug || !hasSubmitted || allSubmitted) return;
    setRetracting(true);

    const sessionToken = localStorage.getItem(`session:${slug}`);
    if (!sessionToken) return;

    try {
      const res = await fetch(`/api/games/${slug}/orders`, {
        method: 'DELETE',
        headers: { 'x-session-token': sessionToken },
      });

      if (res.ok) {
        const state = useStore.getState();
        const updatedPlayers = state.players.map((p: any) =>
          p.id === (player as any).id ? { ...p, hasSubmitted: false } : p
        );
        state.setGameState({
          player: { ...player, hasSubmitted: false } as any,
          players: updatedPlayers,
        });
      }
    } catch (err) {
      console.error('Failed to retract turn:', err);
    } finally {
      setRetracting(false);
    }
  }

  return (
    <div className="turn-bar">
      <div className="turn-info">
        <strong>{turnLabel}</strong>
        <br />
        <span>{submittedCount}/{activePlayers.length} submitted</span>
      </div>
      {hasSubmitted && !allSubmitted ? (
        <button
          className="btn btn-secondary"
          onClick={retractTurn}
          disabled={retracting}
        >
          {retracting ? 'Retracting...' : 'Un-end Turn'}
        </button>
      ) : (
        <button
          className="btn btn-submit"
          onClick={submitTurn}
          disabled={hasSubmitted || submitting}
        >
          {hasSubmitted ? 'Submitted' : submitting ? 'Submitting...' : 'End Turn'}
        </button>
      )}
    </div>
  );
}
