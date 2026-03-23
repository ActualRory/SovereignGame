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
  primaryDesignId: string | null;
  secondaryDesignId: string | null;
  sidearmDesignId: string | null;
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
  /** Optional weapon design variant. Display/tracking only. */
  designId?: string;
  /** Design name for display. */
  designName?: string;
}

export interface CreateWeaponDesignOrder {
  baseWeapon: WeaponType | ShieldType;
  name: string;
  statModifiers: Partial<{ fire: number; shock: number; defence: number; morale: number; ap: number; armour: number }>;
  goldCost?: number;
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
  createWeaponDesigns: CreateWeaponDesignOrder[];
  retireWeaponDesigns: string[];
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
  createWeaponDesigns: [],
  retireWeaponDesigns: [],
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

  resetOrders: (taxRate) => set({ pendingOrders: defaultOrders(taxRate) }),
});
