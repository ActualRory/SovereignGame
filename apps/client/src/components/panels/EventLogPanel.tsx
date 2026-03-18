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
          {eventLog.map((evt: any, i: number) => (
            <div key={i} className="event-log-entry">
              <span
                className="event-dot"
                style={{ background: EVENT_COLORS[evt.type] ?? 'var(--text-muted)' }}
              />
              <span className="event-description">{evt.description}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
