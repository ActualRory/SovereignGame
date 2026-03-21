import { useStore } from '../../store/index.js';

/**
 * Panel showing active sieges — settlements currently under siege
 * with progress bars, garrison info, and besieging army details.
 * Inspired by EU4's siege interface.
 */
export function SiegePanel() {
  const settlements = useStore(s => s.settlements);
  const armies = useStore(s => s.armies);
  const players = useStore(s => s.players);
  const player = useStore(s => s.player) as Record<string, unknown> | null;
  const setPanToHex = useStore(s => s.setPanToHex);
  const setSelectedHex = useStore(s => s.setSelectedHex);
  const pendingOrders = useStore(s => s.pendingOrders);

  const playerId = player?.id as string | undefined;

  // Find settlements under siege (siegeProgress > 0) that are relevant to the player
  const activeSieges = settlements.filter((s: any) => {
    if (s.siegeProgress == null || s.siegeProgress <= 0) return false;
    // Show if we own the settlement (being besieged) or we have armies there (besieging)
    if (s.ownerId === playerId) return true;
    const ourArmiesHere = armies.some((a: any) =>
      a.ownerId === playerId && a.hexQ === s.hexQ && a.hexR === s.hexR
    );
    return ourArmiesHere;
  });

  if (activeSieges.length === 0) return null;

  return (
    <div className="siege-panel">
      <h3>Active Sieges</h3>
      {activeSieges.map((settlement: any) => {
        const owner = players.find((p: any) => p.id === settlement.ownerId) as any;
        const besiegingArmies = armies.filter((a: any) =>
          a.hexQ === settlement.hexQ && a.hexR === settlement.hexR
          && a.ownerId !== settlement.ownerId
        );
        const garrisonArmies = armies.filter((a: any) =>
          a.hexQ === settlement.hexQ && a.hexR === settlement.hexR
          && a.ownerId === settlement.ownerId
        );

        const besiegerPlayer = besiegingArmies.length > 0
          ? players.find((p: any) => p.id === (besiegingArmies[0] as any).ownerId) as any
          : null;

        const weAreDefender = settlement.ownerId === playerId;
        const weAreAttacker = besiegingArmies.some((a: any) => a.ownerId === playerId);

        const hasAssaultOrder = pendingOrders.siegeAssaults.some(sa =>
          sa.targetHexQ === settlement.hexQ && sa.targetHexR === settlement.hexR
        );

        const progress = settlement.siegeProgress ?? 0;

        // Estimate turns to fall based on tier rates
        const SIEGE_RATE: Record<string, number> = {
          hamlet: 34, village: 25, town: 17, city: 10, metropolis: 6,
        };
        const rate = SIEGE_RATE[settlement.tier] ?? 20;
        const remaining = Math.max(0, 100 - progress);
        const turnsLeft = rate > 0 ? Math.ceil(remaining / rate) : '?';

        return (
          <div
            key={settlement.id}
            className="siege-entry"
            style={{
              cursor: 'pointer',
              borderLeftColor: weAreDefender ? 'var(--accent-red)' : 'var(--accent-gold)',
            }}
            onClick={() => {
              setPanToHex({ q: settlement.hexQ, r: settlement.hexR });
              setSelectedHex({ q: settlement.hexQ, r: settlement.hexR });
            }}
          >
            <div className="siege-entry-header">
              <span className="siege-settlement-name">{settlement.name}</span>
              <span className="siege-tier">{settlement.tier}</span>
            </div>

            <div className="siege-progress-track">
              <div className="siege-progress-fill" style={{ width: `${progress}%` }} />
            </div>

            <div className="siege-detail">
              <span>{progress}%</span>
              <span>~{turnsLeft} turns</span>
            </div>

            <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-secondary)' }}>
              {weAreDefender ? (
                <>
                  <span style={{ color: 'var(--accent-red)' }}>
                    Besieged by {besiegerPlayer?.countryName ?? '?'}
                  </span>
                  {garrisonArmies.length > 0 && (
                    <span> · Garrison present</span>
                  )}
                </>
              ) : (
                <>
                  <span>Besieging {owner?.countryName ?? '?'}</span>
                  {garrisonArmies.length > 0 && (
                    <span style={{ color: 'var(--accent-red)' }}> · Garrisoned</span>
                  )}
                </>
              )}
            </div>

            {hasAssaultOrder && (
              <div style={{
                fontSize: 11,
                marginTop: 4,
                color: 'var(--accent-gold)',
                fontWeight: 'bold',
              }}>
                Assault ordered this turn
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
