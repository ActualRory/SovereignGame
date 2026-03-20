import { useState } from 'react';
import { useStore } from '../../store/index.js';

const EVENT_COLORS: Record<string, string> = {
  war_declared: 'var(--accent-red)',
  peace_declared: 'var(--accent-green)',
  battle_occurred: 'var(--accent-red)',
  settlement_captured: 'var(--accent-red)',
  player_eliminated: 'var(--accent-red)',
  game_over: 'var(--accent-gold)',
  winter_roll: 'var(--accent-blue)',
  rebellion: 'var(--accent-red)',
  noble_defection: 'var(--accent-red)',
  stability_change: 'var(--text-secondary)',
  army_attrition: 'var(--text-muted)',
  tech_researched: 'var(--accent-blue)',
  construction_complete: 'var(--accent-green)',
  recruitment_complete: 'var(--accent-green)',
};

export function EventLogPanel() {
  const eventLog = useStore(s => s.eventLog);
  const [expanded, setExpanded] = useState(false);

  if (eventLog.length === 0) return null;

  // Group events by turn
  const grouped = new Map<number, any[]>();
  for (const evt of eventLog as any[]) {
    const turn = evt.turn ?? 0;
    if (!grouped.has(turn)) grouped.set(turn, []);
    grouped.get(turn)!.push(evt);
  }
  // Sort turns descending (most recent first)
  const sortedTurns = [...grouped.keys()].sort((a, b) => b - a);

  return (
    <div className="event-log-panel">
      <div
        className="event-log-header"
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: 'pointer' }}
      >
        <h3>Event Log ({eventLog.length})</h3>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {expanded ? 'collapse' : 'expand'}
        </span>
      </div>

      {expanded && (
        <div className="event-log-list">
          {sortedTurns.map(turn => (
            <div key={turn}>
              {turn > 0 && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 8, marginBottom: 4, borderBottom: '1px solid var(--border-color)', paddingBottom: 2 }}>
                  Turn {turn}
                </div>
              )}
              {grouped.get(turn)!.map((evt: any, i: number) => (
                <div key={`${turn}-${i}`} className="event-log-entry">
                  <span
                    className="event-dot"
                    style={{ background: EVENT_COLORS[evt.type] ?? 'var(--text-muted)' }}
                  />
                  <span className="event-description">{evt.description}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
