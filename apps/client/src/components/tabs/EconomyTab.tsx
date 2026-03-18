import { useStore } from '../../store/index.js';
import { BUILDINGS, COST_TIERS, type BuildingType, type CostTier } from '@kingdoms/shared';

export function EconomyTab() {
  const player = useStore(s => s.player) as Record<string, unknown> | null;
  const settlements = useStore(s => s.settlements);

  if (!player) {
    return <div><h2>Economy</h2><p>Loading...</p></div>;
  }

  const mySettlements = settlements.filter((s: any) => s.ownerId === player.id);
  const totalPop = mySettlements.reduce((sum: number, s: any) => sum + (s.population ?? 0), 0);

  // Aggregate resources across all settlements
  const aggregateStorage: Record<string, number> = {};
  for (const s of mySettlements) {
    const storage = (s as any).storage as Record<string, number> | undefined;
    if (!storage) continue;
    for (const [resource, amount] of Object.entries(storage)) {
      aggregateStorage[resource] = (aggregateStorage[resource] ?? 0) + amount;
    }
  }

  const resourceEntries = Object.entries(aggregateStorage).filter(([, v]) => v > 0);

  return (
    <div className="economy-tab">
      <h2>Economy</h2>

      {/* National Overview */}
      <div className="econ-overview">
        <div className="stat-grid">
          <div className="stat-box">
            <span className="stat-label">Gold</span>
            <span className="stat-detail">
              {((player as any).gold ?? 0).toLocaleString()} gp
            </span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Tax Rate</span>
            <span className="stat-detail" style={{ textTransform: 'capitalize' }}>
              {(player as any).taxRate ?? 'low'}
            </span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Population</span>
            <span className="stat-detail">{totalPop.toLocaleString()}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Settlements</span>
            <span className="stat-detail">{mySettlements.length}</span>
          </div>
        </div>
      </div>

      {/* National Resources */}
      <h3 style={{ marginTop: 20 }}>National Stockpile</h3>
      {resourceEntries.length > 0 ? (
        <div className="resource-grid">
          {resourceEntries.map(([resource, amount]) => (
            <div key={resource} className="resource-item">
              <span className="resource-name">{formatResourceName(resource)}</span>
              <span className="resource-amount">{amount}</span>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>No resources stockpiled</p>
      )}

      {/* Per-Settlement Breakdown */}
      <h3 style={{ marginTop: 24 }}>Settlements</h3>
      {mySettlements.map((s: any) => (
        <SettlementCard key={s.id} settlement={s} />
      ))}
    </div>
  );
}

function SettlementCard({ settlement }: { settlement: any }) {
  const storage = (settlement.storage ?? {}) as Record<string, number>;
  const resources = Object.entries(storage).filter(([, v]) => v > 0);

  return (
    <div className="settlement-card">
      <div className="settlement-header">
        <strong>{settlement.name}</strong>
        <span className="settlement-tier" style={{ textTransform: 'capitalize' }}>
          {settlement.tier}
        </span>
      </div>
      <div className="settlement-stats">
        <span>Pop: {settlement.population}/{settlement.popCap}</span>
        {settlement.isCapital && <span className="capital-badge">Capital</span>}
      </div>
      {resources.length > 0 && (
        <div className="settlement-resources">
          {resources.map(([resource, amount]) => (
            <span key={resource} className="resource-tag">
              {formatResourceName(resource)}: {amount}
            </span>
          ))}
        </div>
      )}
      {settlement.constructionQueue?.length > 0 && (
        <div className="construction-queue">
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Building: </span>
          {settlement.constructionQueue.map((job: any, i: number) => (
            <span key={i} className="resource-tag">
              {formatResourceName(job.buildingType)} ({job.turnsRemaining}t)
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function formatResourceName(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
