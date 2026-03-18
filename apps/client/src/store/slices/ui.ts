import type { StateCreator } from 'zustand';

export type TabId = 'country' | 'map' | 'economy' | 'trade' | 'tech' | 'military' | 'diplomacy';

export interface UiSlice {
  activeTab: TabId | null;
  selectedHex: { q: number; r: number } | null;
  selectedArmyId: string | null;
  setActiveTab: (tab: TabId | null) => void;
  setSelectedHex: (hex: { q: number; r: number } | null) => void;
  setSelectedArmyId: (id: string | null) => void;
}

export const createUiSlice: StateCreator<UiSlice> = (set) => ({
  activeTab: null,
  selectedHex: null,
  selectedArmyId: null,
  setActiveTab: (tab) => set((state) => ({
    activeTab: state.activeTab === tab ? null : tab,
  })),
  setSelectedHex: (hex) => set({ selectedHex: hex }),
  setSelectedArmyId: (id) => set({ selectedArmyId: id }),
});
