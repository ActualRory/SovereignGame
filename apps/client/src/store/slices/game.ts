import type { StateCreator } from 'zustand';

export interface GameNotification {
  id: string;
  type: string;
  turn: number;
  message: string;
  data?: Record<string, unknown>;
  isRead: boolean;
}

export interface GameState {
  game: Record<string, unknown> | null;
  player: Record<string, unknown> | null;
  players: Record<string, unknown>[];
  hexes: Record<string, unknown>[];
  settlements: Record<string, unknown>[];
  armies: Record<string, unknown>[];
  visibility: Record<string, string>; // hexKey → FogState
  combatLogs: Record<string, unknown>[];
  techProgress: Record<string, unknown>[];
  letters: Record<string, unknown>[];
  diplomacyRelations: Record<string, unknown>[];
  tradeAgreements: Record<string, unknown>[];
  notifications: GameNotification[];
  eventLog: Record<string, unknown>[];
  unitTemplates: Record<string, unknown>[];
  weaponDesigns: Record<string, unknown>[];
  equipmentOrders: Record<string, unknown>[];
}

export interface GameSlice extends GameState {
  setGameState: (state: Partial<GameState>) => void;
  clearGameState: () => void;
  addNotification: (notification: GameNotification) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
}

const initialState: GameState = {
  game: null,
  player: null,
  players: [],
  hexes: [],
  settlements: [],
  armies: [],
  visibility: {},
  combatLogs: [],
  techProgress: [],
  letters: [],
  diplomacyRelations: [],
  tradeAgreements: [],
  notifications: [],
  eventLog: [],
  unitTemplates: [],
  weaponDesigns: [],
  equipmentOrders: [],
};

export const createGameSlice: StateCreator<GameSlice> = (set) => ({
  ...initialState,
  setGameState: (state) => set(state),
  clearGameState: () => set(initialState),
  addNotification: (notification) => set((s) => ({
    notifications: [notification, ...s.notifications],
  })),
  markNotificationRead: (id) => set((s) => ({
    notifications: s.notifications.map(n => n.id === id ? { ...n, isRead: true } : n),
  })),
  markAllNotificationsRead: () => set((s) => ({
    notifications: s.notifications.map(n => ({ ...n, isRead: true })),
  })),
});
