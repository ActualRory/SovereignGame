import type { ShipType } from '../types/military.js';
import type { TechEra } from '../types/tech.js';

export interface ShipStats {
  era: TechEra;
  fire: number;
  shock: number;
  defence: number;
  morale: number;
  hull: number;
  ap: number;
  hitsOn: number;
  /** Full crew complement. crewCounts totals start here (all rookies). */
  crewMax: number;
  notes: string;
}

export const SHIPS: Record<ShipType, ShipStats> = {
  // ── Early Era ──
  sloop: {
    era: 'early',
    fire: 3, shock: 1, defence: 2, morale: 3,
    hull: 6, ap: 0, hitsOn: 13, crewMax: 50,
    notes: 'Fast scout',
  },
  brig: {
    era: 'early',
    fire: 5, shock: 1, defence: 3, morale: 4,
    hull: 8, ap: 0, hitsOn: 13, crewMax: 80,
    notes: 'Light warship',
  },

  // ── Middle Era ──
  frigate: {
    era: 'middle',
    fire: 8, shock: 2, defence: 5, morale: 6,
    hull: 12, ap: 1, hitsOn: 10, crewMax: 150,
    notes: 'Fast, versatile',
  },
  transport: {
    era: 'middle',
    fire: 1, shock: 0, defence: 2, morale: 3,
    hull: 10, ap: 0, hitsOn: 14, crewMax: 60,
    notes: 'Carries troops/supplies',
  },

  // ── Late Era ──
  third_rate: {
    era: 'late',
    fire: 10, shock: 3, defence: 6, morale: 7,
    hull: 16, ap: 2, hitsOn: 9, crewMax: 250,
    notes: 'Workhorse warship',
  },
  second_rate: {
    era: 'late',
    fire: 11, shock: 3, defence: 7, morale: 7,
    hull: 18, ap: 2, hitsOn: 8, crewMax: 320,
    notes: 'Heavy warship',
  },
  first_rate: {
    era: 'late',
    fire: 12, shock: 3, defence: 7, morale: 8,
    hull: 20, ap: 3, hitsOn: 7, crewMax: 400,
    notes: 'Flagship class',
  },
};

/** Ship state thresholds (hull percentage). */
export const SHIP_STATE_THRESHOLDS = {
  intact: 50,    // 100-50% = Intact
  damaged: 25,   // 50-25% = Damaged
  crippled: 0,   // 25-0% = Crippled (0% = Sunk)
};
