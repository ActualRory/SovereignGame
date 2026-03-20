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
  | 'hills'
  | 'mountains'
  | 'forest'
  | 'coast'
  | 'marsh'
  | 'desert';

export type ResourceType =
  // Food chain
  | 'grain' | 'cattle' | 'fruit' | 'fish'
  // Construction
  | 'stone' | 'wood'
  // Military chain (raw)
  | 'iron_ore' | 'gold_ore' | 'wild_horses' | 'gryphons'
  | 'sulphur'
  // Processed — produced by buildings, not found on map
  | 'food' | 'timber' | 'brick' | 'iron' | 'steel' | 'gold_ingots'
  | 'gunpowder' | 'leather'
  // Mounts (in settlement storage; drafted to mount pool separately)
  | 'horses' | 'griffins' | 'demigryphs'
  // Primary weapons (produced by Arms Workshop)
  | 'greataxe' | 'greatsword' | 'polearm' | 'longbow' | 'musket' | 'rifle'
  // Secondary weapons (produced by Arms Workshop)
  | 'shortsword' | 'longsword' | 'sabre' | 'handgun'
  // Armour (produced by Armour Workshop)
  | 'gambeson' | 'mail' | 'plate' | 'breastplate'
  // Textiles
  | 'wool' | 'cotton' | 'uniforms';

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
  settlementId: string | null;
  /**
   * The mount breed native to this hex, assigned at map generation.
   * Horses and gryphons drafted from this hex inherit this breed.
   */
  mountBreed: string | null;
}
