import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../../store/index.js';
import {
  BUILDINGS, COST_TIERS, SETTLEMENT_TIERS, RESEARCH_POINTS, getNextTier,
  type BuildingType, type CostTier, type SettlementTier,
} from '@kingdoms/shared';
import { Tooltip } from '../shared/Tooltip.js';

export function SettlementDetailPanel() {
  const { slug } = useParams<{ slug: string }>();
  const selectedSettlementId = useStore(s => s.selectedSettlementId);
  const setSelectedSettlementId = useStore(s => s.setSelectedSettlementId);
  const settlements = useStore(s => s.settlements);
  const player = useStore(s => s.player) as Record<string, unknown> | null;
  const setGameState = useStore(s => s.setGameState);

  const settlement = selectedSettlementId
    ? settlements.find((s: any) => s.id === selectedSettlementId) as any
    : null;

  if (!settlement || !slug) return null;

  const isOwn = settlement.ownerId === player?.id;
  const tierDef = SETTLEMENT_TIERS[settlement.tier as SettlementTier];
  const nextTier = getNextTier(settlement.tier as SettlementTier);
  const nextTierDef = nextTier ? SETTLEMENT_TIERS[nextTier] : null;
  const buildings = (settlement.buildings ?? []) as any[];
  const completedBuildings = buildings.filter((b: any) => !b.isConstructing);
  const constructing = buildings.filter((b: any) => b.isConstructing);
  const storage = (settlement.storage ?? {}) as Record<string, number>;
  const resources = Object.entries(storage).filter(([, v]) => v > 0);

  return (
    <div className="side-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <SettlementName
          slug={slug}
          settlement={settlement}
          isOwn={isOwn}
          settlements={settlements}
          setGameState={setGameState}
        />
        <button
          className="btn btn-secondary"
          style={{ padding: '4px 10px', fontSize: 13 }}
          onClick={() => setSelectedSettlementId(null)}
        >
          Close
        </button>
      </div>

      {/* Tier & stats */}
      <div className="stat-grid" style={{ marginBottom: 12 }}>
        <div className="stat-box">
          <span className="stat-label">Tier</span>
          <span className="stat-detail" style={{ textTransform: 'capitalize' }}>{settlement.tier}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Population</span>
          <span className="stat-detail">{settlement.population}/{settlement.popCap}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Building Slots</span>
          <span className="stat-detail">{completedBuildings.length}/{tierDef?.buildingSlots ?? '?'}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Storage Cap</span>
          <span className="stat-detail">{tierDef?.storageCap?.toLocaleString() ?? '?'}</span>
        </div>
        {settlement.isCapital && (
          <div className="stat-box">
            <span className="stat-label">Status</span>
            <span className="stat-detail capital-badge">Capital</span>
          </div>
        )}
      </div>

      {/* Upgrade info */}
      {nextTier && nextTierDef && tierDef?.upgradeCost && (
        <div className="settlement-card" style={{ marginBottom: 12 }}>
          <div className="settlement-header">
            <strong style={{ fontSize: 13 }}>Upgrade to {nextTier}</strong>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            <span>{tierDef.upgradeCost.gold?.toLocaleString() ?? 0} gp</span>
            {tierDef.upgradeCost.resources && Object.entries(tierDef.upgradeCost.resources).map(([r, amt]) => (
              <span key={r} style={{ marginLeft: 8 }}>{formatName(r)}: {amt as number}</span>
            ))}
            <span style={{ marginLeft: 8 }}>| Pop req: {nextTierDef.popCap ? Math.floor(nextTierDef.popCap * 0.5) : '?'}</span>
          </div>
        </div>
      )}

      {/* Resources */}
      {resources.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <span className="stat-label">Stockpile</span>
          <div className="settlement-resources" style={{ marginTop: 4 }}>
            {resources.map(([resource, amount]) => (
              <span key={resource} className="resource-tag">
                {formatName(resource)}: {amount}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Buildings */}
      {completedBuildings.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <span className="stat-label">Buildings</span>
          <div className="settlement-resources" style={{ marginTop: 4 }}>
            {completedBuildings.map((b: any, i: number) => {
              const bDef = BUILDINGS[b.type as BuildingType];
              const costInfo = bDef ? COST_TIERS[bDef.costTier as CostTier] : null;
              const rp = RESEARCH_POINTS[b.type as BuildingType];
              return (
                <Tooltip key={i} content={
                  bDef && costInfo ? (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>{formatName(b.type)}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '2px 12px', fontSize: 12 }}>
                        <span className="tooltip-label">Maintenance</span><span className="tooltip-value">{costInfo.maintenance} gp/turn</span>
                        {rp && <><span className="tooltip-label">Research</span><span className="tooltip-value">{rp}/turn</span></>}
                      </div>
                      {bDef.output && Object.keys(bDef.output).length > 0 && (
                        <div style={{ fontSize: 12, marginTop: 4 }}>
                          Produces: {Object.entries(bDef.output).map(([r, n]) => `${n} ${formatName(r)}`).join(', ')}
                        </div>
                      )}
                      {bDef.effect && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{bDef.effect}</div>}
                    </div>
                  ) : <span>{formatName(b.type)}</span>
                }>
                  <span className="resource-tag" style={{ cursor: 'help' }}>
                    {formatName(b.type)}
                  </span>
                </Tooltip>
              );
            })}
          </div>
        </div>
      )}

      {/* Construction queue */}
      {constructing.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <span className="stat-label">Under Construction</span>
          <div className="settlement-resources" style={{ marginTop: 4 }}>
            {constructing.map((b: any, i: number) => (
              <span key={i} className="resource-tag">
                {formatName(b.type)} ({b.turnsRemaining}t)
              </span>
            ))}
          </div>
        </div>
      )}

      {settlement.constructionQueue?.length > 0 && (
        <div>
          <span className="stat-label">Queued</span>
          <div className="settlement-resources" style={{ marginTop: 4 }}>
            {settlement.constructionQueue.map((job: any, i: number) => (
              <span key={i} className="resource-tag">
                {formatName(job.buildingType)} ({job.turnsRemaining}t)
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SettlementName({
  slug, settlement, isOwn, settlements, setGameState,
}: {
  slug: string;
  settlement: any;
  isOwn: boolean;
  settlements: any[];
  setGameState: (s: any) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(settlement.name ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === settlement.name) {
      setEditing(false);
      setDraft(settlement.name);
      return;
    }
    setSaving(true);
    const sessionToken = localStorage.getItem(`session:${slug}`);
    try {
      await fetch(`/api/games/${slug}/settlement`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-session-token': sessionToken ?? '' },
        body: JSON.stringify({ settlementId: settlement.id, name: trimmed }),
      });
      setGameState({
        settlements: settlements.map((s: any) => s.id === settlement.id ? { ...s, name: trimmed } : s),
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing && isOwn) {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1, marginRight: 8 }}>
        <input
          type="text"
          value={draft}
          maxLength={40}
          autoFocus
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') { setEditing(false); setDraft(settlement.name); }
          }}
          style={{ fontSize: 16, fontWeight: 600, padding: '2px 6px', flex: 1, minWidth: 0 }}
        />
        <button
          className="btn btn-primary"
          style={{ fontSize: 11, padding: '2px 8px' }}
          onClick={save}
          disabled={saving}
        >
          {saving ? '...' : 'Save'}
        </button>
        <button
          className="btn"
          style={{ fontSize: 11, padding: '2px 8px' }}
          onClick={() => { setEditing(false); setDraft(settlement.name); }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <h3
      style={{ margin: 0, cursor: isOwn ? 'pointer' : 'default' }}
      title={isOwn ? 'Click to rename' : undefined}
      onClick={() => { if (isOwn) { setDraft(settlement.name); setEditing(true); } }}
    >
      {settlement.name}
    </h3>
  );
}

function formatName(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
