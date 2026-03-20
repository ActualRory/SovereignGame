import { useEffect, useRef } from 'react';
import { useStore } from '../../store/index.js';

/**
 * Context menu that appears on right-clicking the hex map.
 * Shows contextual options: Details, Orders → Move, Name Hex, etc.
 */
export function MapContextMenu() {
  const menu = useStore(s => s.mapContextMenu);
  const close = useStore(s => s.setMapContextMenu);
  const player = useStore(s => s.player) as Record<string, unknown> | null;
  const hexes = useStore(s => s.hexes);
  const armies = useStore(s => s.armies);
  const selectedArmyId = useStore(s => s.selectedArmyId);
  const setSelectedArmyId = useStore(s => s.setSelectedArmyId);
  const setDetailPanelHex = useStore(s => s.setDetailPanelHex);
  const setIsSelectingMoveTarget = useStore(s => s.setIsSelectingMoveTarget);
  const setSelectedHex = useStore(s => s.setSelectedHex);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close(null);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close(null);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menu, close]);

  if (!menu) return null;

  const hex = hexes.find((h: any) => h.q === menu.hex.q && h.r === menu.hex.r) as any;
  const playerId = player?.id as string | undefined;

  // Armies on this hex belonging to the player
  const myArmiesHere = playerId
    ? armies.filter((a: any) => a.ownerId === playerId && a.hexQ === menu.hex.q && a.hexR === menu.hex.r)
    : [];

  // Currently selected army (may not be on this hex)
  const selectedArmy = selectedArmyId
    ? armies.find((a: any) => a.id === selectedArmyId) as any
    : null;
  const hasSelectedArmy = selectedArmy && selectedArmy.ownerId === playerId;

  const isOwnHex = hex?.ownerId === playerId;
  const hexLabel = hex?.customName || `Hex (${menu.hex.q}, ${menu.hex.r})`;

  // Position menu on screen
  const style: React.CSSProperties = {
    left: Math.min(menu.x, window.innerWidth - 220),
    top: Math.min(menu.y, window.innerHeight - 300),
  };

  return (
    <div className="map-context-menu" ref={ref} style={style}>
      <div className="map-context-header">{hexLabel}</div>

      {/* Details */}
      <button
        className="map-context-item"
        onClick={() => {
          setDetailPanelHex(menu.hex);
          setSelectedHex(menu.hex);
          close(null);
        }}
      >
        Details
      </button>

      {/* Select armies on this hex */}
      {myArmiesHere.length > 0 && (
        <>
          <div className="map-context-divider" />
          <div className="map-context-label">Select Army</div>
          {myArmiesHere.map((a: any) => (
            <button
              key={a.id}
              className={`map-context-item ${selectedArmyId === a.id ? 'map-context-item-active' : ''}`}
              onClick={() => {
                setSelectedArmyId(a.id);
                setSelectedHex(menu.hex);
                close(null);
              }}
            >
              {a.name}
              <span className="map-context-item-detail">
                {a.units?.filter((u: any) => u.state !== 'destroyed').length ?? a.unitCount ?? 0} units
              </span>
            </button>
          ))}
        </>
      )}

      {/* Orders submenu — only if an army is selected */}
      {hasSelectedArmy && (
        <>
          <div className="map-context-divider" />
          <div className="map-context-label">Orders — {selectedArmy.name}</div>
          <button
            className="map-context-item"
            onClick={() => {
              setIsSelectingMoveTarget(true);
              close(null);
            }}
          >
            Move
            <span className="map-context-item-detail">Click destination</span>
          </button>
        </>
      )}

      {/* Name hex — only if you own it */}
      {isOwnHex && (
        <>
          <div className="map-context-divider" />
          <button
            className="map-context-item"
            onClick={() => {
              setDetailPanelHex(menu.hex);
              setSelectedHex(menu.hex);
              close(null);
              // The detail panel will allow naming
            }}
          >
            Name this land
          </button>
        </>
      )}
    </div>
  );
}
