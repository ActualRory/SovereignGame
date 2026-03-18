import type { TechId, TechEra } from '../types/tech.js';

export interface TechDef {
  era: TechEra;
  name: string;
  prerequisites: TechId[];
  researchCost: number;
  unlocks: string;
}

/** Number of techs required to unlock the next era. */
export const ERA_THRESHOLDS: Record<TechEra, { required: number; total: number }> = {
  early:  { required: 3, total: 6 },
  middle: { required: 3, total: 7 },
  late:   { required: 0, total: 10 }, // no next era in V1
};

export const TECH_TREE: Record<TechId, TechDef> = {
  // ── Early Era (6) ──
  masonry: {
    era: 'early', name: 'Masonry', prerequisites: [], researchCost: 20,
    unlocks: 'Stone Walls, Stone Watchtower, Fort',
  },
  agriculture: {
    era: 'early', name: 'Agriculture', prerequisites: [], researchCost: 20,
    unlocks: 'Farm output bonus',
  },
  navigation: {
    era: 'early', name: 'Navigation', prerequisites: [], researchCost: 20,
    unlocks: 'Port',
  },
  siege_engineering: {
    era: 'early', name: 'Siege Engineering', prerequisites: [], researchCost: 25,
    unlocks: 'Siege Assaults (without this, only attrition sieges)',
  },
  military_organisation: {
    era: 'early', name: 'Military Organisation', prerequisites: [], researchCost: 20,
    unlocks: 'Barracks, Drafting Centre',
  },
  banking: {
    era: 'early', name: 'Banking', prerequisites: [], researchCost: 20,
    unlocks: 'Bank',
  },

  // ── Middle Era (7) ──
  foundry: {
    era: 'middle', name: 'Foundry', prerequisites: ['masonry'], researchCost: 40,
    unlocks: 'Foundry building → Steel',
  },
  alchemy: {
    era: 'middle', name: 'Alchemy', prerequisites: [], researchCost: 40,
    unlocks: 'Alchemist → Gunpowder',
  },
  advanced_fortifications: {
    era: 'middle', name: 'Advanced Fortifications', prerequisites: ['masonry'], researchCost: 45,
    unlocks: 'Castle',
  },
  military_academy: {
    era: 'middle', name: 'Military Academy', prerequisites: ['military_organisation'], researchCost: 40,
    unlocks: 'Military Academy building',
  },
  economics: {
    era: 'middle', name: 'Economics', prerequisites: ['banking'], researchCost: 35,
    unlocks: '+10% trade wealth',
  },
  cartography: {
    era: 'middle', name: 'Cartography', prerequisites: ['navigation'], researchCost: 35,
    unlocks: '+1 vision range',
  },
  deep_mining: {
    era: 'middle', name: 'Deep Mining', prerequisites: ['masonry'], researchCost: 40,
    unlocks: 'Convert a Hill hex to Stone or Iron production',
  },

  // ── Late Era (10) ──
  firearms: {
    era: 'late', name: 'Firearms', prerequisites: ['foundry', 'alchemy'], researchCost: 60,
    unlocks: 'Gunsmith → Rifles',
  },
  non_proliferation: {
    era: 'late', name: 'Non-Proliferation', prerequisites: ['firearms'], researchCost: 40,
    unlocks: 'Flags military goods transfers',
  },
  advanced_military_logistics: {
    era: 'late', name: 'Advanced Military Logistics', prerequisites: ['military_academy'], researchCost: 55,
    unlocks: 'Armies carry replenishment supplies',
  },
  maneuver_warfare: {
    era: 'late', name: 'Maneuver Warfare', prerequisites: ['military_academy'], researchCost: 50,
    unlocks: '+2 frontline width everywhere',
  },
  staff_college: {
    era: 'late', name: 'Staff College', prerequisites: ['military_academy'], researchCost: 55,
    unlocks: 'Staff College building',
  },
  modern_doctrine: {
    era: 'late', name: 'Modern Doctrine', prerequisites: ['maneuver_warfare'], researchCost: 60,
    unlocks: '+1 all combat rolls',
  },
  optics: {
    era: 'late', name: 'Optics', prerequisites: ['cartography'], researchCost: 45,
    unlocks: '+1 vision range all armies',
  },
  civil_administration: {
    era: 'late', name: 'Civil Administration', prerequisites: ['economics'], researchCost: 50,
    unlocks: 'Raises national research cap',
  },
  urban_planning: {
    era: 'late', name: 'Urban Planning', prerequisites: [], researchCost: 45,
    unlocks: 'Reduces settlement upgrade cost',
  },
  medicine: {
    era: 'late', name: 'Medicine', prerequisites: ['agriculture'], researchCost: 50,
    unlocks: 'Increases pop growth rate',
  },
};

/** Get all techs for a given era. */
export function getTechsForEra(era: TechEra): TechId[] {
  return (Object.entries(TECH_TREE) as [TechId, TechDef][])
    .filter(([, def]) => def.era === era)
    .map(([id]) => id);
}
