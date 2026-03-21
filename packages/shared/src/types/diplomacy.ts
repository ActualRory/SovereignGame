// ─── Diplomacy ───

export type RelationType =
  | 'neutral'
  | 'nap'
  | 'alliance'
  | 'military_union'
  | 'war'
  | 'vassal';

export type AttachmentType =
  // War & Peace
  | 'declaration_of_war' | 'peace_treaty' | 'white_peace' | 'unconditional_surrender'
  // Agreements
  | 'alliance_proposal' | 'nap_proposal'
  // Economic
  | 'open_trade' | 'close_trade' | 'trade_route_proposal'
  | 'economic_union' | 'tribute_demand' | 'offer_subsidy' | 'loan'
  // Territorial
  | 'land_cession' | 'vassal_offer'
  // Intelligence
  | 'share_maps' | 'share_intelligence';

// ─── Attachment Details ───

export interface TradeAttachmentDetails {
  offeredResources: ResourceTransfer[];
  requestedResources: ResourceTransfer[];
  isStanding: boolean;
}

export interface AllianceAttachmentDetails {
  tier: AllianceTier;
  name?: string;
  terms?: Partial<AllianceTerms>;
}

/** Map from attachment type → whether it requires recipient acceptance. */
export const UNILATERAL_ATTACHMENTS: readonly AttachmentType[] = [
  'declaration_of_war', 'close_trade',
] as const;

export const PROPOSAL_ATTACHMENTS: readonly AttachmentType[] = [
  'alliance_proposal', 'nap_proposal',
  'open_trade', 'trade_route_proposal', 'economic_union',
  'peace_treaty', 'white_peace',
  'tribute_demand', 'offer_subsidy', 'loan',
  'land_cession', 'vassal_offer',
  'share_maps', 'share_intelligence',
  'unconditional_surrender',
] as const;

export type LetterResponse = 'accepted' | 'rejected' | null;

export interface LetterAttachment {
  type: AttachmentType;
  details?: TradeAttachmentDetails | AllianceAttachmentDetails | Record<string, unknown>;
}

export interface Letter {
  id: string;
  gameId: string;
  senderId: string;
  recipientId: string;
  bodyText: string;
  attachments: LetterAttachment[];
  sentTurn: number;
  deliveryTurn: number;
  isDelivered: boolean;
  isRead: boolean;
  /** Response to proposal attachments: accepted, rejected, or null (pending/no proposals). */
  response: LetterResponse;
}

export type AllianceTier = 'nap' | 'alliance' | 'military_union';

export interface AllianceTerms {
  tier: AllianceTier;
  name: string;
  mutualDefence: boolean;
  openBorders: boolean;
  openTrade: boolean;
  shareMaps: boolean;
  jointWarGoals: boolean;
  // Military Union extras
  economicUnion: boolean;
  sharedResearch: boolean;
  unifiedCommand: boolean;
  // Duration
  permanent: boolean;
  durationTurns: number | null; // Major Turns
  autoRenew: boolean;
}

export interface DiplomacyRelation {
  id: string;
  gameId: string;
  playerAId: string;
  playerBId: string;
  relationType: RelationType;
  allianceName: string | null;
  terms: AllianceTerms | null;
  startedTurn: number;
}

// ─── Trade ───

export type TradeTier = 'open_trade' | 'trade_route' | 'economic_union';

export interface TradeAgreement {
  id: string;
  gameId: string;
  playerAId: string;
  playerBId: string;
  tier: TradeTier;
  terms: TradeTerms;
  isStanding: boolean;
  startedTurn: number;
}

export interface TradeTerms {
  offeredResources: ResourceTransfer[];
  requestedResources: ResourceTransfer[];
}

export interface ResourceTransfer {
  resource: string;
  amount: number;
}
