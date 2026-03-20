import { useState } from 'react';
import { useStore } from '../../store/index.js';
import {
  TERRAIN, RIVER_CROSSING_COST, RIVER_DEFENCE_BONUS, RIVER_CROSSING_FRONTLINE_WIDTH,
} from '@kingdoms/shared';

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

      {/* Terrain Guide */}
      <TerrainGuide />
    </div>
  );
}

/* ─── Terrain Guide ─── */

function TerrainGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="codex-section">
      <button className="codex-header" onClick={() => setOpen(!open)}>
        <span>Terrain Guide</span>
        <span className={`codex-toggle ${open ? 'open' : ''}`}>▸</span>
      </button>
      {open && (
        <div className="codex-body">
          <table className="terrain-table">
            <thead>
              <tr>
                <th>Terrain</th>
                <th>Move</th>
                <th>Supply</th>
                <th>Def</th>
                <th>Width</th>
                <th>Resources</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(TERRAIN).map(([type, stats]) => (
                <tr key={type}>
                  <td style={{ fontFamily: 'var(--font-heading)', textTransform: 'capitalize' }}>{type}</td>
                  <td className="terrain-value">{stats.movementCost} MP</td>
                  <td>
                    <span className="terrain-value">{stats.supplyValue}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 4 }}>({stats.supply})</span>
                  </td>
                  <td className="terrain-value">{stats.defenceBonus > 0 ? `+${stats.defenceBonus}` : '—'}</td>
                  <td className="terrain-value">{stats.frontlineWidth}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {stats.possibleResources.length > 0
                      ? stats.possibleResources.map(r => formatName(r)).join(', ')
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="codex-entry" style={{ marginTop: 12 }}>
            <div className="codex-entry-name">River Crossing</div>
            <div className="codex-entry-stats">
              <div className="codex-stat"><span className="codex-stat-label">Extra Cost</span><span className="codex-stat-value">+{RIVER_CROSSING_COST} MP</span></div>
              <div className="codex-stat"><span className="codex-stat-label">Def Bonus</span><span className="codex-stat-value">+{RIVER_DEFENCE_BONUS}</span></div>
              <div className="codex-stat"><span className="codex-stat-label">Width</span><span className="codex-stat-value">{RIVER_CROSSING_FRONTLINE_WIDTH}</span></div>
            </div>
            <div className="codex-entry-detail">
              Attacker crossing a river suffers extra movement cost, reduced frontline width, and the defender gains a defence bonus. Build a bridge to negate these penalties.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatName(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
