import type { StateCreator } from 'zustand';

export interface GameState {
  game: Record<string, unknown> | null;
  player: Record<string, unknown> | null;
  players: Record<string, unknown>[];
  hexes: Record<string, unknown>[];
  settlements: Record<string, unknown>[];
  armies: Record<string, unknown>[];
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
};

export const createGameSlice: StateCreator<GameSlice> = (set) => ({
  ...initialState,
  setGameState: (state) => set(state),
  clearGameState: () => set(initialState),
});
