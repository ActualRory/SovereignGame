import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../../store/index.js';
import { BottomBar } from './BottomBar.js';
import { TabOverlay } from './TabOverlay.js';
import { MapCanvas } from '../map/MapCanvas.js';

export function GamePage() {
  const { slug } = useParams<{ slug: string }>();
  const setGameState = useStore(s => s.setGameState);

  useEffect(() => {
    if (!slug) return;
    const sessionToken = localStorage.getItem(`session:${slug}`);
    if (!sessionToken) return;

    fetch(`/api/games/${slug}/state`, {
      headers: { 'x-session-token': sessionToken },
    })
      .then(res => res.json())
      .then(data => setGameState(data))
      .catch(console.error);
  }, [slug, setGameState]);

  return (
    <div className="game-layout">
      <div className="game-map-area">
        <MapCanvas />
        <TabOverlay />
      </div>
      <BottomBar />
    </div>
  );
}
