import type { StateCreator } from 'zustand';
import type { HexCoord } from '@kingdoms/shared';

export interface PendingOrders {
  taxRate: string;
  constructions: Array<{ settlementId: string; buildingType: string }>;
  settlementUpgrades: Array<{ settlementId: string }>;
  techResearch: string | null;
  recruitments: Array<{ settlementId: string; armyId: string; unitType: string }>;
  movements: Array<{ armyId: string; path: HexCoord[] }>;
  hireGenerals: Array<{ settlementId: string; name: string; isAdmiral: boolean }>;
  createArmies: Array<{ hexQ: number; hexR: number; name: string }>;
  newSettlements: Array<{ hexQ: number; hexR: number; name: string }>;
}

export interface OrdersSlice {
  pendingOrders: PendingOrders;
  setPendingOrders: (orders: Partial<PendingOrders>) => void;
  addMovement: (armyId: string, path: HexCoord[]) => void;
  removeMovement: (armyId: string) => void;
  addRecruitment: (settlementId: string, armyId: string, unitType: string) => void;
  removeRecruitment: (index: number) => void;
  resetOrders: (taxRate?: string) => void;
}

const defaultOrders = (taxRate = 'low'): PendingOrders => ({
  taxRate,
  constructions: [],
  settlementUpgrades: [],
  techResearch: null,
  recruitments: [],
  movements: [],
  hireGenerals: [],
  createArmies: [],
  newSettlements: [],
});

export const createOrdersSlice: StateCreator<OrdersSlice> = (set) => ({
  pendingOrders: defaultOrders(),

  setPendingOrders: (orders) => set((s) => ({
    pendingOrders: { ...s.pendingOrders, ...orders },
  })),

  addMovement: (armyId, path) => set((s) => ({
    pendingOrders: {
      ...s.pendingOrders,
      movements: [
        ...s.pendingOrders.movements.filter(m => m.armyId !== armyId),
        { armyId, path },
      ],
    },
  })),

  removeMovement: (armyId) => set((s) => ({
    pendingOrders: {
      ...s.pendingOrders,
      movements: s.pendingOrders.movements.filter(m => m.armyId !== armyId),
    },
  })),

  addRecruitment: (settlementId, armyId, unitType) => set((s) => ({
    pendingOrders: {
      ...s.pendingOrders,
      recruitments: [...s.pendingOrders.recruitments, { settlementId, armyId, unitType }],
    },
  })),

  removeRecruitment: (index) => set((s) => ({
    pendingOrders: {
      ...s.pendingOrders,
      recruitments: s.pendingOrders.recruitments.filter((_, i) => i !== index),
    },
  })),

  resetOrders: (taxRate) => set({ pendingOrders: defaultOrders(taxRate) }),
});
