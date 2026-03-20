import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../../store/index.js';

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
        <span style={{ textTransform: 'capitalize', fontWeight: 600, fontSize: 16 }}>
          {hex.terrain}
        </span>
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
          <div className="settlement-card">
            <div className="settlement-header">
              <strong>{(settlement as any).name}</strong>
              <span className="settlement-tier" style={{ textTransform: 'capitalize' }}>
                {(settlement as any).tier}
              </span>
            </div>
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
                      {((settlement as any).buildings as any[]).map((b: any, i: number) => (
                        <span key={i} className="resource-tag">
                          {formatName(b.type)}
                          {b.isConstructing && ` (${b.turnsRemaining}t)`}
                        </span>
                      ))}
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
            return (
              <div
                key={a.id}
                className="settlement-card"
                style={{
                  marginTop: 6,
                  borderColor: isSelected ? 'var(--accent-gold)' : undefined,
                  borderWidth: isSelected ? 2 : undefined,
                  cursor: isOwnArmy ? 'pointer' : 'default',
                }}
                onClick={() => isOwnArmy && setSelectedArmyId(isSelected ? null : a.id)}
              >
                <div className="settlement-header">
                  <strong>{a.name}</strong>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {isSelected ? 'Selected' : (armyOwner as any)?.countryName}
                  </span>
                </div>
                {a.subtitle && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: 2 }}>
                    {a.subtitle}
                  </div>
                )}
                {isOwnArmy && a.units ? (
                  <div className="settlement-stats">
                    <span>{a.units.filter((u: any) => u.state !== 'destroyed').length} units</span>
                    <span>Supply: {a.supplyBank}</span>
                  </div>
                ) : a.unitCount != null ? (
                  <div className="settlement-stats">
                    <span>~{a.unitCount} units</span>
                  </div>
                ) : null}
                {/* Quick orders for own selected army */}
                {isOwnArmy && isSelected && (
                  <div style={{ marginTop: 6 }}>
                    <button
                      className="btn btn-primary"
                      style={{ padding: '3px 10px', fontSize: 12 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsSelectingMoveTarget(true);
                        setDetailPanelHex(null);
                      }}
                    >
                      Issue Move Order
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
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

function formatName(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
