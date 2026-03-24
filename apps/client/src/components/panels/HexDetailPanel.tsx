import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../../store/index.js';
import { TERRAIN, BUILDINGS, COST_TIERS, hexNeighbors, hexDistance, claimCost, CLAIM_RADIUS, CLAIM_DURATION_UNCLAIMED, CLAIM_DURATION_ENEMY, SETTLEMENT_TIERS, type BuildingType, type TerrainType } from '@kingdoms/shared';
import { Tooltip } from '../shared/Tooltip.js';

/**
 * Side panel showing detailed info about a hex.
 * Opened via right-click → Details on the map, or by clicking an army.
 * Independent of tab overlays — always visible when detailPanelHex is set.
 */
export function HexDetailPanel() {
  const { slug } = useParams<{ slug: string }>();
  const detailPanelHex = useStore(s => s.detailPanelHex);
  const selectedHex = useStore(s => s.selectedHex);
  const hexes = useStore(s => s.hexes);
  const settlements = useStore(s => s.settlements);
  const armies = useStore(s => s.armies);
  const players = useStore(s => s.players);
  const player = useStore(s => s.player);
  const setDetailPanelHex = useStore(s => s.setDetailPanelHex);
  const setSelectedArmyId = useStore(s => s.setSelectedArmyId);
  const selectedArmyId = useStore(s => s.selectedArmyId);
  const setGameState = useStore(s => s.setGameState);
  const setIsSelectingMoveTarget = useStore(s => s.setIsSelectingMoveTarget);
  const game = useStore(s => s.game) as any;
  const pendingOrders = useStore(s => s.pendingOrders);
  const addClaimHex = useStore(s => s.addClaimHex);
  const removeClaimHex = useStore(s => s.removeClaimHex);
  const addNewSettlement = useStore(s => s.addNewSettlement);
  const removeNewSettlement = useStore(s => s.removeNewSettlement);
  const addFarmlandConversion = useStore(s => s.addFarmlandConversion);
  const removeFarmlandConversion = useStore(s => s.removeFarmlandConversion);
  const techProgress = useStore(s => s.techProgress) as any[];

  // Use detailPanelHex if set, otherwise fall back to selectedHex (for backwards compat)
  const targetHex = detailPanelHex ?? selectedHex;

  if (!targetHex) return null;
  // Only show if detailPanelHex is explicitly set (from context menu / interaction)
  if (!detailPanelHex) return null;

  const hex = hexes.find(
    (h: any) => h.q === targetHex.q && h.r === targetHex.r
  ) as any;

  if (!hex) return null;

  const fogState = hex.fogState ?? 'full_vision';
  const owner = hex.ownerId
    ? players.find((p: any) => p.id === hex.ownerId)
    : null;

  const settlement = hex.settlementId
    ? settlements.find((s: any) => s.id === hex.settlementId)
    : null;

  const hexArmies = armies.filter(
    (a: any) => a.hexQ === hex.q && a.hexR === hex.r
  );

  const isOwn = hex.ownerId === (player as any)?.id;
  const playerId = (player as any)?.id;

  return (
    <div className="side-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>
          {hex.customName || `Hex (${hex.q}, ${hex.r})`}
        </h3>
        <button
          className="btn btn-secondary"
          style={{ padding: '4px 10px', fontSize: 13 }}
          onClick={() => setDetailPanelHex(null)}
        >
          Close
        </button>
      </div>

      {/* Coordinates reference */}
      {hex.customName && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
          ({hex.q}, {hex.r})
        </div>
      )}

      {/* Hex naming (own hexes only) */}
      {isOwn && (
        <HexNameEditor slug={slug!} hex={hex} />
      )}

      <div className="hex-detail-terrain" style={{ marginBottom: 12 }}>
        <Tooltip content={(() => {
          const t = TERRAIN[hex.terrain as TerrainType];
          if (!t) return <span>{hex.terrain}</span>;
          return (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '2px 12px', fontSize: 12 }}>
                <span className="tooltip-label">Move Cost</span><span className="tooltip-value">{t.movementCost} MP</span>
                <span className="tooltip-label">Supply</span><span className="tooltip-value">{t.supplyValue} ({t.supply})</span>
                <span className="tooltip-label">Defence</span><span className="tooltip-value">{t.defenceBonus > 0 ? `+${t.defenceBonus}` : '0'}</span>
                <span className="tooltip-label">Front Width</span><span className="tooltip-value">{t.frontlineWidth}</span>
              </div>
              {t.possibleResources.length > 0 && (
                <>
                  <div className="tooltip-divider" />
                  <div className="tooltip-label">Possible Resources</div>
                  <div style={{ fontSize: 12 }}>{t.possibleResources.map(r => formatName(r)).join(', ')}</div>
                </>
              )}
            </div>
          );
        })()}>
          <span style={{ textTransform: 'capitalize', fontWeight: 600, fontSize: 16, cursor: 'help', borderBottom: '1px dotted var(--text-muted)' }}>
            {hex.terrain}
          </span>
        </Tooltip>
        {fogState === 'soft_fog' && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
            (Fog)
          </span>
        )}
      </div>

      {/* Owner */}
      {owner && (
        <div style={{ marginBottom: 12 }}>
          <span className="stat-label">Controlled by</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <span
              className="player-color"
              style={{ background: (owner as any).color }}
            />
            <span>{(owner as any).countryName}</span>
          </div>
        </div>
      )}

      {/* Resources */}
      {hex.resources?.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <span className="stat-label">Resources</span>
          <div className="settlement-resources" style={{ marginTop: 4 }}>
            {(hex.resources as string[]).map((r: string) => (
              <span key={r} className="resource-tag">{formatName(r)}</span>
            ))}
          </div>
        </div>
      )}

      {/* Rivers */}
      {hex.riverEdges?.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <span className="stat-label">River Edges</span>
          <div style={{ marginTop: 4, fontSize: 14, color: 'var(--accent-blue)' }}>
            {(hex.riverEdges as string[]).map(formatName).join(', ')}
          </div>
        </div>
      )}

      {/* Settlement */}
      {settlement && (
        <div style={{ marginBottom: 12 }}>
          <span className="stat-label">Settlement</span>
          <div className="settlement-card" style={{ cursor: 'pointer' }} onClick={() => {
            useStore.getState().setSelectedSettlementId((settlement as any).id);
          }} title="Click for details">
            <div className="settlement-header">
              <strong>{(settlement as any).name}</strong>
              <span className="settlement-tier" style={{ textTransform: 'capitalize' }}>
                {(settlement as any).tier}
              </span>
            </div>
            {isOwn && (
              <SettlementNameEditor slug={slug!} settlement={settlement as any} />
            )}
            {fogState === 'full_vision' && (
              <>
                <div className="settlement-stats">
                  <span>Pop: {(settlement as any).population}/{(settlement as any).popCap}</span>
                  {(settlement as any).isCapital && <span className="capital-badge">Capital</span>}
                </div>
                {isOwn && (settlement as any).buildings?.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Buildings:</span>
                    <div className="settlement-resources" style={{ marginTop: 2 }}>
                      {((settlement as any).buildings as any[]).map((b: any, i: number) => {
                        const bDef = BUILDINGS[b.type as BuildingType];
                        const costInfo = bDef ? COST_TIERS[bDef.costTier] : null;
                        return (
                          <Tooltip key={i} content={
                            bDef && costInfo ? (
                              <div>
                                <div style={{ fontWeight: 600, marginBottom: 2 }}>{formatName(b.type)}</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '2px 12px', fontSize: 12 }}>
                                  <span className="tooltip-label">Maintenance</span><span className="tooltip-value">{costInfo.maintenance} gp/turn</span>
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
                              {b.isConstructing && ` (${b.turnsRemaining}t)`}
                            </span>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Armies */}
      {hexArmies.length > 0 && (
        <div>
          <span className="stat-label">Armies</span>
          {hexArmies.map((a: any) => {
            const armyOwner = players.find((p: any) => p.id === a.ownerId);
            const isOwnArmy = a.ownerId === playerId;
            const isSelected = selectedArmyId === a.id;
            const unitCount = a.units?.filter((u: any) => u.state !== 'destroyed').length ?? a.unitCount ?? 0;
            return (
              <div
                key={a.id}
                className="settlement-card"
                style={{
                  marginTop: 6,
                  borderColor: isSelected ? 'var(--accent-gold)' : undefined,
                  borderWidth: isSelected ? 2 : undefined,
                  cursor: 'pointer',
                }}
                onClick={() => {
                  if (isOwnArmy) setSelectedArmyId(isSelected ? null : a.id);
                  useStore.getState().setDetailPanelArmyId(a.id);
                }}
              >
                <div className="settlement-header">
                  <strong>{a.name}</strong>
                  <span style={{ fontSize: 11, color: 'var(--accent-gold)', cursor: 'pointer' }}>
                    Examine
                  </span>
                </div>
                {a.subtitle && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: 2 }}>
                    {a.subtitle}
                  </div>
                )}
                <div className="settlement-stats">
                  <span>{unitCount} units</span>
                  {isOwnArmy && <span>Supply: {a.supplyBank}</span>}
                  {!isOwnArmy && armyOwner && <span>{(armyOwner as any).countryName}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Claim Progress ── */}
      {hex.claimStartedTurn != null && hex.claimingPlayerId && (() => {
        const isEnemyHex = hex.ownerId != null && hex.ownerId !== hex.claimingPlayerId;
        const duration = isEnemyHex ? CLAIM_DURATION_ENEMY : CLAIM_DURATION_UNCLAIMED;
        const elapsed = (game?.currentTurn ?? 0) - hex.claimStartedTurn;
        const progress = Math.min(1, elapsed / duration);
        const claimPlayer = players.find((p: any) => p.id === hex.claimingPlayerId);
        const isOwnClaim = hex.claimingPlayerId === playerId;
        const armyPresent = armies.some((a: any) => a.hexQ === hex.q && a.hexR === hex.r && a.ownerId === hex.claimingPlayerId);

        return (
          <div style={{ marginBottom: 12, padding: '8px 10px', border: '1px solid var(--border-dark)', borderRadius: 6, background: 'var(--bg-inset)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
              {isEnemyHex ? 'Conquering' : 'Claiming'} — {claimPlayer ? (claimPlayer as any).countryName : 'Unknown'}
            </div>
            <div style={{ background: 'var(--bg-dark)', borderRadius: 4, height: 8, overflow: 'hidden', marginBottom: 4 }}>
              <div style={{ width: `${progress * 100}%`, height: '100%', background: 'var(--accent-gold)', borderRadius: 4, transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {elapsed}/{duration} turns
              {!armyPresent && <span style={{ color: 'var(--accent-red)', marginLeft: 8 }}>No army — claim will be abandoned</span>}
            </div>
            {isOwnClaim && (
              <button
                className="btn btn-secondary"
                style={{ marginTop: 4, padding: '2px 8px', fontSize: 11 }}
                onClick={() => removeClaimHex(hex.q, hex.r)}
              >
                Cancel Claim
              </button>
            )}
          </div>
        );
      })()}

      {/* ── Claim Hex Button ── */}
      {isOwn ? null : (() => {
        const hasArmyOnHex = armies.some((a: any) => a.hexQ === hex.q && a.hexR === hex.r && a.ownerId === playerId);
        if (!hasArmyOnHex) return null;
        if (hex.claimingPlayerId === playerId) return null; // already claiming
        if (hex.ownerId === playerId) return null; // already own

        const isEnemyHex = hex.ownerId != null && hex.ownerId !== playerId;
        const isPendingClaim = pendingOrders.claimHexes.some((c: any) => c.hexQ === hex.q && c.hexR === hex.r);

        if (!isEnemyHex) {
          // Check within radius of a settlement
          const playerSettlements = settlements.filter((s: any) => s.ownerId === playerId);
          const withinRadius = playerSettlements.some((s: any) =>
            hexDistance({ q: s.hexQ, r: s.hexR }, { q: hex.q, r: hex.r }) <= CLAIM_RADIUS
          );
          if (!withinRadius) return (
            <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Too far from any settlement to claim (max {CLAIM_RADIUS} hexes)
            </div>
          );
        }

        const playerHexCount = hexes.filter((h: any) => h.ownerId === playerId).length;
        const cost = isEnemyHex ? 0 : claimCost(playerHexCount);

        if (isPendingClaim) {
          return (
            <div style={{ marginBottom: 12 }}>
              <span className="resource-tag" style={{ borderColor: 'var(--accent-green)', color: 'var(--accent-green)' }}>
                {isEnemyHex ? 'Conquest' : 'Claim'} queued
                <button
                  onClick={() => removeClaimHex(hex.q, hex.r)}
                  style={{ marginLeft: 4, background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', fontSize: 12, padding: 0, fontWeight: 600 }}
                >x</button>
              </span>
            </div>
          );
        }

        return (
          <div style={{ marginBottom: 12 }}>
            <button
              className="btn btn-primary"
              style={{ padding: '4px 12px', fontSize: 12 }}
              onClick={() => addClaimHex(hex.q, hex.r)}
            >
              {isEnemyHex ? 'Conquer Hex' : 'Claim Hex'}
            </button>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
              {cost > 0 ? `${cost} gp · ${isEnemyHex ? CLAIM_DURATION_ENEMY : CLAIM_DURATION_UNCLAIMED} turns` : `Free · ${CLAIM_DURATION_ENEMY} turns`}
            </span>
          </div>
        );
      })()}

      {/* ── Found Settlement ── */}
      {isOwn && !hex.settlementId && (() => {
        const neighbors = hexNeighbors({ q: hex.q, r: hex.r });
        const hasAdjacentSettlement = neighbors.some((n: any) =>
          hexes.some((h: any) => h.q === n.q && h.r === n.r && h.settlementId != null)
        );
        if (hasAdjacentSettlement) return null;

        const pendingFoundHere = pendingOrders.newSettlements.find((ns: any) => ns.hexQ === hex.q && ns.hexR === hex.r);

        if (pendingFoundHere) {
          return (
            <div style={{ marginBottom: 12, padding: '8px 10px', border: '1px solid var(--accent-green)', borderRadius: 6, background: 'var(--bg-inset)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Settlement founding queued: {pendingFoundHere.name}
              </div>
              <button
                className="btn btn-secondary"
                style={{ padding: '2px 8px', fontSize: 11 }}
                onClick={() => removeNewSettlement(hex.q, hex.r)}
              >
                Cancel
              </button>
            </div>
          );
        }

        return <FoundSettlementInline hexQ={hex.q} hexR={hex.r} addNewSettlement={addNewSettlement} playerGold={(player as any)?.gold ?? 0} />;
      })()}

      {/* ── Convert to Farmland ── */}
      {isOwn && hex.terrain === 'plains' && !hex.conversionStartedTurn && (() => {
        // Check if adjacent to or has a settlement
        const neighbors = hexNeighbors({ q: hex.q, r: hex.r });
        const nearSettlement = hex.settlementId ||
          neighbors.some((n: any) => hexes.some((h: any) => h.q === n.q && h.r === n.r && h.settlementId != null && h.ownerId === playerId));
        if (!nearSettlement) return null;

        // Check Agriculture tech
        const hasAgri = techProgress?.some((tp: any) => tp.tech === 'agriculture' && tp.isResearched);
        if (!hasAgri) return (
          <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Research Agriculture to convert to farmland
          </div>
        );

        const pendingConv = pendingOrders.farmlandConversions.some((f: any) => f.hexQ === hex.q && f.hexR === hex.r);
        if (pendingConv) {
          return (
            <div style={{ marginBottom: 12 }}>
              <span className="resource-tag" style={{ borderColor: 'var(--accent-green)', color: 'var(--accent-green)' }}>
                Farmland conversion queued
                <button
                  onClick={() => removeFarmlandConversion(hex.q, hex.r)}
                  style={{ marginLeft: 4, background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', fontSize: 12, padding: 0, fontWeight: 600 }}
                >x</button>
              </span>
            </div>
          );
        }

        return (
          <div style={{ marginBottom: 12 }}>
            <button
              className="btn btn-primary"
              style={{ padding: '4px 12px', fontSize: 12 }}
              onClick={() => addFarmlandConversion(hex.q, hex.r)}
            >
              Convert to Farmland
            </button>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>500 gp + 10 timber · 4 turns</span>
          </div>
        );
      })()}

      {/* ── Farmland Conversion Progress ── */}
      {hex.conversionStartedTurn != null && hex.conversionType && (() => {
        const elapsed = (game?.currentTurn ?? 0) - hex.conversionStartedTurn;
        const duration = 4;
        const progress = Math.min(1, elapsed / duration);
        return (
          <div style={{ marginBottom: 12, padding: '8px 10px', border: '1px solid var(--border-dark)', borderRadius: 6, background: 'var(--bg-inset)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
              Converting to {formatName(hex.conversionType)}
            </div>
            <div style={{ background: 'var(--bg-dark)', borderRadius: 4, height: 8, overflow: 'hidden', marginBottom: 4 }}>
              <div style={{ width: `${progress * 100}%`, height: '100%', background: 'var(--accent-green)', borderRadius: 4, transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{elapsed}/{duration} turns</div>
          </div>
        );
      })()}
    </div>
  );
}

/* ─── Found Settlement Inline ─── */

function FoundSettlementInline({ hexQ, hexR, addNewSettlement, playerGold }: {
  hexQ: number; hexR: number;
  addNewSettlement: (order: { hexQ: number; hexR: number; name: string }) => void;
  playerGold: number;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const hamletCost = SETTLEMENT_TIERS.hamlet.upgradeCost;

  if (!showForm) {
    return (
      <div style={{ marginBottom: 12 }}>
        <button
          className="btn btn-primary"
          style={{ padding: '4px 12px', fontSize: 12 }}
          onClick={() => setShowForm(true)}
        >
          Found Settlement
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
          {hamletCost.gold} gp + {Object.entries(hamletCost.resources).map(([r, n]) => `${n} ${formatName(r)}`).join(', ')}
        </span>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 12, padding: '8px 10px', border: '1px solid var(--border-dark)', borderRadius: 6, background: 'var(--bg-inset)' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Found Settlement</div>
      <input
        className="hex-name-input"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && name.trim()) {
            addNewSettlement({ hexQ, hexR, name: name.trim() });
            setShowForm(false);
            setName('');
          }
          if (e.key === 'Escape') { setShowForm(false); setName(''); }
        }}
        placeholder="Settlement name..."
        autoFocus
        style={{ marginBottom: 6 }}
      />
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
        Cost: {hamletCost.gold} gp + {Object.entries(hamletCost.resources).map(([r, n]) => `${n} ${formatName(r)}`).join(', ')}
        {playerGold < hamletCost.gold && <span style={{ color: 'var(--accent-red)', marginLeft: 8 }}>Not enough gold</span>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className="btn btn-primary"
          style={{ padding: '3px 10px', fontSize: 11 }}
          disabled={!name.trim() || playerGold < hamletCost.gold}
          onClick={() => {
            if (name.trim()) {
              addNewSettlement({ hexQ, hexR, name: name.trim() });
              setShowForm(false);
              setName('');
            }
          }}
        >
          Found
        </button>
        <button
          className="btn btn-secondary"
          style={{ padding: '3px 10px', fontSize: 11 }}
          onClick={() => { setShowForm(false); setName(''); }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ─── Hex Name Editor ─── */

function HexNameEditor({ slug, hex }: { slug: string; hex: any }) {
  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState(hex.customName ?? '');
  const setGameState = useStore(s => s.setGameState);
  const hexes = useStore(s => s.hexes);

  async function save() {
    setEditing(false);
    const sessionToken = localStorage.getItem(`session:${slug}`);
    await fetch(`/api/games/${slug}/hex`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-session-token': sessionToken ?? '' },
      body: JSON.stringify({ q: hex.q, r: hex.r, customName: nameValue }),
    });
    // Optimistic update
    setGameState({
      hexes: hexes.map((h: any) => (h.q === hex.q && h.r === hex.r) ? { ...h, customName: nameValue || null } : h),
    });
  }

  if (editing) {
    return (
      <div style={{ marginBottom: 10 }}>
        <input
          className="hex-name-input"
          value={nameValue}
          onChange={e => setNameValue(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          placeholder="Name this land..."
          autoFocus
        />
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <button
        className="btn btn-secondary hex-name-btn"
        onClick={() => { setEditing(true); setNameValue(hex.customName ?? ''); }}
      >
        {hex.customName ? 'Rename' : 'Name this land'}
      </button>
    </div>
  );
}

/* ─── Settlement Name Editor ─── */

function SettlementNameEditor({ slug, settlement }: { slug: string; settlement: any }) {
  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState(settlement.name ?? '');
  const setGameState = useStore(s => s.setGameState);
  const settlements = useStore(s => s.settlements);

  async function save() {
    const trimmed = nameValue.trim();
    if (!trimmed) { setEditing(false); return; }
    setEditing(false);
    const sessionToken = localStorage.getItem(`session:${slug}`);
    await fetch(`/api/games/${slug}/settlement`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-session-token': sessionToken ?? '' },
      body: JSON.stringify({ settlementId: settlement.id, name: trimmed }),
    });
    // Optimistic update
    setGameState({
      settlements: settlements.map((s: any) => s.id === settlement.id ? { ...s, name: trimmed } : s),
    });
  }

  if (editing) {
    return (
      <div style={{ marginTop: 4 }}>
        <input
          className="hex-name-input"
          value={nameValue}
          onChange={e => setNameValue(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          placeholder="Settlement name..."
          autoFocus
        />
      </div>
    );
  }

  return (
    <div style={{ marginTop: 4 }}>
      <button
        className="btn btn-secondary hex-name-btn"
        style={{ fontSize: 11, padding: '2px 8px' }}
        onClick={() => { setEditing(true); setNameValue(settlement.name ?? ''); }}
      >
        Rename
      </button>
    </div>
  );
}

function formatName(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
