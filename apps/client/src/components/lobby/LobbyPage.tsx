import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

interface LobbyPlayer {
  id: string;
  displayName: string;
  countryName: string;
  rulerName: string;
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

const DEFAULT_COLORS = [
  '#c23616', '#0097e6', '#44bd32', '#e1b12c',
  '#8c7ae6', '#e84393', '#00cec9', '#fd79a8',
];

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
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);

  // Load lobby state
  useEffect(() => {
    if (!slug) return;
    fetchLobby();

    const interval = setInterval(fetchLobby, 3000);
    return () => clearInterval(interval);
  }, [slug]);

  async function fetchLobby() {
    try {
      const res = await fetch(`/api/lobbies/${slug}`, {
        headers: sessionToken ? { 'x-session-token': sessionToken } : {},
      });
      if (!res.ok) { setError('Game not found'); return; }
      const data = await res.json();
      setGame(data.game);
      setPlayers(data.players);
      if (data.myPlayerId) setMyPlayerId(data.myPlayerId);

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
      setMyPlayerId(data.playerId);
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

  async function updatePlayerSettings(updates: Partial<{ countryName: string; rulerName: string; color: string }>) {
    if (!slug || !sessionToken) return;
    await fetch(`/api/lobbies/${slug}/player`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-session-token': sessionToken },
      body: JSON.stringify(updates),
    });
    fetchLobby();
  }

  if (error && !game) {
    return <div className="lobby-page"><div className="lobby-card"><p>{error}</p></div></div>;
  }

  if (!game) {
    return <div className="lobby-page"><div className="lobby-card"><p>Loading...</p></div></div>;
  }

  const me = players.find(p => p.id === myPlayerId);

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
              <span style={{ flex: 1 }}>
                {p.displayName}
                {p.id === game.hostPlayerId && ' (Host)'}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {p.countryName}
              </span>
            </li>
          ))}
        </ul>

        {/* Player customisation — visible when joined */}
        {me && (
          <div className="settlement-card" style={{ marginTop: 12, marginBottom: 16 }}>
            <strong style={{ fontSize: 14 }}>Your Nation</strong>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ fontSize: 13, width: 80 }}>Country:</label>
                <input
                  type="text"
                  className="input"
                  value={me.countryName}
                  onChange={e => {
                    const val = e.target.value;
                    // Optimistic update
                    setPlayers(prev => prev.map(p => p.id === me.id ? { ...p, countryName: val } : p));
                  }}
                  onBlur={e => updatePlayerSettings({ countryName: e.target.value })}
                  style={{ flex: 1, padding: '4px 8px', fontSize: 14 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ fontSize: 13, width: 80 }}>Ruler:</label>
                <input
                  type="text"
                  className="input"
                  value={me.rulerName}
                  onChange={e => {
                    const val = e.target.value;
                    setPlayers(prev => prev.map(p => p.id === me.id ? { ...p, rulerName: val } : p));
                  }}
                  onBlur={e => updatePlayerSettings({ rulerName: e.target.value })}
                  style={{ flex: 1, padding: '4px 8px', fontSize: 14 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ fontSize: 13, width: 80 }}>Color:</label>
                <div style={{ display: 'flex', gap: 4, flex: 1, flexWrap: 'wrap' }}>
                  {DEFAULT_COLORS.map(c => (
                    <button
                      key={c}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: c,
                        border: me.color === c ? '3px solid var(--text-primary)' : '2px solid var(--border-color)',
                        cursor: 'pointer',
                      }}
                      onClick={() => {
                        setPlayers(prev => prev.map(p => p.id === me.id ? { ...p, color: c } : p));
                        updatePlayerSettings({ color: c });
                      }}
                    />
                  ))}
                  <input
                    type="color"
                    value={me.color}
                    onChange={e => {
                      const val = e.target.value;
                      setPlayers(prev => prev.map(p => p.id === me.id ? { ...p, color: val } : p));
                    }}
                    onBlur={e => updatePlayerSettings({ color: e.target.value })}
                    style={{ width: 28, height: 28, padding: 0, border: '2px solid var(--border-color)', borderRadius: '50%', cursor: 'pointer' }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

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
