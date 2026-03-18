/**
 * A* pathfinding on the hex grid.
 * Accounts for terrain movement costs and river crossing penalties.
 */

import type { HexCoord, HexDirection, TerrainType } from '../types/map.js';
import { hexKey } from '../types/map.js';
import { hexNeighbors, hexDistance, hasRiverBetween } from './hex-utils.js';
import { TERRAIN, RIVER_CROSSING_COST } from '../constants/terrain.js';

export interface PathResult {
  path: HexCoord[];
  totalCost: number;
}

/**
 * Find the shortest path from start to goal on a hex grid.
 *
 * @param start - Starting hex
 * @param goal - Target hex
 * @param hexData - Map of hexKey → { terrain, passable }
 * @param riverEdges - Map of hexKey → river edge directions
 * @param hasBridge - Function to check if a bridge negates river penalty at a hex
 * @returns Path and total movement cost, or null if no path exists
 */
export function findPath(
  start: HexCoord,
  goal: HexCoord,
  hexData: Map<string, { terrain: TerrainType; passable: boolean }>,
  riverEdges: Map<string, HexDirection[]>,
  hasBridge?: (hex: HexCoord, direction: HexDirection) => boolean,
): PathResult | null {
  const startKey = hexKey(start);
  const goalKey = hexKey(goal);

  if (startKey === goalKey) return { path: [start], totalCost: 0 };

  // A* open set (priority queue via sorted array — fine for game-sized maps)
  const openSet = new Map<string, { coord: HexCoord; f: number; g: number }>();
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>();

  openSet.set(startKey, { coord: start, f: hexDistance(start, goal), g: 0 });
  gScore.set(startKey, 0);

  while (openSet.size > 0) {
    // Get node with lowest f score
    let currentKey = '';
    let currentNode: { coord: HexCoord; f: number; g: number } | null = null;
    for (const [key, node] of openSet) {
      if (!currentNode || node.f < currentNode.f) {
        currentKey = key;
        currentNode = node;
      }
    }

    if (!currentNode) break;

    if (currentKey === goalKey) {
      // Reconstruct path
      const path: HexCoord[] = [];
      let key: string | undefined = goalKey;
      while (key) {
        const [q, r] = key.split(',').map(Number);
        path.unshift({ q, r });
        key = cameFrom.get(key);
      }
      return { path, totalCost: gScore.get(goalKey)! };
    }

    openSet.delete(currentKey);
    const current = currentNode.coord;

    for (const neighbor of hexNeighbors(current)) {
      const neighborKey = hexKey(neighbor);
      const neighborData = hexData.get(neighborKey);

      if (!neighborData || !neighborData.passable) continue;

      // Movement cost = terrain cost
      let moveCost = TERRAIN[neighborData.terrain].movementCost;

      // River crossing penalty
      if (hasRiverBetween(current, neighbor, riverEdges)) {
        const dir = directionFromNeighbor(current, neighbor);
        const bridged = dir && hasBridge ? hasBridge(current, dir) : false;
        if (!bridged) {
          moveCost += RIVER_CROSSING_COST;
        }
      }

      const tentativeG = (gScore.get(currentKey) ?? Infinity) + moveCost;

      if (tentativeG < (gScore.get(neighborKey) ?? Infinity)) {
        cameFrom.set(neighborKey, currentKey);
        gScore.set(neighborKey, tentativeG);
        const f = tentativeG + hexDistance(neighbor, goal);
        openSet.set(neighborKey, { coord: neighbor, f, g: tentativeG });
      }
    }
  }

  return null; // No path found
}

function directionFromNeighbor(from: HexCoord, to: HexCoord): HexDirection | null {
  const dq = to.q - from.q;
  const dr = to.r - from.r;
  const map: Record<string, HexDirection> = {
    '1,-1': 'ne', '1,0': 'e', '0,1': 'se',
    '-1,1': 'sw', '-1,0': 'w', '0,-1': 'nw',
  };
  return map[`${dq},${dr}`] ?? null;
}

/**
 * Calculate the total movement cost along a given path.
 */
export function pathMovementCost(
  path: HexCoord[],
  hexData: Map<string, { terrain: TerrainType }>,
  riverEdges: Map<string, HexDirection[]>,
): number {
  let cost = 0;
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    const key = hexKey(curr);
    const data = hexData.get(key);
    if (!data) continue;

    cost += TERRAIN[data.terrain].movementCost;

    if (hasRiverBetween(prev, curr, riverEdges)) {
      cost += RIVER_CROSSING_COST;
    }
  }
  return cost;
}
