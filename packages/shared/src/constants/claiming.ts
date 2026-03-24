/** Maximum hex distance from a settlement for claiming unclaimed hexes. */
export const CLAIM_RADIUS = 4;

/** Minor turns to claim an unclaimed hex. */
export const CLAIM_DURATION_UNCLAIMED = 2;

/** Minor turns to conquer an enemy-owned hex. */
export const CLAIM_DURATION_ENEMY = 4;

/** Base gold cost for claiming an unclaimed hex. */
export const CLAIM_BASE_COST = 100;

/** Additional gold cost per hex already owned. */
export const CLAIM_PER_HEX_COST = 50;

/** Calculate the gold cost to claim an unclaimed hex. */
export function claimCost(totalHexesOwned: number): number {
  return CLAIM_BASE_COST + CLAIM_PER_HEX_COST * totalHexesOwned;
}
