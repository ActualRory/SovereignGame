import { useState } from 'react';
import { useStore } from '../../store/index.js';
import {
  BUILDINGS, COST_TIERS, SETTLEMENT_TIERS, RESEARCH_POINTS, getNextTier,
  type BuildingType, type CostTier, type SettlementTier,
} from '@kingdoms/shared';
import { Tooltip } from '../shared/Tooltip.js';

export function EconomyTab() {
  const player = useStore(s => s.player) as Record<string, unknown> | null;
  const settlements = useStore(s => s.settlements);
  const armies = useStore(s => s.armies);

  if (!player) {
    return <div><h2>Economy</h2><p>Loading...</p></div>;
  }

  const mySettlements = settlements.filter((s: any) => s.ownerId === player.id);
  const myArmies = armies.filter((a: any) => a.ownerId === player.id);
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

  // Calculate upkeep estimates
  let buildingUpkeep = 0;
  for (const s of mySettlements) {
    const buildings = ((s as any).buildings ?? []) as any[];
    for (const b of buildings) {
      if (!b.isConstructing) {
        const def = BUILDINGS[b.type as BuildingType];
        if (def) {
          buildingUpkeep += COST_TIERS[def.costTier].maintenance;
        }
      }
    }
  }

  const totalUnits = myArmies.reduce((sum: number, a: any) =>
    sum + (a.units?.filter((u: any) => u.state !== 'destroyed').length ?? 0), 0
  );

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
          <div className="stat-box">
            <span className="stat-label">Bldg Upkeep</span>
            <span className="stat-detail">{buildingUpkeep.toLocaleString()} gp</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Army Size</span>
            <span className="stat-detail">{totalUnits} units</span>
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
        <SettlementCard key={s.id} settlement={s} onSelect={() => {
          useStore.getState().setSelectedSettlementId(s.id);
        }} />
      ))}

      {/* Building Codex */}
      <BuildingCodex />
    </div>
  );
}

function SettlementCard({ settlement, onSelect }: { settlement: any; onSelect: () => void }) {
  const storage = (settlement.storage ?? {}) as Record<string, number>;
  const resources = Object.entries(storage).filter(([, v]) => v > 0);
  const tierDef = SETTLEMENT_TIERS[settlement.tier as SettlementTier];
  const nextTier = getNextTier(settlement.tier as SettlementTier);
  const nextTierDef = nextTier ? SETTLEMENT_TIERS[nextTier] : null;
  const buildingCount = ((settlement.buildings ?? []) as any[]).filter((b: any) => !b.isConstructing).length;

  return (
    <div className="settlement-card" style={{ cursor: 'pointer' }} onClick={onSelect} title="Click for details">
      <div className="settlement-header">
        <strong>{settlement.name}</strong>
        <Tooltip content={
          <div>
            <div className="tooltip-label">Settlement Tier</div>
            <div style={{ textTransform: 'capitalize', fontWeight: 600, color: 'var(--accent-gold)' }}>{settlement.tier}</div>
            <div className="tooltip-divider" />
            <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '2px 12px', fontSize: 12 }}>
              <span className="tooltip-label">Slots</span><span>{buildingCount}/{tierDef?.buildingSlots ?? '?'}</span>
              <span className="tooltip-label">Pop Cap</span><span>{tierDef?.popCap?.toLocaleString() ?? '?'}</span>
              <span className="tooltip-label">Storage</span><span>{tierDef?.storageCap?.toLocaleString() ?? '?'}</span>
            </div>
            {nextTier && nextTierDef && (
              <>
                <div className="tooltip-divider" />
                <div className="tooltip-label">Upgrade to {nextTier}</div>
                <div style={{ fontSize: 12 }}>
                  <span className="tooltip-value">{tierDef?.upgradeCost?.gold?.toLocaleString() ?? 0} gp</span>
                  {tierDef?.upgradeCost?.resources && Object.entries(tierDef.upgradeCost.resources).map(([r, amt]) => (
                    <span key={r} style={{ marginLeft: 8 }}>{formatResourceName(r)}: {amt as number}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        }>
          <span className="settlement-tier" style={{ textTransform: 'capitalize', cursor: 'help', borderBottom: '1px dotted var(--text-muted)' }}>
            {settlement.tier}
          </span>
        </Tooltip>
      </div>
      <div className="settlement-stats">
        <span>Pop: {settlement.population}/{settlement.popCap}</span>
        <span>Slots: {buildingCount}/{tierDef?.buildingSlots ?? '?'}</span>
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
          {settlement.constructionQueue.map((job: any, i: number) => {
            const bDef = BUILDINGS[job.buildingType as BuildingType];
            const costInfo = bDef ? COST_TIERS[bDef.costTier] : null;
            return (
              <Tooltip key={i} content={
                costInfo ? (
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>{formatResourceName(job.buildingType)}</div>
                    <div style={{ fontSize: 12 }}>
                      <span className="tooltip-label">Cost</span> <span className="tooltip-value">{costInfo.goldCost} gp</span>
                      <span style={{ marginLeft: 8 }} className="tooltip-label">Maint</span> <span className="tooltip-value">{costInfo.maintenance} gp/turn</span>
                    </div>
                    {bDef?.effect && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{bDef.effect}</div>}
                  </div>
                ) : <span>{formatResourceName(job.buildingType)}</span>
              }>
                <span className="resource-tag">
                  {formatResourceName(job.buildingType)} ({job.turnsRemaining}t)
                </span>
              </Tooltip>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Building Codex ─── */

function BuildingCodex() {
  const [open, setOpen] = useState(false);
  const categories = ['extraction', 'processing', 'civic', 'military', 'fortification'] as const;

  return (
    <div className="codex-section">
      <button className="codex-header" onClick={() => setOpen(!open)}>
        <span>Building Codex</span>
        <span className={`codex-toggle ${open ? 'open' : ''}`}>▸</span>
      </button>
      {open && (
        <div className="codex-body">
          {categories.map(cat => {
            const buildings = (Object.entries(BUILDINGS) as [string, any][]).filter(([, b]) => b.category === cat);
            return (
              <div key={cat} className="codex-category">
                <div className="codex-category-title">{formatResourceName(cat)}</div>
                {buildings.map(([type, def]) => {
                  const cost = COST_TIERS[def.costTier as CostTier];
                  const rp = RESEARCH_POINTS[type as BuildingType];
                  return (
                    <div key={type} className="codex-entry">
                      <div className="codex-entry-name">{formatResourceName(type)}</div>
                      <div className="codex-entry-stats">
                        <div className="codex-stat"><span className="codex-stat-label">Cost</span><span className="codex-stat-value">{cost.goldCost}</span></div>
                        <div className="codex-stat"><span className="codex-stat-label">Maint</span><span className="codex-stat-value">{cost.maintenance}</span></div>
                        <div className="codex-stat"><span className="codex-stat-label">Build</span><span className="codex-stat-value">{cost.buildTime}t</span></div>
                        <div className="codex-stat"><span className="codex-stat-label">Min Tier</span><span className="codex-stat-value" style={{ textTransform: 'capitalize', fontSize: 11 }}>{def.minSettlement}</span></div>
                        {rp && <div className="codex-stat"><span className="codex-stat-label">Research</span><span className="codex-stat-value">{rp}/t</span></div>}
                      </div>
                      <div className="codex-entry-tags">
                        {def.materials.map((m: string) => (
                          <span key={m} className="codex-tag">{formatResourceName(m)}</span>
                        ))}
                        {def.terrain && def.terrain.map((t: string) => (
                          <span key={t} className="codex-tag" style={{ color: 'var(--accent-blue)' }}>{formatResourceName(t)}</span>
                        ))}
                        {def.techRequired && (
                          <span className="codex-tag" style={{ color: 'var(--accent-gold)' }}>Requires: {formatResourceName(def.techRequired)}</span>
                        )}
                        {!def.usesSlot && <span className="codex-tag">No slot</span>}
                      </div>
                      {def.input && Object.keys(def.input).length > 0 && (
                        <div className="codex-entry-detail">
                          Input: {Object.entries(def.input).map(([r, n]) => `${n} ${formatResourceName(r)}`).join(', ')}
                          {def.output && Object.keys(def.output).length > 0 && (
                            <> → Output: {Object.entries(def.output).map(([r, n]) => `${n} ${formatResourceName(r)}`).join(', ')}</>
                          )}
                        </div>
                      )}
                      {!def.input && def.output && Object.keys(def.output).length > 0 && (
                        <div className="codex-entry-detail">
                          Produces: {Object.entries(def.output).map(([r, n]) => `${n} ${formatResourceName(r)}`).join(', ')}
                        </div>
                      )}
                      {def.effect && <div className="codex-entry-detail">{def.effect}</div>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatResourceName(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
