// ─── Hex Map ───

/** Axial hex coordinates (q = column, r = row). */
export interface HexCoord {
  q: number;
  r: number;
}

/** Canonical string key for a hex, e.g. "3,-2" */
export function hexKey(coord: HexCoord): string {
  return `${coord.q},${coord.r}`;
}

export function parseHexKey(key: string): HexCoord {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

export type TerrainType =
  | 'plains'
  | 'farmland'
  | 'hills'
  | 'mountains'
  | 'forest'
  | 'coast'
  | 'marsh'
  | 'desert';

export type ResourceType =
  // ── Territorial resources (hex properties; never stockpiled) ──
  // Food terrain
  | 'grain' | 'cattle' | 'fruit' | 'fish'
  // Raw construction
  | 'stone' | 'wood'
  // Military / industrial (raw)
  | 'iron_ore' | 'gold_ore' | 'sulphur'
  // Mount sources
  | 'wild_horses' | 'gryphons'
  // Textiles
  | 'wool' | 'cotton'

  // ── Physical resources (stored in settlements) ──
  // Construction materials (produced by sawmill / quarry)
  | 'timber' | 'brick'
  // Food (produced by farm / fishery, consumed by population)
  | 'food'
  // Uniforms (produced by tailor — late-era unit equipment)
  | 'uniforms'

  // ── Mounts (held in settlement draft pool) ──
  | 'horses' | 'griffins' | 'demigryphs'

  // ── Equipment (produced by workshops, stored until equipped) ──
  // Weapons (Arms Workshop)
  | 'dagger' | 'shortsword' | 'sabre' | 'handgun'        // 1H
  | 'longsword' | 'spear'                                 // Versatile
  | 'great_weapon' | 'polearm' | 'longbow' | 'musket' | 'rifle'  // 2H
  // Shields (Arms Workshop)
  | 'buckler' | 'round_shield' | 'kite_shield' | 'tower_shield'
  // Armour (Armour Workshop)
  | 'gambeson' | 'mail' | 'plate' | 'breastplate';

/**
 * River edges are identified by the direction from this hex to the neighbor.
 * Six possible directions in a flat-top hex grid.
 */
export type HexDirection = 'ne' | 'e' | 'se' | 'sw' | 'w' | 'nw';

export type FogState = 'undiscovered' | 'soft_fog' | 'full_vision';

/** Static hex definition from the map template. */
export interface MapHex {
  q: number;
  r: number;
  terrain: TerrainType;
  resources: ResourceType[];
  riverEdges: HexDirection[];
}

/** Player starting position on a map. */
export interface PlayerStart {
  slotIndex: number;
  q: number;
  r: number;
  claimedHexes: HexCoord[];
}

/** Static map definition — shared across games. */
export interface GameMap {
  id: string;
  name: string;
  hexes: MapHex[];
  playerStarts: PlayerStart[];
}

/** Per-game mutable hex state. */
export interface GameHex {
  q: number;
  r: number;
  terrain: TerrainType;
  resources: ResourceType[];
  riverEdges: HexDirection[];
  ownerId: string | null;
  claimStartedTurn: number | null;
  /** The player who initiated the claim (may differ from ownerId during conquest). */
  claimingPlayerId: string | null;
  settlementId: string | null;
  /** Turn when terrain conversion started (e.g. plains → farmland). */
  conversionStartedTurn: number | null;
  /** Type of conversion in progress (e.g. 'farmland'). */
  conversionType: string | null;
  /**
   * The mount breed native to this hex, assigned at map generation.
   * Horses and gryphons drafted from this hex inherit this breed.
   */
  mountBreed: string | null;
}
