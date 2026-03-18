// ─── Notifications & Events ───

export type NotificationType =
  | 'letter_received'
  | 'war_declared'
  | 'peace_declared'
  | 'alliance_formed'
  | 'alliance_broken'
  | 'settlement_captured'
  | 'settlement_razed'
  | 'battle_occurred'
  | 'tech_researched'
  | 'turn_ending_soon'
  | 'turn_resolved'
  | 'player_submitted'
  | 'player_eliminated'
  | 'game_over';

export interface Notification {
  id: string;
  type: NotificationType;
  turn: number;
  message: string;
  data?: Record<string, unknown>;
  isRead: boolean;
}

export interface EventLogEntry {
  turn: number;
  type: string;
  description: string;
  affectedPlayerIds: string[];
  data?: Record<string, unknown>;
}
