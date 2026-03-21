import { useStore } from '../../store/index.js';
import { TERRAIN, type TerrainType } from '@kingdoms/shared';

export function CombatLogPanel() {
  const combatLogs = useStore(s => s.combatLogs);
  const armies = useStore(s => s.armies);
  const players = useStore(s => s.players);
  const setBattleViewId = useStore(s => s.setBattleViewId);

  if (combatLogs.length === 0) return null;

  return (
    <div className="combat-log-panel">
      <h3>Recent Battles</h3>
      {combatLogs.map((log: any) => {
        const atkArmy = armies.find((a: any) => a.id === log.attackerArmyId) as any;
        const defArmy = armies.find((a: any) => a.id === log.defenderArmyId) as any;
        const atkPlayer = players.find((p: any) => p.id === atkArmy?.ownerId) as any;
        const defPlayer = players.find((p: any) => p.id === defArmy?.ownerId) as any;
        const isSiege = (log.id as string).startsWith('siege-');
        const atkLost = (log.attackerLosses ?? []).reduce((s: number, l: any) => s + l.startTroops - l.endTroops, 0);
        const defLost = (log.defenderLosses ?? []).reduce((s: number, l: any) => s + l.startTroops - l.endTroops, 0);

        return (
          <div key={log.id} className="settlement-card" style={{ marginTop: 8, cursor: 'pointer' }}
            onClick={() => setBattleViewId(log.id)}>
            <div className="settlement-header">
              <strong>
                {isSiege ? 'Siege: ' : ''}{atkPlayer?.countryName ?? '?'} vs {defPlayer?.countryName ?? '?'}
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
              <span>{log.terrain} · {log.rounds?.length ?? 0} rounds</span>
              <span style={{ color: 'var(--accent-red)' }}>-{atkLost} / -{defLost}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
