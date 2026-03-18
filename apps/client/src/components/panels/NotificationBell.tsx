import { useState } from 'react';
import { useStore } from '../../store/index.js';

const TYPE_ICONS: Record<string, string> = {
  war_declared: 'WAR',
  peace_declared: 'PEACE',
  battle_occurred: 'BATTLE',
  settlement_captured: 'SIEGE',
  player_eliminated: 'DEATH',
  game_over: 'VICTORY',
  winter_roll: 'WINTER',
  rebellion: 'REBEL',
  noble_defection: 'DEFECT',
  stability_change: 'STAB',
  army_attrition: 'ATTRN',
  tech_researched: 'TECH',
  turn_resolved: 'TURN',
  letter_received: 'MAIL',
};

export function NotificationBell() {
  const notifications = useStore(s => s.notifications);
  const markAllNotificationsRead = useStore(s => s.markAllNotificationsRead);
  const markNotificationRead = useStore(s => s.markNotificationRead);
  const [open, setOpen] = useState(false);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="notification-bell-container">
      <button
        className="notification-bell-btn"
        onClick={() => {
          setOpen(!open);
          if (!open && unreadCount > 0) markAllNotificationsRead();
        }}
      >
        <span className="bell-icon">&#x1F514;</span>
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <strong>Notifications</strong>
            <button
              className="btn btn-secondary"
              style={{ fontSize: 11, padding: '2px 8px' }}
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
          {notifications.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: 12 }}>
              No notifications yet
            </p>
          ) : (
            <div className="notification-list">
              {notifications.slice(0, 50).map(n => (
                <div
                  key={n.id}
                  className={`notification-item ${n.isRead ? 'read' : 'unread'}`}
                  onClick={() => !n.isRead && markNotificationRead(n.id)}
                >
                  <span className="notification-type-badge">
                    {TYPE_ICONS[n.type] ?? n.type.slice(0, 4).toUpperCase()}
                  </span>
                  <div className="notification-content">
                    <span className="notification-message">{n.message}</span>
                    {n.turn > 0 && (
                      <span className="notification-turn">Turn {n.turn}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
