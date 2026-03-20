import { useState } from 'react';
import { useStore } from '../../store/index.js';
import {
  TERRAIN, RIVER_CROSSING_COST, RIVER_DEFENCE_BONUS, RIVER_CROSSING_FRONTLINE_WIDTH,
} from '@kingdoms/shared';

type AtlasSection = 'realm' | 'settlements' | 'civilisations';

const TIER_ORDER = ['metropolis', 'city', 'town', 'village', 'hamlet'];

const TIER_LABELS: Record<string, string> = {
  hamlet: 'Hamlet', village: 'Village', town: 'Town', city: 'City', metropolis: 'Metropolis',
};

export function MapTab() {
  const [section, setSection] = useState<AtlasSection>('realm');

  return (
    <div className="map-tab">
      <h2>Atlas</h2>

      <div className="desk-tabs" style={{ marginTop: 12 }}>
        <button
          className={`desk-tab ${section === 'realm' ? 'active' : ''}`}
          onClick={() => setSection('realm')}
        >
          Your Realm
        </button>
        <button
          className={`desk-tab ${section === 'settlements' ? 'active' : ''}`}
          onClick={() => setSection('settlements')}
        >
          Known Settlements
        </button>
        <button
          className={`desk-tab ${section === 'civilisations' ? 'active' : ''}`}
          onClick={() => setSection('civilisations')}
        >
          Civilisations
        </button>
      </div>

      {section === 'realm' && <RealmSection />}
      {section === 'settlements' && <KnownSettlementsSection />}
      {section === 'civilisations' && <CivilisationsSection />}
    </div>
  );
}

/* ─── Your Realm ─── */

function RealmSection() {
  const hexes = useStore(s => s.hexes);
  const settlements = useStore(s => s.settlements);
  const armies = useStore(s => s.armies);
  const player = useStore(s => s.player) as Record<string, unknown> | null;
  const setPanToHex = useStore(s => s.setPanToHex);
  const [showTerrain, setShowTerrain] = useState(false);

  const playerId = player?.id as string | undefined;
  const myHexes = (hexes as any[]).filter(h => h.ownerId === playerId);
  const mySettlements = (settlements as any[])
    .filter(s => s.ownerId === playerId)
    .sort((a, b) => {
      // Sort by tier descending, capitals first
      if (a.isCapital !== b.isCapital) return a.isCapital ? -1 : 1;
      return TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier);
    });
  const myArmies = (armies as any[]).filter(a => a.ownerId === playerId);

  function jumpTo(q: number, r: number) {
    setPanToHex({ q, r });
  }

  return (
    <div>
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

      <h3>Settlements</h3>
      {mySettlements.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 8 }}>
          No settlements founded.
        </p>
      ) : (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {mySettlements.map((s: any) => (
            <button
              key={s.id}
              className="settlement-card atlas-jump-card"
              onClick={() => jumpTo(s.hexQ, s.hexR)}
              title="Click to jump to this settlement on the map"
            >
              <div className="settlement-header">
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <strong>{s.name}</strong>
                  {s.isCapital && <span className="capital-badge">Capital</span>}
                </span>
                <span className="settlement-tier" style={{ textTransform: 'capitalize' }}>
                  {TIER_LABELS[s.tier] ?? s.tier}
                </span>
              </div>
              <div className="settlement-stats">
                <span>Pop: {s.population}/{s.popCap}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                  ({s.hexQ}, {s.hexR})
                </span>
                <span className="atlas-jump-hint">→ jump</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <TerrainGuide open={showTerrain} setOpen={setShowTerrain} />
    </div>
  );
}

/* ─── Known Settlements ─── */

function KnownSettlementsSection() {
  const hexes = useStore(s => s.hexes);
  const settlements = useStore(s => s.settlements);
  const players = useStore(s => s.players);
  const player = useStore(s => s.player) as Record<string, unknown> | null;
  const setPanToHex = useStore(s => s.setPanToHex);

  const playerId = player?.id as string | undefined;

  // Hexes with full vision (not undiscovered)
  const visibleHexKeys = new Set(
    (hexes as any[])
      .filter(h => h.fogState !== 'undiscovered')
      .map(h => `${h.q},${h.r}`)
  );

  // Settlements not owned by me that are in visible hexes
  const knownSettlements = (settlements as any[])
    .filter(s => s.ownerId !== playerId && visibleHexKeys.has(`${s.hexQ},${s.hexR}`))
    .sort((a, b) => {
      // Sort by tier descending
      return TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier);
    });

  const playerMap = new Map((players as any[]).map(p => [p.id, p]));

  function jumpTo(q: number, r: number) {
    setPanToHex({ q, r });
  }

  return (
    <div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic', marginBottom: 12 }}>
        Settlements within your scouts' sight.
      </p>

      {knownSettlements.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
          No foreign settlements discovered.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {knownSettlements.map((s: any) => {
            const owner = playerMap.get(s.ownerId);
            return (
              <button
                key={s.id}
                className="settlement-card atlas-jump-card"
                onClick={() => jumpTo(s.hexQ, s.hexR)}
                title="Click to jump to this settlement on the map"
              >
                <div className="settlement-header">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <strong>{s.name}</strong>
                    {s.isCapital && <span className="capital-badge">Capital</span>}
                  </span>
                  <span className="settlement-tier" style={{ textTransform: 'capitalize' }}>
                    {TIER_LABELS[s.tier] ?? s.tier}
                  </span>
                </div>
                <div className="settlement-stats">
                  {owner ? (
                    <span style={{ color: 'var(--text-secondary)' }}>{owner.countryName}</span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>Unclaimed</span>
                  )}
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    ({s.hexQ}, {s.hexR})
                  </span>
                  <span className="atlas-jump-hint">→ jump</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Civilisations ─── */

function CivilisationsSection() {
  const hexes = useStore(s => s.hexes);
  const settlements = useStore(s => s.settlements);
  const players = useStore(s => s.players);
  const player = useStore(s => s.player) as Record<string, unknown> | null;
  const diplomacyRelations = useStore(s => s.diplomacyRelations);
  const setPanToHex = useStore(s => s.setPanToHex);

  const playerId = player?.id as string | undefined;
  const otherPlayers = (players as any[]).filter(p => p.id !== playerId);

  // Compute per-player stats
  const hexesByOwner = new Map<string, number>();
  for (const h of hexes as any[]) {
    if (h.ownerId) hexesByOwner.set(h.ownerId, (hexesByOwner.get(h.ownerId) ?? 0) + 1);
  }
  const settlementsByOwner = new Map<string, any[]>();
  for (const s of settlements as any[]) {
    if (s.ownerId) {
      const list = settlementsByOwner.get(s.ownerId) ?? [];
      list.push(s);
      settlementsByOwner.set(s.ownerId, list);
    }
  }

  // Relation lookup: find relation between me and another player
  function getRelation(otherId: string): string {
    const rel = (diplomacyRelations as any[]).find(
      r => (r.initiatorId === playerId && r.targetId === otherId) ||
           (r.initiatorId === otherId && r.targetId === playerId)
    );
    if (!rel) return 'neutral';
    return rel.type ?? 'neutral';
  }

  function getRelationStyle(rel: string): { color: string; label: string } {
    switch (rel) {
      case 'war': return { color: 'var(--accent-red)', label: 'At War' };
      case 'alliance': return { color: 'var(--accent-green)', label: 'Allied' };
      case 'nap': return { color: 'var(--accent-blue)', label: 'NAP' };
      default: return { color: 'var(--text-muted)', label: 'Neutral' };
    }
  }

  // Jump to a nation's capital
  function jumpToCapital(otherId: string) {
    const capital = (settlements as any[]).find(s => s.ownerId === otherId && s.isCapital)
      ?? (settlements as any[]).find(s => s.ownerId === otherId);
    if (capital) setPanToHex({ q: capital.hexQ, r: capital.hexR });
  }

  if (otherPlayers.length === 0) {
    return (
      <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
        No other civilisations in this game.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {otherPlayers.map((p: any) => {
        const rel = getRelation(p.id);
        const relStyle = getRelationStyle(rel);
        const hexCount = hexesByOwner.get(p.id) ?? 0;
        const theirSettlements = settlementsByOwner.get(p.id) ?? [];
        const capital = theirSettlements.find((s: any) => s.isCapital);
        const hasCapital = !!capital;

        return (
          <div
            key={p.id}
            className="settlement-card"
            style={{
              borderLeft: `3px solid ${p.color ?? 'var(--border-ornate)'}`,
              opacity: p.isEliminated ? 0.5 : 1,
            }}
          >
            <div className="settlement-header">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: p.color ?? 'var(--text-muted)',
                    display: 'inline-block', flexShrink: 0,
                  }}
                />
                <strong>{p.countryName}</strong>
                {p.isEliminated && (
                  <span style={{ fontSize: 11, color: 'var(--accent-red)' }}>Eliminated</span>
                )}
              </span>
              <span style={{ fontSize: 12, color: relStyle.color, fontWeight: 600 }}>
                {relStyle.label}
              </span>
            </div>

            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span>Ruler: <em>{p.rulerName ?? '—'}</em></span>
              <span>{theirSettlements.length} settlements</span>
              <span>{hexCount} hexes</span>
            </div>

            {theirSettlements.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {theirSettlements
                  .sort((a: any, b: any) => {
                    if (a.isCapital !== b.isCapital) return a.isCapital ? -1 : 1;
                    return TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier);
                  })
                  .map((s: any) => (
                    <button
                      key={s.id}
                      className="atlas-civ-settlement"
                      onClick={() => setPanToHex({ q: s.hexQ, r: s.hexR })}
                      title="Click to jump to this settlement"
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {s.isCapital && <span style={{ color: 'var(--accent-gold)', fontSize: 11 }}>★</span>}
                        <span>{s.name}</span>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                          {TIER_LABELS[s.tier] ?? s.tier}
                        </span>
                        <span className="atlas-jump-hint">→ jump</span>
                      </span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Terrain Guide ─── */

function TerrainGuide({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  return (
    <div className="codex-section" style={{ marginTop: 24 }}>
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
                      ? stats.possibleResources.map(formatName).join(', ')
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
