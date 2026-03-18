// ─── Game & Lobby ───

export type GameMode = 'anytime' | 'blitz' | 'standard';
export type GameStatus = 'lobby' | 'active' | 'finished';

/** Minor turn = half a season. 8 minor turns = 1 Major Turn = 1 in-game year. */
export type Season =
  | 'early_spring' | 'late_spring'
  | 'early_summer' | 'late_summer'
  | 'early_autumn' | 'late_autumn'
  | 'early_winter' | 'late_winter';

export type ActionTiming = 'instant' | 'minor_turn' | 'major_turn';

export interface GameSettings {
  mode: GameMode;
  earlySubmit: boolean;
  preExploredMap: boolean;
  neutralSettlements: boolean;
}

export interface Game {
  id: string;
  slug: string;
  name: string;
  hostPlayerId: string;
  settings: GameSettings;
  status: GameStatus;
  currentTurn: number;
  turnDeadline: string | null; // ISO timestamp
  mapId: string;
  createdAt: string;
}

/** Derive season from minor turn number (1-indexed). Turn 1 = Early Spring. */
export function getSeason(minorTurn: number): Season {
  const seasons: Season[] = [
    'early_spring', 'late_spring',
    'early_summer', 'late_summer',
    'early_autumn', 'late_autumn',
    'early_winter', 'late_winter',
  ];
  return seasons[(minorTurn - 1) % 8];
}

/** Get the display label for a turn, e.g. "Early Spring (Turn 1)" */
export function getTurnLabel(minorTurn: number): string {
  const season = getSeason(minorTurn);
  const label = season
    .split('_')
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(' ');
  return `${label} (Turn ${minorTurn})`;
}

/** Whether this minor turn is the last of a Major Turn (year boundary). */
export function isMajorTurnEnd(minorTurn: number): boolean {
  return minorTurn % 8 === 0;
}

/** Get the current in-game year number (1-indexed). */
export function getYear(minorTurn: number): number {
  return Math.ceil(minorTurn / 8);
}
