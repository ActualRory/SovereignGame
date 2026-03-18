import { useState } from 'react';
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
  const otherPlayers = players.filter((p: any) => p.id !== player.id && !p.isEliminated);

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
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No trade agreements</p>
      ) : (
        tradeAgreements.map((t: any) => {
          const otherId = t.playerAId === player.id ? t.playerBId : t.playerAId;
          const otherPlayer = players.find((p: any) => p.id === otherId) as any;
          const terms = t.terms as any;

          return (
            <div key={t.id} className="settlement-card" style={{ marginTop: 8 }}>
              <div className="settlement-header">
                <strong>{otherPlayer?.countryName ?? '?'}</strong>
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
              <button className="btn btn-secondary" style={{ marginTop: 4, fontSize: 11, padding: '2px 8px' }}
                onClick={() => {
                  const current = pendingOrders.tradeCancellations ?? [];
                  setPendingOrders({ tradeCancellations: [...current, t.id] } as any);
                }}>
                Cancel Agreement
              </button>
            </div>
          );
        })
      )}

      {/* Propose New Trade */}
      <h3 style={{ marginTop: 20 }}>Propose Trade</h3>
      {otherPlayers.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No other nations to trade with</p>
      ) : (
        <TradeProposer
          otherPlayers={otherPlayers}
          tradeableResources={tradeableResources}
          pendingOrders={pendingOrders}
          setPendingOrders={setPendingOrders}
        />
      )}

      {/* Pending trade proposals */}
      {(pendingOrders as any).tradeProposals?.length > 0 && (
        <>
          <h3 style={{ marginTop: 20 }}>Queued Proposals</h3>
          {(pendingOrders as any).tradeProposals.map((p: any, i: number) => {
            const target = players.find((pl: any) => pl.id === p.recipientId) as any;
            return (
              <div key={i} className="settlement-card" style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13 }}>
                  Trade with {target?.countryName ?? '?'}
                  {p.isStanding ? ' (standing)' : ' (one-time)'}
                </span>
                <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 12 }}
                  onClick={() => {
                    const proposals = [...((pendingOrders as any).tradeProposals ?? [])];
                    proposals.splice(i, 1);
                    setPendingOrders({ tradeProposals: proposals } as any);
                  }}>Cancel</button>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function TradeProposer({ otherPlayers, tradeableResources, pendingOrders, setPendingOrders }: {
  otherPlayers: Record<string, unknown>[];
  tradeableResources: [string, number][];
  pendingOrders: any;
  setPendingOrders: (orders: any) => void;
}) {
  const [recipientId, setRecipientId] = useState((otherPlayers[0] as any)?.id ?? '');
  const [offerResource, setOfferResource] = useState(tradeableResources[0]?.[0] ?? '');
  const [offerAmount, setOfferAmount] = useState(1);
  const [requestResource, setRequestResource] = useState('');
  const [requestAmount, setRequestAmount] = useState(1);
  const [isStanding, setIsStanding] = useState(false);

  function addProposal() {
    if (!recipientId || !offerResource) return;
    const proposal = {
      recipientId,
      offeredResources: [{ resource: offerResource, amount: offerAmount }],
      requestedResources: requestResource ? [{ resource: requestResource, amount: requestAmount }] : [],
      isStanding,
    };
    const current = pendingOrders.tradeProposals ?? [];
    setPendingOrders({ tradeProposals: [...current, proposal] });
  }

  return (
    <div className="settlement-card" style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12 }}>To:</span>
        <select className="input" value={recipientId} onChange={e => setRecipientId(e.target.value)}
          style={{ padding: '3px 6px', fontSize: 12 }}>
          {otherPlayers.map((p: any) => (
            <option key={p.id} value={p.id}>{p.countryName}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12 }}>Offer:</span>
        <input type="number" className="input" value={offerAmount} min={1}
          onChange={e => setOfferAmount(Number(e.target.value))}
          style={{ width: 50, padding: '3px 6px', fontSize: 12 }} />
        <select className="input" value={offerResource} onChange={e => setOfferResource(e.target.value)}
          style={{ padding: '3px 6px', fontSize: 12 }}>
          {tradeableResources.map(([res, amt]) => (
            <option key={res} value={res}>{formatName(res)} ({amt})</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12 }}>Request:</span>
        <input type="number" className="input" value={requestAmount} min={1}
          onChange={e => setRequestAmount(Number(e.target.value))}
          style={{ width: 50, padding: '3px 6px', fontSize: 12 }} />
        <input type="text" className="input" value={requestResource} placeholder="resource name"
          onChange={e => setRequestResource(e.target.value)}
          style={{ padding: '3px 6px', fontSize: 12, width: 120 }} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={isStanding} onChange={e => setIsStanding(e.target.checked)} />
          Standing (repeats each turn)
        </label>
        <button className="btn btn-primary" style={{ fontSize: 12, padding: '3px 12px' }}
          onClick={addProposal}>Add Proposal</button>
      </div>
    </div>
  );
}

function formatName(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
