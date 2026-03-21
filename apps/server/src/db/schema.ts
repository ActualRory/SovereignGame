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
export const unitPositionEnum = pgEnum('unit_position', ['frontline', 'backline', 'flank']);
export const relationTypeEnum = pgEnum('relation_type', [
  'neutral', 'nap', 'alliance', 'military_union', 'war', 'vassal',
]);
export const tradeTierEnum = pgEnum('trade_tier', ['open_trade', 'trade_route', 'economic_union']);
export const weaponDesignStatusEnum = pgEnum('weapon_design_status', ['developing', 'ready', 'retired']);
export const equipmentOrderStatusEnum = pgEnum('equipment_order_status', ['active', 'fulfilled', 'cancelled']);
export const equipmentOrderPriorityEnum = pgEnum('equipment_order_priority', ['relaxed', 'standard', 'rush']);
export const officerRankEnum = pgEnum('officer_rank', ['major', 'colonel', 'general']);

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
  countryName: text('country_name').notNull().default('New Realm'),
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
  customName: text('custom_name'),
  /** Horse or gryphon breed native to this hex; inherited by drafted mounts. */
  mountBreed: text('mount_breed'),
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
  /** Manpower drafted from population and held ready for unit creation. */
  draftedRecruits: integer('drafted_recruits').notNull().default(0),
  /** Horses moved from storage to the mount pool (cost maintenance per turn). */
  draftedHorses: integer('drafted_horses').notNull().default(0),
  /** Gryphons in the mount pool. */
  draftedGryphons: integer('drafted_gryphons').notNull().default(0),
  /** Demigryphs bred from horses + gryphons. */
  draftedDemigryphs: integer('drafted_demigryphs').notNull().default(0),
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
  subtitle: text('subtitle'),
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
  /** References unit_templates.id — defines the equipment and size of this unit. */
  templateId: uuid('template_id').notNull(),
  name: text('name'),
  subtitle: text('subtitle'),
  /** Individual troop counts: { rookie, capable, veteran } */
  troopCounts: jsonb('troop_counts').$type<{ rookie: number; capable: number; veteran: number }>().notNull().default({ rookie: 0, capable: 0, veteran: 0 }),
  state: unitStateEnum('state').notNull().default('full'),
  xp: integer('xp').notNull().default(0),
  position: unitPositionEnum('position').notNull().default('frontline'),
  isRecruiting: boolean('is_recruiting').notNull().default(false),
  /** True when the unit's template has been modified since the unit was raised. */
  isOutdated: boolean('is_outdated').notNull().default(false),
  /** Equipment held by the unit (transferred from storage on raise; returned on disband). */
  heldEquipment: jsonb('held_equipment').$type<{ primary: number; sidearm: number; armour: number; mounts: number }>().notNull().default({ primary: 0, sidearm: 0, armour: 0, mounts: 0 }),
  /** Breed of mounts in this unit (null for infantry). */
  mountBreed: text('mount_breed'),
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
  crewCounts: jsonb('crew_counts').notNull().$type<{ rookie: number; capable: number; veteran: number }>(),
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
  /** Officer rank. Major+ can lead a unit; Colonel+ can command an army. */
  rank: officerRankEnum('rank').notNull().default('major'),
  /** Unit this officer is currently assigned to. Null = in officer pool. */
  assignedUnitId: uuid('assigned_unit_id'),
});

export const unitTemplates = pgTable('unit_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id').notNull().references(() => games.id),
  playerId: uuid('player_id').notNull().references(() => players.id),
  name: text('name').notNull(),
  isIrregular: boolean('is_irregular').notNull().default(false),
  isMounted: boolean('is_mounted').notNull().default(false),
  companiesOrSquadrons: integer('companies_or_squadrons').notNull().default(3),
  primary: text('primary_weapon'),
  secondary: text('secondary_weapon'),
  sidearm: text('sidearm_weapon'),
  armour: text('armour_type'),
  mount: text('mount_type'),
  primaryDesignId: uuid('primary_design_id'),
  secondaryDesignId: uuid('secondary_design_id'),
  sidearmDesignId: uuid('sidearm_design_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('unit_templates_player_idx').on(table.gameId, table.playerId),
]);

export const weaponDesigns = pgTable('weapon_designs', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id').notNull().references(() => games.id),
  playerId: uuid('player_id').notNull().references(() => players.id),
  baseWeapon: text('base_weapon').notNull(),
  name: text('name').notNull(),
  statModifiers: jsonb('stat_modifiers').$type<Record<string, number>>().notNull().default({}),
  costModifier: integer('cost_modifier').notNull().default(0), // stored as ×100 integer, e.g. -30 = -0.30
  status: weaponDesignStatusEnum('status').notNull().default('developing'),
  turnsRemaining: integer('turns_remaining').notNull().default(2),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('weapon_designs_player_idx').on(table.gameId, table.playerId),
]);

export const equipmentOrders = pgTable('equipment_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id').notNull().references(() => games.id),
  settlementId: uuid('settlement_id').notNull().references(() => settlements.id),
  playerId: uuid('player_id').notNull().references(() => players.id),
  equipmentType: text('equipment_type').notNull(),
  designId: uuid('design_id').references(() => weaponDesigns.id),
  quantityOrdered: integer('quantity_ordered').notNull(),
  quantityFulfilled: integer('quantity_fulfilled').notNull().default(0),
  status: equipmentOrderStatusEnum('status').notNull().default('active'),
  priority: equipmentOrderPriorityEnum('priority').notNull().default('standard'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('equipment_orders_settlement_idx').on(table.gameId, table.settlementId),
]);

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
  movementLog: jsonb('movement_log').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('turn_snapshot_idx').on(table.gameId, table.turnNumber),
]);
