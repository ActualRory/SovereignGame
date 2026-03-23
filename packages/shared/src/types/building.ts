// ─── Buildings ───

export type BuildingCategory =
  | 'extraction'
  | 'processing'
  | 'civic'
  | 'military'
  | 'fortification';

export type CostTier = 'basic' | 'standard' | 'advanced' | 'major' | 'monumental';

export type BuildingType =
  // Extraction
  | 'farm' | 'fishery' | 'sawmill' | 'quarry' | 'mine' | 'stables' | 'griffin_lodge'
  // Processing
  | 'foundry' | 'alchemist' | 'bank' | 'tailor' | 'tannery'
  | 'arms_workshop' | 'armour_workshop'
  // Civic
  | 'library' | 'academy' | 'college' | 'university' | 'port' | 'estate'
  // Military
  | 'barracks' | 'drafting_centre' | 'military_academy' | 'staff_college'
  // Fortification
  | 'wooden_walls' | 'stone_walls'
  | 'watchtower_wood' | 'watchtower_stone'
  | 'fort' | 'castle' | 'bridge';

export interface Building {
  id: string;
  settlementId: string;
  type: BuildingType;
  slotIndex: number;
  isConstructing: boolean;
  turnsRemaining: number;
}
