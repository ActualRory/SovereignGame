import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

interface LobbyPlayer {
  id: string;
  displayName: string;
  color: string;
  slotIndex: number;
}

interface LobbyGame {
  id: string;
  slug: string;
  name: string;
  hostPlayerId: string;
  mode: string;
  earlySubmit: boolean;
  preExplored: boolean;
  neutralSettlements: boolean;
  status: string;
}

export function LobbyPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [game, setGame] = useState<LobbyGame | null>(null);
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [joinName, setJoinName] = useState('');
  const [error, setError] = useState('');

  const sessionToken = slug ? localStorage.getItem(`session:${slug}`) : null;
  const isHost = sessionToken && game?.hostPlayerId
    && players.find(p => p.id === game.hostPlayerId);

  // Load lobby state
  useEffect(() => {
    if (!slug) return;
    fetchLobby();

    const interval = setInterval(fetchLobby, 3000);
    return () => clearInterval(interval);
  }, [slug]);

  async function fetchLobby() {
    try {
      const res = await fetch(`/api/lobbies/${slug}`);
      if (!res.ok) { setError('Game not found'); return; }
      const data = await res.json();
      setGame(data.game);
      setPlayers(data.players);

      if (data.game.status === 'active') {
        navigate(`/game/${slug}/play`);
      }
    } catch {
      setError('Failed to load lobby');
    }
  }

  async function joinGame() {
    if (!slug) return;
    try {
      const res = await fetch(`/api/lobbies/${slug}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: joinName || 'Player' }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error);
        return;
      }
      const data = await res.json();
      localStorage.setItem(`session:${slug}`, data.sessionToken);
      fetchLobby();
    } catch {
      setError('Failed to join');
    }
  }

  async function startGame() {
    if (!slug || !sessionToken) return;
    try {
      const res = await fetch(`/api/games/${slug}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionToken }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error);
        return;
      }
      navigate(`/game/${slug}/play`);
    } catch {
      setError('Failed to start game');
    }
  }

  if (error && !game) {
    return <div className="lobby-page"><div className="lobby-card"><p>{error}</p></div></div>;
  }

  if (!game) {
    return <div className="lobby-page"><div className="lobby-card"><p>Loading...</p></div></div>;
  }

  return (
    <div className="lobby-page">
      <div className="lobby-card">
        <h1 className="lobby-title">{game.name}</h1>
        <p className="lobby-slug">Share link: {window.location.href}</p>

        <h3>Players ({players.length}/8)</h3>
        <ul className="lobby-players">
          {players.map(p => (
            <li key={p.id}>
              <span className="player-color" style={{ background: p.color }} />
              {p.displayName}
              {p.id === game.hostPlayerId && ' (Host)'}
            </li>
          ))}
        </ul>

        <div className="lobby-settings">
          <h3>Settings</h3>
          <p>Mode: {game.mode} | Early Submit: {game.earlySubmit ? 'On' : 'Off'}</p>
          <p>Pre-explored: {game.preExplored ? 'On' : 'Off'} | Neutrals: {game.neutralSettlements ? 'On' : 'Off'}</p>
        </div>

        {error && <p style={{ color: 'var(--accent-red)' }}>{error}</p>}

        <div className="lobby-actions">
          {!sessionToken && (
            <>
              <input
                type="text"
                placeholder="Your name"
                value={joinName}
                onChange={e => setJoinName(e.target.value)}
                className="input"
                style={{ flex: 1 }}
              />
              <button onClick={joinGame} className="btn btn-primary">Join</button>
            </>
          )}

          {isHost && (
            <button onClick={startGame} className="btn btn-primary" style={{ width: '100%' }}>
              Start Game
            </button>
          )}

          {sessionToken && !isHost && (
            <p style={{ color: 'var(--text-muted)' }}>Waiting for host to start...</p>
          )}
        </div>
      </div>
    </div>
  );
}
