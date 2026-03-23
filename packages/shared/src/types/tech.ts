// ─── Technology ───

export type TechEra = 'early' | 'middle' | 'late';

export type TechId =
  // Early (6)
  | 'masonry' | 'agriculture' | 'navigation'
  | 'siege_engineering' | 'military_organisation' | 'banking'
  // Middle (9)
  | 'foundry' | 'alchemy' | 'advanced_fortifications'
  | 'military_academy' | 'economics' | 'cartography' | 'deep_mining'
  | 'gryphon_taming' | 'weapon_design' | 'chain_of_command'
  // Late (12)
  | 'firearms' | 'non_proliferation' | 'advanced_military_logistics'
  | 'maneuver_warfare' | 'staff_college' | 'modern_doctrine'
  | 'optics' | 'civil_administration' | 'urban_planning' | 'medicine'
  | 'demigryph_breeding' | 'advanced_weapon_design';

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
