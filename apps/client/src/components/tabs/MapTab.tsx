import { useStore } from '../../store/index.js';

export function MapTab() {
  const selectedHex = useStore(s => s.selectedHex);
  const hexes = useStore(s => s.hexes);
  const settlements = useStore(s => s.settlements);
  const armies = useStore(s => s.armies);
  const players = useStore(s => s.players);

  const hex = selectedHex
    ? hexes.find((h: any) => h.q === selectedHex.q && h.r === selectedHex.r)
    : null;

  if (!hex) {
    return (
      <div className="map-tab">
        <h2>Map</h2>
        <p style={{ color: 'var(--text-muted)' }}>Click a hex on the map to view details.</p>
      </div>
    );
  }

  const h = hex as any;
  const fogState = h.fogState ?? 'full_vision';
  const owner = h.ownerId
    ? players.find((p: any) => p.id === h.ownerId)
    : null;

  const settlement = h.settlementId
    ? settlements.find((s: any) => s.id === h.settlementId)
    : null;

  const hexArmies = armies.filter(
    (a: any) => a.hexQ === h.q && a.hexR === h.r
  );

  return (
    <div className="map-tab">
      <h2>Hex ({h.q}, {h.r})</h2>

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-box">
          <span className="stat-label">Terrain</span>
          <span className="stat-detail" style={{ textTransform: 'capitalize' }}>
            {h.terrain}
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Owner</span>
          <span className="stat-detail">
            {owner ? (owner as any).countryName : 'Unclaimed'}
          </span>
        </div>
        {fogState === 'soft_fog' && (
          <div className="stat-box">
            <span className="stat-label">Vision</span>
            <span className="stat-detail">Soft Fog</span>
          </div>
        )}
      </div>

      {/* Resources */}
      {h.resources?.length > 0 && (
        <>
          <h3>Resources</h3>
          <div className="resource-grid" style={{ marginBottom: 16 }}>
            {(h.resources as string[]).map((r: string) => (
              <div key={r} className="resource-item">
                <span className="resource-name">{formatName(r)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* River edges */}
      {h.riverEdges?.length > 0 && (
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Rivers: {(h.riverEdges as string[]).map(formatName).join(', ')}
        </p>
      )}

      {/* Settlement */}
      {settlement && (
        <>
          <h3>Settlement</h3>
          <div className="settlement-card">
            <div className="settlement-header">
              <strong>{(settlement as any).name}</strong>
              <span className="settlement-tier" style={{ textTransform: 'capitalize' }}>
                {(settlement as any).tier}
              </span>
            </div>
            {fogState === 'full_vision' && (
              <div className="settlement-stats">
                <span>Pop: {(settlement as any).population}/{(settlement as any).popCap}</span>
                {(settlement as any).isCapital && <span className="capital-badge">Capital</span>}
              </div>
            )}
            {fogState === 'soft_fog' && (settlement as any).isCapital && (
              <span className="capital-badge">Capital</span>
            )}
          </div>
        </>
      )}

      {/* Armies (only in full vision) */}
      {hexArmies.length > 0 && (
        <>
          <h3 style={{ marginTop: 16 }}>Armies</h3>
          {hexArmies.map((a: any) => {
            const armyOwner = players.find((p: any) => p.id === a.ownerId);
            return (
              <div key={a.id} className="settlement-card" style={{ marginTop: 8 }}>
                <div className="settlement-header">
                  <strong>{a.name}</strong>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {(armyOwner as any)?.countryName}
                  </span>
                </div>
                {a.units ? (
                  <div className="settlement-stats">
                    <span>{a.units.length} units</span>
                    <span>Supply: {a.supplyBank ?? '?'}</span>
                  </div>
                ) : a.unitCount != null ? (
                  <div className="settlement-stats">
                    <span>{a.unitCount} units</span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function formatName(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
