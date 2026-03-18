import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../../store/index.js';
import { getTurnLabel } from '@kingdoms/shared';

export function TurnBar() {
  const { slug } = useParams<{ slug: string }>();
  const game = useStore(s => s.game) as Record<string, unknown> | null;
  const player = useStore(s => s.player) as Record<string, unknown> | null;
  const players = useStore(s => s.players);
  const [submitting, setSubmitting] = useState(false);

  if (!game || !player || game.status !== 'active') return null;

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
      // Submit current orders (empty for now — will be populated as we build order UIs)
      const orders = {
        taxRate: (player as any).taxRate ?? 'low',
        constructions: [],
        settlementUpgrades: [],
        techResearch: null,
        recruitments: [],
        movements: [],
        siegeAssaults: [],
        unitReassignments: [],
        lettersSent: [],
        tradeProposals: [],
        tradeCancellations: [],
        newSettlements: [],
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
        // Optimistic update
        useStore.getState().setGameState({
          player: { ...player, hasSubmitted: true } as any,
        });
      }
    } catch (err) {
      console.error('Failed to submit turn:', err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="turn-bar">
      <div className="turn-info">
        <strong>{turnLabel}</strong>
        <br />
        <span>{submittedCount}/{activePlayers.length} submitted</span>
      </div>
      <button
        className="btn btn-submit"
        onClick={submitTurn}
        disabled={hasSubmitted || submitting}
      >
        {hasSubmitted ? 'Submitted' : submitting ? 'Submitting...' : 'End Turn'}
      </button>
    </div>
  );
}
