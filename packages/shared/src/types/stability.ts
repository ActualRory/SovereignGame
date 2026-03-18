// ─── Stability ───

export type StabilityBand = 'stable' | 'uneasy' | 'unstable' | 'crisis' | 'collapse';

export type StabilityEventType =
  | 'minor_unrest'
  | 'riots'
  | 'desertion'
  | 'mass_desertion'
  | 'rebellion'
  | 'noble_defection'
  | 'settlement_defection'
  | 'stability_bonus';

export interface StabilityState {
  value: number; // 0-100
  band: StabilityBand;
}

export function getStabilityBand(value: number): StabilityBand {
  if (value >= 75) return 'stable';
  if (value >= 50) return 'uneasy';
  if (value >= 25) return 'unstable';
  if (value >= 10) return 'crisis';
  return 'collapse';
}
