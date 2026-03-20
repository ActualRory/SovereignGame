import { useStore } from '../../store/index.js';

/**
 * Banner shown when the player is selecting a movement destination on the map.
 * Displays the army name and a cancel button.
 */
export function MoveTargetBanner() {
  const isSelecting = useStore(s => s.isSelectingMoveTarget);
  const selectedArmyId = useStore(s => s.selectedArmyId);
  const armies = useStore(s => s.armies);
  const setIsSelectingMoveTarget = useStore(s => s.setIsSelectingMoveTarget);

  if (!isSelecting || !selectedArmyId) return null;

  const army = armies.find((a: any) => a.id === selectedArmyId) as any;
  const armyName = army?.name ?? 'Army';

  return (
    <div className="move-target-banner">
      <span className="move-target-banner-text">
        Select a destination for <strong>{armyName}</strong>
      </span>
      <button
        className="btn btn-secondary move-target-cancel"
        onClick={() => setIsSelectingMoveTarget(false)}
      >
        Cancel
      </button>
    </div>
  );
}
