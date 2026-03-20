import { useStore } from '../../store/index.js';

export function MapTab() {
  const hexes = useStore(s => s.hexes);
  const settlements = useStore(s => s.settlements);
  const armies = useStore(s => s.armies);
  const player = useStore(s => s.player) as Record<string, unknown> | null;
  const players = useStore(s => s.players);

  const playerId = player?.id as string | undefined;
  const myHexes = hexes.filter((h: any) => h.ownerId === playerId);
  const namedHexes = hexes.filter((h: any) => h.customName);
  const mySettlements = settlements.filter((s: any) => s.ownerId === playerId);
  const myArmies = armies.filter((a: any) => a.ownerId === playerId);

  return (
    <div className="map-tab">
      <h2>Map Overview</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontStyle: 'italic' }}>
        Right-click any hex on the map for details and orders.
      </p>

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-box">
          <span className="stat-label">Territory</span>
          <span className="stat-detail">{myHexes.length} hexes</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Settlements</span>
          <span className="stat-detail">{mySettlements.length}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Armies</span>
          <span className="stat-detail">{myArmies.length}</span>
        </div>
      </div>

      {/* Named lands */}
      {namedHexes.length > 0 && (
        <>
          <h3>Named Lands</h3>
          <div style={{ marginTop: 8 }}>
            {namedHexes.map((h: any) => {
              const owner = players.find((p: any) => p.id === h.ownerId);
              return (
                <div key={`${h.q},${h.r}`} className="settlement-card" style={{ marginTop: 6 }}>
                  <div className="settlement-header">
                    <strong>{h.customName}</strong>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      ({h.q}, {h.r}) — {formatName(h.terrain)}
                    </span>
                  </div>
                  {owner && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {(owner as any).countryName}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Settlements overview */}
      <h3 style={{ marginTop: 20 }}>Settlements</h3>
      {mySettlements.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No settlements founded.</p>
      )}
      {mySettlements.map((s: any) => (
        <div key={s.id} className="settlement-card" style={{ marginTop: 6 }}>
          <div className="settlement-header">
            <strong>{s.name}</strong>
            <span className="settlement-tier" style={{ textTransform: 'capitalize' }}>{s.tier}</span>
          </div>
          <div className="settlement-stats">
            <span>Pop: {s.population}/{s.popCap}</span>
            <span>({s.hexQ}, {s.hexR})</span>
            {s.isCapital && <span className="capital-badge">Capital</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatName(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
