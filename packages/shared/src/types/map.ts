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
  // Military chain
  | 'iron_ore' | 'gold_ore' | 'wild_horses' | 'gryphons'
  | 'sulphur'
  // Processed — these are produced by buildings, not found on map
  | 'food' | 'timber' | 'brick' | 'iron' | 'steel' | 'gold_ingots'
  // Equipment
  | 'spears' | 'swords' | 'halberds' | 'bows' | 'crossbows'
  | 'rifles' | 'armour' | 'uniforms' | 'gunpowder'
  | 'horses' | 'griffins'
  // Currency (tracked separately but typed here for completeness)
  | 'wool' | 'cotton';

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
}
