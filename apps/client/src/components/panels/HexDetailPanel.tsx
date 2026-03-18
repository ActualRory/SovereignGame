import { useStore } from '../../store/index.js';

/**
 * Side panel showing detailed info about the selected hex.
 * Visible when a hex is clicked and no tab overlay is open.
 */
export function HexDetailPanel() {
  const selectedHex = useStore(s => s.selectedHex);
  const hexes = useStore(s => s.hexes);
  const settlements = useStore(s => s.settlements);
  const armies = useStore(s => s.armies);
  const players = useStore(s => s.players);
  const player = useStore(s => s.player);
  const setSelectedHex = useStore(s => s.setSelectedHex);

  if (!selectedHex) return null;

  const hex = hexes.find(
    (h: any) => h.q === selectedHex.q && h.r === selectedHex.r
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

  return (
    <div className="side-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Hex ({hex.q}, {hex.r})</h3>
        <button
          className="btn btn-secondary"
          style={{ padding: '4px 10px', fontSize: 13 }}
          onClick={() => setSelectedHex(null)}
        >
          Close
        </button>
      </div>

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
            const isOwnArmy = a.ownerId === (player as any)?.id;
            return (
              <div key={a.id} className="settlement-card" style={{ marginTop: 6 }}>
                <div className="settlement-header">
                  <strong>{a.name}</strong>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {(armyOwner as any)?.countryName}
                  </span>
                </div>
                {isOwnArmy && a.units ? (
                  <div className="settlement-stats">
                    <span>{a.units.length} units</span>
                    <span>Supply: {a.supplyBank}</span>
                  </div>
                ) : a.unitCount != null ? (
                  <div className="settlement-stats">
                    <span>~{a.unitCount} units</span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatName(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
