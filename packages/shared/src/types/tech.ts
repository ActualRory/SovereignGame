// ─── Technology ───

export type TechEra = 'early' | 'middle' | 'late';

export type TechId =
  // Early (6)
  | 'masonry' | 'agriculture' | 'navigation'
  | 'siege_engineering' | 'military_organisation' | 'banking'
  // Middle (7)
  | 'foundry' | 'alchemy' | 'advanced_fortifications'
  | 'military_academy' | 'economics' | 'cartography' | 'deep_mining'
  // Late (10)
  | 'firearms' | 'non_proliferation' | 'advanced_military_logistics'
  | 'maneuver_warfare' | 'staff_college' | 'modern_doctrine'
  | 'optics' | 'civil_administration' | 'urban_planning' | 'medicine';

export interface TechProgress {
  tech: TechId;
  isResearched: boolean;
  researchPoints: number;
}

export interface PlayerTechState {
  researched: Set<TechId>;
  currentResearch: TechId | null;
  pointsPerTurn: number;
  progress: Map<TechId, number>;
}
