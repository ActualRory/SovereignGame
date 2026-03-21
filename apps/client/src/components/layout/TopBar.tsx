import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../../store/index.js';
import { getTurnLabel } from '@kingdoms/shared';

const TYPE_ICONS: Record<string, string> = {
  war_declared: 'WAR',
  peace_declared: 'PEACE',
  battle_occurred: 'BATTLE',
  settlement_captured: 'SIEGE',
  player_eliminated: 'DEATH',
  game_over: 'VICTORY',
  winter_roll: 'WINTER',
  rebellion: 'REBEL',
  noble_defection: 'DEFECT',
  stability_change: 'STAB',
  army_attrition: 'ATTRN',
  tech_researched: 'TECH',
  turn_resolved: 'TURN',
  letter_received: 'MAIL',
};

export function TopBar() {
  const { slug } = useParams<{ slug: string }>();
  const game = useStore(s => s.game) as Record<string, unknown> | null;
  const player = useStore(s => s.player) as Record<string, unknown> | null;
  const players = useStore(s => s.players);
  const letters = useStore(s => s.letters);
  const notifications = useStore(s => s.notifications);
  const markAllNotificationsRead = useStore(s => s.markAllNotificationsRead);
  const markNotificationRead = useStore(s => s.markNotificationRead);
  const pendingOrders = useStore(s => s.pendingOrders);
  const resetOrders = useStore(s => s.resetOrders);

  const [submitting, setSubmitting] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [showSubmitTooltip, setShowSubmitTooltip] = useState(false);

  if (!game) return null;

  const currentTurn = (game.currentTurn as number) ?? 1;
  const turnLabel = getTurnLabel(currentTurn);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const myId = (player as any)?.id;
  const inboundUnread = letters.filter(
    (l: any) => l.recipientId === myId && l.isDelivered && !l.isRead
  ).length;
  const outboundTransit = letters.filter(
    (l: any) => l.senderId === myId && !l.isDelivered
  ).length;

  const isSpectator = (player as any)?.isEliminated || (player as any)?.isSpectator;
  const hasSubmitted = (player as any)?.hasSubmitted ?? false;
  const activePlayers = players.filter((p: any) => !p.isEliminated && !p.isSpectator);
  const submittedPlayers = activePlayers.filter((p: any) => p.hasSubmitted);
  const pendingPlayers = activePlayers.filter((p: any) => !p.hasSubmitted);

  async function submitTurn() {
    if (!slug || hasSubmitted) return;
    setSubmitting(true);
    const sessionToken = localStorage.getItem(`session:${slug}`);
    if (!sessionToken) return;
    try {
      const orders = {
        taxRate: pendingOrders.taxRate || (player as any)?.taxRate || 'low',
        constructions: pendingOrders.constructions,
        settlementUpgrades: pendingOrders.settlementUpgrades,
        techResearch: pendingOrders.techResearch,
        recruitments: pendingOrders.recruitments,
        movements: pendingOrders.movements,
        hireGenerals: pendingOrders.hireGenerals,
        createArmies: pendingOrders.createArmies,
        newSettlements: pendingOrders.newSettlements,
        siegeAssaults: pendingOrders.siegeAssaults,
        unitReassignments: [],
        lettersSent: [],
        tradeProposals: pendingOrders.tradeProposals,
        tradeCancellations: pendingOrders.tradeCancellations,
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
        const state = useStore.getState();
        const updatedPlayers = state.players.map((p: any) =>
          p.id === myId ? { ...p, hasSubmitted: true } : p
        );
        state.setGameState({
          player: { ...player, hasSubmitted: true } as any,
          players: updatedPlayers,
        });
        resetOrders((player as any)?.taxRate ?? 'low');
      }
    } catch (err) {
      console.error('Failed to submit turn:', err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`top-bar${!hasSubmitted && game.status === 'active' && !isSpectator ? ' top-bar-pending' : ''}`}>
      {/* Left: Notification bell + letter counts */}
      <div className="top-bar-left">
        <div className="top-bar-bell-wrap">
          <button
            className="top-bar-icon-btn"
            onClick={() => {
              setNotifOpen(!notifOpen);
              if (!notifOpen && unreadCount > 0) markAllNotificationsRead();
            }}
            title="Notifications"
          >
            <span className="top-bar-bell-icon">&#x1F514;</span>
            {unreadCount > 0 && (
              <span className="top-bar-badge top-bar-badge-red">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="top-bar-notif-dropdown">
              <div className="notification-header">
                <strong>Notifications</strong>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 11, padding: '2px 8px' }}
                  onClick={() => setNotifOpen(false)}
                >
                  Close
                </button>
              </div>
              {notifications.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: 12 }}>
                  No notifications yet
                </p>
              ) : (
                <div className="notification-list">
                  {notifications.slice(0, 50).map(n => (
                    <div
                      key={n.id}
                      className={`notification-item ${n.isRead ? 'read' : 'unread'}`}
                      onClick={() => !n.isRead && markNotificationRead(n.id)}
                    >
                      <span className="notification-type-badge">
                        {TYPE_ICONS[n.type] ?? n.type.slice(0, 4).toUpperCase()}
                      </span>
                      <div className="notification-content">
                        <span className="notification-message">{n.message}</span>
                        {n.turn > 0 && (
                          <span className="notification-turn">Turn {n.turn}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="top-bar-separator" />

        <span className="top-bar-letter-count" title="Unread letters received">
          <span className="top-bar-letter-icon">&#x2709;</span>
          <span className={inboundUnread > 0 ? 'top-bar-count-active' : 'top-bar-count-dim'}>
            {inboundUnread}
          </span>
        </span>

        <span className="top-bar-letter-count" title="Letters in transit">
          <span className="top-bar-letter-icon">&#x2192;</span>
          <span className={outboundTransit > 0 ? 'top-bar-count-active' : 'top-bar-count-dim'}>
            {outboundTransit}
          </span>
        </span>
      </div>

      {/* Center: Turn label */}
      <div className="top-bar-center">
        <span className="top-bar-turn-label">{turnLabel}</span>
      </div>

      {/* Right: Submission status + End Turn */}
      <div className="top-bar-right">
        {game.status === 'active' && (
          isSpectator ? (
            <span className="top-bar-spectating">Spectating</span>
          ) : (
            <>
              <div
                className="top-bar-submit-status"
                onMouseEnter={() => setShowSubmitTooltip(true)}
                onMouseLeave={() => setShowSubmitTooltip(false)}
              >
                <span className="top-bar-submitted-count">
                  {submittedPlayers.length}/{activePlayers.length} ready
                </span>
                {showSubmitTooltip && activePlayers.length > 0 && (
                  <div className="top-bar-submit-tooltip">
                    {submittedPlayers.map((p: any) => (
                      <div key={p.id} className="top-bar-tooltip-player top-bar-tooltip-done">
                        ✓ {p.displayName}
                      </div>
                    ))}
                    {pendingPlayers.map((p: any) => (
                      <div key={p.id} className="top-bar-tooltip-player top-bar-tooltip-waiting">
                        ⧖ {p.displayName}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                className={`btn ${hasSubmitted ? 'btn-submitted' : 'btn-submit'}`}
                onClick={submitTurn}
                disabled={hasSubmitted || submitting}
              >
                {hasSubmitted ? 'Turn Ended' : submitting ? 'Submitting...' : 'End Turn'}
              </button>
            </>
          )
        )}
      </div>
    </div>
  );
}
