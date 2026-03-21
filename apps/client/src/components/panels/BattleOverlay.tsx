import { useStore } from '../../store/index.js';
import { TERRAIN, type TerrainType } from '@kingdoms/shared';

/**
 * EU4/HOI4-style battle result overlay.
 * Two-column layout: attacker (left) vs defender (right),
 * with terrain/modifiers in the center strip.
 */
export function BattleOverlay() {
  const battleViewId = useStore(s => s.battleViewId);
  const setBattleViewId = useStore(s => s.setBattleViewId);
  const combatLogs = useStore(s => s.combatLogs);
  const armies = useStore(s => s.armies);
  const players = useStore(s => s.players);

  if (!battleViewId) return null;

  const log = combatLogs.find((l: any) => l.id === battleViewId) as any;
  if (!log) return null;

  const atkArmy = armies.find((a: any) => a.id === log.attackerArmyId) as any;
  const defArmy = armies.find((a: any) => a.id === log.defenderArmyId) as any;
  const atkPlayer = players.find((p: any) => p.id === atkArmy?.ownerId) as any;
  const defPlayer = players.find((p: any) => p.id === defArmy?.ownerId) as any;

  const terrainDef = TERRAIN[log.terrain as TerrainType];
  const defBonus = terrainDef?.defenceBonus ?? 0;
  const width = log.riverCrossing ? 4 : (terrainDef?.frontlineWidth ?? 10);
  const isSiege = (log.id as string).startsWith('siege-');

  // Compute total casualties per side
  const atkTotalStart = (log.attackerLosses ?? []).reduce((s: number, l: any) => s + l.startTroops, 0);
  const atkTotalEnd = (log.attackerLosses ?? []).reduce((s: number, l: any) => s + l.endTroops, 0);
  const defTotalStart = (log.defenderLosses ?? []).reduce((s: number, l: any) => s + l.startTroops, 0);
  const defTotalEnd = (log.defenderLosses ?? []).reduce((s: number, l: any) => s + l.endTroops, 0);

  const atkColor = atkPlayer?.color ? `#${Number(atkPlayer.color).toString(16).padStart(6, '0')}` : '#888';
  const defColor = defPlayer?.color ? `#${Number(defPlayer.color).toString(16).padStart(6, '0')}` : '#888';

  return (
    <div className="battle-overlay-backdrop" onClick={() => setBattleViewId(null)}>
      <div className="battle-overlay" onClick={e => e.stopPropagation()}>
        {/* Title banner */}
        <div className="battle-title">
          {isSiege ? 'Siege Assault' : 'Battle'} — {log.terrain?.replace(/_/g, ' ')}
        </div>

        {/* Winner banner */}
        <div className={`battle-winner ${log.winner}`}>
          {log.winner === 'attacker'
            ? `${atkPlayer?.countryName ?? 'Attacker'} Victorious`
            : log.winner === 'defender'
            ? `${defPlayer?.countryName ?? 'Defender'} Victorious`
            : 'Draw — Both Sides Withdraw'}
        </div>

        {/* Two-column layout */}
        <div className="battle-columns">
          {/* Attacker side */}
          <div className="battle-side battle-attacker">
            <div className="battle-side-header" style={{ borderColor: atkColor }}>
              <div className="battle-side-swatch" style={{ background: atkColor }} />
              <div>
                <div className="battle-side-name">{atkPlayer?.countryName ?? 'Attacker'}</div>
                <div className="battle-side-role">Attacker</div>
              </div>
            </div>

            {log.attackerCommandBonus > 0 && (
              <div className="battle-modifier">General: +{log.attackerCommandBonus} command</div>
            )}

            <div className="battle-troops-summary">
              <span className="battle-troops-label">Troops:</span>
              <span>{atkTotalStart}</span>
              <span className="battle-arrow">→</span>
              <span className={atkTotalEnd < atkTotalStart ? 'battle-loss' : ''}>{atkTotalEnd}</span>
              <span className="battle-casualties">(-{atkTotalStart - atkTotalEnd})</span>
            </div>

            <div className="battle-unit-list">
              {(log.attackerLosses ?? []).map((loss: any) => (
                <UnitRow key={loss.unitId} loss={loss} />
              ))}
            </div>
          </div>

          {/* Center strip — modifiers */}
          <div className="battle-center">
            <div className="battle-center-stat">
              <span className="battle-center-label">Terrain</span>
              <span>{log.terrain}</span>
            </div>
            {defBonus > 0 && (
              <div className="battle-center-stat">
                <span className="battle-center-label">Def bonus</span>
                <span>+{defBonus}</span>
              </div>
            )}
            {log.riverCrossing && (
              <div className="battle-center-stat">
                <span className="battle-center-label">River</span>
                <span>+1 def</span>
              </div>
            )}
            {isSiege && (
              <div className="battle-center-stat">
                <span className="battle-center-label">Siege</span>
                <span>+2 def</span>
              </div>
            )}
            <div className="battle-center-stat">
              <span className="battle-center-label">Width</span>
              <span>{width}</span>
            </div>
            <div className="battle-center-stat">
              <span className="battle-center-label">Rounds</span>
              <span>{log.rounds?.length ?? 0}</span>
            </div>
          </div>

          {/* Defender side */}
          <div className="battle-side battle-defender">
            <div className="battle-side-header" style={{ borderColor: defColor }}>
              <div className="battle-side-swatch" style={{ background: defColor }} />
              <div>
                <div className="battle-side-name">{defPlayer?.countryName ?? 'Defender'}</div>
                <div className="battle-side-role">{isSiege ? 'Garrison' : 'Defender'}</div>
              </div>
            </div>

            {log.defenderCommandBonus > 0 && (
              <div className="battle-modifier">General: +{log.defenderCommandBonus} command</div>
            )}

            <div className="battle-troops-summary">
              <span className="battle-troops-label">Troops:</span>
              <span>{defTotalStart}</span>
              <span className="battle-arrow">→</span>
              <span className={defTotalEnd < defTotalStart ? 'battle-loss' : ''}>{defTotalEnd}</span>
              <span className="battle-casualties">(-{defTotalStart - defTotalEnd})</span>
            </div>

            <div className="battle-unit-list">
              {(log.defenderLosses ?? []).map((loss: any) => (
                <UnitRow key={loss.unitId} loss={loss} />
              ))}
            </div>
          </div>
        </div>

        {/* Round-by-round expandable */}
        <details className="battle-rounds">
          <summary>Round-by-round detail</summary>
          {(log.rounds ?? []).map((round: any) => (
            <div key={round.roundNumber} className="battle-round">
              <div className="battle-round-header">Round {round.roundNumber}</div>
              {round.firePhase?.length > 0 && (
                <div className="battle-phase">
                  <em>Fire phase:</em>
                  {round.firePhase.map((r: any, i: number) => (
                    <span key={i} className="battle-roll">
                      {r.unitName ?? 'Unit'}: {r.dice?.length}d20 → {r.successes} hits ({r.netHits} net)
                    </span>
                  ))}
                </div>
              )}
              {round.shockPhase?.length > 0 && (
                <div className="battle-phase">
                  <em>Shock phase:</em>
                  {round.shockPhase.map((r: any, i: number) => (
                    <span key={i} className="battle-roll">
                      {r.unitName ?? 'Unit'}: {r.dice?.length}d20 → {r.successes} hits ({r.netHits} net)
                    </span>
                  ))}
                </div>
              )}
              {round.casualties?.length > 0 && (
                <div className="battle-phase battle-phase-casualties">
                  {round.casualties.map((c: any, i: number) => (
                    <span key={i}>
                      {c.side}: -{c.troopsLost} troops → {c.newState}
                    </span>
                  ))}
                </div>
              )}
              {round.moraleChecks?.length > 0 && (
                <div className="battle-phase">
                  {round.moraleChecks.map((m: any, i: number) => (
                    <span key={i} className={m.passed ? '' : 'battle-loss'}>
                      {m.side} morale: {m.roll}/{m.threshold} {m.passed ? 'held' : 'broke'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </details>

        <button className="battle-close" onClick={() => setBattleViewId(null)}>
          Close
        </button>
      </div>
    </div>
  );
}

function UnitRow({ loss }: { loss: any }) {
  const pct = loss.startTroops > 0 ? (loss.endTroops / loss.startTroops) * 100 : 0;
  const barColor = loss.destroyed ? 'var(--accent-red)' : pct < 50 ? '#C07030' : 'var(--accent-green)';

  return (
    <div className={`battle-unit ${loss.destroyed ? 'battle-unit-destroyed' : ''}`}>
      <div className="battle-unit-name">{loss.unitName ?? 'Unit'}</div>
      <div className="battle-unit-bar-track">
        <div className="battle-unit-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
      </div>
      <div className="battle-unit-troops">
        {loss.endTroops}/{loss.startTroops}
        {loss.destroyed && <span className="battle-destroyed-tag">DESTROYED</span>}
      </div>
      {loss.xpGained > 0 && (
        <div className="battle-unit-xp">+{loss.xpGained} xp</div>
      )}
    </div>
  );
}
