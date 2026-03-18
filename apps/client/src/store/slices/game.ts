import type { StateCreator } from 'zustand';

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
}

export interface GameSlice extends GameState {
  setGameState: (state: Partial<GameState>) => void;
  clearGameState: () => void;
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
};

export const createGameSlice: StateCreator<GameSlice> = (set) => ({
  ...initialState,
  setGameState: (state) => set(state),
  clearGameState: () => set(initialState),
});
