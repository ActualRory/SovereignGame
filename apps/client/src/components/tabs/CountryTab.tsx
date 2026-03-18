import { useStore } from '../../store/index.js';
import { getTurnLabel, getYear } from '@kingdoms/shared';

export function CountryTab() {
  const game = useStore(s => s.game) as Record<string, unknown> | null;
  const player = useStore(s => s.player) as Record<string, unknown> | null;
  const players = useStore(s => s.players);
  const settlements = useStore(s => s.settlements);

  if (!game || !player) {
    return <div><h2>Country</h2><p>Loading...</p></div>;
  }

  const currentTurn = (game.currentTurn as number) ?? 1;
  const turnLabel = getTurnLabel(currentTurn);
  const year = getYear(currentTurn);

  const mySettlements = settlements.filter(
    (s: any) => s.ownerId === player.id
  );
  const totalPop = mySettlements.reduce(
    (sum: number, s: any) => sum + (s.population ?? 0), 0
  );

  const otherPlayers = players.filter((p: any) => p.id !== player.id);

  return (
    <div className="country-tab">
      <div className="country-header">
        <h2>{player.countryName as string}</h2>
        <p style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>
          Ruled by {player.rulerName as string}
        </p>
      </div>

      <div className="country-stats">
        <div className="stat-grid">
          <div className="stat-box">
            <span className="stat-label">Year {year}</span>
            <span className="stat-detail">{turnLabel}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Population</span>
            <span className="stat-detail">{totalPop.toLocaleString()}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Gold</span>
            <span className="stat-detail">{((player as any).gold ?? 0).toLocaleString()} gp</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Stability</span>
            <span className="stat-detail">{(player as any).stability ?? 100}%</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Tax Rate</span>
            <span className="stat-detail" style={{ textTransform: 'capitalize' }}>
              {(player as any).taxRate ?? 'low'}
            </span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Settlements</span>
            <span className="stat-detail">{mySettlements.length}</span>
          </div>
        </div>
      </div>

      <h3 style={{ marginTop: 24, marginBottom: 8 }}>Other Nations</h3>
      <ul className="nation-list">
        {otherPlayers.map((p: any) => (
          <li key={p.id} className="nation-item">
            <span className="player-color" style={{ background: p.color }} />
            <span className="nation-name">{p.countryName}</span>
            <span className="nation-status">Neutral</span>
          </li>
        ))}
        {otherPlayers.length === 0 && (
          <li className="nation-item" style={{ color: 'var(--text-muted)' }}>
            No other nations discovered
          </li>
        )}
      </ul>
    </div>
  );
}
