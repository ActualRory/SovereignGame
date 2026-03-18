import type { BuildingType, BuildingCategory, CostTier } from '../types/building.js';
import type { SettlementTier } from '../types/settlement.js';
import type { TerrainType, ResourceType } from '../types/map.js';
import type { TechId } from '../types/tech.js';

export interface BuildingDef {
  category: BuildingCategory;
  costTier: CostTier;
  minSettlement: SettlementTier;
  materials: ResourceType[];
  terrain?: TerrainType[];     // required terrain (extraction buildings)
  techRequired?: TechId;
  usesSlot: boolean;           // watchtowers and bridges don't use a slot
  effect?: string;
  // Production (for extraction/processing)
  input?: Partial<Record<ResourceType, number>>;
  output?: Partial<Record<ResourceType, number>>;
}

export interface CostTierValues {
  goldCost: number;
  maintenance: number;
  buildTime: number; // in minor turns
}

export const COST_TIERS: Record<CostTier, CostTierValues> = {
  basic:       { goldCost: 500,    maintenance: 100,   buildTime: 1 },
  standard:    { goldCost: 1500,   maintenance: 300,   buildTime: 1 },
  advanced:    { goldCost: 3000,   maintenance: 600,   buildTime: 2 },
  major:       { goldCost: 6000,   maintenance: 1200,  buildTime: 8 }, // 1 Major Turn
  monumental:  { goldCost: 12000,  maintenance: 2500,  buildTime: 8 }, // 1 Major Turn+
};

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  // ── Resource Extraction ──
  farm: {
    category: 'extraction', costTier: 'basic', minSettlement: 'hamlet',
    materials: ['timber'], terrain: ['plains', 'forest'], usesSlot: true,
    input: {}, output: { food: 10 },
  },
  fishery: {
    category: 'extraction', costTier: 'basic', minSettlement: 'hamlet',
    materials: ['timber'], terrain: ['coast'], usesSlot: true,
    input: {}, output: { food: 8 },
  },
  sawmill: {
    category: 'extraction', costTier: 'basic', minSettlement: 'hamlet',
    materials: ['timber'], terrain: ['forest'], usesSlot: true,
    input: { wood: 1 }, output: { timber: 5 },
  },
  quarry: {
    category: 'extraction', costTier: 'basic', minSettlement: 'hamlet',
    materials: ['timber'], terrain: ['mountains', 'hills'], usesSlot: true,
    input: { stone: 1 }, output: { brick: 5 },
  },
  mine: {
    category: 'extraction', costTier: 'standard', minSettlement: 'hamlet',
    materials: ['timber'], terrain: ['mountains', 'hills'], usesSlot: true,
    input: {}, output: { iron: 3 }, // produces iron from iron_ore, or gold_ingots from gold_ore
  },
  stables: {
    category: 'extraction', costTier: 'standard', minSettlement: 'hamlet',
    materials: ['timber'], terrain: ['plains'], usesSlot: true,
    input: { wild_horses: 1 }, output: { horses: 2 },
  },
  griffin_lodge: {
    category: 'extraction', costTier: 'advanced', minSettlement: 'hamlet',
    materials: ['timber', 'stone'], terrain: ['mountains'], usesSlot: true,
    input: { gryphons: 1 }, output: { griffins: 1 },
  },

  // ── Processing ──
  blacksmith: {
    category: 'processing', costTier: 'standard', minSettlement: 'village',
    materials: ['stone', 'timber'], usesSlot: true,
    input: { iron: 1 }, output: { spears: 2 }, // also swords, halberds (configurable)
  },
  bowyer: {
    category: 'processing', costTier: 'basic', minSettlement: 'village',
    materials: ['timber'], usesSlot: true,
    input: { timber: 1 }, output: { bows: 2 }, // also crossbows
  },
  armourer: {
    category: 'processing', costTier: 'advanced', minSettlement: 'town',
    materials: ['stone', 'iron'], usesSlot: true,
    input: { steel: 2 }, output: { armour: 1 },
  },
  foundry: {
    category: 'processing', costTier: 'advanced', minSettlement: 'town',
    materials: ['stone', 'iron'], usesSlot: true,
    techRequired: 'foundry',
    input: { iron: 2 }, output: { steel: 1 },
  },
  gunsmith: {
    category: 'processing', costTier: 'advanced', minSettlement: 'city',
    materials: ['stone', 'steel'], usesSlot: true,
    techRequired: 'firearms',
    input: { iron: 1, gunpowder: 1 }, output: { rifles: 1 },
  },
  tailor: {
    category: 'processing', costTier: 'standard', minSettlement: 'town',
    materials: ['timber'], usesSlot: true,
    input: { wool: 1 }, output: { uniforms: 2 }, // or cotton
  },
  alchemist: {
    category: 'processing', costTier: 'advanced', minSettlement: 'town',
    materials: ['stone', 'timber'], usesSlot: true,
    techRequired: 'alchemy',
    input: { sulphur: 1 }, output: { gunpowder: 2 },
  },
  bank: {
    category: 'processing', costTier: 'advanced', minSettlement: 'town',
    materials: ['stone', 'brick'], usesSlot: true,
    techRequired: 'banking',
    input: { gold_ingots: 1 }, output: {}, // converts to gold currency
    effect: 'Converts Gold Ingots to Gold (gp)',
  },

  // ── Civic ──
  library: {
    category: 'civic', costTier: 'basic', minSettlement: 'village',
    materials: ['timber'], usesSlot: true,
    effect: 'Research points (low)',
  },
  academy: {
    category: 'civic', costTier: 'advanced', minSettlement: 'town',
    materials: ['stone', 'timber'], usesSlot: true,
    effect: 'Research points (medium)',
  },
  college: {
    category: 'civic', costTier: 'major', minSettlement: 'city',
    materials: ['stone', 'brick'], usesSlot: true,
    effect: 'Research points (high)',
  },
  university: {
    category: 'civic', costTier: 'major', minSettlement: 'metropolis',
    materials: ['stone', 'brick'], usesSlot: true,
    effect: 'Research points (highest)',
  },
  port: {
    category: 'civic', costTier: 'advanced', minSettlement: 'city',
    materials: ['timber', 'stone'], terrain: ['coast'], usesSlot: true,
    techRequired: 'navigation',
    effect: 'Sea trade + ship construction',
  },

  // ── Military ──
  barracks: {
    category: 'military', costTier: 'standard', minSettlement: 'village',
    materials: ['timber'], usesSlot: true,
    techRequired: 'military_organisation',
    effect: 'Doubles supply limit; troops stationed here',
  },
  drafting_centre: {
    category: 'military', costTier: 'standard', minSettlement: 'town',
    materials: ['timber'], usesSlot: true,
    techRequired: 'military_organisation',
    effect: 'Recruitment without General/Ruler present',
  },
  military_academy: {
    category: 'military', costTier: 'major', minSettlement: 'city',
    materials: ['stone', 'brick'], usesSlot: true,
    techRequired: 'military_academy',
    effect: 'Enables General/Admiral hiring',
  },
  staff_college: {
    category: 'military', costTier: 'major', minSettlement: 'metropolis',
    materials: ['stone', 'brick'], usesSlot: true,
    techRequired: 'staff_college',
    effect: 'Shifts General avg rating 2/5 → 3/5',
  },

  // ── Fortifications ──
  wooden_walls: {
    category: 'fortification', costTier: 'basic', minSettlement: 'hamlet',
    materials: ['timber'], usesSlot: true,
    effect: 'Basic defence bonus',
  },
  stone_walls: {
    category: 'fortification', costTier: 'advanced', minSettlement: 'town',
    materials: ['stone', 'brick'], usesSlot: true,
    techRequired: 'masonry',
    effect: 'Stronger defence bonus',
  },
  watchtower_wood: {
    category: 'fortification', costTier: 'basic', minSettlement: 'hamlet',
    materials: ['timber'], usesSlot: false,
    effect: 'Vision bonus, no building slot',
  },
  watchtower_stone: {
    category: 'fortification', costTier: 'standard', minSettlement: 'village',
    materials: ['stone'], usesSlot: false,
    techRequired: 'masonry',
    effect: 'Vision bonus, no building slot',
  },
  fort: {
    category: 'fortification', costTier: 'advanced', minSettlement: 'town',
    materials: ['timber', 'brick'], usesSlot: true,
    techRequired: 'masonry',
    effect: 'Standalone field fortification',
  },
  castle: {
    category: 'fortification', costTier: 'monumental', minSettlement: 'city',
    materials: ['stone', 'brick'], usesSlot: true,
    techRequired: 'advanced_fortifications',
    effect: 'Standalone major fortification',
  },
  bridge: {
    category: 'fortification', costTier: 'standard', minSettlement: 'hamlet',
    materials: ['timber'], usesSlot: false, // placed on river edge
    effect: 'Negates river crossing penalty',
  },
};

/** Research points generated per minor turn by civic buildings. */
export const RESEARCH_POINTS: Partial<Record<BuildingType, number>> = {
  library: 2,
  academy: 5,
  college: 10,
  university: 15,
};
