import { useStore } from '../../store/index.js';

export function TradeTab() {
  const player = useStore(s => s.player) as Record<string, unknown> | null;
  const players = useStore(s => s.players);
  const settlements = useStore(s => s.settlements);
  const tradeAgreements = useStore(s => s.tradeAgreements);
  const pendingOrders = useStore(s => s.pendingOrders);
  const setPendingOrders = useStore(s => s.setPendingOrders);

  if (!player) return <div><h2>Trade</h2><p>Loading...</p></div>;

  const mySettlements = settlements.filter((s: any) => s.ownerId === player.id);

  // Aggregate storage across all settlements
  const totalStorage: Record<string, number> = {};
  for (const s of mySettlements) {
    const storage = (s as any).storage as Record<string, number> | undefined;
    if (!storage) continue;
    for (const [resource, amount] of Object.entries(storage)) {
      if (amount > 0) totalStorage[resource] = (totalStorage[resource] ?? 0) + amount;
    }
  }

  const tradeableResources = Object.entries(totalStorage).filter(([, amt]) => amt > 0);

  return (
    <div className="trade-tab">
      <h2>Trade</h2>

      {/* Stockpile overview */}
      <h3 style={{ marginTop: 12 }}>Stockpile</h3>
      {tradeableResources.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No resources available</p>
      ) : (
        <div className="resource-grid" style={{ marginTop: 8 }}>
          {tradeableResources.map(([resource, amount]) => (
            <div key={resource} className="resource-item">
              <span className="resource-name">{formatName(resource)}</span>
              <span className="resource-amount">{amount}</span>
            </div>
          ))}
        </div>
      )}

      {/* Active Trade Agreements */}
      <h3 style={{ marginTop: 20 }}>Active Agreements</h3>
      {tradeAgreements.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No trade agreements. Propose trades by attaching them to letters in the Diplomacy tab.</p>
      ) : (
        tradeAgreements.map((t: any) => {
          const otherId = t.playerAId === player.id ? t.playerBId : t.playerAId;
          const otherPlayer = players.find((p: any) => p.id === otherId) as any;
          const terms = t.terms as any;
          const isCancelled = (pendingOrders.tradeCancellations ?? []).includes(t.id);

          return (
            <div key={t.id} className="settlement-card" style={{ marginTop: 8, opacity: isCancelled ? 0.5 : 1 }}>
              <div className="settlement-header">
                <strong>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: otherPlayer?.color ?? '#888', marginRight: 6, verticalAlign: 'middle' }} />
                  {otherPlayer?.countryName ?? '?'}
                </strong>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {t.isStanding ? 'Standing' : 'One-time'} · {t.tier?.replace(/_/g, ' ')}
                </span>
              </div>
              {terms?.offeredResources?.length > 0 && (
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  Offering: {terms.offeredResources.map((r: any) => `${r.amount} ${formatName(r.resource)}`).join(', ')}
                </div>
              )}
              {terms?.requestedResources?.length > 0 && (
                <div style={{ fontSize: 12 }}>
                  Receiving: {terms.requestedResources.map((r: any) => `${r.amount} ${formatName(r.resource)}`).join(', ')}
                </div>
              )}
              {!isCancelled ? (
                <button className="btn btn-secondary" style={{ marginTop: 4, fontSize: 11, padding: '2px 8px' }}
                  onClick={() => {
                    const current = pendingOrders.tradeCancellations ?? [];
                    setPendingOrders({ tradeCancellations: [...current, t.id] } as any);
                  }}>
                  Cancel Agreement
                </button>
              ) : (
                <span style={{ fontSize: 11, color: 'var(--accent-red)', marginTop: 4, display: 'block' }}>
                  Cancellation queued for next turn
                </span>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function formatName(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
