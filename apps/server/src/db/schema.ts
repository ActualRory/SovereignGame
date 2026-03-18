import {
  pgTable, pgEnum, uuid, text, integer, boolean,
  timestamp, jsonb, uniqueIndex, index,
} from 'drizzle-orm/pg-core';

// ─── Enums ───

export const gameModeEnum = pgEnum('game_mode', ['anytime', 'blitz', 'standard']);
export const gameStatusEnum = pgEnum('game_status', ['lobby', 'active', 'finished']);
export const fogStateEnum = pgEnum('fog_state', ['undiscovered', 'soft_fog', 'full_vision']);
export const settlementTierEnum = pgEnum('settlement_tier', [
  'hamlet', 'village', 'town', 'city', 'metropolis',
]);
export const unitStateEnum = pgEnum('unit_state', ['full', 'depleted', 'broken', 'destroyed']);
export const shipStateEnum = pgEnum('ship_state', ['intact', 'damaged', 'crippled', 'sunk']);
export const veterancyEnum = pgEnum('veterancy', ['fresh', 'regular', 'veteran', 'elite', 'legend']);
export const unitPositionEnum = pgEnum('unit_position', ['frontline', 'backline', 'flank']);
export const relationTypeEnum = pgEnum('relation_type', [
  'neutral', 'nap', 'alliance', 'military_union', 'war', 'vassal',
]);
export const tradeTierEnum = pgEnum('trade_tier', ['open_trade', 'trade_route', 'economic_union']);

// ─── Tables ───

export const games = pgTable('games', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  hostPlayerId: uuid('host_player_id'),
  mode: gameModeEnum('mode').notNull().default('standard'),
  earlySubmit: boolean('early_submit').notNull().default(true),
  preExplored: boolean('pre_explored').notNull().default(false),
  neutralSettlements: boolean('neutral_settlements').notNull().default(false),
  status: gameStatusEnum('status').notNull().default('lobby'),
  currentTurn: integer('current_turn').notNull().default(0),
  turnDeadline: timestamp('turn_deadline', { withTimezone: true }),
  mapId: uuid('map_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const players = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id').notNull().references(() => games.id),
  sessionToken: text('session_token').notNull().unique(),
  displayName: text('display_name').notNull(),
  countryName: text('country_name').notNull().default('New Kingdom'),
  rulerName: text('ruler_name').notNull().default('Ruler'),
  flagData: jsonb('flag_data').$type<Record<string, unknown>>().default({}),
  color: text('color').notNull().default('#888888'),
  slotIndex: integer('slot_index').notNull(),
  isEliminated: boolean('is_eliminated').notNull().default(false),
  isSpectator: boolean('is_spectator').notNull().default(false),
  hasSubmitted: boolean('has_submitted').notNull().default(false),
  gold: integer('gold').notNull().default(0),
  stability: integer('stability').notNull().default(100),
  taxRate: text('tax_rate').notNull().default('low'),
  currentResearch: text('current_research'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('players_game_idx').on(table.gameId),
]);

export const maps = pgTable('maps', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  hexData: jsonb('hex_data').$type<unknown[]>().notNull(),
  playerStarts: jsonb('player_starts').$type<unknown[]>().notNull(),
});

export const gameHexes = pgTable('game_hexes', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id').notNull().references(() => games.id),
  q: integer('q').notNull(),
  r: integer('r').notNull(),
  terrain: text('terrain').notNull(),
  resources: jsonb('resources').$type<string[]>().notNull().default([]),
  riverEdges: jsonb('river_edges').$type<string[]>().notNull().default([]),
  ownerId: uuid('owner_id'),
  claimStartedTurn: integer('claim_started_turn'),
  settlementId: uuid('settlement_id'),
}, (table) => [
  uniqueIndex('game_hex_coord_idx').on(table.gameId, table.q, table.r),
]);

export const hexVisibility = pgTable('hex_visibility', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id').notNull().references(() => games.id),
  playerId: uuid('player_id').notNull().references(() => players.id),
  q: integer('q').notNull(),
  r: integer('r').notNull(),
  state: fogStateEnum('state').notNull().default('undiscovered'),
}, (table) => [
  uniqueIndex('hex_vis_idx').on(table.gameId, table.playerId, table.q, table.r),
]);

export const settlements = pgTable('settlements', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id').notNull().references(() => games.id),
  hexQ: integer('hex_q').notNull(),
  hexR: integer('hex_r').notNull(),
  ownerId: uuid('owner_id').notNull().references(() => players.id),
  name: text('name').notNull(),
  tier: settlementTierEnum('tier').notNull().default('hamlet'),
  population: integer('population').notNull().default(0),
  popCap: integer('pop_cap').notNull().default(200),
  isCapital: boolean('is_capital').notNull().default(false),
  storage: jsonb('storage').$type<Record<string, number>>().notNull().default({}),
  constructionQueue: jsonb('construction_queue').$type<unknown[]>().notNull().default([]),
}, (table) => [
  index('settlements_game_idx').on(table.gameId),
]);

export const buildings = pgTable('buildings', {
  id: uuid('id').primaryKey().defaultRandom(),
  settlementId: uuid('settlement_id').notNull().references(() => settlements.id),
  type: text('type').notNull(),
  slotIndex: integer('slot_index').notNull(),
  isConstructing: boolean('is_constructing').notNull().default(false),
  turnsRemaining: integer('turns_remaining').notNull().default(0),
});

export const armies = pgTable('armies', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id').notNull().references(() => games.id),
  ownerId: uuid('owner_id').notNull().references(() => players.id),
  name: text('name').notNull(),
  hexQ: integer('hex_q').notNull(),
  hexR: integer('hex_r').notNull(),
  generalId: uuid('general_id'),
  supplyBank: integer('supply_bank').notNull().default(100),
  movementPath: jsonb('movement_path').$type<unknown[] | null>(),
  isNaval: boolean('is_naval').notNull().default(false),
}, (table) => [
  index('armies_game_idx').on(table.gameId),
]);

export const units = pgTable('units', {
  id: uuid('id').primaryKey().defaultRandom(),
  armyId: uuid('army_id').notNull().references(() => armies.id),
  type: text('type').notNull(),
  name: text('name'),
  subtitle: text('subtitle'),
  strengthPct: integer('strength_pct').notNull().default(100),
  state: unitStateEnum('state').notNull().default('full'),
  veterancy: veterancyEnum('veterancy').notNull().default('fresh'),
  xp: integer('xp').notNull().default(0),
  position: unitPositionEnum('position').notNull().default('frontline'),
  isRecruiting: boolean('is_recruiting').notNull().default(false),
});

export const ships = pgTable('ships', {
  id: uuid('id').primaryKey().defaultRandom(),
  fleetId: uuid('fleet_id').notNull().references(() => armies.id),
  type: text('type').notNull(),
  name: text('name'),
  subtitle: text('subtitle'),
  hullCurrent: integer('hull_current').notNull(),
  hullMax: integer('hull_max').notNull(),
  state: shipStateEnum('state').notNull().default('intact'),
  veterancy: veterancyEnum('veterancy').notNull().default('fresh'),
  xp: integer('xp').notNull().default(0),
});

export const generals = pgTable('generals', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id').notNull().references(() => games.id),
  ownerId: uuid('owner_id').notNull().references(() => players.id),
  name: text('name').notNull(),
  commandRating: integer('command_rating').notNull().default(2),
  xp: integer('xp').notNull().default(0),
  isAdmiral: boolean('is_admiral').notNull().default(false),
});

export const techProgress = pgTable('tech_progress', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id').notNull().references(() => games.id),
  playerId: uuid('player_id').notNull().references(() => players.id),
  tech: text('tech').notNull(),
  isResearched: boolean('is_researched').notNull().default(false),
  researchPoints: integer('research_points').notNull().default(0),
}, (table) => [
  uniqueIndex('tech_progress_idx').on(table.gameId, table.playerId, table.tech),
]);

export const diplomacyRelations = pgTable('diplomacy_relations', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id').notNull().references(() => games.id),
  playerAId: uuid('player_a_id').notNull().references(() => players.id),
  playerBId: uuid('player_b_id').notNull().references(() => players.id),
  relationType: relationTypeEnum('relation_type').notNull().default('neutral'),
  allianceName: text('alliance_name'),
  terms: jsonb('terms').$type<Record<string, unknown> | null>(),
  startedTurn: integer('started_turn').notNull().default(0),
});

export const letters = pgTable('letters', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id').notNull().references(() => games.id),
  senderId: uuid('sender_id').notNull().references(() => players.id),
  recipientId: uuid('recipient_id').notNull().references(() => players.id),
  bodyText: text('body_text').notNull().default(''),
  attachments: jsonb('attachments').$type<unknown[]>().notNull().default([]),
  sentTurn: integer('sent_turn').notNull(),
  deliveryTurn: integer('delivery_turn').notNull(),
  isDelivered: boolean('is_delivered').notNull().default(false),
  isRead: boolean('is_read').notNull().default(false),
});

export const tradeAgreements = pgTable('trade_agreements', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id').notNull().references(() => games.id),
  playerAId: uuid('player_a_id').notNull().references(() => players.id),
  playerBId: uuid('player_b_id').notNull().references(() => players.id),
  tier: tradeTierEnum('tier').notNull(),
  terms: jsonb('terms').$type<Record<string, unknown>>().notNull().default({}),
  isStanding: boolean('is_standing').notNull().default(false),
  startedTurn: integer('started_turn').notNull().default(0),
});

export const turnOrders = pgTable('turn_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id').notNull().references(() => games.id),
  playerId: uuid('player_id').notNull().references(() => players.id),
  turnNumber: integer('turn_number').notNull(),
  orders: jsonb('orders').$type<Record<string, unknown>>().notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('turn_orders_idx').on(table.gameId, table.playerId, table.turnNumber),
]);

export const turnSnapshots = pgTable('turn_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id').notNull().references(() => games.id),
  turnNumber: integer('turn_number').notNull(),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
  combatLogs: jsonb('combat_logs').$type<unknown[]>().notNull().default([]),
  eventLog: jsonb('event_log').$type<unknown[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('turn_snapshot_idx').on(table.gameId, table.turnNumber),
]);
