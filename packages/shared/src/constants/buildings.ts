import type { BuildingType, BuildingCategory, CostTier } from '../types/building.js';
import type { SettlementTier } from '../types/settlement.js';
import type { TerrainType, ResourceType } from '../types/map.js';
import type { TechId } from '../types/tech.js';

export interface BuildingDef {
  category: BuildingCategory;
  costTier: CostTier;
  minSettlement: SettlementTier;
  /** Physical resources required to construct this building (consumed once on build). */
  materials: ResourceType[];
  terrain?: TerrainType[];     // required terrain (extraction buildings)
  techRequired?: TechId;
  usesSlot: boolean;           // watchtowers and bridges don't use a slot
  effect?: string;
  /**
   * Gold income generated per building per minor turn.
   * Only processing/extraction buildings that convert resources to wealth have this.
   * A raw terrain resource without the corresponding building generates no tax wealth.
   */
  taxWealth?: number;
  /**
   * The territorial resource this building processes.
   * Owning this resource + this building = full efficiency (1× goldCostPerItem for equipment).
   * Owning the resource without this building = 2× penalty.
   */
  processesResource?: ResourceType;
  // Food & construction output (physical resources still produced by buildings)
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
    output: { food: 10 },
    effect: 'Produces food from grain/cattle terrain',
  },
  fishery: {
    category: 'extraction', costTier: 'basic', minSettlement: 'hamlet',
    materials: ['timber'], terrain: ['coast'], usesSlot: true,
    output: { food: 8 },
    effect: 'Produces food from coastal fish terrain',
  },
  /**
   * Sawmill — converts the wood territorial resource to timber (physical stockpile).
   * Generates tax wealth each turn; a raw forest hex without a sawmill does not.
   * Without a sawmill, wood-requiring equipment costs 2× gold to produce.
   */
  sawmill: {
    category: 'extraction', costTier: 'basic', minSettlement: 'hamlet',
    materials: ['timber'], terrain: ['forest'], usesSlot: true,
    processesResource: 'wood',
    output: { timber: 5 },
    taxWealth: 5,
    effect: 'Processes wood → timber; generates tax wealth; halves production cost for wood-based equipment',
  },
  /**
   * Quarry — extracts stone to produce brick (physical building material).
   * Requires hills/mountains terrain.
   */
  quarry: {
    category: 'extraction', costTier: 'basic', minSettlement: 'hamlet',
    materials: ['timber'], terrain: ['mountains', 'hills'], usesSlot: true,
    processesResource: 'stone',
    output: { brick: 5 },
    taxWealth: 3,
    effect: 'Produces brick from stone terrain',
  },
  /**
   * Mine — processes iron_ore and gold_ore.
   * Provides full efficiency for iron-tier weapon/armour production.
   * Also generates modest tax wealth from mineral extraction.
   */
  mine: {
    category: 'extraction', costTier: 'standard', minSettlement: 'hamlet',
    materials: ['timber'], terrain: ['mountains', 'hills'], usesSlot: true,
    processesResource: 'iron_ore',
    taxWealth: 4,
    effect: 'Processes iron_ore → full efficiency for iron-tier equipment; gold_ore → bonus income',
  },
  stables: {
    category: 'extraction', costTier: 'standard', minSettlement: 'hamlet',
    materials: ['timber'], terrain: ['plains'], usesSlot: true,
    effect: 'Enables drafting of wild horses from hex mount pool',
  },
  griffin_lodge: {
    category: 'extraction', costTier: 'advanced', minSettlement: 'hamlet',
    materials: ['timber', 'brick'], terrain: ['mountains'], usesSlot: true,
    effect: 'Enables drafting of gryphons from hex mount pool',
  },

  // ── Processing ──
  /**
   * Foundry — unlocks steel-tier weapons and armour (plate, breastplate, longsword, sabre).
   * Also provides full efficiency for steel production from iron_ore.
   * Requires mine at same settlement for synergy.
   */
  foundry: {
    category: 'processing', costTier: 'advanced', minSettlement: 'town',
    materials: ['stone', 'brick'], usesSlot: true,
    techRequired: 'foundry',
    processesResource: 'iron_ore',
    taxWealth: 6,
    effect: 'Unlocks steel-tier equipment production; full efficiency for steel weapons & armour',
  },
  /**
   * Alchemist — processes sulphur for gunpowder-based weapons (musket, rifle, handgun).
   * Without an alchemist, sulphur-requiring equipment costs 2× gold to produce.
   */
  alchemist: {
    category: 'processing', costTier: 'advanced', minSettlement: 'town',
    materials: ['stone', 'timber'], usesSlot: true,
    techRequired: 'alchemy',
    processesResource: 'sulphur',
    taxWealth: 5,
    effect: 'Processes sulphur → full efficiency for gunpowder-based equipment',
  },
  /**
   * Bank — converts gold_ore territorial income to full wealth.
   * Without a bank, gold_ore hexes generate only 50% of their potential income bonus.
   */
  bank: {
    category: 'processing', costTier: 'advanced', minSettlement: 'town',
    materials: ['stone', 'brick'], usesSlot: true,
    techRequired: 'banking',
    processesResource: 'gold_ore',
    taxWealth: 15,
    effect: 'Unlocks full income from gold_ore hexes (50% without bank)',
  },
  /**
   * Tailor — processes wool/cotton into uniforms and provides full efficiency
   * for gambeson production (wool-based armour).
   */
  tailor: {
    category: 'processing', costTier: 'standard', minSettlement: 'town',
    materials: ['timber'], usesSlot: true,
    processesResource: 'wool',
    output: { uniforms: 2 },
    taxWealth: 3,
    effect: 'Processes wool → uniforms; full efficiency for gambeson production',
  },
  /**
   * Tannery — processes cattle into leather for mail armour production.
   * Without a tannery, cattle-based equipment costs 2× gold to produce.
   */
  tannery: {
    category: 'processing', costTier: 'basic', minSettlement: 'village',
    materials: ['timber'], usesSlot: true,
    processesResource: 'cattle',
    taxWealth: 2,
    effect: 'Processes cattle → full efficiency for leather-based equipment (currently: mail)',
  },
  /**
   * Arms Workshop — produces any unlocked weapon (primary or secondary).
   * Each building = +80 workshop points per turn toward the active equipment order.
   * Generates tax wealth whether an order is active or not.
   */
  arms_workshop: {
    category: 'processing', costTier: 'standard', minSettlement: 'village',
    materials: ['stone', 'timber'], usesSlot: true,
    taxWealth: 8,
    effect: 'Accepts weapon production orders (primaries & secondaries)',
  },
  /**
   * Armour Workshop — produces any unlocked armour type.
   * Same order-based model as Arms Workshop.
   */
  armour_workshop: {
    category: 'processing', costTier: 'advanced', minSettlement: 'town',
    materials: ['stone', 'brick'], usesSlot: true,
    taxWealth: 8,
    effect: 'Accepts armour production orders',
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

/**
 * Maps each territorial resource to the processing building that provides full production efficiency.
 * Owning the resource WITHOUT the corresponding building → 2× gold cost per equipment item.
 * Owning the resource WITH the building → 1× gold cost.
 *
 * Note: steel-tier weapons (plate, etc.) use `iron_ore` as their resource but require
 * the `foundry` building — handled separately because foundry also serves as a tech unlock.
 */
export const RESOURCE_EFFICIENCY_BUILDING: Partial<Record<ResourceType, BuildingType>> = {
  wood:     'sawmill',
  iron_ore: 'mine',
  sulphur:  'alchemist',
  wool:     'tailor',
  cattle:   'tannery',
  gold_ore: 'bank',
};

/** Penalty multiplier on goldCostPerItem when the required processing building is absent. */
export const RAW_RESOURCE_COST_MULTIPLIER = 2.0;
