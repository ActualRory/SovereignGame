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
  | 'blacksmith' | 'bowyer' | 'armourer' | 'foundry' | 'gunsmith'
  | 'tailor' | 'alchemist' | 'bank'
  // Civic
  | 'library' | 'academy' | 'college' | 'university' | 'port'
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
