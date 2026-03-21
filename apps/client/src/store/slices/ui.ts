import type { StateCreator } from 'zustand';

export type TabId = 'country' | 'map' | 'economy' | 'trade' | 'tech' | 'military' | 'diplomacy';

export interface MapContextMenu {
  x: number;
  y: number;
  hex: { q: number; r: number };
}

export interface UiSlice {
  activeTab: TabId | null;
  selectedHex: { q: number; r: number } | null;
  selectedArmyId: string | null;
  mapContextMenu: MapContextMenu | null;
  /** When true, the next left-click on the map sets the movement destination for the selected army */
  isSelectingMoveTarget: boolean;
  /** Hex detail panel is open (separate from tab overlays) */
  detailPanelHex: { q: number; r: number } | null;
  /** When set, MapCanvas will pan to this hex then clear it */
  panToHex: { q: number; r: number } | null;
  /** True while the movement replay animation is playing */
  isAnimatingMovement: boolean;
  /** Set to true when a turn just resolved; cleared after animation plays or is skipped */
  turnJustResolved: boolean;
  setActiveTab: (tab: TabId | null) => void;
  setSelectedHex: (hex: { q: number; r: number } | null) => void;
  setSelectedArmyId: (id: string | null) => void;
  setMapContextMenu: (menu: MapContextMenu | null) => void;
  setIsSelectingMoveTarget: (v: boolean) => void;
  setDetailPanelHex: (hex: { q: number; r: number } | null) => void;
  setPanToHex: (hex: { q: number; r: number } | null) => void;
  setIsAnimatingMovement: (v: boolean) => void;
  setTurnJustResolved: (v: boolean) => void;
}

export const createUiSlice: StateCreator<UiSlice> = (set) => ({
  activeTab: null,
  selectedHex: null,
  selectedArmyId: null,
  mapContextMenu: null,
  isSelectingMoveTarget: false,
  detailPanelHex: null,
  panToHex: null,
  isAnimatingMovement: false,
  turnJustResolved: false,
  setActiveTab: (tab) => set((state) => ({
    activeTab: state.activeTab === tab ? null : tab,
  })),
  setSelectedHex: (hex) => set({ selectedHex: hex }),
  setSelectedArmyId: (id) => set({ selectedArmyId: id }),
  setMapContextMenu: (menu) => set({ mapContextMenu: menu }),
  setIsSelectingMoveTarget: (v) => set({ isSelectingMoveTarget: v }),
  setDetailPanelHex: (hex) => set({ detailPanelHex: hex }),
  setPanToHex: (hex) => set({ panToHex: hex }),
  setIsAnimatingMovement: (v) => set({ isAnimatingMovement: v }),
  setTurnJustResolved: (v) => set({ turnJustResolved: v }),
});
