import { create } from 'zustand';
import { createUiSlice, type UiSlice } from './slices/ui.js';
import { createGameSlice, type GameSlice } from './slices/game.js';
import { createOrdersSlice, type OrdersSlice } from './slices/orders.js';

type Store = UiSlice & GameSlice & OrdersSlice;

export const useStore = create<Store>()((...a) => ({
  ...createUiSlice(...a),
  ...createGameSlice(...a),
  ...createOrdersSlice(...a),
}));
