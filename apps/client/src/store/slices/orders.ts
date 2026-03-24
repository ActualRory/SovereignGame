import type { StateCreator } from 'zustand';
import type { HexCoord, WeaponType, ShieldType, ArmourType, MountType } from '@kingdoms/shared';

export interface TradeProposalOrder {
  recipientId: string;
  offeredResources: { resource: string; amount: number }[];
  requestedResources: { resource: string; amount: number }[];
  isStanding: boolean;
}

export interface CreateTemplateOrder {
  name: string;
  isIrregular: boolean;
  isMounted: boolean;
  companiesOrSquadrons: 1 | 2 | 3 | 4 | 5;
  primary: WeaponType | null;
  secondary: WeaponType | ShieldType | null;
  sidearm: WeaponType | null;
  armour: ArmourType | null;
  mount: MountType | null;
}

export interface UpdateTemplateOrder {
  templateId: string;
  changes: Partial<Omit<CreateTemplateOrder, 'name'> & { name: string }>;
}

export interface RecruitFromTemplateOrder {
  settlementId: string;
  armyId: string;
  templateId: string;
}

export interface PlaceEquipmentOrderOrder {
  settlementId: string;
  equipmentType: string;
  quantity: number;
}

export interface DraftOrder {
  settlementId: string;
  amount: number;
}

export interface DraftMountsOrder {
  settlementId: string;
  mountType: 'horse' | 'gryphon' | 'demigryph';
  amount: number;
}

export interface PendingOrders {
  taxRate: string;
  constructions: Array<{ settlementId: string; buildingType: string }>;
  settlementUpgrades: Array<{ settlementId: string }>;
  techResearch: string | null;
  recruitments: RecruitFromTemplateOrder[];
  movements: Array<{ armyId: string; path: HexCoord[] }>;
  nobleOrders: Array<Record<string, unknown>>;
  createArmies: Array<{ hexQ: number; hexR: number; name: string }>;
  newSettlements: Array<{ hexQ: number; hexR: number; name: string }>;
  tradeProposals: TradeProposalOrder[];
  tradeCancellations: string[];
  createTemplates: CreateTemplateOrder[];
  updateTemplates: UpdateTemplateOrder[];
  deleteTemplates: string[];
  draftRecruits: DraftOrder[];
  dismissRecruits: DraftOrder[];
  draftMounts: DraftMountsOrder[];
  dismissMounts: DraftMountsOrder[];
  placeEquipmentOrders: PlaceEquipmentOrderOrder[];
  cancelEquipmentOrders: string[];
  siegeAssaults: Array<{ armyId: string; targetHexQ: number; targetHexR: number }>;
  disbandUnits: Array<{ unitId: string; armyId: string }>;
  upgradeUnits: Array<{ unitId: string; armyId: string; settlementId: string }>;
  replenishments: Array<{ unitId: string; armyId: string; settlementId: string }>;
  claimHexes: Array<{ hexQ: number; hexR: number }>;
  farmlandConversions: Array<{ hexQ: number; hexR: number }>;
}

export interface OrdersSlice {
  pendingOrders: PendingOrders;
  setPendingOrders: (orders: Partial<PendingOrders>) => void;
  addMovement: (armyId: string, path: HexCoord[]) => void;
  removeMovement: (armyId: string) => void;
  addRecruitment: (order: RecruitFromTemplateOrder) => void;
  removeRecruitment: (index: number) => void;
  addSiegeAssault: (armyId: string, targetHexQ: number, targetHexR: number) => void;
  removeSiegeAssault: (armyId: string) => void;
  addClaimHex: (hexQ: number, hexR: number) => void;
  removeClaimHex: (hexQ: number, hexR: number) => void;
  addNewSettlement: (order: { hexQ: number; hexR: number; name: string }) => void;
  removeNewSettlement: (hexQ: number, hexR: number) => void;
  addFarmlandConversion: (hexQ: number, hexR: number) => void;
  removeFarmlandConversion: (hexQ: number, hexR: number) => void;
  resetOrders: (taxRate?: string) => void;
}

const defaultOrders = (taxRate = 'low'): PendingOrders => ({
  taxRate,
  constructions: [],
  settlementUpgrades: [],
  techResearch: null,
  recruitments: [],
  movements: [],
  nobleOrders: [],
  createArmies: [],
  newSettlements: [],
  tradeProposals: [],
  tradeCancellations: [],
  createTemplates: [],
  updateTemplates: [],
  deleteTemplates: [],
  draftRecruits: [],
  dismissRecruits: [],
  draftMounts: [],
  dismissMounts: [],
  placeEquipmentOrders: [],
  cancelEquipmentOrders: [],
  siegeAssaults: [],
  disbandUnits: [],
  upgradeUnits: [],
  replenishments: [],
  claimHexes: [],
  farmlandConversions: [],
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

  addRecruitment: (order) => set((s) => ({
    pendingOrders: {
      ...s.pendingOrders,
      recruitments: [...s.pendingOrders.recruitments, order],
    },
  })),

  removeRecruitment: (index) => set((s) => ({
    pendingOrders: {
      ...s.pendingOrders,
      recruitments: s.pendingOrders.recruitments.filter((_, i) => i !== index),
    },
  })),

  addSiegeAssault: (armyId, targetHexQ, targetHexR) => set((s) => ({
    pendingOrders: {
      ...s.pendingOrders,
      siegeAssaults: [
        ...s.pendingOrders.siegeAssaults.filter(sa => sa.armyId !== armyId),
        { armyId, targetHexQ, targetHexR },
      ],
    },
  })),

  removeSiegeAssault: (armyId) => set((s) => ({
    pendingOrders: {
      ...s.pendingOrders,
      siegeAssaults: s.pendingOrders.siegeAssaults.filter(sa => sa.armyId !== armyId),
    },
  })),

  addClaimHex: (hexQ, hexR) => set((s) => ({
    pendingOrders: {
      ...s.pendingOrders,
      claimHexes: [
        ...s.pendingOrders.claimHexes.filter(c => !(c.hexQ === hexQ && c.hexR === hexR)),
        { hexQ, hexR },
      ],
    },
  })),

  removeClaimHex: (hexQ, hexR) => set((s) => ({
    pendingOrders: {
      ...s.pendingOrders,
      claimHexes: s.pendingOrders.claimHexes.filter(c => !(c.hexQ === hexQ && c.hexR === hexR)),
    },
  })),

  addNewSettlement: (order) => set((s) => ({
    pendingOrders: {
      ...s.pendingOrders,
      newSettlements: [
        ...s.pendingOrders.newSettlements.filter(n => !(n.hexQ === order.hexQ && n.hexR === order.hexR)),
        order,
      ],
    },
  })),

  removeNewSettlement: (hexQ, hexR) => set((s) => ({
    pendingOrders: {
      ...s.pendingOrders,
      newSettlements: s.pendingOrders.newSettlements.filter(n => !(n.hexQ === hexQ && n.hexR === hexR)),
    },
  })),

  addFarmlandConversion: (hexQ, hexR) => set((s) => ({
    pendingOrders: {
      ...s.pendingOrders,
      farmlandConversions: [
        ...s.pendingOrders.farmlandConversions.filter(f => !(f.hexQ === hexQ && f.hexR === hexR)),
        { hexQ, hexR },
      ],
    },
  })),

  removeFarmlandConversion: (hexQ, hexR) => set((s) => ({
    pendingOrders: {
      ...s.pendingOrders,
      farmlandConversions: s.pendingOrders.farmlandConversions.filter(f => !(f.hexQ === hexQ && f.hexR === hexR)),
    },
  })),

  resetOrders: (taxRate) => set({ pendingOrders: defaultOrders(taxRate) }),
});
