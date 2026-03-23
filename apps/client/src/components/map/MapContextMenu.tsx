import { useEffect, useRef } from 'react';
import { useStore } from '../../store/index.js';

/**
 * Context menu that appears on right-clicking the hex map.
 * Shows hex examine, army examine, and contextual orders.
 */
export function MapContextMenu() {
  const menu = useStore(s => s.mapContextMenu);
  const close = useStore(s => s.setMapContextMenu);
  const player = useStore(s => s.player) as Record<string, unknown> | null;
  const hexes = useStore(s => s.hexes);
  const armies = useStore(s => s.armies);
  const settlements = useStore(s => s.settlements);
  const selectedArmyId = useStore(s => s.selectedArmyId);
  const setSelectedArmyId = useStore(s => s.setSelectedArmyId);
  const setDetailPanelHex = useStore(s => s.setDetailPanelHex);
  const setDetailPanelArmyId = useStore(s => s.setDetailPanelArmyId);
  const setIsSelectingMoveTarget = useStore(s => s.setIsSelectingMoveTarget);
  const setSelectedHex = useStore(s => s.setSelectedHex);
  const addSiegeAssault = useStore(s => s.addSiegeAssault);
  const removeSiegeAssault = useStore(s => s.removeSiegeAssault);
  const pendingOrders = useStore(s => s.pendingOrders);
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

  // All armies on this hex (own + foreign visible ones)
  const armiesHere = armies.filter((a: any) => a.hexQ === menu.hex.q && a.hexR === menu.hex.r);
  const myArmiesHere = playerId
    ? armiesHere.filter((a: any) => a.ownerId === playerId)
    : [];

  // Currently selected army (may not be on this hex)
  const selectedArmy = selectedArmyId
    ? armies.find((a: any) => a.id === selectedArmyId) as any
    : null;
  const hasSelectedArmy = selectedArmy && selectedArmy.ownerId === playerId;

  const hexLabel = hex?.customName
    ? `${hex.customName} (${menu.hex.q}, ${menu.hex.r})`
    : `Hex (${menu.hex.q}, ${menu.hex.r})`;

  // Position menu on screen
  const style: React.CSSProperties = {
    left: Math.min(menu.x, window.innerWidth - 220),
    top: Math.min(menu.y, window.innerHeight - 300),
  };

  return (
    <div className="map-context-menu" ref={ref} style={style}>
      {/* ── Hex row ── */}
      <button
        className="map-context-item map-context-item-examine"
        onClick={() => {
          setDetailPanelHex(menu.hex);
          setSelectedHex(menu.hex);
          close(null);
        }}
      >
        <span className="map-context-item-label">{hexLabel}</span>
        <span className="map-context-examine-tag">Examine</span>
      </button>

      {/* ── Armies on this hex ── */}
      {armiesHere.length > 0 && (
        <>
          <div className="map-context-divider" />
          {armiesHere.map((a: any) => {
            const isOwn = a.ownerId === playerId;
            const unitCount = a.units?.filter((u: any) => u.state !== 'destroyed').length ?? a.unitCount ?? 0;
            return (
              <button
                key={a.id}
                className={`map-context-item map-context-item-examine ${selectedArmyId === a.id ? 'map-context-item-active' : ''}`}
                onClick={() => {
                  if (isOwn) {
                    setSelectedArmyId(a.id);
                    setSelectedHex(menu.hex);
                  }
                  setDetailPanelArmyId(a.id);
                  close(null);
                }}
              >
                <span className="map-context-item-label">
                  {a.name}
                  <span className="map-context-item-detail">{unitCount} units</span>
                </span>
                <span className="map-context-examine-tag">Examine</span>
              </button>
            );
          })}
        </>
      )}

      {/* ── Orders — only if an army is selected ── */}
      {hasSelectedArmy && (() => {
        const armyOnThisHex = selectedArmy.hexQ === menu.hex.q && selectedArmy.hexR === menu.hex.r;
        const enemySettlement = settlements.find((s: any) =>
          s.hexQ === menu.hex.q && s.hexR === menu.hex.r && s.ownerId !== playerId
        );
        const canSiege = armyOnThisHex && enemySettlement;
        const hasSiegeOrder = pendingOrders.siegeAssaults.some(sa => sa.armyId === selectedArmyId);

        return (
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

            {canSiege && (
              <button
                className={`map-context-item ${hasSiegeOrder ? 'map-context-item-active' : ''}`}
                onClick={() => {
                  if (hasSiegeOrder) {
                    removeSiegeAssault(selectedArmyId!);
                  } else {
                    addSiegeAssault(selectedArmyId!, menu.hex.q, menu.hex.r);
                  }
                  close(null);
                }}
              >
                {hasSiegeOrder ? 'Cancel Siege' : 'Siege'}
                <span className="map-context-item-detail">{(enemySettlement as any).name}</span>
              </button>
            )}
          </>
        );
      })()}

    </div>
  );
}
