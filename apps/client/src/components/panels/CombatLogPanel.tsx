import { useState } from 'react';
import { useStore } from '../../store/index.js';
import { TERRAIN, type TerrainType } from '@kingdoms/shared';

export function CombatLogPanel() {
  const combatLogs = useStore(s => s.combatLogs);
  const armies = useStore(s => s.armies);
  const players = useStore(s => s.players);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (combatLogs.length === 0) return null;

  return (
    <div className="combat-log-panel">
      <h3>Recent Battles</h3>
      {combatLogs.map((log: any) => {
        const atkArmy = armies.find((a: any) => a.id === log.attackerArmyId) as any;
        const defArmy = armies.find((a: any) => a.id === log.defenderArmyId) as any;
        const atkPlayer = players.find((p: any) => p.id === atkArmy?.ownerId) as any;
        const defPlayer = players.find((p: any) => p.id === defArmy?.ownerId) as any;
        const isExpanded = expandedId === log.id;

        return (
          <div key={log.id} className="settlement-card" style={{ marginTop: 8, cursor: 'pointer' }}
            onClick={() => setExpandedId(isExpanded ? null : log.id)}>
            <div className="settlement-header">
              <strong>
                {atkPlayer?.countryName ?? '?'} vs {defPlayer?.countryName ?? '?'}
              </strong>
              <span style={{
                fontSize: 12,
                color: log.winner === 'attacker' ? 'var(--accent-green, #4a4)' :
                  log.winner === 'defender' ? 'var(--accent-red, #a44)' : 'var(--text-muted)',
                fontWeight: 'bold',
              }}>
                {log.winner === 'attacker' ? `${atkPlayer?.countryName ?? 'Attacker'} wins` :
                  log.winner === 'defender' ? `${defPlayer?.countryName ?? 'Defender'} wins` : 'Draw'}
              </span>
            </div>
            <div className="settlement-stats">
              <span>Terrain: {log.terrain}</span>
              <span>{log.rounds?.length ?? 0} rounds</span>
              {log.riverCrossing && <span style={{ color: 'var(--accent-blue)' }}>River crossing</span>}
            </div>
            {/* Terrain and command bonuses */}
            {(() => {
              const terrainDef = TERRAIN[log.terrain as TerrainType];
              const defBonus = terrainDef?.defenceBonus ?? 0;
              const width = terrainDef?.frontlineWidth;
              const bonuses: string[] = [];
              if (defBonus > 0) bonuses.push(`+${defBonus} terrain def`);
              if (log.riverCrossing) bonuses.push('+1 river def');
              if (log.attackerCommandBonus) bonuses.push(`+${log.attackerCommandBonus} atk cmd`);
              if (log.defenderCommandBonus) bonuses.push(`+${log.defenderCommandBonus} def cmd`);
              if (width) bonuses.push(`Width: ${log.riverCrossing ? 4 : width}`);
              return bonuses.length > 0 ? (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {bonuses.join(' · ')}
                </div>
              ) : null;
            })()}

            {isExpanded && (
              <div style={{ marginTop: 8 }}>
                {/* Loss summaries */}
                <div style={{ fontSize: 12 }}>
                  <strong>Attacker losses:</strong>
                  {(log.attackerLosses ?? []).map((loss: any) => (
                    <div key={loss.unitId} style={{ marginLeft: 8, color: loss.destroyed ? 'var(--accent-red, #a44)' : 'var(--text-muted)' }}>
                      {formatName(loss.unitType)}: {loss.startStrength}% → {Math.round(loss.endStrength)}%
                      {loss.destroyed && ' (destroyed)'}
                      {loss.veterancyGained > 0 && ` +${loss.veterancyGained} vet`}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  <strong>Defender losses:</strong>
                  {(log.defenderLosses ?? []).map((loss: any) => (
                    <div key={loss.unitId} style={{ marginLeft: 8, color: loss.destroyed ? 'var(--accent-red, #a44)' : 'var(--text-muted)' }}>
                      {formatName(loss.unitType)}: {loss.startStrength}% → {Math.round(loss.endStrength)}%
                      {loss.destroyed && ' (destroyed)'}
                      {loss.veterancyGained > 0 && ` +${loss.veterancyGained} vet`}
                    </div>
                  ))}
                </div>

                {/* Round-by-round */}
                <details style={{ marginTop: 8, fontSize: 11 }}>
                  <summary style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>
                    Round-by-round detail
                  </summary>
                  {(log.rounds ?? []).map((round: any) => (
                    <div key={round.roundNumber} style={{ marginTop: 6, borderLeft: '2px solid var(--border-color, #555)', paddingLeft: 8 }}>
                      <strong>Round {round.roundNumber}</strong>
                      {round.firePhase?.length > 0 && (
                        <div>
                          <em>Fire:</em>{' '}
                          {round.firePhase.map((r: any) => (
                            <span key={r.unitId} className="resource-tag" style={{ fontSize: 10, margin: 1 }}>
                              {formatName(r.unitType)} {r.dice?.length}d20→{r.successes} hits ({r.netHits} net)
                            </span>
                          ))}
                        </div>
                      )}
                      {round.shockPhase?.length > 0 && (
                        <div>
                          <em>Shock:</em>{' '}
                          {round.shockPhase.map((r: any) => (
                            <span key={r.unitId} className="resource-tag" style={{ fontSize: 10, margin: 1 }}>
                              {formatName(r.unitType)} {r.dice?.length}d20→{r.successes} hits ({r.netHits} net)
                            </span>
                          ))}
                        </div>
                      )}
                      {round.casualties?.length > 0 && (
                        <div style={{ color: 'var(--accent-red, #a44)' }}>
                          Casualties: {round.casualties.map((c: any) =>
                            `${c.side} unit -${c.damageDealt}% → ${c.newState}`
                          ).join(', ')}
                        </div>
                      )}
                      {round.moraleChecks?.length > 0 && (
                        <div>
                          Morale: {round.moraleChecks.map((m: any) =>
                            `${m.side} rolled ${m.roll}/${m.threshold} ${m.passed ? '✓' : '✗'}`
                          ).join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </details>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatName(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
