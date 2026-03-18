import { create } from 'zustand';
import { createUiSlice, type UiSlice } from './slices/ui.js';
import { createGameSlice, type GameSlice } from './slices/game.js';

type Store = UiSlice & GameSlice;

export const useStore = create<Store>()((...a) => ({
  ...createUiSlice(...a),
  ...createGameSlice(...a),
}));
