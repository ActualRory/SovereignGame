import { useStore } from '../../store/index.js';

export function GameOverOverlay() {
  const game = useStore(s => s.game) as Record<string, unknown> | null;
  const player = useStore(s => s.player) as Record<string, unknown> | null;
  const players = useStore(s => s.players);

  if (!game || game.status !== 'finished') return null;

  // Find the winner (the non-eliminated player)
  const winner = players.find((p: any) => !p.isEliminated) as any;
  const isWinner = winner?.id === player?.id;

  return (
    <div className="game-over-overlay">
      <div className="game-over-card">
        <h1 className="game-over-title">
          {isWinner ? 'Victory!' : 'Defeat'}
        </h1>

        {winner && (
          <div className="game-over-winner">
            <span
              className="player-color"
              style={{
                display: 'inline-block',
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: winner.color,
                marginRight: 8,
                verticalAlign: 'middle',
              }}
            />
            <strong>{winner.countryName}</strong>
            <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
              ruled by {winner.rulerName}
            </span>
          </div>
        )}

        <p className="game-over-subtitle">
          {isWinner
            ? 'Your realm stands as the last nation. Long may you reign!'
            : winner
              ? `${winner.countryName} has conquered all rivals.`
              : 'The game has ended.'}
        </p>

        <div className="game-over-stats">
          <h3>Final Standings</h3>
          <ul className="nation-list">
            {players.map((p: any) => (
              <li key={p.id} className="nation-item">
                <span className="player-color" style={{ background: p.color }} />
                <span className="nation-name">{p.countryName}</span>
                <span className="nation-status" style={{
                  color: p.isEliminated ? 'var(--accent-red)' : 'var(--accent-green)',
                }}>
                  {p.isEliminated ? 'Eliminated' : 'Victor'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
