// ─── Player ───

export type FlagData =
  | { type: 'heraldry'; field: string; charge: string; tincture: string }
  | { type: 'image'; imageUrl: string };

export interface Player {
  id: string;
  gameId: string;
  displayName: string;
  countryName: string;
  rulerName: string;
  flag: FlagData;
  color: string;
  slotIndex: number;
  isEliminated: boolean;
  isSpectator: boolean;
  hasSubmitted: boolean;
}
