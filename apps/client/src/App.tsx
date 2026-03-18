import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function App() {
  const [gameName, setGameName] = useState('');
  const [playerName, setPlayerName] = useState('');
  const navigate = useNavigate();

  async function createGame() {
    const res = await fetch('/api/lobbies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: gameName || 'New Game',
        displayName: playerName || 'Player 1',
      }),
    });
    const data = await res.json();
    localStorage.setItem(`session:${data.game.slug}`, data.sessionToken);
    navigate(`/game/${data.game.slug}`);
  }

  return (
    <div className="home-page">
      <div className="home-card">
        <h1 className="home-title">Sovereigns</h1>
        <p className="home-subtitle">A game of conquest and diplomacy</p>

        <div className="home-form">
          <input
            type="text"
            placeholder="Your name"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            className="input"
          />
          <input
            type="text"
            placeholder="Game name"
            value={gameName}
            onChange={e => setGameName(e.target.value)}
            className="input"
          />
          <button onClick={createGame} className="btn btn-primary">
            Create Game
          </button>
        </div>
      </div>
    </div>
  );
}
